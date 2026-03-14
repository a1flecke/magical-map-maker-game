# Session 2: All Grid Shapes + Camera Controls

**Recommended Model:** opus
**Estimated Duration:** 5 hours
**Prerequisite:** Session 1 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

Add hexagon, isometric diamond, and octagon grid rendering. Implement pan and zoom so users can navigate larger maps. Shape selector on setup screen becomes functional.

---

## Deliverables

### 1. Hex Grid (`grid.js`)
- Pointy-top hexagon rendering
- **Hex dimensions rounded to whole pixels** to prevent sub-pixel gap artifacts
- Hex width = `cellSize`, height = `Math.round(cellSize * 2 / Math.sqrt(3))`
- Offset columns: odd columns shifted down by `hexHeight / 2`
- `pixelToHex(x, y)` — nearest-hex algorithm using cube coordinates
- `hexToPixel(col, row)` — center point of hex cell
- `getHexPath(col, row)` — Path2D for hexagon clipping
- Grid line rendering for hex grid
- Hex grid sizes: Small ~40 hexes, Medium ~110, Large ~270

### 2. Isometric Diamond Grid (`grid.js`)
- 45° rotated squares (diamond/rhombus shapes)
- Diamond width = `cellSize`, height = `cellSize / 2`
- `pixelToDiamond(x, y)` — rotate screen coords by -45°, floor-divide
- `diamondToPixel(col, row)` — center of diamond
- `getDiamondPath(col, row)` — Path2D for diamond clipping
- 4 neighbors per cell (N/S/E/W)
- Grid line rendering for diamond grid
- Diamond grid sizes: Small ~50, Medium ~130, Large ~320

### 3. Octagon Grid (`grid.js`)
- Octagons in a grid with small square fillers at intersections
- Two cell types: `{ cellType: 'oct' }` and `{ cellType: 'sq' }` (square fillers)
- `pixelToOct(x, y)` — hit test checking both oct and sq regions
- `octToPixel(col, row, cellType)` — center point
- `getOctPath(col, row, cellType)` — Path2D for oct or sq clipping
- **Both cell types are interactive** — users can place tiles on square fillers
- Palette labels square fillers as "connector tiles"
- Grid line rendering for octagon grid
- Save format includes `cellType` field for oct grids
- Octagon grid sizes: Small ~50, Medium ~130, Large ~330

### 4. Shape Selector (Setup Screen)
- `role="radiogroup"` with 4 `role="radio"` children + `aria-checked`
- Visual shape icons: square, hex, diamond, octagon
- Each shows a mini preview of the grid pattern
- Size estimates update when shape changes

### 5. Camera System (`camera.js`)
- `Camera` class: `offsetX`, `offsetY`, `zoom` (0.25 to 4.0)
- `screenToWorld(screenX, screenY)` — accounts for offset + zoom
- `worldToScreen(worldX, worldY)` — inverse
- `pan(dx, dy)`, `zoomTo(level, centerX, centerY)`
- `fitToGrid(gridWidth, gridHeight, canvasWidth, canvasHeight)` — auto-fit
- Camera transform: `ctx.save(); ctx.translate(); ctx.scale(); ... ctx.restore();`

### 6. Touch/Mouse Controls
- **Pinch zoom (touch):** Track 2 pointer IDs, distance delta → zoom, midpoint → zoom center
- **Scroll wheel zoom (mouse):** `wheel` event → zoom toward cursor
- **Two-finger pan (touch):** Midpoint movement while 2 pointers active → pan
- **Click-drag pan (mouse):** Right-click drag or pan mode toggle
- **Pan mode toggle:** Toolbar button, overrides single-finger placement
- Smooth zoom transitions (lerp over 200ms via RAF)

### 7. Toolbar Updates
- Zoom in/out buttons — functional
- Fit-to-screen button
- Pan mode toggle with active state
- Grid coordinate display: `(col, row)` of hovered cell

### 8. Tile Rendering Updates
- `TileRenderer.renderTile()` clips to any shape's Path2D
- Tile palette previews show tiles in the selected shape
- Offscreen cache keys include shape: `${tileId}-${shape}-${size}`
- Drag-to-paint and fill tool work with all grid shapes

### 9. `devicePixelRatio` Change Handling
- Listen via `matchMedia('(resolution: Xdppx)')` for DPR changes
- Re-size canvas and invalidate tile cache on change

---

## Review Criteria

### Spec Reviewer
- [ ] All 4 shapes per spec §4 (square, hex, isometric diamond, octagon)
- [ ] Isometric diamond replaces triangle
- [ ] Octagon has interactive square fillers with `cellType` in data
- [ ] 3 sizes for all 4 shapes
- [ ] Camera zoom 0.25–4.0

### Game Map Maker Reviewer
- [ ] All shapes tile seamlessly (no gaps)
- [ ] Grid lines align at all zoom levels
- [ ] Diamond grid looks like a strategy/RPG map
- [ ] Octagon filler squares are clearly labeled and usable
- [ ] Pan/zoom feels smooth

### Web Developer Reviewer
- [ ] Hex nearest-hex algorithm, rounded dimensions
- [ ] Diamond coordinate math correct
- [ ] Octagon hit-test covers both cell types
- [ ] Grid math round-trips: `gridToPixel(pixelToGrid(p))` ≈ p
- [ ] Pinch zoom via Pointer Events, `setPointerCapture`
- [ ] `devicePixelRatio` change listener
- [ ] No RAF outside editor.js
- [ ] `role="radiogroup"` on shape selector
