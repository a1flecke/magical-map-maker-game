# Magical Map Maker — Implementation Plan

## Philosophy: Tracer Bullet

Each session delivers a working, testable increment. Session 1 produces a playable (minimal) map editor. Every subsequent session adds one major capability. Users can give feedback at every stage.

```
Session 1:  Skeleton + 1 theme + square grid + paint tiles + fill       → "I can make a simple map"
Session 2:  All 4 grid shapes + camera controls                         → "I can pick hex/diamond/oct"
Session 3:  Graphics engine + animation framework + water upgrade        → "Water comes alive"
Session 4:  Land transitions + 15 Fantasy tile upgrades                  → "The whole map breathes"
Session 5:  Natural organic tiles (30 tiles)                             → "Forests, coasts, deserts alive"
Session 6:  Harsh & underground tiles (30 tiles)                         → "Mountains, ice, dungeons glow"
Session 7:  Exotic & built tiles (30 tiles) + performance tuning         → "Every tile is beautiful"
Session 8:  Overlays system + overlay palette                            → "I can add details"
Session 9:  All 9 themes + full 100-tile catalog                        → "I can pick any world"
Session 10: Save/load system + My Maps screen                           → "I can save and resume"
Session 11: Export (PDF/PNG/JPEG) + print CSS                           → "I can print my map"
Session 12: Realm Brew asset integration                                 → "Dungeons look amazing"
Session 13: Undo/redo + eraser + editor polish                          → "It feels professional"
Session 14: Full overlay catalog (SVG sprites) + universal overlays      → "So many options!"
Session 15: Starter templates + name generator + tutorial                → "Easy to start"
Session 16: Accessibility + iPad optimization + final polish             → "Ready for kids"
```

---

## Key Design Decisions (from review feedback)

### Reviewer-Driven Changes
1. **110 base types** (up from 35) — resolves section 3 vs section 6 mismatch. Space theme now has 14 tiles, not 4.
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
- Theme/tile/overlay counts match spec (110 bases, ~225 overlays, 55 universals)
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
1. Hex grid (flat-top, offset columns, dimensions rounded to whole pixels)
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

### Session 3: Graphics Engine + Animation Framework + Water Upgrade
**Model:** opus
**Goal:** Build the new rendering infrastructure — tile atlas cache, neighbor-aware rendering, animation framework with adaptive quality, material properties data model. Upgrade all water tiles (5) to N64-quality with merging and animation.

**Deliverables:**
1. Perlin noise utility (~100 lines vanilla JS), pre-computed 256×256 noise texture
2. Tile atlas cache (2-4 large 2048×2048 canvases with LRU eviction at ~200 entries) replacing individual offscreen canvases
3. `js/animation.js` — AnimationManager: three-tier RAF (animate → idle throttle → still/stop), adaptive quality (5 levels) with exponential backoff hysteresis, animation intensity classification (gentle/intense)
4. Material properties data model + `waterContent` flag in `base-types.json` for all 20 Fantasy tiles
5. Neighbor-aware rendering with FNV-1a hash (not charAt(0)), budgeted re-caching (8-10 cells/frame), progressive cache warming
6. Water merging with edge cases: L-shapes, single-cell contained mode, corner-fill arcs, hex triple-junctions, octagon filler cells
7. River flow direction (inferred from neighbor topology)
8. Shoreline rendering with 8 context-specific styles (muddy, sandy, rocky, reinforced, frozen, volcanic, jungle, swamp-to-land)
9. N64-quality water tile upgrades (ocean, shallow-water, river, lake, swamp) with Perlin noise textures
10. Water animations with gentle/intense classification
11. "Map Life" toolbar toggle (Full/Subtle/Still) with `prefers-reduced-motion` handling and keyboard accessibility
12. Hero frame export at t=2.5s
13. Pause/resume: visibilitychange + pagehide/pageshow + blur/focus
14. All 4 grid shapes, all `ctx.save()`/`ctx.restore()` wrapped

**Review focus:** Water merging across all 4 grid shapes + edge cases, tile atlas memory (<7MB), animation budget (<4ms with viewport culling), adaptive quality hysteresis.

---

### Session 4: Land Transitions + 15 Fantasy Tile Upgrades
**Model:** opus
**Goal:** Three transition modes (terrestrial, space, dungeon). Upgrade remaining 15 patterned Fantasy tiles to N64-quality.

**Deliverables:**
1. Three transition modes: terrestrial (material property vectors), space (nebula blend, star merge, hard planet boundaries), dungeon (architectural: wall/open/threshold)
2. Terrestrial transitions: 5 property axes with bidirectional blending, cell-size-aware scaling (≥48px full, 32-47px gradient-only, <32px hard edges)
3. Scatter objects: max 4 per edge, 12 per cell, pre-computed position lookup table
4. N64 upgrades: grassland (6), forest (4), elevation (2), desert (1), constructed (2 — road, bridge)
5. Theme-specific traffic animations for all 9 themes (fantasy: carts; dungeon: rats; space: drones; etc.)
6. Animation intensity tags (gentle/intense) for all new effects
7. Material properties for all 15 upgraded tiles, `transitionMode` field in themes.json
8. All transitions on all 4 grid shapes

**Review focus:** Transition quality across property extremes, dungeon architectural transitions, space blending, traffic per theme, cell-size scaling.

---

### Session 5: Natural Organic Tiles (30 tiles)
**Model:** opus
**Goal:** N64-quality rendering for 30 natural terrain tiles: remaining grassland (6), forest (6), water (7), desert (5), coastal (6).

**Deliverables:**
1. 30 N64-quality tile renders using established infrastructure (Perlin noise, multi-layer gradients, organic shapes)
2. Waterfall/rapids as self-contained scenes with rotation-based directionality
3. Hybrid water tiles (`waterContent: true`): mangrove, hot-spring, delta, oasis, tidal-pool
4. Material properties for all 30 tiles
5. Animation intensity tags for all new effects

**Review focus:** Visual distinctiveness, water merging integration, oasis→water connections, coastal shoreline transitions.

---

### Session 6: Harsh & Underground Tiles (30 tiles)
**Model:** opus
**Goal:** N64-quality rendering for 30 tiles: elevation (8), arctic (8), dungeon (10), battlefield (4). Dungeon uses architectural transitions.

**Deliverables:**
1. 30 N64-quality tile renders
2. Dungeon tiles use architectural transition mode (corridor merging, doorway thresholds)
3. Dungeon water tiles (`underground-river`, `sewer`) use water merging within channels
4. Arctic `ice-shelf` has `waterContent: true`
5. Material properties for all 28 tiles
6. Animation intensity tags for all new effects

**Review focus:** Dungeon atmospheric mood, architectural transitions, arctic cold feeling, ice/water hybrid behavior.

---

### Session 7: Exotic & Built Tiles (30 tiles) + Performance Tuning
**Model:** opus
**Goal:** N64-quality for final 30 tiles: space (14), volcanic (6), constructed (6), continental (4). Space uses space transition mode. Comprehensive performance and visual consistency pass.

**Deliverables:**
1. 28 N64-quality tile renders (space stylized/cartoony, shared art vocabulary)
2. Space tiles use space transition mode (nebula blend, star field merge)
3. No-man's-land age-appropriate (subtle barbed wire, not graphic)
4. Material properties for all 28 tiles, `waterContent` for harbor
5. Performance optimization: profiling on iPad, adaptive quality threshold tuning, viewport culling refinement
6. Visual consistency pass across all 100 tiles
7. Run `/validate-map-data` for all updated JSON

**Review focus:** All 100 tiles visually distinct and cohesive, frame time <16ms on iPad, atlas memory <7MB, space art direction kid-friendly.

---

### Session 8: Overlay System
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

### Session 9: All 9 Themes + Full 100-Tile Catalog
**Model:** opus
**Goal:** All themes available with curated tile sets. All 110 base types wired to themes with N64-quality graphics and correct transition modes.

**Deliverables:**
1. Complete `themes.json` with all 9 themes (including `transitionMode` per theme)
2. `js/themes.js` — ThemeManager class (load, switch, apply colors, filter tiles/overlays, select transition mode)
3. Verify all 110 base types render correctly with neighbor-aware transitions per theme's transition mode
4. Theme selector: `role="radiogroup"` with 9 theme cards
5. Theme CSS custom properties per theme
6. Run `/validate-map-data` after completing JSON files

**Review focus:** Theme color cohesion, transitions work per theme mode (terrestrial/space/dungeon), ThemeManager API.

---

### Session 10: Save/Load System
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

### Session 11: Export System
**Model:** opus
**Goal:** Export as PDF, PNG, JPEG. Print-ready output with hero frame rendering.

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
11. Hero frame rendering at t=2.5s — clear export cache after blob generation to prevent memory spike

**Review focus:** iPad canvas limits, DPI fallback, blob cleanup, legend, hero frame quality, export cache memory.

---

### Session 12: Realm Brew Asset Integration
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

### Session 13: Undo/Redo + Editor Polish
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

### Session 14: Complete Overlay Catalog (SVG Sprites)
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

### Session 15: Starter Templates + Name Generator + Tutorial
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

### Session 16: Accessibility + iPad Optimization + Final Polish
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
8. `devicePixelRatio` change handling (progressive cache warming, not lag spike)
9. Loading states, skeleton screens
10. Error handling: corrupt save recovery, export failure graceful degradation
11. Toast notifications: `role="status"` for info, `role="alert"` for errors only
12. Service Worker for offline support (cache HTML, CSS, JS, SVG sprites, jsPDF)
13. Final performance profiling (60fps on large grid with animations, export < 5s, atlas memory <7MB)
14. Final QA checklist (all themes, shapes, sizes, save/load, export, a11y, animation quality levels, transition modes)

**Review focus:** VoiceOver, contrast ratios, iPad edge cases, offline, performance with animation system, DPR change handling.

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
