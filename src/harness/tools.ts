import { CanvasEngine, contentBounds, inflateRect, isEmptyRect, renderAgentView, type Rect } from "../canvas-engine";
import { Argument, ArgumentType, Tool, ToolResult } from "./agent";

async function view(engine: CanvasEngine, rect: Rect): Promise<ToolResult> {
    const v = await renderAgentView(engine.doc, rect);
    return new ToolResult(v.text, [{ mediaType: "image/png", data: v.image.encodeToBase64() }]);
}

export function viewTools(engine: CanvasEngine): Tool[] {
    return [
        new Tool(
            "view_overview",
            "Shows the whole canvas at low detail with a labeled coordinate grid, and lists every object with its id and bounds. Start here, then zoom in with view_region.",
            [],
            async () => {
                const bounds = contentBounds(engine.doc);
                if (!bounds) return new ToolResult("The canvas is empty.");
                return view(engine, bounds);
            },
        ),
        new Tool(
            "view_region",
            "Shows one area of the canvas, given in canvas units, with a labeled coordinate grid, and lists the objects inside it. Read positions off the grid labels; use them directly in other tools.",
            [
                new Argument("min_x", "Left edge, in canvas units.", true, ArgumentType.NUMBER),
                new Argument("min_y", "Top edge, in canvas units.", true, ArgumentType.NUMBER),
                new Argument("max_x", "Right edge, in canvas units.", true, ArgumentType.NUMBER),
                new Argument("max_y", "Bottom edge, in canvas units.", true, ArgumentType.NUMBER),
            ],
            async (args: { min_x: number; min_y: number; max_x: number; max_y: number }) =>
                view(engine, { minX: args.min_x, minY: args.min_y, maxX: args.max_x, maxY: args.max_y }),
        ),
        new Tool(
            "view_selection",
            "Shows what the user selected with the lasso, with some space around it, a labeled coordinate grid and the selected area's objects.",
            [new Argument("padding", "Space around the selection, in canvas units (default 40).", false, ArgumentType.NUMBER)],
            async (args: { padding?: number }) => {
                const bounds = engine.selection.bounds(engine.doc);
                if (isEmptyRect(bounds)) return new ToolResult("Nothing is selected.");
                return view(engine, inflateRect(bounds, args.padding ?? 40));
            },
        ),
    ];
}

export function writeText(engine: CanvasEngine, text: string, x: number, y: number) {

}

export function deleteSelection(engine: CanvasEngine) {

}

export function undo(engine: CanvasEngine) {

}

export function redo(engine: CanvasEngine) {

}
