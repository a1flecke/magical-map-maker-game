# Session 6: Harsh & Underground Tiles (30 tiles)

**Recommended Model:** opus
**Estimated Duration:** 6–8 hours
**Prerequisite:** Session 5 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

Apply N64-quality rendering to 30 tiles across elevation, arctic, dungeon, and battlefield categories. Dungeon tiles use the architectural transition mode built in Session 4. This session covers the "cold, dark, and extreme" end of the tile spectrum.

---

## Deliverables

### 1. Remaining Elevation (8 tiles)
`foothill`, `high-peak`, `snow-peak`, `cliff`, `canyon`, `plateau`, `ridge`, `scree`
- Foothill: gentle mounds with grass, smooth contours, warm lighting
- High peak: sharp gray peaks with deep shadow, crevice detail
- Snow peak: white cap over gray rock, wind-carved ridges, ice crystals
- Cliff: vertical rock face with layered strata, deep shadows at base
- Canyon: deep cut with layered orange-red walls, shadow at bottom, depth illusion
- Plateau: flat top with steep edges, mesa-like silhouette
- Ridge: narrow elevated spine with spine-line detail, wind-exposed texture
- Scree: loose rock fragments of varied sizes, unstable sloped appearance
- **Animations**: Mountain goats traversing (`intense`), snowfall on peaks (`gentle`), rock tumble on scree (`intense`), hawk circling cliffs/canyons (`intense`), cloud shadow drift (`gentle`)

### 2. Arctic/Cold (8 tiles)
`tundra`, `frozen-water`, `ice-plain`, `glacier`, `ice-cave`, `snow-field`, `permafrost`, `ice-shelf`
- Tundra: gray-white with sparse lichen dots, frozen ground texture
- Frozen water: ice with crack patterns, trapped air bubbles beneath surface
- Ice plain: smooth pale blue-white, wind-polished surface with faint striations
- Glacier: blue-white with deep crevasse lines, pressure ridges, blue depth
- Ice cave: dark interior with crystal formations, blue light glow from ice
- Snow field: pure white with wind-drift texture, subtle blue shadows
- Permafrost: gray-brown frozen earth with geometric frost heave patterns
- Ice shelf: white surface with blue water visible at fracture edges, `waterContent: true`
- **Animations**: Snow drift (`gentle`), ice sparkle (`gentle`), aurora shimmer in ice cave (`gentle`), crack propagation on frozen water (`intense`)

### 3. Dungeon (10 tiles)
`stone-floor`, `cobblestone`, `corridor`, `cavern`, `underground-river`, `pit`, `dark-room`, `crypt`, `throne-room`, `sewer`

These tiles use **dungeon architectural transition mode** from Session 4:
- Same-type adjacent tiles merge (corridor+corridor = continuous passage, cavern+cavern = larger cave)
- Different-type adjacent tiles get architectural thresholds (corridor→throne-room = ornate arch, corridor→cavern = rocky threshold)
- Wall treatment on edges with no neighbor or empty neighbor

Individual tile renders:
- Stone floor: fitted rectangular blocks with grout lines, worn surfaces, subtle color variation
- Cobblestone: rounded stones, irregular pattern, moss growing in gaps
- Corridor: narrow passage with shadowed walls at edges, torch sconce marks
- Cavern: irregular natural rock, stalactite/stalagmite shadows, dampness sheen
- Underground river: dark water in stone channel, dripping ceiling, `waterContent: true` — water portion uses water merging
- Pit/chasm: black void center with crumbling edge, depth illusion via radial gradient
- Dark room: barely visible shapes in deep shadow, torch glow emanating from edges
- Crypt: ornate carved stone, coffin/sarcophagus shapes, cold blue atmosphere
- Throne room: polished stone, red carpet center stripe, pillar details at edges
- Sewer: gray stone with green-tinted water channel, slime drips, `waterContent: true`
- **Animations**: Torch flicker (`gentle`), dripping water (`gentle`), bubbles in underground-river/sewer (`gentle`), dust motes (`gentle`), rats scurrying (`intense`)

### 4. Battlefield/Tactical (4 tiles)
`mud`, `moat`, `rocky-ground`, `dam`
- Mud/bog: dark brown with wet gleam highlights, boot prints, squelching texture
- Moat: blue water channel with stone wall edges, `waterContent: true`
- Rocky ground: scattered stones on earth, harsh terrain, uneven surface
- Dam: gray stone wall crossing blue water, reinforced buttresses, `waterContent: true`
- **Animations**: Mud bubble (`gentle`), gentle current in moat (`gentle`), small landslide (`intense`)

### 5. Material Properties for All 30 Tiles
- Define `materialProperties` for every tile in this session
- Set `waterContent: true` for: `ice-shelf`, `underground-river`, `sewer`, `moat`, `dam`
- Dungeon tiles need properties too (for potential cross-theme scenarios), but their primary transition behavior comes from dungeon architectural mode
- Verify dungeon architectural transitions: corridor→cavern, corridor→throne-room, etc.
- Verify arctic-to-temperate transitions use temperature gradient effects
- Run `/validate-map-data` after completing JSON updates

### 6. Animation Intensity Compliance
- All new animations tagged as `gentle` or `intense` per spec §9.4.2
- Dungeon animations are mostly `gentle` (atmospheric) — only rats are `intense`
- Verify Subtle mode shows torch flicker and dripping but hides rats

---

## Files Modified
- `js/tiles.js` — 28 new tile rendering patterns, dungeon merge/threshold rendering
- `js/animation.js` — register new animation types with intensity tags
- `js/data/base-types.json` — material properties + waterContent for 28 tiles

## Files NOT Modified
- `js/editor.js` — no changes
- `js/grid.js` — no changes
- `js/camera.js` — no changes

---

## Review Criteria

### Spec Reviewer
- [ ] All 30 tiles have N64-quality procedural rendering
- [ ] All 30 tiles have `materialProperties` defined
- [ ] Dungeon tiles use architectural transition mode (wall/open/threshold)
- [ ] Hybrid water tiles flagged correctly
- [ ] All animations tagged with intensity

### Game Map Maker Reviewer
- [ ] Dungeon tiles have dark, atmospheric mood — torchlit, damp, mysterious
- [ ] Dungeon transitions feel architectural — doorways between rooms, not geographic blending
- [ ] Corridor+corridor merging creates convincing continuous passages
- [ ] Arctic tiles feel cold and stark — ice sparkle, wind-drift, blue shadows
- [ ] Elevation tiles have convincing depth and height
- [ ] Scree and cliff feel dangerous/steep
- [ ] Art style cohesive with Sessions 3-5 tiles

### Web Developer Reviewer
- [ ] Dungeon architectural transitions render within atlas cache budget
- [ ] Water merging works correctly for underground-river, sewer, moat, dam
- [ ] Atlas memory within 7MB cap with 30 additional tile types
- [ ] Animation budget maintained
- [ ] `/validate-map-data` passes
