# CLAUDE.md — Magical Map Maker

## Project Overview

Browser-based map building game for kids ages 7–15 with dyslexia/ADHD accommodations. Users pick a theme, piece shape, and size, then drag-and-drop terrain tiles and overlays onto a grid to create printable maps. Maps can be exported as PDF, PNG, or JPEG for printing on 8.5×11" paper.

## Tech Stack

- **Vanilla JavaScript (ES6+)**, HTML5 Canvas, CSS3 — no frameworks, no bundlers, no npm
- **HTML5 Canvas** for map grid rendering and tile drawing
- **Pointer Events API** for unified mouse/touch/pen input
- **LocalStorage** for save data
- **jsPDF** (bundled locally, ~250KB) for PDF export
- Runs directly in browser with no build step

## Target Platforms

- iPadOS Safari (primary) — touch + optional keyboard
- macOS Safari/Chrome (secondary) — mouse + keyboard
- 60fps minimum during editor interaction

## Development Workflow

No build, lint, or test step. Edit files directly and commit.

**Deployment:** Pushing to `main` triggers `.github/workflows/deploy.yml` which deploys to GitHub Pages.

**Live site:** https://a1flecke.github.io/magical-map-maker-game/

## Verification Workflows

| When | Skill | What it checks |
|------|-------|----------------|
| Before starting any session | `/mapmaker-checklist` | Pre-session coding rules checklist |
| After editing any `js/data/*.json` | `/validate-map-data` | Schema integrity, referential consistency |

PostToolUse hooks run automatically after each Edit/Write:
- Data JSON validator (`js/data/*.json` files)

## File Structure

```
index.html                    Main game page
css/
  style.css                   Core layout and UI
  editor.css                  Map editor styles
  themes.css                  Theme color palettes
  print.css                   Print-optimized styles
js/
  app.js                      Entry point, screen routing
  editor.js                   Editor state machine, RAF loop owner
  grid.js                     Grid rendering (square/hex/diamond/oct)
  tiles.js                    Tile definitions, procedural rendering
  overlays.js                 Overlay definitions and rendering
  palette.js                  Sidebar palette UI
  input.js                    Pointer events, keyboard
  camera.js                   Pan, zoom, coordinate transforms
  history.js                  Undo/redo stack
  storage.js                  LocalStorage save/load
  export.js                   PDF/PNG/JPEG export
  themes.js                   Theme definitions
  data/
    base-types.json           110 base tile type definitions
    overlays.json             ~225 overlay definitions
    themes.json               9 theme definitions
    templates.json            18-27 starter map templates
assets/
  realm-brew/                 .gitignored — optional Realm Brew PNGs
  icons/                      UI icons (SVG)
```

## Architecture

- **Single RAF loop:** `editor.js` owns the `requestAnimationFrame` chain. No other file calls RAF.
- **Dirty-flag rendering:** Canvas redraws only when `_dirty = true`.
- **Offscreen tile cache:** Procedural tiles render once to offscreen canvases, then `drawImage()` from cache.
- **Pointer Events:** All input via `pointerdown/move/up/cancel`. Never `mousedown/touchstart`.
- **Grid shapes:** 4 coordinate systems (square, hex, isometric diamond, octagon) in `grid.js`.
- **Overlay icons:** SVG sprite sheet (`assets/icons/overlays.svg`) rendered to canvas, not individual Canvas drawing functions.
- **Gesture disambiguation:** Tile placement fires on `pointerup`, cancelled if second pointer detected (pinch).
- **110 base types**, ~225 overlays (55 universal), 9 themes.

See `.claude/rules/magical-map-maker.md` for detailed architecture rules.

## Accessibility Requirements (Non-Negotiable)

- **Font:** OpenDyslexic via CDN `<link>`, Comic Sans MS fallback, minimum 16pt, 1.5× line height
- **Colors:** Cream background (#F5F0E8), dark text (#2C2416), WCAG AA contrast (4.5:1 min)
- **Touch targets:** 44×44px minimum on all interactive elements
- **No flashing/strobing effects**
- **No countdown timers visible by default**
- **Keyboard:** Full editor usable via keyboard
- **Screen reader:** ARIA labels on all interactive elements
- **Viewport:** Never `user-scalable=no`

## HTML/JS Coding Standards

- **Font loading:** `<link rel="stylesheet">` in HTML only — never `@import` in CSS
- **innerHTML:** Always HTML-escape interpolated values with `escHtml()` helper
- **Modals:** `role="dialog"` + `aria-modal="true"` + focus trap + Escape to close
- **Visibility toggles:** CSS classes (`.active`, `.open`, `.hidden`) — never `style.display`
- **Timer lifecycle:** Track all timer IDs, clear in `cancel()` method, null-guard callbacks
- **Pointer Events:** Use `pointerdown/move/up/cancel` — never mouse/touch events directly
- **Canvas DPR:** `canvas.width = el.clientWidth * devicePixelRatio; ctx.scale(dpr, dpr)`

## Realm Brew Assets

Optional hand-drawn hex tiles from Realm Brew Kickstarter bundle. NOT in git (too large + licensed).
- Place in `assets/realm-brew/` following the README instructions
- Game auto-detects their presence and enables enhanced Dungeon tiles
- Without them, Dungeon theme uses procedural (Canvas-drawn) tiles
