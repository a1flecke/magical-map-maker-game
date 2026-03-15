# Session 5: Natural Organic Tiles (30 tiles)

**Recommended Model:** opus
**Estimated Duration:** 6–8 hours
**Prerequisite:** Session 4 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

Apply the N64-quality rendering system to 30 natural organic tiles: remaining grassland, forest, water, desert, and coastal tiles. These all use terrestrial transitions and share similar rendering techniques (organic shapes, natural gradients, Perlin noise textures).

---

## Deliverables

### 1. Remaining Grassland/Plains (6 tiles)
`short-grass`, `steppe`, `brush`, `dust-patch`, `red-clay`, `salt-flat`
- Short grass: cropped, neat blades with visible soil between
- Steppe: dry brown-green sparse tufts on exposed earth
- Brush/scrubland: scattered dark bush clumps with thorny appearance
- Dust patch: bare earth with boot prints, wind-swept surface texture
- Red clay: reddish-brown with dried crack patterns, subtle sheen
- Salt flat: white crystalline surface with geometric crack patterns, reflective highlights
- **Animations**: Brush sway (`gentle`), dust motes (`gentle`), heat shimmer (`gentle`)

### 2. Remaining Forest/Vegetation (6 tiles)
`jungle-canopy`, `jungle-floor`, `bamboo-grove`, `mangrove`, `fern-gully`, `vine-wall`
- Jungle canopy: dense layered tropical leaves, vibrant deep greens, light filtering through gaps
- Jungle floor: tangled roots, leaf litter, decomposing matter, dappled light spots
- Bamboo grove: vertical stalks with nodes, yellow-green, light filtering between stalks
- Mangrove: tangled root system meeting murky water (uses `waterContent: true` for water portion)
- Fern gully: radiating frond patterns, bright green, moist atmosphere
- Vine wall: criss-crossing vines with depth, small flowers scattered
- **Animations**: Canopy rustle (`gentle`), dripping water (`gentle`), bamboo creak/sway (`gentle`), fern unfurl (`intense`)

### 3. Remaining Water (7 tiles)
`wide-river`, `stream`, `pond`, `rapids`, `waterfall`, `hot-spring`, `delta`
- Wide river: broad expanse with current lines following flow rules from Session 3, bank edges visible
- Stream: narrow winding water line through terrain, barely wider than a current
- Pond: small circular body with reeds at edges, lily pad scatter (uses contained rendering like single-cell water)
- Rapids: white-blue turbulent streaks, spray particles, exposed rock outcroppings — self-contained per cell, rotation sets flow direction
- Waterfall: self-contained cascade with cliff at top, mist cloud, pool at base — rotation sets fall direction
- Hot spring: light blue with steam wisps, mineral-colored edges (ochre, sulfur yellow), `waterContent: true`
- Delta: branching channels on sandy brown, sediment patterns, `waterContent: true`
- **Animations**: Current flow (`gentle`), splashing (`intense`), falling water mist (`gentle`), steam rising (`gentle`), tidal drift (`gentle`)
- All integrate with Session 3's water merging and shoreline system

### 4. Desert/Arid (5 tiles)
`desert-rock`, `oasis`, `sand-dunes`, `badlands`, `dry-creek`
- Desert rock: brown-gray scattered boulders on sandy base, harsh shadows
- Oasis: blue water circle ringed with green palms and grass, `waterContent: true` — water portion participates in merging with adjacent water tiles
- Sand dunes: undulating golden contours with wind shadows, ripple texture
- Badlands: eroded red-orange layered mesa, deep erosion channels
- Dry creek: sandy channel with cracked mud, old water line marks
- **Animations**: Heat shimmer (`gentle`), sand blow (`gentle`), palm sway (`gentle`), tumbling pebbles (`intense`)

### 5. Coastal/Ocean (6 tiles)
`beach`, `reef`, `tidal-pool`, `ocean-inlet`, `coastal`, `continental-shelf`
- Beach: sandy gradient meeting blue water edge, shell details, driftwood
- Reef: colorful coral formations on blue, varied coral shapes and colors
- Tidal pool: small water circles in sandy rock, anemone dots, `waterContent: true`
- Ocean inlet: blue water channel cutting into rocky coast
- Coastal bluffs: green-brown land with dramatic cliff face at water edge
- Continental shelf: gradient from light turquoise to deeper blue-green
- **Animations**: Wave lap (`gentle`), fish dart (`intense`), seagull shadows (`intense`), tide shift (`gentle`)
- Coastal tiles integrate with water merging (beach→ocean forms shoreline transition)

### 6. Material Properties for All 30 Tiles
- Define `materialProperties` for every tile in this session
- Set `waterContent: true` for: `mangrove`, `hot-spring`, `delta`, `oasis`, `tidal-pool`
- Verify terrestrial transitions between all new tiles and existing Session 3-4 tiles
- Test key combinations: oasis→desert, beach→ocean, jungle→river, mangrove→water
- Run `/validate-map-data` after completing JSON updates

### 7. Animation Intensity Compliance
- All new animations tagged as `gentle` or `intense` per spec §9.4.2
- Verify intense effects are disabled in Subtle mode
- Verify gentle effects remain in Subtle mode
- Test that animation staggering includes new tile types

---

## Files Modified
- `js/tiles.js` — 30 new tile rendering patterns
- `js/animation.js` — register new animation types with intensity tags
- `js/data/base-types.json` — material properties + waterContent for 30 tiles

## Files NOT Modified
- `js/editor.js` — no architectural changes (infrastructure from Session 3 handles everything)
- `js/grid.js` — no changes
- `js/camera.js` — no changes
- `js/palette.js` — no changes

---

## Review Criteria

### Spec Reviewer
- [ ] All 30 tiles have N64-quality procedural rendering
- [ ] All 30 tiles have `materialProperties` defined
- [ ] Hybrid water tiles flagged with `waterContent: true`
- [ ] Waterfall and rapids use self-contained + rotation approach
- [ ] All animations tagged with intensity classification

### Game Map Maker Reviewer
- [ ] All 30 tiles visually distinct and recognizable
- [ ] Water tiles integrate properly with Session 3's merging system
- [ ] Oasis water connects to adjacent lakes/rivers
- [ ] Coastal/beach→ocean transitions look like natural shorelines
- [ ] Jungle tiles feel dense and tropical
- [ ] Desert tiles feel hot and arid
- [ ] Art style cohesive with Session 3-4 tiles

### Web Developer Reviewer
- [ ] Atlas memory stays within 7MB cap with 30 additional tile types
- [ ] New water tiles use existing merging infrastructure (no duplication)
- [ ] Animation budget maintained with additional animated tiles
- [ ] `waterContent` tiles correctly participate in water merging
- [ ] `/validate-map-data` passes
