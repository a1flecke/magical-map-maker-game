/* Magical Map Maker — Overlay Renderer */

class OverlayRenderer {
  constructor() {
    this._overlays = [];
    this._loaded = false;
    this._svgDoc = null;
    this._cache = new Map(); // key: `${symbolId}-${size}-${rotation}` → ImageBitmap or canvas
    this._maxCacheSize = 500;
  }

  async load() {
    if (this._loaded) return;

    // Load overlay data
    const resp = await fetch('js/data/overlays.json');
    if (!resp.ok) throw new Error('Failed to load overlays.json: ' + resp.status);
    this._overlays = await resp.json();

    // Load SVG sprite sheet
    const svgResp = await fetch('assets/icons/overlays.svg');
    if (!svgResp.ok) throw new Error('Failed to load overlays.svg: ' + svgResp.status);
    const svgText = await svgResp.text();

    // Parse SVG into a document fragment for symbol extraction
    const parser = new DOMParser();
    this._svgDoc = parser.parseFromString(svgText, 'image/svg+xml');

    this._loaded = true;
  }

  /** Get overlay definition by ID */
  getOverlay(id) {
    return this._overlays.find(o => o.id === id) || null;
  }

  /** Get all overlay definitions */
  getAllOverlays() {
    return this._overlays;
  }

  /** Get overlays available for a theme (theme-specific + universals) */
  getOverlaysForTheme(themeId, themeOverlayIds) {
    const themeSet = new Set(themeOverlayIds || []);
    return this._overlays.filter(o => {
      // Universal overlays (empty themes array) are always available
      if (o.themes.length === 0) return true;
      // Theme-specific: included if overlay's themes list contains this theme
      return o.themes.includes(themeId);
    });
  }

  /** Get universal overlays only */
  getUniversalOverlays() {
    return this._overlays.filter(o => o.themes.length === 0);
  }

  /** Get theme-specific overlays only */
  getThemeOverlays(themeId) {
    return this._overlays.filter(o => o.themes.length > 0 && o.themes.includes(themeId));
  }

  /**
   * Render an overlay icon to canvas at specified position.
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} overlayId - overlay definition ID
   * @param {number} cx - center X in world coords
   * @param {number} cy - center Y in world coords
   * @param {number} cellSize - cell size for sizing
   * @param {object} props - { rotation: 0|90|180|270, opacity: 0.1-1.0, size: 'small'|'medium'|'large' }
   */
  drawOverlay(ctx, overlayId, cx, cy, cellSize, props = {}) {
    const overlay = this.getOverlay(overlayId);
    if (!overlay) return;

    const rotation = props.rotation || 0;
    const opacity = props.opacity != null ? props.opacity : 1.0;
    const sizeKey = props.size || 'medium';

    const sizeRatios = { small: 0.3, medium: 0.6, large: 0.9 };
    const ratio = sizeRatios[sizeKey] || 0.6;
    const drawSize = Math.round(cellSize * ratio);

    const img = this._getCachedImage(overlay.svgSymbolId, drawSize, rotation);
    if (!img) return;

    ctx.save();
    if (opacity < 1.0) {
      ctx.globalAlpha = opacity;
    }

    // Draw centered on cx, cy
    ctx.drawImage(img, cx - drawSize / 2, cy - drawSize / 2, drawSize, drawSize);

    ctx.restore();
  }

  /**
   * Get or create a cached rendered image for an SVG symbol.
   * Cache key: `${symbolId}-${size}-${rotation}`
   */
  _getCachedImage(symbolId, size, rotation) {
    const key = `${symbolId}-${size}-${rotation}`;
    if (this._cache.has(key)) return this._cache.get(key);

    // Extract symbol from parsed SVG
    const symbol = this._svgDoc ? this._svgDoc.getElementById(symbolId) : null;
    if (!symbol) return null;

    // Build standalone SVG with the symbol content
    const viewBox = symbol.getAttribute('viewBox') || '0 0 64 64';
    const innerSVG = symbol.innerHTML;

    let svgStr;
    if (rotation !== 0) {
      // Derive pivot from viewBox center
      const vbParts = viewBox.split(/\s+/);
      const vbCx = (parseFloat(vbParts[0]) + parseFloat(vbParts[2])) / 2;
      const vbCy = (parseFloat(vbParts[1]) + parseFloat(vbParts[3])) / 2;
      svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}">` +
        `<g transform="rotate(${rotation} ${vbCx} ${vbCy})">${innerSVG}</g></svg>`;
    } else {
      svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}">${innerSVG}</svg>`;
    }

    // Render SVG to offscreen canvas via Image + data URI
    const offscreen = document.createElement('canvas');
    offscreen.width = size;
    offscreen.height = size;
    const offCtx = offscreen.getContext('2d');

    const img = new Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      offCtx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);

      // Evict oldest if cache is full
      if (this._cache.size >= this._maxCacheSize) {
        const firstKey = this._cache.keys().next().value;
        this._cache.delete(firstKey);
      }
      this._cache.set(key, offscreen);
      // Signal that a new overlay image is ready for rendering
      if (this.onCachePopulated) this.onCachePopulated();
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
    };

    img.src = url;

    // Return null on first call (async render), cached canvas on subsequent calls
    return null;
  }

  /**
   * Pre-render overlay icons for palette preview.
   * Returns a canvas with the icon rendered at the given size.
   */
  getPreviewCanvas(overlayId, size) {
    const overlay = this.getOverlay(overlayId);
    if (!overlay) return null;
    return this._getCachedImage(overlay.svgSymbolId, size, 0);
  }

  /**
   * Render overlay previews asynchronously and call back when ready.
   * Used by the palette to populate preview images.
   */
  renderPreview(overlayId, size, callback) {
    const overlay = this.getOverlay(overlayId);
    if (!overlay) return;

    // Check cache first to avoid duplicate work
    const cacheKey = `${overlay.svgSymbolId}-${size}-0`;
    const cached = this._cache.get(cacheKey);
    if (cached) { callback(cached); return; }

    const symbol = this._svgDoc ? this._svgDoc.getElementById(overlay.svgSymbolId) : null;
    if (!symbol) return;

    const viewBox = symbol.getAttribute('viewBox') || '0 0 64 64';
    const innerSVG = symbol.innerHTML;
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}">${innerSVG}</svg>`;

    const offscreen = document.createElement('canvas');
    offscreen.width = size;
    offscreen.height = size;
    const offCtx = offscreen.getContext('2d');

    const img = new Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      offCtx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);

      const key = `${overlay.svgSymbolId}-${size}-0`;
      if (this._cache.size >= this._maxCacheSize) {
        const firstKey = this._cache.keys().next().value;
        this._cache.delete(firstKey);
      }
      this._cache.set(key, offscreen);

      callback(offscreen);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
    };

    img.src = url;
  }

  /** Clear the render cache (e.g., on zoom change) */
  clearCache() {
    this._cache.clear();
  }

  destroy() {
    this._cache.clear();
    this._svgDoc = null;
  }
}
