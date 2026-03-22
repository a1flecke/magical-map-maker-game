/* Magical Map Maker — Editor State Machine & RAF Loop Owner */

const EditorState = {
  IDLE: 'IDLE',
  TILE_SELECTED: 'TILE_SELECTED',
  FILL_MODE: 'FILL_MODE',
  OVERLAY_SELECTED: 'OVERLAY_SELECTED',
  CELL_SELECTED: 'CELL_SELECTED'
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
    this._mapId = options.mapId || null;
    this._savedCells = options.savedCells || null;
    this._savedCamera = options.savedCamera || null;
    this._storage = options.storage || null;
    this._settingsManager = options.settings || null;

    this._ctx = null;
    this._dpr = 1;
    this._dirty = true;
    this._rafId = null;
    this._running = false;

    this._state = EditorState.IDLE;
    this._selectedTile = null;
    this._selectedCell = null; // { col, row, cellType? }
    this._brushSize = 1;
    this._showGrid = true;
    this._fillMode = false;
    this._panMode = false;
    this._eraserMode = false;

    // Drag-paint stroke batching for undo
    this._paintStroke = null; // Array of {col, row, cellType, oldBase, newBase} during drag
    this._eraseStroke = null; // Array of {col, row, cellType, oldBase, oldOverlays} during drag

    this._fillHighlight = null;
    this._fillHighlightTimer = null;
    this._hoveredCell = null;
    this._kbCursor = null;

    // Overlay state
    this._selectedOverlay = null; // overlay ID to place
    this._selectedCellOverlayIndex = -1; // which overlay in cell is selected for editing
    this._pendingSpecialOverlay = null; // pending text-label/scale-bar placement
    this._overlayFavorites = new Set();
    this._overlayRecent = [];

    // Realm Brew
    this._realmBrew = options.realmBrew || null;
    this._rbSubTheme = options.rbSubTheme || null;
    this._rbTilesLoaded = false;

    // Save state
    this._autoSaveTimer = null;
    this._saveDirty = false;

    // Sub-systems
    this._grid = null;
    this._camera = null;
    this._tileRenderer = null;
    this._overlayRenderer = null;
    this._themeManager = null;
    this._palette = null;
    this._input = null;
    this._animation = null;
    this._history = null;
    this._sound = null;
  }

  async init() {
    this._ctx = this._canvasEl.getContext('2d');

    // Load data
    this._themeManager = new ThemeManager();
    this._tileRenderer = new TileRenderer();
    this._overlayRenderer = new OverlayRenderer();
    this._overlayRenderer.onCachePopulated = () => { this._dirty = true; };
    await Promise.all([
      this._themeManager.load(),
      this._tileRenderer.load(),
      this._overlayRenderer.load()
    ]);

    // Apply theme
    this._themeManager.applyTheme(this._containerEl, this._themeId);

    // Set transition mode from theme
    const theme = this._themeManager.getTheme(this._themeId);
    if (theme && theme.transitionMode) {
      this._tileRenderer.setTransitionMode(theme.transitionMode);
    }

    // Create grid using factory
    const config = getGridConfig(this._shape, this._sizeKey);
    this._grid = Grid.create(this._shape, config.cols, config.rows, config.cellSize);

    // Restore saved cell data if loading a saved map
    if (this._savedCells) {
      StorageManager.deserializeIntoGrid(this._grid, this._savedCells);
      this._savedCells = null;
    }

    // Camera
    this._camera = new Camera();

    // Restore saved camera position
    if (this._savedCamera) {
      this._camera.offsetX = this._savedCamera.offsetX || 0;
      this._camera.offsetY = this._savedCamera.offsetY || 0;
      this._camera.zoom = this._savedCamera.zoom || 1.0;
      this._savedCamera = null;
    }

    // Animation manager
    this._animation = new AnimationManager();

    // History (undo/redo)
    this._history = new HistoryManager();
    this._history.onStateChange = (canUndo, canRedo) => {
      const undoBtn = document.getElementById('btn-undo');
      const redoBtn = document.getElementById('btn-redo');
      if (undoBtn) undoBtn.disabled = !canUndo;
      if (redoBtn) redoBtn.disabled = !canRedo;
    };

    // Sound effects
    this._sound = new SoundManager();
    this._sound.init();

    // Apply settings defaults
    if (this._settingsManager) {
      const s = this._settingsManager.getAll();
      // Sound preference from settings
      if (s.soundEnabled && !this._sound.enabled) {
        this._sound.enabled = true;
      }
      // Grid lines default from settings
      if (s.gridLines === false) {
        this._showGrid = false;
      }
    }

    // Palette
    const tileIds = this._themeManager.getAvailableTiles(this._themeId);
    this._palette = new Palette(this._paletteEl, this._tileRenderer, (tileId) => {
      this._selectedTile = tileId;
      this._selectedOverlay = null;
      this._selectedCell = null;
      this._selectedCellOverlayIndex = -1;
      this._clearOverlaySelection();
      this._updatePropertiesPanel();
      this._state = this._fillMode ? EditorState.FILL_MODE : EditorState.TILE_SELECTED;
      this._dirty = true;
      this._updateCursor();
    }, this._shape);
    this._palette.populate(tileIds);

    // Overlay palette
    this._initOverlayPalette();

    // Realm Brew tile loading (if dungeon + hex + available)
    if (this._rbSubTheme && this._realmBrew && this._realmBrew.available && this._shape === 'hex') {
      this._loadRealmBrewTiles(this._rbSubTheme);
    }

    // Realm Brew overlay packs
    if (this._realmBrew && this._realmBrew.available && this._themeId === 'dungeon') {
      this._initRealmBrewOverlays();
    }

    // Size canvas & fit grid
    this._resizeCanvas();
    this._fitGrid();

    // Input handler
    this._input = new InputHandler(this._canvasEl, {
      camera: this._camera,
      grid: this._grid,
      onCellTap: (col, row, cellType) => this._handleCellTap(col, row, cellType),
      onCellDrag: (col, row, cellType) => this._handleCellDrag(col, row, cellType),
      onKeyAction: (action) => this._handleKeyAction(action),
      onPan: (dx, dy) => this._handlePan(dx, dy),
      onPinchZoom: (newZoom, cx, cy) => this._handlePinchZoom(newZoom, cx, cy),
      onWheelZoom: (delta, cx, cy) => this._handleWheelZoom(delta, cx, cy),
      onHoverCell: (cell) => this._handleHoverCell(cell),
      onDragEnd: () => this._handleDragEnd()
    });

    // Toolbar
    this._bindToolbar();

    // Map name display
    const nameDisplay = document.getElementById('map-name-display');
    if (nameDisplay) nameDisplay.textContent = this._mapName;
    const printTitle = document.getElementById('print-title');
    if (printTitle) printTitle.textContent = this._mapName;

    // Edit name button
    const editNameBtn = document.getElementById('btn-edit-name');
    if (editNameBtn) {
      editNameBtn.addEventListener('click', () => this._promptRename());
    }

    // Save button
    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.saveMap();
        this._app.announce('Map saved');
        this._app.showToast('Map saved');
      });
    }

    // Export button
    const exportBtn = document.getElementById('btn-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this._openExportDialog());
    }

    // Cmd/Ctrl+S keyboard shortcut
    this._boundKeyboardSave = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        this.saveMap();
        this._app.announce('Map saved');
        this._app.showToast('Map saved');
      }
    };
    document.addEventListener('keydown', this._boundKeyboardSave);

    // Auto-save every 30 seconds (only if dirty and auto-save enabled) — silent, no screen reader announcement
    this._autoSaveTimer = setInterval(() => {
      if (!this._running) return;
      const autoSaveEnabled = this._settingsManager ? this._settingsManager.get('autoSave') !== false : true;
      if (this._saveDirty && this._storage && autoSaveEnabled) {
        this.saveMap();
      }
    }, 30000);

    // Map Life button initial state
    this._updateMapLifeUI();

    // Window resize
    this._boundResize = () => {
      this._resizeCanvas();
      this._tileRenderer.clearCache();
      if (this._realmBrew) this._realmBrew.clearResizeCache();
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
    if (this._input) { this._input.destroy(); this._input = null; }
    if (this._palette) { this._palette.destroy(); this._palette = null; }
    if (this._overlayRenderer) { this._overlayRenderer.destroy(); this._overlayRenderer = null; }
    if (this._animation) { this._animation.destroy(); this._animation = null; }
    if (this._realmBrew) {
      this._realmBrew.cancelTileLoad();
      this._realmBrew.clearResizeCache();
      if (this._rbSubTheme) this._realmBrew.unloadTileSet(this._rbSubTheme);
    }
    if (this._exportRafId) { cancelAnimationFrame(this._exportRafId); this._exportRafId = null; }
    if (this._autoSaveTimer) { clearInterval(this._autoSaveTimer); this._autoSaveTimer = null; }
    if (this._boundKeyboardSave) { document.removeEventListener('keydown', this._boundKeyboardSave); this._boundKeyboardSave = null; }
    if (this._overlaySearchTimer) { clearTimeout(this._overlaySearchTimer); this._overlaySearchTimer = null; }
    if (this._boundResize) window.removeEventListener('resize', this._boundResize);
    if (this._dprMql) this._dprMql.removeEventListener('change', this._boundDprChange);
    if (this._fillHighlightTimer) {
      clearTimeout(this._fillHighlightTimer);
      this._fillHighlightTimer = null;
    }
    if (this._history) { this._history.destroy(); this._history = null; }
    if (this._sound) { this._sound.destroy(); this._sound = null; }
    // Close any open modals to clean up their keydown trap handlers
    this._closeShortcuts();
    this._closeClearAllDialog();
    this._closeExportDialog();
    // Clean up export close timer
    if (this._exportCloseTimer) { clearTimeout(this._exportCloseTimer); this._exportCloseTimer = null; }
    // Clean up rename input if open
    if (this._renameInput) { this._renameInput.remove(); this._renameInput = null; }
  }

  /* ---- RAF Loop (single owner) ---- */
  _tick() {
    if (!this._running) return;

    const now = performance.now();

    // Animation frame lifecycle
    const dt = this._animation.beginFrame(now);

    // Advance camera animation
    if (this._camera.updateAnimation()) {
      this._dirty = true;
      this._animation.noteInteraction();
    }

    // Process dirty cells (budgeted re-cache)
    this._tileRenderer.processDirtyCells(this._grid, this._shape, this._grid.cellSize, 8);

    // Three-tier RAF: check if we should skip this frame
    const skipFrame = this._animation.shouldSkipFrame(now);

    // Determine if animations are making the scene dirty
    const animating = this._animation.isAnimating;
    if (animating) {
      this._dirty = true;
    }

    if (this._dirty && !skipFrame) {
      const renderStart = performance.now();
      this._render();
      this._dirty = false;
      const renderDuration = performance.now() - renderStart;
      this._animation.endFrame(renderDuration);
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
      this._tileRenderer.clearCache();
      if (this._realmBrew) this._realmBrew.clearResizeCache();
      this._dirty = true;
      this._dprMql.removeEventListener('change', this._boundDprChange);
      this._setupDprListener();
    };
    this._dprMql.addEventListener('change', this._boundDprChange);
  }

  _fitGrid() {
    const cw = this._containerEl.clientWidth;
    const ch = this._containerEl.clientHeight;
    this._camera.fitToGrid(this._grid.widthPx, this._grid.heightPx, cw, ch);
  }

  _canvasWidth() { return this._containerEl.clientWidth; }
  _canvasHeight() { return this._containerEl.clientHeight; }

  /* ---- Viewport Bounds for Culling ---- */
  _getViewportBounds() {
    const cw = this._canvasWidth();
    const ch = this._canvasHeight();
    const topLeft = this._camera.screenToWorld(0, 0);
    const bottomRight = this._camera.screenToWorld(cw, ch);
    return {
      minX: topLeft.x,
      minY: topLeft.y,
      maxX: bottomRight.x,
      maxY: bottomRight.y
    };
  }

  /* ---- Rendering ---- */
  _render() {
    const ctx = this._ctx;
    const dpr = this._dpr;
    const w = this._canvasEl.width;
    const h = this._canvasEl.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    this._camera.applyTransform(ctx);

    // Layer 1: Base tiles (atlas-cached, expensive)
    this._renderBaseTiles(ctx);

    // Layer 2: Animation overlay (lightweight per-frame draw)
    if (this._animation.showAnyAnimation) {
      this._renderAnimationLayer(ctx);
    }

    // Layer 2.5: Overlays (icons placed on cells)
    this._renderOverlays(ctx);

    // Layer 3: Grid lines
    if (this._showGrid) {
      const theme = this._themeManager.getTheme(this._themeId);
      const gridColor = theme ? theme.colors.grid : '#C8BFA9';
      this._grid.drawGridLines(ctx, gridColor);
    }

    // Layer 4: Selection highlight
    this._renderSelectionHighlight(ctx);

    // Keyboard cursor
    this._renderKeyboardCursor(ctx);

    // Fill highlight
    this._renderFillHighlight(ctx);

    // Hover highlight
    this._renderHoverHighlight(ctx);

    ctx.restore();

    // Coordinate display (drawn outside camera transform)
    this._renderCoordinateDisplay(ctx, dpr);
  }

  _renderBaseTiles(ctx) {
    const grid = this._grid;
    const cellSize = grid.cellSize;
    const shape = grid.shape;
    const viewport = this._getViewportBounds();

    grid.forEachCell((col, row, cell, cellType) => {
      if (!cell.base) return;

      // Viewport culling — skip cells outside visible area
      let cx, cy;
      if (shape === 'square') {
        cx = col * cellSize + cellSize / 2;
        cy = row * cellSize + cellSize / 2;
      } else {
        const center = grid.gridToPixel(col, row, cellType);
        cx = center.x;
        cy = center.y;
      }
      if (cx + cellSize < viewport.minX || cx - cellSize > viewport.maxX ||
          cy + cellSize < viewport.minY || cy - cellSize > viewport.maxY) {
        return;
      }

      // Realm Brew tile rendering
      if (Editor.isRealmBrewTile(cell.base) && this._realmBrew && this._rbTilesLoaded) {
        const rbInfo = Editor.parseRealmBrewTileId(cell.base);
        if (rbInfo && shape === 'hex') {
          const origin = grid.cellOrigin(col, row);
          const rbCanvas = this._realmBrew.getResizedTile(rbInfo.subTheme, rbInfo.filename, grid.hexW, grid.hexH);
          if (rbCanvas) {
            const path = grid.getCellPath(col, row, cellType);
            ctx.save();
            ctx.clip(path);
            const bleed = 1;
            ctx.drawImage(rbCanvas, origin.x - bleed, origin.y - bleed, grid.hexW + bleed * 2, grid.hexH + bleed * 2);
            ctx.restore();
          }
        }
        return;
      }

      // Get tile image from atlas (neighbor-aware for water)
      const img = this._tileRenderer.getTileImage(cell.base, shape, cellSize, grid, col, row, cellType);
      if (!img) return;

      if (shape === 'square') {
        const ox = col * cellSize;
        const oy = row * cellSize;
        ctx.drawImage(img.atlas, img.sx, img.sy, img.sw, img.sh, ox, oy, cellSize, cellSize);
      } else {
        // Clip to cell path for non-square shapes
        const path = grid.getCellPath(col, row, cellType);
        ctx.save();
        ctx.clip(path);

        // Draw tile image with 1px bleed on each side to prevent sub-pixel gaps
        // between adjacent cells. The clip path keeps the visual boundary sharp.
        const bleed = 1;

        if (shape === 'octagon' && cellType === 'sq') {
          const origin = grid.cellOrigin(col, row, 'sq');
          const sqSize = grid.sqSize;
          ctx.drawImage(img.atlas, img.sx, img.sy, img.sw, img.sh,
            origin.x - bleed, origin.y - bleed, sqSize + bleed * 2, sqSize + bleed * 2);
        } else if (shape === 'hex') {
          const origin = grid.cellOrigin(col, row);
          ctx.drawImage(img.atlas, img.sx, img.sy, img.sw, img.sh,
            origin.x - bleed, origin.y - bleed, grid.hexW + bleed * 2, grid.hexH + bleed * 2);
        } else if (shape === 'diamond') {
          const origin = grid.cellOrigin(col, row);
          ctx.drawImage(img.atlas, img.sx, img.sy, img.sw, img.sh,
            origin.x - bleed, origin.y - bleed, grid.dW + bleed * 2, grid.dH + bleed * 2);
        } else {
          // Octagon main cell
          const origin = grid.cellOrigin(col, row, cellType);
          ctx.drawImage(img.atlas, img.sx, img.sy, img.sw, img.sh,
            origin.x - bleed, origin.y - bleed, cellSize + bleed * 2, cellSize + bleed * 2);
        }

        ctx.restore();
      }
    });
  }

  /** Layer 2: Lightweight per-frame animation effects on all animated tiles */
  _renderAnimationLayer(ctx) {
    const grid = this._grid;
    const cellSize = grid.cellSize;
    const shape = grid.shape;
    const viewport = this._getViewportBounds();

    grid.forEachCell((col, row, cell, cellType) => {
      if (!cell.base) return;

      // Viewport culling
      let cx, cy;
      if (shape === 'square') {
        cx = col * cellSize + cellSize / 2;
        cy = row * cellSize + cellSize / 2;
      } else {
        const center = grid.gridToPixel(col, row, cellType);
        cx = center.x;
        cy = center.y;
      }
      if (cx + cellSize < viewport.minX || cx - cellSize > viewport.maxX ||
          cy + cellSize < viewport.minY || cy - cellSize > viewport.maxY) {
        return;
      }

      // Animation staggering
      if (!this._animation.shouldAnimateCell(col, row)) return;

      const isWater = isWaterTile(cell.base);
      const waterFx = isWater ? this._animation.getWaterEffects(cell.base, col, row) : null;
      const tileType = this._tileRenderer.getType(cell.base);
      // Water tiles without water effects (e.g. harbor) fall back to land effects
      const landFx = (!isWater || !waterFx) && tileType ? this._animation.getLandEffects(cell.base, tileType.pattern, col, row) : null;

      if (!waterFx && !landFx) return;

      // Get cell drawing bounds
      let ox, oy, drawW, drawH;
      if (shape === 'square') {
        ox = col * cellSize;
        oy = row * cellSize;
        drawW = cellSize;
        drawH = cellSize;
      } else {
        const origin = grid.cellOrigin(col, row, cellType);
        ox = origin.x;
        oy = origin.y;
        if (shape === 'hex') { drawW = grid.hexW; drawH = grid.hexH; }
        else if (shape === 'diamond') { drawW = grid.dW; drawH = grid.dH; }
        else if (shape === 'octagon' && cellType === 'sq') { drawW = grid.sqSize; drawH = grid.sqSize; }
        else { drawW = cellSize; drawH = cellSize; }
      }

      // Clip to cell for non-square shapes
      if (shape !== 'square') {
        ctx.save();
        const path = grid.getCellPath(col, row, cellType);
        ctx.clip(path);
      }

      try {
        if (waterFx) {
          this._drawWaterAnimation(ctx, cell.base, waterFx, ox, oy, drawW, drawH);
        } else if (landFx) {
          this._drawLandAnimation(ctx, landFx, ox, oy, drawW, drawH);
        }
      } finally {
        if (shape !== 'square') {
          ctx.restore();
        }
      }
    });
  }

  /** Draw per-frame water animation effects */
  _drawWaterAnimation(ctx, tileId, fx, x, y, w, h) {
    ctx.save();

    switch (tileId) {
      case 'ocean': {
        // Rolling wave highlight
        const waveY = y + h * 0.3 + fx.waveOffset;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, waveY);
        ctx.bezierCurveTo(
          x + w * 0.25, waveY - 3 * Math.sin(fx.wavePhase),
          x + w * 0.75, waveY + 3 * Math.cos(fx.wavePhase),
          x + w, waveY
        );
        ctx.stroke();

        // Second wave
        const wy2 = y + h * 0.65 + fx.waveOffset * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, wy2);
        ctx.bezierCurveTo(
          x + w * 0.3, wy2 + 2 * Math.sin(fx.wavePhase + 1),
          x + w * 0.7, wy2 - 2 * Math.cos(fx.wavePhase + 1),
          x + w, wy2
        );
        ctx.stroke();

        // Foam spray
        if (fx.foamAlpha > 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${fx.foamAlpha})`;
          const foamX = x + w * (0.3 + Math.sin(fx.wavePhase * 0.5) * 0.2);
          ctx.beginPath();
          ctx.ellipse(foamX, waveY - 1, 3, 1.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'shallow-water': {
        // Expanding ripple
        if (fx.rippleAlpha > 0.05) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${fx.rippleAlpha})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.arc(x + w * 0.4, y + h * 0.5, fx.rippleRadius, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Sparkles
        if (fx.sparkle) {
          const sp = fx.sparklePhase;
          ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + Math.sin(sp) * 0.2})`;
          ctx.beginPath();
          ctx.arc(x + w * (0.3 + Math.sin(sp * 0.7) * 0.2), y + h * (0.3 + Math.cos(sp * 0.5) * 0.2), 1.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x + w * (0.7 + Math.sin(sp * 0.9) * 0.15), y + h * (0.6 + Math.cos(sp * 0.6) * 0.15), 1, 0, Math.PI * 2);
          ctx.fill();
        }

        // Fish shadow
        if (fx.fishShadow) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
          ctx.beginPath();
          ctx.ellipse(x + w * 0.6, y + h * 0.7, 4, 1.5, 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'river': {
        // Flow lines moving with current
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 0.7;
        const flowY = (fx.flowOffset % h);
        for (let i = 0; i < 3; i++) {
          const ly = y + (flowY + i * h / 3) % h;
          const lx = x + w * (0.35 + i * 0.1);
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + (i - 1) * 2, ly + 6 * fx.currentStrength);
          ctx.stroke();
        }

        // Leaf particle
        if (fx.leafX >= 0) {
          ctx.fillStyle = 'rgba(76, 175, 80, 0.5)';
          const lx = x + w * 0.3 + (fx.leafX % (w * 0.4));
          const ly = y + h * 0.4 + fx.leafY;
          ctx.beginPath();
          ctx.ellipse(lx, ly, 2, 1, 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'lake': {
        // Ripple rings
        const alpha1 = Math.max(0, 1 - fx.rippleRadius1 / 20) * fx.rippleAlpha;
        if (alpha1 > 0.02) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha1})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.arc(x + w * 0.45, y + h * 0.4, fx.rippleRadius1, 0, Math.PI * 2);
          ctx.stroke();
        }
        const alpha2 = Math.max(0, 1 - fx.rippleRadius2 / 20) * fx.rippleAlpha;
        if (alpha2 > 0.02) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha2})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.arc(x + w * 0.6, y + h * 0.6, fx.rippleRadius2, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Fish leap
        if (fx.fishLeap) {
          ctx.fillStyle = 'rgba(100, 100, 100, 0.15)';
          ctx.beginPath();
          ctx.arc(x + w * 0.5, y + h * 0.3, 2, 0, Math.PI * 2);
          ctx.fill();
          // Splash rings
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.arc(x + w * 0.5, y + h * 0.3, 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }

      case 'swamp': {
        // Rising bubble
        if (fx.bubbleY >= 0 && fx.bubbleAlpha > 0.05) {
          ctx.fillStyle = `rgba(200, 200, 150, ${fx.bubbleAlpha})`;
          const by = y + h - fx.bubbleY * (h / 15);
          ctx.beginPath();
          ctx.arc(x + w * 0.4, by, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Reed sway
        if (Math.abs(fx.reedSway) > 0.1) {
          ctx.strokeStyle = 'rgba(51, 105, 30, 0.3)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + w * 0.3, y + h * 0.8);
          ctx.lineTo(x + w * 0.3 + fx.reedSway, y + h * 0.5);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + w * 0.7, y + h * 0.75);
          ctx.lineTo(x + w * 0.7 + fx.reedSway * 0.8, y + h * 0.45);
          ctx.stroke();
        }

        // Dragonfly
        if (fx.dragonfly) {
          ctx.fillStyle = 'rgba(0, 150, 136, 0.4)';
          const t = this._animation.animationTime;
          const dx = x + w * (0.3 + Math.sin(t * 3) * 0.3);
          const dy = y + h * (0.2 + Math.cos(t * 2) * 0.15);
          ctx.beginPath();
          ctx.ellipse(dx, dy, 2, 0.8, t * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'wide-river':
      case 'stream': {
        // Flow lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 0.7;
        const flowY = (fx.flowOffset % h);
        for (let i = 0; i < 3; i++) {
          const ly = y + (flowY + i * h / 3) % h;
          const lx = x + w * (0.3 + i * 0.15);
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + (i - 1) * 2, ly + 6 * (fx.currentStrength || 0.4));
          ctx.stroke();
        }
        // Sparkle for stream
        if (fx.sparkle && fx.sparklePhase !== undefined) {
          const sp = fx.sparklePhase;
          ctx.fillStyle = `rgba(255, 255, 255, ${0.25 + Math.sin(sp) * 0.15})`;
          ctx.beginPath();
          ctx.arc(x + w * (0.4 + Math.sin(sp * 0.7) * 0.15), y + h * (0.4 + Math.cos(sp * 0.5) * 0.15), 1, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'pond': {
        // Expanding ripple
        if (fx.rippleAlpha > 0.03) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${fx.rippleAlpha})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.arc(x + w * 0.5, y + h * 0.5, fx.rippleRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (fx.sparkle) {
          const sp = fx.sparklePhase;
          ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + Math.sin(sp) * 0.15})`;
          ctx.beginPath();
          ctx.arc(x + w * (0.4 + Math.sin(sp * 0.6) * 0.15), y + h * (0.4 + Math.cos(sp * 0.4) * 0.1), 1, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'rapids': {
        // Turbulent flow
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        const rFlow = (fx.flowOffset % h);
        for (let i = 0; i < 4; i++) {
          const ly = y + (rFlow + i * h / 4) % h;
          ctx.beginPath();
          ctx.moveTo(x + w * 0.2, ly);
          ctx.bezierCurveTo(x + w * 0.35, ly + fx.foamShift, x + w * 0.65, ly - fx.foamShift, x + w * 0.8, ly);
          ctx.stroke();
        }
        // Splash particles
        if (fx.splashAlpha > 0.05) {
          ctx.fillStyle = `rgba(255, 255, 255, ${fx.splashAlpha})`;
          ctx.beginPath();
          ctx.arc(x + w * 0.4, y + h * 0.3, 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x + w * 0.6, y + h * 0.6, 1, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'waterfall': {
        // Vertical fall streaks
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 0.8;
        const fallOff = fx.fallOffset % h;
        for (let i = 0; i < 3; i++) {
          const lx = x + w * (0.35 + i * 0.15);
          const ly = y + (fallOff + i * h / 3) % h;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.lineTo(lx + Math.sin(fx.fallOffset * 0.7 + i * 1.3) * 2, ly + 8);
          ctx.stroke();
        }
        // Mist
        if (fx.mistAlpha > 0.02) {
          ctx.fillStyle = `rgba(255, 255, 255, ${fx.mistAlpha})`;
          ctx.beginPath();
          ctx.ellipse(x + w * 0.5, y + h * 0.8, w * 0.3, h * 0.08, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      case 'hot-spring': {
        // Steam rising
        if (fx.steamY >= 0 && fx.steamAlpha > 0.03) {
          ctx.fillStyle = `rgba(255, 255, 255, ${fx.steamAlpha})`;
          const sy = y + h * 0.3 - fx.steamY * (h / 30);
          ctx.beginPath();
          ctx.ellipse(x + w * 0.45, sy, 3, 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(x + w * 0.6, sy + 3, 2, 1.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Ripple
        if (fx.rippleAlpha > 0.03) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${fx.rippleAlpha})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.arc(x + w * 0.5, y + h * 0.5, fx.rippleRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }

      case 'mangrove': {
        // Water ripple beneath roots
        if (fx.rippleAlpha > 0.03) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${fx.rippleAlpha})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.arc(x + w * 0.5, y + h * 0.7, fx.rippleRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Water drip
        if (fx.dripY >= 0 && fx.dripAlpha > 0.03) {
          ctx.fillStyle = `rgba(100, 180, 220, ${fx.dripAlpha})`;
          const dy = y + h * 0.4 + fx.dripY * (h / 20);
          ctx.beginPath();
          ctx.arc(x + w * 0.4, dy, 1, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }

      default: {
        // Generic water animation: ripple + sparkle fallback for delta, reef,
        // tidal-pool, ocean-inlet, continental-shelf, oasis
        if (fx.rippleRadius !== undefined && fx.rippleAlpha > 0.03) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${fx.rippleAlpha})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.arc(x + w * 0.5, y + h * 0.5, fx.rippleRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (fx.waveOffset !== undefined) {
          const wy = y + h * 0.4 + fx.waveOffset;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, wy);
          ctx.quadraticCurveTo(x + w * 0.5, wy - 2, x + w, wy);
          ctx.stroke();
        }
        if (fx.sparkle && fx.sparklePhase !== undefined) {
          const sp = fx.sparklePhase;
          ctx.fillStyle = `rgba(255, 255, 255, ${0.2 + Math.sin(sp) * 0.15})`;
          ctx.beginPath();
          ctx.arc(x + w * (0.35 + Math.sin(sp * 0.6) * 0.2), y + h * (0.4 + Math.cos(sp * 0.4) * 0.15), 1, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
    }

    ctx.restore();
  }

  /** Draw per-frame land animation effects */
  _drawLandAnimation(ctx, fx, x, y, w, h) {
    ctx.save();

    if (fx.type === 'wind') {
      // Grass/wheat wind sway — animated highlight strokes
      const sway = fx.windSway;
      const phase = fx.windPhase;

      // Swaying highlight lines (simulates grass movement)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const ly = y + h * (0.3 + i * 0.2);
        const offset = Math.sin(phase + i * 0.8) * sway;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.1, ly);
        ctx.quadraticCurveTo(x + w * 0.5 + offset, ly - 2, x + w * 0.9, ly);
        ctx.stroke();
      }

      // Wind gust overlay
      if (fx.gustAlpha > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${fx.gustAlpha * 0.15})`;
        const gustX = x + w * (0.2 + Math.sin(phase * 0.3) * 0.3);
        ctx.beginPath();
        ctx.ellipse(gustX, y + h * 0.4, w * 0.3, h * 0.15, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Farm animals — small colored shapes (farmland only)
      if (fx.animalShadow) {
        const t = this._animation.animationTime;
        const kind = Math.floor((t * 0.2 + (x + y) * 0.01) % 3);
        const ax = x + w * (0.3 + Math.sin(t * 0.5) * 0.15);
        const ay = y + h * (0.55 + Math.cos(t * 0.4) * 0.08);

        // 1px dark outline for visibility on varied backgrounds
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';

        if (kind === 0) {
          // Chicken — white/brown body with red comb
          ctx.fillStyle = (t * 0.3 + x) % 2 > 1 ? '#F5F5F0' : '#8D6E63';
          ctx.beginPath();
          ctx.ellipse(ax, ay, 1.8, 1.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Red comb
          ctx.fillStyle = '#D32F2F';
          ctx.beginPath();
          ctx.arc(ax + 1.5, ay - 1, 0.6, 0, Math.PI * 2);
          ctx.fill();
        } else if (kind === 1) {
          // Cow — black/white patches
          ctx.fillStyle = '#F5F5F5';
          ctx.beginPath();
          ctx.ellipse(ax, ay, 4, 2.2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Black patches
          ctx.fillStyle = '#212121';
          ctx.beginPath();
          ctx.ellipse(ax - 1.5, ay - 0.5, 1.5, 1, 0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(ax + 1, ay + 0.5, 1.2, 0.8, -0.2, 0, Math.PI * 2);
          ctx.fill();
          // Head
          ctx.fillStyle = '#F5F5F5';
          ctx.beginPath();
          ctx.arc(ax + 3.5, ay - 0.3, 1.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          // Pig — pink oval
          ctx.fillStyle = '#F8BBD0';
          ctx.beginPath();
          ctx.ellipse(ax, ay, 2.8, 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Snout
          ctx.fillStyle = '#F48FB1';
          ctx.beginPath();
          ctx.arc(ax + 2, ay, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (fx.type === 'forest') {
      // Tree canopy rustle
      const sway = fx.rustleSway;
      const lightShift = fx.dappleLightShift;

      // Dappled light shift
      ctx.fillStyle = 'rgba(255, 255, 200, 0.06)';
      ctx.beginPath();
      ctx.ellipse(
        x + w * 0.4 + lightShift,
        y + h * 0.5 + lightShift * 0.5,
        w * 0.15, h * 0.1, 0, 0, Math.PI * 2
      );
      ctx.fill();

      // Canopy edge sway
      ctx.strokeStyle = 'rgba(0, 80, 0, 0.06)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + w * 0.2, y + h * 0.2);
      ctx.quadraticCurveTo(x + w * 0.5 + sway, y + h * 0.15, x + w * 0.8, y + h * 0.2);
      ctx.stroke();

      // Falling leaf
      if (fx.leafFall) {
        const t = this._animation.animationTime;
        const leafX = x + w * (0.3 + Math.sin(t * 4) * 0.2);
        const leafY = y + h * ((t * 0.5) % 1);
        ctx.fillStyle = 'rgba(139, 195, 74, 0.4)';
        ctx.beginPath();
        ctx.ellipse(leafX, leafY, 1.5, 0.8, t * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rain curtain (rainforest)
      if (fx.rainCurtain) {
        const rp = fx.rainPhase;
        ctx.strokeStyle = 'rgba(150, 200, 255, 0.08)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < 4; i++) {
          const rx = x + w * (0.1 + i * 0.25) + Math.sin(rp + i) * 1;
          const ry = y + ((rp * 3 + i * 7) % h);
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 0.5, ry + 3);
          ctx.stroke();
        }
      }
    } else if (fx.type === 'constructed') {
      const t = this._animation.animationTime;

      // Road/bridge/town dust
      if (fx.trafficDust) {
        ctx.fillStyle = 'rgba(160, 140, 120, 0.1)';
        const dustX = x + w * (0.3 + Math.sin(t * 2) * 0.2);
        const dustY = y + h * 0.6;
        ctx.beginPath();
        ctx.ellipse(dustX, dustY, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Flag flutter (camp, fortification)
      if (fx.flagFlutter) {
        ctx.strokeStyle = 'rgba(180, 30, 30, 0.3)';
        ctx.lineWidth = 1;
        const flagX = x + w * 0.7;
        const flagY = y + h * 0.15;
        ctx.beginPath();
        ctx.moveTo(flagX, flagY);
        ctx.quadraticCurveTo(flagX + 3 + fx.flagFlutter, flagY + 2, flagX + 6, flagY + 1);
        ctx.stroke();
      }

      // Smoke rising (camp, town)
      if (fx.smokeRise) {
        const sp = fx.smokePhase;
        const smokeProgress = (sp % 4) / 4;
        ctx.fillStyle = `rgba(180, 180, 180, ${Math.max(0, 0.15 - smokeProgress * 0.15)})`;
        const smokeX = x + w * 0.5 + Math.sin(sp) * 2;
        const smokeY = y + h * (0.3 - smokeProgress * 0.2);
        ctx.beginPath();
        ctx.arc(smokeX, smokeY, 1 + smokeProgress * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Sentry pacing (fortification, trench)
      if (fx.sentryPace) {
        const sp = fx.sentryPhase;
        const sx = x + w * (0.3 + Math.sin(sp) * 0.15);
        const sy = y + h * 0.5;
        ctx.fillStyle = 'rgba(60, 60, 60, 0.12)';
        ctx.beginPath();
        ctx.ellipse(sx, sy, 1.5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Boat rocking (harbor)
      if (fx.boatRock) {
        const bx = x + w * 0.65;
        const by = y + h * 0.5 + Math.sin(t * 1.5) * 1;
        ctx.fillStyle = 'rgba(120, 80, 40, 0.2)';
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(Math.sin(t * 1.5) * 0.1);
        ctx.fillRect(-3, -1, 6, 2);
        ctx.restore();
      }

      // Water wave (harbor)
      if (fx.waveOffset) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 0.8;
        const wy = y + h * 0.7 + fx.waveOffset;
        ctx.beginPath();
        ctx.moveTo(x, wy);
        ctx.quadraticCurveTo(x + w * 0.5, wy - 1, x + w, wy);
        ctx.stroke();
      }
    } else if (fx.type === 'dust') {
      // Floating dust motes
      if (fx.dustMoteX >= 0 && fx.dustAlpha > 0.02) {
        ctx.fillStyle = `rgba(180, 160, 130, ${fx.dustAlpha})`;
        const moteX = x + (fx.dustMoteX % w);
        const moteY = y + h * 0.4 + fx.dustMoteY;
        ctx.beginPath();
        ctx.arc(moteX, moteY, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + ((fx.dustMoteX + 20) % w), moteY + 5, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (fx.type === 'heat') {
      // Heat shimmer — subtle wavy distortion line
      if (fx.shimmerAlpha > 0.02) {
        ctx.strokeStyle = `rgba(255, 200, 100, ${fx.shimmerAlpha})`;
        ctx.lineWidth = w * 0.8;
        ctx.beginPath();
        ctx.moveTo(x, y + h * 0.5 + fx.shimmerOffset);
        ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.5 - fx.shimmerOffset, x + w, y + h * 0.5 + fx.shimmerOffset);
        ctx.stroke();
      }
    } else if (fx.type === 'elevation') {
      // Hills and mountains — cloud shadows, wind sway, livestock/hawk
      // Cloud shadow drift
      if (fx.cloudShadowAlpha > 0.01) {
        const shadowCx = x + w * (0.5 + fx.cloudShadowX);
        ctx.fillStyle = `rgba(0, 0, 0, ${fx.cloudShadowAlpha})`;
        ctx.beginPath();
        ctx.ellipse(shadowCx, y + h * 0.45, w * 0.35, h * 0.2, 0.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Wind sway on grass (hills only)
      if (Math.abs(fx.windSway) > 0.1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 2; i++) {
          const ly = y + h * (0.55 + i * 0.2);
          const offset = Math.sin(fx.windPhase + i * 0.8) * fx.windSway;
          ctx.beginPath();
          ctx.moveTo(x + w * 0.15, ly);
          ctx.quadraticCurveTo(x + w * 0.5 + offset, ly - 1.5, x + w * 0.85, ly);
          ctx.stroke();
        }
      }

      // Livestock — small colored shapes (goats/sheep on hills)
      if (fx.livestockShadow) {
        const t = this._animation.animationTime;
        const kind = Math.floor((t * 0.3 + (x + y) * 0.01) % 2);
        const lx = x + w * (0.25 + Math.sin(t * 0.8) * 0.2);
        const ly = y + h * (0.6 + Math.cos(t * 0.6) * 0.1);

        ctx.lineWidth = 0.8;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';

        if (kind === 0) {
          // Goat — gray/brown body with small horns
          ctx.fillStyle = '#8D6E63';
          ctx.beginPath();
          ctx.ellipse(lx, ly, 3, 1.8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Head
          ctx.fillStyle = '#795548';
          ctx.beginPath();
          ctx.arc(lx + 2.5, ly - 0.8, 1, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Tiny horns
          ctx.strokeStyle = '#A1887F';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(lx + 2.5, ly - 1.8);
          ctx.lineTo(lx + 2, ly - 2.5);
          ctx.moveTo(lx + 2.5, ly - 1.8);
          ctx.lineTo(lx + 3, ly - 2.5);
          ctx.stroke();
        } else {
          // Sheep — white fluffy oval with dark face
          ctx.fillStyle = '#F5F5F0';
          ctx.beginPath();
          ctx.ellipse(lx, ly, 3.5, 2.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          // Dark face
          ctx.fillStyle = '#3E2723';
          ctx.beginPath();
          ctx.arc(lx + 3, ly - 0.3, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Hawk circling shadow (mountains)
      if (fx.hawkShadow) {
        const t = this._animation.animationTime;
        const angle = t * 1.2;
        const hx = x + w * 0.5 + Math.cos(angle) * w * 0.25;
        const hy = y + h * 0.4 + Math.sin(angle) * h * 0.2;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.beginPath();
        // Bird silhouette — V-shaped wings
        ctx.moveTo(hx - 4, hy + 0.5);
        ctx.lineTo(hx - 1, hy - 1);
        ctx.lineTo(hx, hy);
        ctx.lineTo(hx + 1, hy - 1);
        ctx.lineTo(hx + 4, hy + 0.5);
        ctx.lineTo(hx, hy + 1);
        ctx.closePath();
        ctx.fill();
      }
    } else if (fx.type === 'coastal') {
      // Wave lap at beach/bluff
      if (Math.abs(fx.waveLap) > 0.1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1.2;
        const wy = y + h * 0.72 + fx.waveLap;
        ctx.beginPath();
        ctx.moveTo(x, wy);
        ctx.quadraticCurveTo(x + w * 0.5, wy - 1.5, x + w, wy);
        ctx.stroke();
      }
      // Seagull shadow
      if (fx.seagullShadow) {
        const t = this._animation.animationTime;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        const gx = x + w * (0.2 + Math.sin(t * 1.5) * 0.3);
        const gy = y + h * (0.3 + Math.cos(t * 1.2) * 0.15);
        ctx.beginPath();
        ctx.moveTo(gx - 3, gy);
        ctx.lineTo(gx, gy - 1);
        ctx.lineTo(gx + 3, gy);
        ctx.lineTo(gx, gy + 0.5);
        ctx.closePath();
        ctx.fill();
      }
    } else if (fx.type === 'arctic') {
      // Snow drift
      if (fx.snowDriftX >= 0 && fx.snowDriftAlpha > 0.01) {
        ctx.fillStyle = `rgba(255, 255, 255, ${fx.snowDriftAlpha})`;
        const dx = x + (fx.snowDriftX % w);
        ctx.beginPath();
        ctx.ellipse(dx, y + h * 0.3, w * 0.15, h * 0.06, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + ((fx.snowDriftX + 15) % w), y + h * 0.6, w * 0.1, h * 0.04, -0.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ice sparkle
      if (fx.iceSparkle) {
        const t = this._animation.animationTime;
        const sp = fx.sparklePhase;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for (let i = 0; i < 3; i++) {
          const alpha = Math.max(0, Math.sin(sp + i * 2.1));
          if (alpha > 0.7) {
            ctx.globalAlpha = alpha * 0.5;
            const sx = x + w * (0.2 + Math.sin(sp * 0.3 + i * 1.7) * 0.3);
            const sy = y + h * (0.2 + Math.cos(sp * 0.4 + i * 2.3) * 0.3);
            ctx.beginPath();
            ctx.arc(sx, sy, 0.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
      }

      // Aurora shimmer (ice cave)
      if (fx.auroraShimmer) {
        const ap = fx.auroraPhase;
        const hue = (ap * 60) % 360;
        ctx.fillStyle = `hsla(${hue}, 60%, 50%, 0.04)`;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = `hsla(${(hue + 120) % 360}, 60%, 50%, 0.03)`;
        ctx.fillRect(x, y + h * 0.3, w, h * 0.4);
      }

      // Crack propagation (frozen water)
      if (fx.crackPropagation) {
        const t = this._animation.animationTime;
        ctx.strokeStyle = 'rgba(100, 150, 200, 0.15)';
        ctx.lineWidth = 0.5;
        const cx = x + w * 0.5;
        const cy = y + h * 0.5;
        const len = w * 0.3 * Math.min(1, (t % 3) / 1.5);
        const angle = Math.floor(t * 0.5) * 1.2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
        ctx.stroke();
      }
    } else if (fx.type === 'scree') {
      // Rock tumble animation
      if (fx.rockTumble) {
        const tp = fx.tumblePhase;
        ctx.fillStyle = 'rgba(120, 120, 120, 0.3)';
        const progress = (tp % 2) / 2;
        const rx = x + w * (0.3 + progress * 0.4);
        const ry = y + h * (0.2 + progress * 0.6);
        ctx.beginPath();
        ctx.ellipse(rx, ry, 1.5, 1, tp * 3, 0, Math.PI * 2);
        ctx.fill();
        // Dust trail
        ctx.fillStyle = 'rgba(180, 170, 160, 0.1)';
        ctx.beginPath();
        ctx.ellipse(rx - 3, ry - 2, 3, 1.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (fx.type === 'dungeon') {
      // Torch flicker — warm glow pulsing
      if (Math.abs(fx.torchFlicker) > 0.1) {
        const intensity = (fx.torchFlicker + 1) * 0.5; // normalize 0–1
        ctx.fillStyle = `rgba(255, 160, 50, ${intensity * 0.04})`;
        ctx.fillRect(x, y, w, h);
      }

      // Dust motes floating
      if (fx.dustMote) {
        const dp = fx.dustPhase;
        ctx.fillStyle = 'rgba(200, 180, 150, 0.15)';
        for (let i = 0; i < 2; i++) {
          const mx = x + w * (0.3 + Math.sin(dp + i * 2.5) * 0.2);
          const my = y + h * (0.2 + ((dp * 0.3 + i * 0.5) % 1) * 0.6);
          ctx.beginPath();
          ctx.arc(mx, my, 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Dripping water
      if (fx.dripping) {
        const dp = fx.dripPhase;
        const dripProgress = (dp % 2) / 2;
        ctx.fillStyle = `rgba(150, 200, 255, ${(1 - dripProgress) * 0.3})`;
        const dx = x + w * 0.4;
        const dy = y + dripProgress * h * 0.4;
        ctx.beginPath();
        ctx.ellipse(dx, dy, 0.8, 1.2 + dripProgress, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Bubbles (underground river / sewer)
      if (fx.bubbleY >= 0 && fx.bubbleAlpha > 0.02) {
        ctx.strokeStyle = `rgba(150, 200, 255, ${fx.bubbleAlpha})`;
        ctx.lineWidth = 0.5;
        const by = y + h - fx.bubbleY;
        ctx.beginPath();
        ctx.arc(x + w * 0.5, by, 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Rat scurrying
      if (fx.ratScurry) {
        const t = this._animation.animationTime;
        ctx.fillStyle = 'rgba(80, 60, 40, 0.15)';
        const ratX = x + w * ((t * 2 + (x + y) * 0.01) % 1);
        const ratY = y + h * 0.8;
        ctx.beginPath();
        ctx.ellipse(ratX, ratY, 2, 1, 0, 0, Math.PI * 2);
        ctx.fill();
        // Tail
        ctx.strokeStyle = 'rgba(80, 60, 40, 0.1)';
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.moveTo(ratX - 2, ratY);
        ctx.quadraticCurveTo(ratX - 4, ratY - 1, ratX - 5, ratY + 0.5);
        ctx.stroke();
      }
    } else if (fx.type === 'space') {
      const t = this._animation.animationTime;

      // Star twinkle — subtle brightness variation on background stars
      if (fx.starTwinkle) {
        const tp = fx.twinklePhase;
        const twinkleAlpha = Math.abs(Math.sin(tp)) * 0.15;
        if (twinkleAlpha > 0.02) {
          ctx.fillStyle = `rgba(255, 255, 255, ${twinkleAlpha})`;
          // A few twinkling points
          for (let i = 0; i < 3; i++) {
            const sx = x + w * (0.2 + i * 0.3);
            const sy = y + h * (0.3 + Math.sin(tp + i * 2) * 0.2);
            ctx.beginPath();
            ctx.arc(sx, sy, 0.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // Nebula swirl — gentle hue shift overlay
      if (fx.nebulaSwirl && Math.abs(fx.swirlHueShift) > 0.01) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.abs(fx.swirlHueShift) * 0.5})`;
        ctx.beginPath();
        ctx.ellipse(x + w * 0.5, y + h * 0.5, w * 0.3, h * 0.25, t * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Accretion disk rotation (black hole)
      if (fx.accretionRotation) {
        ctx.strokeStyle = `rgba(255, 180, 50, ${(fx.diskGlow || 1) * 0.15})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(x + w * 0.5, y + h * 0.5, w * 0.32, h * 0.12,
          fx.accretionRotation, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Wormhole spiral rotation
      if (fx.spiralRotation) {
        const cx2 = x + w * 0.5;
        const cy2 = y + h * 0.5;
        ctx.strokeStyle = 'rgba(180, 130, 255, 0.1)';
        ctx.lineWidth = 0.8;
        for (let ring = 0; ring < 3; ring++) {
          const r = w * (0.08 + ring * 0.06);
          ctx.beginPath();
          ctx.arc(cx2, cy2, r, fx.spiralRotation + ring, fx.spiralRotation + ring + Math.PI * 1.2);
          ctx.stroke();
        }
      }

      // Corona pulse (stars)
      if (fx.coronaPulse && fx.coronaPulse !== 1) {
        const pulse = (fx.coronaPulse - 0.9) * 3;
        ctx.fillStyle = `rgba(255, 255, 200, ${Math.abs(pulse) * 0.08})`;
        ctx.beginPath();
        ctx.arc(x + w * 0.5, y + h * 0.5, w * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }

      // Asteroid tumble — gentle rotation of a small rock shape
      if (fx.asteroidTumble) {
        ctx.fillStyle = 'rgba(150, 150, 150, 0.1)';
        ctx.save();
        ctx.translate(x + w * 0.6, y + h * 0.4);
        ctx.rotate(fx.tumbleAngle);
        ctx.fillRect(-2, -1.5, 4, 3);
        ctx.restore();
      }

      // Planet surface shift — subtle texture drift
      if (fx.surfaceShift) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.abs(fx.surfaceShift) * 0.03})`;
        ctx.beginPath();
        ctx.arc(x + w * 0.45 + fx.surfaceShift, y + h * 0.5, w * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }

      // Wormhole pulse scale
      if (fx.pulseScale && fx.pulseScale !== 1) {
        const scaleAlpha = Math.abs(fx.pulseScale - 1) * 1.5;
        ctx.strokeStyle = `rgba(180, 130, 255, ${scaleAlpha * 0.15})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(x + w * 0.5, y + h * 0.5, w * 0.2 * fx.pulseScale, 0, Math.PI * 2);
        ctx.stroke();
      }

    } else if (fx.type === 'volcanic') {
      const t = this._animation.animationTime;

      // Lava glow pulse — ambient red-orange glow variation
      if (fx.glowPulse !== 1) {
        const glow = (fx.glowPulse - 0.85) * 3;
        ctx.fillStyle = `rgba(255, 100, 20, ${Math.abs(glow) * 0.08})`;
        ctx.fillRect(x, y, w, h);
      }

      // Lava flow movement
      if (fx.flowMovement) {
        ctx.strokeStyle = 'rgba(255, 200, 50, 0.08)';
        ctx.lineWidth = 1;
        const flowY = y + h * 0.5 + Math.sin(t * 0.8) * 2;
        const offset = fx.flowMovement % w;
        ctx.beginPath();
        ctx.moveTo(x, flowY);
        ctx.quadraticCurveTo(x + w * 0.5 + offset * 0.1, flowY - 2, x + w, flowY);
        ctx.stroke();
      }

      // Smoke wisps
      if (fx.smokeWisp) {
        const sp = fx.smokePhase;
        const smokeProgress = (sp % 5) / 5;
        ctx.fillStyle = `rgba(100, 100, 100, ${Math.max(0, 0.1 - smokeProgress * 0.1)})`;
        const smokeX = x + w * (0.4 + Math.sin(sp * 0.5) * 0.15);
        const smokeY = y + h * (0.3 - smokeProgress * 0.25);
        ctx.beginPath();
        ctx.arc(smokeX, smokeY, 1.5 + smokeProgress * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Floating embers
      if (fx.emberFloat) {
        ctx.fillStyle = 'rgba(255, 150, 30, 0.2)';
        for (let i = 0; i < 2; i++) {
          const ex = x + w * (0.3 + i * 0.4) + Math.sin(t * 2 + i) * 3;
          const ey = y + h * (0.6 - ((t * 8 + i * 5) % (h * 0.5)) / (h * 0.5) * 0.5);
          ctx.beginPath();
          ctx.arc(ex, ey, 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

    } else if (fx.type === 'battlefield') {
      // Mud bubbles
      if (fx.mudBubble) {
        const bp = fx.bubblePhase;
        const bubbleProgress = (bp % 3) / 3;
        const ba = Math.max(0, 1 - bubbleProgress) * 0.2;
        if (ba > 0.02) {
          ctx.strokeStyle = `rgba(100, 80, 60, ${ba})`;
          ctx.lineWidth = 0.5;
          const bx = x + w * (0.4 + Math.sin(bp * 0.7) * 0.15);
          const by = y + h * 0.5;
          const br = 1 + bubbleProgress * 2;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Gentle current flow (moat/dam)
      if (fx.currentFlow) {
        const fp = fx.flowPhase;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 0.8;
        for (let i = 0; i < 2; i++) {
          const fy = y + h * (0.35 + i * 0.3);
          const offset = Math.sin(fp + i * 1.5) * 2;
          ctx.beginPath();
          ctx.moveTo(x, fy);
          ctx.quadraticCurveTo(x + w * 0.5 + offset, fy - 1, x + w, fy);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  _renderSelectionHighlight(ctx) {
    if (!this._selectedCell) return;
    const { col, row, cellType } = this._selectedCell;
    const path = this._grid.getCellPath(col, row, cellType);
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 3;
    ctx.stroke(path);
  }

  _renderKeyboardCursor(ctx) {
    if (!this._kbCursor) return;
    const { col, row, cellType } = this._kbCursor;
    const path = this._grid.getCellPath(col, row, cellType);
    // Dashed outline to distinguish from selection
    ctx.save();
    ctx.strokeStyle = '#FF9800';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.stroke(path);
    ctx.setLineDash([]);
    ctx.restore();
  }

  _renderFillHighlight(ctx) {
    if (!this._fillHighlight) return;
    ctx.fillStyle = 'rgba(255, 235, 59, 0.3)';
    for (const cell of this._fillHighlight) {
      const path = this._grid.getCellPath(cell.col, cell.row, cell.cellType);
      ctx.fill(path);
    }
  }

  _renderHoverHighlight(ctx) {
    if (!this._hoveredCell || this._selectedCell) return;
    const { col, row, cellType } = this._hoveredCell;
    const path = this._grid.getCellPath(col, row, cellType);
    ctx.strokeStyle = 'rgba(74, 124, 89, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke(path);
  }

  _renderCoordinateDisplay(ctx, dpr) {
    if (!this._hoveredCell) return;
    const { col, row, cellType } = this._hoveredCell;
    let label = `(${col}, ${row})`;
    if (cellType === 'sq') label = `(${col}, ${row}) sq`;

    const coordEl = document.getElementById('coord-display');
    if (coordEl) coordEl.textContent = label;
  }

  /* ---- Toolbar ---- */
  _bindToolbar() {
    const backBtn = document.getElementById('btn-editor-back');
    if (backBtn) backBtn.addEventListener('click', () => this._app.showScreen('title'));

    const gridBtn = document.getElementById('btn-grid-toggle');
    if (gridBtn) {
      gridBtn.addEventListener('click', () => this._toggleGrid());
    }

    const fillBtn = document.getElementById('btn-fill-tool');
    if (fillBtn) fillBtn.addEventListener('click', () => this._toggleFillMode());

    const panBtn = document.getElementById('btn-pan-mode');
    if (panBtn) panBtn.addEventListener('click', () => this._togglePanMode());

    const mapLifeBtn = document.getElementById('btn-map-life');
    if (mapLifeBtn) mapLifeBtn.addEventListener('click', () => this._cycleMapLife());

    const zoomInBtn = document.getElementById('btn-zoom-in');
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => {
      this._camera.zoomIn(this._canvasWidth(), this._canvasHeight());
      this._dirty = true;
    });

    const zoomOutBtn = document.getElementById('btn-zoom-out');
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => {
      this._camera.zoomOut(this._canvasWidth(), this._canvasHeight());
      this._dirty = true;
    });

    const fitBtn = document.getElementById('btn-zoom-fit');
    if (fitBtn) fitBtn.addEventListener('click', () => {
      this._fitGrid();
      this._tileRenderer.clearCache();
      this._dirty = true;
    });

    const brushBtns = this._toolbarEl.querySelectorAll('.brush-btn');
    brushBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this._setBrushSize(parseInt(btn.dataset.brush, 10));
      });
    });

    this._updateBrushUI();

    // Undo / Redo
    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) undoBtn.addEventListener('click', () => this._doUndo());
    const redoBtn = document.getElementById('btn-redo');
    if (redoBtn) redoBtn.addEventListener('click', () => this._doRedo());

    // Eraser
    const eraserBtn = document.getElementById('btn-eraser');
    if (eraserBtn) eraserBtn.addEventListener('click', () => this._toggleEraser());

    // Sound toggle
    const soundBtn = document.getElementById('btn-sound-toggle');
    if (soundBtn) {
      soundBtn.setAttribute('aria-pressed', this._sound.enabled ? 'true' : 'false');
      soundBtn.addEventListener('click', () => this._toggleSound());
    }

    // Clear All
    const clearAllBtn = document.getElementById('btn-clear-all');
    if (clearAllBtn) clearAllBtn.addEventListener('click', () => this._showClearAllDialog());

    // Auto-Fill
    const autoFillBtn = document.getElementById('btn-auto-fill');
    if (autoFillBtn) autoFillBtn.addEventListener('click', () => this._doAutoFill());

    // Shortcuts
    const shortcutsBtn = document.getElementById('btn-shortcuts');
    if (shortcutsBtn) shortcutsBtn.addEventListener('click', () => this._showShortcuts());

    // Clear All dialog buttons
    const clearAllConfirm = document.getElementById('btn-clear-all-confirm');
    if (clearAllConfirm) clearAllConfirm.addEventListener('click', () => this._doClearAll());
    const clearAllCancel = document.getElementById('btn-clear-all-cancel');
    if (clearAllCancel) clearAllCancel.addEventListener('click', () => this._closeClearAllDialog());

    // Shortcuts dialog close
    const shortcutsClose = document.getElementById('btn-shortcuts-close');
    if (shortcutsClose) shortcutsClose.addEventListener('click', () => this._closeShortcuts());
  }

  _toggleGrid() {
    this._showGrid = !this._showGrid;
    const gridBtn = document.getElementById('btn-grid-toggle');
    if (gridBtn) {
      gridBtn.setAttribute('aria-pressed', this._showGrid ? 'true' : 'false');
    }
    this._dirty = true;
    this._app.announce(this._showGrid ? 'Grid on' : 'Grid off');
  }

  _toggleFillMode() {
    this._fillMode = !this._fillMode;
    if (this._fillMode && this._eraserMode) this._eraserMode = false;
    const fillBtn = document.getElementById('btn-fill-tool');
    if (fillBtn) fillBtn.setAttribute('aria-pressed', this._fillMode ? 'true' : 'false');
    const eraserBtn = document.getElementById('btn-eraser');
    if (eraserBtn) eraserBtn.setAttribute('aria-pressed', 'false');
    if (this._selectedTile) {
      this._state = this._fillMode ? EditorState.FILL_MODE : EditorState.TILE_SELECTED;
    }
    this._app.announce(this._fillMode ? 'Fill mode on' : 'Fill mode off');
    this._updateCursor();
  }

  _togglePanMode() {
    this._panMode = !this._panMode;
    if (this._input) this._input.panMode = this._panMode;
    const panBtn = document.getElementById('btn-pan-mode');
    if (panBtn) {
      panBtn.classList.toggle('active', this._panMode);
      panBtn.setAttribute('aria-pressed', this._panMode ? 'true' : 'false');
    }
    this._app.announce(this._panMode ? 'Pan mode on' : 'Pan mode off');
    this._updateCursor();
  }

  /** Update canvas cursor based on current editor mode */
  _updateCursor() {
    if (!this._canvas) return;
    if (this._panMode) {
      this._canvas.style.cursor = 'grab';
    } else if (this._fillMode) {
      this._canvas.style.cursor = 'cell';
    } else if (this._selectedTile || this._eraserMode || this._selectedOverlay) {
      this._canvas.style.cursor = 'crosshair';
    } else {
      this._canvas.style.cursor = 'default';
    }
  }

  _cycleMapLife() {
    const newMode = this._animation.cycleMapLife();
    this._updateMapLifeUI();
    this._dirty = true;
    const labels = { full: 'On', subtle: 'Subtle', still: 'Off' };
    this._app.announce('Animations: ' + labels[newMode]);
  }

  _updateMapLifeUI() {
    const btn = document.getElementById('btn-map-life');
    if (!btn || !this._animation) return;
    const mode = this._animation.mapLifeMode;
    const labels = { full: 'Animations: On', subtle: 'Animations: Subtle', still: 'Animations: Off' };
    btn.textContent = labels[mode] || 'Animations: On';
    btn.setAttribute('aria-label', 'Animation mode: ' + mode + '. Click to cycle.');
    btn.classList.toggle('active', mode === 'full');
  }

  _setBrushSize(size) {
    this._brushSize = size;
    this._updateBrushUI();
    this._app.announce('Brush size ' + (size === 1 ? '1' : size + 'x' + size));
  }

  _updateBrushUI() {
    const brushBtns = this._toolbarEl.querySelectorAll('.brush-btn');
    brushBtns.forEach(btn => {
      const s = parseInt(btn.dataset.brush, 10);
      btn.classList.toggle('active', s === this._brushSize);
      btn.setAttribute('aria-pressed', s === this._brushSize ? 'true' : 'false');
    });
  }

  /* ---- Camera Controls ---- */
  _handlePan(dx, dy) {
    this._camera.pan(dx, dy);
    this._dirty = true;
    this._animation.noteInteraction();
  }

  _handlePinchZoom(newZoom, cx, cy) {
    this._camera.zoomTo(newZoom, cx, cy);
    this._tileRenderer.clearCache();
    this._dirty = true;
    this._animation.noteInteraction();
  }

  _handleWheelZoom(delta, cx, cy) {
    const factor = delta > 0 ? 1.08 : 0.92;
    const newZoom = this._camera.zoom * factor;
    this._camera.zoomTo(newZoom, cx, cy);
    this._tileRenderer.clearCache();
    this._dirty = true;
    this._animation.noteInteraction();
  }

  _handleHoverCell(cell) {
    const prev = this._hoveredCell;
    this._hoveredCell = cell;
    this._animation.noteInteraction();

    // Only redirty if hover changed
    if (!prev && !cell) return;
    if (prev && cell && prev.col === cell.col && prev.row === cell.row &&
        prev.cellType === cell.cellType) return;
    this._dirty = true;
  }

  /* ---- Cell Interaction ---- */
  _handleCellTap(col, row, cellType) {
    if (this._panMode) return;
    this._animation.noteInteraction();

    // Eraser mode
    if (this._eraserMode) {
      this._eraseCell(col, row, cellType);
      return;
    }

    if (this._state === EditorState.FILL_MODE && this._selectedTile) {
      this._doFill(col, row, cellType);
      return;
    }

    if (this._selectedTile) {
      this._paintBrush(col, row, cellType);
      return;
    }

    // Overlay placement
    if (this._state === EditorState.OVERLAY_SELECTED && this._selectedOverlay) {
      this._placeOverlay(col, row, cellType);
      return;
    }

    // No tile/overlay selected — select cell for inspection
    const cell = this._grid.getCell(col, row, cellType);
    this._selectedCell = { col, row, cellType };
    this._selectedCellOverlayIndex = -1;
    this._state = EditorState.CELL_SELECTED;

    // Open properties panel
    const content = document.getElementById('properties-content');
    const toggleBtn = document.getElementById('btn-properties-toggle');
    if (content && content.classList.contains('hidden')) {
      content.classList.remove('hidden');
      if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', 'true');
        toggleBtn.textContent = 'Properties \u25BC';
      }
      this._resizeCanvas();
    }
    this._updatePropertiesPanel();

    if (cell && cell.base) {
      this._app.announce('Selected cell at column ' + (col + 1) + ', row ' + (row + 1) + ': ' + cell.base);
    } else {
      this._app.announce('Selected empty cell at column ' + (col + 1) + ', row ' + (row + 1));
    }
    this._dirty = true;
  }

  _handleCellDrag(col, row, cellType) {
    if (this._panMode) return;
    this._animation.noteInteraction();

    if (this._eraserMode) {
      this._eraseCellDrag(col, row, cellType);
      return;
    }

    if (!this._selectedTile || this._fillMode) return;
    this._paintBrushDrag(col, row, cellType);
  }

  /** Paint brush (tap) — records a single undo command */
  _paintBrush(col, row, cellType) {
    const cells = this._collectBrushCells(col, row, cellType);
    if (cells.length === 0) return;

    const cmd = cmdPaintTiles(this._grid, cells, this._tileRenderer);
    this._history.push(cmd);
    this._dirty = true;
    this._markSaveDirty();
    this._sound.playPlace();
  }

  /** Paint brush (drag) — batches into a stroke */
  _paintBrushDrag(col, row, cellType) {
    const cells = this._collectBrushCells(col, row, cellType);
    if (cells.length === 0) return;

    if (!this._paintStroke) this._paintStroke = [];
    this._paintStroke.push(...cells);
    this._dirty = true;
    this._markSaveDirty();
  }

  /** Collect cells for brush paint, recording old base for undo */
  _collectBrushCells(col, row, cellType) {
    const results = [];
    const tile = this._selectedTile;

    const tryPaint = (c, r, ct) => {
      const cell = this._grid.getCell(c, r, ct);
      if (!cell) return;
      const oldBase = cell.base;
      if (oldBase === tile) return; // No change
      if (this._grid.setBase(c, r, tile, ct)) {
        this._tileRenderer.markDirty(this._grid, c, r, ct);
        results.push({ col: c, row: r, cellType: ct, oldBase, newBase: tile });
      }
    };

    if (this._brushSize === 1 || this._shape !== 'square') {
      tryPaint(col, row, cellType);

      if (this._brushSize >= 2 && this._shape !== 'square') {
        const neighbors = this._grid.getNeighbors(col, row, cellType);
        for (const n of neighbors) tryPaint(n.col, n.row, n.cellType);
      }
      if (this._brushSize >= 3 && this._shape !== 'square') {
        const neighbors = this._grid.getNeighbors(col, row, cellType);
        for (const n of neighbors) {
          const n2 = this._grid.getNeighbors(n.col, n.row, n.cellType);
          for (const nn of n2) tryPaint(nn.col, nn.row, nn.cellType);
        }
      }
    } else {
      // Square grid: standard NxN brush
      const half = Math.floor(this._brushSize / 2);
      for (let dr = -half; dr < this._brushSize - half; dr++) {
        for (let dc = -half; dc < this._brushSize - half; dc++) {
          tryPaint(col + dc, row + dr, undefined);
        }
      }
    }

    return results;
  }

  _doFill(col, row, cellType) {
    // Capture old base before fill (all cells in the fill region share the same base)
    const startCell = this._grid.getCell(col, row, cellType);
    const oldBase = startCell ? startCell.base : null;

    const filledCells = this._grid.floodFill(col, row, this._selectedTile, 500, cellType);
    if (filledCells.length > 0) {
      this._markSaveDirty();

      // Build undo data
      const undoCells = filledCells.map(c => ({
        col: c.col, row: c.row, cellType: c.cellType,
        oldBase: oldBase, newBase: this._selectedTile
      }));
      const cmd = cmdFillTiles(this._grid, undoCells, this._tileRenderer);
      this._history.push(cmd);

      // Mark all filled cells + their neighbors dirty
      for (const c of filledCells) {
        this._tileRenderer.markDirty(this._grid, c.col, c.row, c.cellType);
      }
      this._dirty = true;
      this._app.announce('Filled ' + filledCells.length + ' cells');
      this._sound.playCascade();

      this._fillHighlight = filledCells;
      if (this._fillHighlightTimer) clearTimeout(this._fillHighlightTimer);
      this._fillHighlightTimer = setTimeout(() => {
        this._fillHighlight = null;
        this._fillHighlightTimer = null;
        this._dirty = true;
      }, 400);
    }
  }

  /* ---- Export Dialog ---- */

  _openExportDialog() {
    const dialog = document.getElementById('export-dialog');
    if (!dialog) return;

    dialog.classList.remove('hidden');
    dialog.removeAttribute('aria-hidden');

    // Save focus for restoration on close
    this._exportPrevFocus = document.activeElement;

    // Focus trap
    this._exportFocusTrap = (e) => {
      if (e.key === 'Escape') { this._closeExportDialog(); return; }
      if (e.key !== 'Tab') return;
      const focusable = dialog.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    dialog.addEventListener('keydown', this._exportFocusTrap);

    // Format radio buttons
    const formatBtns = dialog.querySelectorAll('.format-btn');
    formatBtns.forEach(btn => {
      btn.onclick = () => {
        formatBtns.forEach(b => {
          b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
          b.setAttribute('tabindex', b === btn ? '0' : '-1');
        });
        // Show/hide format-specific options
        const jpegOpts = document.getElementById('export-jpeg-options');
        const pdfOpts = document.getElementById('export-pdf-options');
        if (jpegOpts) jpegOpts.classList.toggle('hidden', btn.dataset.format !== 'jpeg');
        if (pdfOpts) pdfOpts.classList.toggle('hidden', btn.dataset.format !== 'pdf');
      };
    });

    // JPEG quality slider
    const qualitySlider = document.getElementById('jpeg-quality-slider');
    const qualityVal = document.getElementById('jpeg-quality-value');
    if (qualitySlider && qualityVal) {
      qualitySlider.oninput = () => {
        qualityVal.textContent = Math.round(parseFloat(qualitySlider.value) * 100) + '%';
      };
    }

    // Cancel
    const cancelBtn = document.getElementById('btn-export-cancel');
    if (cancelBtn) cancelBtn.onclick = () => this._closeExportDialog();

    // Confirm export
    const confirmBtn = document.getElementById('btn-export-confirm');
    if (confirmBtn) confirmBtn.onclick = () => this._doExport();

    // Print
    const printBtn = document.getElementById('btn-print');
    if (printBtn) printBtn.onclick = () => {
      this._closeExportDialog();
      ExportManager.print();
    };

    // Focus first button
    const firstFormat = dialog.querySelector('.format-btn[aria-checked="true"]');
    if (firstFormat) firstFormat.focus();
  }

  _closeExportDialog() {
    const dialog = document.getElementById('export-dialog');
    if (!dialog) return;
    dialog.classList.add('hidden');
    dialog.setAttribute('aria-hidden', 'true');
    if (this._exportFocusTrap) {
      dialog.removeEventListener('keydown', this._exportFocusTrap);
      this._exportFocusTrap = null;
    }
    // Hide progress
    const progress = document.getElementById('export-progress');
    if (progress) progress.classList.add('hidden');
    // Restore focus
    if (this._exportPrevFocus) {
      this._exportPrevFocus.focus();
      this._exportPrevFocus = null;
    }
  }

  _doExport() {
    const dialog = document.getElementById('export-dialog');
    const formatBtn = dialog.querySelector('.format-btn[aria-checked="true"]');
    const format = formatBtn ? formatBtn.dataset.format : 'pdf';
    const includeGrid = document.getElementById('export-grid').checked;
    const includeLegend = format === 'pdf' && document.getElementById('export-legend').checked;

    // Show progress
    const progress = document.getElementById('export-progress');
    const fill = document.getElementById('export-progress-fill');
    if (progress) progress.classList.remove('hidden');
    if (fill) fill.style.width = '30%';

    // Use requestAnimationFrame to let the progress bar render before the blocking export
    this._exportRafId = requestAnimationFrame(() => {
      if (!this._running) return; // Editor was destroyed between RAFs
      this._exportRafId = requestAnimationFrame(() => {
        this._exportRafId = null;
        if (!this._running) return; // Editor was destroyed
        try {
          if (fill) fill.style.width = '70%';

          const options = { includeGrid, includeLegend };

          if (format === 'pdf') {
            ExportManager.exportPDF(this, options);
          } else if (format === 'png') {
            ExportManager.exportPNG(this, options);
          } else if (format === 'jpeg') {
            const quality = parseFloat(document.getElementById('jpeg-quality-slider').value) || 0.85;
            ExportManager.exportJPEG(this, { ...options, quality });
          }

          if (fill) fill.style.width = '100%';
          this._app.announce('Map exported as ' + format.toUpperCase());
          this._app.showToast('Map exported as ' + format.toUpperCase());

          this._exportCloseTimer = setTimeout(() => { this._exportCloseTimer = null; this._closeExportDialog(); }, 500);
        } catch (err) {
          console.error('Export failed:', err);
          this._app.announce('Something went wrong with the export. Try a smaller map!', true);
          this._app.showToast('Something went wrong with the export. Try a smaller map!', { isError: true });
          if (progress) progress.classList.add('hidden');
        }
      });
    });
  }

  /* ---- Save / Load ---- */

  saveMap() {
    if (!this._storage) return;
    try {
      const data = StorageManager.serializeMap(this);
      // Generate thumbnail from the visible canvas
      data.thumbnail = StorageManager.generateThumbnail(this._canvasEl);
      this._mapId = this._storage.saveMap(data);
      this._saveDirty = false;
      // Show storage warning if approaching limit
      const warning = this._storage.getLastWarning();
      if (warning) this._app.showToast(warning);
    } catch (e) {
      console.error('Save failed:', e);
      this._app.announce('Could not save your map. Try deleting some old maps in My Maps!', true);
      this._app.showToast('Could not save your map. Try deleting some old maps in My Maps!', { isError: true });
    }
  }

  /** Mark that the map has unsaved changes */
  _markSaveDirty() {
    this._saveDirty = true;
  }

  _promptRename() {
    const nameDisplay = document.getElementById('map-name-display');
    const editBtn = document.getElementById('btn-edit-name');
    if (!nameDisplay) return;

    // Replace display with an input field
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this._mapName;
    input.maxLength = 50;
    input.className = 'map-name-edit-input';
    input.setAttribute('aria-label', 'Edit map name');
    nameDisplay.classList.add('hidden');
    if (editBtn) editBtn.classList.add('hidden');
    nameDisplay.parentNode.insertBefore(input, nameDisplay);
    this._renameInput = input;
    input.focus();
    input.select();

    const commit = () => {
      const newName = input.value.trim();
      if (newName) {
        this._mapName = newName;
        nameDisplay.textContent = this._mapName;
        const pt = document.getElementById('print-title');
        if (pt) pt.textContent = this._mapName;
        this._markSaveDirty();
      }
      input.remove();
      this._renameInput = null;
      nameDisplay.classList.remove('hidden');
      if (editBtn) editBtn.classList.remove('hidden');
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = this._mapName; input.blur(); }
    });
  }

  /* ---- Keyboard ---- */
  _handleKeyAction(action) {
    this._animation.noteInteraction();

    // Quick tile selection (1-9)
    if (action.startsWith('quick-tile-')) {
      const idx = parseInt(action.split('-')[2]) - 1;
      const tiles = this._paletteEl.querySelectorAll('.palette-list [role="option"]');
      if (tiles[idx]) {
        tiles[idx].click();
      }
      return;
    }

    switch (action) {
      case 'escape':
        this._selectedTile = null;
        this._selectedCell = null;
        this._selectedOverlay = null;
        this._selectedCellOverlayIndex = -1;
        this._state = EditorState.IDLE;
        this._palette.clearSelection();
        this._clearOverlaySelection();
        this._updatePropertiesPanel();
        if (this._panMode) this._togglePanMode();
        if (this._eraserMode) this._toggleEraser();
        this._dirty = true;
        this._app.announce('Selection cleared');
        break;
      case 'undo': this._doUndo(); break;
      case 'redo': this._doRedo(); break;
      case 'eraser-toggle': this._toggleEraser(); break;
      case 'fill-toggle': this._toggleFillMode(); break;
      case 'grid-toggle': this._toggleGrid(); break;
      case 'pan-toggle': this._togglePanMode(); break;
      case 'rotate-overlay': this._rotateSelectedOverlay(); break;
      case 'show-shortcuts': this._showShortcuts(); break;
      case 'zoom-in':
        this._camera.zoomIn(this._canvasWidth(), this._canvasHeight());
        this._dirty = true;
        break;
      case 'zoom-out':
        this._camera.zoomOut(this._canvasWidth(), this._canvasHeight());
        this._dirty = true;
        break;
      case 'zoom-fit':
        this._fitGrid();
        this._dirty = true;
        break;
      case 'map-life': this._cycleMapLife(); break;
      case 'delete':
        this._deleteLastOverlay();
        break;
      case 'arrow-up': this._moveKeyboardCursor(0, -1); break;
      case 'arrow-down': this._moveKeyboardCursor(0, 1); break;
      case 'arrow-left': this._moveKeyboardCursor(-1, 0); break;
      case 'arrow-right': this._moveKeyboardCursor(1, 0); break;
      case 'enter': this._placeAtKeyboardCursor(); break;
    }
  }

  /* ---- Keyboard Cursor Navigation ---- */
  _moveKeyboardCursor(dx, dy) {
    if (!this._kbCursor) {
      // Initialize cursor at center of grid
      this._kbCursor = {
        col: Math.floor(this._grid.cols / 2),
        row: Math.floor(this._grid.rows / 2),
        cellType: undefined
      };
    }

    const newCol = this._kbCursor.col + dx;
    const newRow = this._kbCursor.row + dy;

    // Bounds check
    if (newCol < 0 || newCol >= this._grid.cols || newRow < 0 || newRow >= this._grid.rows) {
      return;
    }

    this._kbCursor.col = newCol;
    this._kbCursor.row = newRow;
    // For octagon grids, default to 'oct' cell type (keyboard nav stays on main cells)
    this._kbCursor.cellType = this._shape === 'octagon' ? 'oct' : undefined;
    this._dirty = true;

    // Ensure cursor cell is visible by panning camera if needed
    const cellCenter = this._grid.gridToPixel(newCol, newRow, this._kbCursor.cellType);
    const screen = this._camera.worldToScreen(cellCenter.x, cellCenter.y);
    const margin = 60;
    const cw = this._canvasWidth();
    const ch = this._canvasHeight();
    let panX = 0, panY = 0;
    if (screen.x < margin) panX = margin - screen.x;
    else if (screen.x > cw - margin) panX = (cw - margin) - screen.x;
    if (screen.y < margin) panY = margin - screen.y;
    else if (screen.y > ch - margin) panY = (ch - margin) - screen.y;
    if (panX !== 0 || panY !== 0) {
      this._camera.pan(panX, panY);
    }

    // Announce cell position
    const cell = this._grid.getCell(newCol, newRow, this._kbCursor.cellType);
    const tileName = cell && cell.base ? this._tileRenderer.getDisplayName(cell.base) : 'empty';
    this._app.announce('Column ' + (newCol + 1) + ', row ' + (newRow + 1) + ': ' + tileName);
  }

  _placeAtKeyboardCursor() {
    if (!this._kbCursor) return;
    const { col, row, cellType } = this._kbCursor;

    if (this._eraserMode || this._selectedTile || this._selectedOverlay) {
      this._handleCellTap(col, row, cellType);
    } else {
      // Select cell for properties
      this._selectedCell = { col, row, cellType };
      this._state = EditorState.CELL_SELECTED;
      this._updatePropertiesPanel();
      this._dirty = true;
    }
  }

  /* ---- Overlay Rendering ---- */
  _renderOverlays(ctx) {
    const grid = this._grid;
    const cellSize = grid.cellSize;
    const shape = grid.shape;
    const viewport = this._getViewportBounds();

    grid.forEachCell((col, row, cell, cellType) => {
      if (!cell.overlays || cell.overlays.length === 0) return;

      // Viewport culling
      let cx, cy;
      if (shape === 'square') {
        cx = col * cellSize + cellSize / 2;
        cy = row * cellSize + cellSize / 2;
      } else {
        const center = grid.gridToPixel(col, row, cellType);
        cx = center.x;
        cy = center.y;
      }
      if (cx + cellSize < viewport.minX || cx - cellSize > viewport.maxX ||
          cy + cellSize < viewport.minY || cy - cellSize > viewport.maxY) {
        return;
      }

      // Draw each overlay, stacked with slight offset
      for (let i = 0; i < cell.overlays.length; i++) {
        const ov = cell.overlays[i];
        const jitterX = (i - (cell.overlays.length - 1) / 2) * 3;
        const jitterY = (i - (cell.overlays.length - 1) / 2) * 2;

        if (Editor.isRealmBrewOverlay(ov.id) && this._realmBrew) {
          // Realm Brew PNG overlay
          this._drawRbOverlay(ctx, ov, cx + jitterX, cy + jitterY, cellSize);
        } else {
          this._overlayRenderer.drawOverlay(
            ctx, ov.id, cx + jitterX, cy + jitterY, cellSize,
            { rotation: ov.rotation || 0, opacity: ov.opacity != null ? ov.opacity : 1.0, size: ov.size || 'medium' }
          );
          // Draw custom text for special overlays
          if (ov.text && (ov.id === 'text-label' || ov.id === 'title-banner')) {
            this._drawOverlayText(ctx, ov, cx + jitterX, cy + jitterY, cellSize);
          }
          if (ov.scaleText && ov.id === 'scale-bar') {
            this._drawOverlayText(ctx, ov, cx + jitterX, cy + jitterY, cellSize);
          }
        }
      }
    });
  }

  _drawOverlayText(ctx, ov, cx, cy, cellSize) {
    const sizeRatios = { small: 0.3, medium: 0.6, large: 0.9 };
    const ratio = sizeRatios[ov.size || 'medium'] || 0.6;
    const drawSize = Math.round(cellSize * ratio);
    const text = ov.text || ov.scaleText || '';
    if (!text) return;

    ctx.save();
    if (ov.opacity != null && ov.opacity < 1.0) ctx.globalAlpha = ov.opacity;

    const fontSizes = { small: 8, medium: 11, large: 14 };
    const fontSize = fontSizes[ov.fontSize || 'medium'] || 11;
    const scaledFont = Math.max(6, Math.round(fontSize * (drawSize / 40)));

    ctx.font = `bold ${scaledFont}px "OpenDyslexic", "Comic Sans MS", sans-serif`;
    ctx.fillStyle = '#2C2416';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Clip text to overlay bounds
    const maxWidth = drawSize * 0.85;
    ctx.fillText(text, cx, cy, maxWidth);

    ctx.restore();
  }

  /* ---- Overlay Palette Setup ---- */
  _initOverlayPalette() {
    const theme = this._themeManager.getTheme(this._themeId);
    const themeOverlays = this._overlayRenderer.getThemeOverlays(this._themeId);
    const universalOverlays = this._overlayRenderer.getUniversalOverlays();

    // Load favorites and recent from localStorage
    this._overlayFavorites = this._loadOverlayFavorites();
    this._overlayRecent = this._loadOverlayRecent();

    this._populateOverlayListGrouped('theme-overlay-list', themeOverlays);
    this._populateOverlayListGrouped('universal-overlay-list', universalOverlays);
    this._refreshFavoritesSection();
    this._refreshRecentSection();

    // Tab switching (supports Theme, Universal, and optional Realm Brew tabs)
    this._overlayTabs = [
      { tab: document.getElementById('tab-theme-overlays'), panel: document.getElementById('panel-theme-overlays') },
      { tab: document.getElementById('tab-universal-overlays'), panel: document.getElementById('panel-universal-overlays') },
      { tab: document.getElementById('tab-rb-overlays'), panel: document.getElementById('panel-rb-overlays') }
    ].filter(t => t.tab && t.panel);

    for (const entry of this._overlayTabs) {
      entry.tab.addEventListener('click', () => this._switchOverlayTab(entry.tab));
    }

    // Search/filter
    const searchInput = document.getElementById('overlay-search-input');
    const clearBtn = document.getElementById('btn-overlay-search-clear');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        if (this._overlaySearchTimer) clearTimeout(this._overlaySearchTimer);
        this._overlaySearchTimer = setTimeout(() => {
          this._filterOverlays(searchInput.value.trim().toLowerCase());
        }, 200);
        if (clearBtn) clearBtn.classList.toggle('hidden', !searchInput.value);
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearBtn.classList.add('hidden');
        this._filterOverlays('');
      });
    }

    // Properties panel toggle
    const toggleBtn = document.getElementById('btn-properties-toggle');
    const content = document.getElementById('properties-content');
    if (toggleBtn && content) {
      toggleBtn.addEventListener('click', () => {
        const isHidden = content.classList.toggle('hidden');
        toggleBtn.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
        toggleBtn.textContent = 'Properties ' + (isHidden ? '\u25B2' : '\u25BC');
        // Resize canvas since properties panel changed height
        this._resizeCanvas();
        this._dirty = true;
      });
    }

    // Properties controls
    this._bindPropertiesControls();

    // Special overlay dialogs
    this._initTextLabelDialog();
    this._initScaleBarDialog();
  }

  /** Category display names */
  static CATEGORY_LABELS = {
    settlement: 'Settlements',
    structure: 'Structures',
    wildlife: 'Wildlife',
    character: 'Characters',
    marker: 'Markers',
    numbered: 'Numbered',
    lettered: 'Lettered',
    navigation: 'Navigation',
    nature: 'Nature',
    atmosphere: 'Atmosphere',
    weather: 'Weather',
    hazard: 'Hazards',
    label: 'Labels & Flags'
  };

  _populateOverlayListGrouped(listId, overlays) {
    const listEl = document.getElementById(listId);
    if (!listEl) return;
    listEl.replaceChildren();

    // Group by category
    const groups = new Map();
    for (const ov of overlays) {
      const cat = ov.category || 'other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(ov);
    }

    for (const [cat, items] of groups) {
      const groupEl = document.createElement('div');
      groupEl.className = 'overlay-category-group';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'category-toggle';
      toggleBtn.setAttribute('aria-expanded', 'true');
      toggleBtn.textContent = Editor.CATEGORY_LABELS[cat] || cat;
      toggleBtn.addEventListener('click', () => {
        const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
        toggleBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      });
      groupEl.appendChild(toggleBtn);

      const itemsEl = document.createElement('div');
      itemsEl.className = 'category-items';

      for (const ov of items) {
        itemsEl.appendChild(this._createOverlayOption(ov));
      }
      groupEl.appendChild(itemsEl);
      listEl.appendChild(groupEl);
    }
  }

  _createOverlayOption(ov, compact) {
    const option = document.createElement('div');
    option.className = 'overlay-option' + (compact ? ' compact' : '');
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    option.setAttribute('aria-label', ov.name);
    option.setAttribute('tabindex', '0');
    option.dataset.overlayId = ov.id;

    // Preview canvas
    const previewSize = compact ? 36 : 44;
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = previewSize;
    previewCanvas.height = previewSize;
    previewCanvas.setAttribute('aria-hidden', 'true');
    option.appendChild(previewCanvas);

    // Render preview async
    this._overlayRenderer.renderPreview(ov.id, previewSize, (img) => {
      const ctx = previewCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0, previewSize, previewSize);
    });

    const nameEl = document.createElement('span');
    nameEl.className = 'overlay-name';
    nameEl.textContent = ov.name;
    option.appendChild(nameEl);

    // Favorite star button
    const favBtn = document.createElement('button');
    favBtn.className = 'fav-btn' + (this._overlayFavorites.has(ov.id) ? ' active' : '');
    favBtn.setAttribute('aria-label', 'Toggle favorite');
    favBtn.textContent = '\u2605';
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleFavorite(ov.id);
    });
    option.appendChild(favBtn);

    option.addEventListener('click', () => this._selectOverlay(ov.id));
    option.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._selectOverlay(ov.id);
      }
    });

    return option;
  }

  /* ---- Overlay Favorites ---- */
  _loadOverlayFavorites() {
    try {
      const stored = localStorage.getItem('magical-map-maker-favorites');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  }

  _saveOverlayFavorites() {
    try {
      localStorage.setItem('magical-map-maker-favorites', JSON.stringify([...this._overlayFavorites]));
    } catch { /* storage full */ }
  }

  _toggleFavorite(overlayId) {
    if (this._overlayFavorites.has(overlayId)) {
      this._overlayFavorites.delete(overlayId);
    } else {
      this._overlayFavorites.add(overlayId);
    }
    this._saveOverlayFavorites();

    // Update all star buttons
    document.querySelectorAll('.overlay-option .fav-btn').forEach(btn => {
      const optionEl = btn.closest('.overlay-option');
      if (optionEl) {
        btn.classList.toggle('active', this._overlayFavorites.has(optionEl.dataset.overlayId));
      }
    });

    this._refreshFavoritesSection();
  }

  _refreshFavoritesSection() {
    const section = document.getElementById('overlay-favorites-section');
    const list = document.getElementById('overlay-favorites-list');
    if (!section || !list) return;

    list.replaceChildren();
    if (this._overlayFavorites.size === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    for (const id of this._overlayFavorites) {
      const ov = this._overlayRenderer.getOverlay(id);
      if (ov) list.appendChild(this._createOverlayOption(ov, true));
    }
  }

  /* ---- Overlay Recently Used ---- */
  _loadOverlayRecent() {
    try {
      const stored = localStorage.getItem('magical-map-maker-recent-overlays');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  }

  _saveOverlayRecent() {
    try {
      localStorage.setItem('magical-map-maker-recent-overlays', JSON.stringify(this._overlayRecent));
    } catch { /* storage full */ }
  }

  _addToRecent(overlayId) {
    this._overlayRecent = this._overlayRecent.filter(id => id !== overlayId);
    this._overlayRecent.unshift(overlayId);
    if (this._overlayRecent.length > 8) this._overlayRecent.length = 8;
    this._saveOverlayRecent();
    this._refreshRecentSection();
  }

  _refreshRecentSection() {
    const section = document.getElementById('overlay-recent-section');
    const list = document.getElementById('overlay-recent-list');
    if (!section || !list) return;

    list.replaceChildren();
    if (this._overlayRecent.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    for (const id of this._overlayRecent) {
      const ov = this._overlayRenderer.getOverlay(id);
      if (ov) list.appendChild(this._createOverlayOption(ov, true));
    }
  }

  /* ---- Special Overlay Dialogs ---- */
  _initTextLabelDialog() {
    const dialog = document.getElementById('text-label-dialog');
    if (!dialog) return;

    const input = document.getElementById('text-label-input');
    const okBtn = document.getElementById('btn-text-label-ok');
    const cancelBtn = document.getElementById('btn-text-label-cancel');

    // Font size radio buttons
    dialog.querySelectorAll('.size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        dialog.querySelectorAll('.size-btn').forEach(b => b.setAttribute('aria-checked', 'false'));
        btn.setAttribute('aria-checked', 'true');
      });
    });

    const close = () => {
      dialog.classList.add('hidden');
      dialog.setAttribute('aria-hidden', 'true');
      this._pendingSpecialOverlay = null;
      if (this._focusTrapHandler) {
        document.removeEventListener('keydown', this._focusTrapHandler);
        this._focusTrapHandler = null;
      }
      if (this._prevFocusSpecial) {
        this._prevFocusSpecial.focus();
        this._prevFocusSpecial = null;
      }
    };

    cancelBtn.addEventListener('click', close);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
    dialog.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    okBtn.addEventListener('click', () => {
      const text = input.value.trim();
      if (!text || !this._pendingSpecialOverlay) { close(); return; }
      const fontSize = dialog.querySelector('.size-btn[aria-checked="true"]')?.dataset.fontSize || 'medium';
      const { col, row, cellType } = this._pendingSpecialOverlay;
      this._placeSpecialOverlay(col, row, cellType, 'text-label', { text, fontSize });
      input.value = '';
      close();
    });
  }

  _initScaleBarDialog() {
    const dialog = document.getElementById('scale-bar-dialog');
    if (!dialog) return;

    const select = document.getElementById('scale-bar-input');
    const customInput = document.getElementById('scale-bar-custom');
    const okBtn = document.getElementById('btn-scale-bar-ok');
    const cancelBtn = document.getElementById('btn-scale-bar-cancel');

    select.addEventListener('change', () => {
      customInput.classList.toggle('hidden', select.value !== 'custom');
      if (select.value === 'custom') customInput.focus();
    });

    const close = () => {
      dialog.classList.add('hidden');
      dialog.setAttribute('aria-hidden', 'true');
      this._pendingSpecialOverlay = null;
      if (this._focusTrapHandler) {
        document.removeEventListener('keydown', this._focusTrapHandler);
        this._focusTrapHandler = null;
      }
      if (this._prevFocusSpecial) {
        this._prevFocusSpecial.focus();
        this._prevFocusSpecial = null;
      }
    };

    cancelBtn.addEventListener('click', close);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
    dialog.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    okBtn.addEventListener('click', () => {
      if (!this._pendingSpecialOverlay) { close(); return; }
      const scaleText = select.value === 'custom' ? customInput.value.trim() : select.value;
      if (!scaleText) { close(); return; }
      const { col, row, cellType } = this._pendingSpecialOverlay;
      this._placeSpecialOverlay(col, row, cellType, 'scale-bar', { scaleText });
      select.value = select.options[0].value;
      customInput.value = '';
      customInput.classList.add('hidden');
      close();
    });
  }

  _showTextLabelDialog(col, row, cellType) {
    this._pendingSpecialOverlay = { col, row, cellType };
    this._prevFocusSpecial = document.activeElement;
    const dialog = document.getElementById('text-label-dialog');
    dialog.classList.remove('hidden');
    dialog.removeAttribute('aria-hidden');
    const input = document.getElementById('text-label-input');
    input.value = '';
    input.focus();
    this._trapFocus(dialog);
  }

  _showScaleBarDialog(col, row, cellType) {
    this._pendingSpecialOverlay = { col, row, cellType };
    this._prevFocusSpecial = document.activeElement;
    const dialog = document.getElementById('scale-bar-dialog');
    dialog.classList.remove('hidden');
    dialog.removeAttribute('aria-hidden');
    document.getElementById('scale-bar-input').focus();
    this._trapFocus(dialog);
  }

  _trapFocus(dialog) {
    if (this._focusTrapHandler) {
      document.removeEventListener('keydown', this._focusTrapHandler);
    }
    this._focusTrapHandler = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = dialog.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', this._focusTrapHandler);
  }

  _placeSpecialOverlay(col, row, cellType, overlayId, extraProps) {
    const cell = this._grid.getCell(col, row, cellType);
    if (!cell) return;
    if (!cell.overlays) cell.overlays = [];
    if (cell.overlays.length >= 5) {
      this._app.announce('Maximum 5 overlays per cell');
      return;
    }

    const overlay = {
      id: overlayId,
      rotation: 0,
      opacity: 1.0,
      size: overlayId === 'title-banner' ? 'large' : 'medium',
      ...extraProps
    };

    const cmd = cmdPlaceOverlay(this._grid, col, row, cellType, overlay);
    cmd.apply();
    this._history.push(cmd);
    this._dirty = true;
    this._markSaveDirty();
    this._sound.playChime();
    this._addToRecent(overlayId);
    this._app.announce('Placed ' + (this._overlayRenderer.getOverlay(overlayId)?.name || overlayId));
  }

  _selectOverlay(overlayId) {
    // Clear tile selection
    this._selectedTile = null;
    this._palette.clearSelection();
    this._selectedCell = null;
    this._selectedCellOverlayIndex = -1;

    this._selectedOverlay = overlayId;
    this._state = EditorState.OVERLAY_SELECTED;

    // Update overlay palette UI (both SVG and RB overlays)
    document.querySelectorAll('.overlay-option, .rb-overlay-option').forEach(opt => {
      opt.setAttribute('aria-selected', opt.dataset.overlayId === overlayId ? 'true' : 'false');
    });

    // Determine display name
    let displayName;
    if (Editor.isRealmBrewOverlay(overlayId)) {
      const rbInfo = Editor.parseRealmBrewOverlayId(overlayId);
      displayName = rbInfo ? RealmBrewLoader.overlayDisplayName(rbInfo.filename) : overlayId;
    } else {
      displayName = this._overlayRenderer.getOverlay(overlayId)?.name || overlayId;
    }
    this._app.announce('Overlay selected: ' + displayName);
    this._dirty = true;
  }

  _clearOverlaySelection() {
    this._selectedOverlay = null;
    document.querySelectorAll('.overlay-option, .rb-overlay-option').forEach(opt => {
      opt.setAttribute('aria-selected', 'false');
    });
  }

  _filterOverlays(query) {
    // Filter overlay options in all panels
    document.querySelectorAll('#theme-overlay-list .overlay-option, #universal-overlay-list .overlay-option').forEach(opt => {
      const name = opt.getAttribute('aria-label') || '';
      const match = !query || name.toLowerCase().includes(query);
      if (match) {
        opt.removeAttribute('aria-hidden');
        opt.classList.remove('hidden');
      } else {
        opt.setAttribute('aria-hidden', 'true');
        opt.classList.add('hidden');
      }
    });

    // Hide empty category groups
    document.querySelectorAll('.overlay-category-group').forEach(group => {
      const visibleItems = group.querySelectorAll('.overlay-option:not([aria-hidden="true"])');
      group.classList.toggle('hidden', visibleItems.length === 0);
    });

    // When searching, show both panels so results from both tabs are visible
    if (query) {
      document.getElementById('panel-theme-overlays')?.classList.remove('hidden');
      document.getElementById('panel-universal-overlays')?.classList.remove('hidden');
    } else {
      // Restore tab state
      const activeTab = this._overlayTabs.find(t => t.tab.classList.contains('active'));
      if (activeTab) this._switchOverlayTab(activeTab.tab);
    }
  }

  _switchOverlayTab(activeTab) {
    for (const entry of this._overlayTabs) {
      const isActive = entry.tab === activeTab;
      entry.tab.classList.toggle('active', isActive);
      entry.tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
      entry.panel.classList.toggle('hidden', !isActive);
    }
  }

  /* ---- Realm Brew Integration ---- */

  async _loadRealmBrewTiles(subThemeId) {
    if (!this._realmBrew || !this._realmBrew.available) return;

    // Show loading overlay
    const loadingEl = document.getElementById('rb-loading-overlay');
    const progressEl = document.getElementById('rb-loading-progress');
    const cancelBtn = document.getElementById('btn-rb-cancel-load');

    if (loadingEl) loadingEl.classList.remove('hidden');
    if (progressEl) progressEl.style.width = '0%';

    let cancelled = false;
    const cancelHandler = () => { cancelled = true; this._realmBrew.cancelTileLoad(); };
    if (cancelBtn) cancelBtn.addEventListener('click', cancelHandler, { once: true });

    const success = await this._realmBrew.loadTileSet(subThemeId, (loaded, total) => {
      if (progressEl) {
        progressEl.style.width = Math.round((loaded / total) * 100) + '%';
      }
    });

    if (cancelBtn) cancelBtn.removeEventListener('click', cancelHandler);
    if (loadingEl) loadingEl.classList.add('hidden');

    if (success && !cancelled) {
      this._rbTilesLoaded = true;
      this._rbSubTheme = subThemeId;
      // Replace palette with Realm Brew tiles
      this._populateRealmBrewPalette(subThemeId);
      this._dirty = true;
    }
  }

  _populateRealmBrewPalette(subThemeId) {
    if (!this._realmBrew || !this._realmBrew.manifest) return;

    const files = this._realmBrew.manifest.tiles[subThemeId];
    if (!files) return;

    const listEl = this._paletteEl.querySelector('.palette-list');
    if (!listEl) return;
    listEl.replaceChildren();

    for (const filename of files) {
      const tileId = `rb:${subThemeId}:${filename}`;
      const displayName = RealmBrewLoader.tileDisplayName(filename);

      const option = document.createElement('div');
      option.className = 'tile-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.setAttribute('aria-label', displayName);
      option.setAttribute('tabindex', '0');
      option.dataset.tileId = tileId;
      option.dataset.rbFile = filename;
      option.dataset.rbTheme = subThemeId;

      // Render preview from loaded image
      const previewSize = 60;
      const img = this._realmBrew.getResizedTile(subThemeId, filename, previewSize, previewSize);
      if (img) {
        const displayCanvas = document.createElement('canvas');
        displayCanvas.width = previewSize;
        displayCanvas.height = previewSize;
        displayCanvas.setAttribute('aria-hidden', 'true');
        const dCtx = displayCanvas.getContext('2d');

        // Clip to hex shape for preview
        const cx = previewSize / 2;
        const cy = previewSize / 2;
        const r = previewSize / 2 - 2;
        dCtx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = Math.PI / 180 * (60 * i - 30);
          const vx = cx + r * Math.cos(angle);
          const vy = cy + r * Math.sin(angle);
          if (i === 0) dCtx.moveTo(vx, vy);
          else dCtx.lineTo(vx, vy);
        }
        dCtx.closePath();
        dCtx.clip();
        dCtx.drawImage(img, 0, 0, previewSize, previewSize);
        option.appendChild(displayCanvas);
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'tile-name';
      nameEl.textContent = displayName;
      option.appendChild(nameEl);

      option.addEventListener('click', () => {
        this._selectedTile = tileId;
        this._selectedOverlay = null;
        this._selectedCell = null;
        this._selectedCellOverlayIndex = -1;
        this._clearOverlaySelection();
        this._updatePropertiesPanel();
        this._state = this._fillMode ? EditorState.FILL_MODE : EditorState.TILE_SELECTED;

        // Update palette selection UI
        listEl.querySelectorAll('[role="option"]').forEach(opt => {
          opt.setAttribute('aria-selected', opt.dataset.tileId === tileId ? 'true' : 'false');
        });

        this._dirty = true;
      });

      option.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          option.click();
        }
      });

      listEl.appendChild(option);
    }
  }

  _initRealmBrewOverlays() {
    const rbTab = document.getElementById('tab-rb-overlays');
    const rbPanel = document.getElementById('panel-rb-overlays');
    const rbPacksEl = document.getElementById('rb-overlay-packs');
    if (!rbTab || !rbPanel || !rbPacksEl) return;

    // Show the Realm Brew tab (tab switching is already handled by _switchOverlayTab)
    rbTab.classList.remove('hidden');

    // Populate overlay packs as collapsible sections
    const packs = this._realmBrew.getOverlayPacks();
    rbPacksEl.replaceChildren();

    for (const pack of packs) {
      const section = document.createElement('div');
      section.className = 'rb-pack-section';

      const header = document.createElement('button');
      header.className = 'rb-pack-header';
      header.setAttribute('aria-expanded', 'false');
      header.innerHTML = escHtml(pack.label) + ' <span class="pack-count">(' + escHtml(String(pack.fileCount)) + ')</span>';

      const itemsEl = document.createElement('div');
      itemsEl.className = 'rb-pack-items hidden';
      itemsEl.setAttribute('role', 'listbox');
      itemsEl.setAttribute('aria-label', pack.label + ' overlays');

      header.addEventListener('click', async () => {
        const isExpanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
        itemsEl.classList.toggle('hidden', isExpanded);

        // Lazy-load overlay images on first expand
        if (!isExpanded && !this._realmBrew.isOverlayPackLoaded(pack.id)) {
          header.disabled = true;
          await this._realmBrew.loadOverlayPack(pack.id);
          header.disabled = false;
          this._populateRbOverlayPack(itemsEl, pack.id);
        }
      });

      section.appendChild(header);
      section.appendChild(itemsEl);
      rbPacksEl.appendChild(section);
    }
  }

  _populateRbOverlayPack(itemsEl, packId) {
    const packData = this._realmBrew.manifest.overlays[packId];
    if (!packData) return;

    itemsEl.replaceChildren();

    for (const filename of packData.files) {
      const displayName = RealmBrewLoader.overlayDisplayName(filename);
      const overlayId = `rb-overlay:${packId}:${filename}`;

      const option = document.createElement('div');
      option.className = 'rb-overlay-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.setAttribute('aria-label', displayName);
      option.setAttribute('tabindex', '0');
      option.dataset.overlayId = overlayId;
      option.dataset.rbPack = packId;
      option.dataset.rbFile = filename;

      const img = this._realmBrew.getOverlayImage(packId, filename);
      if (img) {
        const imgEl = document.createElement('img');
        imgEl.src = img.src;
        imgEl.alt = displayName;
        imgEl.setAttribute('aria-hidden', 'true');
        option.appendChild(imgEl);
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'rb-overlay-name';
      nameEl.textContent = displayName;
      option.appendChild(nameEl);

      option.addEventListener('click', () => this._selectOverlay(overlayId));
      option.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._selectOverlay(overlayId);
        }
      });

      itemsEl.appendChild(option);
    }
  }

  /**
   * Check if a tile ID is a Realm Brew tile.
   * RB tile IDs look like: "rb:man-hewn-dungeons:filename.png"
   */
  static isRealmBrewTile(tileId) {
    return tileId && tileId.startsWith('rb:');
  }

  /**
   * Parse a Realm Brew tile ID into its components.
   * @returns {{ subTheme: string, filename: string }|null}
   */
  static parseRealmBrewTileId(tileId) {
    if (!tileId || !tileId.startsWith('rb:')) return null;
    const parts = tileId.split(':');
    if (parts.length < 3) return null;
    return { subTheme: parts[1], filename: parts.slice(2).join(':') };
  }

  /**
   * Check if an overlay ID is a Realm Brew overlay.
   * RB overlay IDs look like: "rb-overlay:pack-id:filename.png"
   */
  static isRealmBrewOverlay(overlayId) {
    return overlayId && overlayId.startsWith('rb-overlay:');
  }

  /**
   * Parse a Realm Brew overlay ID.
   * @returns {{ packId: string, filename: string }|null}
   */
  static parseRealmBrewOverlayId(overlayId) {
    if (!overlayId || !overlayId.startsWith('rb-overlay:')) return null;
    const parts = overlayId.split(':');
    if (parts.length < 3) return null;
    return { packId: parts[1], filename: parts.slice(2).join(':') };
  }

  _drawRbOverlay(ctx, ov, cx, cy, cellSize) {
    const rbInfo = Editor.parseRealmBrewOverlayId(ov.id);
    if (!rbInfo) return;

    const img = this._realmBrew.getOverlayImage(rbInfo.packId, rbInfo.filename);
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const rotation = ov.rotation || 0;
    const opacity = ov.opacity != null ? ov.opacity : 1.0;
    const sizeKey = ov.size || 'medium';
    const sizeRatios = { small: 0.3, medium: 0.6, large: 0.9 };
    const ratio = sizeRatios[sizeKey] || 0.6;
    const drawSize = Math.round(cellSize * ratio);

    ctx.save();
    if (opacity < 1.0) ctx.globalAlpha = opacity;

    if (rotation !== 0) {
      ctx.translate(cx, cy);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.drawImage(img, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    } else {
      ctx.drawImage(img, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);
    }

    ctx.restore();
  }

  /* ---- Overlay Placement ---- */
  _placeOverlay(col, row, cellType) {
    // Special overlays need a dialog first
    if (this._selectedOverlay === 'text-label' || this._selectedOverlay === 'title-banner') {
      this._showTextLabelDialog(col, row, cellType);
      return;
    }
    if (this._selectedOverlay === 'scale-bar') {
      this._showScaleBarDialog(col, row, cellType);
      return;
    }

    const cell = this._grid.getCell(col, row, cellType);
    if (!cell) return;
    if (!cell.overlays) cell.overlays = [];
    if (cell.overlays.length >= 5) {
      this._app.announce('Maximum 5 overlays per cell');
      return;
    }

    const overlay = {
      id: this._selectedOverlay,
      rotation: 0,
      opacity: 1.0,
      size: 'medium'
    };

    const cmd = cmdPlaceOverlay(this._grid, col, row, cellType, overlay);
    cmd.apply();
    this._history.push(cmd);
    this._dirty = true;
    this._markSaveDirty();
    this._sound.playChime();
    this._addToRecent(this._selectedOverlay);
    let placedName;
    if (Editor.isRealmBrewOverlay(this._selectedOverlay)) {
      const rbInfo = Editor.parseRealmBrewOverlayId(this._selectedOverlay);
      placedName = rbInfo ? RealmBrewLoader.overlayDisplayName(rbInfo.filename) : this._selectedOverlay;
    } else {
      placedName = this._overlayRenderer.getOverlay(this._selectedOverlay)?.name || this._selectedOverlay;
    }
    this._app.announce('Placed ' + placedName);
  }

  _deleteLastOverlay() {
    if (this._state !== EditorState.CELL_SELECTED || !this._selectedCell) return;
    const { col, row, cellType } = this._selectedCell;
    const cell = this._grid.getCell(col, row, cellType);
    if (!cell || !cell.overlays || cell.overlays.length === 0) return;

    // Remove selected overlay or last one
    let idx;
    if (this._selectedCellOverlayIndex >= 0 && this._selectedCellOverlayIndex < cell.overlays.length) {
      idx = this._selectedCellOverlayIndex;
    } else {
      idx = cell.overlays.length - 1;
    }
    const removedOverlay = { ...cell.overlays[idx] };
    const cmd = cmdRemoveOverlay(this._grid, col, row, cellType, idx, removedOverlay);
    cmd.apply();
    this._history.push(cmd);
    this._selectedCellOverlayIndex = -1;
    this._markSaveDirty();
    this._dirty = true;
    this._sound.playErase();
    this._updatePropertiesPanel();
    this._app.announce('Overlay removed');
  }

  /* ---- Properties Panel ---- */
  _bindPropertiesControls() {
    // Rotation buttons
    document.querySelectorAll('.rot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const rot = parseInt(btn.dataset.rotation, 10);
        this._setOverlayRotation(rot);
      });
    });

    // Opacity slider
    const slider = document.getElementById('opacity-slider');
    if (slider) {
      slider.addEventListener('input', () => {
        this._setOverlayOpacity(parseFloat(slider.value));
      });
    }

    // Size buttons
    document.querySelectorAll('.size-sel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._setOverlaySize(btn.dataset.size);
      });
    });

    // Clear overlays button
    const clearBtn = document.getElementById('btn-clear-overlays');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this._clearCellOverlays());
    }
  }

  _updatePropertiesPanel() {
    const coordsEl = document.getElementById('properties-coords');
    const baseEl = document.getElementById('properties-base');
    const overlayListEl = document.getElementById('overlay-list');
    const controlsEl = document.getElementById('properties-controls');

    if (!this._selectedCell) {
      if (coordsEl) coordsEl.textContent = '';
      if (baseEl) baseEl.textContent = '';
      if (overlayListEl) overlayListEl.replaceChildren();
      if (controlsEl) controlsEl.classList.add('hidden');
      return;
    }

    const { col, row, cellType } = this._selectedCell;
    const cell = this._grid.getCell(col, row, cellType);

    if (coordsEl) {
      let label = `(${col}, ${row})`;
      if (cellType === 'sq') label += ' sq';
      coordsEl.textContent = label;
    }

    if (baseEl) {
      let baseName = 'Empty';
      if (cell && cell.base) {
        if (Editor.isRealmBrewTile(cell.base)) {
          const rbInfo = Editor.parseRealmBrewTileId(cell.base);
          baseName = rbInfo ? RealmBrewLoader.tileDisplayName(rbInfo.filename) : cell.base;
        } else {
          baseName = this._tileRenderer.getType(cell.base)?.name || cell.base;
        }
      }
      baseEl.textContent = baseName;
    }

    if (overlayListEl) {
      overlayListEl.replaceChildren();
      const overlays = cell?.overlays || [];
      for (let i = 0; i < overlays.length; i++) {
        const ov = overlays[i];
        const chip = document.createElement('div');
        chip.className = 'overlay-chip' + (i === this._selectedCellOverlayIndex ? ' selected' : '');
        chip.setAttribute('role', 'listitem');

        let ovName;
        if (Editor.isRealmBrewOverlay(ov.id)) {
          const rbInfo = Editor.parseRealmBrewOverlayId(ov.id);
          ovName = rbInfo ? RealmBrewLoader.overlayDisplayName(rbInfo.filename) : ov.id;
        } else {
          ovName = this._overlayRenderer.getOverlay(ov.id)?.name || ov.id;
        }

        const nameSpan = document.createElement('span');
        nameSpan.textContent = ovName;
        chip.appendChild(nameSpan);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'chip-remove';
        removeBtn.textContent = '\u2715';
        removeBtn.setAttribute('aria-label', 'Remove ' + ovName);
        removeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const removedOverlay = { ...cell.overlays[i] };
          const cmd = cmdRemoveOverlay(this._grid, col, row, cellType, i, removedOverlay);
          cmd.apply();
          this._history.push(cmd);
          this._selectedCellOverlayIndex = -1;
          this._dirty = true;
          this._markSaveDirty();
          this._updatePropertiesPanel();
          this._app.announce('Overlay removed');
        });
        chip.appendChild(removeBtn);

        chip.addEventListener('click', () => {
          this._selectedCellOverlayIndex = i;
          this._updatePropertiesPanel();
          this._updatePropertyControlValues();
        });

        overlayListEl.appendChild(chip);
      }
    }

    if (controlsEl) {
      const hasOverlays = cell?.overlays?.length > 0;
      controlsEl.classList.toggle('hidden', !hasOverlays);
    }

    this._updatePropertyControlValues();
  }

  _updatePropertyControlValues() {
    if (!this._selectedCell || this._selectedCellOverlayIndex < 0) return;
    const cell = this._grid.getCell(this._selectedCell.col, this._selectedCell.row, this._selectedCell.cellType);
    if (!cell || !cell.overlays || this._selectedCellOverlayIndex >= cell.overlays.length) return;
    const ov = cell.overlays[this._selectedCellOverlayIndex];

    // Update rotation buttons
    document.querySelectorAll('.rot-btn').forEach(btn => {
      btn.setAttribute('aria-checked', parseInt(btn.dataset.rotation, 10) === (ov.rotation || 0) ? 'true' : 'false');
    });

    // Update opacity slider
    const slider = document.getElementById('opacity-slider');
    if (slider) slider.value = ov.opacity != null ? ov.opacity : 1.0;
    const valEl = document.getElementById('opacity-value');
    if (valEl) valEl.textContent = (ov.opacity != null ? ov.opacity : 1.0).toFixed(1);

    // Update size buttons
    document.querySelectorAll('.size-sel-btn').forEach(btn => {
      btn.setAttribute('aria-checked', btn.dataset.size === (ov.size || 'medium') ? 'true' : 'false');
    });
  }

  _setOverlayRotation(rotation) {
    const ov = this._getSelectedCellOverlay();
    if (!ov || !this._selectedCell) return;
    const oldRot = ov.rotation || 0;
    if (oldRot === rotation) return;
    const { col, row, cellType } = this._selectedCell;
    const cmd = cmdRotateOverlay(this._grid, col, row, cellType, this._selectedCellOverlayIndex, oldRot, rotation);
    cmd.apply();
    this._history.push(cmd);
    this._overlayRenderer.clearCache();
    this._dirty = true;
    this._markSaveDirty();
    this._updatePropertyControlValues();
  }

  _setOverlayOpacity(opacity) {
    const ov = this._getSelectedCellOverlay();
    if (!ov) return;
    ov.opacity = Math.round(opacity * 10) / 10;
    this._dirty = true;
    this._markSaveDirty();
    const valEl = document.getElementById('opacity-value');
    if (valEl) valEl.textContent = ov.opacity.toFixed(1);
  }

  _setOverlaySize(size) {
    const ov = this._getSelectedCellOverlay();
    if (!ov) return;
    ov.size = size;
    this._overlayRenderer.clearCache();
    this._dirty = true;
    this._markSaveDirty();
    this._updatePropertyControlValues();
  }

  _getSelectedCellOverlay() {
    if (!this._selectedCell || this._selectedCellOverlayIndex < 0) return null;
    const cell = this._grid.getCell(this._selectedCell.col, this._selectedCell.row, this._selectedCell.cellType);
    if (!cell || !cell.overlays || this._selectedCellOverlayIndex >= cell.overlays.length) return null;
    return cell.overlays[this._selectedCellOverlayIndex];
  }

  _clearCellOverlays() {
    if (!this._selectedCell) return;
    const { col, row, cellType } = this._selectedCell;
    const cell = this._grid.getCell(col, row, cellType);
    if (!cell || !cell.overlays || cell.overlays.length === 0) return;
    // Remove overlays one by one in reverse order so undo replays correctly
    for (let i = cell.overlays.length - 1; i >= 0; i--) {
      const removedOverlay = { ...cell.overlays[i] };
      const cmd = cmdRemoveOverlay(this._grid, col, row, cellType, i, removedOverlay);
      cmd.apply();
      this._history.push(cmd);
    }
    this._selectedCellOverlayIndex = -1;
    this._dirty = true;
    this._markSaveDirty();
    this._updatePropertiesPanel();
    this._app.announce('All overlays cleared');
  }

  /* ---- Undo / Redo ---- */

  _doUndo() {
    const cmd = this._history.undo();
    if (cmd) {
      this._dirty = true;
      this._markSaveDirty();
      this._sound.playClick();
      this._app.announce('Undo');
    }
  }

  _doRedo() {
    const cmd = this._history.redo();
    if (cmd) {
      this._dirty = true;
      this._markSaveDirty();
      this._sound.playClick();
      this._app.announce('Redo');
    }
  }

  /* ---- Eraser ---- */

  _toggleEraser() {
    this._eraserMode = !this._eraserMode;
    if (this._eraserMode && this._fillMode) this._fillMode = false;
    const eraserBtn = document.getElementById('btn-eraser');
    if (eraserBtn) eraserBtn.setAttribute('aria-pressed', this._eraserMode ? 'true' : 'false');
    const fillBtn = document.getElementById('btn-fill-tool');
    if (fillBtn) fillBtn.setAttribute('aria-pressed', 'false');
    this._app.announce(this._eraserMode ? 'Eraser on' : 'Eraser off');
    this._updateCursor();
  }

  _eraseCell(col, row, cellType) {
    const cell = this._grid.getCell(col, row, cellType);
    if (!cell) return;
    if (!cell.base && (!cell.overlays || cell.overlays.length === 0)) return;

    const oldBase = cell.base;
    const oldOverlays = cell.overlays ? cell.overlays.map(o => ({ ...o })) : [];

    const cmd = cmdClearCell(this._grid, col, row, cellType, oldBase, oldOverlays, this._tileRenderer);
    cmd.apply();
    this._history.push(cmd);
    this._dirty = true;
    this._markSaveDirty();
    this._sound.playErase();
  }

  _eraseCellDrag(col, row, cellType) {
    const cell = this._grid.getCell(col, row, cellType);
    if (!cell) return;
    if (!cell.base && (!cell.overlays || cell.overlays.length === 0)) return;

    const oldBase = cell.base;
    const oldOverlays = cell.overlays ? cell.overlays.map(o => ({ ...o })) : [];

    // Clear the cell immediately
    this._grid.setBase(col, row, null, cellType);
    if (cell.overlays) cell.overlays = [];
    this._tileRenderer.markDirty(this._grid, col, row, cellType);

    if (!this._eraseStroke) this._eraseStroke = [];
    this._eraseStroke.push({ col, row, cellType, oldBase, oldOverlays });
    this._dirty = true;
    this._markSaveDirty();
  }

  /* ---- Drag End (commit batched strokes) ---- */

  _handleDragEnd() {
    // Commit paint stroke
    if (this._paintStroke && this._paintStroke.length > 0) {
      const cmd = cmdPaintTiles(this._grid, this._paintStroke, this._tileRenderer);
      this._history.push(cmd);
      this._sound.playPlace();
    }
    this._paintStroke = null;

    // Commit erase stroke
    if (this._eraseStroke && this._eraseStroke.length > 0) {
      const cmd = cmdEraseCells(this._grid, this._eraseStroke, this._tileRenderer);
      this._history.push(cmd);
      this._sound.playErase();
    }
    this._eraseStroke = null;
  }

  /* ---- Rotate Selected Overlay ---- */

  _rotateSelectedOverlay() {
    if (!this._selectedCell || this._selectedCellOverlayIndex < 0) return;
    const cell = this._grid.getCell(this._selectedCell.col, this._selectedCell.row, this._selectedCell.cellType);
    if (!cell || !cell.overlays || this._selectedCellOverlayIndex >= cell.overlays.length) return;
    const ov = cell.overlays[this._selectedCellOverlayIndex];
    const oldRot = ov.rotation || 0;
    const newRot = (oldRot + 90) % 360;

    const cmd = cmdRotateOverlay(
      this._grid, this._selectedCell.col, this._selectedCell.row,
      this._selectedCell.cellType, this._selectedCellOverlayIndex, oldRot, newRot
    );
    cmd.apply();
    this._history.push(cmd);
    this._overlayRenderer.clearCache();
    this._dirty = true;
    this._markSaveDirty();
    this._updatePropertyControlValues();
    this._app.announce('Rotated to ' + newRot + ' degrees');
  }

  /* ---- Sound Toggle ---- */

  _toggleSound() {
    this._sound.enabled = !this._sound.enabled;
    const btn = document.getElementById('btn-sound-toggle');
    if (btn) btn.setAttribute('aria-pressed', this._sound.enabled ? 'true' : 'false');
    this._app.announce(this._sound.enabled ? 'Sound on' : 'Sound off');
  }

  /* ---- Clear All ---- */

  _showClearAllDialog() {
    const dialog = document.getElementById('clear-all-dialog');
    if (!dialog) return;
    this._clearAllPrevFocus = document.activeElement;
    dialog.classList.remove('hidden');
    dialog.removeAttribute('aria-hidden');
    const confirmBtn = document.getElementById('btn-clear-all-confirm');
    if (confirmBtn) confirmBtn.focus();

    // Focus trap + Escape
    this._clearAllTrapHandler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this._closeClearAllDialog();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = dialog.querySelectorAll('button:not([disabled])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    dialog.addEventListener('keydown', this._clearAllTrapHandler);
  }

  _closeClearAllDialog() {
    const dialog = document.getElementById('clear-all-dialog');
    if (!dialog) return;
    dialog.classList.add('hidden');
    dialog.setAttribute('aria-hidden', 'true');
    if (this._clearAllTrapHandler) {
      dialog.removeEventListener('keydown', this._clearAllTrapHandler);
      this._clearAllTrapHandler = null;
    }
    if (this._clearAllPrevFocus) {
      this._clearAllPrevFocus.focus();
      this._clearAllPrevFocus = null;
    }
  }

  _doClearAll() {
    this._closeClearAllDialog();

    // Snapshot current state for undo
    const savedState = [];
    this._grid.forEachCell((col, row, cell, cellType) => {
      if (cell.base || (cell.overlays && cell.overlays.length > 0)) {
        savedState.push({
          col, row, cellType,
          oldBase: cell.base,
          oldOverlays: cell.overlays ? cell.overlays.map(o => ({ ...o })) : []
        });
      }
    });

    if (savedState.length === 0) return;

    const cmd = cmdClearAll(this._grid, savedState, this._tileRenderer);
    cmd.apply();
    this._history.push(cmd);
    this._dirty = true;
    this._markSaveDirty();
    this._app.announce('All tiles cleared');
  }

  /* ---- Auto-Fill ---- */

  _doAutoFill() {
    const tileIds = this._themeManager.getAvailableTiles(this._themeId);
    if (!tileIds || tileIds.length === 0) return;

    // Build weighted tile list — first few tiles in theme list are "common" (higher weight)
    const weighted = [];
    for (let i = 0; i < tileIds.length; i++) {
      // First 1/3 of tiles get 3x weight, middle 1/3 get 2x, rest get 1x
      const third = Math.floor(tileIds.length / 3);
      const weight = i < third ? 3 : (i < third * 2 ? 2 : 1);
      for (let w = 0; w < weight; w++) {
        weighted.push(tileIds[i]);
      }
    }

    // Collect all empty cells
    const cellsToFill = [];
    this._grid.forEachCell((col, row, cell, cellType) => {
      if (!cell.base) {
        const newBase = weighted[Math.floor(Math.random() * weighted.length)];
        cellsToFill.push({ col, row, cellType, newBase });
      }
    });

    if (cellsToFill.length === 0) {
      this._app.announce('No empty cells to fill.');
      return;
    }

    // Apply as single undo command
    const cmd = cmdAutoFill(this._grid, cellsToFill, this._tileRenderer);
    cmd.apply();
    this._history.push(cmd);
    this._dirty = true;
    this._markSaveDirty();
    if (this._sound) this._sound.play('fill');
    this._app.announce(cellsToFill.length + ' cells filled with random terrain.');
  }

  /* ---- Keyboard Shortcuts Modal ---- */

  _showShortcuts() {
    const dialog = document.getElementById('shortcuts-dialog');
    if (!dialog) return;
    this._shortcutsPrevFocus = document.activeElement;
    dialog.classList.remove('hidden');
    dialog.removeAttribute('aria-hidden');
    const closeBtn = document.getElementById('btn-shortcuts-close');
    if (closeBtn) closeBtn.focus();

    // Focus trap + Escape
    this._shortcutsTrapHandler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this._closeShortcuts();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = dialog.querySelectorAll('button:not([disabled])');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    dialog.addEventListener('keydown', this._shortcutsTrapHandler);
  }

  _closeShortcuts() {
    const dialog = document.getElementById('shortcuts-dialog');
    if (!dialog) return;
    dialog.classList.add('hidden');
    dialog.setAttribute('aria-hidden', 'true');
    if (this._shortcutsTrapHandler) {
      dialog.removeEventListener('keydown', this._shortcutsTrapHandler);
      this._shortcutsTrapHandler = null;
    }
    if (this._shortcutsPrevFocus) {
      this._shortcutsPrevFocus.focus();
      this._shortcutsPrevFocus = null;
    }
  }
}
