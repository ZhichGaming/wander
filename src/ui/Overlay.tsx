import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CanvasEngine,
  DEFAULT_HIGHLIGHTER_STYLE,
  DEFAULT_PEN_STYLE,
  DEFAULT_PENCIL_STYLE,
  EraserTool,
  LassoTool,
  PenTool,
  deleteSelection,
  isPencilInputAvailable,
  pointerSessionFor,
  type DocumentJSON,
  type Tool,
} from '../canvas-engine';

const PALETTE = ['#1e1e1e', '#e53935', '#1e88e5', '#43a047', '#fdd835'];

interface OverlayProps {
  engine: CanvasEngine;
}

interface OverlayAction {
  label: string;
  run: () => void;
}

function PencilReadout({ engine }: OverlayProps) {
  const [text, setText] = useState('no Pencil input yet');

  useEffect(() => {
    let last = 0;
    return pointerSessionFor(engine).penSample.on((sample) => {
      const now = Date.now();
      if (now - last < 100) return;
      last = now;
      const pressure = sample.pressure === undefined ? 'none' : sample.pressure.toFixed(2);
      const lean =
        sample.tiltX === undefined || sample.tiltY === undefined
          ? 'none'
          : `${Math.round((Math.atan(Math.hypot(Math.tan(sample.tiltX), Math.tan(sample.tiltY))) * 180) / Math.PI)} deg`;
      setText(`pressure ${pressure}, lean ${lean}`);
    });
  }, [engine]);

  const path = isPencilInputAvailable
    ? 'native Pencil input'
    : 'Gesture Handler input (no pressure or tilt)';

  return (
    <Text style={styles.readout}>
      {path}
      {'\n'}
      {text}
    </Text>
  );
}

export default function Overlay({ engine }: OverlayProps) {
  const [toolName, setToolName] = useState(engine.tool.name);
  const [saved, setSaved] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const select = (label: string, tool: Tool) => {
    engine.setTool(tool);
    setToolName(label);

    if (tool instanceof PenTool) {
      setSelectedColor(tool.getStyle().color);
    } 
  };

  const actions: OverlayAction[] = [
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

  const [selectedColor, setSelectedColor] = useState(
    engine.tool instanceof PenTool
      ? engine.tool.getStyle().color
      : DEFAULT_PEN_STYLE.color,
    );
  
  const chooseColor = (color: string) => {
    if (!(engine.tool instanceof PenTool)) return;
    engine.tool.setStyle({ color });
    setSelectedColor(color);
  };

  return (
    <View
      style={[styles.toolbar, { top: insets.top + 8, left: insets.left + 12 }]}
      pointerEvents="box-none"
    >
      {actions.map((action) => (
        <Pressable
          key={action.label}
          onPress={action.run}
          style={[
            styles.button,
            action.label === toolName && styles.active,
          ]}
        >
          <Text style={styles.buttonText}>{action.label}</Text>
        </Pressable>
      ))}

      {engine.tool instanceof PenTool && (
        <View style={styles.palette}>
          {PALETTE.map((color) => (
            <Pressable
              key={color}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${color}`}
              onPress={() => chooseColor(color)}
              style={[
                styles.swatch,
                { backgroundColor: color },
                color === selectedColor && styles.selectedSwatch,
              ]}
            />
          ))}
        </View>
      )}
      <PencilReadout engine={engine} />
    </View>
  );
}

const styles = StyleSheet.create({
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
  active: {
    backgroundColor: '#dbe7ff',
    borderColor: '#5b8def',
  },
  buttonText: {
    color: '#333',
    fontSize: 13,
  },
  readout: {
    color: '#666',
    fontSize: 11,
    alignSelf: 'center',
    marginLeft: 6,
  },

  palette: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#999',
  },
  selectedSwatch: {
    borderWidth: 3,
    borderColor: '#2563eb',
  },
});