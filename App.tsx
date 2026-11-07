/**
 * Wander — Zhich, Yu, Justin
 * App entry point. Renders the canvas screen inside the gesture handler
 * root that the canvas gestures need.
 */

import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import CanvasScreen from './src/screens/CanvasScreen';

/** Root component. */
export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <CanvasScreen />
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
