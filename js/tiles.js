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

    // Build neighbor-aware cache key for water tiles
    let neighborHash = '';
    if (isWaterTile(tileId) && grid) {
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

    // Gather neighbor info for water tiles
    let neighbors = null;
    if (isWaterTile(tileId) && grid) {
      neighbors = this._getWaterNeighborInfo(grid, col, row, cellType, tileId);
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

  /** Get detailed water neighbor info for rendering */
  _getWaterNeighborInfo(grid, col, row, cellType, tileId) {
    const neighbors = grid.getNeighbors(col, row, cellType);
    const info = {
      col, row, // current cell coords for delta calculations
      sameTypeEdges: 0,
      waterEdges: 0,
      totalEdges: neighbors.length,
      edges: [],
      mergeMask: 0
    };

    for (let i = 0; i < neighbors.length; i++) {
      const n = neighbors[i];
      const cell = grid.getCell(n.col, n.row, n.cellType);
      const nBase = cell ? cell.base : null;
      const isSameType = nBase === tileId;
      const isWater = nBase && isWaterTile(nBase);
      const nType = this._typeMap[nBase];

      info.edges.push({
        col: n.col, row: n.row, cellType: n.cellType,
        tileId: nBase,
        isSameType,
        isWater,
        materialProps: nType ? nType.materialProperties : null
      });

      if (isSameType) {
        info.sameTypeEdges++;
        info.mergeMask |= (1 << i);
      }
      if (isWater) info.waterEdges++;
    }
    return info;
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
    const { primary, secondary, accent } = type.colors;

    // Base fill
    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, size, size);

    switch (type.pattern) {
      case 'grass':
        this._drawGrass(ctx, size, secondary, accent);
        break;
      case 'tall-grass':
        this._drawTallGrass(ctx, size, secondary, accent);
        break;
      case 'wildflowers':
        this._drawWildflowers(ctx, size, primary, secondary, accent);
        break;
      case 'wheat':
        this._drawWheat(ctx, size, secondary, accent);
        break;
      case 'savanna':
        this._drawSavanna(ctx, size, secondary, accent);
        break;
      case 'farmland':
        this._drawFarmland(ctx, size, secondary, accent);
        break;
      case 'dense-forest':
        this._drawDenseForest(ctx, size, secondary, accent);
        break;
      case 'light-woods':
        this._drawLightWoods(ctx, size, secondary, accent);
        break;
      case 'pine-forest':
        this._drawPineForest(ctx, size, secondary, accent);
        break;
      case 'clearing':
        this._drawClearing(ctx, size, secondary, accent);
        break;
      case 'ocean':
        this._drawOceanN64(ctx, size, type.colors, neighbors);
        break;
      case 'shallow-water':
        this._drawShallowWaterN64(ctx, size, type.colors, neighbors);
        break;
      case 'river':
        this._drawRiverN64(ctx, size, type.colors, neighbors);
        break;
      case 'lake':
        this._drawLakeN64(ctx, size, type.colors, neighbors);
        break;
      case 'swamp':
        this._drawSwampN64(ctx, size, type.colors, neighbors);
        break;
      case 'hills':
        this._drawHills(ctx, size, secondary, accent);
        break;
      case 'mountain':
        this._drawMountain(ctx, size, secondary, accent);
        break;
      case 'desert':
        this._drawDesert(ctx, size, secondary, accent);
        break;
      case 'road':
        this._drawRoad(ctx, size, secondary, accent);
        break;
      case 'bridge':
        this._drawBridge(ctx, size, secondary, accent);
        break;
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
    if (flowDir === 'vertical' || flowDir === 'default') {
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
    if (flowDir === 'vertical' || flowDir === 'default') {
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


  /* ==== Original Procedural Pattern Renderers (non-water) ==== */

  _drawGrass(ctx, s, sec, acc) {
    const rand = this._seededRand(1);
    ctx.strokeStyle = sec;
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      const x = rand() * s;
      const y = rand() * s;
      const h = 3 + rand() * 5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 3, y - h);
      ctx.stroke();
    }
  }

  _drawTallGrass(ctx, s, sec, acc) {
    const rand = this._seededRand(2);
    for (let i = 0; i < 15; i++) {
      const x = rand() * s;
      const y = rand() * s;
      const h = 6 + rand() * 10;
      ctx.strokeStyle = i % 2 === 0 ? sec : acc;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + (rand() - 0.5) * 8, y - h * 0.6, x + (rand() - 0.5) * 4, y - h);
      ctx.stroke();
    }
  }

  _drawWildflowers(ctx, s, pri, sec, acc) {
    this._drawGrass(ctx, s, pri, pri);
    const rand = this._seededRand(3);
    const colors = [sec, acc, '#FF7043', '#AB47BC', '#FFA726'];
    for (let i = 0; i < 12; i++) {
      const x = rand() * s;
      const y = rand() * s;
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + rand() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawWheat(ctx, s, sec, acc) {
    const rand = this._seededRand(4);
    ctx.strokeStyle = sec;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      const x = rand() * s;
      const y = rand() * s;
      const h = 8 + rand() * 8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - h);
      ctx.stroke();
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.ellipse(x, y - h - 2, 1.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawSavanna(ctx, s, sec, acc) {
    const rand = this._seededRand(5);
    ctx.strokeStyle = sec;
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const x = rand() * s;
      const y = s * 0.5 + rand() * s * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 3 - rand() * 4);
      ctx.stroke();
    }
    ctx.fillStyle = acc;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.ellipse(s * 0.3, s * 0.6, s * 0.15, s * 0.08, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawFarmland(ctx, s, sec, acc) {
    ctx.strokeStyle = sec;
    ctx.lineWidth = 2;
    const rows = 5;
    const gap = s / rows;
    for (let i = 0; i < rows; i++) {
      const y = gap * i + gap / 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();
    }
    const rand = this._seededRand(6);
    ctx.fillStyle = acc;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(rand() * s, rand() * s, 1 + rand(), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawDenseForest(ctx, s, sec, acc) {
    const rand = this._seededRand(7);
    for (let i = 0; i < 5; i++) {
      const cx = s * 0.15 + rand() * s * 0.7;
      const cy = s * 0.25 + rand() * s * 0.5;
      const r = s * 0.12 + rand() * s * 0.12;
      ctx.fillStyle = i % 2 === 0 ? sec : acc;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(s * 0.47, s * 0.7, s * 0.06, s * 0.15);
  }

  _drawLightWoods(ctx, s, sec, acc) {
    const rand = this._seededRand(8);
    for (let i = 0; i < 3; i++) {
      const cx = s * 0.2 + rand() * s * 0.6;
      const cy = s * 0.3 + rand() * s * 0.4;
      const r = s * 0.1 + rand() * s * 0.08;
      ctx.fillStyle = sec;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#6D4C41';
    ctx.fillRect(s * 0.48, s * 0.65, s * 0.04, s * 0.12);
  }

  _drawPineForest(ctx, s, sec, acc) {
    const rand = this._seededRand(9);
    for (let i = 0; i < 4; i++) {
      const cx = s * 0.15 + rand() * s * 0.7;
      const base = s * 0.35 + rand() * s * 0.4;
      const h = s * 0.25 + rand() * s * 0.15;
      const w = s * 0.08 + rand() * s * 0.06;
      ctx.fillStyle = i % 2 === 0 ? sec : acc;
      ctx.beginPath();
      ctx.moveTo(cx, base - h);
      ctx.lineTo(cx - w, base);
      ctx.lineTo(cx + w, base);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#4E342E';
      ctx.fillRect(cx - 1.5, base, 3, s * 0.06);
    }
  }

  _drawClearing(ctx, s, sec, acc) {
    ctx.fillStyle = sec;
    ctx.beginPath();
    ctx.ellipse(s / 2, s / 2, s * 0.35, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    const rand = this._seededRand(10);
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const x = s / 2 + Math.cos(angle) * s * 0.38;
      const y = s / 2 + Math.sin(angle) * s * 0.32;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 3, y - 4);
      ctx.stroke();
    }
  }

  _drawHills(ctx, s, sec, acc) {
    ctx.fillStyle = sec;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.7);
    ctx.quadraticCurveTo(s * 0.25, s * 0.35, s * 0.5, s * 0.5);
    ctx.quadraticCurveTo(s * 0.75, s * 0.3, s, s * 0.6);
    ctx.lineTo(s, s);
    ctx.lineTo(0, s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = acc;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.5);
    ctx.quadraticCurveTo(s * 0.75, s * 0.3, s, s * 0.6);
    ctx.lineTo(s, s * 0.7);
    ctx.quadraticCurveTo(s * 0.75, s * 0.45, s * 0.5, s * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawMountain(ctx, s, sec, acc) {
    ctx.fillStyle = sec;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.1);
    ctx.lineTo(s * 0.15, s * 0.85);
    ctx.lineTo(s * 0.85, s * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ECEFF1';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.1);
    ctx.lineTo(s * 0.38, s * 0.32);
    ctx.lineTo(s * 0.62, s * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = acc;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.1);
    ctx.lineTo(s * 0.85, s * 0.85);
    ctx.lineTo(s * 0.5, s * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawDesert(ctx, s, sec, acc) {
    ctx.fillStyle = sec;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.6);
    ctx.quadraticCurveTo(s * 0.3, s * 0.4, s * 0.6, s * 0.55);
    ctx.quadraticCurveTo(s * 0.8, s * 0.45, s, s * 0.5);
    ctx.lineTo(s, s);
    ctx.lineTo(0, s);
    ctx.closePath();
    ctx.fill();
    const rand = this._seededRand(18);
    ctx.fillStyle = acc;
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.arc(rand() * s, rand() * s * 0.5, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawRoad(ctx, s, sec, acc) {
    ctx.fillStyle = sec;
    ctx.fillRect(s * 0.3, 0, s * 0.4, s);
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s * 0.3, 0);
    ctx.lineTo(s * 0.3, s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.7, 0);
    ctx.lineTo(s * 0.7, s);
    ctx.stroke();
    const rand = this._seededRand(19);
    ctx.fillStyle = acc;
    for (let i = 0; i < 4; i++) {
      const y = s * 0.1 + i * s * 0.25;
      ctx.beginPath();
      ctx.ellipse(s * 0.5, y, 2 + rand() * 2, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawBridge(ctx, s, sec, acc) {
    ctx.fillStyle = '#42A5F5';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = sec;
    ctx.fillRect(s * 0.2, 0, s * 0.6, s);
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1;
    const planks = 6;
    for (let i = 0; i <= planks; i++) {
      const y = (i / planks) * s;
      ctx.beginPath();
      ctx.moveTo(s * 0.2, y);
      ctx.lineTo(s * 0.8, y);
      ctx.stroke();
    }
    ctx.strokeStyle = acc;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s * 0.2, 0);
    ctx.lineTo(s * 0.2, s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.8, 0);
    ctx.lineTo(s * 0.8, s);
    ctx.stroke();
  }
}
