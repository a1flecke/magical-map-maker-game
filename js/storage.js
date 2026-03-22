/* Magical Map Maker — Storage Manager (LocalStorage Save/Load) */

const STORAGE_KEY = 'magical-map-maker-saves';
const MAX_MAPS_WARNING = 10;
const MAX_BYTES_WARNING = 4 * 1024 * 1024; // 4MB
const SAVE_VERSION = 1;
const THUMB_W = 200;
const THUMB_H = 275;
const THUMB_QUALITY = 0.6;

class StorageManager {
  constructor() {
    this._maps = null; // lazy-loaded
    this._lastWarning = null;
  }

  /* ---- UUID ---- */

  static generateId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // RFC 4122 v4 UUID format
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return [
      hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16),
      hex.slice(16, 20), hex.slice(20)
    ].join('-');
  }

  /* ---- Internal persistence ---- */

  _loadIndex() {
    if (this._maps !== null) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this._maps = JSON.parse(raw);
        if (!Array.isArray(this._maps)) this._maps = [];
      } else {
        this._maps = [];
      }
    } catch (e) {
      console.warn('StorageManager: failed to parse saves, resetting', e);
      this._maps = [];
    }
  }

  _persist() {
    const json = JSON.stringify(this._maps);
    // Proactive size check before writing
    const bytes = new Blob([json]).size;
    if (bytes >= MAX_BYTES_WARNING) {
      this._lastWarning = 'Storage approaching limit (' + Math.round(bytes / 1024) + ' KB). Consider deleting old maps.';
    }
    try {
      localStorage.setItem(STORAGE_KEY, json);
    } catch (e) {
      console.error('StorageManager: failed to save', e);
      throw new Error('Could not save map. Storage may be full.');
    }
  }

  /** Returns and clears the last warning message, if any. */
  getLastWarning() {
    const warning = this._lastWarning;
    this._lastWarning = null;
    return warning;
  }

  /* ---- Public API ---- */

  /** List all saved maps (metadata only, no cell data) */
  listMaps() {
    this._loadIndex();
    return this._maps.map(m => ({
      id: m.id,
      name: m.name,
      themeId: m.themeId,
      shape: m.shape,
      sizeKey: m.sizeKey,
      cols: m.cols,
      rows: m.rows,
      thumbnail: m.thumbnail || null,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt
    }));
  }

  /** Load a full map by ID (including cell data) */
  loadMap(id) {
    this._loadIndex();
    const map = this._maps.find(m => m.id === id);
    if (!map) return null;
    return StorageManager.migrateVersion(JSON.parse(JSON.stringify(map)));
  }

  /** Save or update a map. Returns the map ID. */
  saveMap(mapData) {
    this._loadIndex();
    const now = new Date().toISOString();
    const existing = this._maps.findIndex(m => m.id === mapData.id);

    const record = {
      ...mapData,
      version: SAVE_VERSION,
      updatedAt: now
    };

    if (existing >= 0) {
      record.createdAt = this._maps[existing].createdAt || now;
      // Preserve existing thumbnail if incoming data has none
      if (!record.thumbnail && this._maps[existing].thumbnail) {
        record.thumbnail = this._maps[existing].thumbnail;
      }
      this._maps[existing] = record;
    } else {
      record.id = record.id || StorageManager.generateId();
      record.createdAt = now;
      this._maps.push(record);
    }

    this._persist();
    return record.id;
  }

  /** Delete a map by ID */
  deleteMap(id) {
    this._loadIndex();
    const idx = this._maps.findIndex(m => m.id === id);
    if (idx >= 0) {
      this._maps.splice(idx, 1);
      this._persist();
      return true;
    }
    return false;
  }

  /** Duplicate a map, returns new map ID */
  duplicateMap(id) {
    this._loadIndex();
    const original = this._maps.find(m => m.id === id);
    if (!original) return null;
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = StorageManager.generateId();
    copy.name = original.name + ' (Copy)';
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    this._maps.push(copy);
    this._persist();
    return copy.id;
  }

  /** Rename a map */
  renameMap(id, name) {
    this._loadIndex();
    const map = this._maps.find(m => m.id === id);
    if (!map) return false;
    map.name = name;
    map.updatedAt = new Date().toISOString();
    this._persist();
    return true;
  }

  /** Get storage usage info */
  getStorageUsage() {
    this._loadIndex();
    let bytes = 0;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      bytes = raw ? new Blob([raw]).size : 0;
    } catch (e) {
      bytes = 0;
    }
    return {
      mapCount: this._maps.length,
      bytes: bytes,
      warnCount: this._maps.length >= MAX_MAPS_WARNING,
      warnSize: bytes >= MAX_BYTES_WARNING,
      maxCountWarning: MAX_MAPS_WARNING,
      maxBytesWarning: MAX_BYTES_WARNING
    };
  }

  /* ---- Serialization helpers ---- */

  /** Serialize editor state to a save-ready object */
  static serializeMap(editor) {
    const grid = editor._grid;
    const cells = [];

    grid.forEachCell((col, row, cell, cellType) => {
      if (!cell.base && (!cell.overlays || cell.overlays.length === 0)) return;
      const entry = { col, row, base: cell.base || null };
      if (cellType) entry.cellType = cellType;
      if (cell.overlays && cell.overlays.length > 0) {
        entry.overlays = cell.overlays.map(o => ({
          id: o.id,
          rotation: o.rotation || 0,
          opacity: o.opacity != null ? o.opacity : 1.0,
          size: o.size || 'medium'
        }));
      }
      cells.push(entry);
    });

    return {
      id: editor._mapId || null,
      version: SAVE_VERSION,
      name: editor._mapName,
      themeId: editor._themeId,
      shape: editor._shape,
      sizeKey: editor._sizeKey,
      cols: grid.cols,
      rows: grid.rows,
      cells: cells,
      camera: {
        offsetX: editor._camera.offsetX,
        offsetY: editor._camera.offsetY,
        zoom: editor._camera.zoom
      },
      rbSubTheme: editor._rbSubTheme || null
    };
  }

  /** Restore cell data from a saved map into a grid */
  static deserializeIntoGrid(grid, savedCells) {
    if (!savedCells || !Array.isArray(savedCells)) return;
    for (const entry of savedCells) {
      const cellType = entry.cellType || undefined;
      const cell = grid.getCell(entry.col, entry.row, cellType);
      if (!cell) continue;
      if (entry.base) {
        grid.setBase(entry.col, entry.row, entry.base, cellType);
      }
      if (entry.overlays && Array.isArray(entry.overlays)) {
        cell.overlays = entry.overlays.map(o => ({
          id: o.id,
          rotation: o.rotation || 0,
          opacity: o.opacity != null ? o.opacity : 1.0,
          size: o.size || 'medium'
        }));
      }
    }
  }

  /** Version migration: add missing fields with defaults */
  static migrateVersion(map) {
    if (!map.version || map.version < 1) {
      map.version = 1;
    }
    // Ensure all cells have proper overlay format
    if (map.cells) {
      for (const cell of map.cells) {
        if (cell.overlays) {
          cell.overlays = cell.overlays.map(o => {
            if (typeof o === 'string') {
              return { id: o, rotation: 0, opacity: 1.0, size: 'medium' };
            }
            return {
              id: o.id,
              rotation: o.rotation || 0,
              opacity: o.opacity != null ? o.opacity : 1.0,
              size: o.size || 'medium'
            };
          });
        }
      }
    }
    return map;
  }

  /** Generate a JPEG thumbnail from the editor canvas */
  static generateThumbnail(sourceCanvas) {
    const thumb = document.createElement('canvas');
    thumb.width = THUMB_W;
    thumb.height = THUMB_H;
    const ctx = thumb.getContext('2d');

    // Fill with cream background matching app theme
    ctx.fillStyle = '#F5F0E8';
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);

    // Use CSS pixel dimensions (not physical device pixels) for scaling
    const dpr = window.devicePixelRatio || 1;
    const srcW = sourceCanvas.width / dpr;
    const srcH = sourceCanvas.height / dpr;
    const scale = Math.min(THUMB_W / srcW, THUMB_H / srcH);
    const dw = srcW * scale;
    const dh = srcH * scale;
    const dx = (THUMB_W - dw) / 2;
    const dy = (THUMB_H - dh) / 2;

    // drawImage uses the full physical canvas as source
    ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, dx, dy, dw, dh);

    return thumb.toDataURL('image/jpeg', THUMB_QUALITY);
  }
}
