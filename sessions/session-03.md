# Session 3: Overlay System

**Recommended Model:** opus
**Estimated Duration:** 5 hours
**Prerequisite:** Session 2 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

Add overlays that can be placed on top of base tiles via SVG sprite sheet rendering. Right sidebar palette for overlays. Properties panel for inspecting/editing placed content.

---

## Deliverables

### 1. SVG Sprite Sheet (`assets/icons/overlays.svg`)
- Initial sprite sheet with Fantasy Overworld overlays (20) + first 20 universal overlays
- Each icon as a `<symbol id="overlay-{id}">` element
- Consistent viewBox (e.g., `0 0 64 64`) for all symbols
- Clean, recognizable icons at 30×30px minimum

### 2. Overlay Renderer (`js/overlays.js`)
- Load SVG sprite sheet
- `OverlayRenderer` class
- Render SVG symbol to canvas:
  1. Create `Image()` with inline SVG data URI containing the `<use>` reference
  2. Cache rendered image at needed size
  3. `drawImage()` onto map canvas
- Cache key: `${svgSymbolId}-${size}-${rotation}`
- Support rotation: 0°, 90°, 180°, 270°
- Support opacity: 0.1–1.0 via `ctx.globalAlpha`
- Support size: small (0.3×), medium (0.6×), large (0.9×) relative to cell

### 3. Overlay Data (`js/data/overlays.json`)
- Fantasy Overworld theme overlays (20): castle, village-cluster, wizard-tower, stone-bridge, ancient-ruins, cave-entrance, standing-stones, fairy-ring, dragon-lair, harbor, lighthouse, windmill, shrine, market-town, enchanted-well, giant-tree, crystal-spire, graveyard, battlefield-marker, royal-road
- Initial universal overlays (20): village, ruins, tribe-camp, campfire, deer, wolf, bird-flock, bear, treasure, danger-sign, question-mark, star-marker, compass-rose, arrow-north, arrow-south, arrow-east, arrow-west, tree-single, fire, text-label

### 4. Right Sidebar — Overlay Palette
- Title: "Overlays"
- Two tabs: "Theme" and "Universal"
- Scrollable list of overlay previews (44×44px tap targets)
- Overlay name below each preview
- `role="listbox"` with `role="option"` items
- Tap to select overlay

### 5. Search/Filter Bar
- At top of overlay palette
- Filters by name (case-insensitive substring)
- Debounced (200ms delay)
- Filtered-out items get `display: none` AND `aria-hidden="true"`
- Clear button to reset filter

### 6. Overlay Placement
- With overlay selected, tap grid cell (pointerup) to place
- Up to **5 overlays per cell** (stacked visually with slight offset)
- Overlays render centered on cell, stacked with positional jitter
- Can place overlays on empty cells (no base tile required)

### 7. Overlay Removal & Editing
- Tap cell → enters CELL_SELECTED state
- Properties panel shows overlays on that cell
- Each overlay has remove (✕) button
- Delete key removes most recently placed overlay
- "Clear overlays" button

### 8. Overlay Properties
- Rotation: 4 directional buttons (0°, 90°, 180°, 270°)
- Opacity slider: range input 0.1–1.0
- Size: small/medium/large selector
- Changes apply to the currently selected overlay
- Cell data: `{ id, rotation, opacity, size }`

### 9. Properties Panel
- Bottom panel (~120px, collapsible via CSS class toggle)
- Shows: cell coordinates, base tile name, overlay list with controls
- Toggle button to expand/collapse
- `aria-expanded` on toggle button

---

## Review Criteria

### Spec Reviewer
- [ ] 20 Fantasy overlays + 20 universals
- [ ] Up to 5 overlays per cell
- [ ] Rotation, opacity, size controls
- [ ] SVG sprite sheet approach

### Game Map Maker Reviewer
- [ ] SVG icons recognizable at 30×30px
- [ ] Overlays visually distinct from base tiles
- [ ] Stacked overlays don't obscure each other completely
- [ ] Castle, village, ruins look appropriate for fantasy

### Web Developer Reviewer
- [ ] SVG→Canvas rendering pipeline (data URI → Image → drawImage)
- [ ] Overlay cache keyed by symbolId + size + rotation
- [ ] Opacity via ctx.globalAlpha with save/restore
- [ ] Properties panel uses CSS class toggle
- [ ] Search filter debounced, sets aria-hidden
- [ ] Remove button is `<button>` with aria-label
- [ ] No memory leaks from cache growth
