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
  type BrushKind,
  type DocumentJSON,
  type Tool,
} from '../canvas-engine';

const PALETTE = ['#1e1e1e', '#e53935', '#1e88e5', '#43a047', '#ffe14d'];

const Customization = ['color', 'width', 'opacity'] as const;

type CustomizationOption = (typeof Customization)[number];

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

  const [openCustomization, setOpenCustomization] =
   useState<CustomizationOption | null>(null);

  const select = (label: string, tool: Tool) => {
     if (tool instanceof PenTool) {
      const brush = tool.getStyle().brush;
      tool.setStyle({
        color: toolColors[brush],
        width: toolWidths[brush],
      }); 
    } 
    engine.setTool(tool);
    setToolName(label);
    setOpenCustomization(null);
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

  const [toolColors, setToolColors] = useState<Record<BrushKind, string>>({
    pen: DEFAULT_PEN_STYLE.color,
    pencil: DEFAULT_PENCIL_STYLE.color,
    highlighter: DEFAULT_HIGHLIGHTER_STYLE.color,
  });

  const chooseColor = (color: string) => {
    const activeTool = engine.tool;
    if (!(activeTool instanceof PenTool)) return;

    const brush = activeTool.getStyle().brush;
    activeTool.setStyle({ color });
    setToolColors((colors) => ({ ...colors, [brush]: color }));
  };

  const activeBrush =
    engine.tool instanceof PenTool ? engine.tool.getStyle().brush : null;
  
  const selectedColor = activeBrush ? toolColors[activeBrush] : null;

  const [toolWidths, setToolWidths] = useState<Record<BrushKind, number>>({
    pen: DEFAULT_PEN_STYLE.width,
    pencil: DEFAULT_PENCIL_STYLE.width,
    highlighter: DEFAULT_HIGHLIGHTER_STYLE.width,
  });

  const chooseWidth = (width: number) => {
    const activeTool = engine.tool;
    if (!(activeTool instanceof PenTool)) return; 
    const brush = activeTool.getStyle().brush;
    activeTool.setStyle({ width });
    setToolWidths((widths) => ( { ...widths, [brush]: width }));
  };

  return (
    <View
      style={[styles.toolbar, { top: insets.top + 8, left: insets.left + 12 }]}
      pointerEvents="box-none"
    >
      {actions.map((action) => {
        const hasPalette =
          action.label === 'pen' ||
          action.label === 'pencil' ||
          action.label === 'highlighter';

        return (
          <View
            key={action.label}
            style={hasPalette ? styles.brushGroup : undefined}
          >
            <Pressable
              onPress={action.run}
              style={[
                styles.button,
                action.label === toolName && styles.active,
              ]}
            >
              <Text style={styles.buttonText}>{action.label}</Text>
            </Pressable>

            {hasPalette && toolName === action.label && (
              <View style={styles.customizationPanel}>
                <View style={styles.customizationButtons}>
                  {Customization.map((option) => (
                    <View key={option} style={styles.customizationOption}>
                      <Pressable
                        onPress={() =>
                          setOpenCustomization((current) =>
                            current === option ? null : option
                          )
                        }
                        style={styles.button}
                      >
                        <Text style={styles.buttonText}>{option}</Text>
                      </Pressable>

                      {option === 'color' && openCustomization === 'color' && (
                        <View style={styles.palette}>
                          {/* Keep your existing PALETTE.map(...) swatch buttons here */}
                        </View>
                      )}
                    </View>
                  ))}
                </View>

                {openCustomization === 'color' && (
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

                {openCustomization === 'width' && (
                  <Text>Put width controls here</Text>
                )}

                {openCustomization === 'opacity' && (
                  <Text>Put opacity controls here</Text>
                )}
              </View>
            )}
                  </View>
        );
      })}

      <PencilReadout engine={engine} />
    </View>
  );
}


const styles = StyleSheet.create({
  toolbar: {
    backgroundColor: '#fff',
    position: 'absolute',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 6,
  },
  button: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f1f3f5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
    alignSelf: 'center',
    justifyContent: 'center',
    minHeight: 44,
    width: 100,
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
    maxWidth: 100,
    textAlign: 'center',
    color: '#666',
    fontSize: 11,
    alignSelf: 'center',
    marginLeft: 6,
    paddingBottom: 10,
  },

  brushGroup: {
    position: 'relative',
  },

  palette: {
    position: 'absolute',
    left: 0,
    top: '100%',
    marginLeft: 8,
    marginTop: 6,
    zIndex: 10,
    elevation: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
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
  traitwidth: {
    position: 'absolute',
    left: '100%',
    top: 0,
    marginLeft: 8,
    zIndex: 10,
    elevation: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ccc',
  },
  customizationOption: {
    position: 'relative',
  },
  customizationPanel: {
    position: 'absolute',
    left: '100%',
    top: 0,
    marginLeft: 8,
    zIndex: 10,
    elevation: 5,
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 8,
  },
  customizationButtons: {
    flexDirection: 'row',
    gap: 6,
  },
});