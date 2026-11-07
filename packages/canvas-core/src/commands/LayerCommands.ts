/**
 * Wander — Zhich, Yu, Justin
 * Commands that change layers and the background.
 */

import type { BackgroundStyle } from '../model/Background';
import type { CanvasDocument } from '../model/CanvasDocument';
import type { Layer, LayerProps } from '../model/Layer';
import { Command } from './Command';

/** Adds a layer (default: on top) and makes it active. */
export class AddLayer extends Command {
  readonly label = 'Add layer';
  private prevActive?: string;

  /** Creates the command for `layer` at `index`. */
  constructor(
    private readonly layer: Layer,
    private readonly index?: number,
  ) {
    super();
  }

  /** Inserts the layer and activates it. */
  do(doc: CanvasDocument): void {
    this.prevActive = doc.activeLayer.id;
    doc.addLayer(this.layer, this.index);
    doc.setActiveLayer(this.layer.id);
  }

  /** Removes the layer and restores the previous active layer. */
  undo(doc: CanvasDocument): void {
    doc.removeLayer(this.layer.id);
    if (this.prevActive) doc.setActiveLayer(this.prevActive);
  }
}

/** Removes a layer together with its objects. */
export class RemoveLayer extends Command {
  readonly label = 'Delete layer';
  private removed?: { layer: Layer; index: number };
  private wasActive = false;

  /** Creates the command for layer `layerId`. */
  constructor(private readonly layerId: string) {
    super();
  }

  /** Removes the layer. */
  do(doc: CanvasDocument): void {
    this.wasActive = doc.activeLayer.id === this.layerId;
    this.removed = doc.removeLayer(this.layerId);
  }

  /** Re-inserts the layer at its old position. */
  undo(doc: CanvasDocument): void {
    if (!this.removed) return;
    doc.addLayer(this.removed.layer, this.removed.index);
    if (this.wasActive) doc.setActiveLayer(this.layerId);
  }
}

/** Moves a layer to a new position in the stack. */
export class MoveLayer extends Command {
  readonly label = 'Reorder layer';
  private from = -1;

  /** Creates the command moving `layerId` to `toIndex`. */
  constructor(
    private readonly layerId: string,
    private readonly toIndex: number,
  ) {
    super();
  }

  /** Moves the layer. */
  do(doc: CanvasDocument): void {
    this.from = doc.layers.findIndex((l) => l.id === this.layerId);
    doc.moveLayer(this.layerId, this.toIndex);
  }

  /** Moves it back. */
  undo(doc: CanvasDocument): void {
    doc.moveLayer(this.layerId, this.from);
  }
}

/** Changes layer properties (name, visibility, lock, opacity). */
export class UpdateLayer extends Command {
  readonly label = 'Edit layer';
  private prev: Partial<LayerProps> = {};

  /** Creates the command. */
  constructor(
    private readonly layerId: string,
    private readonly props: Partial<LayerProps>,
  ) {
    super();
  }

  /** Applies the new properties. */
  do(doc: CanvasDocument): void {
    this.prev = doc.updateLayer(this.layerId, this.props);
  }

  /** Restores the previous properties. */
  undo(doc: CanvasDocument): void {
    doc.updateLayer(this.layerId, this.prev);
  }
}

/** Replaces the background style. */
export class SetBackground extends Command {
  readonly label = 'Change background';
  private prev?: BackgroundStyle;

  /** Creates the command. */
  constructor(private readonly next: BackgroundStyle) {
    super();
  }

  /** Applies the new background. */
  do(doc: CanvasDocument): void {
    this.prev = { ...doc.background };
    doc.setBackground(this.next);
  }

  /** Restores the old background. */
  undo(doc: CanvasDocument): void {
    if (this.prev) doc.setBackground(this.prev);
  }
}
