# Session 13: Undo/Redo + Editor Polish

**Recommended Model:** sonnet
**Estimated Duration:** 4 hours
**Prerequisite:** Session 12 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

Full undo/redo system, eraser tool, keyboard shortcuts, tile rotation/flip, and sound effects. The fill tool and drag-to-paint already exist from Session 1 — this session adds undo support for all existing operations plus new editing tools.

---

## Deliverables

### 1. History Manager (`js/history.js`)
- `HistoryManager` class using command pattern
- Command types:
  - `PlaceTile { col, row, cellType?, oldBase, newBase }`
  - `PlaceOverlay { col, row, overlay }`
  - `RemoveOverlay { col, row, overlayIndex, overlay }`
  - `ClearCell { col, row, oldBase, oldOverlays }`
  - `FillTiles { cells: [{col, row, oldBase, newBase}, ...] }` — single undo for fill
  - `PaintTiles { cells: [{col, row, oldBase, newBase}, ...] }` — single undo for drag-paint stroke
  - `RotateOverlay { col, row, overlayIndex, oldRotation, newRotation }`
  - `AutoFill { cells: [...] }` — single undo for random auto-fill (session 10)
- Max 50 undo steps, unlimited redo
- Undo/redo button states update (disabled when stack empty)

### 2. Keyboard Shortcuts
- `Cmd+Z` / `Ctrl+Z` — undo
- `Cmd+Shift+Z` / `Ctrl+Shift+Z` — redo
- `Cmd+S` / `Ctrl+S` — save (prevent default browser save)
- `E` — toggle eraser mode
- `F` — toggle fill mode (already exists, ensure shortcut works)
- `G` — toggle grid lines
- `P` — toggle pan mode
- `R` — rotate selected overlay 90° clockwise
- `[` / `]` — zoom out / in
- `1`–`9` — quick palette selection (first 9 tiles)
- `?` — show keyboard shortcuts overlay
- `Delete` / `Backspace` — clear selected cell

### 3. Eraser Tool
- Toolbar toggle button (eraser icon)
- When active: cursor changes to eraser indicator
- Tap cell → removes base tile and all overlays
- Drag → erase multiple cells
- Each drag stroke is a single undo command (grouped)
- `E` key toggles

### 4. Tile Rotation (Pre-Placement)
- Rotation control in toolbar: 0°, 90°, 180°, 270° cycle button
- Applied to next placed tile
- Palette preview rotates to show current orientation
- `R` key cycles rotation

### 5. Tile Flip
- Horizontal flip and Vertical flip buttons in toolbar
- Applies to selected cell or next placement
- Stored in cell data: `flipH`, `flipV`

### 6. "Clear All" Confirmation
- Toolbar button → accessible modal dialog
- Single undo command with all prior state

### 7. Keyboard Shortcuts Overlay
- `?` key shows modal with all shortcuts
- 2-column table grouped by: Navigation, Editing, Tools, General
- Accessible modal (focus trap, Escape)

### 8. Sound Effects (Web Audio API)
- Created lazily on first user gesture (iPad Safari requirement)
- Sounds:
  - Tile place: soft "thunk"
  - Overlay place: light "chime"
  - Erase: soft "whoosh"
  - Undo: "click"
  - Fill complete: "cascade" sound
- All synthesized via Web Audio (no audio files)
- Respects sound toggle in settings (session 10)
- Muted by default (opt-in via settings)

### 9. UI Polish
- Toolbar tooltips (title + custom CSS, long-press on iPad)
- Selection highlight: subtle pulsing border (CSS animation)
- Tool mode indicators in toolbar (highlighted active tool)
- Smooth zoom transitions (lerp over 200ms via RAF)

---

## Review Criteria

### Spec Reviewer
- [ ] Undo up to 50 steps for all operation types
- [ ] Redo works after undo
- [ ] Eraser clears cells, drag works
- [ ] Keyboard shortcuts complete
- [ ] Sound effects via Web Audio

### Game Map Maker Reviewer
- [ ] Undo/redo correctly restores visual state
- [ ] Eraser drag is smooth
- [ ] Sounds are pleasant and not annoying
- [ ] Tool modes clearly indicated

### Web Developer Reviewer
- [ ] Command pattern: each command reversible
- [ ] Grouped operations (erase drag, fill, paint stroke) are single undo entries
- [ ] Keyboard shortcuts don't conflict with browser defaults
- [ ] Cmd+S prevents default
- [ ] AudioContext created lazily in gesture handler
- [ ] Sound toggle checked before playing
- [ ] No timer leaks from tooltip timeouts
- [ ] Undo stack stores minimal data (not full snapshots)
