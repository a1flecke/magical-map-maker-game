/* Magical Map Maker — Editor State Machine & RAF Loop Owner */

// States: IDLE, TILE_SELECTED, FILL_MODE
const EditorState = {
  IDLE: 'IDLE',
  TILE_SELECTED: 'TILE_SELECTED',
  FILL_MODE: 'FILL_MODE'
};

// Map sizes: cols x rows
const MAP_SIZES = {
  small:  { cols: 12, rows: 10, cellSize: 48 },
  medium: { cols: 20, rows: 16, cellSize: 40 },
  large:  { cols: 30, rows: 24, cellSize: 32 }
};

class Editor {
  constructor(options) {
    this._canvasEl = options.canvasEl;
    this._containerEl = options.containerEl;
    this._toolbarEl = options.toolbarEl;
    this._paletteEl = options.paletteEl;
    this._app = options.app;

    this._themeId = options.themeId;
    this._shape = options.shape;
    this._sizeKey = options.size;
    this._mapName = options.mapName;

    this._ctx = null;
    this._dpr = 1;
    this._dirty = true;
    this._rafId = null;
    this._running = false;

    this._state = EditorState.IDLE;
    this._selectedTile = null;
    this._selectedCell = null;
    this._brushSize = 1;
    this._showGrid = true;
    this._fillMode = false;

    // Fill highlight tracking
    this._fillHighlight = null;
    this._fillHighlightTimer = null;

    // Sub-systems
    this._grid = null;
    this._camera = null;
    this._tileRenderer = null;
    this._themeManager = null;
    this._palette = null;
    this._input = null;
  }

  async init() {
    this._ctx = this._canvasEl.getContext('2d');

    // Load data
    this._themeManager = new ThemeManager();
    this._tileRenderer = new TileRenderer();
    await Promise.all([
      this._themeManager.load(),
      this._tileRenderer.load()
    ]);

    // Apply theme
    this._themeManager.applyTheme(this._containerEl, this._themeId);

    // Create grid
    const sizeConfig = MAP_SIZES[this._sizeKey] || MAP_SIZES.medium;
    this._grid = new Grid(sizeConfig.cols, sizeConfig.rows, sizeConfig.cellSize);

    // Camera (session 1: fixed at 1.0 zoom, centered)
    this._camera = new Camera();

    // Palette
    const tileIds = this._themeManager.getAvailableTiles(this._themeId);
    this._palette = new Palette(this._paletteEl, this._tileRenderer, (tileId) => {
      this._selectedTile = tileId;
      this._state = this._fillMode ? EditorState.FILL_MODE : EditorState.TILE_SELECTED;
      this._dirty = true;
    });
    this._palette.populate(tileIds);

    // Size canvas
    this._resizeCanvas();

    // Center the grid in the canvas
    this._centerGrid();

    // Input handler
    this._input = new InputHandler(this._canvasEl, {
      camera: this._camera,
      grid: this._grid,
      onCellTap: (col, row) => this._handleCellTap(col, row),
      onCellDrag: (col, row) => this._handleCellDrag(col, row),
      onKeyAction: (action) => this._handleKeyAction(action)
    });

    // Toolbar
    this._bindToolbar();

    // Map name display
    const nameEl = this._toolbarEl.querySelector('.toolbar-center');
    if (nameEl) nameEl.textContent = this._mapName;

    // Window resize
    this._boundResize = () => {
      this._resizeCanvas();
      this._centerGrid();
      this._tileRenderer.clearCache();
      this._dirty = true;
    };
    window.addEventListener('resize', this._boundResize);

    // DPR change listener
    this._setupDprListener();

    // Start RAF loop
    this._running = true;
    this._tick();
  }

  destroy() {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._input) {
      this._input.destroy();
      this._input = null;
    }
    if (this._palette) {
      this._palette.destroy();
      this._palette = null;
    }
    if (this._boundResize) {
      window.removeEventListener('resize', this._boundResize);
    }
    if (this._dprMql) {
      this._dprMql.removeEventListener('change', this._boundDprChange);
    }
    if (this._fillHighlightTimer) {
      clearTimeout(this._fillHighlightTimer);
      this._fillHighlightTimer = null;
    }
  }

  /* ---- RAF Loop (single owner) ---- */
  _tick() {
    if (!this._running) return;

    if (this._dirty) {
      this._render();
      this._dirty = false;
    }

    this._rafId = requestAnimationFrame(() => this._tick());
  }

  /* ---- Canvas Sizing (DPR-aware) ---- */
  _resizeCanvas() {
    this._dpr = window.devicePixelRatio || 1;
    const w = this._containerEl.clientWidth;
    const h = this._containerEl.clientHeight;
    this._canvasEl.width = w * this._dpr;
    this._canvasEl.height = h * this._dpr;
    this._canvasEl.style.width = w + 'px';
    this._canvasEl.style.height = h + 'px';
    this._dirty = true;
  }

  _setupDprListener() {
    this._dprMql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    this._boundDprChange = () => {
      this._resizeCanvas();
      this._centerGrid();
      this._tileRenderer.clearCache();
      this._dirty = true;
      // Re-listen at new DPR
      this._dprMql.removeEventListener('change', this._boundDprChange);
      this._setupDprListener();
    };
    this._dprMql.addEventListener('change', this._boundDprChange);
  }

  _centerGrid() {
    const canvasW = this._containerEl.clientWidth;
    const canvasH = this._containerEl.clientHeight;
    const gridW = this._grid.widthPx;
    const gridH = this._grid.heightPx;
    this._camera.offsetX = Math.round((canvasW - gridW) / 2);
    this._camera.offsetY = Math.round((canvasH - gridH) / 2);
  }

  /* ---- Rendering ---- */
  _render() {
    const ctx = this._ctx;
    const dpr = this._dpr;
    const w = this._canvasEl.width;
    const h = this._canvasEl.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Apply DPR scale + camera as a single transform stack
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    this._camera.applyTransform(ctx);

    // Layer 1: Base tiles
    this._renderBaseTiles(ctx);

    // Layer 2: Overlays (future)

    // Layer 3: Grid lines
    if (this._showGrid) {
      const theme = this._themeManager.getTheme(this._themeId);
      const gridColor = theme ? theme.colors.grid : '#C8BFA9';
      this._grid.drawGridLines(ctx, gridColor);
    }

    // Layer 4: Selection highlight
    this._renderSelectionHighlight(ctx);

    // Fill highlight
    this._renderFillHighlight(ctx);

    ctx.restore();
  }

  _renderBaseTiles(ctx) {
    const grid = this._grid;
    const cellSize = grid.cellSize;

    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const cell = grid.cells[r][c];
        if (!cell.base) continue;

        const tileCanvas = this._tileRenderer.getTileCanvas(cell.base, this._shape, cellSize);
        if (tileCanvas) {
          const { x, y } = grid.gridToPixel(c, r);
          ctx.drawImage(tileCanvas, x, y, cellSize, cellSize);
        }
      }
    }
  }

  _renderSelectionHighlight(ctx) {
    if (!this._selectedCell) return;
    const { col, row } = this._selectedCell;
    const { x, y } = this._grid.gridToPixel(col, row);
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, this._grid.cellSize - 3, this._grid.cellSize - 3);
  }

  _renderFillHighlight(ctx) {
    if (!this._fillHighlight) return;
    ctx.fillStyle = 'rgba(255, 235, 59, 0.3)';
    for (const { col, row } of this._fillHighlight) {
      const { x, y } = this._grid.gridToPixel(col, row);
      ctx.fillRect(x, y, this._grid.cellSize, this._grid.cellSize);
    }
  }

  /* ---- Toolbar ---- */
  _bindToolbar() {
    // Back button
    const backBtn = document.getElementById('btn-editor-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => this._app.showScreen('title'));
    }

    // Grid toggle
    const gridBtn = document.getElementById('btn-grid-toggle');
    if (gridBtn) {
      gridBtn.addEventListener('click', () => this._toggleGrid());
      gridBtn.classList.toggle('active', this._showGrid);
    }

    // Fill toggle
    const fillBtn = document.getElementById('btn-fill-tool');
    if (fillBtn) {
      fillBtn.addEventListener('click', () => this._toggleFillMode());
    }

    // Brush size buttons
    const brushBtns = this._toolbarEl.querySelectorAll('.brush-btn');
    brushBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const size = parseInt(btn.dataset.brush, 10);
        this._setBrushSize(size);
      });
    });

    this._updateBrushUI();
  }

  _toggleGrid() {
    this._showGrid = !this._showGrid;
    const gridBtn = document.getElementById('btn-grid-toggle');
    if (gridBtn) gridBtn.classList.toggle('active', this._showGrid);
    this._dirty = true;
  }

  _toggleFillMode() {
    this._fillMode = !this._fillMode;
    const fillBtn = document.getElementById('btn-fill-tool');
    if (fillBtn) fillBtn.classList.toggle('active', this._fillMode);

    if (this._selectedTile) {
      this._state = this._fillMode ? EditorState.FILL_MODE : EditorState.TILE_SELECTED;
    }

    const label = this._fillMode ? 'Fill mode on' : 'Fill mode off';
    this._app.announce(label);
  }

  _setBrushSize(size) {
    this._brushSize = size;
    this._updateBrushUI();
    this._app.announce('Brush size ' + (size === 1 ? '1' : size + 'x' + size));
  }

  _updateBrushUI() {
    const brushBtns = this._toolbarEl.querySelectorAll('.brush-btn');
    brushBtns.forEach(btn => {
      const size = parseInt(btn.dataset.brush, 10);
      btn.classList.toggle('active', size === this._brushSize);
      btn.setAttribute('aria-pressed', size === this._brushSize ? 'true' : 'false');
    });
  }

  /* ---- Cell Interaction ---- */
  _handleCellTap(col, row) {
    if (this._state === EditorState.FILL_MODE && this._selectedTile) {
      this._doFill(col, row);
      return;
    }

    if (this._selectedTile) {
      this._paintBrush(col, row);
      return;
    }

    // No tile selected — select cell for inspection
    const cell = this._grid.getCell(col, row);
    if (cell && cell.base) {
      this._selectedCell = { col, row };
      this._app.announce('Selected cell at column ' + (col + 1) + ', row ' + (row + 1) + ': ' + cell.base);
    } else {
      this._selectedCell = null;
    }
    this._dirty = true;
  }

  _handleCellDrag(col, row) {
    // Drag-to-paint only when tile selected and not in fill mode
    if (!this._selectedTile || this._fillMode) return;
    this._paintBrush(col, row);
  }

  _paintBrush(col, row) {
    const half = Math.floor(this._brushSize / 2);
    let changed = false;

    for (let dr = -half; dr < this._brushSize - half; dr++) {
      for (let dc = -half; dc < this._brushSize - half; dc++) {
        if (this._grid.setBase(col + dc, row + dr, this._selectedTile)) {
          changed = true;
        }
      }
    }

    if (changed) {
      this._dirty = true;
    }
  }

  _doFill(col, row) {
    const filledCells = this._grid.floodFill(col, row, this._selectedTile, 500);
    if (filledCells.length > 0) {
      this._dirty = true;
      this._app.announce('Filled ' + filledCells.length + ' cells');

      // Brief yellow highlight on filled area
      this._fillHighlight = filledCells;

      if (this._fillHighlightTimer) {
        clearTimeout(this._fillHighlightTimer);
      }
      this._fillHighlightTimer = setTimeout(() => {
        this._fillHighlight = null;
        this._fillHighlightTimer = null;
        this._dirty = true;
      }, 400);
    }
  }

  /* ---- Keyboard ---- */
  _handleKeyAction(action) {
    switch (action) {
      case 'escape':
        this._selectedTile = null;
        this._selectedCell = null;
        this._state = EditorState.IDLE;
        this._palette.clearSelection();
        this._dirty = true;
        this._app.announce('Selection cleared');
        break;
      case 'fill-toggle':
        this._toggleFillMode();
        break;
      case 'grid-toggle':
        this._toggleGrid();
        break;
      case 'brush-1':
        this._setBrushSize(1);
        break;
      case 'brush-2':
        this._setBrushSize(2);
        break;
      case 'brush-3':
        this._setBrushSize(3);
        break;
    }
  }
}
