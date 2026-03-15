# Session 4: Land Transitions + Tile Pattern Upgrades

**Recommended Model:** opus
**Estimated Duration:** 6–8 hours
**Prerequisite:** Session 3 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

Build the contextual transition system with three transition modes (terrestrial, space, dungeon). Upgrade the remaining 15 patterned Fantasy tiles to N64-quality with ambient animations.

---

## Deliverables

### 1. Transition Mode System
Implement three distinct transition modes per spec §9.3.1:

#### Terrestrial Mode (default)
Material property-based geographic transitions for Fantasy, Battlefields, Prairie, Mountains, Continents, Rivers, Jungle themes.
- For each edge between two different tiles, compute the **material property difference vector**:
  ```
  deltaElevation  = neighbor.elevation - this.elevation
  deltaMoisture   = neighbor.moisture - this.moisture
  deltaDensity    = neighbor.density - this.density
  deltaTemperature = neighbor.temperature - this.temperature
  organicBoundary = this.organic !== neighbor.organic
  ```
- The magnitude and sign of each delta determines the transition effect on that edge
- Transition mode is looked up from the current theme definition, not per-tile

#### Space Mode
For Space theme tiles:
- Nebulae blend via color gradient (adjacent nebulae merge into larger clouds, similar to water merging)
- Deep-space tiles merge star fields into continuous backgrounds (erase grid seams)
- Planets, stars, and black holes maintain hard circular/radial boundaries against space background
- No material property transitions — space has no "elevation" or "moisture"

#### Dungeon Mode
For Dungeon theme tiles:
- **Architectural transitions** — not geographic:
  - **Wall** (default between different room types): stone wall edge, no passage implied
  - **Open** (same tile type adjacent): merged space, similar to water merging (corridor+corridor, cavern+cavern form continuous spaces)
  - **Threshold** (corridor→different room type): doorway or archway frame at boundary
- Corridor→cavern gets a rocky threshold, not "density gradient with stumps"
- Corridor→throne-room gets an ornate archway
- Underground-river and sewer use water merging rules within their channels

### 2. Terrestrial Transition Effects by Property Axis

#### Elevation Difference (|delta| > 2)
- **High→Low** (mountain→grassland): rocky cliff face drawn at boundary, scattered boulders spilling into lower tile
- **Low→High** (grassland→mountain): shadows cast from elevation, loose rock scatter
- **Extreme** (|delta| > 5): dramatic cliff with depth shading, layered rock strata

#### Moisture Difference (|delta| > 2)
- **Wet→Dry** (swamp→desert): cracked/dried earth transitioning to mud, dead vegetation
- **Dry→Wet** (desert→lake): sandy shore, water seeping into sand
- **Moderate** (grassland→forest): slightly darker soil, more ground cover

#### Temperature Gradient (|delta| > 2)
- **Cold→Warm** (arctic→temperate): snow melt line, patchy snow thinning to grass
- **Warm→Cold** (temperate→arctic): frost creep, ice crystals on ground
- **Extreme** (volcanic→arctic): dramatic steam/mist zone

#### Density Gradient (|delta| > 2)
- **Dense→Sparse** (dense-forest→clearing): trees thin out, stumps, scattered undergrowth
- **Sparse→Dense** (grassland→forest): bushes increase, sapling scatter, shadow encroachment

#### Organic→Constructed Boundary
- Always renders a hard, clean edge
- Contextual border: cobblestone edging, fence line, stone wall, or packed earth berm
- Road meeting forest: cleared shoulder with occasional stump
- Road meeting water: reinforced stone bank

### 3. Bidirectional Blending
- Both tiles contribute to the transition zone (~15-20% of cell width on each side of the boundary)
- Weighted probability: elements from each tile appear in the transition zone based on distance from boundary
- Transition zone width scales with property delta magnitude (small delta = narrow/subtle, large delta = wide/dramatic)
- **Cell size scaling** (prevents unreadable smudges on small tiles):
  - Cell ≥ 48px: full transitions with scatter objects
  - Cell 32-47px: gradient-only transitions, no scatter objects
  - Cell < 32px: hard edges only

### 4. Transition Scatter Objects
Procedurally placed contextual elements in transition zones:
- **Elevation transitions**: boulders, loose rocks, pebbles, cliff faces
- **Moisture transitions**: reeds, dried mud cracks, puddles, moss patches
- **Temperature transitions**: snow patches, frost crystals, steam wisps, ice shards
- **Density transitions**: stumps, fallen logs, leaf litter, saplings, bushes
- Objects placed using seeded noise lookup table (deterministic per cell position, reproducible)
- **Max 4 scatter objects per edge, 12 per cell** — visual difference beyond this is minimal
- Pre-compute scatter positions into lookup table so noise generation isn't repeated on cache rebuild
- Object count and variety respect animation quality level — simplified at level 3+

### 5. N64-Quality Tile Upgrades — Grassland/Plains (6 tiles)
Upgrade: `grassland`, `tall-grass`, `wildflower-field`, `wheat-field`, `savanna`, `farmland`
- Multi-layer grass textures with individual blade rendering using Perlin noise
- Color variation across tile (not uniform fill)
- Ground texture visible between grass elements
- Depth via overlapping layers (foreground/background grass)
- **Animation**: Wind ripple (`gentle`), flower petal drift (`intense`), wheat stalk sway (`gentle`)

### 6. N64-Quality Tile Upgrades — Forest/Vegetation (4 tiles)
Upgrade: `forest`, `light-woods`, `pine-forest`, `clearing`
- Varied tree sizes with canopy rendering (overlapping circles with color variation, not uniform)
- Undergrowth layer (bushes, ferns, ground cover)
- Shadow/depth between trees
- Tree trunks visible in lighter areas
- **Animation**: Gentle leaf sway (`gentle`), rustling effect (`gentle`), occasional bird (`intense`, clearing only)

### 7. N64-Quality Tile Upgrades — Elevation (2 tiles)
Upgrade: `hills`, `mountain`
- Hills: rolling contours with lighting (highlight on sun-facing slopes, shadow on opposing)
- Mountain: layered rock faces with snow dusting, crevice shadows, peak highlights
- Color banding for elevation change
- **Animation**: Eagles circling (`intense`), grazing animals (`intense`), cloud shadow drift (`gentle`)

### 8. N64-Quality Tile Upgrades — Desert (1 tile)
Upgrade: `desert-sand`
- Layered dune contours with wind-shadow shading
- Sand texture via Perlin noise pattern
- Subtle color variation (golden, amber, pale yellow bands)
- **Animation**: Heat shimmer (`gentle`), sand particle drift (`gentle`), dust devil (`intense` — rare, small swirl)

### 9. N64-Quality Tile Upgrades — Constructed (2 tiles)
Upgrade: `road`, `bridge` (the 2 constructed tiles currently with patterns in Fantasy theme)
- Road: wheel rut marks, worn center, grass encroachment at edges, puddles
- Bridge: individual plank rendering, rope/rail details, gap shadows
- **Theme-specific traffic animations** (see spec §9.4.6):
  - Fantasy: horse cart, merchant wagon, walking figure (`intense`)
  - Battlefields: supply wagon, marching troops (`intense`)
  - Dungeon: rats, guards, adventurers (`intense`)
  - Space: maintenance drones, shuttle craft (`intense`)
  - Jungle: porters, explorers (`intense`)
  - Rivers: boats, fishing craft (`intense`)
  - Prairie: covered wagons, riders (`intense`)
  - Mountains: pack mules, climbers (`intense`)
  - Continents: caravans, trade ships (`intense`)
- Traffic element selection driven by current theme ID at render time

### 10. Material Properties for All Upgraded Tiles
- Define `materialProperties` for all 15 tiles upgraded in this session
- Verify terrestrial transition rendering looks correct between each pair of adjacent categories
- Test extreme combinations (volcano→ice, ocean→desert, forest→dungeon)
- Run `/validate-map-data` after updating JSON

### 11. All Grid Shapes
- All transitions (terrestrial, space, dungeon) render correctly on square, hex, diamond, and octagon grids
- Edge geometry follows cell boundary paths
- Scatter objects respect cell boundaries (no overflow into wrong cells)
- Transition zone scaling applies to all shapes

---

## Transition Rendering Architecture

### Edge-Based Rendering
```
For each visible cell:
  1. Determine transition mode from current theme
  2. Render base tile texture (from atlas cache, neighbor-aware)
  3. For each edge of the cell:
     a. Get neighbor tile on that edge
     b. Based on transition mode:
        - Terrestrial: compute property delta → render transition
        - Space: check if nebula/deep-space merge → blend or hard edge
        - Dungeon: check wall/open/threshold → render architectural edge
     c. If neighbor is same type:
        - Merge (seamless, like water merging)
```

### Performance Considerations
- Transition effects are part of the **static base layer** (cached in atlas), not the animation layer
- Only scatter object animations (sway, drift) go in the animation layer
- Transition cache key already includes `neighborHash` from Session 3
- Complex transitions (many scatter objects) only render at quality levels 1-2; simplified at level 3+
- **Progressive cache warming** applies to transitions too — complex transitions render over multiple frames after zoom change
- Scatter position lookup table pre-computed, not regenerated on cache rebuild

---

## Files Modified
- `js/tiles.js` — transition renderer (3 modes), upgraded tile patterns, scatter objects, scatter lookup table
- `js/editor.js` — animation layer updates for new tile types
- `js/animation.js` — register new animation types (grass sway, tree rustle, traffic), intensity classification
- `js/data/base-types.json` — material properties for all 15 upgraded tiles
- `js/data/themes.json` — add `transitionMode` field to theme definitions

## Files NOT Modified
- `js/grid.js` — no changes needed
- `js/camera.js` — no changes
- `js/palette.js` — no changes

---

## Review Criteria

### Spec Reviewer
- [ ] Three transition modes implemented (terrestrial, space, dungeon)
- [ ] Terrestrial: transition effects for all 5 property axes
- [ ] Dungeon: architectural transitions (wall/open/threshold)
- [ ] Space: nebula blending, star field merging, hard planet/star boundaries
- [ ] Bidirectional blending with cell-size-aware scaling
- [ ] 15 patterned tiles upgraded to N64 quality
- [ ] Material properties defined for all upgraded tiles
- [ ] Theme-specific traffic animations defined for all 9 themes
- [ ] Scatter objects capped at 4 per edge, 12 per cell

### Game Map Maker Reviewer
- [ ] Terrestrial transitions look natural — no jarring edges between terrain types
- [ ] Dungeon transitions look architectural — doorways and thresholds, not geographic blending
- [ ] Space transitions feel cosmic — nebula blending, not muddy banks
- [ ] Scatter objects enhance realism (rocks at cliffs, reeds at shores, stumps at forest edges)
- [ ] Extreme transitions (volcano→ice) look dramatic but not broken
- [ ] Organic→constructed edges are clean and intentional
- [ ] Tile upgrades are visually cohesive (all feel like the same art style)
- [ ] Animations classified correctly (gentle vs intense)
- [ ] Traffic matches theme (rats in dungeon, caravans in fantasy, drones in space)
- [ ] Cell-size scaling looks good at all zoom levels (no smudgy transitions on small cells)

### Web Developer Reviewer
- [ ] Transition rendering stays within base layer atlas cache (not re-computed per frame)
- [ ] Scatter positions deterministic via lookup table (pre-computed, not per-render noise)
- [ ] Cache invalidation correct when neighbor changes (transition re-renders for both cells)
- [ ] All render methods use `ctx.save()`/`ctx.restore()`
- [ ] Animation layer additions stay within 4ms budget (viewport culling + staggering)
- [ ] Atlas memory stays under 7MB cap after adding ~15 tile caches with transitions
- [ ] Quality level respected by scatter object count and animation complexity
- [ ] Theme transition mode lookup is O(1) — not computed per tile
