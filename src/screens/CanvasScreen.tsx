/**
 * Wander — Zhich, Yu, Justin
 * The single canvas screen: the engine's CanvasView with the sidebar
 * beside it. The small toolbar here is a temporary developer strip for
 * exercising the engine (tools, undo, save/load) until the real tool UI in
 * src/ui and the shell in src/shell replace it.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CanvasEngine,
  CanvasView,
  DEFAULT_HIGHLIGHTER_STYLE,
  DEFAULT_PEN_STYLE,
  DEFAULT_PENCIL_STYLE,
  EraserTool,
  LassoTool,
  PenTool,
  deleteSelection,
  type DocumentJSON,
  type Tool,
} from '../canvas-engine';

/** One button of the developer toolbar. */
interface DevAction {
  label: string;
  run: () => void;
}

/** Full-screen layout: canvas on the left, retractable sidebar on the right. */
export default function CanvasScreen() {
  const [engine] = useState(() => new CanvasEngine());
  const [toolName, setToolName] = useState(engine.tool.name);
  const [saved, setSaved] = useState<string | null>(null);
  // Keep the toolbar below the status bar, which otherwise takes its taps.
  const insets = useSafeAreaInsets();

  /** Activates `tool` and remembers its label for the toolbar. */
  const select = (label: string, tool: Tool) => {
    engine.setTool(tool);
    setToolName(label);
  };

  const actions: DevAction[] = [
    { label: 'pen', run: () => select('pen', new PenTool(DEFAULT_PEN_STYLE)) },
    { label: 'pencil', run: () => select('pencil', new PenTool(DEFAULT_PENCIL_STYLE)) },
    { label: 'highlighter', run: () => select('highlighter', new PenTool(DEFAULT_HIGHLIGHTER_STYLE)) },
    { label: 'eraser', run: () => select('eraser', new EraserTool({ mode: 'partial' })) },
    { label: 'object eraser', run: () => select('object eraser', new EraserTool({ mode: 'object' })) },
    { label: 'lasso', run: () => select('lasso', new LassoTool()) },
    { label: 'delete sel.', run: () => deleteSelection(engine) },
    { label: 'undo', run: () => engine.undo() },
    { label: 'redo', run: () => engine.redo() },
    { label: 'save', run: () => setSaved(JSON.stringify(engine.save())) },
    {
      label: 'load',
      run: () => saved && engine.load(JSON.parse(saved) as DocumentJSON),
    },
  ];

  return (
    <View style={styles.root}>
      <View style={styles.canvas}>
        <CanvasView engine={engine} />
        <View
          style={[styles.toolbar, { top: insets.top + 8, left: insets.left + 12 }]}
          pointerEvents="box-none"
        >
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.run}
              style={[styles.button, a.label === toolName && styles.active]}
            >
              <Text style={styles.buttonText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.sidebar}>
        <Text style={styles.label}>Sidebar (placeholder)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#fff' },
  canvas: { flex: 1 },
  toolbar: {
    position: 'absolute',
    right: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  button: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f1f3f5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
  },
  active: { backgroundColor: '#dbe7ff', borderColor: '#5b8def' },
  buttonText: { color: '#333', fontSize: 13 },
  sidebar: {
    width: 320,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: '#888' },
});
