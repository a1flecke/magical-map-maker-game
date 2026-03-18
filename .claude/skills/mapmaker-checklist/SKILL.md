---
name: mapmaker-checklist
description: Pre-implementation checklist for magical-map-maker sessions. Prints the coding rules most likely to cause bugs. Run this before writing any session code.
argument-hint:
disable-model-invocation: false
user-invocable: true
allowed-tools: Read
---

# Magical Map Maker — Pre-Session Checklist

Read and print the following checklist. This reminds you of the rules that cause the most bugs.

## Canvas Rules
- [ ] **Single RAF loop**: Only `editor.js` calls `requestAnimationFrame`. No other file.
- [ ] **Dirty flag**: Set `this._dirty = true` when state changes. Only redraw in the RAF callback when dirty.
- [ ] **Offscreen caching**: Procedural tiles render to offscreen canvas ONCE, then `drawImage()` from cache. Cache key: `${baseType}-${shape}-${cellSize}`.
- [ ] **DPR scaling**: `canvas.width = el.clientWidth * devicePixelRatio`. Then `ctx.scale(dpr, dpr)`.
- [ ] **Layer order**: Base tiles → overlays → grid lines → selection highlight.

## Input Rules
- [ ] **Pointer Events only**: `pointerdown`, `pointermove`, `pointerup`, `pointercancel`. Never `mousedown`/`touchstart`.
- [ ] **Placement on `pointerup`** (not pointerdown). Cancel if second pointer detected (pinch gesture).
- [ ] **touch-action: none** on canvas element.
- [ ] **setPointerCapture** on `pointerdown` for drag operations.
- [ ] **Clean up listeners** on screen exit. Track all listeners and remove them.

## Grid Math Rules
- [ ] **Hex grid**: Flat-top. **Round dimensions to whole pixels** (prevent sub-pixel gaps). Odd columns offset by `hexHeight / 2`. Nearest-hex for hit testing.
- [ ] **Isometric diamond**: 45° rotated squares. Rotate coords by -45° for pixel→grid. 4 neighbors (N/S/E/W).
- [ ] **Octagon grid**: Two cell types (oct + sq). Hit-test both. Save format includes `cellType` field.
- [ ] **Inverse property**: `gridToPixel(pixelToGrid(p))` must round-trip correctly.

## Data Rules
- [ ] **JSON IDs are kebab-case**: `"stone-floor"` not `"stoneFloor"`.
- [ ] **Theme references are bidirectional**: If base type lists theme, theme must list base type (and vice versa).
- [ ] **No duplicate IDs** in any data file.

## Accessibility Rules
- [ ] **Font**: OpenDyslexic via CDN `<link>`, Comic Sans fallback. Never also `@import` in CSS.
- [ ] **Viewport**: Never `user-scalable=no`.
- [ ] **Touch targets**: All interactive ≥ 44×44px.
- [ ] **Contrast**: Cream (#F5F0E8) background, dark (#2C2416) text, 4.5:1 minimum.
- [ ] **Palette**: `role="listbox"` + `role="option"` + `aria-selected`.
- [ ] **Shape/theme selectors**: `role="radiogroup"` + `role="radio"` + `aria-checked`. NOT `aria-pressed`.
- [ ] **Status**: `role="status"` for announcements. `role="alert"` for errors ONLY. Never `aria-live` + `aria-hidden` on same element.
- [ ] **Modals**: Focus trap + Escape + `aria-modal="true"`.

## Save/Export Rules
- [ ] **LocalStorage**: Always try/catch on `JSON.parse`. Check size before write.
- [ ] **Thumbnails**: JPEG 200×275px, quality 0.6.
- [ ] **PDF export**: 300 DPI, 8.5×11" page.
- [ ] **Blob cleanup**: Always `URL.revokeObjectURL()` after download.

## iPad Safari Rules
- [ ] **No AudioContext in constructors** — create lazily on first user gesture.
- [ ] **Body overflow hidden** on editor screen to prevent elastic scroll.
- [ ] **touch-action: manipulation** on buttons.
- [ ] **Safe area insets**: `env(safe-area-inset-*)`.

Print this checklist at the start of every session. Check off items as you implement them.
