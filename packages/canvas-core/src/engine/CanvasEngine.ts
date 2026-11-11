/**
 * Wander — Zhich, Yu, Justin
 * Facade that ties the engine together: one document, its undo history,
 * the camera, the selection, the overlay and the active tool. The app and
 * the renderer talk to this object; it is the main entry point of the core.
 */

import { Camera } from '../Camera';
import { History } from '../commands/History';
import { Emitter } from '../Emitter';
import { CanvasDocument } from '../model/CanvasDocument';
import { deserializeDocument, serializeDocument, type DocumentJSON } from '../serialize/Serializer';
import { Overlay } from '../tools/Overlay';
import { PenTool } from '../tools/PenTool';
import { Selection } from '../tools/Selection';
import type { PointerInput, PointerSampleUpdate, Tool, ToolContext } from '../tools/Tool';

/** Owns the live editing session for one canvas. */
export class CanvasEngine {
  /** Fires when `load` swaps in a new document (renderers must resubscribe). */
  readonly documentReplaced = new Emitter<CanvasDocument>();
  /** Fires when the active tool changes. */
  readonly toolChanged = new Emitter<Tool>();
  /**
   * Fires before undo, redo, a tool switch or a load, so input sources can
   * commit a lifted stroke they are still holding (PointerSession waits a
   * moment after lift for Apple Pencil corrections).
   */
  readonly flushRequested = new Emitter<void>();
  readonly camera = new Camera();
  readonly selection = new Selection();
  readonly overlay = new Overlay();
  private _doc: CanvasDocument;
  private _history: History;
  private _tool: Tool;
  private gestureActive = false;

  /** Creates an engine with an empty document and a pen. */
  constructor(doc: CanvasDocument = new CanvasDocument()) {
    this._doc = doc;
    this._history = new History(doc);
    this._tool = new PenTool();
  }

  /** The current document. */
  get doc(): CanvasDocument {
    return this._doc;
  }

  /** Undo history of the current document. */
  get history(): History {
    return this._history;
  }

  /** The active tool. */
  get tool(): Tool {
    return this._tool;
  }

  /** Context passed to tools. */
  private get ctx(): ToolContext {
    return {
      doc: this._doc,
      history: this._history,
      camera: this.camera,
      selection: this.selection,
      overlay: this.overlay,
    };
  }

  /** Switches tools, cancelling any gesture in progress. */
  setTool(tool: Tool): void {
    this.flushRequested.emit();
    this.cancelGesture();
    this._tool = tool;
    this.toolChanged.emit(tool);
  }

  /** Forwards a pointer-down to the active tool. */
  pointerDown(e: PointerInput): void {
    this.gestureActive = true;
    this._tool.onDown(e, this.ctx);
  }

  /** Forwards a pointer-move (with optional predicted samples) to the active tool. */
  pointerMove(e: PointerInput, predicted?: readonly PointerInput[]): void {
    if (this.gestureActive) this._tool.onMove(e, this.ctx, predicted);
  }

  /** Forwards corrected values for an earlier sample to the active tool. */
  pointerUpdate(u: PointerSampleUpdate): void {
    if (this.gestureActive) this._tool.onSampleUpdate?.(u, this.ctx);
  }

  /** Forwards a pointer-up to the active tool. */
  pointerUp(e: PointerInput): void {
    if (!this.gestureActive) return;
    this.gestureActive = false;
    try {
      this._tool.onUp(e, this.ctx);
    } catch (err) {
      this._tool.onCancel(this.ctx);
      throw err;
    }
  }

  /** Cancels the gesture in progress, if any. */
  cancelGesture(): void {
    if (!this.gestureActive) return;
    this.gestureActive = false;
    this._tool.onCancel(this.ctx);
  }

  /** Undoes the last step. */
  undo(): boolean {
    this.flushRequested.emit();
    this.cancelGesture();
    return this._history.undo();
  }

  /** Redoes the last undone step. */
  redo(): boolean {
    this.flushRequested.emit();
    this.cancelGesture();
    return this._history.redo();
  }

  /** Serializes the document (camera is view state and is not saved). */
  save(): DocumentJSON {
    return serializeDocument(this._doc);
  }

  /** Replaces the document with one loaded from JSON and clears history. */
  load(json: DocumentJSON): void {
    this.flushRequested.emit();
    this.cancelGesture();
    this._doc = deserializeDocument(json);
    this._history = new History(this._doc);
    this.selection.clear();
    this.overlay.clear();
    this.documentReplaced.emit(this._doc);
  }
}
