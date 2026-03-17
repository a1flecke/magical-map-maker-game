/* Magical Map Maker — Realm Brew Asset Loader */

class RealmBrewLoader {
  constructor() {
    this._manifest = null;
    this._available = false;
    this._detected = false;

    // Loaded tile images: Map<subThemeId, Map<filename, HTMLImageElement>>
    this._tileImages = new Map();

    // Resized tile cache: Map<`rb-${subTheme}-${filename}-${cellSize}`, HTMLCanvasElement>
    this._resizeCache = new Map();
    this._maxResizeCacheSize = 150;

    // Loaded overlay images: Map<packId, Map<filename, HTMLImageElement>>
    this._overlayImages = new Map();

    // Currently loading sub-theme (to prevent double-loads)
    this._loadingTiles = null;
    this._loadingOverlays = new Set();

    // Abort controllers for cancellable loading
    this._tileAbort = null;
  }

  /** Whether Realm Brew assets have been detected */
  get available() { return this._available; }

  /** The manifest data (sub-themes, file lists) */
  get manifest() { return this._manifest; }

  /** Get list of sub-themes with metadata */
  get subThemes() {
    return this._manifest ? this._manifest.subThemes : [];
  }

  /**
   * Load manifest and detect if Realm Brew assets are present.
   * Called once on app init.
   */
  async detect() {
    if (this._detected) return this._available;

    try {
      // Load manifest
      const resp = await fetch('js/data/realm-brew-manifest.json');
      if (!resp.ok) {
        this._detected = true;
        this._available = false;
        return false;
      }
      this._manifest = await resp.json();

      // Probe for a single tile file to detect if assets are present
      const firstTheme = Object.keys(this._manifest.tiles)[0];
      const firstFiles = firstTheme ? this._manifest.tiles[firstTheme] : null;
      if (!firstTheme || !firstFiles || firstFiles.length === 0) {
        this._detected = true;
        this._available = false;
        return false;
      }
      const firstFile = firstFiles[0];
      const probeUrl = `assets/realm-brew/tiles/${firstTheme}/${firstFile}`;

      const probe = await fetch(probeUrl, { method: 'HEAD' });
      this._available = probe.ok;
    } catch (e) {
      this._available = false;
    }

    this._detected = true;
    return this._available;
  }

  /**
   * Load all tile images for a sub-theme.
   * @param {string} subThemeId - e.g. 'man-hewn-dungeons'
   * @param {function} onProgress - callback(loaded, total)
   * @returns {Promise<boolean>} true if loaded, false if cancelled/failed
   */
  async loadTileSet(subThemeId, onProgress) {
    if (!this._available || !this._manifest) return false;

    // Already loaded
    if (this._tileImages.has(subThemeId)) return true;

    // Already loading this one
    if (this._loadingTiles === subThemeId) return false;

    // Cancel any in-progress tile load
    this.cancelTileLoad();

    this._loadingTiles = subThemeId;
    this._tileAbort = new AbortController();
    const signal = this._tileAbort.signal;

    const files = this._manifest.tiles[subThemeId];
    if (!files) return false;

    const images = new Map();
    const total = files.length;
    let loaded = 0;

    try {
      // Load in batches of 6 to avoid overwhelming the browser
      const batchSize = 6;
      for (let i = 0; i < files.length; i += batchSize) {
        if (signal.aborted) return false;

        const batch = files.slice(i, i + batchSize);
        const promises = batch.map(filename => {
          return new Promise((resolve, reject) => {
            if (signal.aborted) { reject(new Error('Aborted')); return; }

            const img = new Image();
            img.onload = () => {
              images.set(filename, img);
              loaded++;
              if (onProgress) onProgress(loaded, total);
              resolve();
            };
            img.onerror = () => {
              loaded++;
              if (onProgress) onProgress(loaded, total);
              resolve(); // Skip failed images, don't abort everything
            };
            img.src = `assets/realm-brew/tiles/${subThemeId}/${filename}`;
          });
        });

        await Promise.all(promises);
      }
    } catch (e) {
      this._loadingTiles = null;
      return false;
    }

    if (signal.aborted) {
      this._loadingTiles = null;
      return false;
    }

    this._tileImages.set(subThemeId, images);
    this._loadingTiles = null;
    return true;
  }

  /** Cancel any in-progress tile loading */
  cancelTileLoad() {
    if (this._tileAbort) {
      this._tileAbort.abort();
      this._tileAbort = null;
    }
    this._loadingTiles = null;
  }

  /**
   * Load all overlay images for a pack.
   * @param {string} packId - e.g. 'man-hewn-dungeons'
   * @param {function} onProgress - callback(loaded, total)
   * @returns {Promise<boolean>}
   */
  async loadOverlayPack(packId, onProgress) {
    if (!this._available || !this._manifest) return false;
    if (this._overlayImages.has(packId)) return true;
    if (this._loadingOverlays.has(packId)) return false;

    this._loadingOverlays.add(packId);

    const packData = this._manifest.overlays[packId];
    if (!packData) { this._loadingOverlays.delete(packId); return false; }

    const files = packData.files;
    const images = new Map();
    const total = files.length;
    let loaded = 0;

    const batchSize = 6;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const promises = batch.map(filename => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            images.set(filename, img);
            loaded++;
            if (onProgress) onProgress(loaded, total);
            resolve();
          };
          img.onerror = () => {
            loaded++;
            if (onProgress) onProgress(loaded, total);
            resolve();
          };
          img.src = `assets/realm-brew/overlays/${packId}/${filename}`;
        });
      });

      await Promise.all(promises);
    }

    this._overlayImages.set(packId, images);
    this._loadingOverlays.delete(packId);
    return true;
  }

  /**
   * Get a resized tile canvas for rendering on the grid.
   * @param {string} subThemeId
   * @param {string} filename
   * @param {number} targetW - target width in pixels
   * @param {number} targetH - target height in pixels
   * @returns {HTMLCanvasElement|null}
   */
  getResizedTile(subThemeId, filename, targetW, targetH) {
    const cacheKey = `rb-${subThemeId}-${filename}-${targetW}x${targetH}`;
    const cached = this._resizeCache.get(cacheKey);
    if (cached) return cached;

    const themeImages = this._tileImages.get(subThemeId);
    if (!themeImages) return null;

    const srcImg = themeImages.get(filename);
    if (!srcImg || !srcImg.complete || srcImg.naturalWidth === 0) return null;

    // Resize via offscreen canvas with bilinear interpolation
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(srcImg, 0, 0, targetW, targetH);

    // Evict oldest if cache full
    if (this._resizeCache.size >= this._maxResizeCacheSize) {
      const firstKey = this._resizeCache.keys().next().value;
      this._resizeCache.delete(firstKey);
    }

    this._resizeCache.set(cacheKey, canvas);
    return canvas;
  }

  /**
   * Get an overlay image (full resolution).
   * @param {string} packId
   * @param {string} filename
   * @returns {HTMLImageElement|null}
   */
  getOverlayImage(packId, filename) {
    const packImages = this._overlayImages.get(packId);
    if (!packImages) return null;
    return packImages.get(filename) || null;
  }

  /**
   * Check if a tile set is loaded.
   * @param {string} subThemeId
   * @returns {boolean}
   */
  isTileSetLoaded(subThemeId) {
    return this._tileImages.has(subThemeId);
  }

  /**
   * Check if an overlay pack is loaded.
   * @param {string} packId
   * @returns {boolean}
   */
  isOverlayPackLoaded(packId) {
    return this._overlayImages.has(packId);
  }

  /**
   * Get display name for a tile filename.
   * e.g. "RB Man Hewn Dungeons - Digital Tiles_01.png" → "Tile 01"
   */
  static tileDisplayName(filename) {
    // Extract number from filename
    const match = filename.match(/_(\d+)\.png$/i);
    if (match) return 'Tile ' + match[1];
    return filename.replace(/\.png$/i, '');
  }

  /**
   * Get display name for an overlay filename.
   * e.g. "Bridge (Broken) 1.png" → "Bridge (Broken) 1"
   * e.g. "Lab - Alchemy Table.png" → "Alchemy Table"
   */
  static overlayDisplayName(filename) {
    let name = filename.replace(/\.png$/i, '');
    // Strip room/category prefix like "Lab - ", "Storage - "
    const dashIdx = name.indexOf(' - ');
    if (dashIdx >= 0) {
      name = name.substring(dashIdx + 3);
    }
    return name;
  }

  /**
   * Get overlay category from filename.
   * e.g. "Lab - Alchemy Table.png" → "Lab"
   * e.g. "Bridge 1.png" → null
   */
  static overlayCategory(filename) {
    const dashIdx = filename.indexOf(' - ');
    if (dashIdx >= 0) {
      return filename.substring(0, dashIdx);
    }
    return null;
  }

  /**
   * Get all overlay packs from manifest.
   * Returns array of { id, label, fileCount }
   */
  getOverlayPacks() {
    if (!this._manifest) return [];
    return Object.entries(this._manifest.overlays).map(([id, data]) => ({
      id,
      label: data.label,
      fileCount: data.files.length
    }));
  }

  /** Clear resize cache (e.g. on zoom change) */
  clearResizeCache() {
    this._resizeCache.clear();
  }

  /** Unload a tile set to free memory */
  unloadTileSet(subThemeId) {
    this._tileImages.delete(subThemeId);
    // Clear related resize cache entries
    for (const key of this._resizeCache.keys()) {
      if (key.startsWith(`rb-${subThemeId}-`)) {
        this._resizeCache.delete(key);
      }
    }
  }

  /** Unload an overlay pack to free memory */
  unloadOverlayPack(packId) {
    this._overlayImages.delete(packId);
  }

  destroy() {
    this.cancelTileLoad();
    this._tileImages.clear();
    this._overlayImages.clear();
    this._resizeCache.clear();
    this._manifest = null;
    this._available = false;
    this._detected = false;
  }
}
