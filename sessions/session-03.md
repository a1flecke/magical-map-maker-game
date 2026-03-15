# Session 3: Graphics Engine + Animation Framework + Water Upgrade

**Recommended Model:** opus
**Estimated Duration:** 6–8 hours
**Prerequisite:** Session 2 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

Build the new rendering infrastructure: tile atlas caching, neighbor-aware rendering, animation framework with adaptive quality scaling, and the material properties data model. Prove it all out by upgrading the 5 water tiles to N64-quality graphics with merging, shorelines, and animated effects.

---

## Deliverables

### 1. Perlin Noise Utility
- Lightweight 2D Perlin noise implementation in vanilla JS (~100 lines), added to `tiles.js`
- Pre-compute a 256×256 noise texture canvas at startup (~0.3ms)
- `sampleNoise(u, v)` function samples from pre-computed texture via UV coordinates
- Deterministic (same seed → same noise) for reproducible tile rendering

### 2. Tile Atlas Cache System
Replace individual offscreen canvases with a tile atlas architecture:
- 2-4 large atlas canvases (2048×2048 each) instead of hundreds of small offscreen canvases
- Lookup table: `cacheKey → { atlasIndex, sx, sy, sw, sh }` mapping cache keys to atlas source rectangles
- Blit to main canvas via 9-argument `drawImage(atlas, sx, sy, sw, sh, dx, dy, dw, dh)`
- **LRU eviction** at ~200 entries. Track total memory via `width * height * 4`. Evict least-recently-used when cap reached.
- Keeps canvas context count in single digits (critical for iPad Safari — undocumented limit on active canvas contexts causes silent GC or creation failure with hundreds of offscreen canvases)
- `clearAtlas()` for zoom/DPR changes
- **Progressive cache warming**: On zoom/DPR change, re-render visible tiles center-outward over multiple frames. Show flat-fill + grid fallback for tiles not yet cached.

### 3. Animation Manager (`js/animation.js`)
- `AnimationManager` class, integrated with editor's existing RAF loop (NOT a separate RAF)
- Provides `animationTime` (monotonic clock, paused when tab hidden)
- **Three-tier RAF strategy:**
  - **Animating**: RAF runs continuously, animation layer renders per frame with staggering
  - **Idle throttle**: After 10s of no interaction + no camera movement, throttle to 15fps. Resume on next pointer event.
  - **Still mode**: RAF only renders on dirty flag. Stops entirely after 5s idle, restarts on input.
- Adaptive quality system:
  - Measures frame time via `performance.now()` before/after render
  - Rolling average of last 20 frames
  - 5 quality levels (see spec §9.4.4):
    - Level 1 (Full): avg < 12ms
    - Level 2 (Reduced): avg 12-14ms
    - Level 3 (Low FPS): avg 14-16ms — animation layer drops to 30fps, interaction stays 60fps
    - Level 4 (Minimal): avg > 16ms sustained — simplest wave offset only
    - Level 5 (Static): manual toggle or `prefers-reduced-motion`
  - **Exponential backoff hysteresis**: First step-up requires 60 frames of good performance. If it immediately drops back, next step-up requires 120 frames, then 240. Reset after 5+ seconds at higher quality. Prevents visible oscillation.
  - Exposes `qualityLevel` for renderers to check
- **Animation intensity classification**: Each effect tagged as `gentle` or `intense`
  - Gentle (allowed in Subtle mode): wave sway, grass ripple, torch flicker, star twinkle
  - Intense (disabled in Subtle mode): fish leaping, dragonfly paths, lava pulse, wormhole spiral
- `prefers-reduced-motion` media query listener via `addEventListener('change')` — defaults to Level 5 (Static)
- **Pause/resume handlers** (belt-and-suspenders for iPad Safari):
  - `visibilitychange` — primary
  - `pagehide`/`pageshow` — backup (iPad sometimes skips visibilitychange on home bar swipe)
  - `blur`/`focus` — catches remaining edge cases
- Hero frame mode: `setHeroFrame()` locks `animationTime` to `t = 2.5s` for export. Each animation's `render(t)` must produce a visually balanced result at this value (waves mid-crest, ripples at pleasing radii, animals naturally posed).
- **Animation staggering**: Tile at `(col, row)` only updates when `(frameCount + col + row) % 3 === 0`. Each tile animates at ~20fps but load is distributed.
- **Viewport culling** (mandatory): Only animate tiles visible on screen. At typical zoom ~40-80 tiles are visible. Skip tiles >50% obscured by sidebar.

### 4. Material Properties Data Model
- Add `materialProperties` field to each tile in `base-types.json`:
  ```json
  "materialProperties": {
    "elevation": 0,
    "moisture": 10,
    "density": 0,
    "temperature": 5,
    "organic": true
  }
  ```
- Add `"waterContent": true` field to hybrid water tiles: `oasis`, `harbor`, `moat`, `hot-spring`, `delta`, `dam`, `tidal-pool`, `underground-river`, `sewer`
- Define properties for all existing Fantasy theme tiles (20 tiles)
- Properties guide transition rendering (Session 4) but are defined now for architecture validation
- **Update `/validate-map-data` hook** to recognize `materialProperties` (5 required sub-fields) and optional `waterContent` field
- Run `/validate-map-data` after updating JSON

### 5. Neighbor-Aware Rendering System
- Extend `TileRenderer` to accept neighbor information when rendering a tile
- `getNeighborSignature(grid, col, row)` — returns a hash encoding:
  - Which neighbors are same tile type (for water merging)
  - Material property deltas to each neighbor (for future transitions)
- **Neighbor hash using FNV-1a** (NOT `charAt(0)` — that causes collisions between `grassland`/`glacier`/`gas-cloud`):
  ```
  neighborHash = neighbors.map(n => {
    if (!n.base) return '00';          // empty
    if (n.base === thisBase) return 'SS'; // same type
    return fnv1a(n.base).toString(16).slice(-2); // 2-char hash of full ID
  }).join('');
  ```
- New cache key format: `${tileId}-${shape}-${cellSize}-${neighborHash}`
- **Cascading dirty**: when a cell's tile changes, mark all its neighbors dirty too (they need re-rendering with new neighbor context)
- **Budgeted re-caching**: Max 8-10 dirty cells re-cached per frame (~5ms). Remaining render from stale cache until their turn. Prevents 3×3 brush (25+ dirty cells) from exceeding 16ms frame budget.
- Editor's `_renderBaseTiles()` updated to pass neighbor info to renderer
- Works with all 4 grid shapes via existing `grid.getNeighbors()`
- **All render methods wrapped in `ctx.save()` / `ctx.restore()`** to prevent canvas state leaks (globalAlpha, transforms, clip paths)

### 6. Water Merging
- **Same-type merging**: When two adjacent cells have the same water type, erase the internal border between them and render a unified surface
- For each water tile, compute a **merge mask** — which edges connect to same-type neighbors
- Connected water renders as one continuous body: shared wave patterns, no grid seams
- **Cross-type water blending**: When different water types meet (river→lake, shallow→ocean), render a gradient transition at the boundary
- Swamp has distinct murky edge treatment — does not merge cleanly with clear water types
- **Hybrid water tiles** (`waterContent: true`): Participate in water merging on their water-containing portion (e.g., oasis water connects to adjacent lake)

#### Water Merging Edge Cases
- **L-shaped bodies**: Corner cells merge on two non-opposite edges. Wave patterns adjust direction at bends to maintain visual continuity.
- **Single-cell water**: Renders in "contained" mode — pond-like with shore gradient on all edges, no merging attempted.
- **Corner-meeting water** (square/octagon grids): When diagonally opposite cells are water but the two other corner-sharing cells are land, draw a corner-fill arc connecting the two water edges to prevent visual gaps.
- **Hex triple-junctions**: Where three hex edges meet at a vertex and all three cells are water, draw a center-fill triangle to prevent seam artifacts.
- **Octagon filler cells**: Both octagon and square-filler cells participate in merging. Water on a square filler merges with adjacent octagon water. Filler's transition zone is proportionally smaller.

#### River Flow Direction
- Flow direction determined by neighbor topology:
  - Adjacent to ocean/lake → flow toward it (downstream)
  - Adjacent to another river → inherit/continue flow direction
  - No water neighbor → default south-east (configurable via cell rotation)
- Affects current line rendering and animation drift direction

### 7. Shoreline Rendering
- When any water tile is adjacent to a land tile, render a natural shoreline at that edge
- Shoreline visual varies by land neighbor material properties:

| Land Neighbor Type | Shoreline Style |
|--------------------|----------------|
| High moisture (grassland, forest) | Muddy bank, reeds, soft earth |
| Low moisture (desert) | Sandy shore, cracked earth |
| High elevation (mountain, cliff) | Rocky shore, cliff edge, boulders |
| Constructed (road, town) | Reinforced bank, stone edge |
| Arctic/cold (tundra, ice) | Frozen shore, ice shelf edge, frost crystals |
| Volcanic (lava, scorched) | Steam, obsidian beach, cooling rock |
| Jungle/mangrove | Tangled roots meeting water, murky edge |
| Swamp-to-dry-land | Dried mud, dead reeds, moisture fade |

- Shoreline is part of the water tile's render (drawn on the water side)
- Foam line along shoreline edge (subtle white highlights)

### 8. N64-Quality Water Tile Upgrades
Upgrade all 5 water tiles from flat fills to multi-layer procedural renders:

#### Ocean
- Deep blue-to-darker gradient base (not flat fill)
- Multiple wave layers at different amplitudes using bezier curves (not simple sine)
- Foam caps on wave crests (white highlights with noise-offset shapes)
- Depth variation via Perlin noise pattern
- 5-7 colors (deep blue, medium blue, dark blue, foam white, teal undertone, wave shadow, surface shimmer)

#### Shallow Water
- Lighter blue with visible "bottom" texture showing through (sandy/pebbly ground beneath)
- Gentle ripple patterns instead of hard wave lines
- Light refraction effect (subtle color shifts)
- Sparkle highlights on surface

#### River
- Central current with flow-direction rendering per §6 flow rules (not a straight stripe)
- Bank edges with muddy gradient
- Current lines that follow organic curves
- Subtle turbulence variation

#### Lake
- Calm surface with wide, gentle ripple rings (not a circle)
- Shore gradient at edges (when no neighbor is also water)
- Reflective surface highlights
- Depth gradient from edges to center

#### Swamp
- Murky green-brown with opacity variation
- Organic mud patches with irregular edges
- Reed/vegetation scatter using noise-positioned lines
- Subtle gas bubble spots

#### Waterfall & Rapids (rendering approach for Session 5)
- Self-contained scenes within one cell (mini-waterfall with cliff/pool; rapids with rocks/turbulence)
- Cell rotation determines fall/flow direction
- No multi-cell awareness needed

### 9. Water Animations
Each water tile type gets contextual animated effects (drawn in animation layer, not base layer):
- **Ocean**: Rolling wave motion (phase offset, `gentle`), occasional foam spray (`intense`)
- **Shallow Water**: Gentle ripple expansion (`gentle`), sparkle twinkle (`gentle`), occasional fish shadow (`intense`)
- **River**: Flowing current animation using flow direction (`gentle`), leaf/debris particles (`intense`)
- **Lake**: Concentric ripple rings (`gentle`), fish leap with arc + splash (`intense`)
- **Swamp**: Bubble rise and pop (`gentle`), reed sway (`gentle`), dragonfly paths (`intense`)
- Animation effects respect quality level — Level 2 reduces particle count, Level 4 keeps only wave offset
- Intense effects disabled in Subtle mode (see §9.4.2 in spec)

### 10. "Map Life" Toolbar Toggle
- Single `<button>` in toolbar, cycles: Full → Subtle → Still
- Icon: wind/breeze motif
- `aria-label` updates to include current state (e.g., "Map Life: Full. Press to change to Subtle.")
- Keyboard-accessible via Enter/Space (inherent as `<button>`)
- Persists preference in `localStorage` key `magical-map-maker-animation-pref`
- "Still" mode: no animation, dirty-flag RAF only (current behavior)
- "Subtle" mode: gentle animations only (wave sway, ripple), no intense effects
- "Full" mode: all effects at device-capable quality
- **`prefers-reduced-motion` behavior**: When active, defaults to "Still" with small note explaining why. User CAN override to Subtle/Full (respecting agency). Resets to Still on each new editor session.

### 11. Two-Layer Rendering Architecture
- **Static base layer**: Full procedural tile texture (with neighbor-aware merging/shorelines) rendered to tile atlas cache. Expensive but cached.
- **Animation overlay**: Lightweight per-frame draw of moving elements. Drawn directly on main canvas after base tiles, before grid lines.
- Base layer only re-renders when tile or neighbor changes (dirty flag per cell)
- Animation layer renders per frame for tiles with animations defined — **skip empty cells and static-only tile types** to reduce draw calls by 30-50%
- Animation layer budget: <4ms total for all visible tiles (achievable with viewport culling + staggering)

### 12. Grid Shape Parity
- All water merging, shoreline rendering, and animations work identically across square, hex, diamond, and octagon grids
- Merge masks account for different neighbor counts (4 for square/diamond, 6 for hex, 4+4 for octagon)
- Shoreline edges follow the actual cell boundary path for each shape
- Corner-fill arcs (square/octagon) and center-fill triangles (hex) for merging edge cases
- Test with each grid shape during development

---

## Architecture Notes

### Integration with Editor RAF Loop
```
editor._tick():
  1. animationManager.beginFrame()        // start frame timer
  2. camera.updateAnimation()             // existing zoom animation
  3. if (_dirty || animating):
     a. _renderBaseTiles()                // atlas-cached base + neighbor-aware (budgeted re-cache)
     b. _renderAnimationLayer()           // NEW — only for animated visible tiles
     c. _renderGridLines()                // existing
     d. _renderSelection()                // existing
  4. animationManager.endFrame()          // measure, adjust quality
  5. if (stillMode && !_dirty):
       // don't schedule next frame (restart on input)
     else:
       requestAnimationFrame(_tick)
```

### Cell-Level Dirty Tracking
- Add `_dirtyCells` Set to editor (in addition to global `_dirty`)
- When a tile is placed/removed, add that cell AND all its neighbors to `_dirtyCells`
- On render, re-cache up to 8-10 tiles from `_dirtyCells` per frame (budgeted)
- Remaining dirty cells render from stale atlas entries until their turn
- Global `_dirty` still triggers full redraw (camera move, zoom, resize)

---

## Files Modified
- `js/editor.js` — integrate animation manager, two-layer rendering, cell-level dirty tracking, viewport culling
- `js/tiles.js` — Perlin noise utility, tile atlas cache, neighbor-aware rendering, water tile upgrades, merge masks, `save()`/`restore()` wrapping
- `js/data/base-types.json` — add `materialProperties` and `waterContent` to all Fantasy tiles
- `js/camera.js` — minor: expose animation state for RAF integration

## Files Created
- `js/animation.js` — AnimationManager class

## Files NOT Modified
- `js/grid.js` — already has `getNeighbors()`, no changes needed
- `js/input.js` — no changes
- `js/palette.js` — no changes (Map Life toggle is in toolbar, not palette)

---

## Review Criteria

### Spec Reviewer
- [ ] All 5 water tiles upgraded with multi-layer N64-quality rendering
- [ ] Water merging produces seamless bodies across all 4 grid shapes
- [ ] Water edge cases handled (L-shapes, single-cell, corners, hex triple-junctions)
- [ ] River flow direction logic implemented
- [ ] Shoreline rendering at all water-to-land boundaries with 8 shoreline types
- [ ] Adaptive quality system with 5 levels + exponential backoff hysteresis
- [ ] "Map Life" toggle with 3 states + prefers-reduced-motion handling
- [ ] Hero frame export support at t=2.5s
- [ ] Material properties + waterContent defined for all Fantasy tiles
- [ ] Validation hook updated for new fields

### Game Map Maker Reviewer
- [ ] Water tiles look dramatically better than before (N64 vs NES quality)
- [ ] Adjacent lakes/oceans form convincing continuous bodies
- [ ] L-shaped lakes, single-cell ponds, and corner-meeting water all look correct
- [ ] Shorelines look natural and vary by terrain context (8 types)
- [ ] River flow direction is visually coherent
- [ ] Animations are subtle and enhance atmosphere without distracting
- [ ] Intense effects (fish, dragonflies) properly suppressed in Subtle mode
- [ ] Swamp correctly looks distinct from clean water
- [ ] Effects work on all 4 grid shapes without visual artifacts

### Web Developer Reviewer
- [ ] Tile atlas architecture (2-4 large canvases, not hundreds of small ones)
- [ ] LRU eviction working, memory stays under 7MB cap
- [ ] Single RAF loop maintained (animation manager does NOT create its own)
- [ ] Three-tier RAF strategy (animate → idle throttle → still/stop)
- [ ] Animation layer stays under 4ms with viewport culling + staggering
- [ ] Budgeted re-caching (8-10 per frame) prevents brush spike
- [ ] Progressive cache warming on zoom/DPR change
- [ ] FNV-1a neighbor hash (not charAt(0))
- [ ] Pause/resume: visibilitychange + pagehide/pageshow + blur/focus
- [ ] `prefers-reduced-motion` query uses `addEventListener('change')` not polling
- [ ] All render methods use `ctx.save()`/`ctx.restore()` — no state leaks
- [ ] Exponential backoff hysteresis prevents quality oscillation
- [ ] Cell-level dirty tracking handles edge cases (zoom, resize, grid toggle)
- [ ] Perlin noise pre-computed at startup, sampled by UV (not generated per tile)
