// Wander — Zhich, Yu, Justin
// Expo module definition for Wander's native Pencil input. Exposes one
// native view, PencilInputView, with a single event, onInputSamples.

import ExpoModulesCore

/// Registers the PencilInputView component with Expo.
public class PencilInputModule: Module {
  /// Module name and the view it exports.
  public func definition() -> ModuleDefinition {
    Name("WanderPencilInput")

    View(PencilInputView.self) {
      Events("onInputSamples")
    }
  }
}
