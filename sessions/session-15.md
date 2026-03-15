# Session 15: Starter Templates + Name Generator + Tutorial

**Recommended Model:** sonnet
**Estimated Duration:** 3–4 hours
**Prerequisite:** Session 14 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

Pre-built starter maps reduce blank-canvas anxiety for young kids. Fantasy name generator and welcome tutorial improve first-time experience. Settings panel for customization. Auto-fill button for instant gratification.

---

## Deliverables

### 1. Starter Templates (`js/data/templates.json`)
- 2–3 pre-built maps per theme (18–27 total):
  - **Fantasy:** "Small Island" (6×8 square), "Forest Kingdom" (10×13 hex), "Mountain Pass" (6×8 diamond)
  - **Dungeon:** "Dungeon Entrance" (6×8 square), "Treasure Vault" (6×8 hex)
  - **Space:** "Star System" (10×13 hex), "Space Station" (6×8 square)
  - **Battlefields:** "River Crossing" (10×13 square), "Hilltop Fort" (6×8 hex)
  - **Jungle:** "Temple Ruins" (6×8 hex), "River Village" (10×13 square)
  - **Rivers:** "Delta Town" (10×13 hex), "Rapids Run" (6×8 square)
  - **Prairie:** "Frontier Settlement" (10×13 square), "Buffalo Plains" (6×8 hex)
  - **Mountains:** "Mountain Pass" (10×13 hex), "Alpine Village" (6×8 square)
  - **Continents:** "Island Archipelago" (10×13 hex), "Twin Kingdoms" (16×20 square)
- Each template: pre-filled grid cells + overlays, name, theme, shape, size
- Templates are read-only; loading one creates a new editable copy

### 2. Template Browser
- "Start from Template" button on setup screen (alongside "Blank Map")
- Grid of template cards with:
  - Rendered thumbnail (200×275px)
  - Template name, theme badge, shape icon
- Tap → creates new map from template, opens editor
- Cards use `role="listbox"` with `role="option"` items

### 3. Fantasy Name Generator
- "Random Name" button (🎲 icon) next to map name input on setup screen
- Theme-aware: generates names appropriate to selected theme
- **Fantasy:** "The Whispering Peaks", "Dragon's Hollow", "Starlight Valley"
- **Dungeon:** "The Forgotten Crypt", "Shadow's Labyrinth"
- **Space:** "Nebula Sigma-7", "The Void Expanse"
- **Battlefields:** "Crimson Field", "The Siege of Iron Hill"
- **Jungle:** "The Emerald Depths", "Serpent's Crossing"
- etc.
- Format patterns: `[The] [Adj] [Noun]`, `[Noun]'s [Noun]`, `[Adj] [Noun] of [Noun]`
- 20+ adjectives and 20+ nouns per theme

### 4. Random Terrain Fill ("Auto-Fill" Button)
- Toolbar button: "Auto-Fill" (magic wand icon)
- Populates all empty cells with theme-appropriate random tiles
- Weighted random: common tiles (grassland, ocean) more likely than rare (volcanic, oasis)
- Respects existing placed tiles (only fills empty cells)
- Creates a single undo entry
- Great for ADHD accommodation: instant map → customize from there

### 5. Welcome Tutorial
- First-time overlay (shown once, tracked in LocalStorage)
- 4 steps with pointing arrows:
  1. "Pick your tiles from the left" → highlight palette
  2. "Tap or drag to paint the map" → highlight canvas
  3. "Add details with overlays on the right" → highlight overlay palette
  4. "Save and export your creation!" → highlight toolbar
- "Got it!" button each step, "Skip" link
- Keyboard navigable, focus managed per step
- Re-triggerable from settings

### 6. Settings Panel
- Gear icon on title screen → accessible modal
- **Font size:** Small (16px) / Medium (18px) / Large (22px)
  - Applied via `document.documentElement.style.fontSize`
- **Sound effects:** On/Off toggle (for session 8 sounds)
- **Auto-save:** On/Off toggle (default On)
- **Grid lines default:** On/Off
- **Show coordinates:** On/Off
- **Show Tutorial Again** button
- Saved to LocalStorage: `magical-map-maker-settings`
- Loaded on app init, version field for migration

---

## Review Criteria

### Spec Reviewer
- [ ] 18–27 starter templates across all 9 themes
- [ ] Name generator is theme-aware
- [ ] Auto-fill populates only empty cells
- [ ] Tutorial is 4 steps per spec
- [ ] Settings: font size, sound, auto-save, grid, coordinates

### Game Map Maker Reviewer
- [ ] Templates look like real, interesting maps
- [ ] Templates work across multiple shapes/sizes
- [ ] Name generator produces fun, evocative names
- [ ] Auto-fill creates plausible-looking terrain (not just random noise)
- [ ] Tutorial clear for a 7-year-old
- [ ] A 15-year-old won't find templates too childish

### Web Developer Reviewer
- [ ] Templates stored as JSON, not JS objects
- [ ] Template loading creates a deep copy (no shared references)
- [ ] Font size via documentElement.style.fontSize
- [ ] Settings in separate LocalStorage key with version
- [ ] Tutorial state in LocalStorage
- [ ] Tutorial overlay has focus trap
- [ ] Auto-fill undo creates single grouped command
