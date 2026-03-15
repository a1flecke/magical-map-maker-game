# Session 7: Exotic & Built Tiles (30 tiles) + Performance Tuning

**Recommended Model:** opus
**Estimated Duration:** 8–10 hours
**Prerequisite:** Session 6 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

Apply N64-quality rendering to the final 30 tiles: space, volcanic, remaining constructed, and continental. Space tiles use the space transition mode from Session 4. Then run a comprehensive performance optimization and visual consistency pass across all 110 tiles.

---

## Deliverables

### 1. Space (14 tiles)
`deep-space`, `nebula-red`, `nebula-blue`, `nebula-green`, `asteroid-field`, `gas-cloud`, `star-yellow`, `star-blue`, `star-red`, `planet-rocky`, `planet-gas`, `planet-ice`, `black-hole`, `wormhole`

These tiles use **space transition mode** from Session 4:
- Deep-space tiles merge star fields (erase grid seams, continuous star background)
- Nebulae blend via color gradient (adjacent nebulae merge into larger gas clouds)
- Planets, stars, black holes maintain hard radial boundaries against space background

**Shared art vocabulary constraint:** All space tiles use the same rendering techniques as terrestrial tiles (bezier curves, layered gradients, Perlin noise, scattered elements). Stylized/cartoony, not photorealistic. No gravitational lensing or spherical projection.

Individual tile renders:
- Deep space: black with Perlin noise-distributed star field (varied sizes/brightness, white/yellow/blue)
- Nebula (red/blue/green): swirling gas cloud gradients using layered bezier curves, embedded dim stars, color-appropriate palette
- Asteroid field: irregular gray rocks on dark background, varied sizes, scattered via noise
- Gas cloud: translucent colored haze with layered opacity gradients
- Stars (yellow/blue/red): radial gradient with corona glow, lens-flare-like spikes (simple crossed lines)
- Planets (rocky/gas/ice): circular body with surface texture (noise-based), shadow line across one side (terminator)
- Black hole: dark center circle, glowing accretion disk ring (orange/white gradient arc)
- Wormhole: concentric spiraling arcs with color gradient, depth effect via decreasing arc size
- **Animations**: Star twinkle (`gentle`), nebula swirl — slow hue shift (`gentle`), asteroid tumble (`gentle`), accretion disk rotation (`intense`), wormhole spiral (`intense`), planet surface shift (`gentle`)

### 2. Volcanic/Hazard (6 tiles)
`volcanic`, `lava-flow`, `lava-field`, `scorched-earth`, `ruins-ground`, `no-mans-land`
- Volcanic ground: dark gray with glowing red-orange crack veins using Perlin noise
- Lava flow: bright flowing orange-red liquid rock, cooling black crusted edges
- Lava field: cooled black basalt with intermittent red-glow cracks, heat distortion
- Scorched earth: blackened ground with ember specks, ash layer, dead stumps
- Ruins ground: broken stone rubble scattered on dirt, moss reclaiming
- No man's land: cratered brown mud, debris, subtle barbed wire texture (age-appropriate — subtle, not prominent)
- **Animations**: Lava glow pulse (`intense`), lava flow movement (`gentle`), ember float (`gentle`), smoke wisps (`gentle`)

### 3. Remaining Constructed (6 tiles)
`paved-road`, `fortification`, `trench`, `camp-ground`, `harbor`, `town`

Note: `road` and `bridge` were upgraded in Session 4. `harbor` has `waterContent: true`.

- Paved road: orderly cobblestone blocks with wear patterns, moss in cracks
- Fortification: thick gray stone blocks, crenellations at top edge, arrow slits, imposing wall texture
- Trench: dug channel with earth walls, wooden support beams, sandbag edges
- Camp ground: flat earth with tent stake marks, fire pit scorch, trampled grass
- Harbor: blue water with wooden dock planks, rope details, `waterContent: true`
- Town: tiny rooftop shapes in varied colors, streets between buildings, chimney smoke
- **Animations**: Foot traffic in town (`intense`), boat rocking in harbor (`intense`), flag flutter at camp (`gentle`), sentry pacing in trench (`intense`)
- Traffic uses theme-specific elements per spec §9.4.6

### 4. Continental/World (4 tiles)
`lowland`, `highland`, `mountain-range`, `rainforest`
- Lowland: light green, gentle flat terrain, pastoral feel, field patterns
- Highland: darker elevated terrain, rugged texture, heather/bracken
- Mountain range: line of gray peaks at world-map scale (smaller, more stylized than individual mountain tile)
- Rainforest: ultra-dense dark green canopy, no ground visible, layered leaf textures
- **Animations**: Cloud shadow drift (`gentle`), rain curtain on rainforest (`gentle`)

### 5. Material Properties for All 30 Tiles
- Define `materialProperties` for every tile in this session
- Set `waterContent: true` for: `harbor`
- Space tiles get material properties for completeness but use space transition mode, not terrestrial
- Verify space transitions: nebula blending, star field merging, planet boundaries
- Verify volcanic transitions: lava→rock, lava→water (steam!), volcanic→arctic
- Run `/validate-map-data` after completing JSON updates

### 6. Performance Optimization Pass
All 110 tiles are now rendered. Profile and optimize:

**Profiling targets:**
- Large grid (16×20 squares) filled with varied tiles from multiple categories
- Maximum transition complexity (alternating terrain types, checkerboard pattern)
- Full animation quality level (Level 1)
- Test on iPad Safari (or closest available)

**Metrics to measure and optimize:**
- **Frame time**: <16ms at quality level 1 on modern iPad, <12ms target
- **Animation layer**: <4ms alone with viewport culling + staggering
- **Atlas memory**: Profile total, must stay under 7MB cap at DPR 3
- **LRU cache hit rate**: >90% during steady-state (no editing)
- **Cache warmup**: <500ms for visible tiles after zoom change

**Specific optimizations to implement if needed:**
- Viewport culling refinement: ensure tiles obscured by sidebars are skipped
- Transition complexity LOD: simpler transitions at very low zoom levels
- Animation frame skipping tuning: adjust stagger modulus based on tile count
- Atlas packing efficiency: review region allocation, minimize wasted space
- Reduce draw calls: batch tiles by type where possible

**Tune adaptive quality thresholds** based on real profiling data — the Level 1-4 thresholds (12ms, 14ms, 16ms) may need adjustment for the full 100-tile workload.

### 7. Visual Consistency Pass
Review all 110 tiles holistically:
- View all tiles side by side at each grid shape (square, hex, diamond, octagon)
- Ensure consistent art style across categories (all feel like the same game)
- Verify color saturation/brightness is balanced (no tile overwhelms neighbors)
- Check transitions between all major category pairs look natural
- Verify animations feel cohesive (similar speed/subtlety across types)
- Ensure space tiles feel appropriately different but not jarring when switching themes
- Ensure dungeon tiles have consistent moody atmosphere
- Flag any tile that looks "unfinished" compared to others and fix

---

## Files Modified
- `js/tiles.js` — 28 new tile rendering patterns, potential performance optimizations
- `js/animation.js` — register new animation types, tune stagger parameters
- `js/editor.js` — viewport culling refinement, potential batch rendering
- `js/data/base-types.json` — material properties + waterContent for 28 tiles

## Files NOT Modified
- `js/grid.js` — no changes
- `js/camera.js` — no changes
- `js/palette.js` — no changes

---

## Review Criteria

### Spec Reviewer
- [ ] All 110 base types have N64-quality procedural rendering
- [ ] All 110 base types have `materialProperties` defined
- [ ] All tile categories have appropriate animations with intensity tags
- [ ] Performance targets met (60fps with adaptive quality)
- [ ] Space tiles use space transition mode
- [ ] `waterContent` set correctly on all hybrid water tiles

### Game Map Maker Reviewer
- [ ] All 110 tiles are visually distinct and recognizable
- [ ] Art style is cohesive across ALL categories (fantasy, space, dungeon all feel like same game)
- [ ] Space tiles are stylized/cartoony, not photorealistic — fits the kid-friendly aesthetic
- [ ] Dungeon tiles have consistent dark/moody atmosphere
- [ ] Volcanic tiles feel dangerous (glowing lava, ember effects)
- [ ] No man's land age-appropriate (no graphic violence, barbed wire is subtle)
- [ ] Transitions between all major category pairs look natural
- [ ] No tile looks "unfinished" compared to others
- [ ] Animations enhance without distracting — appropriate for ages 7-15

### Web Developer Reviewer
- [ ] Frame time under 16ms at quality level 1 on iPad (profiling evidence)
- [ ] Atlas memory under 7MB cap (profiling evidence)
- [ ] Viewport culling working correctly (off-screen tiles not rendered or animated)
- [ ] Adaptive quality responds correctly to load changes with exponential backoff
- [ ] No memory leaks during extended editing (place/remove tiles repeatedly)
- [ ] Cache hit rate >90% during steady-state
- [ ] Cache warmup <500ms for visible tiles after zoom change
- [ ] Animation frame budget <4ms maintained with all 100 tile types
- [ ] `/validate-map-data` passes for all JSON updates
- [ ] Three-tier RAF working correctly (animate → idle throttle → still/stop)
