/* Magical Map Maker — Tile Definitions & Procedural Rendering */

class TileRenderer {
  constructor() {
    this._types = [];
    this._typeMap = {};
    this._cache = {};
    this._loaded = false;
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
    this._loaded = true;
  }

  getType(id) {
    return this._typeMap[id] || null;
  }

  getTypesForTheme(tileIds) {
    return tileIds.map(id => this._typeMap[id]).filter(Boolean);
  }

  /** Get cached tile image. Renders procedurally on first call. */
  getTileCanvas(tileId, shape, cellSize) {
    const key = `${tileId}-${shape}-${cellSize}`;
    if (this._cache[key]) return this._cache[key];

    const type = this._typeMap[tileId];
    if (!type) return null;

    const canvas = document.createElement('canvas');
    canvas.width = cellSize;
    canvas.height = cellSize;
    const ctx = canvas.getContext('2d');

    this._renderTile(ctx, type, cellSize);

    this._cache[key] = canvas;
    return canvas;
  }

  /** Clear cache (call on zoom change) */
  clearCache() {
    this._cache = {};
  }

  /** Procedural tile rendering per pattern */
  _renderTile(ctx, type, size) {
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
        this._drawOcean(ctx, size, secondary, accent);
        break;
      case 'shallow-water':
        this._drawShallowWater(ctx, size, secondary, accent);
        break;
      case 'river':
        this._drawRiver(ctx, size, secondary, accent);
        break;
      case 'lake':
        this._drawLake(ctx, size, secondary, accent);
        break;
      case 'swamp':
        this._drawSwamp(ctx, size, secondary, accent);
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

  /* ---- Procedural pattern renderers ---- */

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
    // Grass base
    this._drawGrass(ctx, s, pri, pri);
    // Flowers
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
      // Wheat head
      ctx.fillStyle = acc;
      ctx.beginPath();
      ctx.ellipse(x, y - h - 2, 1.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawSavanna(ctx, s, sec, acc) {
    const rand = this._seededRand(5);
    // Sparse grass
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
    // Occasional dry patch
    ctx.fillStyle = acc;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.ellipse(s * 0.3, s * 0.6, s * 0.15, s * 0.08, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  _drawFarmland(ctx, s, sec, acc) {
    // Furrow lines
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
    // Soil dots
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
      // Tree crown
      ctx.fillStyle = i % 2 === 0 ? sec : acc;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // Darker edge
      ctx.strokeStyle = acc;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Trunk hint
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
    // Trunk
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
      // Triangle pine
      ctx.fillStyle = i % 2 === 0 ? sec : acc;
      ctx.beginPath();
      ctx.moveTo(cx, base - h);
      ctx.lineTo(cx - w, base);
      ctx.lineTo(cx + w, base);
      ctx.closePath();
      ctx.fill();
      // Trunk
      ctx.fillStyle = '#4E342E';
      ctx.fillRect(cx - 1.5, base, 3, s * 0.06);
    }
  }

  _drawClearing(ctx, s, sec, acc) {
    // Lighter center
    ctx.fillStyle = sec;
    ctx.beginPath();
    ctx.ellipse(s / 2, s / 2, s * 0.35, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Small grass blades at edges
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

  _drawOcean(ctx, s, sec, acc) {
    // Wave lines
    ctx.strokeStyle = sec;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const y = s * 0.2 + i * s * 0.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(s * 0.25, y - 4, s * 0.5, y);
      ctx.quadraticCurveTo(s * 0.75, y + 4, s, y);
      ctx.stroke();
    }
  }

  _drawShallowWater(ctx, s, sec, acc) {
    // Gentle waves + transparency dots
    ctx.strokeStyle = sec;
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const y = s * 0.25 + i * s * 0.25;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(s * 0.25, y - 3, s * 0.5, y);
      ctx.quadraticCurveTo(s * 0.75, y + 3, s, y);
      ctx.stroke();
    }
    // Light sparkle dots
    const rand = this._seededRand(12);
    ctx.fillStyle = '#FFFFFF';
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(rand() * s, rand() * s, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawRiver(ctx, s, sec, acc) {
    // Flowing stripe
    ctx.fillStyle = sec;
    ctx.beginPath();
    ctx.moveTo(s * 0.3, 0);
    ctx.quadraticCurveTo(s * 0.2, s * 0.5, s * 0.35, s);
    ctx.lineTo(s * 0.65, s);
    ctx.quadraticCurveTo(s * 0.8, s * 0.5, s * 0.7, 0);
    ctx.closePath();
    ctx.fill();
    // Flow lines
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.15);
    ctx.lineTo(s * 0.48, s * 0.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.55);
    ctx.lineTo(s * 0.52, s * 0.75);
    ctx.stroke();
  }

  _drawLake(ctx, s, sec, acc) {
    // Oval water body
    ctx.fillStyle = sec;
    ctx.beginPath();
    ctx.ellipse(s / 2, s / 2, s * 0.4, s * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    // Shore line
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(s / 2, s / 2, s * 0.4, s * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  _drawSwamp(ctx, s, sec, acc) {
    // Muddy patches
    const rand = this._seededRand(15);
    ctx.fillStyle = sec;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(rand() * s, rand() * s, s * 0.12 + rand() * s * 0.08, s * 0.08, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    // Reed lines
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const x = rand() * s;
      const y = rand() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 2, y - 8 - rand() * 6);
      ctx.stroke();
    }
  }

  _drawHills(ctx, s, sec, acc) {
    // Rolling hill shapes
    ctx.fillStyle = sec;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.7);
    ctx.quadraticCurveTo(s * 0.25, s * 0.35, s * 0.5, s * 0.5);
    ctx.quadraticCurveTo(s * 0.75, s * 0.3, s, s * 0.6);
    ctx.lineTo(s, s);
    ctx.lineTo(0, s);
    ctx.closePath();
    ctx.fill();
    // Shadow
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
    // Mountain body
    ctx.fillStyle = sec;
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.1);
    ctx.lineTo(s * 0.15, s * 0.85);
    ctx.lineTo(s * 0.85, s * 0.85);
    ctx.closePath();
    ctx.fill();
    // Snow cap
    ctx.fillStyle = '#ECEFF1';
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.1);
    ctx.lineTo(s * 0.38, s * 0.32);
    ctx.lineTo(s * 0.62, s * 0.32);
    ctx.closePath();
    ctx.fill();
    // Shadow side
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
    // Sand dune curves
    ctx.fillStyle = sec;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.6);
    ctx.quadraticCurveTo(s * 0.3, s * 0.4, s * 0.6, s * 0.55);
    ctx.quadraticCurveTo(s * 0.8, s * 0.45, s, s * 0.5);
    ctx.lineTo(s, s);
    ctx.lineTo(0, s);
    ctx.closePath();
    ctx.fill();
    // Wind dots
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
    // Dirt road stripe
    ctx.fillStyle = sec;
    ctx.fillRect(s * 0.3, 0, s * 0.4, s);
    // Edge lines
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
    // Center stones
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
    // Water underneath
    ctx.fillStyle = '#42A5F5';
    ctx.fillRect(0, 0, s, s);
    // Bridge planks
    ctx.fillStyle = sec;
    ctx.fillRect(s * 0.2, 0, s * 0.6, s);
    // Plank lines
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
    // Rails
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
