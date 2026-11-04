/**
 * Wander — Zhich, Yu, Justin
 * The single canvas screen: canvas area with the sidebar beside it.
 * Both regions are placeholders until their modules land.
 */

import { StyleSheet, Text, View } from 'react-native';

/** Full-screen layout: canvas on the left, retractable sidebar on the right. */
export default function CanvasScreen() {
  return (
    <View style={styles.root}>
      <View style={styles.canvas}>
        <Text style={styles.label}>Canvas (engine placeholder)</Text>
      </View>
      <View style={styles.sidebar}>
        <Text style={styles.label}>Sidebar (placeholder)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: '#fff' },
  canvas: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sidebar: {
    width: 320,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: '#888' },
});
