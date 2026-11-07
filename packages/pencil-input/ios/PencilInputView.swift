// Wander — Zhich, Yu, Justin
// Native touch surface for the canvas on iOS and iPadOS. A transparent
// UIView laid over the Skia canvas that receives every touch (Apple Pencil,
// finger, and iPad trackpad or mouse) and reports it to JavaScript with
// what Gesture Handler cannot provide: Pencil pressure, tilt, the
// high-rate coalesced samples between frames (up to 240 Hz on Pencil), and
// UIKit's predicted samples. Event payloads match the RawPointerEvent shape
// of @wander/canvas-core's PointerSession, so JavaScript forwards them as is.

import ExpoModulesCore
import UIKit

/// Transparent multi-touch view that streams raw pointer events to JS.
class PencilInputView: ExpoView {
  /// Fires once per UIKit touch callback with { events: [RawPointerEvent] }.
  let onInputSamples = EventDispatcher()

  /// Small stable ids for live touches (UITouch objects persist for a contact).
  private var touchIds: [ObjectIdentifier: Int] = [:]
  private var nextTouchId = 1

  /// Sets up a transparent view that accepts several simultaneous touches.
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    isMultipleTouchEnabled = true
    isExclusiveTouch = false
  }

  /// A contact went down.
  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    send(touches, event: event, phase: "down")
  }

  /// Contacts moved; carries coalesced and predicted samples.
  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
    send(touches, event: event, phase: "move")
  }

  /// Contacts lifted.
  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
    send(touches, event: event, phase: "up")
    forget(touches)
  }

  /// The system cancelled the contacts (palm rejection, alerts, gestures).
  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
    send(touches, event: event, phase: "cancel")
    forget(touches)
  }

  /// Builds one RawPointerEvent per changed touch and dispatches them together.
  private func send(_ touches: Set<UITouch>, event: UIEvent?, phase: String) {
    var events: [[String: Any]] = []
    for touch in touches {
      guard let kind = PencilInputView.kind(of: touch) else { continue }
      var payload = sample(touch)
      payload["pointerId"] = id(for: touch)
      payload["kind"] = kind
      payload["phase"] = phase
      if phase == "move" || phase == "up", let event = event {
        let coalesced = event.coalescedTouches(for: touch) ?? []
        if coalesced.count > 1 {
          payload["coalesced"] = coalesced.map { sample($0) }
        }
      }
      if phase == "move", let event = event {
        let predicted = event.predictedTouches(for: touch) ?? []
        if !predicted.isEmpty {
          payload["predicted"] = predicted.map { sample($0) }
        }
      }
      events.append(payload)
    }
    if !events.isEmpty {
      onInputSamples(["events": events])
    }
  }

  /// Position (view points), time (ms), and for the Pencil pressure and tilt.
  private func sample(_ touch: UITouch) -> [String: Any] {
    let location = touch.type == .pencil ? touch.preciseLocation(in: self) : touch.location(in: self)
    var s: [String: Any] = [
      "x": Double(location.x),
      "y": Double(location.y),
      "time": touch.timestamp * 1000.0,
    ]
    if touch.type == .pencil {
      if touch.maximumPossibleForce > 0 {
        s["pressure"] = min(1.0, max(0.0, Double(touch.force / touch.maximumPossibleForce)))
      }
      let tilt = PencilInputView.tilt(
        altitude: Double(touch.altitudeAngle),
        azimuth: Double(touch.azimuthAngle(in: self))
      )
      s["tiltX"] = tilt.x
      s["tiltY"] = tilt.y
    }
    return s
  }

  /// Converts UIKit's altitude and azimuth into W3C-style tiltX / tiltY in
  /// radians: the pen's lean towards +x and +y. Upright gives (0, 0).
  static func tilt(altitude: Double, azimuth: Double) -> (x: Double, y: Double) {
    let t = tan(altitude)
    if t <= 1e-6 {
      // Flat on the glass: lean fully along the azimuth.
      return (x: cos(azimuth) >= 0 ? .pi / 2 : -.pi / 2, y: sin(azimuth) >= 0 ? .pi / 2 : -.pi / 2)
    }
    return (x: atan(cos(azimuth) / t), y: atan(sin(azimuth) / t))
  }

  /// Engine pointer kind for a touch type; nil for types the canvas ignores.
  static func kind(of touch: UITouch) -> String? {
    switch touch.type {
    case .pencil: return "pen"
    case .direct: return "touch"
    case .indirectPointer: return "mouse"
    default: return nil
    }
  }

  /// Returns the id for `touch`, assigning a new one on first sight.
  private func id(for touch: UITouch) -> Int {
    let key = ObjectIdentifier(touch)
    if let existing = touchIds[key] { return existing }
    let assigned = nextTouchId
    nextTouchId += 1
    touchIds[key] = assigned
    return assigned
  }

  /// Drops ids of contacts that ended.
  private func forget(_ touches: Set<UITouch>) {
    for touch in touches { touchIds.removeValue(forKey: ObjectIdentifier(touch)) }
  }
}
