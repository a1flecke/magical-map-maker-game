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

/** Shape icons for display */
const SHAPE_ICONS = {
  square: '\u25A0',
  hex: '\u2B23',
  diamond: '\u25C6',
  octagon: '\u2BC2'
};

class App {
  constructor() {
    this._screens = {};
    this._currentScreen = null;
    this._editor = null;
    this._statusEl = null;
    this._storage = new StorageManager();
    this._settings = new SettingsManager();
    this._realmBrew = new RealmBrewLoader();
    this._pendingDeleteId = null;
    this._pendingRenameId = null;
    this._templates = null;
    this._tutorial = null;
  }

  async init() {
    this._statusEl = document.getElementById('status-message');
    this._screens = {
      title: document.getElementById('title-screen'),
      mymaps: document.getElementById('mymaps-screen'),
      setup: document.getElementById('setup-screen'),
      editor: document.getElementById('editor-screen')
    };

    // Load settings (applies font size)
    this._settings.load();

    this._bindTitleScreen();
    this._bindSetupScreen();
    this._bindMyMapsScreen();
    this._bindSettingsModal();
    this._bindTemplateModal();

    // Detect Realm Brew assets (non-blocking)
    this._realmBrew.detect().catch(e => console.warn('Realm Brew detect:', e));

    // Pre-load templates (non-blocking)
    this._loadTemplates();

    this.showScreen('title');
  }

  showScreen(name) {
    if (this._currentScreen === 'editor' && name !== 'editor' && this._editor) {
      // Auto-save before leaving editor
      this._autoSaveEditor();
      this._editor.destroy();
      this._editor = null;
      // Clean up tutorial if active
      if (this._tutorialTimerId) { clearTimeout(this._tutorialTimerId); this._tutorialTimerId = null; }
      if (this._tutorial) this._tutorial.destroy();
      // Clean up any open modal escape handlers
      if (this._settingsEscHandler) { document.removeEventListener('keydown', this._settingsEscHandler); this._settingsEscHandler = null; }
      if (this._templateEscHandler) { document.removeEventListener('keydown', this._templateEscHandler); this._templateEscHandler = null; }
    }
    // Clean up My Maps escape handler when leaving mymaps screen
    if (this._currentScreen === 'mymaps' && name !== 'mymaps' && this._myMapsEscHandler) {
      document.removeEventListener('keydown', this._myMapsEscHandler);
      this._myMapsEscHandler = null;
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

    if (name === 'mymaps') {
      this._renderMyMaps();
    }
  }

  announce(message, isError = false) {
    if (isError) {
      const errorEl = document.getElementById('error-message');
      if (errorEl) errorEl.textContent = message;
    } else {
      if (this._statusEl) {
        this._statusEl.textContent = message;
      }
    }
  }

  /* ---- Title Screen ---- */
  _bindTitleScreen() {
    const newMapBtn = document.getElementById('btn-new-map');
    if (newMapBtn) {
      newMapBtn.addEventListener('click', () => this.showScreen('setup'));
    }
    const myMapsBtn = document.getElementById('btn-my-maps');
    if (myMapsBtn) {
      myMapsBtn.addEventListener('click', () => this.showScreen('mymaps'));
    }
    const settingsBtn = document.getElementById('btn-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this._openSettingsModal());
    }
  }

  /* ---- Setup Screen ---- */
  _bindSetupScreen() {
    const backBtn = document.getElementById('btn-setup-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.showScreen('title'));
    }

    // Theme radio cards — update map name placeholder on theme change + sub-theme visibility
    this._bindRadioGroup('theme-selector', () => {
      this._updateMapNamePlaceholder();
      this._updateSubThemeVisibility();
    });

    // Shape radio cards
    this._bindRadioGroup('shape-selector', () => {
      this._updateSizeLabels();
      this._updateSubThemeVisibility();
    });

    // Size radio cards
    this._bindRadioGroup('size-selector');

    // Sub-theme radio cards
    this._bindRadioGroup('subtheme-selector');

    // Create map button
    const createBtn = document.getElementById('btn-create-map');
    if (createBtn) {
      createBtn.addEventListener('click', () => this._createMap());
    }

    // Random Name button
    const randomNameBtn = document.getElementById('btn-random-name');
    if (randomNameBtn) {
      randomNameBtn.addEventListener('click', () => {
        const themeId = this._getSelectedTheme();
        const input = document.getElementById('map-name-input');
        if (input) {
          input.value = NameGenerator.generate(themeId);
        }
      });
    }

    // Template button
    const templateBtn = document.getElementById('btn-from-template');
    if (templateBtn) {
      templateBtn.addEventListener('click', () => this._openTemplateModal());
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

  _getSelectedTheme() {
    const checked = document.querySelector('#theme-selector [aria-checked="true"]');
    return checked ? checked.dataset.theme : 'fantasy-overworld';
  }

  _getThemeDisplayName() {
    const checked = document.querySelector('#theme-selector [aria-checked="true"]');
    if (!checked) return 'Fantasy';
    const nameEl = checked.querySelector('.theme-name');
    return nameEl ? nameEl.textContent.trim() : 'Fantasy';
  }

  _getMapName() {
    const input = document.getElementById('map-name-input');
    if (input && input.value.trim()) return input.value.trim();
    return 'My ' + this._getThemeDisplayName() + ' Map';
  }

  _updateMapNamePlaceholder() {
    const input = document.getElementById('map-name-input');
    if (input) {
      input.placeholder = 'My ' + this._getThemeDisplayName() + ' Map';
    }
  }

  /** Show/hide sub-theme selector based on theme and Realm Brew availability */
  _updateSubThemeVisibility() {
    const section = document.getElementById('rb-subtheme-section');
    const hexNote = document.getElementById('rb-hex-note');
    if (!section) return;

    const theme = this._getSelectedTheme();
    const shape = this._getSelectedShape();

    if (theme === 'dungeon' && this._realmBrew.available) {
      section.classList.remove('hidden');
      // Show note if non-hex shape selected
      if (hexNote) {
        hexNote.classList.toggle('hidden', shape === 'hex');
      }
    } else {
      section.classList.add('hidden');
    }
  }

  _getSelectedSubTheme() {
    const checked = document.querySelector('#subtheme-selector [aria-checked="true"]');
    return checked ? checked.dataset.subtheme : 'man-hewn-dungeons';
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

  async _createMap(templateData) {
    const shape = templateData ? templateData.shape : this._getSelectedShape();
    const size = templateData ? templateData.size : this._getSelectedSize();
    const name = templateData ? templateData.name : this._getMapName();
    const themeId = templateData ? templateData.theme : this._getSelectedTheme();

    this.showScreen('editor');

    const rbSubTheme = (themeId === 'dungeon' && this._realmBrew.available && shape === 'hex')
      ? this._getSelectedSubTheme() : null;

    // If loading from template, convert template cells to savedCells format
    const savedCells = templateData ? this._templateToSavedCells(templateData) : null;

    this._editor = new Editor({
      canvasEl: document.getElementById('map-canvas'),
      containerEl: document.querySelector('.canvas-container'),
      toolbarEl: document.querySelector('.editor-toolbar'),
      paletteEl: document.querySelector('.tile-palette'),
      themeId: themeId,
      shape: shape,
      size: size,
      mapName: name,
      savedCells: savedCells,
      app: this,
      storage: this._storage,
      settings: this._settings,
      realmBrew: this._realmBrew,
      rbSubTheme: rbSubTheme
    });

    try {
      await this._editor.init();
      // Initial save to create the map record
      this._editor.saveMap();
      this.announce('Map editor ready. Select a tile from the palette to begin painting.');

      // Show tutorial for first-time users
      if (!this._tutorial) {
        this._tutorial = new Tutorial(this._settings);
      }
      if (this._tutorial.shouldShow()) {
        // Slight delay to let editor render first
        this._tutorialTimerId = setTimeout(() => {
          this._tutorialTimerId = null;
          this._tutorial.show();
        }, 500);
      }
    } catch (err) {
      this.announce('Failed to load map editor. Please refresh and try again.', true);
      console.error('Editor init failed:', err);
    }
  }

  /** Convert template data to the savedCells format expected by StorageManager.deserializeIntoGrid */
  _templateToSavedCells(templateData) {
    const cells = [];
    if (templateData.cells) {
      for (const tc of templateData.cells) {
        const cell = { col: tc.col, row: tc.row, base: tc.base };
        if (tc.cellType) cell.cellType = tc.cellType;
        // Find overlays for this cell position
        const overlays = (templateData.overlays || []).filter(
          o => o.col === tc.col && o.row === tc.row
        );
        if (overlays.length > 0) {
          cell.overlays = overlays.map(o => ({
            id: o.id,
            rotation: o.rotation || 0,
            opacity: o.opacity != null ? o.opacity : 1.0,
            size: o.size || 'medium'
          }));
        }
        cells.push(cell);
      }
      // Also add overlay-only cells (overlays on cells not in the template cells list)
      const cellKeys = new Set(templateData.cells.map(c => c.col + ',' + c.row));
      for (const o of (templateData.overlays || [])) {
        if (!cellKeys.has(o.col + ',' + o.row)) {
          cells.push({
            col: o.col,
            row: o.row,
            base: null,
            overlays: [{
              id: o.id,
              rotation: o.rotation || 0,
              opacity: o.opacity != null ? o.opacity : 1.0,
              size: o.size || 'medium'
            }]
          });
        }
      }
    }
    return cells;
  }

  async _loadMap(mapId) {
    const mapData = this._storage.loadMap(mapId);
    if (!mapData) {
      this.announce('Could not load map.');
      return;
    }

    this.showScreen('editor');

    this._editor = new Editor({
      canvasEl: document.getElementById('map-canvas'),
      containerEl: document.querySelector('.canvas-container'),
      toolbarEl: document.querySelector('.editor-toolbar'),
      paletteEl: document.querySelector('.tile-palette'),
      themeId: mapData.themeId,
      shape: mapData.shape,
      size: mapData.sizeKey,
      mapName: mapData.name,
      mapId: mapData.id,
      savedCells: mapData.cells,
      savedCamera: mapData.camera,
      app: this,
      storage: this._storage,
      settings: this._settings,
      realmBrew: this._realmBrew,
      rbSubTheme: mapData.rbSubTheme || null
    });

    try {
      await this._editor.init();
      this.announce('Map loaded. Select a tile from the palette to continue editing.');
    } catch (err) {
      this.announce('Failed to load map. Please refresh and try again.', true);
      console.error('Editor init (load) failed:', err);
    }
  }

  _autoSaveEditor() {
    if (this._editor && (this._editor._mapId || this._editor._saveDirty)) {
      try {
        this._editor.saveMap();
      } catch (e) {
        console.warn('Auto-save on exit failed', e);
      }
    }
  }

  /* ---- Templates ---- */

  async _loadTemplates() {
    try {
      const resp = await fetch('js/data/templates.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      this._templates = await resp.json();
    } catch (e) {
      console.warn('Failed to load templates:', e);
      this._templates = [];
    }
  }

  _bindTemplateModal() {
    const cancelBtn = document.getElementById('btn-template-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this._closeTemplateModal());
    }
  }

  _openTemplateModal() {
    const dialog = document.getElementById('template-dialog');
    if (!dialog) return;

    const themeId = this._getSelectedTheme();
    this._renderTemplateGrid(themeId);
    this._openModal(dialog);

    // Escape to close
    this._templateEscHandler = (e) => {
      if (e.key === 'Escape') this._closeTemplateModal();
    };
    document.addEventListener('keydown', this._templateEscHandler);
  }

  _closeTemplateModal() {
    const dialog = document.getElementById('template-dialog');
    if (dialog) this._closeModal(dialog);
    if (this._templateEscHandler) {
      document.removeEventListener('keydown', this._templateEscHandler);
      this._templateEscHandler = null;
    }
  }

  _renderTemplateGrid(themeId) {
    const grid = document.getElementById('template-grid');
    if (!grid) return;

    if (!this._templates) {
      grid.innerHTML = '<p class="template-empty">Loading templates...</p>';
      return;
    }

    // Filter templates for the selected theme
    const filtered = this._templates.filter(t => t.theme === themeId);

    if (filtered.length === 0) {
      grid.innerHTML = '<p class="template-empty">No templates for this theme yet.</p>';
      return;
    }

    grid.innerHTML = filtered.map(t => {
      const shapeIcon = SHAPE_ICONS[t.shape] || '';
      const config = getGridConfig(t.shape, t.size);
      const sizeText = config ? config.cols + '\u00d7' + config.rows : t.size;

      return '<div class="template-card" tabindex="0" role="option" data-template-id="' + escHtml(t.id) + '" aria-label="' + escHtml(t.name) + '">'
        + '<div class="template-card-preview" aria-hidden="true">' + escHtml(shapeIcon) + '</div>'
        + '<div class="template-card-name">' + escHtml(t.name) + '</div>'
        + '<div class="template-card-meta">'
        + '<span class="template-badge">' + escHtml(t.shape) + '</span>'
        + '<span>' + escHtml(sizeText) + '</span>'
        + '</div></div>';
    }).join('');

    // Bind clicks
    grid.querySelectorAll('.template-card').forEach(card => {
      const handler = () => {
        const template = this._templates.find(t => t.id === card.dataset.templateId);
        if (template) {
          this._closeTemplateModal();
          this._createMap(JSON.parse(JSON.stringify(template)));
        }
      };
      card.addEventListener('click', handler);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handler();
        }
      });
    });
  }

  /* ---- Settings Modal ---- */

  _bindSettingsModal() {
    const closeBtn = document.getElementById('btn-settings-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this._closeSettingsModal());
    }

    // Font size radio buttons
    const fontRadios = document.querySelectorAll('.settings-radio[data-setting="fontSize"]');
    fontRadios.forEach(btn => {
      btn.addEventListener('click', () => {
        fontRadios.forEach(b => b.setAttribute('aria-checked', 'false'));
        btn.setAttribute('aria-checked', 'true');
        this._settings.set('fontSize', btn.dataset.value);
      });
    });

    // Checkbox toggles
    const soundCheck = document.getElementById('setting-sound');
    if (soundCheck) {
      soundCheck.addEventListener('change', () => {
        this._settings.set('soundEnabled', soundCheck.checked);
      });
    }

    const autoSaveCheck = document.getElementById('setting-auto-save');
    if (autoSaveCheck) {
      autoSaveCheck.addEventListener('change', () => {
        this._settings.set('autoSave', autoSaveCheck.checked);
      });
    }

    const gridCheck = document.getElementById('setting-grid-lines');
    if (gridCheck) {
      gridCheck.addEventListener('change', () => {
        this._settings.set('gridLines', gridCheck.checked);
      });
    }

    const coordsCheck = document.getElementById('setting-show-coords');
    if (coordsCheck) {
      coordsCheck.addEventListener('change', () => {
        this._settings.set('showCoordinates', coordsCheck.checked);
      });
    }

    // Show tutorial again
    const tutorialBtn = document.getElementById('btn-show-tutorial');
    if (tutorialBtn) {
      tutorialBtn.addEventListener('click', () => {
        this._settings.resetTutorial();
        this.announce('Tutorial will show next time you create a map.');
      });
    }
  }

  _openSettingsModal() {
    const dialog = document.getElementById('settings-dialog');
    if (!dialog) return;

    // Sync UI with current settings
    const s = this._settings.getAll();

    // Font size
    const fontRadios = dialog.querySelectorAll('.settings-radio[data-setting="fontSize"]');
    fontRadios.forEach(btn => {
      btn.setAttribute('aria-checked', btn.dataset.value === s.fontSize ? 'true' : 'false');
    });

    // Checkboxes
    const soundCheck = document.getElementById('setting-sound');
    if (soundCheck) soundCheck.checked = s.soundEnabled;
    const autoSaveCheck = document.getElementById('setting-auto-save');
    if (autoSaveCheck) autoSaveCheck.checked = s.autoSave;
    const gridCheck = document.getElementById('setting-grid-lines');
    if (gridCheck) gridCheck.checked = s.gridLines;
    const coordsCheck = document.getElementById('setting-show-coords');
    if (coordsCheck) coordsCheck.checked = s.showCoordinates;

    this._openModal(dialog);

    // Escape to close
    this._settingsEscHandler = (e) => {
      if (e.key === 'Escape') this._closeSettingsModal();
    };
    document.addEventListener('keydown', this._settingsEscHandler);
  }

  _closeSettingsModal() {
    const dialog = document.getElementById('settings-dialog');
    if (dialog) this._closeModal(dialog);
    if (this._settingsEscHandler) {
      document.removeEventListener('keydown', this._settingsEscHandler);
      this._settingsEscHandler = null;
    }
  }

  /* ---- My Maps Screen ---- */
  _bindMyMapsScreen() {
    const backBtn = document.getElementById('btn-mymaps-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.showScreen('title'));
    }

    // Delete dialog
    const deleteCancel = document.getElementById('btn-delete-cancel');
    const deleteConfirm = document.getElementById('btn-delete-confirm');
    if (deleteCancel) deleteCancel.addEventListener('click', () => this._closeDeleteDialog());
    if (deleteConfirm) deleteConfirm.addEventListener('click', () => this._confirmDelete());

    // Rename dialog
    const renameCancel = document.getElementById('btn-rename-cancel');
    const renameConfirm = document.getElementById('btn-rename-confirm');
    if (renameCancel) renameCancel.addEventListener('click', () => this._closeRenameDialog());
    if (renameConfirm) renameConfirm.addEventListener('click', () => this._confirmRename());

    // Escape to close modals (store reference for cleanup)
    this._myMapsEscHandler = (e) => {
      if (e.key !== 'Escape' || this._currentScreen !== 'mymaps') return;
      const deleteDialog = document.getElementById('delete-dialog');
      const renameDialog = document.getElementById('rename-dialog');
      if (deleteDialog && !deleteDialog.classList.contains('hidden')) {
        this._closeDeleteDialog();
      }
      if (renameDialog && !renameDialog.classList.contains('hidden')) {
        this._closeRenameDialog();
      }
    };
    document.addEventListener('keydown', this._myMapsEscHandler);

    // Rename on Enter
    const renameInput = document.getElementById('rename-input');
    if (renameInput) {
      renameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._confirmRename();
      });
    }
  }

  _renderMyMaps() {
    const grid = document.getElementById('mymaps-grid');
    const empty = document.getElementById('mymaps-empty');
    const warning = document.getElementById('mymaps-warning');
    if (!grid) return;

    const maps = this._storage.listMaps();
    const usage = this._storage.getStorageUsage();

    // Quota warning
    if (usage.warnCount || usage.warnSize) {
      const msgs = [];
      if (usage.warnCount) msgs.push('You have ' + usage.mapCount + ' maps. Consider deleting some to free space.');
      if (usage.warnSize) msgs.push('Storage is getting full (' + Math.round(usage.bytes / 1024) + ' KB used).');
      warning.textContent = msgs.join(' ');
      warning.classList.remove('hidden');
    } else {
      warning.classList.add('hidden');
    }

    if (maps.length === 0) {
      grid.classList.add('hidden');
      empty.classList.remove('hidden');
      return;
    }

    grid.classList.remove('hidden');
    empty.classList.add('hidden');

    // Sort by most recently updated
    maps.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

    grid.innerHTML = maps.map(map => {
      const date = map.updatedAt ? new Date(map.updatedAt).toLocaleDateString() : '';
      const shapeIcon = SHAPE_ICONS[map.shape] || '';
      const thumbHtml = map.thumbnail
        ? '<img class="map-card-thumb" src="' + escHtml(map.thumbnail) + '" alt="Map thumbnail" loading="lazy">'
        : '<div class="map-card-thumb-empty" aria-hidden="true">\uD83D\uDDFA</div>';

      return '<div class="map-card" tabindex="0" data-map-id="' + escHtml(map.id) + '" role="button" aria-label="Open ' + escHtml(map.name) + '">'
        + thumbHtml
        + '<div class="map-card-info">'
        + '<div class="map-card-name">' + escHtml(map.name) + '</div>'
        + '<div class="map-card-meta">'
        + '<span>' + escHtml(shapeIcon) + '</span>'
        + '<span>' + escHtml(map.cols + '\u00d7' + map.rows) + '</span>'
        + '<span>' + escHtml(date) + '</span>'
        + '</div></div>'
        + '<div class="map-card-actions">'
        + '<button class="action-rename" data-map-id="' + escHtml(map.id) + '" data-map-name="' + escHtml(map.name) + '" aria-label="Rename ' + escHtml(map.name) + '">Rename</button>'
        + '<button class="action-duplicate" data-map-id="' + escHtml(map.id) + '" aria-label="Duplicate ' + escHtml(map.name) + '">Copy</button>'
        + '<button class="action-delete" data-map-id="' + escHtml(map.id) + '" data-map-name="' + escHtml(map.name) + '" aria-label="Delete ' + escHtml(map.name) + '">Delete</button>'
        + '</div></div>';
    }).join('');

    // Bind card clicks (open map)
    grid.querySelectorAll('.map-card').forEach(card => {
      const openHandler = (e) => {
        // Don't open if clicking action buttons
        if (e.target.closest('.map-card-actions')) return;
        this._loadMap(card.dataset.mapId);
      };
      card.addEventListener('click', openHandler);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openHandler(e);
        }
      });
    });

    // Action buttons
    grid.querySelectorAll('.action-rename').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openRenameDialog(btn.dataset.mapId, btn.dataset.mapName);
      });
    });

    grid.querySelectorAll('.action-duplicate').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._storage.duplicateMap(btn.dataset.mapId);
        this._renderMyMaps();
        this.announce('Map duplicated');
      });
    });

    grid.querySelectorAll('.action-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._openDeleteDialog(btn.dataset.mapId, btn.dataset.mapName);
      });
    });
  }

  /* ---- Modal Helpers ---- */

  _openModal(dialogEl) {
    dialogEl.classList.remove('hidden');
    dialogEl.removeAttribute('aria-hidden');
    this._trapFocusInModal(dialogEl);
    // Focus the first focusable element inside the modal
    const focusable = dialogEl.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) focusable[0].focus();
  }

  _closeModal(dialogEl) {
    dialogEl.classList.add('hidden');
    dialogEl.setAttribute('aria-hidden', 'true');
    if (dialogEl._focusTrap) {
      dialogEl.removeEventListener('keydown', dialogEl._focusTrap);
      dialogEl._focusTrap = null;
    }
  }

  _trapFocusInModal(dialogEl) {
    dialogEl._focusTrap = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = dialogEl.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    dialogEl.addEventListener('keydown', dialogEl._focusTrap);
  }

  /* ---- Delete Dialog ---- */
  _openDeleteDialog(mapId, mapName) {
    this._pendingDeleteId = mapId;
    const dialog = document.getElementById('delete-dialog');
    const msg = document.getElementById('delete-dialog-message');
    msg.textContent = 'Are you sure you want to delete "' + mapName + '"? This cannot be undone.';
    this._openModal(dialog);
    document.getElementById('btn-delete-cancel').focus();
  }

  _closeDeleteDialog() {
    this._pendingDeleteId = null;
    const dialog = document.getElementById('delete-dialog');
    this._closeModal(dialog);
  }

  _confirmDelete() {
    if (this._pendingDeleteId) {
      this._storage.deleteMap(this._pendingDeleteId);
      this.announce('Map deleted');
    }
    this._closeDeleteDialog();
    this._renderMyMaps();
  }

  /* ---- Rename Dialog ---- */
  _openRenameDialog(mapId, currentName) {
    this._pendingRenameId = mapId;
    const dialog = document.getElementById('rename-dialog');
    const input = document.getElementById('rename-input');
    input.value = currentName;
    this._openModal(dialog);
    input.focus();
    input.select();
  }

  _closeRenameDialog() {
    this._pendingRenameId = null;
    const dialog = document.getElementById('rename-dialog');
    this._closeModal(dialog);
  }

  _confirmRename() {
    const input = document.getElementById('rename-input');
    const newName = input.value.trim();
    if (this._pendingRenameId && newName) {
      this._storage.renameMap(this._pendingRenameId, newName);
      this.announce('Map renamed to ' + newName);
    }
    this._closeRenameDialog();
    this._renderMyMaps();
  }
}

// Boot
window.app = new App();
window.app.init();
