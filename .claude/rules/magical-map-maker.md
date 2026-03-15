---
---

# Magical Map Maker — Architecture & Coding Rules

## Canvas Rendering

- **Single RAF loop:** `editor.js` owns the `requestAnimationFrame` loop. No other file calls `requestAnimationFrame` independently.
- **Dirty flag rendering:** Only redraw when `_dirty = true`. Set dirty on: tile placement, overlay change, camera move, zoom, resize.
- **Offscreen caching:** Every procedural tile is rendered once to an offscreen canvas, then `drawImage()` from cache. Cache key: `${baseType}-${shape}-${cellSize}`. Invalidate on zoom change. Consider a single tile atlas canvas (one large canvas holding all tile renders in a grid, blit with source rectangle) to reduce GPU memory overhead on iPad.
- **Layer order:** Draw base tiles first → overlays second → grid lines third → selection highlight last.
- **Canvas sizing:** Set `canvas.width/height` to device pixel dimensions (`clientWidth * devicePixelRatio`). Apply inverse scale via `ctx.scale(dpr, dpr)`. Listen for `devicePixelRatio` changes (display switching) via `matchMedia('(resolution: Xdppx)')` and re-size canvas.

## Grid Coordinate Systems

### Square Grid
- `col = Math.floor(pixelX / cellSize)`
- `row = Math.floor(pixelY / cellSize)`
- Pixel origin: `(col * cellSize, row * cellSize)`

### Hex Grid (pointy-top, offset columns)
- Hex width: `cellSize`
- **Hex height: round `cellSize * (2 / Math.sqrt(3))` to nearest whole pixel** to prevent sub-pixel gap artifacts. Derive effective cellSize from the rounded height.
- Odd columns offset down by `hexHeight / 2`
- Use cube coordinates for neighbor calculations, convert to offset for storage
- **Critical:** Pixel-to-hex conversion must use the nearest-hex algorithm (not simple division), accounting for the hexagonal boundary shape

### Isometric Diamond Grid
- 45° rotated squares. Each diamond has 4 neighbors (N/S/E/W).
- Diamond width = `cellSize`, height = `cellSize / 2`
- Pixel-to-diamond: rotate screen coords by -45°, then floor-divide
- Diamond-to-pixel: center of diamond at `((col - row) * cellSize/2 + offsetX, (col + row) * cellSize/4 + offsetY)`
- Hit testing: check if point falls within the diamond's rhombus boundary

### Octagon Grid
- Octagons arranged in grid with small square fillers at intersections
- Each octagon cell has 4 adjacent small-square cells
- Two cell types in data: `{ cellType: 'oct', col, row }` and `{ cellType: 'sq', col, row }`
- Save format includes `cellType` field for octagon grids
- Hit testing must check both octagon and square regions
- Both cell types are interactive — users can place tiles on square fillers too

## Input Handling

- **Pointer Events API only.** Never use `mousedown`/`mouseup`/`touchstart`/`touchend` directly. Use `pointerdown`, `pointermove`, `pointerup`, `pointercancel`.
- **Tile placement fires on `pointerup`** (not `pointerdown`). This disambiguates tap-to-place from pinch-zoom start. If a second pointer is detected during the interaction, placement is cancelled.
- **Touch-action CSS:** Set `touch-action: none` on the canvas to prevent browser gestures. Handle all gestures in JS.
- **Pinch zoom:** Track two active pointer IDs. Compute distance delta between them for zoom. Compute midpoint for zoom center.
- **Pan:** Single-pointer drag when in pan mode, or two-finger drag always.
- **Pointer capture:** Call `canvas.setPointerCapture(e.pointerId)` on `pointerdown` for drag operations.
- **Drag-to-paint:** When a tile is selected and user drags, paint each cell the pointer moves through. Use brush size (1, 2×2, 3×3).

## Data Files (js/data/*.json)

### base-types.json
```json
{
  "id": "string (kebab-case)",
  "name": "string (display name)",
  "category": "string (grassland-plains|forest-vegetation|water|elevation|desert-arid|arctic-cold|dungeon|space|volcanic-hazard|constructed|coastal-ocean|battlefield-tactical|continental-world)",
  "colors": { "primary": "#hex", "secondary": "#hex", "accent": "#hex" },
  "pattern": "string (texture pattern ID for procedural rendering)",
  "themes": ["string array of theme IDs where this base type is available"]
}
```
**110 base types total.** Each must have a visually distinct procedural rendering.

### overlays.json
```json
{
  "id": "string (kebab-case)",
  "name": "string (display name)",
  "category": "string (settlement|structure|wildlife|character|marker|numbered|lettered|navigation|nature|atmosphere|weather|hazard|label)",
  "themes": ["string array — empty means universal"],
  "svgSymbolId": "string (ID in overlays.svg sprite sheet)",
  "sizeRatio": 0.6
}
```
**~225 overlays total** (55 universal + ~170 theme-specific). Icons rendered via SVG sprite sheet, not individual Canvas drawing functions.

### themes.json
```json
{
  "id": "string (kebab-case)",
  "name": "string (display name)",
  "description": "string",
  "colors": { "bg": "#hex", "accent": "#hex", "grid": "#hex" },
  "baseTiles": ["string array of base-type IDs"],
  "overlays": ["string array of overlay IDs — combined with universals at runtime"]
}
```

## Overlay Rendering

- **SVG sprite sheet:** All overlay icons are `<symbol>` elements in `assets/icons/overlays.svg`.
- **Rendering to canvas:** Create an `Image()` with `src` set to the SVG symbol as a data URI, then `drawImage()` onto the canvas at the needed size.
- **Caching:** Cache rendered overlay images keyed by `${svgSymbolId}-${size}-${rotation}`.
- **Max 5 overlays per cell.**

## Export Pipeline

- **iPad canvas pixel limit:** Older iPads cap at ~16.7M pixels, newer at ~67M. Before creating export canvas, check: `width * height < maxPixels`. Detect limit by trying `document.createElement('canvas')` at increasing sizes. Fall back to 150 DPI if 300 DPI exceeds limit. For very large maps, render in horizontal strips and composite.
- **jsPDF bundled locally** (`js/lib/jspdf.umd.min.js`, ~250KB) — not CDN, for offline support.
- **PDF:** Render map to high-res canvas. `jsPDF.addImage()` on letter-size page. Title above, optional legend below.
- **PNG/JPEG:** High-res canvas → `toBlob()` → download link → `revokeObjectURL()`.
- **Print:** `@media print` CSS hides all UI. `window.print()`.
- **DPI calculation:** Screen 96 DPI, print 300 DPI, scale = 3.125×. 150 DPI fallback scale = 1.5625×.

## LocalStorage Safety

- Always wrap `JSON.parse(localStorage.getItem(...))` in try/catch.
- Before saving, check `JSON.stringify(data).length` against a 4MB soft limit. Warn user if approaching. Also warn at 10 maps regardless of size.
- Thumbnails are JPEG data URLs at 200×275px, quality 0.6, to minimize storage.
- Never store Realm Brew image data in LocalStorage.
- Save format includes `version: 1`. On load, StorageManager adds any missing fields with defaults (forward compatibility).

## Performance Budgets

| Operation | Budget |
|-----------|--------|
| Tile placement | < 5ms |
| Full grid redraw | < 16ms (60fps) |
| Palette scroll | No frame drops |
| Save to LocalStorage | < 100ms |
| PNG export (large map) | < 3s |
| PDF export (large map) | < 5s |

## iPad Safari Specifics

- `AudioContext` must be created in a user gesture handler, never in constructors.
- Safe area insets: use `env(safe-area-inset-*)` in CSS for notch/home-bar avoidance.
- Prevent elastic overscroll on the editor: `body { overflow: hidden; position: fixed; width: 100%; height: 100%; }` on the editor screen.
- Double-tap zoom prevention: `touch-action: manipulation` on buttons, `touch-action: none` on canvas.
- Blob download: iPad Safari may not support `<a download>`. Fall back to opening blob URL in new tab.
- Canvas pixel limits: detect and respect max canvas size (see Export Pipeline).

## Accessibility

- All buttons: `aria-label` matching visible text or describing icon function.
- **Shape/theme selectors:** `role="radiogroup"` with `role="radio"` children and `aria-checked`. NOT `aria-pressed` (that's for toggle buttons, not single-select).
- Palette tiles: `role="option"` inside `role="listbox"`. `aria-selected="true"` on chosen tile. When filtering, set `display:none` AND `aria-hidden="true"` on hidden items.
- Grid canvas: `role="application"` with `aria-label="Map editor grid. Use arrow keys to navigate cells."`. Announce tile placement via `role="status"` live region.
- Modal dialogs: focus trap + Escape to close + `aria-modal="true"`.
- Status messages (e.g., "Map saved"): `role="status"` div, update `textContent`. Use `role="alert"` ONLY for actual errors.
- Never combine `aria-live` + `aria-hidden` on the same element.
- Color: never rely on color alone to convey information. Use patterns, icons, or text labels alongside color.
- **Z-index stacking:** Document explicitly: canvas (0) < sidebars (10) < toolbar (20) < properties panel (30) < modals (100) < toasts (200).
