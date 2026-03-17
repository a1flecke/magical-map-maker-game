/* Magical Map Maker — Export Manager (PDF / PNG / JPEG / Print) */

const EXPORT_DPI_HIGH = 300;
const EXPORT_DPI_LOW = 150;
const EXPORT_SCALE_HIGH = EXPORT_DPI_HIGH / 96; // 3.125×
const EXPORT_SCALE_LOW = EXPORT_DPI_LOW / 96;   // 1.5625×
const LETTER_W_IN = 8.5;
const LETTER_H_IN = 11;
const LETTER_MARGIN_IN = 0.5;
const JPEG_EXPORT_QUALITY = 0.85;
const PDF_IMAGE_QUALITY = 0.92;

class ExportManager {

  /**
   * Render the map to a high-resolution offscreen canvas.
   * @param {object} editor - Editor instance
   * @param {object} options - { dpi, includeGrid, includeAnimations }
   * @returns {{ canvas: HTMLCanvasElement, scale: number }}
   */
  static renderExportCanvas(editor, options = {}) {
    const grid = editor._grid;
    const tileRenderer = editor._tileRenderer;
    const overlayRenderer = editor._overlayRenderer;
    const themeManager = editor._themeManager;
    const themeId = editor._themeId;

    const includeGrid = options.includeGrid !== false;
    const scale = ExportManager._detectScale(grid);

    const mapW = grid.widthPx;
    const mapH = grid.heightPx;
    const canvasW = Math.ceil(mapW * scale);
    const canvasH = Math.ceil(mapH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');

    // Scale context for high-res rendering
    ctx.scale(scale, scale);

    // Background
    const theme = themeManager.getTheme(themeId);
    ctx.fillStyle = theme ? theme.colors.bg : '#F5F0E8';
    ctx.fillRect(0, 0, mapW, mapH);

    // Layer 1: Base tiles
    ExportManager._renderTiles(ctx, grid, tileRenderer);

    // Layer 2: Overlays
    ExportManager._renderOverlays(ctx, grid, overlayRenderer);

    // Layer 3: Grid lines (optional)
    if (includeGrid) {
      const gridColor = theme ? theme.colors.grid : '#C8BFA9';
      grid.drawGridLines(ctx, gridColor);
    }

    return { canvas, scale };
  }

  static _renderTiles(ctx, grid, tileRenderer) {
    const cellSize = grid.cellSize;
    const shape = grid.shape;

    grid.forEachCell((col, row, cell, cellType) => {
      if (!cell.base) return;

      const img = tileRenderer.getTileImage(cell.base, shape, cellSize, grid, col, row, cellType);
      if (!img) return;

      if (shape === 'square') {
        const ox = col * cellSize;
        const oy = row * cellSize;
        ctx.drawImage(img.atlas, img.sx, img.sy, img.sw, img.sh, ox, oy, cellSize, cellSize);
      } else {
        const path = grid.getCellPath(col, row, cellType);
        ctx.save();
        ctx.clip(path);
        const bleed = 1;

        if (shape === 'octagon' && cellType === 'sq') {
          const origin = grid.cellOrigin(col, row, 'sq');
          ctx.drawImage(img.atlas, img.sx, img.sy, img.sw, img.sh,
            origin.x - bleed, origin.y - bleed, grid.sqSize + bleed * 2, grid.sqSize + bleed * 2);
        } else if (shape === 'hex') {
          const origin = grid.cellOrigin(col, row);
          ctx.drawImage(img.atlas, img.sx, img.sy, img.sw, img.sh,
            origin.x - bleed, origin.y - bleed, grid.hexW + bleed * 2, grid.hexH + bleed * 2);
        } else if (shape === 'diamond') {
          const origin = grid.cellOrigin(col, row);
          ctx.drawImage(img.atlas, img.sx, img.sy, img.sw, img.sh,
            origin.x - bleed, origin.y - bleed, grid.dW + bleed * 2, grid.dH + bleed * 2);
        } else {
          const origin = grid.cellOrigin(col, row, cellType);
          ctx.drawImage(img.atlas, img.sx, img.sy, img.sw, img.sh,
            origin.x - bleed, origin.y - bleed, cellSize + bleed * 2, cellSize + bleed * 2);
        }
        ctx.restore();
      }
    });
  }

  static _renderOverlays(ctx, grid, overlayRenderer) {
    const cellSize = grid.cellSize;
    const shape = grid.shape;

    grid.forEachCell((col, row, cell, cellType) => {
      if (!cell.overlays || cell.overlays.length === 0) return;

      let cx, cy;
      if (shape === 'square') {
        cx = col * cellSize + cellSize / 2;
        cy = row * cellSize + cellSize / 2;
      } else {
        const center = grid.gridToPixel(col, row, cellType);
        cx = center.x;
        cy = center.y;
      }

      for (const ov of cell.overlays) {
        overlayRenderer.renderOverlay(ctx, ov.id, cx, cy, cellSize, ov);
      }
    });
  }

  /**
   * Detect safe export scale factor based on canvas pixel limits.
   * Older iPads cap at ~16.7M pixels, newer at ~67M.
   */
  static _detectScale(grid) {
    const mapW = grid.widthPx;
    const mapH = grid.heightPx;

    // Try 300 DPI first
    const highW = Math.ceil(mapW * EXPORT_SCALE_HIGH);
    const highH = Math.ceil(mapH * EXPORT_SCALE_HIGH);
    if (ExportManager._canCreateCanvas(highW, highH)) {
      return EXPORT_SCALE_HIGH;
    }

    // Fall back to 150 DPI
    const lowW = Math.ceil(mapW * EXPORT_SCALE_LOW);
    const lowH = Math.ceil(mapH * EXPORT_SCALE_LOW);
    if (ExportManager._canCreateCanvas(lowW, lowH)) {
      return EXPORT_SCALE_LOW;
    }

    // Last resort: 1:1
    return 1;
  }

  static _canCreateCanvas(w, h) {
    // Known limits: ~16.7M pixels for older iPads, ~67M for newer
    const pixels = w * h;
    if (pixels > 67_000_000) return false;

    try {
      const test = document.createElement('canvas');
      test.width = w;
      test.height = h;
      const ctx = test.getContext('2d');
      if (!ctx) { test.width = 0; test.height = 0; return false; }
      // Write+readback test to confirm the canvas actually allocated its backing store
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      const ok = d[3] === 255;
      // Release GPU backing store
      test.width = 0;
      test.height = 0;
      return ok;
    } catch (e) {
      return false;
    }
  }

  /* ---- Legend ---- */

  /**
   * Generate a legend of unique tile types used in the map.
   * Returns array of { id, name, color }
   */
  static generateLegend(grid, tileRenderer) {
    const used = new Map();
    grid.forEachCell((col, row, cell) => {
      if (cell.base && !used.has(cell.base)) {
        const type = tileRenderer.getType(cell.base);
        if (type) {
          used.set(cell.base, { id: cell.base, name: type.name, color: type.colors.primary });
        }
      }
    });
    return Array.from(used.values());
  }

  /* ---- PDF Export ---- */

  static exportPDF(editor, options = {}) {
    const { canvas } = ExportManager.renderExportCanvas(editor, options);
    const legend = options.includeLegend ? ExportManager.generateLegend(editor._grid, editor._tileRenderer) : null;
    const mapName = editor._mapName || 'Map';

    // Determine orientation based on map aspect ratio
    const mapAspect = canvas.width / canvas.height;
    const landscape = mapAspect > 1;

    const pageW = landscape ? LETTER_H_IN : LETTER_W_IN;
    const pageH = landscape ? LETTER_W_IN : LETTER_H_IN;
    const margin = LETTER_MARGIN_IN;

    // jsPDF uses points internally but accepts inches with 'in' unit
    const pdf = new jspdf.jsPDF({
      orientation: landscape ? 'landscape' : 'portrait',
      unit: 'in',
      format: 'letter'
    });

    // Title
    const titleY = margin;
    const titleH = 0.4;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text(mapName, pageW / 2, titleY + titleH / 2, { align: 'center', baseline: 'middle' });

    // Map area
    const mapAreaTop = titleY + titleH + 0.1;
    const legendH = legend && legend.length > 0 ? Math.ceil(legend.length / 2) * 0.18 + 0.3 : 0;
    const mapAreaH = pageH - mapAreaTop - margin - legendH;
    const mapAreaW = pageW - margin * 2;

    // Scale map image to fit
    const imgAspect = canvas.width / canvas.height;
    let imgW, imgH;
    if (imgAspect > mapAreaW / mapAreaH) {
      imgW = mapAreaW;
      imgH = mapAreaW / imgAspect;
    } else {
      imgH = mapAreaH;
      imgW = mapAreaH * imgAspect;
    }
    const imgX = margin + (mapAreaW - imgW) / 2;
    const imgY = mapAreaTop + (mapAreaH - imgH) / 2;

    // Add map image
    const imgData = canvas.toDataURL('image/jpeg', PDF_IMAGE_QUALITY);
    pdf.addImage(imgData, 'JPEG', imgX, imgY, imgW, imgH);

    // Legend
    if (legend && legend.length > 0) {
      const legendY = pageH - margin - legendH + 0.1;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Legend', margin, legendY);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      const swatchSize = 0.12;
      const lineH = 0.18;
      const colWidth = mapAreaW / 2;
      let lx = margin;
      let ly = legendY + 0.15;
      let col = 0;

      for (const entry of legend) {
        const drawX = lx + col * colWidth;
        const cr = parseInt(entry.color.slice(1, 3), 16);
        const cg = parseInt(entry.color.slice(3, 5), 16);
        const cb = parseInt(entry.color.slice(5, 7), 16);
        pdf.setFillColor(cr, cg, cb);
        pdf.rect(drawX, ly, swatchSize, swatchSize, 'F');
        pdf.setTextColor(44, 36, 22);
        pdf.text(entry.name, drawX + swatchSize + 0.05, ly + swatchSize / 2, { baseline: 'middle' });
        col++;
        if (col >= 2) { col = 0; ly += lineH; }
      }
    }

    // Save
    const filename = ExportManager._filename(mapName, 'pdf');
    pdf.save(filename);
  }

  /* ---- PNG Export ---- */

  static exportPNG(editor, options = {}) {
    const { canvas } = ExportManager.renderExportCanvas(editor, options);
    const filename = ExportManager._filename(editor._mapName || 'Map', 'png');

    canvas.toBlob((blob) => {
      ExportManager._downloadBlob(blob, filename, 'image/png');
    }, 'image/png');
  }

  /* ---- JPEG Export ---- */

  static exportJPEG(editor, options = {}) {
    const quality = options.quality || JPEG_EXPORT_QUALITY;
    const { canvas } = ExportManager.renderExportCanvas(editor, options);
    const filename = ExportManager._filename(editor._mapName || 'Map', 'jpg');

    canvas.toBlob((blob) => {
      ExportManager._downloadBlob(blob, filename, 'image/jpeg');
    }, 'image/jpeg', quality);
  }

  /* ---- Print ---- */

  static print() {
    window.print();
  }

  /* ---- Download Helpers ---- */

  static _downloadBlob(blob, filename, mimeType) {
    const url = URL.createObjectURL(blob);

    // Detect <a download> support (iPad Safari may not support it)
    const a = document.createElement('a');
    if ('download' in a) {
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a short delay to ensure download starts
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } else {
      // Fallback: open in new tab (iPad Safari)
      const win = window.open(url, '_blank');
      if (!win) {
        // Popup blocked — show inline
        ExportManager._showFallbackMessage(url);
      }
      // Don't revoke immediately — user needs time to save from the new tab
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }

  static _showFallbackMessage(url) {
    const msg = document.getElementById('status-message');
    if (msg) {
      msg.textContent = 'Long-press the image to save it to your device.';
    }
  }

  static _filename(mapName, ext) {
    const safe = mapName.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '-').toLowerCase() || 'map';
    const date = new Date().toISOString().slice(0, 10);
    return safe + '-' + date + '.' + ext;
  }
}
