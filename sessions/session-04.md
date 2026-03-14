# Session 4: All 9 Themes + Full 100-Tile Catalog

**Recommended Model:** opus
**Estimated Duration:** 5 hours
**Prerequisite:** Session 3 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

All 9 themes available with their curated tile sets. Full procedural rendering for all 100 base types. ThemeManager module handles theme loading and switching.

---

## Deliverables

### 1. Complete `js/data/base-types.json` (100 entries)

All base types from spec §6, organized into 12 categories:

| Category | Count | Examples |
|----------|-------|---------|
| Grassland & Plains | 12 | grassland, tall-grass, wildflower-field, wheat-field, savanna, farmland, steppe, brush, dust-patch, red-clay, salt-flat, short-grass |
| Forest & Vegetation | 10 | forest, light-woods, pine-forest, jungle-canopy, jungle-floor, bamboo-grove, mangrove, fern-gully, clearing, vine-wall |
| Water | 12 | ocean, shallow-water, river, wide-river, stream, lake, pond, rapids, waterfall, swamp, hot-spring, delta |
| Elevation | 10 | hills, foothill, mountain, high-peak, snow-peak, cliff, canyon, plateau, ridge, scree |
| Desert & Arid | 6 | desert-sand, desert-rock, oasis, sand-dunes, badlands, dry-creek |
| Arctic & Cold | 8 | tundra, frozen-water, ice-plain, glacier, ice-cave, snow-field, permafrost, ice-shelf |
| Dungeon | 10 | stone-floor, cobblestone, corridor, cavern, underground-river, pit, dark-room, crypt, throne-room, sewer |
| Space | 14 | deep-space, nebula-red, nebula-blue, nebula-green, asteroid-field, gas-cloud, star-yellow, star-blue, star-red, planet-rocky, planet-gas, planet-ice, black-hole, wormhole |
| Volcanic & Hazard | 6 | volcanic, lava-flow, lava-field, scorched-earth, ruins-ground, no-mans-land |
| Constructed | 8 | road, paved-road, fortification, bridge, trench, camp-ground, harbor, town |
| Coastal & Ocean | 6 | beach, reef, tidal-pool, ocean-inlet, coastal, continental-shelf |
| Battlefield & Tactical | 4 | mud, moat, rocky-ground, dam |
| Continental & World | 4 | lowland, highland, mountain-range, rainforest |

### 2. Complete `js/data/themes.json` (9 entries)

| Theme | Accent Color | # Base Tiles |
|-------|-------------|-------------|
| Fantasy Overworld | #4A7C59 (forest green) | ~25 |
| Dungeon | #8B7355 (torch brown) | ~15 |
| Historical Battlefields | #6B5B3E (military khaki) | ~20 |
| Space | #6B3FA0 (cosmic purple) | ~14 |
| Jungle | #2D6B30 (deep green) | ~18 |
| Rivers & Waterways | #2B6B8A (river blue) | ~18 |
| Prairie & Grasslands | #B8943E (golden) | ~18 |
| Mountains | #5A6B7A (slate) | ~20 |
| Continents & World | #7B5B3A (parchment) | ~22 |

### 3. `js/themes.js` — ThemeManager Class
- `loadThemes()` — fetch and parse `themes.json`
- `getTheme(id)` — return theme definition
- `getAvailableTiles(themeId)` — return base types for theme
- `getAvailableOverlays(themeId)` — return overlays + universals
- `applyTheme(themeId, containerEl)` — set CSS custom properties on container
- `getThemeList()` — return all themes for selector

### 4. Procedural Tile Rendering (all 100 types)

Each base type gets a unique procedural Canvas texture using layered rendering:
- Base color fill
- Texture pattern (noise, gradients, strokes, shapes)
- Detail layer (accent marks, highlights)

Key rendering techniques for visual quality:
- **Water:** Layered sine-wave curves with varying opacity for depth
- **Mountains:** Triangular peaks with shadow gradients
- **Space:** Radial gradients for stars/planets, perlin-like noise for nebulae
- **Forest:** Clustered circles with varying greens and shadow
- **Dungeon:** Geometric stone block patterns with mortar lines

### 5. Theme Selector (Setup Screen)
- 3×3 grid of theme cards
- `role="radiogroup"` with `role="radio"` children, `aria-checked`
- Each card: theme name, description, color swatch, 4×4 mini map preview
- Selected theme determines palette contents

### 6. Theme CSS (`css/themes.css`)
- CSS custom properties per theme: `--theme-accent`, `--theme-grid`, `--theme-bg`
- Applied via `data-theme` attribute on editor container
- Toolbar, sidebar headers, selection highlights use theme accent

### 7. Run `/validate-map-data` after completing all JSON files

---

## Review Criteria

### Spec Reviewer
- [ ] 100 base types match spec §6 exactly
- [ ] 9 themes match spec §3
- [ ] Each theme's tile list matches Available Themes column
- [ ] ThemeManager module exists and works

### Game Map Maker Reviewer
- [ ] All 100 procedural tiles are visually distinct
- [ ] Tiles within each theme form a cohesive palette
- [ ] Space theme has enough variety (14 tiles, not 4)
- [ ] No two tiles easily confused within same theme
- [ ] Missing terrain types?

### Web Developer Reviewer
- [ ] Tile cache invalidated on theme change
- [ ] No leaked offscreen canvases
- [ ] JSON passes `/validate-map-data` with 0 errors
- [ ] Theme CSS uses custom properties
- [ ] ThemeManager is a clean module (no circular deps)
- [ ] `role="radiogroup"` on theme selector
