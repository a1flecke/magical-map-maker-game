# Session 9: Complete Overlay Catalog (SVG Sprites)

**Recommended Model:** opus
**Estimated Duration:** 5 hours
**Prerequisite:** Session 8 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

All ~225 overlays from the spec as SVG sprite icons. Full 55 universal overlays including numbered markers, character tokens, compass rose, scale bar, and title banner.

---

## Deliverables

### 1. Complete `js/data/overlays.json`

All overlays from spec §7:

| Theme | Count |
|-------|-------|
| Dungeon | 25 |
| Fantasy Overworld | 20 |
| Historical Battlefields | 18 |
| Space | 20 |
| Jungle | 18 |
| Rivers & Waterways | 18 |
| Prairie & Grasslands | 16 |
| Mountains | 18 |
| Continents & World | 15 |
| **Universal** | **55** |
| **Total** | **~223** |

### 2. Complete SVG Sprite Sheet (`assets/icons/overlays.svg`)
- All ~223 overlay icons as `<symbol>` elements
- Consistent `viewBox="0 0 64 64"`
- Design guidelines:
  - **Settlements:** Simple building silhouettes, clustering
  - **Structures:** Geometric shapes (tower = tall rect + triangle top)
  - **Wildlife:** Simple animal silhouettes
  - **Characters:** Iconic silhouettes (warrior = figure + sword, wizard = figure + staff)
  - **Numbered markers:** Circle with number inside (1-10)
  - **Lettered markers:** Circle with letter inside (A-F)
  - **Navigation:** Simple arrows, dotted line
  - **Weather:** Translucent patterns (rain lines, fog blobs)
- All icons must be recognizable at 30×30px

### 3. Universal Overlays (55)
All from spec §7.2:
- Settlements & Structures (6): village, ruins, tribe-camp, fence, gate, tower
- Wildlife (5): deer, wolf, bird-flock, bear, fish
- Character Tokens (6): warrior, wizard, archer, king, monster, npc
- Markers (6): campfire, treasure, danger-sign, question-mark, star-marker, compass-rose
- Numbered Markers (10): marker-1 through marker-10
- Lettered Markers (6): marker-a through marker-f
- Navigation (5): arrow-north/east/south/west, path-marker
- Nature (4): tree-single, rock-formation, flowers, mushrooms
- Weather & Atmosphere (5): fog, rain, snow, fire, smoke
- Labels & Flags (7): flag-red, flag-blue, flag-green, flag-yellow, text-label, title-banner, scale-bar

### 4. Special Overlays

#### Text Label
- On placement, prompt for text input (max 30 chars)
- Font size selector: small/medium/large
- Color: inherits from theme accent or custom picker
- Stored: `{ id: 'text-label', text: 'Here be dragons', fontSize: 'medium' }`
- Editable: tap to change text

#### Title Banner
- Decorative scroll/cartouche shape
- User enters map title text
- Spans larger area visually (renders at "large" size by default)

#### Scale Bar
- Decorative bar with markings
- User selects scale text: "1 square = 10 feet" / "1 hex = 1 mile" / custom
- Stored: `{ id: 'scale-bar', scaleText: '1 hex = 1 mile' }`

#### Compass Rose
- Ornate N/S/E/W indicator
- Rotatable like other overlays

### 5. Overlay Palette Enhancements

#### Categories & Tabs
- Theme tab: overlays grouped by category (collapsible sections)
- Universal tab: all 55 universal overlays, also grouped by category
- Category headers toggle expand/collapse

#### Search (enhanced from session 3)
- Searches across both theme and universal
- Results highlight matching text

#### Favorites
- Star icon on each overlay
- Starred overlays in "Favorites" section at top
- Stored in LocalStorage: `magical-map-maker-favorites`

#### Recently Used
- "Recent" section below favorites
- Last 8 placed overlays

### 6. Run `/validate-map-data` after completing overlays.json

---

## Review Criteria

### Spec Reviewer
- [ ] All ~223 overlays from spec §7
- [ ] 55 universal overlays with correct categories
- [ ] Text label with font sizes, title banner, scale bar
- [ ] Numbered markers 1-10, lettered A-F
- [ ] Character tokens (6 types)
- [ ] Compass rose as universal (not Continents-only)

### Game Map Maker Reviewer
- [ ] All SVG icons recognizable at 30×30px
- [ ] Icons visually distinct within theme
- [ ] Character tokens usable for D&D-style maps
- [ ] Numbered markers clearly readable
- [ ] Missing overlays for any theme?

### Web Developer Reviewer
- [ ] SVG sprite sheet loads efficiently (single HTTP request)
- [ ] Search debounced
- [ ] Favorites in separate LocalStorage key
- [ ] Text label input accessible (label, focus)
- [ ] aria-hidden on filtered items
- [ ] Category collapse state maintained during session
