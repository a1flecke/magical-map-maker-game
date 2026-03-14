/* Magical Map Maker — Theme Manager */

class ThemeManager {
  constructor() {
    this._themes = [];
    this._loaded = false;
  }

  async load() {
    if (this._loaded) return;
    const resp = await fetch('js/data/themes.json');
    if (!resp.ok) throw new Error('Failed to load themes.json: ' + resp.status);
    this._themes = await resp.json();
    this._loaded = true;
  }

  getTheme(id) {
    return this._themes.find(t => t.id === id) || null;
  }

  getAvailableTiles(themeId) {
    const theme = this.getTheme(themeId);
    return theme ? theme.baseTiles : [];
  }

  applyTheme(containerEl, themeId) {
    const theme = this.getTheme(themeId);
    if (!theme || !containerEl) return;

    // Remove old theme classes
    containerEl.className = containerEl.className.replace(/theme-[\w-]+/g, '').trim();
    containerEl.classList.add(`theme-${themeId}`);

    // Apply CSS custom properties
    containerEl.style.setProperty('--theme-bg', theme.colors.bg);
    containerEl.style.setProperty('--theme-accent', theme.colors.accent);
    containerEl.style.setProperty('--theme-grid', theme.colors.grid);
  }
}
