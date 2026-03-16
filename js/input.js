/* Magical Map Maker — Input Handler (Pointer Events + Wheel) */

class InputHandler {
  constructor(canvasEl, options) {
    this._canvas = canvasEl;
    this._camera = options.camera;
    this._grid = options.grid;
    this._onCellTap = options.onCellTap || null;
    this._onCellDrag = options.onCellDrag || null;
    this._onKeyAction = options.onKeyAction || null;
    this._onPan = options.onPan || null;
    this._onPinchZoom = options.onPinchZoom || null;
    this._onWheelZoom = options.onWheelZoom || null;
    this._onHoverCell = options.onHoverCell || null;

    this._panMode = false;

    this._activePointers = new Map(); // pointerId -> { x, y }
    this._isDragging = false;
    this._isPanning = false;
    this._dragCancelled = false;
    this._lastDragCell = null;
    this._startPointerPos = null;
    this._dragThreshold = 5;
    this._destroyed = false;

    // Pinch tracking
    this._pinchStartDist = 0;
    this._pinchStartZoom = 1;

    this._boundHandlers = {};
    this._attach();
  }

  set panMode(val) {
    this._panMode = !!val;
  }

  get panMode() {
    return this._panMode;
  }

  _attach() {
    const h = this._boundHandlers;
    h.pointerdown = (e) => this._onPointerDown(e);
    h.pointermove = (e) => this._onPointerMove(e);
    h.pointerup = (e) => this._onPointerUp(e);
    h.pointercancel = (e) => this._onPointerCancel(e);
    h.wheel = (e) => this._onWheel(e);
    h.keydown = (e) => this._onKeyDown(e);

    this._canvas.addEventListener('pointerdown', h.pointerdown);
    this._canvas.addEventListener('pointermove', h.pointermove);
    this._canvas.addEventListener('pointerup', h.pointerup);
    this._canvas.addEventListener('pointercancel', h.pointercancel);
    this._canvas.addEventListener('wheel', h.wheel, { passive: false });
    document.addEventListener('keydown', h.keydown);
  }

  destroy() {
    this._destroyed = true;
    const h = this._boundHandlers;
    this._canvas.removeEventListener('pointerdown', h.pointerdown);
    this._canvas.removeEventListener('pointermove', h.pointermove);
    this._canvas.removeEventListener('pointerup', h.pointerup);
    this._canvas.removeEventListener('pointercancel', h.pointercancel);
    this._canvas.removeEventListener('wheel', h.wheel);
    document.removeEventListener('keydown', h.keydown);
    this._activePointers.clear();
  }

  _getCanvasPos(e) {
    const rect = this._canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _getPointerDistance() {
    if (this._activePointers.size < 2) return 0;
    const pts = Array.from(this._activePointers.values());
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _getPointerMidpoint() {
    const pts = Array.from(this._activePointers.values());
    if (pts.length < 2) return pts[0] || { x: 0, y: 0 };
    return {
      x: (pts[0].x + pts[1].x) / 2,
      y: (pts[0].y + pts[1].y) / 2
    };
  }

  /* ---- Pointer Events ---- */

  _onPointerDown(e) {
    e.preventDefault();
    this._activePointers.set(e.pointerId, this._getCanvasPos(e));

    if (this._activePointers.size > 1) {
      // Second pointer: start pinch/two-finger-pan
      this._dragCancelled = true;
      this._isPanning = false;
      this._pinchStartDist = this._getPointerDistance();
      this._pinchStartZoom = this._camera.zoom;
      this._lastPinchMidpoint = this._getPointerMidpoint();
      return;
    }

    // First pointer
    this._canvas.setPointerCapture(e.pointerId);
    this._isDragging = false;
    this._isPanning = false;
    this._dragCancelled = false;
    this._lastDragCell = null;
    this._startPointerPos = this._getCanvasPos(e);
  }

  _onPointerMove(e) {
    if (!this._activePointers.has(e.pointerId)) {
      // Hover — report hovered cell for coordinate display
      if (this._onHoverCell) {
        const pos = this._getCanvasPos(e);
        const world = this._camera.screenToWorld(pos.x, pos.y);
        const cell = this._grid.pixelToGrid(world.x, world.y);
        this._onHoverCell(cell);
      }
      return;
    }

    this._activePointers.set(e.pointerId, this._getCanvasPos(e));

    // Two-pointer: pinch zoom + two-finger pan
    if (this._activePointers.size >= 2) {
      const dist = this._getPointerDistance();
      const mid = this._getPointerMidpoint();

      // Pinch zoom
      if (this._pinchStartDist > 0 && this._onPinchZoom) {
        const scale = dist / this._pinchStartDist;
        const newZoom = this._pinchStartZoom * scale;
        this._onPinchZoom(newZoom, mid.x, mid.y);
      }

      // Two-finger pan
      if (this._lastPinchMidpoint && this._onPan) {
        const dx = mid.x - this._lastPinchMidpoint.x;
        const dy = mid.y - this._lastPinchMidpoint.y;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          this._onPan(dx, dy);
        }
      }
      this._lastPinchMidpoint = mid;
      return;
    }

    if (this._dragCancelled) return;

    const pos = this._getCanvasPos(e);

    // Check drag threshold
    if (!this._isDragging && !this._isPanning && this._startPointerPos) {
      const dx = pos.x - this._startPointerPos.x;
      const dy = pos.y - this._startPointerPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > this._dragThreshold) {
        if (this._panMode) {
          this._isPanning = true;
          this._lastPanPos = this._startPointerPos;
        } else {
          this._isDragging = true;
        }
      }
    }

    // Pan mode drag
    if (this._isPanning && this._onPan) {
      const dx = pos.x - this._lastPanPos.x;
      const dy = pos.y - this._lastPanPos.y;
      this._onPan(dx, dy);
      this._lastPanPos = pos;
      return;
    }

    // Tile painting drag
    if (this._isDragging && this._onCellDrag) {
      const world = this._camera.screenToWorld(pos.x, pos.y);
      const cell = this._grid.pixelToGrid(world.x, world.y);
      if (cell) {
        const cellKey = cell.cellType
          ? `${cell.cellType},${cell.col},${cell.row}`
          : `${cell.col},${cell.row}`;
        if (cellKey !== this._lastDragCell) {
          this._lastDragCell = cellKey;
          this._onCellDrag(cell.col, cell.row, cell.cellType);
        }
      }
    }
  }

  _onPointerUp(e) {
    this._activePointers.delete(e.pointerId);
    try { this._canvas.releasePointerCapture(e.pointerId); } catch (_) {}

    // If came from multi-touch, wait until all pointers up
    if (this._dragCancelled) {
      if (this._activePointers.size === 0) {
        this._dragCancelled = false;
      }
      return;
    }

    // Tap (not drag, not pan) → placement on pointerup
    if (!this._isDragging && !this._isPanning && this._onCellTap) {
      const pos = this._getCanvasPos(e);
      const world = this._camera.screenToWorld(pos.x, pos.y);
      const cell = this._grid.pixelToGrid(world.x, world.y);
      if (cell) {
        this._onCellTap(cell.col, cell.row, cell.cellType);
      }
    }

    this._isDragging = false;
    this._isPanning = false;
    this._lastDragCell = null;
  }

  _onPointerCancel(e) {
    this._activePointers.delete(e.pointerId);
    try { this._canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    this._isDragging = false;
    this._isPanning = false;
    this._dragCancelled = false;
    this._lastDragCell = null;
  }

  /* ---- Scroll Wheel ---- */

  _onWheel(e) {
    e.preventDefault();
    if (!this._onWheelZoom) return;
    const pos = this._getCanvasPos(e);
    // Zoom toward cursor position
    const delta = -e.deltaY;
    this._onWheelZoom(delta, pos.x, pos.y);
  }

  /* ---- Keyboard ---- */

  _onKeyDown(e) {
    if (this._destroyed || !this._onKeyAction) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case 'Escape': this._onKeyAction('escape'); break;
      case 'f': case 'F': this._onKeyAction('fill-toggle'); break;
      case 'g': case 'G': this._onKeyAction('grid-toggle'); break;
      case 'p': case 'P': this._onKeyAction('pan-toggle'); break;
      case '1': this._onKeyAction('brush-1'); break;
      case '2': this._onKeyAction('brush-2'); break;
      case '3': this._onKeyAction('brush-3'); break;
      case 'm': case 'M': this._onKeyAction('map-life'); break;
      case '+': case '=': this._onKeyAction('zoom-in'); break;
      case '-': case '_': this._onKeyAction('zoom-out'); break;
      case '0': this._onKeyAction('zoom-fit'); break;
      case 'Delete': case 'Backspace': this._onKeyAction('delete'); break;
    }
  }
}
