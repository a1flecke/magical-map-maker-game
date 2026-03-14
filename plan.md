# Magical Map Maker — Implementation Plan

## Philosophy: Tracer Bullet

Each session delivers a working, testable increment. Session 1 produces a playable (minimal) map editor. Every subsequent session adds one major capability. Users can give feedback at every stage.

```
Session 1:  Skeleton + 1 theme + square grid + paint tiles + fill  → "I can make a simple map"
Session 2:  All 4 grid shapes + camera controls                    → "I can pick hex/diamond/oct"
Session 3:  Overlays system + overlay palette                      → "I can add details"
Session 4:  All 9 themes + full 100-tile catalog                   → "I can pick any world"
Session 5:  Save/load system + My Maps screen                      → "I can save and resume"
Session 6:  Export (PDF/PNG/JPEG) + print CSS                      → "I can print my map"
Session 7:  Realm Brew asset integration                           → "Dungeons look amazing"
Session 8:  Undo/redo + eraser + editor polish                     → "It feels professional"
Session 9:  Full overlay catalog (SVG sprites) + universal overlays → "So many options!"
Session 10: Starter templates + name generator + tutorial           → "Easy to start"
Session 11: Accessibility + iPad optimization + final polish        → "Ready for kids"
```

---

## Key Design Decisions (from review feedback)

### Reviewer-Driven Changes
1. **100 base types** (up from 35) — resolves section 3 vs section 6 mismatch. Space theme now has 14 tiles, not 4.
2. **55 universal overlays** (up from 30) — added numbered markers (1-10), lettered markers (A-F), character tokens (warrior, wizard, archer, king, monster, NPC), compass rose, scale bar, title banner.
3. **Isometric diamond replaces triangle** — triangles are confusing for kids; diamond grid is more intuitive (Minecraft/RPG style).
4. **Drag-to-paint + fill tool in Session 1** — painting one tile at a time on 320-cell grids is tedious, especially for ADHD audience.
5. **Tile placement on `pointerup`** — disambiguates tap vs pinch-zoom gesture.
6. **Max 5 overlays per cell** (up from 3) — dungeon maps need floor + door + torch + trap + decoration.
7. **SVG sprite sheet for overlay icons** — avoids 200+ individual Canvas drawing functions. Single `overlays.svg` with `<symbol>` elements.
8. **jsPDF bundled locally** (~250KB) — not CDN, for offline support.
9. **iPad export canvas limit** — detect max pixel count, fall back to 150 DPI on older iPads.
10. **Octagon save format** includes `cellType: "oct"|"sq"` field.
11. **Session 10 split into 10 + 11** — original session 10 was overloaded.
12. **Starter templates** added (Session 10) — pre-built maps reduce blank-canvas anxiety for young kids.
13. **Save format versioning** — `version: 1` field with migration on load. StorageManager adds missing fields with defaults.
14. **`role="radiogroup"`** for shape/theme selectors (not `aria-pressed`).
15. **`role="status"`** for toasts/notifications (not `role="alert"` except actual errors).
16. **Hex dimensions rounded** to whole pixels to prevent sub-pixel gap artifacts.
17. **`themes.js`** module added to session deliverables (ThemeManager class).

---

## Claude Infrastructure

### Rules File: `.claude/rules/magical-map-maker.md`

Path-scoped rules for all files under `magical-map-maker-game/`. Covers:
- Canvas rendering patterns (single RAF loop, offscreen caching)
- Grid coordinate systems for all 4 shapes (square, hex, isometric diamond, octagon)
- Pointer Events API usage (not mouse events)
- Gesture disambiguation (placement on pointerup, cancel on second pointer)
- Tile/overlay data schema requirements
- Export pipeline constraints (iPad canvas pixel limits)
- Performance budgets (16ms frame, <500KB saves)

### Agent: `mapmaker-review.md`

Senior web engineer code reviewer. Runs after each session to catch:
- Canvas performance issues (unnecessary redraws, missing caching)
- Grid math errors (hex offset bugs, diamond coordinate bugs)
- Accessibility violations (contrast, touch targets, keyboard nav)
- Memory leaks (orphaned canvases, event listeners)
- Export quality issues (DPI, page sizing, iPad canvas limits)

### Skills

#### `/mapmaker-checklist`
Pre-session checklist. Prints the rules most likely to cause bugs.

#### `/validate-map-data`
Post-edit validator for JSON data files (cross-file referential integrity).

### Hook: `validate-map-data-hook.sh`
PostToolUse hook: validates JSON syntax, duplicate IDs, required fields. Note: does NOT check cross-file references — run `/validate-map-data` manually after editing `themes.json`.

---

## Review Gates

Each session's output passes through three reviewers before the next session begins:

### 1. Spec Reviewer
- All specified features present
- Data structures match spec schemas
- Theme/tile/overlay counts match spec (100 bases, ~225 overlays, 55 universals)
- Accessibility requirements met

### 2. Senior Game Map Maker Reviewer
- Tile variety, visual distinctiveness, color palette cohesion
- Overlay placement, spatial sense, iconography clarity
- Grid shapes render correctly and tile seamlessly
- Missing terrain/overlay types, creative gaps
- Age-appropriate (7-year-olds AND 15-year-olds)

### 3. Senior Web Developer Reviewer
- Canvas performance, memory management, caching
- Pointer Events, gesture disambiguation
- Export pipeline (DPI, iPad limits, blob cleanup)
- LocalStorage safety, ARIA correctness
- iPad Safari compatibility, security

---

## Session Breakdown

### Session 1: Tracer Bullet — Core Editor with Drag-to-Paint
**Model:** opus
**Goal:** Working map editor with Fantasy theme, square grid, drag-to-paint tiles, fill tool, and brush sizes.

**Deliverables:**
1. `index.html` — main page with screen routing
2. Title screen with "New Map" button
3. New Map setup screen (Fantasy theme only, square shape only, 3 sizes, name input)
4. Map editor screen: canvas grid, left sidebar tile palette, toolbar
5. Tile placement on `pointerup` (not pointerdown) — cancels if second pointer detected
6. Drag-to-paint: hold and drag to paint multiple cells
7. Brush size selector (1, 2×2, 3×3) in toolbar
8. Fill tool: flood-fill connected empty cells with selected tile (BFS, max 500 cells)
9. `js/app.js`, `js/editor.js`, `js/grid.js`, `js/tiles.js`, `js/palette.js`, `js/input.js`, `js/camera.js`, `js/themes.js`
10. `js/data/base-types.json` with Fantasy theme base types (~20 types)
11. `js/data/themes.json` with Fantasy theme definition
12. `css/style.css`, `css/editor.css`, `css/themes.css`
13. OpenDyslexic font, cream background, dark text
14. `escHtml()` global helper in `app.js`

**Review focus:** Drag-to-paint responsiveness, fill tool correctness, gesture disambiguation.

---

### Session 2: All Grid Shapes + Camera
**Model:** opus
**Goal:** Add hexagon, isometric diamond, octagon grids. Pan and zoom.

**Deliverables:**
1. Hex grid (pointy-top, offset columns, dimensions rounded to whole pixels)
2. Isometric diamond grid (45° rotated squares, offset rows)
3. Octagon grid (octagons + small square fillers, both interactive)
4. Shape selector: `role="radiogroup"` with visual shape icons
5. Pixel ↔ grid coordinate conversion for all 4 shapes
6. Pinch-zoom (two-pointer tracking, fires on distance delta)
7. Two-finger pan + scroll-wheel zoom + pan mode toggle
8. Zoom controls (+/−, fit-to-screen)
9. Grid coordinate display on hover/tap
10. `devicePixelRatio` change listener for display switching

**Review focus:** Grid math correctness, seamless tiling, hex sub-pixel gaps, zoom performance.

---

### Session 3: Overlay System
**Model:** opus
**Goal:** Overlays placed on top of base tiles. Right sidebar palette.

**Deliverables:**
1. `js/overlays.js` — overlay rendering from SVG sprites
2. `assets/icons/overlays.svg` — initial SVG sprite sheet (Fantasy + 20 universal overlays)
3. `js/data/overlays.json` — overlay definitions (Fantasy theme overlays + initial universals)
4. Right sidebar overlay palette with "Theme" / "Universal" tabs
5. Tap overlay → tap cell to place (up to 5 per cell)
6. Remove individual overlays from properties panel
7. Overlay rotation (90° increments), opacity slider, size (small/medium/large)
8. Properties panel at bottom showing selected cell's contents
9. Search/filter bar in overlay palette (debounced, `aria-hidden` on filtered items)

**Review focus:** SVG→Canvas rendering pipeline, overlay stacking, palette filtering ARIA.

---

### Session 4: All 9 Themes + Full 100-Tile Catalog
**Model:** opus
**Goal:** All themes available with curated tile sets. All 100 base types.

**Deliverables:**
1. Complete `base-types.json` with all 100 base types
2. Complete `themes.json` with all 9 themes
3. `js/themes.js` — ThemeManager class (load, switch, apply colors, filter tiles/overlays)
4. Procedural tile rendering for all 100 base types
5. Theme selector: `role="radiogroup"` with 9 theme cards
6. Theme CSS custom properties per theme
7. Run `/validate-map-data` after completing JSON files

**Review focus:** Visual distinctiveness of 100 tiles, theme color cohesion, ThemeManager API.

---

### Session 5: Save/Load System
**Model:** sonnet
**Goal:** Save maps to LocalStorage, load from My Maps gallery.

**Deliverables:**
1. `js/storage.js` — StorageManager with save/load/delete/list/duplicate/rename
2. Save format per spec §10.2 (with `cellType`, per-overlay objects, `version: 1`)
3. Version migration: on load, add missing fields with defaults
4. Auto-save every 30s, manual save Cmd+S
5. "My Maps" screen with thumbnail grid
6. Delete confirmation (accessible modal)
7. Quota warning based on `getStorageUsage()` bytes AND map count (both triggers)
8. UUID via `crypto.getRandomValues()`
9. Thumbnails: JPEG 200×275px, quality 0.6

**Review focus:** Data integrity, version migration, quota handling.

---

### Session 6: Export System
**Model:** opus
**Goal:** Export as PDF, PNG, JPEG. Print-ready output.

**Deliverables:**
1. `js/export.js` — ExportManager
2. jsPDF bundled locally in `js/lib/jspdf.umd.min.js` (~250KB)
3. iPad canvas size detection: try 300 DPI, fall back to 150 DPI
4. Strip-based rendering for large maps that exceed canvas pixel limit
5. PDF export: 8.5×11", title, optional legend
6. PNG/JPEG export with blob cleanup (`revokeObjectURL`)
7. iPad Safari fallback: open blob URL in new tab if `<a download>` unsupported
8. Export dialog (accessible modal with format picker, quality slider, progress bar)
9. `css/print.css` with `@media print` rules
10. Legend generator (used tile types with color swatches)

**Review focus:** iPad canvas limits, DPI fallback, blob cleanup, legend.

---

### Session 7: Realm Brew Asset Integration
**Model:** opus
**Goal:** Realm Brew hand-drawn tiles enhance Dungeon theme.

**Deliverables:**
1. `js/realm-brew.js` — RealmBrewLoader (detect, load, resize, cache)
2. `js/data/realm-brew-manifest.json` — hardcoded filenames per directory
3. Tile resize pipeline (1200×1039 → cell size, offscreen canvas)
4. Dungeon theme enhancement (hex shape: Realm Brew tiles; other shapes: procedural fallback)
5. Sub-theme selector: Man Hewn, Subterranean Rivers, Underdark Caverns
6. 6 Realm Brew overlay packs as palette categories
7. Graceful fallback when assets not present
8. `scripts/setup-realm-brew.sh` — copy/rename helper script

**Review focus:** Image loading performance, memory management, fallback correctness.

---

### Session 8: Undo/Redo + Editor Polish
**Model:** sonnet
**Goal:** Full undo/redo, eraser tool, keyboard shortcuts, editor refinements.

**Deliverables:**
1. `js/history.js` — command pattern undo/redo (max 50 steps)
2. Undo/redo keyboard shortcuts (Cmd+Z, Cmd+Shift+Z)
3. Eraser tool (toggle, tap/drag to clear cells)
4. "Clear All" with confirmation dialog
5. Tile rotation (pre-placement) and flip (H/V)
6. Number keys 1–9 for quick palette selection
7. All keyboard shortcuts: E=eraser, F=fill, G=grid, P=pan, R=rotate, ?=help
8. Keyboard shortcuts overlay modal
9. Toolbar tooltips, selection animations, smooth zoom transitions
10. Sound effects: tile place, overlay place, undo (Web Audio, optional toggle)

**Review focus:** Undo correctness, shortcut conflicts with browser, sound toggle.

---

### Session 9: Complete Overlay Catalog (SVG Sprites)
**Model:** opus
**Goal:** All ~225 overlays as SVG sprites. Full universal overlay set.

**Deliverables:**
1. Complete `js/data/overlays.json` with all overlays from spec
2. Complete `assets/icons/overlays.svg` sprite sheet with all ~225 overlay icons
3. All 55 universal overlays (including numbered markers, character tokens, compass rose, scale bar, title banner)
4. Theme tab + Universal tab in palette, with collapsible categories
5. Overlay search bar (debounced filter)
6. Text label overlay (custom text input, multiple font sizes)
7. Title banner overlay (decorative scroll/cartouche)
8. Scale bar overlay ("1 square = X")
9. Favorites system (LocalStorage key: `magical-map-maker-favorites`)
10. Recently used overlays section

**Review focus:** SVG icon clarity at 30×30px, search performance, sprite sheet size.

---

### Session 10: Starter Templates + Name Generator + Tutorial
**Model:** sonnet
**Goal:** Pre-built maps, fantasy name generator, welcome tutorial for first-time users.

**Deliverables:**
1. `js/data/templates.json` — 2–3 starter templates per theme (18–27 total)
   - Fantasy: "Small Island", "Forest Kingdom", "Mountain Pass"
   - Dungeon: "Dungeon Entrance", "Treasure Room"
   - Space: "Star System", "Space Station"
   - etc.
2. "Start from Template" option on setup screen alongside "Blank Map"
3. Template browser: grid of template cards with thumbnails and names
4. Fantasy name generator (adjective + noun combos, theme-aware)
5. "Random Name" button on setup screen
6. Welcome tutorial overlay (4 steps with pointing arrows, first-time only)
7. "Show Tutorial Again" in settings
8. Random terrain fill button: "Auto-Fill" populates empty cells with theme-appropriate random tiles
9. Settings panel: font size, sound toggle, auto-save toggle, grid default, show coordinates

**Review focus:** Template variety, name generator quality, tutorial clarity for 7-year-olds.

---

### Session 11: Accessibility + iPad Optimization + Final Polish
**Model:** opus
**Goal:** Full a11y compliance, iPad-optimized experience, release-ready quality.

**Deliverables:**
1. Full keyboard navigation (Tab order: toolbar → palettes → canvas → properties)
2. Screen reader: `role="application"` on canvas, `role="status"` announcements
3. Focus indicators (3px solid theme accent)
4. Touch target audit (all ≥ 44×44px, ≥ 8px spacing)
5. WCAG AA contrast audit on all 9 themes (document ratios in `themes.css`)
6. iPad Safari: elastic scroll prevention, safe area insets, `touch-action: manipulation`
7. Responsive layout: landscape + portrait (sidebars → bottom drawers in portrait)
8. `devicePixelRatio` change handling (display switching)
9. Loading states, skeleton screens
10. Error handling: corrupt save recovery, export failure graceful degradation
11. Toast notifications: `role="status"` for info, `role="alert"` for errors only
12. Service Worker for offline support (cache HTML, CSS, JS, SVG sprites, jsPDF)
13. Final performance profiling (60fps on large grid, export < 5s)
14. Final QA checklist (all themes, shapes, sizes, save/load, export, a11y)

**Review focus:** VoiceOver, contrast ratios, iPad edge cases, offline, performance.

---

## Definition of Done

A session is complete when:
1. All deliverables are implemented and working in Safari
2. Spec Reviewer confirms alignment with `spec.md`
3. Game Map Maker Reviewer approves visual/cartographic quality
4. Web Developer Reviewer approves code quality
5. No critical or high-severity bugs remain
6. Changes are committed with descriptive message
7. GitHub Pages deployment succeeds
