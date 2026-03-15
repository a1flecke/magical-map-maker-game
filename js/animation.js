/* Magical Map Maker — Animation Manager */
/* Does NOT own RAF — editor.js is the single RAF loop owner */

const AnimationLevel = {
  FULL: 1,      // All effects active
  SUBTLE: 2,    // Gentle effects only (no intense: particles, fish, leaves)
  REDUCED: 3,   // Minimal movement (wave offset, gentle ripples)
  MINIMAL: 4,   // Very basic (slow color shifts only)
  STILL: 5      // No animation at all
};

const MAP_LIFE_MODES = ['full', 'subtle', 'still'];

class AnimationManager {
  constructor() {
    // Monotonic animation clock (paused when tab hidden)
    this.animationTime = 0;
    this._lastFrameTime = 0;
    this._paused = false;

    // Quality level
    this._qualityLevel = AnimationLevel.FULL;
    this._targetLevel = AnimationLevel.FULL;

    // Frame timing for adaptive quality
    this._frameTimes = [];
    this._frameTimeCap = 20;

    // Map Life preference (persisted)
    this._mapLifeMode = 'full'; // 'full' | 'subtle' | 'still'

    // Idle tracking for three-tier RAF
    this._lastInteractionTime = 0;
    this._idleState = 'active'; // 'active' | 'throttled' | 'stopped'
    this._frameCount = 0;

    // Hero frame mode (for thumbnails/exports)
    this._heroMode = false;

    // Reduced motion preference
    this._prefersReducedMotion = false;
    this._motionMql = null;

    this._init();
  }

  _init() {
    // Check prefers-reduced-motion
    this._motionMql = window.matchMedia('(prefers-reduced-motion: reduce)');
    this._prefersReducedMotion = this._motionMql.matches;
    this._boundMotionChange = () => {
      this._prefersReducedMotion = this._motionMql.matches;
      if (this._prefersReducedMotion && this._mapLifeMode === 'full') {
        this._mapLifeMode = 'still';
        this._updateQualityFromMapLife();
      }
    };
    this._motionMql.addEventListener('change', this._boundMotionChange);

    // Default to still if prefers-reduced-motion
    if (this._prefersReducedMotion) {
      this._mapLifeMode = 'still';
    }

    // Load persisted preference
    try {
      const saved = localStorage.getItem('magical-map-maker-animation-pref');
      if (saved && MAP_LIFE_MODES.includes(saved)) {
        this._mapLifeMode = saved;
      }
    } catch (_) {}

    this._updateQualityFromMapLife();

    // Visibility change — pause/resume
    this._boundVisChange = () => this._onVisibilityChange();
    document.addEventListener('visibilitychange', this._boundVisChange);

    this._boundPageHide = () => { this._paused = true; };
    this._boundPageShow = () => { this._paused = false; this._lastFrameTime = performance.now(); };
    window.addEventListener('pagehide', this._boundPageHide);
    window.addEventListener('pageshow', this._boundPageShow);
  }

  destroy() {
    if (this._motionMql) {
      this._motionMql.removeEventListener('change', this._boundMotionChange);
    }
    document.removeEventListener('visibilitychange', this._boundVisChange);
    window.removeEventListener('pagehide', this._boundPageHide);
    window.removeEventListener('pageshow', this._boundPageShow);
  }

  /* ---- Frame Lifecycle ---- */

  /** Call at start of each RAF tick. Returns dt in seconds. */
  beginFrame(now) {
    this._frameCount++;

    if (this._paused || this._qualityLevel === AnimationLevel.STILL) {
      return 0;
    }

    if (this._lastFrameTime === 0) {
      this._lastFrameTime = now;
      return 0;
    }

    const dt = Math.min((now - this._lastFrameTime) / 1000, 0.1); // cap at 100ms
    this._lastFrameTime = now;
    this.animationTime += dt;

    // Track frame time for adaptive quality
    this._frameTimes.push(now);
    if (this._frameTimes.length > this._frameTimeCap) {
      this._frameTimes.shift();
    }

    return dt;
  }

  /** Call at end of each RAF tick with frame duration for quality adaptation */
  endFrame(frameDurationMs) {
    // Adaptive quality with hysteresis
    if (this._frameTimes.length >= 10) {
      const avgDt = this._getAvgFrameTime();
      if (avgDt > 20 && this._targetLevel < AnimationLevel.STILL) {
        // Dropping frames — reduce quality
        this._targetLevel = Math.min(this._targetLevel + 1, AnimationLevel.STILL);
      } else if (avgDt < 12 && this._targetLevel > AnimationLevel.FULL) {
        // Running smooth — try increasing quality
        this._targetLevel = Math.max(this._targetLevel - 1, AnimationLevel.FULL);
      }
    }

    // Exponential backoff hysteresis — don't change quality every frame
    if (this._frameCount % 60 === 0 && this._qualityLevel !== this._targetLevel) {
      this._qualityLevel = this._targetLevel;
    }
  }

  _getAvgFrameTime() {
    if (this._frameTimes.length < 2) return 16;
    const total = this._frameTimes[this._frameTimes.length - 1] - this._frameTimes[0];
    return total / (this._frameTimes.length - 1);
  }

  /* ---- Map Life Toggle ---- */

  get mapLifeMode() { return this._mapLifeMode; }

  cycleMapLife() {
    const idx = MAP_LIFE_MODES.indexOf(this._mapLifeMode);
    this._mapLifeMode = MAP_LIFE_MODES[(idx + 1) % MAP_LIFE_MODES.length];
    this._updateQualityFromMapLife();
    try {
      localStorage.setItem('magical-map-maker-animation-pref', this._mapLifeMode);
    } catch (_) {}
    return this._mapLifeMode;
  }

  _updateQualityFromMapLife() {
    switch (this._mapLifeMode) {
      case 'full':
        this._qualityLevel = AnimationLevel.FULL;
        this._targetLevel = AnimationLevel.FULL;
        break;
      case 'subtle':
        this._qualityLevel = AnimationLevel.SUBTLE;
        this._targetLevel = AnimationLevel.SUBTLE;
        break;
      case 'still':
        this._qualityLevel = AnimationLevel.STILL;
        this._targetLevel = AnimationLevel.STILL;
        break;
    }
  }

  /* ---- Idle Tracking (Three-tier RAF) ---- */

  /** Call on any user interaction */
  noteInteraction() {
    this._lastInteractionTime = performance.now();
    this._idleState = 'active';
  }

  /** Returns the current idle state for RAF throttling decisions */
  getIdleState(now) {
    if (this._qualityLevel === AnimationLevel.STILL) return 'stopped';

    const idleMs = now - this._lastInteractionTime;

    if (idleMs < 10000) {
      this._idleState = 'active';
    } else if (idleMs < 15000) {
      this._idleState = 'throttled'; // 15fps
    } else {
      this._idleState = 'stopped'; // dirty-flag only
    }
    return this._idleState;
  }

  /** Should skip this frame? (for throttled mode) */
  shouldSkipFrame(now) {
    const state = this.getIdleState(now);
    if (state === 'active') return false;
    if (state === 'throttled') {
      // ~15fps: skip 3 of every 4 frames
      return (this._frameCount % 4) !== 0;
    }
    return true; // stopped — only render on dirty
  }

  /** Is animation active (not still/stopped)? */
  get isAnimating() {
    return this._qualityLevel !== AnimationLevel.STILL && this._idleState !== 'stopped';
  }

  /* ---- Animation Staggering ---- */

  /** Should this cell animate this frame? (stagger to reduce work) */
  shouldAnimateCell(col, row) {
    if (this._qualityLevel === AnimationLevel.STILL) return false;
    if (this._qualityLevel === AnimationLevel.FULL) return true;
    // Stagger: only animate 1/3 of cells per frame (SUBTLE and below)
    return (this._frameCount + col + row) % 3 === 0;
  }

  /* ---- Hero Frame Mode ---- */

  setHeroFrame() {
    this._heroMode = true;
    this.animationTime = 2.5; // fixed t for consistent screenshots
  }

  clearHeroFrame() {
    this._heroMode = false;
  }

  /* ---- Quality Queries ---- */

  get qualityLevel() { return this._qualityLevel; }

  /** Should intense effects (particles, fish, leaves) be rendered? */
  get showIntenseEffects() {
    return this._qualityLevel === AnimationLevel.FULL;
  }

  /** Should gentle effects (waves, ripples) be rendered? */
  get showGentleEffects() {
    return this._qualityLevel <= AnimationLevel.SUBTLE;
  }

  /** Should any animation be rendered? */
  get showAnyAnimation() {
    return this._qualityLevel < AnimationLevel.STILL;
  }

  /* ---- Visibility ---- */

  _onVisibilityChange() {
    if (document.hidden) {
      this._paused = true;
    } else {
      this._paused = false;
      this._lastFrameTime = performance.now();
    }
  }

  /* ---- Water Animation Effects ---- */

  /**
   * Get animation parameters for a water tile at current time.
   * Returns an object with effect values to apply during per-frame animation layer.
   */
  getWaterEffects(tileId, col, row) {
    if (!this.showAnyAnimation) return null;

    const t = this.animationTime;
    const phase = (col * 0.7 + row * 1.3); // spatial offset for variety

    switch (tileId) {
      case 'ocean':
        return {
          waveOffset: Math.sin(t * 1.5 + phase) * 3,
          wavePhase: t * 0.8 + phase * 0.3,
          foamAlpha: this.showIntenseEffects ? (Math.sin(t * 2 + phase) * 0.15 + 0.15) : 0,
          sparkle: false
        };

      case 'shallow-water':
        return {
          rippleRadius: (t * 8 + phase * 5) % 15,
          rippleAlpha: Math.max(0, 1 - ((t * 8 + phase * 5) % 15) / 15) * 0.3,
          sparkle: this.showGentleEffects,
          sparklePhase: t * 3 + phase,
          fishShadow: this.showIntenseEffects ? Math.sin(t * 0.5 + phase) > 0.8 : false
        };

      case 'river':
        return {
          flowOffset: (t * 20 + phase * 3) % 30,
          currentStrength: 0.5 + Math.sin(t + phase) * 0.2,
          leafX: this.showIntenseEffects ? (t * 15 + phase * 10) % 50 : -1,
          leafY: this.showIntenseEffects ? Math.sin(t * 2 + phase) * 3 : 0
        };

      case 'lake':
        return {
          rippleRadius1: (t * 5 + phase * 3) % 20,
          rippleRadius2: (t * 5 + phase * 3 + 10) % 20,
          rippleAlpha: 0.2,
          fishLeap: this.showIntenseEffects ? Math.sin(t * 0.3 + phase) > 0.95 : false
        };

      case 'swamp':
        return {
          bubbleY: this.showGentleEffects ? (t * 3 + phase * 2) % 15 : -1,
          bubbleAlpha: Math.max(0, 1 - ((t * 3 + phase * 2) % 15) / 15) * 0.4,
          reedSway: this.showGentleEffects ? Math.sin(t * 1.5 + phase) * 2 : 0,
          dragonfly: this.showIntenseEffects ? Math.sin(t * 0.4 + phase) > 0.9 : false
        };

      case 'wide-river':
        return {
          flowOffset: (t * 18 + phase * 3) % 30,
          currentStrength: 0.6 + Math.sin(t + phase) * 0.2,
          leafX: this.showIntenseEffects ? (t * 12 + phase * 8) % 50 : -1,
          leafY: this.showIntenseEffects ? Math.sin(t * 1.5 + phase) * 4 : 0
        };

      case 'stream':
        return {
          flowOffset: (t * 12 + phase * 4) % 20,
          currentStrength: 0.3 + Math.sin(t * 1.5 + phase) * 0.1,
          sparkle: this.showGentleEffects,
          sparklePhase: t * 4 + phase
        };

      case 'pond':
        return {
          rippleRadius: (t * 4 + phase * 3) % 12,
          rippleAlpha: Math.max(0, 1 - ((t * 4 + phase * 3) % 12) / 12) * 0.25,
          sparkle: this.showGentleEffects,
          sparklePhase: t * 2 + phase
        };

      case 'rapids':
        return {
          flowOffset: (t * 30 + phase * 5) % 25,
          splashX: this.showIntenseEffects ? (t * 20 + phase * 7) % 50 : -1,
          splashAlpha: this.showIntenseEffects ? Math.abs(Math.sin(t * 3 + phase)) * 0.5 : 0,
          foamShift: Math.sin(t * 2.5 + phase) * 2
        };

      case 'waterfall':
        return {
          fallOffset: (t * 40 + phase) % 30,
          mistAlpha: this.showGentleEffects ? (Math.sin(t * 0.8 + phase) * 0.1 + 0.15) : 0,
          splashRing: this.showIntenseEffects ? (t * 6 + phase) % 10 : -1
        };

      case 'hot-spring':
        return {
          steamY: this.showGentleEffects ? (t * 5 + phase * 2) % 20 : -1,
          steamAlpha: Math.max(0, 1 - ((t * 5 + phase * 2) % 20) / 20) * 0.3,
          rippleRadius: (t * 3 + phase) % 15,
          rippleAlpha: Math.max(0, 1 - ((t * 3 + phase) % 15) / 15) * 0.2
        };

      case 'delta':
        return {
          tidalDrift: this.showGentleEffects ? Math.sin(t * 0.5 + phase) * 1.5 : 0,
          sedimentShift: Math.sin(t * 0.3 + phase * 0.5) * 0.5,
          sparkle: this.showGentleEffects,
          sparklePhase: t * 2 + phase
        };

      case 'mangrove':
        return {
          rippleRadius: (t * 3 + phase * 2) % 12,
          rippleAlpha: Math.max(0, 1 - ((t * 3 + phase * 2) % 12) / 12) * 0.2,
          dripY: this.showGentleEffects ? (t * 8 + phase * 3) % 15 : -1,
          dripAlpha: Math.max(0, 1 - ((t * 8 + phase * 3) % 15) / 15) * 0.3
        };

      case 'reef':
        return {
          waveOffset: Math.sin(t * 1.2 + phase) * 2,
          fishDart: this.showIntenseEffects ? Math.sin(t * 0.5 + phase) > 0.9 : false,
          sparkle: this.showGentleEffects,
          sparklePhase: t * 3 + phase
        };

      case 'tidal-pool':
        return {
          rippleRadius: (t * 3.5 + phase * 2) % 10,
          rippleAlpha: Math.max(0, 1 - ((t * 3.5 + phase * 2) % 10) / 10) * 0.2,
          tideShift: this.showGentleEffects ? Math.sin(t * 0.4 + phase) * 1 : 0
        };

      case 'ocean-inlet':
        return {
          waveOffset: Math.sin(t * 1.5 + phase) * 3,
          wavePhase: t * 0.8 + phase * 0.3,
          foamAlpha: this.showIntenseEffects ? (Math.sin(t * 2 + phase) * 0.12 + 0.12) : 0
        };

      case 'continental-shelf':
        return {
          waveOffset: Math.sin(t * 1.0 + phase) * 2,
          depthShift: Math.sin(t * 0.3 + phase * 0.2) * 0.5,
          sparkle: this.showGentleEffects,
          sparklePhase: t * 2 + phase
        };

      default:
        return null;
    }
  }

  /* ---- Land Animation Effects ---- */

  /**
   * Get animation parameters for a land tile at current time.
   * Returns effect params for per-frame animation layer, or null.
   */
  getLandEffects(tileId, pattern, col, row) {
    if (!this.showAnyAnimation) return null;

    const t = this.animationTime;
    const phase = (col * 0.7 + row * 1.3);

    switch (pattern) {
      case 'grass':
      case 'tall-grass':
      case 'wildflowers':
      case 'savanna':
      case 'short-grass':
      case 'steppe':
        return {
          type: 'wind',
          windSway: Math.sin(t * 1.2 + phase) * 2,
          windPhase: t * 0.6 + phase * 0.4,
          gustAlpha: this.showIntenseEffects ? Math.max(0, Math.sin(t * 0.8 + phase * 0.5) - 0.7) * 0.5 : 0
        };

      case 'wheat':
        return {
          type: 'wind',
          windSway: Math.sin(t * 0.9 + phase) * 2.5,
          windPhase: t * 0.5 + phase * 0.3,
          gustAlpha: this.showIntenseEffects ? Math.max(0, Math.sin(t * 0.6 + phase * 0.4) - 0.6) * 0.4 : 0
        };

      case 'dense-forest':
      case 'light-woods':
      case 'pine-forest':
      case 'jungle-canopy':
      case 'jungle-floor':
      case 'fern-gully':
      case 'vine-wall':
        return {
          type: 'forest',
          rustleSway: Math.sin(t * 0.7 + phase) * 1.5,
          dappleLightShift: Math.sin(t * 0.4 + phase * 0.3) * 2,
          leafFall: this.showIntenseEffects && Math.sin(t * 0.3 + phase) > 0.92
        };

      case 'clearing':
        return {
          type: 'forest',
          rustleSway: Math.sin(t * 0.5 + phase) * 1,
          dappleLightShift: Math.sin(t * 0.3 + phase * 0.2) * 3,
          leafFall: false
        };

      case 'road':
      case 'bridge':
        if (!this.showIntenseEffects) return null;
        return {
          type: 'constructed',
          trafficDust: Math.sin(t * 0.2 + phase) > 0.85
        };

      case 'brush':
        return {
          type: 'wind',
          windSway: Math.sin(t * 0.8 + phase) * 1.5,
          windPhase: t * 0.4 + phase * 0.3,
          gustAlpha: 0
        };

      case 'dust-patch':
        return {
          type: 'dust',
          dustMoteX: this.showGentleEffects ? (t * 8 + phase * 5) % 50 : -1,
          dustMoteY: this.showGentleEffects ? Math.sin(t * 2 + phase) * 3 : 0,
          dustAlpha: this.showGentleEffects ? Math.abs(Math.sin(t * 1.5 + phase)) * 0.2 : 0
        };

      case 'red-clay':
      case 'salt-flat':
        if (!this.showGentleEffects) return null;
        return {
          type: 'heat',
          shimmerOffset: Math.sin(t * 2 + phase) * 1,
          shimmerAlpha: Math.abs(Math.sin(t * 1.5 + phase * 0.5)) * 0.1
        };

      case 'bamboo-grove':
        return {
          type: 'wind',
          windSway: Math.sin(t * 0.6 + phase) * 1.8,
          windPhase: t * 0.3 + phase * 0.4,
          gustAlpha: this.showIntenseEffects ? Math.max(0, Math.sin(t * 0.5 + phase) - 0.75) * 0.3 : 0
        };

      case 'desert':
      case 'desert-rock':
      case 'sand-dunes':
      case 'badlands':
      case 'dry-creek':
        if (!this.showGentleEffects) return null;
        return {
          type: 'heat',
          shimmerOffset: Math.sin(t * 2.5 + phase) * 1.5,
          shimmerAlpha: Math.abs(Math.sin(t * 1.2 + phase * 0.4)) * 0.12
        };

      case 'oasis':
        return {
          type: 'wind',
          windSway: Math.sin(t * 0.7 + phase) * 2,
          windPhase: t * 0.4 + phase * 0.3,
          gustAlpha: 0
        };

      case 'beach':
        return {
          type: 'coastal',
          waveLap: this.showGentleEffects ? Math.sin(t * 1.5 + phase) * 2 : 0,
          seagullShadow: this.showIntenseEffects ? Math.sin(t * 0.2 + phase) > 0.93 : false
        };

      case 'coastal-bluffs':
        return {
          type: 'coastal',
          waveLap: this.showGentleEffects ? Math.sin(t * 1.8 + phase) * 1.5 : 0,
          seagullShadow: this.showIntenseEffects ? Math.sin(t * 0.25 + phase) > 0.92 : false
        };

      case 'farmland':
        return {
          type: 'wind',
          windSway: Math.sin(t * 0.7 + phase) * 1.5,
          windPhase: t * 0.4 + phase * 0.3,
          gustAlpha: 0,
          animalShadow: this.showIntenseEffects ? Math.sin(t * 0.15 + phase * 1.7) > 0.92 : false,
          animalType: 'farm' // chicken, cow, pig
        };

      case 'hills':
        return {
          type: 'elevation',
          windSway: this.showGentleEffects ? Math.sin(t * 1.0 + phase) * 1.5 : 0,
          windPhase: t * 0.5 + phase * 0.4,
          cloudShadowX: this.showGentleEffects ? Math.sin(t * 0.2 + phase * 0.3) * 0.3 : 0,
          cloudShadowAlpha: this.showGentleEffects ? (Math.sin(t * 0.15 + phase * 0.5) * 0.08 + 0.04) : 0,
          livestockShadow: this.showIntenseEffects ? Math.sin(t * 0.12 + phase * 2.1) > 0.9 : false,
          livestockType: 'hill' // goats, sheep
        };

      case 'mountain':
        return {
          type: 'elevation',
          windSway: 0,
          windPhase: 0,
          cloudShadowX: this.showGentleEffects ? Math.sin(t * 0.15 + phase * 0.2) * 0.35 : 0,
          cloudShadowAlpha: this.showGentleEffects ? (Math.sin(t * 0.12 + phase * 0.4) * 0.1 + 0.05) : 0,
          livestockShadow: false,
          hawkShadow: this.showIntenseEffects ? Math.sin(t * 0.18 + phase * 1.3) > 0.88 : false
        };

      // Session 6: Elevation tiles
      case 'foothill':
        return {
          type: 'elevation',
          windSway: this.showGentleEffects ? Math.sin(t * 1.0 + phase) * 1.2 : 0,
          windPhase: t * 0.5 + phase * 0.3,
          cloudShadowX: this.showGentleEffects ? Math.sin(t * 0.18 + phase * 0.25) * 0.25 : 0,
          cloudShadowAlpha: this.showGentleEffects ? (Math.sin(t * 0.14 + phase * 0.4) * 0.06 + 0.03) : 0,
          livestockShadow: false,
          hawkShadow: false
        };

      case 'high-peak':
      case 'ridge':
        return {
          type: 'elevation',
          windSway: 0,
          windPhase: 0,
          cloudShadowX: this.showGentleEffects ? Math.sin(t * 0.12 + phase * 0.2) * 0.4 : 0,
          cloudShadowAlpha: this.showGentleEffects ? (Math.sin(t * 0.1 + phase * 0.3) * 0.12 + 0.06) : 0,
          livestockShadow: false,
          hawkShadow: this.showIntenseEffects ? Math.sin(t * 0.2 + phase * 1.5) > 0.9 : false
        };

      case 'snow-peak':
        return {
          type: 'arctic',
          snowDriftX: this.showGentleEffects ? (t * 6 + phase * 4) % 40 : -1,
          snowDriftAlpha: this.showGentleEffects ? Math.abs(Math.sin(t * 0.8 + phase)) * 0.15 : 0,
          iceSparkle: this.showGentleEffects,
          sparklePhase: t * 4 + phase,
          auroraShimmer: false,
          crackPropagation: false
        };

      case 'cliff':
      case 'canyon':
        return {
          type: 'elevation',
          windSway: 0,
          windPhase: 0,
          cloudShadowX: this.showGentleEffects ? Math.sin(t * 0.15 + phase * 0.2) * 0.3 : 0,
          cloudShadowAlpha: this.showGentleEffects ? (Math.sin(t * 0.12 + phase * 0.4) * 0.08 + 0.04) : 0,
          livestockShadow: false,
          hawkShadow: this.showIntenseEffects ? Math.sin(t * 0.22 + phase * 1.8) > 0.91 : false
        };

      case 'plateau':
        return {
          type: 'elevation',
          windSway: this.showGentleEffects ? Math.sin(t * 0.8 + phase) * 1 : 0,
          windPhase: t * 0.4 + phase * 0.3,
          cloudShadowX: this.showGentleEffects ? Math.sin(t * 0.15 + phase * 0.2) * 0.25 : 0,
          cloudShadowAlpha: this.showGentleEffects ? (Math.sin(t * 0.12 + phase * 0.4) * 0.07 + 0.03) : 0,
          livestockShadow: false,
          hawkShadow: false
        };

      case 'scree':
        if (!this.showIntenseEffects) return null;
        return {
          type: 'scree',
          rockTumble: Math.sin(t * 0.1 + phase * 2.5) > 0.94,
          tumblePhase: t * 2 + phase
        };

      // Session 6: Arctic tiles
      case 'tundra':
      case 'permafrost':
        return {
          type: 'arctic',
          snowDriftX: this.showGentleEffects ? (t * 4 + phase * 3) % 30 : -1,
          snowDriftAlpha: this.showGentleEffects ? Math.abs(Math.sin(t * 0.6 + phase)) * 0.1 : 0,
          iceSparkle: this.showGentleEffects,
          sparklePhase: t * 3 + phase,
          auroraShimmer: false,
          crackPropagation: false
        };

      case 'frozen-water':
        return {
          type: 'arctic',
          snowDriftX: -1,
          snowDriftAlpha: 0,
          iceSparkle: this.showGentleEffects,
          sparklePhase: t * 5 + phase,
          auroraShimmer: false,
          crackPropagation: this.showIntenseEffects ? Math.sin(t * 0.08 + phase * 3) > 0.95 : false
        };

      case 'ice-plain':
      case 'ice-shelf':
        return {
          type: 'arctic',
          snowDriftX: this.showGentleEffects ? (t * 5 + phase * 4) % 35 : -1,
          snowDriftAlpha: this.showGentleEffects ? Math.abs(Math.sin(t * 0.7 + phase)) * 0.08 : 0,
          iceSparkle: this.showGentleEffects,
          sparklePhase: t * 4 + phase,
          auroraShimmer: false,
          crackPropagation: false
        };

      case 'glacier':
        return {
          type: 'arctic',
          snowDriftX: this.showGentleEffects ? (t * 3 + phase * 2) % 25 : -1,
          snowDriftAlpha: this.showGentleEffects ? Math.abs(Math.sin(t * 0.5 + phase)) * 0.1 : 0,
          iceSparkle: this.showGentleEffects,
          sparklePhase: t * 3 + phase,
          auroraShimmer: false,
          crackPropagation: false
        };

      case 'ice-cave':
        return {
          type: 'arctic',
          snowDriftX: -1,
          snowDriftAlpha: 0,
          iceSparkle: this.showGentleEffects,
          sparklePhase: t * 6 + phase,
          auroraShimmer: this.showGentleEffects,
          auroraPhase: t * 0.3 + phase * 0.2,
          crackPropagation: false
        };

      case 'snow-field':
        return {
          type: 'arctic',
          snowDriftX: this.showGentleEffects ? (t * 7 + phase * 5) % 40 : -1,
          snowDriftAlpha: this.showGentleEffects ? Math.abs(Math.sin(t * 0.9 + phase)) * 0.12 : 0,
          iceSparkle: this.showGentleEffects,
          sparklePhase: t * 5 + phase,
          auroraShimmer: false,
          crackPropagation: false
        };

      // Session 6: Dungeon tiles
      case 'stone-floor':
      case 'cobblestone':
      case 'crypt':
      case 'throne-room':
        return {
          type: 'dungeon',
          torchFlicker: this.showGentleEffects ? Math.sin(t * 4 + phase) * 0.5 + Math.sin(t * 7 + phase * 1.3) * 0.3 : 0,
          dustMote: this.showGentleEffects,
          dustPhase: t * 2 + phase,
          dripping: false,
          ratScurry: false
        };

      case 'corridor':
      case 'dark-room':
        return {
          type: 'dungeon',
          torchFlicker: this.showGentleEffects ? Math.sin(t * 5 + phase) * 0.6 + Math.sin(t * 8 + phase * 1.5) * 0.3 : 0,
          dustMote: this.showGentleEffects,
          dustPhase: t * 1.5 + phase,
          dripping: false,
          ratScurry: this.showIntenseEffects ? Math.sin(t * 0.15 + phase * 2.3) > 0.93 : false
        };

      case 'cavern':
        return {
          type: 'dungeon',
          torchFlicker: 0,
          dustMote: false,
          dustPhase: 0,
          dripping: this.showGentleEffects,
          dripPhase: t * 3 + phase,
          ratScurry: this.showIntenseEffects ? Math.sin(t * 0.12 + phase * 1.9) > 0.94 : false
        };

      case 'underground-river':
      case 'sewer':
        return {
          type: 'dungeon',
          torchFlicker: 0,
          dustMote: false,
          dustPhase: 0,
          dripping: this.showGentleEffects,
          dripPhase: t * 4 + phase,
          bubbleY: this.showGentleEffects ? (t * 5 + phase * 3) % 15 : -1,
          bubbleAlpha: Math.max(0, 1 - ((t * 5 + phase * 3) % 15) / 15) * 0.3,
          ratScurry: false
        };

      case 'pit':
        if (!this.showGentleEffects) return null;
        return {
          type: 'dungeon',
          torchFlicker: 0,
          dustMote: this.showGentleEffects,
          dustPhase: t * 1 + phase,
          dripping: false,
          ratScurry: false
        };

      // Session 6: Battlefield tiles
      case 'mud':
        return {
          type: 'battlefield',
          mudBubble: this.showGentleEffects,
          bubblePhase: t * 2 + phase,
          currentFlow: false
        };

      case 'moat':
        return {
          type: 'battlefield',
          mudBubble: false,
          currentFlow: this.showGentleEffects,
          flowPhase: t * 0.8 + phase * 0.5
        };

      case 'rocky-ground':
        if (!this.showIntenseEffects) return null;
        return {
          type: 'scree',
          rockTumble: Math.sin(t * 0.08 + phase * 2.2) > 0.96,
          tumblePhase: t * 1.5 + phase
        };

      case 'dam':
        if (!this.showGentleEffects) return null;
        return {
          type: 'battlefield',
          mudBubble: false,
          currentFlow: this.showGentleEffects,
          flowPhase: t * 0.6 + phase * 0.4
        };

      // Session 7: Space tiles
      case 'deep-space':
        if (!this.showGentleEffects) return null;
        return {
          type: 'space',
          starTwinkle: true,
          twinklePhase: t * 3 + phase
        };

      case 'nebula-red':
      case 'nebula-blue':
      case 'nebula-green':
        return {
          type: 'space',
          starTwinkle: this.showGentleEffects,
          twinklePhase: t * 3 + phase,
          nebulaSwirl: this.showGentleEffects,
          swirlHueShift: Math.sin(t * 0.2 + phase * 0.3) * 0.1
        };

      case 'asteroid-field':
        return {
          type: 'space',
          starTwinkle: this.showGentleEffects,
          twinklePhase: t * 3 + phase,
          asteroidTumble: this.showGentleEffects,
          tumbleAngle: t * 0.3 + phase
        };

      case 'gas-cloud':
        if (!this.showGentleEffects) return null;
        return {
          type: 'space',
          starTwinkle: false,
          nebulaSwirl: true,
          swirlHueShift: Math.sin(t * 0.15 + phase * 0.2) * 0.08
        };

      case 'star-yellow':
      case 'star-blue':
      case 'star-red':
        return {
          type: 'space',
          starTwinkle: this.showGentleEffects,
          twinklePhase: t * 2 + phase,
          coronaPulse: this.showGentleEffects ? Math.sin(t * 1.5 + phase) * 0.1 + 0.9 : 1
        };

      case 'planet-rocky':
      case 'planet-gas':
      case 'planet-ice':
        if (!this.showGentleEffects) return null;
        return {
          type: 'space',
          starTwinkle: true,
          twinklePhase: t * 3 + phase,
          surfaceShift: Math.sin(t * 0.1 + phase) * 0.5
        };

      case 'black-hole':
        return {
          type: 'space',
          starTwinkle: this.showGentleEffects,
          twinklePhase: t * 3 + phase,
          accretionRotation: this.showIntenseEffects ? t * 0.5 + phase : 0,
          diskGlow: this.showGentleEffects ? Math.sin(t * 1.0 + phase) * 0.15 + 0.85 : 1
        };

      case 'wormhole':
        return {
          type: 'space',
          starTwinkle: this.showGentleEffects,
          twinklePhase: t * 3 + phase,
          spiralRotation: this.showIntenseEffects ? t * 0.8 + phase : 0,
          pulseScale: this.showGentleEffects ? Math.sin(t * 1.5 + phase) * 0.05 + 1 : 1
        };

      // Session 7: Volcanic/Hazard tiles
      case 'volcanic':
        return {
          type: 'volcanic',
          glowPulse: this.showGentleEffects ? Math.sin(t * 1.5 + phase) * 0.15 + 0.85 : 1,
          smokeWisp: this.showGentleEffects,
          smokePhase: t * 2 + phase,
          emberFloat: this.showIntenseEffects
        };

      case 'lava-flow':
        return {
          type: 'volcanic',
          glowPulse: this.showGentleEffects ? Math.sin(t * 2 + phase) * 0.2 + 0.8 : 1,
          flowMovement: this.showGentleEffects ? (t * 10 + phase * 3) % 30 : 0,
          emberFloat: this.showIntenseEffects
        };

      case 'lava-field':
        return {
          type: 'volcanic',
          glowPulse: this.showGentleEffects ? Math.sin(t * 1.0 + phase) * 0.1 + 0.9 : 1,
          smokeWisp: this.showGentleEffects,
          smokePhase: t * 1.5 + phase,
          emberFloat: false
        };

      case 'scorched-earth':
        return {
          type: 'volcanic',
          glowPulse: 1,
          smokeWisp: this.showGentleEffects,
          smokePhase: t * 1 + phase,
          emberFloat: this.showGentleEffects
        };

      case 'ruins-ground':
        if (!this.showGentleEffects) return null;
        return {
          type: 'dust',
          dustMoteX: (t * 5 + phase * 3) % 40,
          dustMoteY: Math.sin(t * 1.5 + phase) * 2,
          dustAlpha: Math.abs(Math.sin(t * 1 + phase)) * 0.15
        };

      case 'no-mans-land':
        if (!this.showGentleEffects) return null;
        return {
          type: 'dust',
          dustMoteX: (t * 4 + phase * 3) % 35,
          dustMoteY: Math.sin(t * 1 + phase) * 2,
          dustAlpha: Math.abs(Math.sin(t * 0.8 + phase)) * 0.12
        };

      // Session 7: Constructed tiles
      case 'paved-road':
        if (!this.showIntenseEffects) return null;
        return {
          type: 'constructed',
          trafficDust: Math.sin(t * 0.2 + phase) > 0.85
        };

      case 'fortification':
        if (!this.showIntenseEffects) return null;
        return {
          type: 'constructed',
          sentryPace: true,
          sentryPhase: t * 0.5 + phase,
          flagFlutter: this.showGentleEffects ? Math.sin(t * 3 + phase) * 2 : 0
        };

      case 'trench':
        if (!this.showIntenseEffects) return null;
        return {
          type: 'constructed',
          sentryPace: true,
          sentryPhase: t * 0.3 + phase
        };

      case 'camp-ground':
        if (!this.showGentleEffects) return null;
        return {
          type: 'constructed',
          flagFlutter: Math.sin(t * 3 + phase) * 2,
          smokeRise: this.showGentleEffects,
          smokePhase: t * 2 + phase
        };

      case 'harbor':
        return {
          type: 'constructed',
          boatRock: this.showIntenseEffects ? Math.sin(t * 1.5 + phase) * 2 : 0,
          waveOffset: this.showGentleEffects ? Math.sin(t * 1.2 + phase) * 1.5 : 0
        };

      case 'town':
        return {
          type: 'constructed',
          trafficDust: this.showIntenseEffects ? Math.sin(t * 0.15 + phase) > 0.88 : false,
          smokeRise: this.showGentleEffects,
          smokePhase: t * 1.5 + phase
        };

      // Session 7: Continental/World tiles
      case 'lowland':
        return {
          type: 'wind',
          windSway: Math.sin(t * 0.8 + phase) * 1.2,
          windPhase: t * 0.4 + phase * 0.3,
          gustAlpha: 0
        };

      case 'highland':
        return {
          type: 'elevation',
          windSway: this.showGentleEffects ? Math.sin(t * 0.9 + phase) * 1.3 : 0,
          windPhase: t * 0.4 + phase * 0.3,
          cloudShadowX: this.showGentleEffects ? Math.sin(t * 0.15 + phase * 0.2) * 0.3 : 0,
          cloudShadowAlpha: this.showGentleEffects ? (Math.sin(t * 0.12 + phase * 0.4) * 0.08 + 0.04) : 0,
          livestockShadow: false,
          hawkShadow: false
        };

      case 'mountain-range':
        return {
          type: 'elevation',
          windSway: 0,
          windPhase: 0,
          cloudShadowX: this.showGentleEffects ? Math.sin(t * 0.12 + phase * 0.18) * 0.35 : 0,
          cloudShadowAlpha: this.showGentleEffects ? (Math.sin(t * 0.1 + phase * 0.3) * 0.1 + 0.05) : 0,
          livestockShadow: false,
          hawkShadow: this.showIntenseEffects ? Math.sin(t * 0.2 + phase * 1.4) > 0.9 : false
        };

      case 'rainforest':
        return {
          type: 'forest',
          rustleSway: Math.sin(t * 0.6 + phase) * 1.5,
          dappleLightShift: Math.sin(t * 0.3 + phase * 0.3) * 2,
          leafFall: this.showIntenseEffects && Math.sin(t * 0.25 + phase) > 0.93,
          rainCurtain: this.showGentleEffects,
          rainPhase: t * 8 + phase
        };

      default:
        return null;
    }
  }
}
