# Session 1: Tracer Bullet — Core Editor with Drag-to-Paint

**Recommended Model:** opus
**Estimated Duration:** 5 hours
**Prerequisite:** Run `/mapmaker-checklist` before starting

---

## Goal

Deliver a working map editor with the Fantasy Overworld theme, square grid, drag-to-paint tiles, fill tool, and brush sizes. At the end of this session, a user can create a new map, paint terrain tiles efficiently, and see their map take shape.

---

## Deliverables

### 1. HTML Entry Point (`index.html`)
- Load OpenDyslexic font via CDN `<link>`
- Load jsPDF locally from `js/lib/jspdf.umd.min.js` (for future use, just the script tag)
- Link all CSS files
- Load all JS files with `defer`
- Root `<div id="app">` container
- Three screen containers: `#title-screen`, `#setup-screen`, `#editor-screen`
- Status message `<div role="status">` for announcements
- `window.app = new App(); window.app.init();`

### 2. Title Screen
- Game title: "Magical Map Maker" in OpenDyslexic
- Subtitle: "Create your own fantasy worlds!"
- "New Map" button (prominent, 44×44px minimum)
- "My Maps" button (disabled with "Coming Soon" tooltip — session 5)
- Settings gear icon (disabled — session 10)
- Cream background (#F5F0E8), dark text (#2C2416)

### 3. New Map Setup Screen
- Theme selector: show only Fantasy Overworld as a card with preview (uses `role="radiogroup"`)
- Shape selector: show only Square as visual option (uses `role="radiogroup"`)
- Size selector: Small / Medium / Large radio cards with piece count estimates
- Map name text input (with placeholder "My Fantasy Map")
- "Create Map" button → transitions to editor
- "Back" button → title screen

### 4. Map Editor Screen
- **Canvas** (`#map-canvas`): full remaining viewport after toolbar/sidebars
  - Square grid rendered with light gray lines
  - Cell size based on chosen map size
  - `touch-action: none` on canvas
- **Left sidebar** — Tile Palette:
  - Title: "Terrain Tiles"
  - Scrollable list of ~20 Fantasy base tiles
  - Each tile rendered as a 60×60px preview (procedural Canvas)
  - Tile name below each preview
  - `role="listbox"` with `role="option"` items, `aria-selected`
  - Tap to select (highlighted border)
- **Toolbar** (top):
  - Back button (← arrow)
  - Map name display
  - Grid toggle button
  - Brush size selector: 1 / 2×2 / 3×3 (visual buttons)
  - Fill tool toggle button (paint bucket icon)
  - Zoom in/out buttons (stub — functional in session 2)

### 5. Tile Placement (on `pointerup`)
- Tap a palette tile to select it
- Tap a grid cell (pointerup) to place the selected tile
- **Cancel placement if second pointer detected** (pinch gesture disambiguation)
- Tap an already-placed tile to select it (blue highlight)

### 6. Drag-to-Paint
- With tile selected, hold and drag across grid cells to paint
- Each cell pointer moves through gets the selected tile
- Respects brush size (1, 2×2, 3×3)
- Brush size 2×2 places a 2×2 block centered on cursor cell
- Brush size 3×3 places a 3×3 block

### 7. Fill Tool
- Toggle via toolbar button or `F` key
- With tile selected and fill mode active, tap a cell → flood-fill
- BFS algorithm: fills all connected empty cells with selected tile
- Safety limit: max 500 cells per fill
- Visual feedback: brief highlight on filled area

### 8. JavaScript Files

#### `js/app.js` — Entry Point
- `App` class with `init()`, screen routing
- Screen transitions via CSS class `.active`
- Global `escHtml()` helper function

#### `js/editor.js` — Editor State Machine
- Owns the RAF loop (single source of truth)
- States: IDLE, TILE_SELECTED, CELL_SELECTED, FILL_MODE
- Dirty-flag rendering
- Holds references to Grid, TileCache, Palette, InputHandler, ThemeManager

#### `js/grid.js` — Grid Rendering
- `Grid` class for square grid (hex/diamond/oct added in session 2)
- `pixelToGrid(x, y)` → `{col, row}` or null
- `gridToPixel(col, row)` → `{x, y}`
- `getCellPath(col, row)` → Path2D
- Grid state: `cells[row][col] = { base: null, overlays: [], rotation: 0, flipH: false, flipV: false }`
- `floodFill(col, row, tileId, maxCells)` — BFS fill

#### `js/tiles.js` — Tile Definitions & Procedural Rendering
- Load `base-types.json`
- `TileRenderer` with procedural drawing per base type
- Offscreen canvas cache: `_cache[cacheKey]`
- ~20 Fantasy base types with distinct procedural textures

#### `js/palette.js` — Sidebar Palette UI
- Populates left sidebar with tile previews
- Handles selection state, fires `onTileSelected(tileId)` callback

#### `js/input.js` — Input Handler
- Pointer events on canvas: `pointerdown`, `pointermove`, `pointerup`, `pointercancel`
- **Placement on `pointerup`** — tracks active pointer count, cancels if > 1
- Drag-to-paint: fires `onCellDrag(col, row)` during pointermove when tile selected
- Brush size awareness
- Keyboard: Escape to deselect, F for fill mode

#### `js/camera.js` — Camera (stub)
- `Camera` class with `offsetX`, `offsetY`, `zoom`
- `screenToWorld(x, y)` and `worldToScreen(x, y)`
- Session 1: zoom fixed at 1.0 — pan/zoom in session 2

#### `js/themes.js` — Theme Manager
- `ThemeManager` class
- Loads `themes.json`, provides `getTheme(id)`, `getAvailableTiles(themeId)`
- Applies theme CSS custom properties to editor container

### 9. Data Files

#### `js/data/base-types.json`
- ~20 Fantasy Overworld base tiles (subset of full 100):
  grassland, tall-grass, wildflower-field, wheat-field, savanna, farmland, forest, light-woods, pine-forest, clearing, ocean, shallow-water, river, lake, swamp, hills, mountain, desert-sand, road, bridge
- Full schema: id, name, category, colors, pattern, themes

#### `js/data/themes.json`
- 1 entry: Fantasy Overworld theme
- Colors: bg #F5F0E8, accent #4A7C59, grid #C8BFA9

### 10. CSS Files
- `css/style.css` — global reset, cream bg, screen containers, buttons (44px min)
- `css/editor.css` — CSS Grid layout, toolbar, sidebar, canvas container
- `css/themes.css` — Fantasy theme custom properties

---

## Review Criteria

### Spec Reviewer
- [ ] Fantasy Overworld theme with ~20 tiles per spec §3.2 and §6
- [ ] Square grid at all 3 sizes
- [ ] Drag-to-paint with brush sizes
- [ ] Fill tool with BFS flood-fill
- [ ] Placement on pointerup, cancelled on second pointer

### Game Map Maker Reviewer
- [ ] ~20 Fantasy tiles are visually distinct
- [ ] Drag-to-paint feels smooth and responsive
- [ ] Fill tool is intuitive (fills only empty, bounded correctly)
- [ ] Brush sizes feel useful

### Web Developer Reviewer
- [ ] Single RAF loop in editor.js, dirty-flag rendering
- [ ] Offscreen tile caching
- [ ] Pointer Events only (not mouse/touch)
- [ ] Placement on pointerup with pinch cancellation
- [ ] DPR-aware canvas sizing
- [ ] `escHtml()` defined in app.js
- [ ] CSS class visibility toggles
- [ ] `role="radiogroup"` on setup selectors
- [ ] `role="listbox"` on palette
