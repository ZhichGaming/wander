/**
 * Wander — Zhich, Yu, Justin
 * The canvas screen: the engine's CanvasView with the UI overlay and sidebar.
 */

import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CanvasEngine, CanvasView } from '../canvas-engine';
import Overlay from '../ui/Overlay';

/** Full-screen layout: canvas on the left, retractable sidebar on the right. */
export default function CanvasScreen() {
  const [engine] = useState(() => new CanvasEngine());

  return (
    <View style={styles.root}>
      <View style={styles.canvas}>
        <CanvasView engine={engine} />
        <Overlay engine={engine} />
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
  sidebar: {
    width: 320,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: '#888' },
});
