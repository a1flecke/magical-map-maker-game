/* Magical Map Maker — Settings Manager */

const SETTINGS_KEY = 'magical-map-maker-settings';
const SETTINGS_VERSION = 1;

const DEFAULT_SETTINGS = {
  version: SETTINGS_VERSION,
  fontSize: 'medium',    // small (16px), medium (18px), large (22px)
  soundEnabled: true,
  autoSave: true,
  gridLines: true,
  showCoordinates: false,
  tutorialSeen: false
};

const FONT_SIZES = {
  small: '16px',
  medium: '18px',
  large: '22px'
};

class SettingsManager {
  constructor() {
    this._settings = null;
  }

  load() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Merge with defaults for forward compatibility
        this._settings = { ...DEFAULT_SETTINGS, ...parsed, version: SETTINGS_VERSION };
      } else {
        this._settings = { ...DEFAULT_SETTINGS };
      }
    } catch (e) {
      console.warn('SettingsManager: failed to load settings', e);
      this._settings = { ...DEFAULT_SETTINGS };
    }
    this._applyFontSize();
    return this._settings;
  }

  get(key) {
    if (!this._settings) this.load();
    return this._settings[key];
  }

  set(key, value) {
    if (!this._settings) this.load();
    this._settings[key] = value;
    this._persist();
    if (key === 'fontSize') this._applyFontSize();
  }

  getAll() {
    if (!this._settings) this.load();
    return { ...this._settings };
  }

  _persist() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._settings));
    } catch (e) {
      console.warn('SettingsManager: failed to save settings', e);
    }
  }

  _applyFontSize() {
    const size = FONT_SIZES[this._settings.fontSize] || FONT_SIZES.medium;
    document.documentElement.style.fontSize = size;
  }

  markTutorialSeen() {
    this.set('tutorialSeen', true);
  }

  resetTutorial() {
    this.set('tutorialSeen', false);
  }
}
