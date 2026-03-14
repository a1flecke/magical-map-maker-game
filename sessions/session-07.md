# Session 7: Realm Brew Asset Integration

**Recommended Model:** opus
**Estimated Duration:** 4–5 hours
**Prerequisite:** Session 6 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

Integrate Realm Brew hand-drawn PNG tiles and overlays for enhanced Dungeon/Cavern themes. Graceful fallback when assets aren't present.

---

## Deliverables

### 1. Asset Loader (`js/realm-brew.js`)
- `RealmBrewLoader` class
- `detectAssets()` — probe for Realm Brew files via `fetch()` HEAD requests
  - Check for `assets/realm-brew/tiles/man-hewn-dungeons/` existence
  - Set `this.available = true/false`
- `loadTileSet(theme)` — load all tiles for a sub-theme, return Image objects
- `loadOverlaySet(pack)` — load all overlays for a pack
- Asset manifest: hardcoded list of filenames per directory (since we can't directory-list on static hosting)
- Lazy loading: only load tiles when Dungeon theme is selected
- Loading progress callback for UI

### 2. Tile Set Manifest
- `js/data/realm-brew-manifest.json` — lists all filenames per directory:
```json
{
  "tiles": {
    "man-hewn-dungeons": ["RB Man Hewn Dungeons - Digital Tiles_01.png", ...],
    "subterranean-rivers": ["Subterranean Rivers - Digital Tiles_01.png", ...],
    "underdark-caverns": ["Realm Brew Underdark Caverns - Digital Tiles_01.png", ...]
  },
  "overlays": {
    "man-hewn-dungeons": ["Archway 1.png", "Archway 2.png", ...],
    "subterranean-rivers": ["Driftwood 1.png", ...],
    "underdark-caverns": ["Cliff 1.png", ...],
    "alchemists-workshop": ["Bedroom - Bed.png", ...],
    "goblins-hideout": ["Armoury (Armour) 1.png", ...],
    "red-dragons-lair": ["Dragon Bones (Body).png", ...]
  }
}
```

### 3. Tile Resize Pipeline
- Realm Brew tiles are 1200×1039px (hex-shaped, pointy-top)
- On load, resize to grid cell size using offscreen canvas
- Cache resized tiles: key = `rb-${theme}-${filename}-${cellSize}`
- For export: resize to 300 DPI cell size (larger cache, cleared after export)
- Use `ctx.drawImage(img, 0, 0, targetWidth, targetHeight)` for bilinear resize

### 4. Dungeon Theme Enhancement
- When Realm Brew available + hex shape selected:
  - Replace procedural dungeon tiles with Realm Brew tiles in palette
  - Show all 37 Man Hewn Dungeon tiles as palette options
  - Tile names derived from filename (strip prefix, number, extension)
- When Realm Brew available + non-hex shape:
  - Keep procedural tiles (Realm Brew are hex-shaped, don't work in square/tri/oct)
  - Show note: "Hand-drawn tiles available with hexagon grid"

### 5. Dungeon Sub-Theme Selector
- When Dungeon theme selected and Realm Brew available:
  - Show sub-theme chooser: "Man Hewn Dungeons", "Subterranean Rivers", "Underdark Caverns"
  - Each sub-theme swaps the tile palette to its tile set
  - Default to Man Hewn Dungeons
- Sub-theme selector appears below the theme selector on setup screen (only for Dungeon)

### 6. Realm Brew Overlay Packs
- 6 overlay packs integrated as palette categories:
  - Man Hewn Dungeons (66): archways, bridges, doors, pillars, etc.
  - Subterranean Rivers (30): waterfalls, rapids, rocks, etc.
  - Underdark Caverns (35): cliffs, crevasses, rocks, etc.
  - Alchemists' Workshop (62): bedroom, lab, library, observatory items
  - Goblins' Hideout (62): armory, camp, crafting, kitchen, traps
  - Red Dragon's Lair (37): dragon bones, eggs, gold, lava features
- Each pack appears as a collapsible section in the overlay palette
- Overlay names parsed from filenames (e.g., "Bridge (Broken) 1" → "Bridge Broken 1")

### 7. Fallback Mode
- When Realm Brew not detected:
  - Dungeon theme uses procedural tiles (already implemented in session 4)
  - No sub-theme selector shown
  - No Realm Brew overlay packs in palette
  - No error messages — seamless degradation
- Asset detection runs once on app init, result cached

### 8. Loading States
- "Loading tiles..." overlay when switching to Realm Brew sub-theme
- Progress bar showing tiles loaded / total
- Cancel button to abort loading and fall back to procedural

### 9. Copy Script
- `scripts/setup-realm-brew.sh` — bash script to copy from Downloads location
- Renames files to cleaner names during copy
- Verifies file counts after copy

---

## Review Criteria

### Spec Reviewer
- [ ] Realm Brew tiles appear in Dungeon theme palette (hex shape only)
- [ ] 3 sub-themes: Man Hewn, Subterranean Rivers, Underdark Caverns
- [ ] 6 overlay packs accessible
- [ ] Fallback to procedural tiles works
- [ ] Assets not in git (gitignored)

### Game Map Maker Reviewer
- [ ] Realm Brew tiles look great at grid cell size (no blurring)
- [ ] Tiles tile seamlessly in hex grid (edges align)
- [ ] Overlay PNGs positioned correctly on tiles
- [ ] Sub-theme switching is smooth
- [ ] Palette organization is intuitive (not overwhelming with 60+ overlays)

### Web Developer Reviewer
- [ ] Asset detection via HEAD fetch (not 404 errors in console)
- [ ] Tile resize uses offscreen canvas (not CSS scaling)
- [ ] Memory management: resize cache cleared on theme change
- [ ] Lazy loading: only loads selected sub-theme
- [ ] No CORS issues (same-origin static files)
- [ ] Manifest JSON file for static-hosted directory listing
- [ ] Loading progress doesn't block main thread
