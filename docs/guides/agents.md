# Agents: seeing and writing

The library gives an AI agent two things: a view of the canvas it can read positions from, and a hand to answer in ink with: text, math, shapes and graphs. Both work in world units, so a position the agent reads off a view can go straight into a call that writes or draws.

Neither piece calls a model. The app's harness turns them into tools, sends the results to the model, and runs what it asks for.

Source: `packages/canvas-core/src/agent/view.ts`, `packages/canvas-core/src/handwriting/` and `packages/canvas-renderer/src/render/agentView.ts`.

## Seeing: renderAgentView

`renderAgentView(doc, rect, opts?)` in `@wander/canvas-renderer` renders a world rect for a model to look at. It returns a promise of an `AgentView`:

| Field | Meaning |
| --- | --- |
| `image` | An `SkImage` of the rect, 1024 pixels on its long edge by default (`opts.maxSize`). |
| `text` | What to send with the image: the rect, the scale, the grid, and the objects inside. |
| `rect` | The world rect the image covers. It can be larger than the one you passed (see below). |
| `scale` | Image pixels per world unit. |
| `width`, `height` | Image size in pixels. |
| `gridStep` | World distance between labeled grid lines. |

```ts
const view = await renderAgentView(engine.doc, { minX: 0, minY: 0, maxX: 800, maxY: 600 });
const png = view.image.encodeToBase64();
// Send png as an image and view.text as text in the same tool result.
```

The image is the paper, the ink, and a blue line on every `gridStep` paper line, labeled with its world coordinate: x along the top, y down the left. `gridStep` is the paper spacing doubled until there are about eight lines across, so every labeled line is also a line the user sees on their paper. On blank paper it is a round number instead (1, 2, 2.5 or 5 times a power of ten).

`text` reads like this:

```
View x 80 to 1080, y 160 to 760 (canvas units).
Image 1024x615 px, 1 px = 0.98 units. Blue lines every 128 units (4 squares of the paper grid, which is 32 units), labeled with their canvas coordinate. y grows downward.
Objects in view (id, kind, bbox as minX, minY, maxX, maxY):
s_mwjici52254c8i stroke pen #1e1e1e bbox(125, 189, 387, 387)
```

The object list holds at most 150 lines and counts the rest. Page objects show their label. Strokes that share a group (an agent's answer) take one line, such as `g_abc group of 72 strokes pen #1e1e1e bbox(...)`, with the bounds of the members in view.

Pass `opts.viewport` (usually `engine.viewport`, the world rect on screen, known once a `CanvasView` has laid out) to show the agent what the user is looking at: it is outlined in orange on the image and described in the text.

A rect narrower than 128 world units in either direction (`VIEW_MIN_SPAN`, or `opts.minSpan`) is widened around its centre first, so a tiny area is not blown up into a blurry image. Corners can be given in either order.

### The pieces underneath

`renderAgentView` is built from parts you can call on their own:

- `contentBounds(doc)` in core: the bounds of every object on a visible layer plus a 5% margin, or `null` for an empty document. Use it for an overview.
- `viewRect(rect, minSpan?)`, `gridStepFor(rect, spacing)` and `describeView(doc, frame)` in core: the rect, the grid step and the text. They have no Skia, so they run in Node tests.
- `renderRegion(doc, rect, opts)` in the renderer: any world rect to an image, without a `CanvasView`. It draws the paper, then the same scene picture the view draws, then whatever `opts.decorate` draws on top in world units. It waits for page images inside the rect to load first.
- `drawCoordinateGrid(canvas, rect, scale, step)` in the renderer: the labeled lines alone, for use in your own `decorate`.

## Writing: layoutHandwriting

`layoutHandwriting(text, opts)` in core lays text, with math in it, out as pen strokes that look handwritten. It returns a `Handwriting`:

| Field | Meaning |
| --- | --- |
| `strokes` | Stroke points in writing order, with pressure and time. |
| `bounds` | Bounds of the stroke centre lines. The drawn ink is wider by the pen width. |
| `end` | `{ x, baseline }`: where the pen stopped, to keep writing on the same line. |
| `nextLine` | `{ x, baseline }`: where a line written straight after this would start. |
| `below` | The y just under the last line: the `top` for whatever is written beneath it, plus a gap. |
| `lines` | Lines written, counting wrapped lines, `\n` and display math. |
| `missing` | Characters and LaTeX commands it could not write, each listed once. They are left as a gap. |
| `duration` | Milliseconds from `startTime` to the last point. |

The options:

| Option | Default | Meaning |
| --- | --- | --- |
| `x` | required | Left edge of the first letter. |
| `baseline` | this or `top` | The line the first line's letters sit on. y grows downward. |
| `top` | this or `baseline` | Top edge of the first line: the ink starts at about this y however tall the first line is. Use it to place a block by its top-left corner. |
| `style` | `NEAT_HAND` | A `Partial<HandStyle>`; missing fields come from `NEAT_HAND`. |
| `maxWidth` | no wrapping | Words and inline math that would pass `x + maxWidth` go to the next line. |
| `displayAlign` | `'center'` | Where display math sits: centred in `maxWidth`, or `'left'` at the block's left edge, as people write working by hand. |
| `lineHeight` | 2.7 x-heights | Smallest distance between baselines. Lines holding tall math get more. |
| `seed` | from the text and position | The same text, options and seed always give the same strokes. |
| `startTime` | 0 | Time of the first point. |

To put the result on the canvas, turn it into `Stroke` objects with `inkStrokes` and add them with a command, like any other edit (see [Commands and history](./commands.md)):

```ts
const writing = layoutHandwriting('The slope at $x = 3$ is $6$.', {
  x: 128,
  baseline: 400,
  maxWidth: 480,
});
const strokes = inkStrokes(writing); // pen style by default
engine.history.execute(new CreateObjects(engine.doc.activeLayer.id, strokes, 'Write'));
```

One `CreateObjects` per answer makes the whole answer one undo step. `inkStrokes(ink, style)` takes any `StrokeStyle` for another color, brush or width, and works on everything below that returns `Ink`.

### Math

Inside the text, `$...$` is inline math and `$$...$$` is display math on its own line, centred in `maxWidth`. `\$` writes a dollar sign. Math is a LaTeX subset aimed at calculus and physics:

| Kind | Commands |
| --- | --- |
| Structure | `\frac{a}{b}` (also `\dfrac`, `\tfrac`), `x^{2}`, `x_{i}`, `\sqrt{x}`, `\sqrt[n]{x}`, `{...}` groups |
| Big operators | `\int`, `\iint`, `\oint`, `\sum`, `\prod`, `\lim`, each with `_` and `^` limits |
| Functions | `\sin`, `\cos`, `\tan`, `\sec`, `\csc`, `\cot`, `\arcsin`, `\arccos`, `\arctan`, `\sinh`, `\cosh`, `\tanh`, `\ln`, `\log`, `\exp`, `\max`, `\min`, `\det`, `\deg`, `\operatorname{...}` |
| Greek | `\alpha` to `\omega` (not `\iota`, `\zeta`, `\xi`, `\upsilon`, `\omicron`) and `\Gamma`, `\Delta`, `\Theta`, `\Lambda`, `\Pi`, `\Sigma`, `\Phi`, `\Psi`, `\Omega` |
| Symbols | `\infty`, `\partial`, `\nabla`, `\pm`, `\times`, `\div`, `\cdot`, `\leq`, `\geq`, `\neq`, `\approx`, `\equiv`, `\propto`, `\to`, `\leftarrow`, `\Rightarrow`, `\rightleftharpoons`, `\leftrightarrow`, `\hbar`, `\degree`, `\circ`, `\prime`, `\ldots`, `\cdots` |
| Brackets | `( ) [ ] \{ \} |` as written, and `\left( ... \right)` (also `[`, `\{`, `|`, `.`) stretched to their contents |
| Accents | `\vec`, `\hat`, `\bar`, `\overline`, `\dot`, `\ddot` |
| Text and space | `\text{...}`, `\mathrm{...}`, `\,`, `\:`, `\;`, `\ `, `\!`, `\quad`, `\qquad` |
| Rows | `\\` ends a row and `&` marks where rows line up, with or without `\begin{aligned}` (also `align`, `gathered`, `split`) |

`\mathbf` and `\mathit` write their argument plainly. `-` in math is written as a minus sign. `MATH_COMMANDS` lists every command name. Anything else (matrices, `\overbrace` and so on) is reported in `missing` and left as a gap, so check `missing` when the text comes from a model.

Layout follows how people write math by hand rather than TeX's exact rules: fraction bars sit at the height of the minus sign, scripts are about two thirds size, integral limits sit at the top and bottom right of the sign, and sum, product and lim limits go above and below.

### Working that lines up

Inside math, `\\` ends a row and `&` marks the point every row lines up on. Cells alternate right-aligned and left-aligned, so `a &= b` puts each row's `=` in one column; a row with no `&` starts at the left edge. Rows are spaced by their contents, so fractions get the room they need. A row may end with `\note{a few words}`, an extension to LaTeX: the words are written as plain text just after that row, a little smaller.

```ts
layoutHandwriting('$$ x^2 - 4 &= 0 \\\\ x^2 &= 4 \\\\ x &= \\pm 2 $$', {
  x: 128,
  top: 400,
  maxWidth: 480,
  displayAlign: 'left',
});
```

### Putting ink on the canvas: writeInk

`writeInk(engine, ink, opts?)` adds any `Ink` to the document and makes it appear as writing. It returns `{ strokes, group, done, finish }`.

- All strokes are added at once in one `CreateObjects`, so the answer is one undo step and the document is complete from the start: saving, undo and the agent's next view all see the whole answer.
- Only the drawing is staged. Every stroke starts in `engine.overlay.state.concealed`, which the renderer leaves out, and is revealed when the pen would have finished it, in writing order: the times in the ink divided by `speed` (default 6; 0 shows everything at once), and squeezed further if needed so the whole reveal takes at most `maxDuration` (default 1500 ms). A long answer sweeps in instead of taking as long as it would to write. `done` resolves when all of it is visible, and `finish()` shows the rest immediately.
- The strokes share a `group` id (`Stroke.group`). The lasso selects the whole group when it catches part of it, and the object eraser removes it whole, so an answer moves and erases as one. The partial eraser still cuts single strokes. The group survives moves, splits and save and load.

Options: `style`, `layerId`, `group`, `label` (undo label, default "Write"), `speed` and `maxDuration`. `inkStrokes(ink, style, group?)` remains for adding strokes yourself.

### Drawing: layoutSketch

`layoutSketch(shapes, opts?)` draws `Shape`s in world units in the same hand, and returns an `Ink` (strokes, bounds, duration, missing). Options are `style`, `seed` and `startTime`, as above.

| Shape | Fields | Draws |
| --- | --- | --- |
| `line` | `from`, `to` | A straight line, bowed slightly. |
| `arrow` | `from`, `to`, `bend?`, `heads?` | An arrow. `bend` curves it: the middle moves sideways by `bend` times the length, to the left of the direction of travel. `heads: 'both'` adds a head at the start. |
| `curve` | `points` | A smooth curve through the points. |
| `circle` | `around`, `padding?` | An ellipse around a rect, going round a little more than once as people do. `padding` is in x-heights (default 0.4). |
| `box` | `around`, `padding?` | A rectangle around a rect. |
| `underline` | `under` | A line under a rect. |
| `cross` | `over` | An X over a rect, for marking something wrong. |
| `check` | `at` | A check mark filling a rect, for marking something right. |

The rects usually come from the view: an object's `bbox` in `describeView`'s text, or a `Handwriting`'s `bounds`.

```ts
const note = layoutHandwriting('should be $x = 4$', { x: 420, baseline: 160 });
const marks = layoutSketch([
  { type: 'circle', around: mistakeBounds },
  { type: 'arrow', from: { x: 410, y: 150 }, to: { x: mistakeBounds.maxX + 8, y: 128 }, bend: 0.2 },
]);
const red = { ...DEFAULT_PEN_STYLE, color: '#c0392b' };
engine.history.execute(
  new CreateObjects(engine.doc.activeLayer.id, [...inkStrokes(marks, red), ...inkStrokes(note, red)], 'Correct'),
);
```

### Graphs: layoutGraph

`layoutGraph(graph, opts?)` draws axes, ticks, labels and curves into a world rect, and returns an `Ink`.

| Field | Meaning |
| --- | --- |
| `rect` | World rect the plot fills. |
| `x`, `y` | Visible ranges in graph units, as `[min, max]`. |
| `series` | `{ points, straight? }[]`: points in graph units, in order. Sample curves densely; two points make a line. `straight` joins points with straight segments instead of a smooth curve. Parts outside the ranges are clipped, and a series that leaves the range and comes back is drawn in pieces. |
| `xLabel`, `yLabel` | Axis labels in the math subset, without `$` (default `x` and `y`; `''` for none). |
| `xStep`, `yStep` | Distance between numbered ticks in graph units (default about five per axis; `0` for none). |

Each axis goes through 0 when 0 is in range and along the bottom or left edge when it is not, with a head at its positive end. The library does not evaluate formulas: compute the points yourself, for example `y = x * x` for x from -2 to 2 in steps of 0.1.

```ts
const points: [number, number][] = [];
for (let x = -2; x <= 2.5; x += 0.1) points.push([x, x * x]);
const graph = layoutGraph({
  rect: { minX: 64, minY: 32, maxX: 448, maxY: 352 },
  x: [-2, 2.5],
  y: [-1, 5],
  series: [{ points }, { points: [[0, -1], [2.5, 4]], straight: true }],
  yLabel: 'y = x^2',
});
```

### What makes it look written

Layouts decide where things go; one pen draws everything, so text, math, shapes and graphs look like the same hand:

- Each character is one or more single-line pen strokes, in the order a person writes them. Control points are joined with smooth curves, and sharp turns stay sharp, so bowls are round and the points of A, N and triangles stay pointed.
- Every letter gets its own size, width, lean, rotation and baseline offset, and its curves wobble a little, so no two copies of a letter are the same. Each word also has its own size and sits a little above or below the line. In text, the baseline also drifts in slow waves and each line tilts slightly.
- Lines and curves bow and waver a little along their length; circles overshoot where they close.
- i dots and t and f bars come after the rest of the word, as most people write them.
- Pressure builds at the start of a stroke and tapers at the end. Dots and other short marks are pressed evenly so they stay visible.
- Time runs slower on tight curves than on straight runs, with a pause between strokes.

Because the points carry pressure that is not the flat 0.5 of a finger, the pen brush draws them like Apple Pencil input, and speed from the timestamps thins fast lines. The timestamps also drive the reveal in `writeInk`, which shows the answer in writing order. To draw several results one after another, pass each the previous one's `startTime + duration` as its `startTime`.

### Styles

`HandStyle` fields: `xHeight` (world units; capitals are about 1.6 times it), `slant` (degrees), `messiness` (0 tidy to 1 loose), `width` (letter width multiplier), `letterGap` and `wordGap` (in x-heights), `pressure` (0 to 1) and `speed` (world units per millisecond).

| Preset | x-height | Slant | Messiness | Use |
| --- | --- | --- | --- | --- |
| `NEAT_HAND` | 14 | 6 | 0.45 | Default. Tidy print that reads well on the 32-unit grid. |
| `CASUAL_HAND` | 14 | 9 | 0.8 | Everyday handwriting: uneven size and spacing, still easy to read. A good default for an agent writing beside someone's notes. |
| `LOOSE_HAND` | 14 | 12 | 0.9 | Quick writing: more lean and more variation. |
| `UPRIGHT_HAND` | 17 | 0 | 0.35 | Larger, upright and slower. |

Override single fields to match the user, for example `{ style: { xHeight: 12, slant: 10 } }` when their writing nearby is smaller and leans more. Shapes use `xHeight` too, to size arrow heads and padding and to scale how much lines waver.

### Continuing a line and placing text

`end` is the pen position after the last word. To keep writing on the same line, start the next call there and begin its text with a space for the word gap:

```ts
const first = layoutHandwriting('It is 6,', { x: 128, baseline: 400 });
const rest = layoutHandwriting(' since $\\frac{d}{dx}x^2 = 2x$.', { ...first.end, maxWidth: 480 });
```

`rest` wraps to `first.end.x`, not to the original left edge, because `maxWidth` and wrapping are measured from the `x` you pass. To wrap back to a margin, write the continuation as one call from the margin instead.

The x-height decides how much room a line needs: ascenders reach about 1.75 x-heights above the baseline and descenders about 0.7 below. At the default 14 that is about 25 units up and 10 down. Fractions, sums and integrals reach further; read `bounds` to see how much room a result took.

### Characters

`HANDWRITING_CHARACTERS` lists every character with a letter shape: a to z, A to Z, 0 to 9, the punctuation `. , ? ! ' - = + : ( ) [ ] { } | / * %`, the Greek letters and the math symbols above (`∞ ∂ ∇ ± × ÷ − ⋅ < > ≤ ≥ ≠ ≈ ≡ ∝ → ← ⇒ ° √ ∫ ∑ ∏ ħ`). They can be typed directly in text as well as written with commands in math. Spaces and `\n` are layout, not characters. Anything else is reported in `missing`.

### Limits

- It is one print hand for everyone. Size, slant, spacing and pressure can follow the user; the letter shapes cannot yet.
- Letters are not joined, so it does not write cursive.
- No matrices or chemical structures yet.
- Graphs take points, not formulas.
