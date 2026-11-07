/**
 * Wander — Zhich, Yu, Justin
 * App entry point. Renders the canvas screen inside the gesture handler
 * root that the canvas gestures need and the safe-area provider that
 * reports status bar and notch insets.
 */

import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CanvasScreen from './src/screens/CanvasScreen';

/** Root component. */
export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <CanvasScreen />
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
