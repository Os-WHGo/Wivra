// Sesión: proyecto + historial. Un mensaje del chat = un paso de deshacer.
// — Claude
import { applyBatch } from './operations.mjs';
export class Session {
  constructor(project) { this.project = project; this.undoStack = []; this.redoStack = []; }
  apply(ops, expectedRevision) {
    const r = applyBatch(this.project, ops, expectedRevision);
    if (r.ok) { this.undoStack.push(this.project); this.redoStack = []; this.project = r.project; }
    return r.ok ? { ok: true, revision: this.project.revision, results: r.results } : r;
  }
  // Agregar un video al proyecto no es una edición: no se deshace. Se copia a todo el historial para que deshacer/rehacer sigan válidos.
  addAsset(asset) {
    for (const pr of [this.project, ...this.undoStack, ...this.redoStack])
      if (!pr.assets.some((a) => a.id === asset.id)) pr.assets.push({ ...asset });
  }
  undo() {
    if (!this.undoStack.length) return { ok: false, code: 'nothing_to_undo', message: 'No hay nada que deshacer' };
    this.redoStack.push(this.project); this.project = this.undoStack.pop();
    return { ok: true, revision: this.project.revision };
  }
  redo() {
    if (!this.redoStack.length) return { ok: false, code: 'nothing_to_redo', message: 'No hay nada que rehacer' };
    this.undoStack.push(this.project); this.project = this.redoStack.pop();
    return { ok: true, revision: this.project.revision };
  }
}
