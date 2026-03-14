/* Magical Map Maker — Entry Point & Screen Routing */

/** HTML-escape helper to prevent XSS when interpolating into innerHTML */
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/** Size estimate labels per shape */
const SIZE_LABELS = {
  square: {
    small:  '8 \u00d7 6 (48 pieces)',
    medium: '13 \u00d7 10 (130 pieces)',
    large:  '20 \u00d7 16 (320 pieces)'
  },
  hex: {
    small:  '7 \u00d7 6 (~42 hexes)',
    medium: '11 \u00d7 10 (~110 hexes)',
    large:  '18 \u00d7 15 (~270 hexes)'
  },
  diamond: {
    small:  '8 \u00d7 7 (~56 diamonds)',
    medium: '13 \u00d7 10 (~130 diamonds)',
    large:  '20 \u00d7 16 (~320 diamonds)'
  },
  octagon: {
    small:  '7 \u00d7 6 (~72 pieces)',
    medium: '11 \u00d7 9 (~179 pieces)',
    large:  '18 \u00d7 14 (~473 pieces)'
  }
};

class App {
  constructor() {
    this._screens = {};
    this._currentScreen = null;
    this._editor = null;
    this._statusEl = null;
  }

  init() {
    this._statusEl = document.getElementById('status-message');
    this._screens = {
      title: document.getElementById('title-screen'),
      setup: document.getElementById('setup-screen'),
      editor: document.getElementById('editor-screen')
    };

    this._bindTitleScreen();
    this._bindSetupScreen();

    this.showScreen('title');
  }

  showScreen(name) {
    if (this._currentScreen === 'editor' && name !== 'editor' && this._editor) {
      this._editor.destroy();
      this._editor = null;
    }

    for (const [key, el] of Object.entries(this._screens)) {
      if (key === name) {
        el.classList.add('active');
        el.removeAttribute('aria-hidden');
      } else {
        el.classList.remove('active');
        el.setAttribute('aria-hidden', 'true');
      }
    }

    document.body.classList.toggle('editor-active', name === 'editor');
    this._currentScreen = name;
  }

  announce(message) {
    if (this._statusEl) {
      this._statusEl.textContent = message;
    }
  }

  /* ---- Title Screen ---- */
  _bindTitleScreen() {
    const newMapBtn = document.getElementById('btn-new-map');
    if (newMapBtn) {
      newMapBtn.addEventListener('click', () => this.showScreen('setup'));
    }
  }

  /* ---- Setup Screen ---- */
  _bindSetupScreen() {
    const backBtn = document.getElementById('btn-setup-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.showScreen('title'));
    }

    // Shape radio cards
    this._bindRadioGroup('shape-selector', () => this._updateSizeLabels());

    // Size radio cards
    this._bindRadioGroup('size-selector');

    // Create map button
    const createBtn = document.getElementById('btn-create-map');
    if (createBtn) {
      createBtn.addEventListener('click', () => this._createMap());
    }
  }

  _bindRadioGroup(groupId, onChange) {
    const group = document.getElementById(groupId);
    if (!group) return;
    const options = group.querySelectorAll('[role="radio"]');
    options.forEach(opt => {
      opt.addEventListener('click', () => {
        this._selectRadio(options, opt);
        if (onChange) onChange();
      });
      opt.addEventListener('keydown', (e) => {
        this._handleRadioKeydown(e, options, onChange);
      });
    });
  }

  _selectRadio(options, selected) {
    const optArr = Array.from(options);
    optArr.forEach(o => {
      const isSelected = o === selected;
      o.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      o.setAttribute('tabindex', isSelected ? '0' : '-1');
    });
  }

  _handleRadioKeydown(e, options, onChange) {
    const optArr = Array.from(options);
    const idx = optArr.indexOf(e.target);
    let next = -1;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      next = (idx + 1) % optArr.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      next = (idx - 1 + optArr.length) % optArr.length;
    }

    if (next >= 0) {
      this._selectRadio(optArr, optArr[next]);
      optArr[next].focus();
      if (onChange) onChange();
    }
  }

  _getSelectedShape() {
    const checked = document.querySelector('#shape-selector [aria-checked="true"]');
    return checked ? checked.dataset.shape : 'square';
  }

  _getSelectedSize() {
    const checked = document.querySelector('#size-selector [aria-checked="true"]');
    return checked ? checked.dataset.size : 'medium';
  }

  _getMapName() {
    const input = document.getElementById('map-name-input');
    return (input && input.value.trim()) || 'My Fantasy Map';
  }

  /** Update size detail labels when shape changes */
  _updateSizeLabels() {
    const shape = this._getSelectedShape();
    const labels = SIZE_LABELS[shape] || SIZE_LABELS.square;
    const sizeCards = document.querySelectorAll('#size-selector [role="radio"]');
    sizeCards.forEach(card => {
      const sizeKey = card.dataset.size;
      const detailEl = card.querySelector('.size-detail');
      if (detailEl && labels[sizeKey]) {
        detailEl.textContent = labels[sizeKey];
      }
    });
  }

  async _createMap() {
    const shape = this._getSelectedShape();
    const size = this._getSelectedSize();
    const name = this._getMapName();

    this.showScreen('editor');

    this._editor = new Editor({
      canvasEl: document.getElementById('map-canvas'),
      containerEl: document.querySelector('.canvas-container'),
      toolbarEl: document.querySelector('.editor-toolbar'),
      paletteEl: document.querySelector('.tile-palette'),
      themeId: 'fantasy-overworld',
      shape: shape,
      size: size,
      mapName: name,
      app: this
    });

    try {
      await this._editor.init();
      this.announce('Map editor ready. Select a tile from the palette to begin painting.');
    } catch (err) {
      this.announce('Failed to load map editor. Please refresh and try again.');
      console.error('Editor init failed:', err);
    }
  }
}

// Boot
window.app = new App();
window.app.init();
