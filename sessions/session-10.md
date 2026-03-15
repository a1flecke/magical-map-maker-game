# Session 10: Save/Load System

**Recommended Model:** sonnet
**Estimated Duration:** 3–4 hours
**Prerequisite:** Session 9 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

Save maps to LocalStorage and load them from a "My Maps" gallery. Auto-save during editing. Save format versioning for forward compatibility.

---

## Deliverables

### 1. Storage Manager (`js/storage.js`)
- `StorageManager` class
- Save key: `magical-map-maker-saves`
- Methods: `saveMap()`, `loadMap(id)`, `listMaps()`, `deleteMap(id)`, `duplicateMap(id)`, `renameMap(id, name)`, `getStorageUsage()`
- All `JSON.parse` in try/catch
- Size check before save: warn if > 4MB total usage
- Also warn at 10 maps regardless of size

### 2. Save Format (per spec §10.2)
- Includes `cellType` field for octagon grids
- Overlays as array of objects: `{ id, rotation, opacity, size }`
- `version: 1` field
- **Version migration:** On load, check version. Add missing fields with defaults (rotation=0, flipH=false, flipV=false, opacity=1.0, size="medium"). This ensures maps saved before session 8/9 features load correctly.

### 3. UUID via `crypto.getRandomValues()`

### 4. Thumbnail Generation
- Render map to 200×275px offscreen canvas
- JPEG data URL at quality 0.6
- Updated on every save

### 5. Auto-Save
- `setInterval` every 30s, only saves if dirty
- Timer cleared on editor exit (timer lifecycle pattern)
- Brief "Saved" in status bar (`role="status"`)

### 6. Manual Save: Cmd+S / toolbar button

### 7. My Maps Screen
- Grid of map thumbnail cards (responsive)
- Card: thumbnail, name, theme badge, date, shape icon
- Tap → load in editor
- Context menu: Rename, Duplicate, Delete
- Delete confirmation (accessible modal, focus trap, Escape)
- Empty state: "No maps yet!"

### 8. Rename Dialog (accessible modal)

### 9. Editor Updates
- Auto-save on "Create Map" and "Back"
- Map name editable inline in toolbar
- Editor loads from StorageManager when opening saved map

### 10. Quota Warning
- Based on `getStorageUsage()` bytes (> 4MB)
- Also based on count (> 10 maps)
- Warning banner on My Maps screen

---

## Review Criteria

### Spec Reviewer
- [ ] Save format matches spec §10.2 (with cellType, overlay objects, version)
- [ ] Auto-save every 30s
- [ ] Both quota triggers (bytes + count)

### Game Map Maker Reviewer
- [ ] Thumbnails recognizable at small size
- [ ] Loading restores map exactly

### Web Developer Reviewer
- [ ] JSON.parse in try/catch
- [ ] Size check before save
- [ ] Timer cleared on exit
- [ ] UUID via crypto.getRandomValues
- [ ] Version migration on load
- [ ] Delete modal is accessible
