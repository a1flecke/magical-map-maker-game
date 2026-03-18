/* Magical Map Maker — Undo/Redo History Manager (Command Pattern) */

const MAX_UNDO_STEPS = 50;

class HistoryManager {
  constructor() {
    this._undoStack = [];
    this._redoStack = [];
    this._onStateChange = null; // callback for UI updates
  }

  /** Register callback for undo/redo stack state changes */
  set onStateChange(fn) { this._onStateChange = fn; }

  get canUndo() { return this._undoStack.length > 0; }
  get canRedo() { return this._redoStack.length > 0; }

  /**
   * Push a command onto the undo stack.
   * Clears redo stack (new action invalidates redo history).
   * @param {object} command - { type, apply(), undo() }
   */
  push(command) {
    this._undoStack.push(command);
    this._redoStack = [];

    // Enforce max size
    while (this._undoStack.length > MAX_UNDO_STEPS) {
      this._undoStack.shift();
    }

    this._notify();
  }

  /** Undo the most recent command */
  undo() {
    if (this._undoStack.length === 0) return null;
    const cmd = this._undoStack.pop();
    cmd.undo();
    this._redoStack.push(cmd);
    this._notify();
    return cmd;
  }

  /** Redo the most recently undone command */
  redo() {
    if (this._redoStack.length === 0) return null;
    const cmd = this._redoStack.pop();
    cmd.apply();
    this._undoStack.push(cmd);
    this._notify();
    return cmd;
  }

  /** Clear all history */
  clear() {
    this._undoStack = [];
    this._redoStack = [];
    this._notify();
  }

  _notify() {
    if (this._onStateChange) {
      this._onStateChange(this.canUndo, this.canRedo);
    }
  }

  destroy() {
    this._undoStack = [];
    this._redoStack = [];
    this._onStateChange = null;
  }
}

/* ---- Command Factories ---- */

/**
 * Create a PlaceTile command.
 * @param {Grid} grid
 * @param {number} col
 * @param {number} row
 * @param {string} cellType
 * @param {string|null} oldBase
 * @param {string} newBase
 * @param {TileRenderer} tileRenderer
 */
function cmdPlaceTile(grid, col, row, cellType, oldBase, newBase, tileRenderer) {
  return {
    type: 'PlaceTile',
    apply() {
      grid.setBase(col, row, newBase, cellType);
      if (tileRenderer) tileRenderer.markDirty(grid, col, row, cellType);
    },
    undo() {
      grid.setBase(col, row, oldBase, cellType);
      if (tileRenderer) tileRenderer.markDirty(grid, col, row, cellType);
    }
  };
}

/**
 * Create a PaintTiles command (batched drag-paint stroke).
 * @param {Grid} grid
 * @param {Array<{col, row, cellType, oldBase, newBase}>} cells
 * @param {TileRenderer} tileRenderer
 */
function cmdPaintTiles(grid, cells, tileRenderer) {
  return {
    type: 'PaintTiles',
    apply() {
      for (const c of cells) {
        grid.setBase(c.col, c.row, c.newBase, c.cellType);
        if (tileRenderer) tileRenderer.markDirty(grid, c.col, c.row, c.cellType);
      }
    },
    undo() {
      for (const c of cells) {
        grid.setBase(c.col, c.row, c.oldBase, c.cellType);
        if (tileRenderer) tileRenderer.markDirty(grid, c.col, c.row, c.cellType);
      }
    }
  };
}

/**
 * Create a FillTiles command.
 * @param {Grid} grid
 * @param {Array<{col, row, cellType, oldBase, newBase}>} cells
 * @param {TileRenderer} tileRenderer
 */
function cmdFillTiles(grid, cells, tileRenderer) {
  return {
    type: 'FillTiles',
    apply() {
      for (const c of cells) {
        grid.setBase(c.col, c.row, c.newBase, c.cellType);
        if (tileRenderer) tileRenderer.markDirty(grid, c.col, c.row, c.cellType);
      }
    },
    undo() {
      for (const c of cells) {
        grid.setBase(c.col, c.row, c.oldBase, c.cellType);
        if (tileRenderer) tileRenderer.markDirty(grid, c.col, c.row, c.cellType);
      }
    }
  };
}

/**
 * Create a PlaceOverlay command.
 * @param {Grid} grid
 * @param {number} col
 * @param {number} row
 * @param {string} cellType
 * @param {object} overlay - { id, rotation, opacity, size }
 */
function cmdPlaceOverlay(grid, col, row, cellType, overlay) {
  return {
    type: 'PlaceOverlay',
    apply() {
      const cell = grid.getCell(col, row, cellType);
      if (!cell) return;
      if (!cell.overlays) cell.overlays = [];
      cell.overlays.push({ ...overlay });
    },
    undo() {
      const cell = grid.getCell(col, row, cellType);
      if (!cell || !cell.overlays) return;
      cell.overlays.pop();
    }
  };
}

/**
 * Create a RemoveOverlay command.
 * @param {Grid} grid
 * @param {number} col
 * @param {number} row
 * @param {string} cellType
 * @param {number} overlayIndex
 * @param {object} overlay - saved overlay data
 */
function cmdRemoveOverlay(grid, col, row, cellType, overlayIndex, overlay) {
  return {
    type: 'RemoveOverlay',
    apply() {
      const cell = grid.getCell(col, row, cellType);
      if (!cell || !cell.overlays) return;
      cell.overlays.splice(overlayIndex, 1);
    },
    undo() {
      const cell = grid.getCell(col, row, cellType);
      if (!cell) return;
      if (!cell.overlays) cell.overlays = [];
      cell.overlays.splice(overlayIndex, 0, { ...overlay });
    }
  };
}

/**
 * Create a ClearCell command (erase base + all overlays).
 * @param {Grid} grid
 * @param {number} col
 * @param {number} row
 * @param {string} cellType
 * @param {string|null} oldBase
 * @param {Array} oldOverlays - deep copy of overlays
 * @param {TileRenderer} tileRenderer
 */
function cmdClearCell(grid, col, row, cellType, oldBase, oldOverlays, tileRenderer) {
  return {
    type: 'ClearCell',
    apply() {
      grid.setBase(col, row, null, cellType);
      const cell = grid.getCell(col, row, cellType);
      if (cell) cell.overlays = [];
      if (tileRenderer) tileRenderer.markDirty(grid, col, row, cellType);
    },
    undo() {
      if (oldBase) {
        grid.setBase(col, row, oldBase, cellType);
      }
      const cell = grid.getCell(col, row, cellType);
      if (cell && oldOverlays) {
        cell.overlays = oldOverlays.map(o => ({ ...o }));
      }
      if (tileRenderer) tileRenderer.markDirty(grid, col, row, cellType);
    }
  };
}

/**
 * Create a batch erase command (eraser drag stroke).
 * @param {Grid} grid
 * @param {Array<{col, row, cellType, oldBase, oldOverlays}>} cells
 * @param {TileRenderer} tileRenderer
 */
function cmdEraseCells(grid, cells, tileRenderer) {
  return {
    type: 'EraseCells',
    apply() {
      for (const c of cells) {
        grid.setBase(c.col, c.row, null, c.cellType);
        const cell = grid.getCell(c.col, c.row, c.cellType);
        if (cell) cell.overlays = [];
        if (tileRenderer) tileRenderer.markDirty(grid, c.col, c.row, c.cellType);
      }
    },
    undo() {
      for (const c of cells) {
        if (c.oldBase) grid.setBase(c.col, c.row, c.oldBase, c.cellType);
        const cell = grid.getCell(c.col, c.row, c.cellType);
        if (cell && c.oldOverlays) {
          cell.overlays = c.oldOverlays.map(o => ({ ...o }));
        }
        if (tileRenderer) tileRenderer.markDirty(grid, c.col, c.row, c.cellType);
      }
    }
  };
}

/**
 * Create a RotateOverlay command.
 */
function cmdRotateOverlay(grid, col, row, cellType, overlayIndex, oldRotation, newRotation) {
  return {
    type: 'RotateOverlay',
    apply() {
      const cell = grid.getCell(col, row, cellType);
      if (cell && cell.overlays && cell.overlays[overlayIndex]) {
        cell.overlays[overlayIndex].rotation = newRotation;
      }
    },
    undo() {
      const cell = grid.getCell(col, row, cellType);
      if (cell && cell.overlays && cell.overlays[overlayIndex]) {
        cell.overlays[overlayIndex].rotation = oldRotation;
      }
    }
  };
}

/**
 * Create a ClearAll command (stores entire grid state).
 * @param {Grid} grid
 * @param {Array} savedState - snapshot of all non-empty cells
 * @param {TileRenderer} tileRenderer
 */
function cmdClearAll(grid, savedState, tileRenderer) {
  return {
    type: 'ClearAll',
    apply() {
      grid.forEachCell((col, row, cell, cellType) => {
        cell.base = null;
        cell.overlays = [];
      });
      if (tileRenderer) tileRenderer.clearCache();
    },
    undo() {
      for (const s of savedState) {
        grid.setBase(s.col, s.row, s.oldBase, s.cellType);
        const cell = grid.getCell(s.col, s.row, s.cellType);
        if (cell && s.oldOverlays) {
          cell.overlays = s.oldOverlays.map(o => ({ ...o }));
        }
        if (tileRenderer) tileRenderer.markDirty(grid, s.col, s.row, s.cellType);
      }
    }
  };
}
