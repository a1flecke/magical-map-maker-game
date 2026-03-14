/* Magical Map Maker — Entry Point & Screen Routing */

/** HTML-escape helper to prevent XSS when interpolating into innerHTML */
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

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
    // Editor cleanup when leaving editor screen
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

    // Toggle body class for editor (prevents elastic scroll on iPad)
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

    // Size radio cards
    const sizeGroup = document.getElementById('size-selector');
    if (sizeGroup) {
      const options = sizeGroup.querySelectorAll('[role="radio"]');
      options.forEach(opt => {
        opt.addEventListener('click', () => {
          this._selectRadio(options, opt);
        });
        opt.addEventListener('keydown', (e) => {
          this._handleRadioKeydown(e, options);
        });
      });
    }

    // Create map button
    const createBtn = document.getElementById('btn-create-map');
    if (createBtn) {
      createBtn.addEventListener('click', () => this._createMap());
    }
  }

  _selectRadio(options, selected) {
    const optArr = Array.from(options);
    optArr.forEach(o => {
      const isSelected = o === selected;
      o.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      o.setAttribute('tabindex', isSelected ? '0' : '-1');
    });
  }

  _handleRadioKeydown(e, options) {
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
    }
  }

  _getSelectedSize() {
    const checked = document.querySelector('#size-selector [aria-checked="true"]');
    return checked ? checked.dataset.size : 'medium';
  }

  _getMapName() {
    const input = document.getElementById('map-name-input');
    return (input && input.value.trim()) || 'My Fantasy Map';
  }

  async _createMap() {
    const size = this._getSelectedSize();
    const name = this._getMapName();

    this.showScreen('editor');

    this._editor = new Editor({
      canvasEl: document.getElementById('map-canvas'),
      containerEl: document.querySelector('.canvas-container'),
      toolbarEl: document.querySelector('.editor-toolbar'),
      paletteEl: document.querySelector('.tile-palette'),
      themeId: 'fantasy-overworld',
      shape: 'square',
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
