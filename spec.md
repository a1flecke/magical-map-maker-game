# Magical Map Maker — Game Specification

## 1. Overview

**Magical Map Maker** is a browser-based map building tool for kids (ages 7–15) that lets users create, customize, save, and print maps across nine distinct themes. Maps are built by placing terrain tiles on a grid, then layering overlays for detail. The finished map can be exported as PDF, PNG, or JPEG for printing on standard 8.5×11" paper.

**Target audience:** Kids ages 7–15 (grades 2–9) with dyslexia/ADHD accommodations.
**Target platforms:** iPadOS Safari (primary), macOS Safari/Chrome (secondary).
**Hosting:** GitHub Pages (static, no server).

---

## 2. Core Workflow

```
[Title Screen] → [New Map Setup] → [Map Editor] → [Save / Export / Print]
                       │
                       ├── Pick theme (9 themes)
                       ├── Pick piece shape (4 shapes)
                       ├── Pick map size (3 sizes)
                       └── Pick map name
```

### 2.1 Title Screen
- Game title with animated map illustration
- "New Map" button
- "My Maps" button (load saved maps from LocalStorage)
- Settings gear (font size, sound toggle)

### 2.2 New Map Setup
- **Theme selector** — 9 theme cards with preview thumbnails
- **Piece shape selector** — visual picker: square, hexagon, triangle, octagon
- **Size selector** — small / medium / large with piece-count preview
- **Map name** — text input with fantasy name generator button
- "Create Map" button → opens editor

### 2.3 Map Editor
- **Grid canvas** — the map grid, pannable and zoomable
- **Tile palette** — left sidebar with base tiles for the chosen theme, scrollable
- **Overlay palette** — right sidebar with overlays (theme-specific + universal), scrollable
- **Toolbar** — top bar: undo, redo, eraser, pan mode, zoom, grid toggle, export, save, back
- **Properties panel** — bottom: selected tile info, rotation controls, flip, opacity slider

### 2.4 Interaction Model
- **Primary (touch/mouse):** Tap tile in palette → tap/drag on grid to place. Hold and drag to paint multiple cells. Tap placed tile to select → shows properties. Drag overlay from palette onto placed tile.
- **Gesture disambiguation:** Tile placement fires on `pointerup` (not `pointerdown`). If a second pointer is detected during the interaction (pinch gesture), placement is cancelled.
- **Brush sizes:** 1 cell (default), 2×2, 3×3 — selectable in toolbar. Drag-to-paint uses brush size.
- **Secondary (keyboard):** Arrow keys to move selection cursor on grid. Number keys 1–9 for quick palette selection. Ctrl+Z/Cmd+Z undo. Ctrl+S/Cmd+S save.
- **Eraser mode:** Tap to remove tiles/overlays from grid cells. Drag to erase multiple.
- **Fill tool:** Flood-fill all connected empty cells (or same-type cells) with selected tile.

### 2.5 Export & Print
- Export formats: PDF (vector, best for print), PNG, JPEG
- All exports sized to fit 8.5×11" paper with margins
- PDF includes map title and optional legend
- "Print" button opens browser print dialog with print-optimized CSS

---

## 3. Map Themes (9)

Each theme defines a visual style, color palette, base tile set, and theme-specific overlays.

### 3.1 Dungeon
Stone corridors, rooms, traps, and underground passages. Uses Realm Brew hand-drawn hex tiles as primary assets; procedural tiles supplement for non-hex shapes.
- **Color palette:** Dark grays, browns, warm torch-light yellows
- **Base tiles:** 37 Realm Brew Man Hewn Dungeon tiles + procedural variants
- **Theme overlays:** Realm Brew overlays (archways, doors, bridges, pillars, etc.) + generated: torches, treasure chests, trap markers, secret doors, rubble

### 3.2 Fantasy Overworld
Classic RPG world map: forests, castles, villages, roads.
- **Color palette:** Greens, browns, blues, parchment
- **Base tiles:** Grassland, dense forest, light woods, hills, mountains, lake, ocean, river, road, desert, tundra, swamp, farmland, beach, volcanic
- **Theme overlays:** Castle, village, tower, bridge, ruins, cave entrance, standing stones, fairy ring, dragon lair marker, port, lighthouse, windmill, shrine

### 3.3 Historical Battlefields
Top-down tactical maps for recreating or imagining battles.
- **Color palette:** Muted earth tones, military greens, dust browns
- **Base tiles:** Open field, trenches, forest cover, river crossing, hill elevation, mud, road, fortification wall, moat, camp ground, rocky ground, sand dunes, snow field, marsh
- **Theme overlays:** Cannon, tent, flag/banner, barricade, watchtower, supply wagon, bridge, ford marker, command post, medical tent, cavalry marker, infantry marker, artillery marker, siege equipment

### 3.4 Space
Cosmic maps of star systems, nebulae, and alien worlds.
- **Color palette:** Deep blues, purples, blacks, neon accents
- **Base tiles:** Deep space, nebula (red), nebula (blue), nebula (green), asteroid field, gas cloud, star (yellow), star (red giant), star (blue), planet (rocky), planet (gas giant), planet (ice), planet (ring), black hole, wormhole, comet trail, space station, moon
- **Theme overlays:** Satellite, space dock, orbital ring, alien structure, debris field, energy beam, shield barrier, trade route, warp gate, beacon, mining platform, solar sail, escape pod trail

### 3.5 Jungle
Dense tropical environments with ancient temples and wildlife.
- **Color palette:** Deep greens, vibrant yellows, warm browns, mossy tones
- **Base tiles:** Dense canopy, jungle floor, clearing, bamboo grove, fern gully, vine wall, muddy trail, fallen log crossing, tree root maze, strangler fig, moss rock, flower meadow, termite mound, quicksand
- **Theme overlays:** Ancient temple, stone idol, rope bridge, waterfall, parrot flock, snake warning, campfire, machete trail marker, hanging vines, pitcher plant, orchid cluster, monkey troop, jaguar tracks, treasure map piece

### 3.6 Rivers & Waterways
Water-focused maps: river systems, deltas, harbors, and wetlands. Uses Realm Brew Subterranean Rivers tiles for underground waterway variants.
- **Color palette:** Blues, blue-greens, sandy browns, silver
- **Base tiles:** Wide river, narrow stream, rapids, waterfall, lake, pond, delta, marsh, dam, canal, harbor, frozen river, hot spring, underground river, ocean inlet, tidal pool, mangrove, reef
- **Theme overlays:** Boat/canoe, dock, bridge (wood), bridge (stone), fishing spot, water wheel, beaver dam, lily pads, stepping stones, whirlpool marker, lighthouse, buoy, river monster, houseboat, lock/gate

### 3.7 Prairie & Grasslands
Wide open plains with scattered settlements and wildlife.
- **Color palette:** Golden yellows, amber, sage green, sky blue, warm browns
- **Base tiles:** Tall grass, short grass, wildflower field, wheat field, dust patch, dry creek bed, rocky outcrop, lone tree, brush, rolling hill, buffalo wallow, prairie dog town, burnt grass, red clay, salt flat
- **Theme overlays:** Windmill, farmstead, covered wagon, campfire ring, totem pole, buffalo herd, hawk nest, well, fence line, silo, scarecrow, tumbleweed, coyote den, railroad track, telegraph pole

### 3.8 Mountains
Alpine environments from foothills to snow-capped peaks.
- **Color palette:** Slate grays, snow whites, deep greens, ice blues, rocky browns
- **Base tiles:** Foothill, low peak, high peak, snow cap, cliff face, mountain pass, alpine meadow, glacier, ice cave, rocky slope, pine forest, avalanche zone, hot spring, mountain lake, volcanic peak, scree field, ridge line
- **Theme overlays:** Mountain cabin, mine entrance, rope bridge, cairn, eagle nest, goat trail, ski lodge, observatory, hermit cave, frozen waterfall, summit flag, rock slide, cloud bank, mountain shrine, yeti tracks

### 3.9 Continents & World Maps
Large-scale maps showing landmasses, oceans, and political borders.
- **Color palette:** Parchment, warm ocean blues, varied land greens/browns/whites
- **Base tiles:** Deep ocean, shallow ocean, continental shelf, coastal, lowland, highland, desert, arctic, tundra, rainforest, temperate forest, savanna, steppe, volcanic island, coral reef, ice sheet, river delta, mountain range
- **Theme overlays:** Capital city, city, town, port city, trade route, border marker, compass rose, sea monster, ship, caravan, ancient wonder, lighthouse, fortress, kingdom banner, resource marker (gold/gems/iron/wood/food)

---

## 4. Piece Shapes (4)

All shapes tile seamlessly. Each shape affects grid layout and piece count per page.

| Shape | Grid Type | Tiling Method |
|-------|-----------|---------------|
| **Square** | Orthogonal grid | Standard row/column |
| **Hexagon** | Offset columns (pointy-top) | Odd columns offset down by half |
| **Isometric Diamond** | Diamond/rhombus grid | 45° rotated squares, offset rows |
| **Octagon** | Octagons + small squares | Octagon grid with square fill pieces |

### Shape rendering
- **Square:** Simplest. `clip-path: none` (natural rectangle).
- **Hexagon:** Canvas path. Realm Brew PNG tiles are natively hex-shaped. Hex dimensions rounded to whole pixels to prevent sub-pixel gap artifacts.
- **Isometric Diamond:** 45° rotated squares. Popular for tactical/strategy maps. Each diamond has 4 neighbors (N/S/E/W). Intuitive for kids — looks like Minecraft or classic RPG overhead views.
- **Octagon:** Canvas path. Small square connector pieces fill the gaps. Both octagon and square-filler cells are interactive — users can place tiles on both. Square fillers auto-labeled in palette as "connector tiles." Save format includes `cellType: "oct"|"sq"` field for octagon grids.

---

## 5. Map Sizes

All sizes fit on 8.5×11" (letter) paper. Size controls piece dimensions and count.

| Size | Piece Scale | Approx Pieces (Square) | Approx Pieces (Hex) | Use Case |
|------|------------|------------------------|---------------------|----------|
| **Small** | Large pieces | 6×8 = 48 | ~40 | Quick maps, young kids |
| **Medium** | Medium pieces | 10×13 = 130 | ~110 | Standard maps |
| **Large** | Small pieces | 16×20 = 320 | ~270 | Detailed maps, older kids |

Piece pixel sizes are calculated at runtime from the chosen paper dimensions (8.5×11" at 96 DPI for screen, 300 DPI for export).

---

## 6. Base Types — Complete Catalog

Each base type renders as a filled tile. Total: **110 base types** organized into 13 terrain categories. Not all bases are available in all themes — each theme selects a curated subset.

### 6.1 Grassland & Plains (12)
| ID | Name | Visual | Available Themes |
|----|------|--------|-----------------|
| `grassland` | Grassland | Green with subtle grass texture | Fantasy, Battlefields, Prairie, Continents |
| `tall-grass` | Tall Grass | Darker green with tall swaying blade strokes | Prairie, Fantasy |
| `short-grass` | Short Grass | Light cropped green, neat texture | Prairie, Battlefields |
| `wildflower-field` | Wildflower Field | Green dotted with colorful flower specks | Prairie, Fantasy, Jungle |
| `wheat-field` | Wheat Field | Golden yellow with parallel stalk lines | Prairie, Battlefields, Fantasy |
| `savanna` | Savanna | Golden yellow-green, scattered acacia pattern | Fantasy, Prairie, Continents |
| `farmland` | Farmland | Patchwork green/brown/gold squares | Fantasy, Prairie, Battlefields |
| `steppe` | Steppe | Dry brown-green sparse grass | Continents, Prairie |
| `brush` | Scrubland | Tan with scattered dark bush clumps | Prairie, Battlefields, Mountains |
| `dust-patch` | Dust Patch | Bare light brown earth | Prairie, Battlefields |
| `red-clay` | Red Clay | Reddish-brown hardpan soil | Prairie, Battlefields |
| `salt-flat` | Salt Flat | White crystalline cracked surface | Prairie, Desert, Continents |

### 6.2 Forest & Vegetation (10)
| ID | Name | Visual | Available Themes |
|----|------|--------|-----------------|
| `forest` | Dense Forest | Dark green with tree canopy clusters | Fantasy, Jungle, Mountains, Continents |
| `light-woods` | Light Woods | Lighter green with scattered tree dots | Fantasy, Battlefields, Prairie |
| `pine-forest` | Pine Forest | Dark blue-green with pointed conifer shapes | Mountains, Fantasy, Continents |
| `jungle-canopy` | Jungle Canopy | Vibrant deep green with layered leaf patterns | Jungle |
| `jungle-floor` | Jungle Floor | Brown-green with root/vine texture | Jungle |
| `bamboo-grove` | Bamboo Grove | Yellow-green with vertical stalk lines | Jungle |
| `mangrove` | Mangrove | Dark green roots meeting brown water | Jungle, Rivers |
| `fern-gully` | Fern Gully | Bright green with frond-like radiating shapes | Jungle |
| `clearing` | Clearing | Light green open circle in darker surround | Jungle, Fantasy, Mountains |
| `vine-wall` | Vine Wall | Solid green with criss-crossing vine lines | Jungle |

### 6.3 Water Terrain (12)
| ID | Name | Visual | Available Themes |
|----|------|--------|-----------------|
| `ocean` | Deep Ocean | Dark blue with subtle wave pattern | Fantasy, Rivers, Continents |
| `shallow-water` | Shallow Water | Light blue, translucent feel | Fantasy, Rivers, Continents |
| `river` | River | Blue stripe with bank edges | Fantasy, Rivers, Prairie, Mountains |
| `wide-river` | Wide River | Broad blue expanse with gentle current lines | Rivers, Continents |
| `stream` | Stream/Creek | Narrow light blue winding line | Rivers, Mountains, Prairie |
| `lake` | Lake | Calm blue with shore gradient | Fantasy, Rivers, Mountains, Continents |
| `pond` | Pond | Small circular blue with reeds at edges | Rivers, Prairie, Jungle |
| `rapids` | Rapids | White-blue turbulent streaks | Rivers, Mountains, Jungle |
| `waterfall` | Waterfall | Blue with white cascade and mist | Rivers, Mountains, Jungle |
| `swamp` | Swamp/Marsh | Murky green-brown with reed lines | Fantasy, Rivers, Jungle |
| `hot-spring` | Hot Spring | Light blue with steam wisps | Rivers, Mountains |
| `delta` | River Delta | Branching blue channels on sandy brown | Rivers, Continents |

### 6.4 Elevation Terrain (10)
| ID | Name | Visual | Available Themes |
|----|------|--------|-----------------|
| `hills` | Hills | Rolling green-brown contours | Fantasy, Battlefields, Prairie, Mountains |
| `foothill` | Foothill | Low gentle brown mounds | Mountains, Fantasy |
| `mountain` | Mountain | Gray-brown peaked triangles | Fantasy, Mountains, Continents |
| `high-peak` | High Peak | Tall sharp gray peaks with shadow | Mountains |
| `snow-peak` | Snow Peak | White-capped mountain | Mountains, Continents |
| `cliff` | Cliff Face | Vertical brown-gray rock wall | Mountains, Rivers, Jungle |
| `canyon` | Canyon | Deep orange-red layered rock | Mountains, Prairie |
| `plateau` | Plateau | Flat-topped elevated brown | Mountains, Battlefields, Prairie |
| `ridge` | Ridge Line | Long narrow elevated brown spine | Mountains, Continents |
| `scree` | Scree/Talus | Loose gray-brown rock fragments | Mountains |

### 6.5 Desert & Arid (6)
| ID | Name | Visual | Available Themes |
|----|------|--------|-----------------|
| `desert-sand` | Sand Desert | Sandy yellow with dune ripples | Fantasy, Battlefields, Continents |
| `desert-rock` | Rocky Desert | Brown-gray with scattered boulder shapes | Fantasy, Battlefields |
| `oasis` | Oasis | Blue water circle ringed with green | Fantasy, Continents |
| `sand-dunes` | Sand Dunes | Undulating golden wave pattern | Fantasy, Continents |
| `badlands` | Badlands | Eroded red-orange layered mesa shapes | Mountains, Prairie |
| `dry-creek` | Dry Creek Bed | Sandy channel with cracked mud texture | Prairie, Desert |

### 6.6 Arctic & Cold (8)
| ID | Name | Visual | Available Themes |
|----|------|--------|-----------------|
| `tundra` | Tundra | Gray-white with sparse lichen dots | Fantasy, Mountains, Continents |
| `frozen-water` | Frozen Water | Light blue-white with ice crack lines | Mountains, Continents, Rivers |
| `ice-plain` | Ice Plain | Smooth pale blue-white surface | Continents, Mountains |
| `glacier` | Glacier | Blue-white with crevasse lines | Mountains, Continents |
| `ice-cave` | Ice Cave | Dark blue-white with crystal formations | Mountains, Dungeon |
| `snow-field` | Snow Field | Pure white with wind-drift texture | Mountains, Battlefields, Continents |
| `permafrost` | Permafrost | Gray-brown with frozen crack pattern | Continents, Mountains |
| `ice-shelf` | Ice Shelf | White with blue water visible at edges | Continents |

### 6.7 Dungeon Terrain (10)
| ID | Name | Visual | Available Themes |
|----|------|--------|-----------------|
| `stone-floor` | Stone Floor | Gray fitted rectangular stone tiles | Dungeon |
| `cobblestone` | Cobblestone | Rounded gray stone pattern | Dungeon, Fantasy |
| `corridor` | Corridor | Narrow stone passage with dark wall edges | Dungeon |
| `cavern` | Cavern | Rough irregular brown-gray natural rock | Dungeon |
| `underground-river` | Underground River | Dark blue water in gray stone channel | Dungeon, Rivers |
| `pit` | Pit/Chasm | Black center with crumbling brown edge | Dungeon |
| `dark-room` | Dark Room | Very dark gray with torch-glow edges | Dungeon |
| `crypt` | Crypt | Gray stone with ornate carved border pattern | Dungeon |
| `throne-room` | Throne Room | Polished stone with red carpet center stripe | Dungeon |
| `sewer` | Sewer Channel | Gray stone with green-tinted water channel | Dungeon |

### 6.8 Space Terrain (14)
| ID | Name | Visual | Available Themes |
|----|------|--------|-----------------|
| `deep-space` | Deep Space | Black with random tiny white star dots | Space |
| `nebula-red` | Red Nebula | Swirling red-orange gas clouds on dark | Space |
| `nebula-blue` | Blue Nebula | Swirling blue-purple gas clouds | Space |
| `nebula-green` | Green Nebula | Swirling green-teal gas clouds | Space |
| `asteroid-field` | Asteroid Field | Gray irregular rocks on black | Space |
| `gas-cloud` | Gas Cloud | Translucent yellow-orange haze | Space |
| `star-yellow` | Yellow Star | Bright yellow radial gradient with corona | Space |
| `star-blue` | Blue Star | Bright blue-white radial glow | Space |
| `star-red` | Red Giant | Large dim red radial glow | Space |
| `planet-rocky` | Rocky Planet | Brown-gray sphere with crater marks | Space |
| `planet-gas` | Gas Giant | Banded orange/brown sphere with storms | Space |
| `planet-ice` | Ice Planet | White-blue sphere with smooth surface | Space |
| `black-hole` | Black Hole | Dark center with swirling accretion disk | Space |
| `wormhole` | Wormhole | Spiraling blue-purple tunnel vortex | Space |

### 6.9 Volcanic & Hazard (6)
| ID | Name | Visual | Available Themes |
|----|------|--------|-----------------|
| `volcanic` | Volcanic Ground | Dark gray with red-orange lava crack veins | Fantasy, Mountains, Continents |
| `lava-flow` | Lava Flow | Bright orange-red flowing liquid rock | Fantasy, Mountains, Dungeon |
| `lava-field` | Lava Field | Cooled black basalt with glowing red cracks | Mountains, Dungeon |
| `scorched-earth` | Scorched Earth | Blackened ground with ember specks | Battlefields, Fantasy |
| `ruins-ground` | Ruins Ground | Broken gray stone rubble scattered on dirt | Battlefields, Fantasy, Dungeon |
| `no-mans-land` | No Man's Land | Cratered brown mud with debris | Battlefields |

### 6.10 Constructed Terrain (8)
| ID | Name | Visual | Available Themes |
|----|------|--------|-----------------|
| `road` | Dirt Road | Brown dirt strip with parallel edge lines | Fantasy, Battlefields, Prairie |
| `paved-road` | Paved Road | Gray cobblestone with orderly block pattern | Fantasy, Battlefields |
| `fortification` | Fortification Wall | Thick gray stone blocks pattern | Battlefields, Dungeon |
| `bridge` | Bridge | Brown wooden plank pattern over gap | Fantasy, Rivers, Mountains, Jungle |
| `trench` | Trench | Dug-out brown channel with earth walls | Battlefields |
| `camp-ground` | Camp Ground | Flat brown earth with tent stake marks | Battlefields, Prairie |
| `harbor` | Harbor | Blue water with wooden dock edges | Rivers, Fantasy, Continents |
| `town` | Town/Settlement | Tiny rooftop shapes on brown grid streets | Fantasy, Continents, Battlefields |

### 6.11 Coastal & Ocean (6)
| ID | Name | Visual | Available Themes |
|----|------|--------|-----------------|
| `beach` | Sandy Beach | Sandy yellow meeting blue water gradient | Fantasy, Rivers, Continents |
| `reef` | Coral Reef | Colorful small irregular shapes on blue | Rivers, Continents |
| `tidal-pool` | Tidal Pool | Small blue circles in sandy rock | Rivers, Continents |
| `ocean-inlet` | Ocean Inlet | Blue water channel in rocky coast | Rivers, Continents |
| `coastal` | Coastal Bluffs | Green-brown land meeting blue water edge | Continents, Fantasy |
| `continental-shelf` | Continental Shelf | Light blue-green shallow water pattern | Continents |

### 6.12 Battlefield & Tactical (4)
| ID | Name | Visual | Available Themes |
|----|------|--------|-----------------|
| `mud` | Mud/Bog | Dark brown with wet gleam highlights | Battlefields, Rivers |
| `moat` | Moat | Blue water channel with stone wall edges | Battlefields, Dungeon |
| `rocky-ground` | Rocky Ground | Gray-brown with scattered stone shapes | Battlefields, Mountains |
| `dam` | Dam | Gray stone wall crossing blue water | Rivers |

### 6.13 Continental & World (4)
| ID | Name | Visual | Available Themes |
|----|------|--------|-----------------|
| `lowland` | Lowland | Light green flat terrain | Continents |
| `highland` | Highland | Darker green-brown elevated terrain | Continents |
| `mountain-range` | Mountain Range | Line of small gray peaks | Continents |
| `rainforest` | Rainforest | Dense dark green with layered canopy | Continents, Jungle |

---

## 7. Overlays — Complete Catalog

Overlays are placed on top of base tiles. Two categories: **theme-specific** (belong to one or two themes) and **universal** (available across all/most themes).

### 7.1 Theme-Specific Overlays

#### Dungeon Theme Overlays (25)
Torch, treasure chest, trap (spike), trap (pit), secret door, rubble pile, skeleton remains, altar, magic circle, iron gate, portcullis, chains, cobwebs, mushroom cluster, crystal formation, barrel stack, weapon rack, bookshelf, cauldron, sarcophagus, blood splatter, claw marks, arcane runes, prison cage, lever/switch

*Plus Realm Brew overlays: archway (3), bridge (3), bridge broken (2), collapsed passage (9), door (2), gate (2), ladder down (6), ladder up (2), niche variants (13), pillars (9), staircase (5), trapdoor (2), wall variants (8)*

#### Fantasy Overworld Overlays (20)
Castle, village cluster, wizard tower, stone bridge, ancient ruins, cave entrance, standing stones, fairy ring, dragon lair marker, harbor/port, lighthouse, windmill, shrine/temple, market town, enchanted well, giant tree, crystal spire, graveyard, battlefield marker, royal road marker

#### Historical Battlefields Overlays (18)
Cannon emplacement, military tent, flag/banner, wooden barricade, watchtower, supply wagon, ford marker, command post, medical tent, cavalry marker, infantry marker, artillery position, siege tower, battering ram, trench line, minefield marker, signal fire, pontoon bridge

#### Space Overlays (20)
Space station, orbital dock, alien megastructure, debris field, energy barrier, trade route line, warp gate, navigation beacon, mining platform, solar collector, escape pod, comet, satellite array, sensor buoy, fleet formation, colony dome, terraformer, asteroid base, space whale, anomaly marker

#### Jungle Overlays (18)
Ancient temple, stone idol, rope bridge, waterfall, parrot flock, snake warning sign, machete trail, hanging vines, pitcher plant, orchid cluster, monkey troop marker, jaguar tracks, treasure map fragment, tree house, quicksand warning, ancient stairway, overgrown statue, tribal mask

#### Rivers & Waterways Overlays (18)
Boat/canoe, wooden dock, stone bridge, fishing spot marker, water wheel, beaver dam, lily pad cluster, stepping stones, whirlpool marker, lighthouse, channel buoy, river serpent, houseboat, lock/floodgate, fish school, otter den, sunken treasure, waterfall cascade

#### Prairie & Grasslands Overlays (16)
Windmill, farmstead, covered wagon, campfire ring, totem pole, buffalo herd marker, hawk nest, water well, fence line, grain silo, scarecrow, tumbleweed, coyote den, railroad tracks, telegraph pole, prairie schooner

#### Mountains Overlays (18)
Mountain cabin, mine entrance, rope bridge, stone cairn, eagle nest, goat trail marker, ski lodge, observatory dome, hermit cave, frozen waterfall, summit flag, rock slide zone, cloud bank, mountain shrine, yeti tracks, ice bridge, avalanche marker, alpine flower meadow

#### Continents & World Overlays (15)
Capital city star, major city dot, port city anchor, trade route (land), trade route (sea), border line, compass rose, sea monster, sailing ship, caravan, ancient wonder, kingdom banner, resource marker, political border, exploration trail

### 7.2 Universal Overlays (55)

Available across all themes. Common features, markers, and labels.

#### Settlements & Structures (6)
| ID | Name | Notes |
|----|------|-------|
| `village` | Small Village | 3–5 tiny buildings cluster |
| `ruins` | Ancient Ruins | Broken walls/columns |
| `tribe-camp` | Tribal Camp | Tents/huts in circle |
| `fence` | Fence/Wall | Boundary marker |
| `gate` | Gate/Entrance | Arched doorway |
| `tower` | Watchtower | Tall lookout structure |

#### Wildlife (5)
| ID | Name | Notes |
|----|------|-------|
| `deer` | Deer | Grazing animal silhouette |
| `wolf` | Wolf Pack | Predator marker |
| `bird-flock` | Bird Flock | V-formation birds |
| `bear` | Bear | Standing bear silhouette |
| `fish` | Fish | Swimming fish |

#### Character Tokens (6)
| ID | Name | Notes |
|----|------|-------|
| `warrior` | Warrior | Sword-and-shield silhouette |
| `wizard` | Wizard | Robed figure with staff |
| `archer` | Archer | Figure with bow |
| `king` | King/Queen | Crown-wearing figure |
| `monster` | Monster | Generic beast silhouette |
| `npc` | NPC/Person | Generic standing figure |

#### Markers & Points of Interest (6)
| ID | Name | Notes |
|----|------|-------|
| `campfire` | Campfire | Small fire with logs |
| `treasure` | Treasure | Chest / X marks spot |
| `danger-sign` | Danger Sign | Skull and crossbones |
| `question-mark` | Mystery Point | Glowing question mark |
| `star-marker` | Star Point | Important location star |
| `compass-rose` | Compass Rose | N/S/E/W directional compass |

#### Numbered Markers (10)
| ID | Name | Notes |
|----|------|-------|
| `marker-1` through `marker-10` | Markers 1–10 | Circled number for keyed maps |

#### Lettered Markers (6)
| ID | Name | Notes |
|----|------|-------|
| `marker-a` through `marker-f` | Markers A–F | Circled letter for keyed maps |

#### Navigation (5)
| ID | Name | Notes |
|----|------|-------|
| `arrow-north` | Arrow N | Points north |
| `arrow-east` | Arrow E | Points east |
| `arrow-south` | Arrow S | Points south |
| `arrow-west` | Arrow W | Points west |
| `path-marker` | Path/Trail | Dotted line segment |

#### Nature (4)
| ID | Name | Notes |
|----|------|-------|
| `tree-single` | Single Tree | One prominent tree |
| `rock-formation` | Rock Formation | Boulder cluster |
| `flowers` | Flower Patch | Colorful wildflowers |
| `mushrooms` | Mushroom Ring | Fairy ring of mushrooms |

#### Weather & Atmosphere (5)
| ID | Name | Notes |
|----|------|-------|
| `fog` | Fog/Mist | Semi-transparent haze |
| `rain` | Rain | Diagonal rain lines |
| `snow` | Snow Cover | White overlay |
| `fire` | Fire/Flames | Active fire |
| `smoke` | Smoke Plume | Rising gray smoke |

#### Labels & Flags (7)
| ID | Name | Notes |
|----|------|-------|
| `flag-red` | Red Flag | Placeable red flag |
| `flag-blue` | Blue Flag | Placeable blue flag |
| `flag-green` | Green Flag | Placeable green flag |
| `flag-yellow` | Yellow Flag | Placeable yellow flag |
| `text-label` | Text Label | User-typed custom text (multiple font sizes) |
| `title-banner` | Title Banner | Decorative scroll/cartouche for map title |
| `scale-bar` | Scale Bar | "1 square = X" decorative scale indicator |

---

## 8. Realm Brew Asset Integration

The Realm Brew Complete Bundle v0.2 KS provides high-quality hand-drawn hex tiles and overlays for dungeon/cavern themes.

### 8.1 Asset Organization
```
assets/realm-brew/
├── tiles/
│   ├── man-hewn-dungeons/        (37 hex tiles, 1200×1039px each)
│   ├── subterranean-rivers/      (37 hex tiles)
│   └── underdark-caverns/        (37 hex tiles)
├── overlays/
│   ├── man-hewn-dungeons/        (66 overlays, variable sizes)
│   ├── subterranean-rivers/      (30 overlays)
│   ├── underdark-caverns/        (35 overlays)
│   ├── alchemists-workshop/      (62 overlays)
│   ├── goblins-hideout/          (62 overlays)
│   └── red-dragons-lair/         (37 overlays)
```

### 8.2 Usage Strategy
- **Hex shape + Dungeon theme:** Use Realm Brew tiles directly as base tiles.
- **Hex shape + Rivers theme:** Use Subterranean Rivers tiles for underground river variant.
- **Non-hex shapes + Dungeon:** Generate procedural tiles inspired by Realm Brew art style (stone textures, color palette).
- **All shapes:** Realm Brew overlays (doors, bridges, etc.) are placed as-is on any tile; they're shape-agnostic transparent PNGs.
- **Optimization:** Tiles are large (1200×1039). On load, resize to needed grid cell size and cache in offscreen canvas. Original files only loaded for high-res export.

### 8.3 License Note
Realm Brew assets are from a Kickstarter bundle. They should NOT be included in the git repository (too large, licensing). Instead:
- Store in `assets/realm-brew/` which is `.gitignore`d
- Game detects their presence and enables enhanced Dungeon/Cavern tile options
- Without them, Dungeon theme uses procedural (Canvas-drawn) tiles
- Include a `README` in `assets/` explaining how to add the Realm Brew files

---

## 9. Rendering Architecture

### 9.1 Canvas-Based Editor
- Primary canvas for the map grid + placed tiles
- Overlay canvas for selection highlights, grid lines, cursor
- Tile atlas canvases for tile caching (see §9.5)

### 9.2 Procedural Tile Rendering — N64-Quality Graphics
For non-Realm-Brew tiles, each base type is drawn procedurally on Canvas with multi-layer techniques:
- **Multi-layer textures:** Layered gradients, Perlin-style noise patterns, and dithering for organic texture — not flat fills
- **Perlin noise:** Lightweight vanilla JS implementation (~100 lines). Pre-compute a 256×256 noise texture at startup and sample via UV coordinates during tile rendering. No npm dependency.
- **Lighting/depth:** Highlights on top edges, shadows on bottom edges for dimensional feel
- **Organic shapes:** Irregular, natural-looking forms using bezier curves and noise-offset paths — no perfect circles/rectangles
- **Rich palettes:** 5-7 colors per tile with smooth transitions (up from 3)
- **Detail density:** Multiple visual elements per tile (e.g., forest = varied tree sizes, undergrowth, fallen logs)
- **Shared art vocabulary:** All tiles — including space and dungeon — use the same rendering vocabulary (bezier curves, layered gradients, noise patterns, scattered elements). Space tiles are stylized/cartoony, not photorealistic. No unique rendering techniques (gravitational lensing, spherical projection) without analogues in other themes.
- All rendering parameterized by tile shape (square/hex/diamond/oct clip paths)
- **Canvas state safety:** All render methods wrapped in `ctx.save()` / `ctx.restore()` pairs to prevent state leaks (globalAlpha, transforms, etc.)

### 9.3 Neighbor-Aware Rendering
Tiles are **not rendered in isolation**. Each tile queries its neighbors to determine edge treatment.

#### 9.3.1 Transition Modes
Not all tile categories use the same transition logic. Each theme defines a `transitionMode`:

| Mode | Themes | Transition Logic |
|------|--------|-----------------|
| **Terrestrial** | Fantasy, Battlefields, Prairie, Mountains, Continents, Rivers, Jungle | Material property-based geographic transitions |
| **Space** | Space | Nebulae blend via color gradient; deep-space tiles merge star fields; planets/stars/black-holes maintain hard circular boundaries against space background |
| **Dungeon** | Dungeon | Architectural transitions: wall (no passage), doorway (passage with frame), open (merged space like water merging). Corridor→cavern gets a threshold, not "density gradient with stumps." |

#### 9.3.2 Water Merging
- Adjacent same-type water tiles merge into seamless continuous bodies (internal grid borders erased, unified surface)
- Adjacent different-type water tiles (e.g., river→lake) render gradient transition zones
- Swamp maintains distinct murky border treatment against clean water types
- **Hybrid water tiles**: Tiles that contain water but belong to other categories (`oasis`, `harbor`, `moat`, `hot-spring`, `delta`, `dam`, `tidal-pool`, `underground-river`, `sewer`) are flagged with `"waterContent": true` in `base-types.json`. These participate in water merging on their water-containing portion.

##### Water Merging Edge Cases
- **L-shaped bodies**: Corner cells merge on two non-opposite edges. Wave patterns adjust direction at bends to maintain visual continuity.
- **Single-cell water**: Renders in "contained" mode — pond-like with shore gradient on all edges, no merging.
- **Corner-meeting water** (square/octagon grids): When diagonally opposite cells are water but the two other corner-sharing cells are land, draw a corner-fill arc connecting the two water edges to prevent a visual gap.
- **Hex triple-junctions**: Where three hex edges meet at a vertex and all three cells are water, draw a center-fill triangle to prevent seam artifacts at the junction point.
- **Octagon filler cells**: Both octagon and square-filler cells participate in merging. A water tile on a square filler merges with adjacent octagon water tiles. The filler's small size means its transition zone is proportionally smaller.

##### River Flow Direction
Rivers have directional current. Flow direction is determined by neighbor topology:
- If adjacent to ocean/lake, flow toward it (downstream)
- If adjacent to another river, inherit or continue flow direction
- If no water neighbor, default to south-east (configurable per cell via rotation property)
- Flow direction affects current line rendering and animation drift direction

##### Waterfall & Rapids
Rendered as self-contained scenes within one cell (mini-waterfall with cliff at top, pool at bottom; rapids with rocks and turbulent flow). Cell rotation determines the fall/flow direction. They do not require multi-cell awareness.

#### 9.3.3 Shoreline Rendering
- Where any water tile meets a land tile, a natural shoreline is drawn
- Shoreline style varies by the land neighbor's material properties:

| Land Neighbor Type | Shoreline Style |
|--------------------|----------------|
| High moisture (grassland, forest) | Muddy bank, reeds, soft earth |
| Low moisture (desert) | Sandy shore, cracked earth |
| High elevation (mountain, cliff) | Rocky shore, cliff edge, boulders |
| Constructed (road, town) | Reinforced bank, stone edge |
| Arctic/cold (tundra, ice) | Frozen shore, ice shelf edge, frost crystals |
| Volcanic (lava, scorched) | Steam, obsidian beach, cooling rock |
| Jungle/mangrove | Tangled roots meeting water, murky edge |
| Swamp-to-dry-land | Dried mud, dead reeds, gradual moisture fade |

- Shoreline is part of the water tile's render (drawn on the water side)
- Foam line along shoreline edge (subtle white highlights)

#### 9.3.4 Land-to-Land Transitions — Material Properties System
Each base tile defines 5 material properties used to auto-generate contextual edge transitions:

```json
{
  "elevation": 0-10,
  "moisture": 0-10,
  "density": 0-10,
  "temperature": 0-10,
  "organic": true|false
}
```

**Only used for terrestrial transition mode.** Space and dungeon themes use their own transition logic (see §9.3.1).

**Transition rules are emergent based on property difference vectors:**
- **Large elevation difference** (mountain→grassland): rocky cliff face, scattered boulders
- **Large moisture difference** (water→desert): dramatic shoreline with cracked earth
- **Small moisture difference** (lake→grassland): gentle muddy bank, reeds
- **Temperature gradient** (arctic→temperate): snow melt line, patchy snow-to-grass
- **Density gradient** (dense-forest→clearing): trees thin out, stumps, undergrowth
- **Organic→constructed**: hard edge with border treatment (cobblestone edge, fence line)
- **Bidirectional blending**: Both tiles contribute to the transition zone with weighted probability

**Transition zone scaling by cell size:**
- Cell ≥ 48px: full transitions with scatter objects
- Cell 32-47px: gradient-only transitions, no scatter objects
- Cell < 32px: hard edges only (too small for meaningful transitions)

**Scatter object limits:** Max 4 scatter objects per edge, 12 per cell. Positions pre-computed via seeded noise lookup table.

This eliminates per-pair transition definitions. Adding a new tile type requires only setting 5 property values.

#### 9.3.5 Neighbor Cache Strategy
- **Tile atlas architecture**: Instead of individual offscreen canvases per tile, pack rendered tiles into 2-4 large atlas canvases (2048×2048 each). Maintain a lookup table mapping cache keys to atlas coordinates (source rectangle). Blit to main canvas via 9-argument `drawImage(atlas, sx, sy, sw, sh, dx, dy, dw, dh)`. This keeps canvas context count in single digits (critical for iPad Safari which has undocumented limits on active canvas contexts).
- Cache key: `${tileId}-${shape}-${cellSize}-${neighborHash}`
- **Neighbor hash**: Use FNV-1a hash of full tile ID (2 hex chars) to avoid collisions. `charAt(0)` is insufficient — `grassland`, `glacier`, `gas-cloud` would all collide.
  ```
  neighborHash = neighbors.map(n => {
    if (!n.base) return '00';          // empty
    if (n.base === thisBase) return 'SS'; // same type
    return fnv1a(n.base).toString(16).slice(-2); // 2-char hash
  }).join('');
  ```
- **LRU eviction**: Hard cap of ~200 atlas entries (~7MB at DPR 3). Evict least-recently-used when full.
- **Cascading dirty**: When a cell's tile changes, mark all its neighbors dirty too
- **Budgeted re-caching**: Re-cache max 8-10 dirty cells per frame (~5ms). Remaining dirty cells render from stale cache until their turn. Prevents 3×3 brush from causing a 25-cell spike.
- **Progressive cache warming**: On zoom/DPR change, clear cache and re-render visible tiles center-outward over multiple frames. Show low-quality fallback (flat fill + grid) for tiles not yet cached.

### 9.4 Tile Animation System
All tile types have contextual ambient effects that bring the map to life:

#### 9.4.1 Animation Categories
| Category | Examples | Effect Type |
|----------|----------|-------------|
| **Water** | Ocean, lake, river, swamp | Waves, ripples, fish leaping, foam, bubbles |
| **Lava/Volcanic** | Lava flow, volcanic ground | Pulsing glow, flowing molten movement |
| **Forest/Vegetation** | Dense forest, jungle, bamboo | Gentle leaf sway, rustling canopy |
| **Grassland** | Tall grass, wheat, wildflowers | Wind ripple, swaying stalks |
| **Desert** | Sand desert, dunes | Heat shimmer, blowing sand particles |
| **Arctic/Snow** | Snow field, glacier, tundra | Occasional sparkle, drifting snow |
| **Elevation** | Hills, mountains, cliffs | Animals traversing, snowfall on peaks |
| **Constructed** | Roads, bridges, towns | Theme-appropriate traffic (see §9.4.6) |
| **Space** | Nebulae, stars, planets | Star twinkle, nebula swirl, accretion disk rotation |
| **Dungeon** | Corridors, caverns, crypts | Torch flicker, dripping water, dust motes |

#### 9.4.2 Animation Intensity Classification
Each animation effect is classified as **gentle** or **intense**:
- **Gentle** (allowed in Subtle mode): wave sway, grass ripple, leaf sway, snow drift, star twinkle, torch flicker, cloud shadow
- **Intense** (disabled in Subtle mode): fish leaping, dragonfly paths, dust devil, wormhole spiral, black hole accretion disk rotation, lava glow pulse, animal traversal, traffic

This protects sensory-sensitive users (ADHD/autism) from sudden or erratic motion.

#### 9.4.3 Two-Layer Animation Architecture
1. **Static base layer**: Full procedural tile texture rendered once to tile atlas cache (expensive, done once per zoom/resize)
2. **Animation overlay layer**: Lightweight per-frame draw of moving elements only (wave offsets, particles, shimmer). Only draw for tiles that have animations defined — skip empty and static-only tiles.

#### 9.4.4 Adaptive Quality Scaling
Frame time is measured each frame via `performance.now()`. A rolling average (last 20 frames) determines quality level:

| Level | Trigger | Behavior |
|-------|---------|----------|
| 1 — Full | avg < 12ms | All animations, all particles, all effects |
| 2 — Reduced | avg 12-14ms | Fewer particles, skip ambient effects on non-visible tiles |
| 3 — Low FPS | avg 14-16ms | Animation layer at 30fps, interaction stays 60fps |
| 4 — Minimal | avg > 16ms sustained | Simplest wave offset only, no particles |
| 5 — Static | manual or `prefers-reduced-motion` | No animation, dirty-flag rendering only |

**Hysteresis with exponential backoff:** First step-up requires 60 frames of good performance. If it immediately drops back, the next step-up requires 120 frames, then 240. Reset backoff after staying at higher quality for 5+ seconds. Prevents visible quality oscillation.

**Viewport culling (mandatory):** Only animate tiles actually visible on screen. At typical zoom, ~40-80 tiles are visible, not 320. This is the primary mechanism for keeping animation under budget.

**Animation staggering:** Tile at `(col, row)` only updates when `(frameCount + col + row) % 3 === 0`. Each tile animates at ~20fps but load is distributed across frames.

#### 9.4.5 Animation Controls — "Map Life" Toggle
Single toolbar `<button>` cycling three user-facing states:
- **Full** — all animations at device-capable quality (adaptive system protects performance silently)
- **Subtle** — gentle animations only (wave sway, grass ripple), no intense effects (see §9.4.2)
- **Still** — static tiles, no animation (also the default when `prefers-reduced-motion` is active)

`aria-label` updates to include current state (e.g., "Map Life: Full. Press to change to Subtle."). Keyboard-accessible via Enter/Space.

**`prefers-reduced-motion` behavior:** When active, toggle defaults to "Still" with a small note explaining why. User CAN override to "Subtle" or "Full" (respecting user agency), but the toggle resets to "Still" on each new editor session.

Persists preference in `localStorage` key `magical-map-maker-animation-pref`.

#### 9.4.6 Theme-Specific Traffic Animations
Constructed tiles render ambient moving elements appropriate to the map's theme:

| Theme | Traffic Elements |
|-------|-----------------|
| Fantasy Overworld | Horse carts, merchant wagons, walking figures |
| Historical Battlefields | Supply wagons, marching troops, messengers on horseback |
| Dungeon | Rats scurrying, torchlit adventurers, patrolling guards |
| Space | Floating maintenance drones, small shuttle craft |
| Jungle | Porters with packs, machete-wielding explorers |
| Rivers & Waterways | Small boats, fishing craft (harbor/dock tiles) |
| Prairie & Grasslands | Covered wagons, horseback riders, cattle |
| Mountains | Pack mules, climbers, mountain goats on paths |
| Continents & World | Caravans, trade ships (at world-map scale) |

#### 9.4.7 Animation & RAF Strategy
**Three-tier RAF loop** (not always-on 60fps):
1. **Animating**: RAF runs continuously. Animation layer renders per frame (with staggering). Active when Map Life is Full or Subtle.
2. **Idle throttle**: After 10 seconds of no interaction AND no camera movement, throttle animation to 15fps. Resume full speed on next pointer event.
3. **Still mode**: RAF runs but only renders on dirty flag (current behavior). Stops entirely after 5 seconds of idle (restart on input).

**Pause/resume handlers:**
- `visibilitychange` — primary
- `pagehide`/`pageshow` — backup (iPad Safari sometimes skips visibilitychange when switching apps via home bar)
- `blur`/`focus` — belt-and-suspenders for all edge cases

#### 9.4.8 Hero Frame Export
PDF/PNG/JPEG captures a curated static state. `animationTime` is locked to a fixed value of `t = 2.5s`, chosen so that:
- Waves are at a natural mid-crest position (not at extremes)
- Ripple rings are at pleasing radii
- Particles/animals are naturally posed
- No mid-transition artifacts

Each animation effect's `render(t)` function must produce a visually balanced result at `t = 2.5`.

### 9.5 Tile Caching — Atlas Architecture
```
Tile Atlas System
├── 2-4 atlas canvases (2048×2048 each)
│   ├── Tile renders packed into atlas regions
│   ├── Lookup table: cacheKey → { atlasIndex, sx, sy, sw, sh }
│   └── LRU eviction at ~200 entries (~7MB cap at DPR 3)
├── Overlay renders (keyed by: overlayId + size)
├── Composite cache (keyed by: cellId → base + overlays stack)
└── Animation state (lightweight per-frame data, not cached)
```

**Why atlas, not individual canvases:** iPad Safari has undocumented limits on active canvas contexts. Hundreds of offscreen canvases will cause silent garbage collection or creation failure. Atlas approach keeps context count in single digits.

### 9.6 Performance Targets
- 60fps pan/zoom on iPad Safari (with adaptive quality fallback)
- Tile palette scroll: no jank
- Place/remove tiles: <16ms per operation (budgeted re-caching spreads load across frames)
- Export: <5s for large maps (hero frame, no animation)
- Animation frame budget: <4ms for animation overlay layer (with viewport culling + staggering)
- Tile atlas memory: <7MB total at DPR 3
- Cache warmup after zoom: <500ms for visible tiles (progressive, center-outward)

---

## 10. Storage System

### 10.1 LocalStorage
- **Save key:** `magical-map-maker-saves`
- **Format:** JSON array of map objects
- **Auto-save:** Every 30 seconds during editing
- **Manual save:** Ctrl+S / Cmd+S / toolbar button
- **Max maps:** Warn at 10 maps (LocalStorage ~5MB limit)

### 10.2 Map Save Format
```json
{
  "id": "uuid-v4",
  "name": "My Dragon Lair",
  "theme": "dungeon",
  "shape": "hexagon",
  "size": "medium",
  "created": "2026-03-14T10:00:00Z",
  "modified": "2026-03-14T11:30:00Z",
  "thumbnail": "data:image/jpeg;base64,...",
  "grid": {
    "cols": 10,
    "rows": 13,
    "cells": [
      {
        "col": 0, "row": 0,
        "cellType": "oct",
        "base": "stone-floor",
        "rotation": 0,
        "flipH": false, "flipV": false,
        "overlays": [
          { "id": "torch", "rotation": 0, "opacity": 1.0, "size": "medium" },
          { "id": "cobwebs", "rotation": 0, "opacity": 0.8, "size": "small" }
        ]
      }
    ]
  },
  "version": 1
}
```

**Notes:**
- `cellType` field is only present for octagon grids (`"oct"` or `"sq"` for square fillers). Omitted for other shapes.
- `overlays` is an array of objects (not strings) to support per-overlay rotation, opacity, and size.
- Max 5 overlays per cell.
- `version` field enables future migration. StorageManager adds missing fields with defaults when loading older versions.

### 10.3 Export System
- **PDF:** Use `jsPDF` library (bundled locally, ~250KB — not CDN, for offline support) — renders canvas to PDF pages sized 8.5×11"
- **PNG:** `canvas.toBlob('image/png')` → download link
- **JPEG:** `canvas.toBlob('image/jpeg', 0.92)` → download link
- **Print:** CSS `@media print` stylesheet hides UI, shows map full-page
- **iPad canvas limit:** iPad Safari has a hard pixel limit (~16.7M pixels on older, ~67M on newer). Export must detect max canvas size via `document.createElement('canvas')` test. For large maps, cap DPI at 150 on iPad, or render in strips and composite. Always try 300 DPI first, fall back gracefully.

---

## 11. Accessibility Requirements

Inherited from games-for-my-kids project standards:

- **Font:** OpenDyslexic via CDN, Comic Sans MS fallback, minimum 16pt, 1.5× line height
- **Colors:** Cream background (#F5F0E8), dark text (#2C2416), WCAG AA 4.5:1 contrast
- **Touch targets:** 44×44px minimum on all buttons and palette tiles
- **No flashing/strobing effects**
- **No countdown timers**
- **Keyboard navigation:** Full editor usable via keyboard (arrow keys, Enter to place, Delete to remove, Tab through palettes)
- **Screen reader:** ARIA labels on all interactive elements, live region for status messages
- **Zoom:** No `user-scalable=no` — users can browser-zoom freely

---

## 12. Technology Stack

- **Vanilla JavaScript (ES6+)** — no frameworks, no npm, no bundlers
- **HTML5 Canvas** for map rendering
- **CSS3** for UI layout (CSS Grid + Flexbox)
- **LocalStorage** for save data
- **jsPDF** (bundled locally, ~250KB) for PDF export — not CDN, for offline support
- **SVG sprite sheet** for overlay icons — `assets/icons/overlays.svg` with `<symbol>` elements. Rendered to canvas via `Image()` + data URI. Avoids 200+ individual Canvas drawing functions.
- **Pointer Events API** for unified mouse/touch/pen input
- **Web Audio API** (optional) for placement sound effects
- Runs directly in browser with no build step

---

## 13. File Structure

```
magical-map-maker-game/
├── index.html                    Main game page
├── css/
│   ├── style.css                 Core layout and UI styles
│   ├── editor.css                Map editor specific styles
│   ├── themes.css                Theme color palettes
│   └── print.css                 Print-optimized styles
├── js/
│   ├── app.js                    Entry point, screen routing, init
│   ├── editor.js                 Map editor state machine
│   ├── grid.js                   Grid rendering (all 4 shapes)
│   ├── tiles.js                  Tile definitions, procedural rendering
│   ├── overlays.js               Overlay definitions and rendering
│   ├── palette.js                Sidebar tile/overlay palette UI
│   ├── input.js                  Pointer events, drag-drop, keyboard
│   ├── camera.js                 Pan, zoom, coordinate transforms
│   ├── history.js                Undo/redo stack
│   ├── storage.js                LocalStorage save/load
│   ├── export.js                 PDF/PNG/JPEG export
│   ├── themes.js                 Theme definitions (colors, available tiles)
│   └── data/
│       ├── base-types.json       Base tile type definitions
│       ├── overlays.json         Overlay definitions
│       └── themes.json           Theme → tile/overlay mappings
├── assets/
│   ├── realm-brew/               .gitignored — optional Realm Brew PNGs
│   │   └── README.md             Instructions for adding Realm Brew files
│   ├── icons/                    UI icons (SVG)
│   └── thumbnails/               Theme preview thumbnails
├── .github/
│   └── workflows/
│       └── deploy.yml            GitHub Pages deployment
├── .claude/
│   ├── rules/
│   │   └── magical-map-maker.md  Architecture and coding rules
│   ├── agents/
│   │   └── mapmaker-review.md    Code review agent
│   ├── skills/
│   │   ├── validate-map-data/
│   │   │   └── SKILL.md          Validate JSON data files
│   │   └── mapmaker-checklist/
│   │       └── SKILL.md          Pre-session checklist
│   └── hooks/
│       └── validate-map-data-hook.sh
├── CLAUDE.md                     Project instructions
├── spec.md                       This file
├── plan.md                       Implementation plan
└── sessions/                     Session specs
    ├── session-01.md
    ├── session-02.md
    └── ...
```

---

## 14. Non-Functional Requirements

| Requirement | Target |
|------------|--------|
| First paint | < 2 seconds on iPad |
| Editor interaction latency | < 16ms (60fps) |
| Export time (large map) | < 5 seconds |
| LocalStorage usage per map | < 500KB (JSON + thumbnail) |
| Total bundle size (no Realm Brew) | < 2MB |
| Offline capable | Yes (after first load via Service Worker) |
| Print quality | 300 DPI at 8.5×11" (150 DPI fallback on older iPads) |
