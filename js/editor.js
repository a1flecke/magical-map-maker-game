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

    this._fillHighlight = null;
    this._fillHighlightTimer = null;
    this._hoveredCell = null;

    // Overlay state
    this._selectedOverlay = null; // overlay ID to place
    this._selectedCellOverlayIndex = -1; // which overlay in cell is selected for editing

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
  }

  async init() {
    this._ctx = this._canvasEl.getContext('2d');

    // Load data
    this._themeManager = new ThemeManager();
    this._tileRenderer = new TileRenderer();
    this._overlayRenderer = new OverlayRenderer();
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
      onHoverCell: (cell) => this._handleHoverCell(cell)
    });

    // Toolbar
    this._bindToolbar();

    // Map name display
    const nameDisplay = document.getElementById('map-name-display');
    if (nameDisplay) nameDisplay.textContent = this._mapName;

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
      }
    };
    document.addEventListener('keydown', this._boundKeyboardSave);

    // Auto-save every 30 seconds (only if dirty)
    this._autoSaveTimer = setInterval(() => {
      if (this._saveDirty && this._storage) {
        this.saveMap();
        this._app.announce('Map saved');
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
          ctx.lineTo(lx + (Math.random() - 0.5) * 2, ly + 8);
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
      gridBtn.classList.toggle('active', this._showGrid);
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
    this._app.announce(this._fillMode ? 'Fill mode on' : 'Fill mode off');
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
  }

  _cycleMapLife() {
    const newMode = this._animation.cycleMapLife();
    this._updateMapLifeUI();
    this._dirty = true;
    const labels = { full: 'Full', subtle: 'Subtle', still: 'Still' };
    this._app.announce('Map Life: ' + labels[newMode]);
  }

  _updateMapLifeUI() {
    const btn = document.getElementById('btn-map-life');
    if (!btn || !this._animation) return;
    const mode = this._animation.mapLifeMode;
    const labels = { full: 'Life: Full', subtle: 'Life: Subtle', still: 'Life: Still' };
    btn.textContent = labels[mode] || 'Life: Full';
    btn.setAttribute('aria-label', 'Map Life animation mode: ' + mode + '. Click to cycle.');
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
        toggleBtn.innerHTML = 'Properties &#9660;';
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
    if (this._panMode || !this._selectedTile || this._fillMode) return;
    this._animation.noteInteraction();
    this._paintBrush(col, row, cellType);
  }

  _paintBrush(col, row, cellType) {
    // For non-square grids, brush size > 1 paints neighbors
    if (this._brushSize === 1 || this._shape !== 'square') {
      let changed = false;
      if (this._grid.setBase(col, row, this._selectedTile, cellType)) {
        changed = true;
        this._tileRenderer.markDirty(this._grid, col, row, cellType);
      }

      // For brush > 1 on non-square, paint immediate neighbors
      if (this._brushSize >= 2 && this._shape !== 'square') {
        const neighbors = this._grid.getNeighbors(col, row, cellType);
        for (const n of neighbors) {
          if (this._grid.setBase(n.col, n.row, this._selectedTile, n.cellType)) {
            changed = true;
            this._tileRenderer.markDirty(this._grid, n.col, n.row, n.cellType);
          }
        }
      }
      if (this._brushSize >= 3 && this._shape !== 'square') {
        const neighbors = this._grid.getNeighbors(col, row, cellType);
        for (const n of neighbors) {
          const n2 = this._grid.getNeighbors(n.col, n.row, n.cellType);
          for (const nn of n2) {
            if (this._grid.setBase(nn.col, nn.row, this._selectedTile, nn.cellType)) {
              changed = true;
              this._tileRenderer.markDirty(this._grid, nn.col, nn.row, nn.cellType);
            }
          }
        }
      }
      if (changed) this._dirty = true;
      return;
    }

    // Square grid: standard NxN brush
    const half = Math.floor(this._brushSize / 2);
    let changed = false;
    for (let dr = -half; dr < this._brushSize - half; dr++) {
      for (let dc = -half; dc < this._brushSize - half; dc++) {
        if (this._grid.setBase(col + dc, row + dr, this._selectedTile)) {
          changed = true;
          this._tileRenderer.markDirty(this._grid, col + dc, row + dr);
        }
      }
    }
    if (changed) {
      this._dirty = true;
      this._markSaveDirty();
    }
  }

  _doFill(col, row, cellType) {
    const filledCells = this._grid.floodFill(col, row, this._selectedTile, 500, cellType);
    if (filledCells.length > 0) {
      this._markSaveDirty();
      // Mark all filled cells + their neighbors dirty
      for (const c of filledCells) {
        this._tileRenderer.markDirty(this._grid, c.col, c.row, c.cellType);
      }
      this._dirty = true;
      this._app.announce('Filled ' + filledCells.length + ' cells');

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

          setTimeout(() => this._closeExportDialog(), 500);
        } catch (err) {
          console.error('Export failed:', err);
          this._app.announce('Export failed. Try a smaller map or lower quality.');
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
    } catch (e) {
      console.error('Save failed:', e);
      this._app.announce('Save failed. Storage may be full.');
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
    input.focus();
    input.select();

    const commit = () => {
      const newName = input.value.trim();
      if (newName) {
        this._mapName = newName;
        nameDisplay.textContent = this._mapName;
        this._markSaveDirty();
      }
      input.remove();
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
        this._dirty = true;
        this._app.announce('Selection cleared');
        break;
      case 'fill-toggle': this._toggleFillMode(); break;
      case 'grid-toggle': this._toggleGrid(); break;
      case 'pan-toggle': this._togglePanMode(); break;
      case 'brush-1': this._setBrushSize(1); break;
      case 'brush-2': this._setBrushSize(2); break;
      case 'brush-3': this._setBrushSize(3); break;
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
        }
      }
    });
  }

  /* ---- Overlay Palette Setup ---- */
  _initOverlayPalette() {
    const theme = this._themeManager.getTheme(this._themeId);
    const themeOverlays = this._overlayRenderer.getThemeOverlays(this._themeId);
    const universalOverlays = this._overlayRenderer.getUniversalOverlays();

    this._populateOverlayList('theme-overlay-list', themeOverlays);
    this._populateOverlayList('universal-overlay-list', universalOverlays);

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
        toggleBtn.innerHTML = 'Properties ' + (isHidden ? '&#9650;' : '&#9660;');
        // Resize canvas since properties panel changed height
        this._resizeCanvas();
        this._dirty = true;
      });
    }

    // Properties controls
    this._bindPropertiesControls();
  }

  _populateOverlayList(listId, overlays) {
    const listEl = document.getElementById(listId);
    if (!listEl) return;
    listEl.replaceChildren();

    for (const ov of overlays) {
      const option = document.createElement('div');
      option.className = 'overlay-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.setAttribute('aria-label', ov.name);
      option.setAttribute('tabindex', '0');
      option.dataset.overlayId = ov.id;

      // Preview canvas
      const previewSize = 44;
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

      option.addEventListener('click', () => this._selectOverlay(ov.id));
      option.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._selectOverlay(ov.id);
        }
      });

      listEl.appendChild(option);
    }
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
    document.querySelectorAll('.overlay-option').forEach(opt => {
      const name = opt.getAttribute('aria-label') || '';
      const match = !query || name.toLowerCase().includes(query);
      if (match) {
        opt.removeAttribute('aria-hidden');
        opt.style.display = '';
      } else {
        opt.setAttribute('aria-hidden', 'true');
        opt.style.display = 'none';
      }
    });
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
    const cell = this._grid.getCell(col, row, cellType);
    if (!cell) return;
    if (!cell.overlays) cell.overlays = [];
    if (cell.overlays.length >= 5) {
      this._app.announce('Maximum 5 overlays per cell');
      return;
    }

    cell.overlays.push({
      id: this._selectedOverlay,
      rotation: 0,
      opacity: 1.0,
      size: 'medium'
    });
    this._dirty = true;
    this._markSaveDirty();
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
    const cell = this._grid.getCell(this._selectedCell.col, this._selectedCell.row, this._selectedCell.cellType);
    if (!cell || !cell.overlays || cell.overlays.length === 0) return;

    // Remove selected overlay or last one
    if (this._selectedCellOverlayIndex >= 0 && this._selectedCellOverlayIndex < cell.overlays.length) {
      cell.overlays.splice(this._selectedCellOverlayIndex, 1);
      this._selectedCellOverlayIndex = -1;
    } else {
      cell.overlays.pop();
    }
    this._markSaveDirty();
    this._dirty = true;
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
          cell.overlays.splice(i, 1);
          this._selectedCellOverlayIndex = -1;
          this._dirty = true;
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
      btn.setAttribute('aria-pressed', parseInt(btn.dataset.rotation, 10) === (ov.rotation || 0) ? 'true' : 'false');
    });

    // Update opacity slider
    const slider = document.getElementById('opacity-slider');
    if (slider) slider.value = ov.opacity != null ? ov.opacity : 1.0;
    const valEl = document.getElementById('opacity-value');
    if (valEl) valEl.textContent = (ov.opacity != null ? ov.opacity : 1.0).toFixed(1);

    // Update size buttons
    document.querySelectorAll('.size-sel-btn').forEach(btn => {
      btn.setAttribute('aria-pressed', btn.dataset.size === (ov.size || 'medium') ? 'true' : 'false');
    });
  }

  _setOverlayRotation(rotation) {
    const ov = this._getSelectedCellOverlay();
    if (!ov) return;
    ov.rotation = rotation;
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
    const cell = this._grid.getCell(this._selectedCell.col, this._selectedCell.row, this._selectedCell.cellType);
    if (!cell || !cell.overlays) return;
    cell.overlays = [];
    this._selectedCellOverlayIndex = -1;
    this._dirty = true;
    this._markSaveDirty();
    this._updatePropertiesPanel();
    this._app.announce('All overlays cleared');
  }
}
