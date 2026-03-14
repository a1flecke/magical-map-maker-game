# Session 11: Accessibility + iPad Optimization + Final Polish

**Recommended Model:** opus
**Estimated Duration:** 5 hours
**Prerequisite:** Session 10 complete. Run `/mapmaker-checklist` before starting.

---

## Goal

Full accessibility compliance, iPad-optimized touch experience, offline support via Service Worker, and final polish for kid-ready release (ages 7–15).

---

## Deliverables

### 1. Full Keyboard Navigation
- **Tab order:** Toolbar → Left palette → Canvas → Right palette → Properties panel
- **Toolbar:** Tab through buttons, Enter/Space to activate
- **Palette:** Arrow keys navigate options, Enter to select
- **Canvas:** Arrow keys move selection cursor, Enter to place, Delete to clear
- **Focus visible:** 3px solid focus ring (theme accent color)
- **Skip link:** "Skip to map editor" (hidden until focused)

### 2. Screen Reader Support
- Canvas: `role="application"` with descriptive `aria-label`
- Status region announces: "Tile placed: Grassland at column 3, row 5", "Map saved", "Eraser mode active"
- Palette items: `role="option"` with `aria-label` = tile/overlay name
- Tool buttons: `aria-label` matching function
- Grid toggle: `aria-pressed`

### 3. WCAG AA Contrast Audit
- Audit all 9 theme color palettes
- All text on backgrounds ≥ 4.5:1 ratio
- Fix failures by adjusting text darkness or background lightness
- Document final ratios in `themes.css` comment block

### 4. Touch Target Audit
- All buttons ≥ 44×44px
- Spacing between adjacent buttons ≥ 8px
- Palette tiles: 44×44px minimum tap area

### 5. iPad Safari Optimization
- **Elastic scroll prevention:** `body { overflow: hidden; position: fixed; }` on editor
- **Double-tap zoom:** `touch-action: manipulation` on buttons
- **Safe area insets:** `padding: env(safe-area-inset-*)` on main container
- **Canvas:** `touch-action: none` verified
- **Viewport:** `width=device-width, initial-scale=1` (no user-scalable=no)

### 6. Responsive Layout
- **iPad landscape:** Both sidebars visible, canvas takes remaining space
- **iPad portrait:** Sidebars become tabbed bottom drawer (swipe up)
- **Desktop widescreen:** Wider sidebars with larger tile previews
- **Breakpoints:** 768px (portrait), 1024px (desktop)
- CSS Grid areas adapt per breakpoint

### 7. `devicePixelRatio` Change Handling
- `matchMedia` listener for DPR changes (display switching on macOS)
- Re-size canvas, invalidate tile cache

### 8. Loading & Error States
- Skeleton CSS (no-JS fallback for initial load)
- Theme loading spinner
- Save error toast: `role="status"`
- Export error toast: `role="alert"` (this is an actual error)
- Corrupt save recovery dialog

### 9. Toast Notifications
- Appear at bottom, auto-dismiss after 3 seconds
- `role="status"` for informational (saved, exported)
- `role="alert"` for errors only
- Accessible: announced by screen readers
- Timer cleared on dismiss

### 10. Service Worker for Offline Support
- `sw.js` at root
- Cache: `index.html`, all CSS, all JS, SVG sprite sheet, jsPDF, OpenDyslexic font
- Strategy: cache-first for assets, network-first for data files
- Register in `app.js` on init
- Update notification when new version available

### 11. Final Performance Profiling
- 60fps during: tile placement on 320-cell grid, pan/zoom, palette scroll
- Canvas memory: no leaks after switching themes 10+ times
- LocalStorage: saves < 100ms
- Export: large map < 5s

### 12. Final QA Checklist
- [ ] All 9 themes load correctly
- [ ] All 4 grid shapes render and interact correctly
- [ ] All 3 sizes work for all shapes
- [ ] All 100 base tiles render distinctly
- [ ] All ~223 overlay SVG icons render and place correctly
- [ ] Save, load, delete, rename, duplicate all work
- [ ] Version migration loads old saves correctly
- [ ] Export PDF, PNG, JPEG all produce correct output
- [ ] iPad canvas DPI fallback works
- [ ] Print produces clean single-page output
- [ ] Undo/redo for all operations
- [ ] Eraser, fill, brush sizes, auto-fill all work
- [ ] Drag-to-paint across all shapes
- [ ] Keyboard shortcuts all function
- [ ] VoiceOver announces placements and status
- [ ] All touch targets ≥ 44×44px
- [ ] All contrast ratios ≥ 4.5:1
- [ ] iPad Safari: no elastic scroll, proper touch
- [ ] Templates load and create editable copies
- [ ] Name generator produces appropriate names
- [ ] Tutorial displays and dismisses correctly
- [ ] Settings persist across sessions
- [ ] Realm Brew detection and fallback both work
- [ ] Offline: app works after caching
- [ ] No console errors in Safari

---

## Review Criteria

### Spec Reviewer
- [ ] All spec §11 accessibility requirements met
- [ ] Responsive layout for iPad portrait/landscape
- [ ] Service Worker for offline capability
- [ ] All NFRs (spec §14) met

### Game Map Maker Reviewer
- [ ] Overall experience polished and delightful
- [ ] No confusing dead ends or unclear states
- [ ] Works for both 7-year-olds and 15-year-olds
- [ ] Print output looks like a real map

### Web Developer Reviewer
- [ ] Font size via documentElement.style.fontSize
- [ ] Service Worker caching strategy correct
- [ ] Toast role="status" vs role="alert" correct
- [ ] No user-scalable=no
- [ ] Safe area insets
- [ ] Focus trap on all modals
- [ ] DPR change listener
- [ ] Performance: 60fps verified
- [ ] Memory: no canvas leaks
- [ ] Z-index stacking context documented
