/* Magical Map Maker — Tile Definitions & Procedural Rendering */

/* ---- Perlin Noise Utility ---- */

const PerlinNoise = (() => {
  // Permutation table (deterministic)
  const _perm = new Uint8Array(512);
  const _grad = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1]
  ];

  // Initialize with fixed seed
  const seed = 42;
  let s = seed;
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) _perm[i] = p[i & 255];

  function _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function _lerp(a, b, t) { return a + t * (b - a); }
  function _dot(gi, x, y) {
    const g = _grad[gi & 7];
    return g[0] * x + g[1] * y;
  }

  function noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = _fade(xf);
    const v = _fade(yf);
    const aa = _perm[_perm[X] + Y];
    const ab = _perm[_perm[X] + Y + 1];
    const ba = _perm[_perm[X + 1] + Y];
    const bb = _perm[_perm[X + 1] + Y + 1];
    return _lerp(
      _lerp(_dot(aa, xf, yf), _dot(ba, xf - 1, yf), u),
      _lerp(_dot(ab, xf, yf - 1), _dot(bb, xf - 1, yf - 1), u),
      v
    );
  }

  // Pre-computed 256×256 noise texture
  let _noiseCanvas = null;
  let _noiseData = null;

  function initNoiseTexture() {
    if (_noiseCanvas) return;
    _noiseCanvas = document.createElement('canvas');
    _noiseCanvas.width = 256;
    _noiseCanvas.height = 256;
    const ctx = _noiseCanvas.getContext('2d');
    const imgData = ctx.createImageData(256, 256);
    const d = imgData.data;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const val = (noise2D(x * 0.05, y * 0.05) + 1) * 0.5;
        const byte = Math.floor(val * 255);
        const idx = (y * 256 + x) * 4;
        d[idx] = byte; d[idx + 1] = byte; d[idx + 2] = byte; d[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    _noiseData = imgData.data;
  }

  /** Sample noise texture via UV coords (0–1 range, wraps) */
  function sampleNoise(u, v) {
    if (!_noiseData) initNoiseTexture();
    const x = ((u * 256) | 0) & 255;
    const y = ((v * 256) | 0) & 255;
    return _noiseData[(y * 256 + x) * 4] / 255;
  }

  return { noise2D, initNoiseTexture, sampleNoise, getCanvas: () => _noiseCanvas };
})();


/* ---- FNV-1a Hash ---- */

function _fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(36);
}


/* ---- Tile Atlas Cache ---- */

const ATLAS_SIZE = 2048;
const MAX_ATLAS_COUNT = 2; // 2 × 2048×2048 = ~33.5MB GPU — safe for iPad
const MAX_ATLAS_ENTRIES = 200;

class TileAtlas {
  constructor() {
    this._atlases = [];
    this._atlasMap = new Map(); // cacheKey → { atlasIdx, sx, sy, sw, sh }
    this._lruKeys = [];         // ordered by most-recent-use
    this._currentAtlas = -1;
    this._packX = 0;
    this._packY = 0;
    this._packRowHeight = 0;
  }

  /** Get a cached tile region, or null */
  get(key) {
    const entry = this._atlasMap.get(key);
    if (!entry) return null;
    // LRU touch
    const idx = this._lruKeys.indexOf(key);
    if (idx > -1) this._lruKeys.splice(idx, 1);
    this._lruKeys.push(key);
    return entry;
  }

  /** Allocate a slot in the atlas and return the canvas + region to draw into */
  allocate(key, w, h) {
    // Evict if over limit
    while (this._atlasMap.size >= MAX_ATLAS_ENTRIES) {
      this._evictOldest();
    }

    // Try to fit in current atlas
    if (this._currentAtlas >= 0) {
      const slot = this._tryPack(w, h);
      if (slot) {
        const entry = { atlasIdx: this._currentAtlas, sx: slot.x, sy: slot.y, sw: w, sh: h };
        this._atlasMap.set(key, entry);
        this._lruKeys.push(key);
        return { canvas: this._atlases[this._currentAtlas], entry };
      }
    }

    // Need a new atlas
    if (this._atlases.length >= MAX_ATLAS_COUNT) {
      // Wipe oldest atlas
      this._wipeAtlas(0);
    }
    this._addAtlas();
    const slot = this._tryPack(w, h);
    if (!slot) return null; // tile too large for atlas
    const entry = { atlasIdx: this._currentAtlas, sx: slot.x, sy: slot.y, sw: w, sh: h };
    this._atlasMap.set(key, entry);
    this._lruKeys.push(key);
    return { canvas: this._atlases[this._currentAtlas], entry };
  }

  /** Get atlas canvas by index */
  getCanvas(idx) {
    return this._atlases[idx] || null;
  }

  /** Clear all atlases (zoom/DPR change) */
  clear() {
    this._atlases = [];
    this._atlasMap.clear();
    this._lruKeys = [];
    this._currentAtlas = -1;
    this._packX = 0;
    this._packY = 0;
    this._packRowHeight = 0;
  }

  get totalMemoryBytes() {
    return this._atlases.length * ATLAS_SIZE * ATLAS_SIZE * 4;
  }

  _addAtlas() {
    const c = document.createElement('canvas');
    c.width = ATLAS_SIZE;
    c.height = ATLAS_SIZE;
    this._atlases.push(c);
    this._currentAtlas = this._atlases.length - 1;
    this._packX = 0;
    this._packY = 0;
    this._packRowHeight = 0;
  }

  /** Simple row-packing allocator */
  _tryPack(w, h) {
    if (this._packX + w > ATLAS_SIZE) {
      // Next row
      this._packX = 0;
      this._packY += this._packRowHeight;
      this._packRowHeight = 0;
    }
    if (this._packY + h > ATLAS_SIZE) return null;
    const x = this._packX;
    const y = this._packY;
    this._packX += w;
    if (h > this._packRowHeight) this._packRowHeight = h;
    return { x, y };
  }

  _evictOldest() {
    if (this._lruKeys.length === 0) return;
    const oldKey = this._lruKeys.shift();
    this._atlasMap.delete(oldKey);
  }

  _wipeAtlas(idx) {
    // Remove all entries pointing to this atlas
    for (const [key, entry] of this._atlasMap) {
      if (entry.atlasIdx === idx) {
        this._atlasMap.delete(key);
        const li = this._lruKeys.indexOf(key);
        if (li > -1) this._lruKeys.splice(li, 1);
      }
    }
    // Shift atlas indices
    this._atlases.splice(idx, 1);
    for (const [, entry] of this._atlasMap) {
      if (entry.atlasIdx > idx) entry.atlasIdx--;
    }
    this._currentAtlas = this._atlases.length - 1;
    if (this._currentAtlas >= 0) {
      // Mark pack pointer past end so next allocation creates a new atlas
      this._packX = 0;
      this._packY = ATLAS_SIZE;
      this._packRowHeight = 0;
    }
  }
}


/* ---- Water tile IDs for quick lookup ---- */
/* Built dynamically from base-types.json after load; fallback set for pre-load usage */

let WATER_TILE_IDS = new Set(['ocean', 'shallow-water', 'river', 'lake', 'swamp']);

function isWaterTile(tileId) {
  return WATER_TILE_IDS.has(tileId);
}


/* ---- TileRenderer ---- */

class TileRenderer {
  constructor() {
    this._types = [];
    this._typeMap = {};
    this._atlas = new TileAtlas();
    this._loaded = false;

    // Transition mode (set by Editor on theme load)
    this._transitionMode = 'terrestrial';

    // Dirty cell tracking (set by editor, processed per-frame)
    this._dirtyCells = new Set();

    // Initialize Perlin noise texture
    PerlinNoise.initNoiseTexture();
  }

  async load() {
    if (this._loaded) return;
    const resp = await fetch('js/data/base-types.json');
    if (!resp.ok) throw new Error('Failed to load base-types.json: ' + resp.status);
    this._types = await resp.json();
    this._typeMap = {};
    for (const t of this._types) {
      this._typeMap[t.id] = t;
    }
    // Build WATER_TILE_IDS dynamically from data
    WATER_TILE_IDS = new Set(this._types.filter(t => t.waterContent).map(t => t.id));
    this._loaded = true;
  }

  getType(id) {
    return this._typeMap[id] || null;
  }

  getTypesForTheme(tileIds) {
    return tileIds.map(id => this._typeMap[id]).filter(Boolean);
  }

  /**
   * Get cached tile image from atlas.
   * Returns { atlas, sx, sy, sw, sh } for drawImage(), or null.
   * Falls back to creating one if not cached.
   */
  getTileImage(tileId, shape, cellSize, grid, col, row, cellType) {
    const type = this._typeMap[tileId];
    if (!type) return null;

    // Build neighbor-aware cache key for all tiles (neighbor context affects transitions)
    let neighborHash = '';
    if (grid) {
      neighborHash = this._getNeighborSignature(grid, col, row, cellType, tileId);
    }

    const key = neighborHash
      ? `${tileId}-${shape}-${cellSize}-${neighborHash}`
      : `${tileId}-${shape}-${cellSize}`;

    // Check atlas cache
    const cached = this._atlas.get(key);
    if (cached) {
      return { atlas: this._atlas.getCanvas(cached.atlasIdx), ...cached };
    }

    // Determine actual tile draw dimensions per shape
    let w = cellSize;
    let h = cellSize;
    if (grid) {
      if (shape === 'hex' && grid.hexW !== undefined) {
        w = grid.hexW;
        h = grid.hexH;
      } else if (shape === 'diamond' && grid.dW !== undefined) {
        w = grid.dW;
        h = grid.dH;
      } else if (shape === 'octagon' && cellType === 'sq' && grid.sqSize !== undefined) {
        w = grid.sqSize;
        h = grid.sqSize;
      }
    }

    // Render into atlas
    const alloc = this._atlas.allocate(key, w, h);
    if (!alloc) return null;

    const ctx = alloc.canvas.getContext('2d');
    ctx.save();
    ctx.translate(alloc.entry.sx, alloc.entry.sy);

    // Gather neighbor info for all tiles
    let neighbors = null;
    if (grid) {
      neighbors = this._getNeighborInfo(grid, col, row, cellType, tileId);
    }

    this._renderTile(ctx, type, w, neighbors);
    ctx.restore();

    return {
      atlas: alloc.canvas,
      atlasIdx: alloc.entry.atlasIdx,
      sx: alloc.entry.sx,
      sy: alloc.entry.sy,
      sw: w,
      sh: h
    };
  }

  /** Legacy API — still used by palette preview */
  getTileCanvas(tileId, shape, cellSize) {
    const type = this._typeMap[tileId];
    if (!type) return null;

    const key = `preview-${tileId}-${shape}-${cellSize}`;
    if (this._previewCache && this._previewCache[key]) return this._previewCache[key];

    if (!this._previewCache) this._previewCache = {};

    const canvas = document.createElement('canvas');
    canvas.width = cellSize;
    canvas.height = cellSize;
    const ctx = canvas.getContext('2d');
    this._renderTile(ctx, type, cellSize, null);

    this._previewCache[key] = canvas;
    return canvas;
  }

  /** Get neighbor signature for cache key (FNV-1a hash) */
  _getNeighborSignature(grid, col, row, cellType, tileId) {
    const neighbors = grid.getNeighbors(col, row, cellType);
    let sig = tileId + ':';
    for (const n of neighbors) {
      const cell = grid.getCell(n.col, n.row, n.cellType);
      const base = cell ? cell.base : 'empty';
      sig += `${n.col},${n.row},${n.cellType || ''},${base};`;
    }
    return _fnv1a(sig);
  }

  /** General-purpose neighbor info for all tiles */
  _getNeighborInfo(grid, col, row, cellType, tileId) {
    const neighbors = grid.getNeighbors(col, row, cellType);
    const myType = this._typeMap[tileId];
    const myProps = myType ? myType.materialProperties : null;

    const info = {
      col, row,
      tileId,
      sameTypeEdges: 0,
      waterEdges: 0,
      totalEdges: neighbors.length,
      edges: [],
      mergeMask: 0,
      materialProps: myProps
    };

    for (let i = 0; i < neighbors.length; i++) {
      const n = neighbors[i];
      const cell = grid.getCell(n.col, n.row, n.cellType);
      const nBase = cell ? cell.base : null;
      const isSameType = nBase === tileId;
      const isWater = nBase && isWaterTile(nBase);
      const nType = this._typeMap[nBase];
      const nProps = nType ? nType.materialProperties : null;

      // Material property deltas for transition rendering
      let deltas = null;
      if (myProps && nProps) {
        deltas = {
          dElevation: nProps.elevation - myProps.elevation,
          dMoisture: nProps.moisture - myProps.moisture,
          dTemperature: nProps.temperature - myProps.temperature,
          dDensity: nProps.density - myProps.density,
          dOrganic: nProps.organic - myProps.organic
        };
      }

      info.edges.push({
        col: n.col, row: n.row, cellType: n.cellType,
        tileId: nBase,
        isSameType,
        isWater,
        materialProps: nProps,
        deltas
      });

      if (isSameType) {
        info.sameTypeEdges++;
        info.mergeMask |= (1 << i);
      }
      if (isWater) info.waterEdges++;
    }
    return info;
  }

  /** Set transition rendering mode (called by Editor on theme load) */
  setTransitionMode(mode) {
    this._transitionMode = mode || 'terrestrial';
  }

  /** Mark cell + neighbors dirty */
  markDirty(grid, col, row, cellType) {
    this._dirtyCells.add(`${col},${row},${cellType || ''}`);
    const neighbors = grid.getNeighbors(col, row, cellType);
    for (const n of neighbors) {
      this._dirtyCells.add(`${n.col},${n.row},${n.cellType || ''}`);
    }
  }

  /** Process up to N dirty cells per frame (budgeted re-cache) */
  processDirtyCells(grid, shape, cellSize, maxPerFrame = 8) {
    if (this._dirtyCells.size === 0) return 0;
    let processed = 0;
    for (const key of this._dirtyCells) {
      if (processed >= maxPerFrame) break;
      const [colStr, rowStr, ct] = key.split(',');
      const col = parseInt(colStr, 10);
      const row = parseInt(rowStr, 10);
      const cellType = ct || undefined;
      const cell = grid.getCell(col, row, cellType);
      if (cell && cell.base) {
        // Invalidate all possible old cache entries for this cell
        // by removing keys matching this tile+shape+cellSize pattern
        const prefix = `${cell.base}-${shape}-${cellSize}`;
        for (const [cacheKey] of this._atlas._atlasMap) {
          if (cacheKey.startsWith(prefix)) {
            this._atlas._atlasMap.delete(cacheKey);
            const li = this._atlas._lruKeys.indexOf(cacheKey);
            if (li > -1) this._atlas._lruKeys.splice(li, 1);
          }
        }
        // Force re-render by calling getTileImage (creates fresh cache entry)
        this.getTileImage(cell.base, shape, cellSize, grid, col, row, cellType);
      }
      this._dirtyCells.delete(key);
      processed++;
    }
    return processed;
  }

  /** Clear cache (call on zoom change) */
  clearCache() {
    this._atlas.clear();
    this._previewCache = {};
  }

  /** Procedural tile rendering per pattern */
  _renderTile(ctx, type, size, neighbors) {
    const colors = type.colors;

    // Base fill
    ctx.fillStyle = colors.primary;
    ctx.fillRect(0, 0, size, size);

    switch (type.pattern) {
      case 'grass':
        this._drawGrassN64(ctx, size, colors, neighbors);
        break;
      case 'tall-grass':
        this._drawTallGrassN64(ctx, size, colors, neighbors);
        break;
      case 'wildflowers':
        this._drawWildflowersN64(ctx, size, colors, neighbors);
        break;
      case 'wheat':
        this._drawWheatN64(ctx, size, colors, neighbors);
        break;
      case 'savanna':
        this._drawSavannaN64(ctx, size, colors, neighbors);
        break;
      case 'farmland':
        this._drawFarmlandN64(ctx, size, colors, neighbors);
        break;
      case 'dense-forest':
        this._drawDenseForestN64(ctx, size, colors, neighbors);
        break;
      case 'light-woods':
        this._drawLightWoodsN64(ctx, size, colors, neighbors);
        break;
      case 'pine-forest':
        this._drawPineForestN64(ctx, size, colors, neighbors);
        break;
      case 'clearing':
        this._drawClearingN64(ctx, size, colors, neighbors);
        break;
      case 'ocean':
        this._drawOceanN64(ctx, size, colors, neighbors);
        break;
      case 'shallow-water':
        this._drawShallowWaterN64(ctx, size, colors, neighbors);
        break;
      case 'river':
        this._drawRiverN64(ctx, size, colors, neighbors);
        break;
      case 'lake':
        this._drawLakeN64(ctx, size, colors, neighbors);
        break;
      case 'swamp':
        this._drawSwampN64(ctx, size, colors, neighbors);
        break;
      case 'hills':
        this._drawHillsN64(ctx, size, colors, neighbors);
        break;
      case 'mountain':
        this._drawMountainN64(ctx, size, colors, neighbors);
        break;
      case 'desert':
        this._drawDesertN64(ctx, size, colors, neighbors);
        break;
      case 'road':
        this._drawRoadN64(ctx, size, colors, neighbors);
        break;
      case 'bridge':
        this._drawBridgeN64(ctx, size, colors, neighbors);
        break;
    }

    // Render transitions on edges with different tile types
    if (neighbors && !isWaterTile(type.id)) {
      this._renderTransitions(ctx, size, neighbors, this._transitionMode);
    }
  }

  /* ---- Seeded pseudo-random for deterministic tile textures ---- */
  _seededRand(seed) {
    let s = seed;
    return () => {
      s = (s * 16807 + 0) % 2147483647;
      return s / 2147483647;
    };
  }

  /* ==== N64-Quality Water Renderers ==== */

  _drawOceanN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Gradient depth base
    const grad = ctx.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, secondary);
    grad.addColorStop(0.5, primary);
    grad.addColorStop(1, accent);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    // Perlin-based depth variation
    ctx.globalAlpha = 0.15;
    for (let y = 0; y < s; y += 4) {
      for (let x = 0; x < s; x += 4) {
        const n = PerlinNoise.sampleNoise(x / s, y / s);
        ctx.fillStyle = n > 0.5 ? '#0D47A1' : '#1976D2';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    ctx.globalAlpha = 1;

    // Bezier wave lines
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const y = s * 0.1 + i * s * 0.2;
      const offset = i * 7;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(
        s * 0.15, y - 5 + Math.sin(offset) * 2,
        s * 0.35, y + 5 + Math.cos(offset) * 2,
        s * 0.5, y
      );
      ctx.bezierCurveTo(
        s * 0.65, y - 4 + Math.sin(offset + 1) * 2,
        s * 0.85, y + 4 + Math.cos(offset + 1) * 2,
        s, y
      );
      ctx.stroke();
    }

    // Foam caps
    const rand = this._seededRand(100);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    for (let i = 0; i < 6; i++) {
      const x = rand() * s;
      const y = rand() * s;
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + rand() * 3, 1 + rand() * 1.5, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    // Shoreline rendering if neighbors have land
    this._drawShorelines(ctx, s, neighbors);

    ctx.restore();
  }

  _drawShallowWaterN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Light base with subtle gradient
    const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.7);
    grad.addColorStop(0, secondary);
    grad.addColorStop(1, primary);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    // Visible bottom texture via Perlin
    ctx.globalAlpha = 0.12;
    for (let y = 0; y < s; y += 3) {
      for (let x = 0; x < s; x += 3) {
        const n = PerlinNoise.sampleNoise(x / s + 0.5, y / s + 0.5);
        ctx.fillStyle = n > 0.55 ? '#8D6E63' : '#BBDEFB';
        ctx.fillRect(x, y, 3, 3);
      }
    }
    ctx.globalAlpha = 1;

    // Gentle ripple lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = s * 0.15 + i * s * 0.22;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(s * 0.25, y - 2, s * 0.5, y);
      ctx.quadraticCurveTo(s * 0.75, y + 2, s, y);
      ctx.stroke();
    }

    // Sparkle dots
    const rand = this._seededRand(120);
    ctx.fillStyle = '#FFFFFF';
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 8; i++) {
      const x = rand() * s;
      const y = rand() * s;
      const r = 0.8 + rand() * 1.2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    this._drawShorelines(ctx, s, neighbors);
    ctx.restore();
  }

  _drawRiverN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Determine flow direction from neighbors
    const flowDir = this._computeFlowDirection(neighbors);

    // River bank edges + organic path
    const bankWidth = s * 0.15;
    const centerX = s * 0.5;

    // Bank fill (land color underneath)
    ctx.fillStyle = '#8D6E63';
    ctx.fillRect(0, 0, s, s);

    // Water channel — organic bezier shape
    ctx.fillStyle = primary;
    ctx.beginPath();
    if (flowDir === 'default' || flowDir === 'toward-water') {
      const n1 = PerlinNoise.sampleNoise(0.3, 0.2) * 0.15;
      const n2 = PerlinNoise.sampleNoise(0.7, 0.8) * 0.15;
      ctx.moveTo(s * (0.25 + n1), 0);
      ctx.bezierCurveTo(s * (0.2 + n1), s * 0.3, s * (0.3 - n2), s * 0.7, s * (0.28 + n2), s);
      ctx.lineTo(s * (0.72 - n2), s);
      ctx.bezierCurveTo(s * (0.7 + n2), s * 0.7, s * (0.8 - n1), s * 0.3, s * (0.75 - n1), 0);
      ctx.closePath();
    } else {
      const n1 = PerlinNoise.sampleNoise(0.2, 0.3) * 0.15;
      const n2 = PerlinNoise.sampleNoise(0.8, 0.7) * 0.15;
      ctx.moveTo(0, s * (0.25 + n1));
      ctx.bezierCurveTo(s * 0.3, s * (0.2 + n1), s * 0.7, s * (0.3 - n2), s, s * (0.28 + n2));
      ctx.lineTo(s, s * (0.72 - n2));
      ctx.bezierCurveTo(s * 0.7, s * (0.7 + n2), s * 0.3, s * (0.8 - n1), 0, s * (0.75 - n1));
      ctx.closePath();
    }
    ctx.fill();

    // Depth gradient overlay
    const depthGrad = ctx.createLinearGradient(s * 0.3, 0, s * 0.7, 0);
    depthGrad.addColorStop(0, accent);
    depthGrad.addColorStop(0.5, secondary);
    depthGrad.addColorStop(1, accent);
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = depthGrad;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Flow lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 0.8;
    const rand = this._seededRand(130);
    for (let i = 0; i < 5; i++) {
      const x = s * 0.35 + rand() * s * 0.3;
      const y1 = rand() * s * 0.3;
      const y2 = y1 + s * 0.15 + rand() * s * 0.15;
      ctx.beginPath();
      ctx.moveTo(x, y1);
      ctx.lineTo(x + (rand() - 0.5) * 4, y2);
      ctx.stroke();
    }

    // Bank detail
    ctx.strokeStyle = '#6D4C41';
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    if (flowDir === 'default' || flowDir === 'toward-water') {
      ctx.beginPath();
      ctx.moveTo(s * 0.25, 0);
      ctx.bezierCurveTo(s * 0.2, s * 0.3, s * 0.3, s * 0.7, s * 0.28, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.75, 0);
      ctx.bezierCurveTo(s * 0.8, s * 0.3, s * 0.7, s * 0.7, s * 0.72, s);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    this._drawShorelines(ctx, s, neighbors);
    ctx.restore();
  }

  _drawLakeN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Is this lake merged with neighbors? (adjacent lake tiles)
    const isMerged = neighbors && neighbors.sameTypeEdges > 0;

    if (isMerged) {
      // Full-cell water for merged lakes
      const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.7);
      grad.addColorStop(0, secondary);
      grad.addColorStop(0.7, primary);
      grad.addColorStop(1, accent);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, s, s);
    } else {
      // Single cell: contained pond with shore
      // Shore gradient around edges
      ctx.fillStyle = '#A1887F';
      ctx.fillRect(0, 0, s, s);

      const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.45);
      grad.addColorStop(0, secondary);
      grad.addColorStop(0.7, primary);
      grad.addColorStop(1, accent);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(s / 2, s / 2, s * 0.42, s * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();

      // Shore ring
      ctx.strokeStyle = '#8D6E63';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(s / 2, s / 2, s * 0.42, s * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Depth variation via Perlin
    ctx.globalAlpha = 0.1;
    for (let y = 0; y < s; y += 4) {
      for (let x = 0; x < s; x += 4) {
        const n = PerlinNoise.sampleNoise(x / s + 1.0, y / s + 1.0);
        if (n > 0.55) {
          ctx.fillStyle = accent;
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }
    ctx.globalAlpha = 1;

    // Gentle ripple rings
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 0.7;
    const rand = this._seededRand(140);
    for (let i = 0; i < 3; i++) {
      const rx = s * 0.2 + rand() * s * 0.6;
      const ry = s * 0.2 + rand() * s * 0.6;
      const r = 2 + rand() * 4;
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    this._drawShorelines(ctx, s, neighbors);
    ctx.restore();
  }

  _drawSwampN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Murky base
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, s, s);

    // Perlin-based murky patches
    ctx.globalAlpha = 0.25;
    for (let y = 0; y < s; y += 3) {
      for (let x = 0; x < s; x += 3) {
        const n = PerlinNoise.sampleNoise(x / s + 2.0, y / s + 2.0);
        if (n > 0.45) {
          ctx.fillStyle = secondary;
          ctx.fillRect(x, y, 3, 3);
        } else if (n < 0.3) {
          ctx.fillStyle = accent;
          ctx.fillRect(x, y, 3, 3);
        }
      }
    }
    ctx.globalAlpha = 1;

    // Organic mud patches
    const rand = this._seededRand(150);
    ctx.fillStyle = '#5D4037';
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(
        rand() * s, rand() * s,
        s * 0.08 + rand() * s * 0.1,
        s * 0.05 + rand() * s * 0.06,
        rand() * Math.PI, 0, Math.PI * 2
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Reed lines
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) {
      const x = rand() * s;
      const y = s * 0.4 + rand() * s * 0.6;
      const h = 8 + rand() * 10;
      ctx.strokeStyle = i % 2 === 0 ? '#33691E' : accent;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + (rand() - 0.5) * 4, y - h * 0.6, x + (rand() - 0.5) * 2, y - h);
      ctx.stroke();
      // Reed tip
      if (rand() > 0.5) {
        ctx.fillStyle = '#4E342E';
        ctx.beginPath();
        ctx.ellipse(x + (rand() - 0.5) * 2, y - h - 1.5, 1, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Gas bubbles
    ctx.fillStyle = 'rgba(200, 200, 150, 0.3)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(rand() * s, rand() * s, 1 + rand() * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    this._drawShorelines(ctx, s, neighbors);
    ctx.restore();
  }

  /* ==== Water Merge Mask + Shoreline System ==== */

  _computeFlowDirection(neighbors) {
    if (!neighbors) return 'default';
    const myCol = neighbors.col;
    const myRow = neighbors.row;
    // Check if ocean/lake neighbor → flow toward it
    for (const edge of neighbors.edges) {
      if (edge.tileId === 'ocean' || edge.tileId === 'lake') {
        return 'toward-water';
      }
    }
    // Count horizontal vs vertical river neighbors using deltas
    let hCount = 0, vCount = 0;
    for (const edge of neighbors.edges) {
      if (edge.tileId === 'river') {
        const dc = Math.abs(edge.col - myCol);
        const dr = Math.abs(edge.row - myRow);
        if (dc > dr) hCount++;
        else vCount++;
      }
    }
    if (hCount > vCount) return 'horizontal';
    return 'default';
  }

  /** Draw shorelines on water tile edges adjacent to land */
  _drawShorelines(ctx, s, neighbors) {
    if (!neighbors) return;

    const edgeCount = neighbors.edges.length;
    if (edgeCount === 0) return;

    for (let i = 0; i < edgeCount; i++) {
      const edge = neighbors.edges[i];
      if (edge.isWater || !edge.tileId) continue; // skip water neighbors and empty cells

      // This edge borders land — draw shoreline
      const matProps = edge.materialProps;
      const angle = (i / edgeCount) * Math.PI * 2;
      this._drawShorelineEdge(ctx, s, i, edgeCount, matProps, angle);
    }
  }

  /** Draw a single shoreline edge based on neighbor material */
  _drawShorelineEdge(ctx, s, edgeIdx, totalEdges, matProps, angle) {
    ctx.save();

    // Determine shoreline style from material properties
    let shoreColor = '#C8B87C'; // default sandy
    let shoreAlpha = 0.5;
    let shoreWidth = 3;

    if (matProps) {
      if (matProps.temperature <= 0.1) {
        // Frozen shoreline
        shoreColor = '#E3F2FD';
        shoreAlpha = 0.6;
      } else if (matProps.elevation >= 0.7) {
        // Rocky shoreline
        shoreColor = '#78909C';
        shoreAlpha = 0.5;
        shoreWidth = 4;
      } else if (matProps.moisture >= 0.7) {
        // Muddy shoreline
        shoreColor = '#6D4C41';
        shoreAlpha = 0.4;
      } else if (matProps.temperature >= 0.8) {
        // Volcanic
        shoreColor = '#37474F';
        shoreAlpha = 0.5;
      } else if (matProps.organic >= 0.7) {
        // Jungle roots
        shoreColor = '#33691E';
        shoreAlpha = 0.4;
        shoreWidth = 3;
      }
    }

    // Calculate edge position based on edge index and total edges
    // For square grid (4 edges): 0=top, 1=right, 2=bottom, 3=left
    // For hex (6 edges): distributed around
    const edgeFrac = edgeIdx / totalEdges;
    ctx.globalAlpha = shoreAlpha;
    ctx.strokeStyle = shoreColor;
    ctx.lineWidth = shoreWidth;

    if (totalEdges === 4) {
      // Square grid edges
      ctx.beginPath();
      switch (edgeIdx) {
        case 0: // N neighbor
          ctx.moveTo(0, 0); ctx.lineTo(s, 0); break;
        case 1: // E neighbor or S
          ctx.moveTo(s, 0); ctx.lineTo(s, s); break;
        case 2: // S neighbor or W
          ctx.moveTo(0, s); ctx.lineTo(s, s); break;
        case 3: // W neighbor
          ctx.moveTo(0, 0); ctx.lineTo(0, s); break;
      }
      ctx.stroke();

      // Foam line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      const inset = shoreWidth + 1;
      ctx.beginPath();
      switch (edgeIdx) {
        case 0: ctx.moveTo(0, inset); ctx.lineTo(s, inset); break;
        case 1: ctx.moveTo(s - inset, 0); ctx.lineTo(s - inset, s); break;
        case 2: ctx.moveTo(0, s - inset); ctx.lineTo(s, s - inset); break;
        case 3: ctx.moveTo(inset, 0); ctx.lineTo(inset, s); break;
      }
      ctx.stroke();
    } else if (totalEdges === 6) {
      // Hex edges — draw along the hex boundary segment
      const angles = [];
      for (let v = 0; v < 6; v++) {
        angles.push(Math.PI / 180 * (60 * v - 30));
      }
      const v1 = edgeIdx;
      const v2 = (edgeIdx + 1) % 6;
      const cx = s / 2, cy = s / 2;
      const hw = s / 2, hh = s / 2;
      ctx.beginPath();
      ctx.moveTo(cx + hw * Math.cos(angles[v1]), cy + hh * Math.sin(angles[v1]));
      ctx.lineTo(cx + hw * Math.cos(angles[v2]), cy + hh * Math.sin(angles[v2]));
      ctx.stroke();
    } else {
      // Octagon (8 edges) — simplified: draw as arc at edge angle
      const cx = s / 2, cy = s / 2;
      const r = s * 0.48;
      const a1 = (edgeFrac - 0.5 / totalEdges) * Math.PI * 2;
      const a2 = (edgeFrac + 0.5 / totalEdges) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a1, a2);
      ctx.stroke();
    }

    ctx.restore();
  }


  /* ==== N64-Quality Land Renderers ==== */

  _drawGrassN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Perlin ground color variation
    ctx.globalAlpha = 0.2;
    for (let y = 0; y < s; y += 4) {
      for (let x = 0; x < s; x += 4) {
        const n = PerlinNoise.sampleNoise(x / s + 3.0, y / s + 3.0);
        ctx.fillStyle = n > 0.55 ? secondary : (n < 0.35 ? accent : primary);
        ctx.fillRect(x, y, 4, 4);
      }
    }
    ctx.globalAlpha = 1;

    // Ground texture dots
    const rand = this._seededRand(1);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.arc(rand() * s, rand() * s, 0.8 + rand() * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Multi-layer grass blades
    const bladeCount = Math.min(35, Math.max(15, Math.floor(s * 0.6)));
    for (let layer = 0; layer < 2; layer++) {
      const layerSeed = this._seededRand(1 + layer * 100);
      ctx.lineWidth = layer === 0 ? 1.2 : 0.8;
      for (let i = 0; i < bladeCount; i++) {
        const x = layerSeed() * s;
        const baseY = layerSeed() * s;
        const h = 3 + layerSeed() * 6 + layer * 2;
        const bend = (layerSeed() - 0.5) * 4;
        const n = PerlinNoise.sampleNoise(x / s + layer, baseY / s);
        ctx.strokeStyle = n > 0.5 ? secondary : accent;
        ctx.globalAlpha = layer === 0 ? 0.7 : 0.9;
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.quadraticCurveTo(x + bend * 0.6, baseY - h * 0.5, x + bend, baseY - h);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawTallGrassN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Perlin ground variation
    ctx.globalAlpha = 0.15;
    for (let y = 0; y < s; y += 4) {
      for (let x = 0; x < s; x += 4) {
        const n = PerlinNoise.sampleNoise(x / s + 4.0, y / s + 4.0);
        ctx.fillStyle = n > 0.5 ? secondary : accent;
        ctx.fillRect(x, y, 4, 4);
      }
    }
    ctx.globalAlpha = 1;

    // Dense tall blades in layers
    const rand = this._seededRand(2);
    for (let layer = 0; layer < 3; layer++) {
      const count = 8 + layer * 4;
      ctx.lineWidth = 2 - layer * 0.4;
      for (let i = 0; i < count; i++) {
        const x = rand() * s;
        const baseY = s * 0.4 + rand() * s * 0.6;
        const h = 10 + rand() * 14 + layer * 3;
        const bend = (rand() - 0.5) * 10;
        const midBend = bend * 0.4 + (rand() - 0.5) * 3;
        ctx.strokeStyle = layer === 0 ? accent : (rand() > 0.5 ? secondary : primary);
        ctx.globalAlpha = 0.6 + layer * 0.15;
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.bezierCurveTo(x + midBend, baseY - h * 0.4, x + bend * 0.7, baseY - h * 0.7, x + bend, baseY - h);
        ctx.stroke();

        // Seed head on some blades
        if (rand() > 0.6 && layer > 0) {
          ctx.fillStyle = accent;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.ellipse(x + bend, baseY - h - 1.5, 1, 2.5, bend * 0.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawWildflowersN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Grass base (lighter)
    ctx.globalAlpha = 0.15;
    for (let y = 0; y < s; y += 4) {
      for (let x = 0; x < s; x += 4) {
        const n = PerlinNoise.sampleNoise(x / s + 5.0, y / s + 5.0);
        ctx.fillStyle = n > 0.5 ? '#8BC34A' : '#7CB342';
        ctx.fillRect(x, y, 4, 4);
      }
    }
    ctx.globalAlpha = 1;

    // Grass blades
    const rand = this._seededRand(3);
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 18; i++) {
      const x = rand() * s;
      const y = rand() * s;
      const h = 3 + rand() * 5;
      ctx.strokeStyle = '#7CB342';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + (rand() - 0.5) * 3, y - h * 0.6, x + (rand() - 0.5) * 2, y - h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Multi-petal flowers
    const flowerColors = [secondary, accent, '#FF7043', '#AB47BC', '#FFA726', '#E91E63'];
    for (let i = 0; i < 14; i++) {
      const fx = rand() * s;
      const fy = rand() * s;
      const color = flowerColors[i % flowerColors.length];

      // Stem
      ctx.strokeStyle = '#558B2F';
      ctx.lineWidth = 0.7;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(fx, fy + 3);
      ctx.lineTo(fx + (rand() - 0.5) * 2, fy);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Petals
      const petalCount = 4 + Math.floor(rand() * 3);
      const petalR = 1.2 + rand() * 1.5;
      ctx.fillStyle = color;
      for (let p = 0; p < petalCount; p++) {
        const angle = (p / petalCount) * Math.PI * 2;
        const px = fx + Math.cos(angle) * petalR * 0.6;
        const py = fy + Math.sin(angle) * petalR * 0.6;
        ctx.beginPath();
        ctx.arc(px, py, petalR * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Center
      ctx.fillStyle = '#FFF176';
      ctx.beginPath();
      ctx.arc(fx, fy, petalR * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawWheatN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Warm ground gradient
    const grad = ctx.createLinearGradient(0, 0, s, s);
    grad.addColorStop(0, primary);
    grad.addColorStop(1, this._lerpColor(primary, accent, 0.3));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, s, s);

    // Perlin soil patches
    ctx.globalAlpha = 0.1;
    for (let y = 0; y < s; y += 3) {
      for (let x = 0; x < s; x += 3) {
        const n = PerlinNoise.sampleNoise(x / s + 6.0, y / s + 6.0);
        if (n > 0.6) {
          ctx.fillStyle = '#795548';
          ctx.fillRect(x, y, 3, 3);
        }
      }
    }
    ctx.globalAlpha = 1;

    // Wheat stalks in rows
    const rand = this._seededRand(4);
    const rowCount = 6;
    const rowGap = s / rowCount;
    for (let r = 0; r < rowCount; r++) {
      const baseX = r * rowGap + rowGap * 0.3;
      const stalksInRow = 3 + Math.floor(rand() * 3);
      for (let i = 0; i < stalksInRow; i++) {
        const x = baseX + rand() * rowGap * 0.4;
        const baseY = s * 0.5 + rand() * s * 0.5;
        const h = 10 + rand() * 12;
        const lean = (rand() - 0.5) * 3;

        // Stalk
        ctx.strokeStyle = secondary;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, baseY);
        ctx.quadraticCurveTo(x + lean * 0.5, baseY - h * 0.5, x + lean, baseY - h);
        ctx.stroke();

        // Wheat ear
        ctx.fillStyle = accent;
        const earX = x + lean;
        const earY = baseY - h;
        ctx.beginPath();
        ctx.ellipse(earX, earY - 2, 1.8, 4, lean * 0.05, 0, Math.PI * 2);
        ctx.fill();
        // Whiskers
        ctx.strokeStyle = accent;
        ctx.lineWidth = 0.5;
        ctx.globalAlpha = 0.6;
        for (let w = 0; w < 3; w++) {
          const wy = earY - 3 + w * 1.5;
          ctx.beginPath();
          ctx.moveTo(earX, wy);
          ctx.lineTo(earX + 3 + rand() * 2, wy - 2 - rand() * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  _drawSavannaN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Dry earth Perlin texture
    ctx.globalAlpha = 0.2;
    for (let y = 0; y < s; y += 4) {
      for (let x = 0; x < s; x += 4) {
        const n = PerlinNoise.sampleNoise(x / s + 7.0, y / s + 7.0);
        ctx.fillStyle = n > 0.55 ? secondary : (n < 0.3 ? '#A0522D' : primary);
        ctx.fillRect(x, y, 4, 4);
      }
    }
    ctx.globalAlpha = 1;

    // Cracked earth lines
    const rand = this._seededRand(5);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 0.6;
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 5; i++) {
      const sx = rand() * s;
      const sy = rand() * s;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      let cx = sx, cy = sy;
      for (let seg = 0; seg < 3; seg++) {
        cx += (rand() - 0.5) * s * 0.2;
        cy += (rand() - 0.5) * s * 0.2;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Sparse dry grass tufts
    for (let i = 0; i < 12; i++) {
      const x = rand() * s;
      const baseY = s * 0.4 + rand() * s * 0.6;
      const h = 3 + rand() * 5;
      ctx.strokeStyle = rand() > 0.5 ? secondary : accent;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x + (rand() - 0.5) * 3, baseY - h);
      ctx.stroke();
    }

    // Distant acacia silhouette
    if (s >= 32) {
      const treeX = s * (0.2 + rand() * 0.6);
      const treeBaseY = s * (0.3 + rand() * 0.3);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.25;
      // Trunk
      ctx.fillRect(treeX - 1, treeBaseY, 2, s * 0.12);
      // Flat canopy
      ctx.beginPath();
      ctx.ellipse(treeX, treeBaseY - 2, s * 0.1, s * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  _drawFarmlandN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Soil texture via Perlin
    ctx.globalAlpha = 0.2;
    for (let y = 0; y < s; y += 3) {
      for (let x = 0; x < s; x += 3) {
        const n = PerlinNoise.sampleNoise(x / s + 8.0, y / s + 8.0);
        ctx.fillStyle = n > 0.55 ? secondary : (n < 0.35 ? '#5D4037' : primary);
        ctx.fillRect(x, y, 3, 3);
      }
    }
    ctx.globalAlpha = 1;

    // Plowed furrow rows with depth
    const rows = 6;
    const gap = s / rows;
    for (let i = 0; i < rows; i++) {
      const y = gap * i + gap / 2;
      // Shadow line (darker)
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(0, y + 1);
      ctx.lineTo(s, y + 1);
      ctx.stroke();
      // Ridge (lighter)
      ctx.strokeStyle = secondary;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Crop sprouts between furrows
    const rand = this._seededRand(6);
    ctx.fillStyle = '#66BB6A';
    ctx.strokeStyle = '#4CAF50';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 10; i++) {
      const x = rand() * s;
      const rowIdx = Math.floor(rand() * rows);
      const y = gap * rowIdx + gap * 0.3;
      const sproutH = 2 + rand() * 3;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 1, y - sproutH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 1, y - sproutH * 0.8);
      ctx.stroke();
      // Leaf dot
      ctx.beginPath();
      ctx.arc(x - 1, y - sproutH, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawDenseForestN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Dark forest floor
    const floorGrad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.7);
    floorGrad.addColorStop(0, this._lerpColor(primary, '#1A1A1A', 0.3));
    floorGrad.addColorStop(1, primary);
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 0, s, s);

    // Undergrowth Perlin
    ctx.globalAlpha = 0.15;
    for (let y = 0; y < s; y += 3) {
      for (let x = 0; x < s; x += 3) {
        const n = PerlinNoise.sampleNoise(x / s + 9.0, y / s + 9.0);
        if (n > 0.5) {
          ctx.fillStyle = '#1B5E20';
          ctx.fillRect(x, y, 3, 3);
        }
      }
    }
    ctx.globalAlpha = 1;

    const rand = this._seededRand(7);

    // Trunk glimpses
    ctx.fillStyle = '#4E342E';
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 4; i++) {
      const tx = s * 0.1 + rand() * s * 0.8;
      const tw = 2 + rand() * 3;
      ctx.fillRect(tx, s * 0.5, tw, s * 0.5);
    }
    ctx.globalAlpha = 1;

    // Multi-depth canopy (back to front)
    for (let layer = 0; layer < 3; layer++) {
      const treeCount = 2 + layer;
      const layerAlpha = 0.5 + layer * 0.2;
      for (let i = 0; i < treeCount; i++) {
        const cx = s * 0.08 + rand() * s * 0.84;
        const cy = s * 0.15 + rand() * s * 0.5;
        const r = s * 0.1 + rand() * s * 0.12 + layer * s * 0.02;
        const treeColor = layer % 2 === 0 ? secondary : accent;

        ctx.fillStyle = treeColor;
        ctx.globalAlpha = layerAlpha;
        // Organic canopy shape (overlapping circles)
        for (let c = 0; c < 3; c++) {
          const ox = cx + (rand() - 0.5) * r * 0.6;
          const oy = cy + (rand() - 0.5) * r * 0.4;
          ctx.beginPath();
          ctx.arc(ox, oy, r * (0.6 + rand() * 0.3), 0, Math.PI * 2);
          ctx.fill();
        }

        // Canopy shadow edge
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.globalAlpha = layerAlpha * 0.4;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.8, Math.PI * 0.8, Math.PI * 1.8);
        ctx.stroke();
      }
    }

    // Dappled light
    ctx.fillStyle = '#AED581';
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(rand() * s, rand() * s, 2 + rand() * 3, 1.5 + rand() * 2, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawLightWoodsN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Sunny grass floor
    ctx.globalAlpha = 0.18;
    for (let y = 0; y < s; y += 4) {
      for (let x = 0; x < s; x += 4) {
        const n = PerlinNoise.sampleNoise(x / s + 10.0, y / s + 10.0);
        ctx.fillStyle = n > 0.5 ? '#8BC34A' : primary;
        ctx.fillRect(x, y, 4, 4);
      }
    }
    ctx.globalAlpha = 1;

    // Grass blades on floor
    const rand = this._seededRand(8);
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 12; i++) {
      const x = rand() * s;
      const y = rand() * s;
      ctx.strokeStyle = rand() > 0.5 ? '#7CB342' : '#9CCC65';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 2, y - 3 - rand() * 3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Scattered trees (fewer, more spaced)
    for (let i = 0; i < 3; i++) {
      const cx = s * 0.15 + rand() * s * 0.7;
      const cy = s * 0.2 + rand() * s * 0.4;
      const r = s * 0.08 + rand() * s * 0.1;

      // Trunk
      ctx.fillStyle = '#6D4C41';
      ctx.globalAlpha = 0.5;
      ctx.fillRect(cx - 1.5, cy + r * 0.3, 3, s * 0.15);
      ctx.globalAlpha = 1;

      // Canopy (organic overlapping)
      ctx.fillStyle = secondary;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(cx - r * 0.3, cy, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + r * 0.3, cy - r * 0.1, r * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy - r * 0.3, r * 0.6, 0, Math.PI * 2);
      ctx.fill();

      // Shadow edge
      ctx.strokeStyle = accent;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.6, Math.PI * 0.5, Math.PI * 1.5);
      ctx.stroke();
    }

    // Sunlight patches
    ctx.fillStyle = '#FFEE58';
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(rand() * s, rand() * s, 4 + rand() * 5, 3 + rand() * 4, rand(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawPineForestN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Dark needle-covered floor
    const floorGrad = ctx.createLinearGradient(0, 0, 0, s);
    floorGrad.addColorStop(0, this._lerpColor(primary, '#0A2A0A', 0.2));
    floorGrad.addColorStop(1, primary);
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 0, s, s);

    // Needle texture via Perlin
    ctx.globalAlpha = 0.12;
    for (let y = 0; y < s; y += 3) {
      for (let x = 0; x < s; x += 3) {
        const n = PerlinNoise.sampleNoise(x / s + 11.0, y / s + 11.0);
        if (n > 0.5) {
          ctx.fillStyle = '#33691E';
          ctx.fillRect(x, y, 3, 3);
        }
      }
    }
    ctx.globalAlpha = 1;

    // Pine trees at multiple depths
    const rand = this._seededRand(9);
    for (let layer = 0; layer < 3; layer++) {
      const count = 2 + layer;
      for (let i = 0; i < count; i++) {
        const cx = s * 0.08 + rand() * s * 0.84;
        const baseY = s * 0.4 + rand() * s * 0.5;
        const h = s * 0.28 + rand() * s * 0.18 + layer * s * 0.03;
        const w = s * 0.07 + rand() * s * 0.05;
        const treeColor = layer % 2 === 0 ? secondary : accent;

        // Trunk
        ctx.fillStyle = '#3E2723';
        ctx.globalAlpha = 0.3 + layer * 0.15;
        ctx.fillRect(cx - 1.5, baseY - h * 0.15, 3, h * 0.15 + 4);

        // Layered triangular canopy
        ctx.fillStyle = treeColor;
        ctx.globalAlpha = 0.5 + layer * 0.18;
        for (let t = 0; t < 3; t++) {
          const tierY = baseY - h * (0.3 + t * 0.25);
          const tierW = w * (1.3 - t * 0.25);
          const tierH = h * 0.35;
          ctx.beginPath();
          ctx.moveTo(cx, tierY - tierH);
          ctx.lineTo(cx - tierW, tierY);
          ctx.lineTo(cx + tierW, tierY);
          ctx.closePath();
          ctx.fill();
        }

        // Shadow on right side
        ctx.fillStyle = '#0D3B0F';
        ctx.globalAlpha = 0.15;
        for (let t = 0; t < 3; t++) {
          const tierY = baseY - h * (0.3 + t * 0.25);
          const tierW = w * (1.3 - t * 0.25);
          const tierH = h * 0.35;
          ctx.beginPath();
          ctx.moveTo(cx, tierY - tierH);
          ctx.lineTo(cx + tierW, tierY);
          ctx.lineTo(cx, tierY);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawClearingN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Bright grass center
    const clearingGrad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.5);
    clearingGrad.addColorStop(0, secondary);
    clearingGrad.addColorStop(0.7, primary);
    clearingGrad.addColorStop(1, accent);
    ctx.fillStyle = clearingGrad;
    ctx.fillRect(0, 0, s, s);

    // Perlin grass texture in center
    ctx.globalAlpha = 0.12;
    for (let y = 0; y < s; y += 3) {
      for (let x = 0; x < s; x += 3) {
        const dx = x / s - 0.5, dy = y / s - 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.4) {
          const n = PerlinNoise.sampleNoise(x / s + 12.0, y / s + 12.0);
          ctx.fillStyle = n > 0.5 ? '#AED581' : '#C5E1A5';
          ctx.fillRect(x, y, 3, 3);
        }
      }
    }
    ctx.globalAlpha = 1;

    // Tree line around edges
    const rand = this._seededRand(10);
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + rand() * 0.3;
      const dist = s * 0.38 + rand() * s * 0.1;
      const tx = s / 2 + Math.cos(angle) * dist;
      const ty = s / 2 + Math.sin(angle) * dist;
      const tr = s * 0.06 + rand() * s * 0.05;

      ctx.fillStyle = rand() > 0.5 ? '#2E7D32' : '#388E3C';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(tx, ty, tr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Grass blades in center
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 15; i++) {
      const gx = s * 0.25 + rand() * s * 0.5;
      const gy = s * 0.25 + rand() * s * 0.5;
      const gh = 2 + rand() * 4;
      ctx.strokeStyle = rand() > 0.5 ? secondary : '#AED581';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + (rand() - 0.5) * 2, gy - gh);
      ctx.stroke();
    }

    // Dappled sunlight
    ctx.fillStyle = '#FFF9C4';
    ctx.globalAlpha = 0.1;
    for (let i = 0; i < 4; i++) {
      const lx = s * 0.2 + rand() * s * 0.6;
      const ly = s * 0.2 + rand() * s * 0.6;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 3 + rand() * 4, 2 + rand() * 3, rand(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawHillsN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Rolling contour via Perlin
    for (let y = 0; y < s; y += 2) {
      for (let x = 0; x < s; x += 2) {
        const n = PerlinNoise.sampleNoise(x / s * 2 + 13.0, y / s * 2 + 13.0);
        const elevation = n * 0.5 + 0.25 + (1 - y / s) * 0.3;
        ctx.fillStyle = this._lerpColor(primary, secondary, Math.min(1, elevation));
        ctx.globalAlpha = 0.4;
        ctx.fillRect(x, y, 2, 2);
      }
    }
    ctx.globalAlpha = 1;

    // Main hill contours
    const rand = this._seededRand(11);
    for (let h = 0; h < 2; h++) {
      const hillX = s * (0.2 + h * 0.4 + rand() * 0.2);
      const hillTop = s * (0.25 + rand() * 0.15);
      const hillW = s * (0.3 + rand() * 0.15);

      // Hill body
      ctx.fillStyle = secondary;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(hillX - hillW, s);
      ctx.quadraticCurveTo(hillX - hillW * 0.3, hillTop, hillX, hillTop - s * 0.05);
      ctx.quadraticCurveTo(hillX + hillW * 0.3, hillTop, hillX + hillW, s);
      ctx.closePath();
      ctx.fill();

      // Light side (left)
      ctx.fillStyle = '#C5E1A5';
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.moveTo(hillX - hillW, s);
      ctx.quadraticCurveTo(hillX - hillW * 0.3, hillTop, hillX, hillTop - s * 0.05);
      ctx.lineTo(hillX, s);
      ctx.closePath();
      ctx.fill();

      // Shadow side (right)
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.moveTo(hillX, hillTop - s * 0.05);
      ctx.quadraticCurveTo(hillX + hillW * 0.3, hillTop, hillX + hillW, s);
      ctx.lineTo(hillX, s);
      ctx.closePath();
      ctx.fill();
    }

    // Grass on hilltops
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 10; i++) {
      const gx = rand() * s;
      const gy = s * 0.3 + rand() * s * 0.4;
      ctx.strokeStyle = secondary;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + (rand() - 0.5) * 2, gy - 3 - rand() * 3);
      ctx.stroke();
    }

    // Exposed rock patches
    ctx.fillStyle = '#90A4AE';
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(rand() * s, s * 0.5 + rand() * s * 0.4, 2 + rand() * 3, 1 + rand() * 2, rand(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawMountainN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Base terrain gradient
    const baseGrad = ctx.createLinearGradient(0, 0, 0, s);
    baseGrad.addColorStop(0, '#ECEFF1');
    baseGrad.addColorStop(0.25, secondary);
    baseGrad.addColorStop(0.6, primary);
    baseGrad.addColorStop(1, this._lerpColor(primary, '#4E342E', 0.3));
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, s, s);

    // Rock face texture via Perlin
    ctx.globalAlpha = 0.2;
    for (let y = 0; y < s; y += 3) {
      for (let x = 0; x < s; x += 3) {
        const n = PerlinNoise.sampleNoise(x / s * 3 + 14.0, y / s * 3 + 14.0);
        if (n > 0.55) {
          ctx.fillStyle = '#455A64';
          ctx.fillRect(x, y, 3, 3);
        } else if (n < 0.3) {
          ctx.fillStyle = '#B0BEC5';
          ctx.fillRect(x, y, 3, 3);
        }
      }
    }
    ctx.globalAlpha = 1;

    // Mountain peak shape
    const rand = this._seededRand(12);
    const peakX = s * 0.5 + (rand() - 0.5) * s * 0.1;
    const peakY = s * 0.08;
    const baseL = s * 0.1;
    const baseR = s * 0.9;

    // Main mountain body
    ctx.fillStyle = secondary;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(peakX, peakY);
    ctx.lineTo(baseL, s * 0.88);
    ctx.lineTo(baseR, s * 0.88);
    ctx.closePath();
    ctx.fill();

    // Shadow face (right)
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(peakX, peakY);
    ctx.lineTo(baseR, s * 0.88);
    ctx.lineTo(peakX + s * 0.05, s * 0.88);
    ctx.closePath();
    ctx.fill();

    // Snow cap with craggy edge
    ctx.fillStyle = '#ECEFF1';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(peakX, peakY);
    const snowLine = s * 0.28;
    const leftEdge = peakX - (peakX - baseL) * (snowLine / (s * 0.8));
    const rightEdge = peakX + (baseR - peakX) * (snowLine / (s * 0.8));
    ctx.lineTo(leftEdge, snowLine);
    // Craggy snow line
    const segments = 6;
    for (let i = 1; i < segments; i++) {
      const sx = leftEdge + (rightEdge - leftEdge) * (i / segments);
      const sy = snowLine + (rand() - 0.3) * s * 0.05;
      ctx.lineTo(sx, sy);
    }
    ctx.lineTo(rightEdge, snowLine);
    ctx.closePath();
    ctx.fill();

    // Altitude banding lines
    ctx.strokeStyle = accent;
    ctx.lineWidth = 0.6;
    ctx.globalAlpha = 0.15;
    for (let band = 0; band < 4; band++) {
      const by = s * 0.35 + band * s * 0.13;
      const bLeft = peakX - (peakX - baseL) * (by / (s * 0.8));
      const bRight = peakX + (baseR - peakX) * (by / (s * 0.8));
      ctx.beginPath();
      ctx.moveTo(bLeft + s * 0.02, by);
      ctx.lineTo(bRight - s * 0.02, by);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Base scree
    ctx.fillStyle = '#6D4C41';
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.moveTo(baseL - s * 0.05, s);
    ctx.lineTo(baseL, s * 0.88);
    ctx.lineTo(baseR, s * 0.88);
    ctx.lineTo(baseR + s * 0.05, s);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawDesertN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Perlin dune contours
    for (let y = 0; y < s; y += 2) {
      for (let x = 0; x < s; x += 2) {
        const n = PerlinNoise.sampleNoise(x / s * 2 + 15.0, y / s * 1.5 + 15.0);
        // Simulate light from top-left
        const lightN = PerlinNoise.sampleNoise((x + 2) / s * 2 + 15.0, (y + 2) / s * 1.5 + 15.0);
        const shadow = n - lightN;
        let color;
        if (shadow > 0.05) {
          color = secondary; // lit face
        } else if (shadow < -0.05) {
          color = accent; // shadow face
        } else {
          color = primary;
        }
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x, y, 2, 2);
      }
    }
    ctx.globalAlpha = 1;

    // Sand ripple lines
    const rand = this._seededRand(18);
    ctx.strokeStyle = secondary;
    ctx.lineWidth = 0.6;
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 8; i++) {
      const ry = s * 0.1 + i * s * 0.12;
      const offset = rand() * s * 0.1;
      ctx.beginPath();
      ctx.moveTo(0, ry + offset);
      for (let x = 0; x < s; x += s * 0.1) {
        const wave = Math.sin(x / s * Math.PI * 2 + i) * 2;
        ctx.lineTo(x, ry + offset + wave);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Wind shadow dune shape
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.6);
    ctx.bezierCurveTo(s * 0.2, s * 0.4, s * 0.5, s * 0.35, s * 0.7, s * 0.5);
    ctx.bezierCurveTo(s * 0.85, s * 0.55, s, s * 0.5, s, s * 0.55);
    ctx.lineTo(s, s);
    ctx.lineTo(0, s);
    ctx.closePath();
    ctx.fill();

    // Sparse rock details
    ctx.fillStyle = '#8D6E63';
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 3; i++) {
      const rx = rand() * s;
      const ry = s * 0.5 + rand() * s * 0.4;
      ctx.beginPath();
      ctx.ellipse(rx, ry, 1.5 + rand() * 2, 1 + rand(), rand(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawRoadN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Dirt shoulders
    ctx.fillStyle = this._lerpColor(primary, '#8D6E63', 0.3);
    ctx.fillRect(0, 0, s, s);

    // Road surface
    ctx.fillStyle = secondary;
    ctx.fillRect(s * 0.25, 0, s * 0.5, s);

    // Cobblestone texture via Perlin
    ctx.globalAlpha = 0.2;
    for (let y = 0; y < s; y += 3) {
      for (let x = Math.floor(s * 0.25); x < s * 0.75; x += 3) {
        const n = PerlinNoise.sampleNoise(x / s * 4 + 16.0, y / s * 4 + 16.0);
        ctx.fillStyle = n > 0.55 ? primary : (n < 0.35 ? accent : secondary);
        ctx.fillRect(x, y, 3, 3);
      }
    }
    ctx.globalAlpha = 1;

    // Road edge stones
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5;
    const rand = this._seededRand(19);
    // Left edge (slightly wavy)
    ctx.beginPath();
    ctx.moveTo(s * 0.25, 0);
    for (let y = 0; y < s; y += s * 0.15) {
      ctx.lineTo(s * 0.25 + (rand() - 0.5) * 2, y);
    }
    ctx.lineTo(s * 0.25, s);
    ctx.stroke();
    // Right edge
    ctx.beginPath();
    ctx.moveTo(s * 0.75, 0);
    for (let y = 0; y < s; y += s * 0.15) {
      ctx.lineTo(s * 0.75 + (rand() - 0.5) * 2, y);
    }
    ctx.lineTo(s * 0.75, s);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Wheel ruts
    ctx.strokeStyle = accent;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.15;
    ctx.beginPath();
    ctx.moveTo(s * 0.38, 0);
    ctx.lineTo(s * 0.38, s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.62, 0);
    ctx.lineTo(s * 0.62, s);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Small stones/pebbles
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 6; i++) {
      const px = s * 0.28 + rand() * s * 0.44;
      const py = rand() * s;
      ctx.beginPath();
      ctx.ellipse(px, py, 1 + rand() * 1.5, 0.8 + rand(), rand(), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawBridgeN64(ctx, s, colors, neighbors) {
    ctx.save();
    const { primary, secondary, accent } = colors;

    // Water underneath
    ctx.fillStyle = '#42A5F5';
    ctx.fillRect(0, 0, s, s);
    // Water ripples
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) {
      const wy = s * 0.2 + i * s * 0.3;
      ctx.beginPath();
      ctx.moveTo(0, wy);
      ctx.quadraticCurveTo(s * 0.25, wy - 2, s * 0.5, wy);
      ctx.quadraticCurveTo(s * 0.75, wy + 2, s, wy);
      ctx.stroke();
    }

    // Bridge deck
    ctx.fillStyle = secondary;
    ctx.fillRect(s * 0.18, 0, s * 0.64, s);

    // Wood plank texture via Perlin
    ctx.globalAlpha = 0.15;
    for (let y = 0; y < s; y += 2) {
      for (let x = Math.floor(s * 0.18); x < s * 0.82; x += 2) {
        const n = PerlinNoise.sampleNoise(x / s * 6 + 17.0, y / s * 1 + 17.0);
        ctx.fillStyle = n > 0.55 ? primary : accent;
        ctx.fillRect(x, y, 2, 2);
      }
    }
    ctx.globalAlpha = 1;

    // Plank lines
    const rand = this._seededRand(20);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 0.8;
    ctx.globalAlpha = 0.4;
    const plankCount = 8;
    for (let i = 0; i <= plankCount; i++) {
      const y = (i / plankCount) * s;
      ctx.beginPath();
      ctx.moveTo(s * 0.18, y);
      ctx.lineTo(s * 0.82, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Structural beams (railings)
    ctx.fillStyle = accent;
    ctx.fillRect(s * 0.16, 0, s * 0.04, s);
    ctx.fillRect(s * 0.80, 0, s * 0.04, s);

    // Railing posts
    ctx.fillStyle = this._lerpColor(accent, '#3E2723', 0.3);
    const postCount = 4;
    for (let i = 0; i < postCount; i++) {
      const py = s * 0.1 + i * s * 0.25;
      // Left post
      ctx.fillRect(s * 0.14, py - 1, s * 0.06, 3);
      // Right post
      ctx.fillRect(s * 0.80, py - 1, s * 0.06, 3);
    }

    // Nail details
    ctx.fillStyle = '#37474F';
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 5; i++) {
      const nx = s * 0.22 + rand() * s * 0.56;
      const ny = rand() * s;
      ctx.beginPath();
      ctx.arc(nx, ny, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }


  /* ==== Transition System ==== */

  /** Render transitions on edges where neighbor tile type differs */
  _renderTransitions(ctx, s, neighbors, mode) {
    if (!neighbors || s < 16) return;
    if (mode !== 'terrestrial') return; // space/dungeon stubbed

    const edgeCount = neighbors.edges.length;
    if (edgeCount === 0) return;

    ctx.save();
    const strip = Math.max(2, s * 0.15); // 15% cell width for gradient strip

    for (let i = 0; i < edgeCount; i++) {
      const edge = neighbors.edges[i];
      if (edge.isSameType || !edge.tileId || !edge.deltas) continue;

      // Find dominant material delta
      const d = edge.deltas;
      const absDeltas = [
        { axis: 'elevation', val: Math.abs(d.dElevation) },
        { axis: 'moisture', val: Math.abs(d.dMoisture) },
        { axis: 'temperature', val: Math.abs(d.dTemperature) },
        { axis: 'density', val: Math.abs(d.dDensity) },
        { axis: 'organic', val: Math.abs(d.dOrganic) }
      ];
      absDeltas.sort((a, b) => b.val - a.val);
      const dominant = absDeltas[0];
      if (dominant.val < 0.1) continue; // too similar, skip

      // Determine transition color/style by dominant axis
      let transColor, transAlpha;
      switch (dominant.axis) {
        case 'elevation':
          transColor = d.dElevation > 0 ? '#546E7A' : '#8D6E63'; // cliff shadow / rocky
          transAlpha = Math.min(0.35, dominant.val * 0.4);
          break;
        case 'moisture':
          transColor = d.dMoisture > 0 ? '#5D99C6' : '#A1887F'; // wetland / dry
          transAlpha = Math.min(0.3, dominant.val * 0.35);
          break;
        case 'temperature':
          transColor = d.dTemperature > 0 ? '#E65100' : '#42A5F5'; // warm / cold
          transAlpha = Math.min(0.25, dominant.val * 0.3);
          break;
        case 'density':
          transColor = d.dDensity > 0 ? '#2E7D32' : '#AED581'; // dense / sparse
          transAlpha = Math.min(0.3, dominant.val * 0.35);
          break;
        case 'organic':
          transColor = '#795548'; // natural/constructed boundary
          transAlpha = Math.min(0.35, dominant.val * 0.4);
          break;
        default:
          continue;
      }

      // Draw edge gradient strip
      ctx.globalAlpha = transAlpha;

      // Build transparent version of transColor (avoids black fringe from 'transparent')
      const tr = parseInt(transColor.slice(1, 3), 16);
      const tg = parseInt(transColor.slice(3, 5), 16);
      const tb = parseInt(transColor.slice(5, 7), 16);
      const transColorFade = `rgba(${tr},${tg},${tb},0)`;

      if (edgeCount === 4) {
        // Square grid edges
        let grad;
        switch (i) {
          case 0: // N
            grad = ctx.createLinearGradient(0, 0, 0, strip);
            grad.addColorStop(0, transColor);
            grad.addColorStop(1, transColorFade);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, s, strip);
            break;
          case 1: // E
            grad = ctx.createLinearGradient(s, 0, s - strip, 0);
            grad.addColorStop(0, transColor);
            grad.addColorStop(1, transColorFade);
            ctx.fillStyle = grad;
            ctx.fillRect(s - strip, 0, strip, s);
            break;
          case 2: // S
            grad = ctx.createLinearGradient(0, s, 0, s - strip);
            grad.addColorStop(0, transColor);
            grad.addColorStop(1, transColorFade);
            ctx.fillStyle = grad;
            ctx.fillRect(0, s - strip, s, strip);
            break;
          case 3: // W
            grad = ctx.createLinearGradient(0, 0, strip, 0);
            grad.addColorStop(0, transColor);
            grad.addColorStop(1, transColorFade);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, strip, s);
            break;
        }
      } else {
        // Non-square: radial fade from edge direction
        const angle = (i / edgeCount) * Math.PI * 2;
        const edgeX = s / 2 + Math.cos(angle) * s * 0.45;
        const edgeY = s / 2 + Math.sin(angle) * s * 0.45;
        const grad = ctx.createRadialGradient(edgeX, edgeY, 0, edgeX, edgeY, strip);
        grad.addColorStop(0, transColor);
        grad.addColorStop(1, transColorFade);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, s, s);
      }

      // Scatter objects at edges (only at full detail, >=48px)
      if (s >= 48) {
        this._drawTransitionScatter(ctx, s, i, edgeCount, dominant.axis, d, neighbors.col, neighbors.row);
      }
    }

    ctx.restore();
  }


  /* ==== Scatter Objects ==== */

  /** Draw scatter objects at transition edges */
  _drawTransitionScatter(ctx, s, edgeIdx, totalEdges, axis, deltas, col, row) {
    // Seeded positions from Perlin — deterministic per cell+edge
    const seed = col * 73 + row * 137 + edgeIdx * 31 + 1;
    const rand = this._seededRand(seed);
    const maxScatter = 4;
    const count = 1 + Math.floor(rand() * Math.min(maxScatter, 3));

    // Edge center position
    let baseX = s * 0.5, baseY = s * 0.5;
    if (totalEdges === 4) {
      switch (edgeIdx) {
        case 0: baseX = s * 0.5; baseY = s * 0.08; break;
        case 1: baseX = s * 0.92; baseY = s * 0.5; break;
        case 2: baseX = s * 0.5; baseY = s * 0.92; break;
        case 3: baseX = s * 0.08; baseY = s * 0.5; break;
      }
    } else {
      const angle = (edgeIdx / totalEdges) * Math.PI * 2;
      baseX = s / 2 + Math.cos(angle) * s * 0.38;
      baseY = s / 2 + Math.sin(angle) * s * 0.38;
    }

    ctx.globalAlpha = 0.5;
    for (let i = 0; i < count; i++) {
      const ox = baseX + (rand() - 0.5) * s * 0.2;
      const oy = baseY + (rand() - 0.5) * s * 0.2;
      const objSize = 2 + rand() * 3;

      switch (axis) {
        case 'elevation':
          // Small rocks
          ctx.fillStyle = '#78909C';
          ctx.beginPath();
          ctx.ellipse(ox, oy, objSize, objSize * 0.6, rand() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'moisture':
          // Reeds/cattails
          ctx.strokeStyle = '#33691E';
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(ox + (rand() - 0.5) * 2, oy - objSize * 2);
          ctx.stroke();
          break;
        case 'density':
          // Tree stumps
          ctx.fillStyle = '#5D4037';
          ctx.beginPath();
          ctx.ellipse(ox, oy, objSize * 0.8, objSize * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#8D6E63';
          ctx.beginPath();
          ctx.ellipse(ox, oy - 0.5, objSize * 0.6, objSize * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'temperature':
          // Frost crystals / heat shimmer
          ctx.fillStyle = deltas.dTemperature < 0 ? '#B3E5FC' : '#FFCC80';
          ctx.globalAlpha = 0.3;
          for (let s2 = 0; s2 < 3; s2++) {
            ctx.beginPath();
            ctx.arc(ox + (rand() - 0.5) * 4, oy + (rand() - 0.5) * 4, 0.8, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 0.5;
          break;
        case 'organic':
          // Boundary stones
          ctx.fillStyle = '#9E9E9E';
          ctx.beginPath();
          ctx.rect(ox - objSize * 0.3, oy - objSize * 0.5, objSize * 0.6, objSize);
          ctx.fill();
          break;
      }
    }
  }


  /* ==== Color Utilities ==== */

  /** Lerp between two hex colors */
  _lerpColor(hex1, hex2, t) {
    const r1 = parseInt(hex1.slice(1, 3), 16);
    const g1 = parseInt(hex1.slice(3, 5), 16);
    const b1 = parseInt(hex1.slice(5, 7), 16);
    const r2 = parseInt(hex2.slice(1, 3), 16);
    const g2 = parseInt(hex2.slice(3, 5), 16);
    const b2 = parseInt(hex2.slice(5, 7), 16);
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
}
