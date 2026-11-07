// Wander — Zhich, Yu, Justin
// Native touch surface for the canvas on iOS and iPadOS. A transparent
// UIView laid over the Skia canvas that receives every touch (Apple Pencil,
// finger, and iPad trackpad or mouse) and reports it to JavaScript with
// what Gesture Handler cannot provide: Pencil pressure, tilt, the
// high-rate coalesced samples between frames (up to 240 Hz on Pencil), and
// UIKit's predicted samples. Event payloads match the RawPointerEvent shape
// of @wander/canvas-core's PointerSession, so JavaScript forwards them as is.
//
// Estimated properties: UIKit first reports Pencil force, angles and
// location as estimates and corrects them later (possibly after the touch
// ended) through touchesEstimatedPropertiesUpdated. Each Pencil sample that
// still expects corrections carries `updateIndex` (UITouch
// estimationUpdateIndex); each correction is sent as an event with phase
// "update", the same `updateIndex`, the corrected values and `final`.

import ExpoModulesCore
import UIKit

/// Transparent multi-touch view that streams raw pointer events to JS.
class PencilInputView: ExpoView {
  /// Fires once per UIKit touch callback with { events: [RawPointerEvent] }.
  let onInputSamples = EventDispatcher()

  /// Small stable ids for live touches (UITouch objects persist for a contact).
  private var touchIds: [ObjectIdentifier: Int] = [:]
  private var nextTouchId = 1

  /// Pointer id and timestamp (s) of every sample still expecting
  /// estimate corrections, keyed by estimationUpdateIndex. Kept past
  /// touchesEnded because corrections can arrive after lift.
  private var pendingEstimates: [Int: (pointerId: Int, time: TimeInterval)] = [:]
  /// Pending entries older than this (s) are dropped if no final update came.
  private static let estimateLifetime: TimeInterval = 2.0

  /// Sets up a transparent view that accepts several simultaneous touches.
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .clear
    isMultipleTouchEnabled = true
    isExclusiveTouch = false
  }

  /// A contact went down.
  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
    prunePendingEstimates(now: touches.first?.timestamp ?? 0)
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

  /// UIKit delivered corrected Pencil values for earlier estimated samples.
  /// The touches may be the originals or coalesced copies; they are matched
  /// to samples by estimationUpdateIndex.
  override func touchesEstimatedPropertiesUpdated(_ touches: Set<UITouch>) {
    var events: [[String: Any]] = []
    for touch in touches {
      guard touch.type == .pencil, let index = touch.estimationUpdateIndex?.intValue,
            let pending = pendingEstimates[index] else { continue }
      var payload = sample(touch, pointerId: nil)
      let final = touch.estimatedPropertiesExpectingUpdates.isEmpty
      payload["pointerId"] = pending.pointerId
      payload["kind"] = "pen"
      payload["phase"] = "update"
      payload["updateIndex"] = index
      payload["final"] = final
      if final { pendingEstimates.removeValue(forKey: index) }
      events.append(payload)
    }
    if !events.isEmpty {
      onInputSamples(["events": events])
    }
  }

  /// Drops pending estimates whose final correction never arrived.
  private func prunePendingEstimates(now: TimeInterval) {
    pendingEstimates = pendingEstimates.filter { now - $0.value.time < PencilInputView.estimateLifetime }
  }

  /// Builds one RawPointerEvent per changed touch and dispatches them together.
  private func send(_ touches: Set<UITouch>, event: UIEvent?, phase: String) {
    var events: [[String: Any]] = []
    for touch in touches {
      guard let kind = PencilInputView.kind(of: touch) else { continue }
      let pointerId = id(for: touch)
      var payload = sample(touch, pointerId: pointerId)
      payload["pointerId"] = pointerId
      payload["kind"] = kind
      payload["phase"] = phase
      if phase == "move" || phase == "up", let event = event {
        let coalesced = event.coalescedTouches(for: touch) ?? []
        if coalesced.count > 1 {
          payload["coalesced"] = coalesced.map { sample($0, pointerId: pointerId) }
        }
      }
      if phase == "move", let event = event {
        let predicted = event.predictedTouches(for: touch) ?? []
        if !predicted.isEmpty {
          payload["predicted"] = predicted.map { sample($0, pointerId: nil) }
        }
      }
      events.append(payload)
    }
    if !events.isEmpty {
      onInputSamples(["events": events])
    }
  }

  /// Position (view points), time (ms), and for the Pencil pressure and tilt.
  /// When `pointerId` is given and the Pencil sample still expects estimate
  /// corrections, adds `updateIndex` and remembers it for the update event.
  private func sample(_ touch: UITouch, pointerId: Int?) -> [String: Any] {
    let location = touch.type == .pencil ? touch.preciseLocation(in: self) : touch.location(in: self)
    var s: [String: Any] = [
      "x": Double(location.x),
      "y": Double(location.y),
      "time": touch.timestamp * 1000.0,
    ]
    if touch.type == .pencil {
      if touch.maximumPossibleForce > 0 {
        s["pressure"] = PencilInputView.pressure(force: Double(touch.force), maxForce: Double(touch.maximumPossibleForce))
      }
      let tilt = PencilInputView.tilt(
        altitude: Double(touch.altitudeAngle),
        azimuth: Double(touch.azimuthAngle(in: self))
      )
      s["tiltX"] = tilt.x
      s["tiltY"] = tilt.y
      if let pointerId = pointerId, !touch.estimatedPropertiesExpectingUpdates.isEmpty,
         let index = touch.estimationUpdateIndex?.intValue {
        s["updateIndex"] = index
        pendingEstimates[index] = (pointerId: pointerId, time: touch.timestamp)
      }
    }
    return s
  }

  /// Calibrated 0..1 pressure. UIKit's force is 1.0 for an average touch and
  /// tops out near 4.17 on Apple Pencil, so force / maxForce leaves normal
  /// writing (force 0.5 to 1.5) squeezed into 0.1 to 0.35. The square root
  /// spreads it so average writing lands near 0.5 (the same midpoint as web
  /// PointerEvent pressure) while a full press still reaches 1.
  static func pressure(force: Double, maxForce: Double) -> Double {
    let normalized = min(1.0, max(0.0, force / maxForce))
    return normalized.squareRoot()
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
