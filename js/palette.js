/* Magical Map Maker — Sidebar Palette UI */

class Palette {
  constructor(paletteEl, tileRenderer, onTileSelected) {
    this._el = paletteEl;
    this._listEl = paletteEl.querySelector('.palette-list');
    this._tileRenderer = tileRenderer;
    this._onTileSelected = onTileSelected;
    this._selectedId = null;
    this._tileIds = [];
  }

  /** Populate palette with tile previews for given tile IDs */
  populate(tileIds) {
    this._tileIds = tileIds;
    this._listEl.replaceChildren();

    for (const id of tileIds) {
      const type = this._tileRenderer.getType(id);
      if (!type) continue;

      const option = document.createElement('div');
      option.className = 'tile-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.setAttribute('aria-label', type.name);
      option.setAttribute('tabindex', '0');
      option.dataset.tileId = id;

      // Render preview canvas
      const preview = this._tileRenderer.getTileCanvas(id, 'square', 60);
      if (preview) {
        const displayCanvas = document.createElement('canvas');
        displayCanvas.width = 60;
        displayCanvas.height = 60;
        displayCanvas.setAttribute('aria-hidden', 'true');
        const dCtx = displayCanvas.getContext('2d');
        dCtx.drawImage(preview, 0, 0);
        option.appendChild(displayCanvas);
      }

      const nameEl = document.createElement('span');
      nameEl.className = 'tile-name';
      nameEl.textContent = type.name;
      option.appendChild(nameEl);

      option.addEventListener('click', () => this.select(id));
      option.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.select(id);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this._focusNext(option, 1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this._focusNext(option, -1);
        }
      });

      this._listEl.appendChild(option);
    }
  }

  select(tileId) {
    this._selectedId = tileId;

    const options = this._listEl.querySelectorAll('[role="option"]');
    options.forEach(opt => {
      opt.setAttribute('aria-selected', opt.dataset.tileId === tileId ? 'true' : 'false');
    });

    if (this._onTileSelected) {
      this._onTileSelected(tileId);
    }
  }

  getSelected() {
    return this._selectedId;
  }

  clearSelection() {
    this._selectedId = null;
    const options = this._listEl.querySelectorAll('[role="option"]');
    options.forEach(opt => opt.setAttribute('aria-selected', 'false'));
  }

  _focusNext(current, dir) {
    const options = Array.from(this._listEl.querySelectorAll('[role="option"]'));
    const idx = options.indexOf(current);
    const next = idx + dir;
    if (next >= 0 && next < options.length) {
      options[next].focus();
    }
  }

  destroy() {
    this._listEl.replaceChildren();
    this._selectedId = null;
  }
}
