/* Magical Map Maker — Editor State Machine & RAF Loop Owner */

const EditorState = {
  IDLE: 'IDLE',
  TILE_SELECTED: 'TILE_SELECTED',
  FILL_MODE: 'FILL_MODE'
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
    this._selectedCell = null; // { col, row, cellType? }
    this._brushSize = 1;
    this._showGrid = true;
    this._fillMode = false;
    this._panMode = false;

    this._fillHighlight = null;
    this._fillHighlightTimer = null;
    this._hoveredCell = null;

    // Sub-systems
    this._grid = null;
    this._camera = null;
    this._tileRenderer = null;
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
    await Promise.all([
      this._themeManager.load(),
      this._tileRenderer.load()
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

    // Camera
    this._camera = new Camera();

    // Animation manager
    this._animation = new AnimationManager();

    // Palette
    const tileIds = this._themeManager.getAvailableTiles(this._themeId);
    this._palette = new Palette(this._paletteEl, this._tileRenderer, (tileId) => {
      this._selectedTile = tileId;
      this._state = this._fillMode ? EditorState.FILL_MODE : EditorState.TILE_SELECTED;
      this._dirty = true;
    }, this._shape);
    this._palette.populate(tileIds);

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
    const nameEl = this._toolbarEl.querySelector('.toolbar-center');
    if (nameEl) nameEl.textContent = this._mapName;

    // Map Life button initial state
    this._updateMapLifeUI();

    // Window resize
    this._boundResize = () => {
      this._resizeCanvas();
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
    if (this._input) { this._input.destroy(); this._input = null; }
    if (this._palette) { this._palette.destroy(); this._palette = null; }
    if (this._animation) { this._animation.destroy(); this._animation = null; }
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
      const landFx = !isWater && tileType ? this._animation.getLandEffects(cell.base, tileType.pattern, col, row) : null;

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

      // Farm animal shadow (farmland only)
      if (fx.animalShadow) {
        const t = this._animation.animationTime;
        const kind = Math.floor((t * 0.2 + (x + y) * 0.01) % 3);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        const ax = x + w * (0.3 + Math.sin(t * 0.5) * 0.15);
        const ay = y + h * (0.55 + Math.cos(t * 0.4) * 0.08);
        ctx.beginPath();
        if (kind === 0) {
          // Chicken — small oval with head dot
          ctx.ellipse(ax, ay, 1.8, 1.2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ax + 1.5, ay - 0.8, 0.6, 0, Math.PI * 2);
        } else if (kind === 1) {
          // Cow — larger rectangular shadow
          ctx.ellipse(ax, ay, 4, 2.2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ax + 3.5, ay - 0.5, 1.2, 0, Math.PI * 2);
        } else {
          // Pig — round compact shadow
          ctx.ellipse(ax, ay, 2.8, 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ax + 2, ay - 0.3, 0.9, 0, Math.PI * 2);
        }
        ctx.fill();
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
    } else if (fx.type === 'constructed') {
      // Road/bridge dust
      if (fx.trafficDust) {
        const t = this._animation.animationTime;
        ctx.fillStyle = 'rgba(160, 140, 120, 0.1)';
        const dustX = x + w * (0.3 + Math.sin(t * 2) * 0.2);
        const dustY = y + h * 0.6;
        ctx.beginPath();
        ctx.ellipse(dustX, dustY, 3, 2, 0, 0, Math.PI * 2);
        ctx.fill();
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

      // Livestock shadow (goats/sheep on hills)
      if (fx.livestockShadow) {
        const t = this._animation.animationTime;
        const kind = Math.floor((t * 0.3 + (x + y) * 0.01) % 2); // alternate goat/sheep
        ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
        const lx = x + w * (0.25 + Math.sin(t * 0.8) * 0.2);
        const ly = y + h * (0.6 + Math.cos(t * 0.6) * 0.1);
        ctx.beginPath();
        if (kind === 0) {
          // Goat-like shadow — small body with tiny head bump
          ctx.ellipse(lx, ly, 3, 1.8, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(lx + 2.5, ly - 1, 1, 0, Math.PI * 2);
        } else {
          // Sheep-like shadow — rounder, fluffier
          ctx.ellipse(lx, ly, 3.5, 2.5, 0, 0, Math.PI * 2);
        }
        ctx.fill();
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

    // No tile selected — select cell for inspection
    const cell = this._grid.getCell(col, row, cellType);
    if (cell && cell.base) {
      this._selectedCell = { col, row, cellType };
      this._app.announce('Selected cell at column ' + (col + 1) + ', row ' + (row + 1) + ': ' + cell.base);
    } else {
      this._selectedCell = null;
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
    if (changed) this._dirty = true;
  }

  _doFill(col, row, cellType) {
    const filledCells = this._grid.floodFill(col, row, this._selectedTile, 500, cellType);
    if (filledCells.length > 0) {
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

  /* ---- Keyboard ---- */
  _handleKeyAction(action) {
    this._animation.noteInteraction();
    switch (action) {
      case 'escape':
        this._selectedTile = null;
        this._selectedCell = null;
        this._state = EditorState.IDLE;
        this._palette.clearSelection();
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
    }
  }
}
