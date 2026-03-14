/* Magical Map Maker — Input Handler (Pointer Events) */

class InputHandler {
  constructor(canvasEl, options) {
    this._canvas = canvasEl;
    this._camera = options.camera;
    this._grid = options.grid;
    this._onCellTap = options.onCellTap || null;
    this._onCellDrag = options.onCellDrag || null;
    this._onKeyAction = options.onKeyAction || null;

    this._activePointers = new Map(); // pointerId -> { x, y }
    this._isDragging = false;
    this._dragCancelled = false;
    this._lastDragCell = null;
    this._startPointerPos = null;
    this._dragThreshold = 5; // px movement before considered a drag
    this._destroyed = false;

    this._boundHandlers = {};
    this._attach();
  }

  _attach() {
    const h = this._boundHandlers;
    h.pointerdown = (e) => this._onPointerDown(e);
    h.pointermove = (e) => this._onPointerMove(e);
    h.pointerup = (e) => this._onPointerUp(e);
    h.pointercancel = (e) => this._onPointerCancel(e);
    h.keydown = (e) => this._onKeyDown(e);

    this._canvas.addEventListener('pointerdown', h.pointerdown);
    this._canvas.addEventListener('pointermove', h.pointermove);
    this._canvas.addEventListener('pointerup', h.pointerup);
    this._canvas.addEventListener('pointercancel', h.pointercancel);
    document.addEventListener('keydown', h.keydown);
  }

  destroy() {
    this._destroyed = true;
    const h = this._boundHandlers;
    this._canvas.removeEventListener('pointerdown', h.pointerdown);
    this._canvas.removeEventListener('pointermove', h.pointermove);
    this._canvas.removeEventListener('pointerup', h.pointerup);
    this._canvas.removeEventListener('pointercancel', h.pointercancel);
    document.removeEventListener('keydown', h.keydown);
    this._activePointers.clear();
  }

  _getCanvasPos(e) {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  _onPointerDown(e) {
    e.preventDefault();
    this._activePointers.set(e.pointerId, this._getCanvasPos(e));

    // If second pointer detected, cancel any pending placement
    if (this._activePointers.size > 1) {
      this._dragCancelled = true;
      return;
    }

    // Only capture the primary (first) pointer for drag operations
    this._canvas.setPointerCapture(e.pointerId);

    this._isDragging = false;
    this._dragCancelled = false;
    this._lastDragCell = null;
    this._startPointerPos = this._getCanvasPos(e);
  }

  _onPointerMove(e) {
    if (!this._activePointers.has(e.pointerId)) return;
    this._activePointers.set(e.pointerId, this._getCanvasPos(e));

    // Cancel if multi-touch
    if (this._activePointers.size > 1) {
      this._dragCancelled = true;
      return;
    }

    if (this._dragCancelled) return;

    const pos = this._getCanvasPos(e);

    // Check drag threshold
    if (!this._isDragging && this._startPointerPos) {
      const dx = pos.x - this._startPointerPos.x;
      const dy = pos.y - this._startPointerPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > this._dragThreshold) {
        this._isDragging = true;
      }
    }

    if (this._isDragging && this._onCellDrag) {
      const world = this._camera.screenToWorld(pos.x, pos.y);
      const cell = this._grid.pixelToGrid(world.x, world.y);
      if (cell) {
        const cellKey = `${cell.col},${cell.row}`;
        if (cellKey !== this._lastDragCell) {
          this._lastDragCell = cellKey;
          this._onCellDrag(cell.col, cell.row);
        }
      }
    }
  }

  _onPointerUp(e) {
    this._activePointers.delete(e.pointerId);

    try {
      this._canvas.releasePointerCapture(e.pointerId);
    } catch (_) { /* ignore if already released */ }

    // If cancelled by multi-touch, skip
    if (this._dragCancelled) {
      if (this._activePointers.size === 0) {
        this._dragCancelled = false;
      }
      return;
    }

    // If we weren't dragging, this is a tap → placement on pointerup
    if (!this._isDragging && this._onCellTap) {
      const pos = this._getCanvasPos(e);
      const world = this._camera.screenToWorld(pos.x, pos.y);
      const cell = this._grid.pixelToGrid(world.x, world.y);
      if (cell) {
        this._onCellTap(cell.col, cell.row);
      }
    }

    this._isDragging = false;
    this._lastDragCell = null;
  }

  _onPointerCancel(e) {
    this._activePointers.delete(e.pointerId);
    try {
      this._canvas.releasePointerCapture(e.pointerId);
    } catch (_) { /* ignore */ }
    this._isDragging = false;
    this._dragCancelled = false;
    this._lastDragCell = null;
  }

  _onKeyDown(e) {
    if (this._destroyed || !this._onKeyAction) return;

    // Don't capture if focus is in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case 'Escape':
        this._onKeyAction('escape');
        break;
      case 'f':
      case 'F':
        this._onKeyAction('fill-toggle');
        break;
      case 'g':
      case 'G':
        this._onKeyAction('grid-toggle');
        break;
      case '1':
        this._onKeyAction('brush-1');
        break;
      case '2':
        this._onKeyAction('brush-2');
        break;
      case '3':
        this._onKeyAction('brush-3');
        break;
    }
  }
}
