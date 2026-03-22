/* Magical Map Maker — Sidebar Palette UI */

class Palette {
  constructor(paletteEl, tileRenderer, onTileSelected, shape) {
    this._el = paletteEl;
    this._listEl = paletteEl.querySelector('.palette-list');
    this._tileRenderer = tileRenderer;
    this._onTileSelected = onTileSelected;
    this._shape = shape || 'square';
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

      // Render preview canvas (clipped to shape)
      const previewSize = 60;
      const preview = this._tileRenderer.getTileCanvas(id, this._shape, previewSize);
      if (preview) {
        const displayCanvas = document.createElement('canvas');
        displayCanvas.width = previewSize;
        displayCanvas.height = previewSize;
        displayCanvas.setAttribute('aria-hidden', 'true');
        const dCtx = displayCanvas.getContext('2d');

        // Clip to shape preview
        this._clipPreview(dCtx, previewSize);
        dCtx.drawImage(preview, 0, 0, previewSize, previewSize);
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
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          this._focusNext(option, 1);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
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

  /** Clip preview canvas to shape outline */
  _clipPreview(ctx, size) {
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 2;

    switch (this._shape) {
      case 'hex': {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = Math.PI / 180 * (60 * i - 30);
          const vx = cx + r * Math.cos(angle);
          const vy = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(vx, vy);
          else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.clip();
        break;
      }
      case 'diamond': {
        ctx.beginPath();
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r, cy);
        ctx.closePath();
        ctx.clip();
        break;
      }
      case 'octagon': {
        const inset = r * 0.414; // 1/(1+sqrt(2))
        ctx.beginPath();
        ctx.moveTo(cx - r + inset, cy - r);
        ctx.lineTo(cx + r - inset, cy - r);
        ctx.lineTo(cx + r, cy - r + inset);
        ctx.lineTo(cx + r, cy + r - inset);
        ctx.lineTo(cx + r - inset, cy + r);
        ctx.lineTo(cx - r + inset, cy + r);
        ctx.lineTo(cx - r, cy + r - inset);
        ctx.lineTo(cx - r, cy - r + inset);
        ctx.closePath();
        ctx.clip();
        break;
      }
      // square: no clip needed
    }
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
