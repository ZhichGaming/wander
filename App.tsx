/**
 * Wander — Zhich, Yu, Justin
 * App entry point. Renders the canvas screen.
 */

import { StatusBar } from 'expo-status-bar';
import CanvasScreen from './src/screens/CanvasScreen';

/** Root component. */
export default function App() {
  return (
    <>
      <CanvasScreen />
      <StatusBar style="auto" />
    </>
  );
}
