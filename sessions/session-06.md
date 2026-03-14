# Session 6: Export System (PDF / PNG / JPEG / Print)

**Recommended Model:** opus
**Estimated Duration:** 4–5 hours
**Prerequisite:** Session 5 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

Export maps as PDF, PNG, or JPEG for printing on 8.5×11" paper. iPad canvas size detection with DPI fallback.

---

## Deliverables

### 1. Export Manager (`js/export.js`)
- `ExportManager` class
- `exportPDF(mapData, options)`, `exportPNG(mapData, options)`, `exportJPEG(mapData, options)`, `print(mapData)`

### 2. jsPDF Bundled Locally
- Download jsPDF UMD build (~250KB) into `js/lib/jspdf.umd.min.js`
- Load via `<script defer>` in `index.html`
- NOT from CDN — enables offline support

### 3. iPad Canvas Size Detection
- Before creating export canvas, detect max pixel count:
  - Try creating a test canvas at target size
  - If it fails or exceeds known limits, reduce DPI
- **300 DPI first** (scale 3.125×) — for desktops and newer iPads
- **150 DPI fallback** (scale 1.5625×) — for older iPads
- **Strip rendering:** For very large maps exceeding even 150 DPI limits, render in horizontal strips and composite onto final canvas

### 4. PDF Export
- Page: Letter (8.5×11", 612×792pt)
- Layout: title (OpenDyslexic) centered top, map centered with 0.5" margins, optional legend, footer
- `jsPDF.addImage()` with rendered canvas as JPEG (0.92 quality)
- Landscape or portrait based on grid aspect ratio

### 5. PNG Export
- `canvas.toBlob('image/png')` → `<a download>` → click → `revokeObjectURL()`
- Filename: `{mapName}-{date}.png`

### 6. JPEG Export
- Quality slider (0.7–0.95, default 0.85)
- Same flow as PNG with `image/jpeg`

### 7. iPad Safari Fallback
- Detect `<a download>` support
- Fallback: open blob URL in new tab
- Show instruction: "Long-press the image to save"

### 8. Export Dialog
- Accessible modal (focus trap, Escape, `aria-modal`)
- Format picker (radio group), quality slider (JPEG only), legend checkbox (PDF only)
- Progress bar during render
- Preview thumbnail

### 9. Print Support (`css/print.css`)
- `@media print` hides all UI
- Map canvas full-page, title above
- `@page { size: letter; margin: 0.5in; }`

### 10. Legend Generator
- Auto-lists unique base tile types used
- Color swatch (20×20) + name, 2-column layout
- Optional: include overlay types

---

## Review Criteria

### Spec Reviewer
- [ ] PDF at 8.5×11" with title/legend
- [ ] DPI fallback for iPad
- [ ] jsPDF bundled locally (not CDN)

### Game Map Maker Reviewer
- [ ] Exported map looks sharp when printed
- [ ] Legend readable, grid lines subtle on paper

### Web Developer Reviewer
- [ ] Canvas size detection before export
- [ ] Strip rendering for oversized maps
- [ ] Blob URL revoked (no memory leak)
- [ ] Export dialog accessible
- [ ] iPad Safari download fallback
