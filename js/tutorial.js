/* Magical Map Maker — Welcome Tutorial (First-Time Overlay) */

class Tutorial {
  constructor(settings) {
    this._settings = settings;
    this._step = 0;
    this._overlay = null;
    this._boundKeydown = null;
    this._boundResize = null;
    this._onComplete = null;
  }

  static STEPS = [
    {
      title: '\u{1F3A8} Pick a Tile',
      text: 'Tap a tile over here to pick it. This is where you choose what to paint with!',
      target: '.tile-palette',
      arrow: 'right'
    },
    {
      title: '\u{1F5BC}\uFE0F Paint Your Map',
      text: 'Now tap or drag on the map to paint! Made a mistake? Hit Undo to fix it.',
      target: '.canvas-container',
      arrow: 'left'
    },
    {
      title: '\u{1F3F0} Add Cool Stuff',
      text: 'Add castles, trees, monsters, and more from over here!',
      target: '.overlay-palette',
      arrow: 'left'
    },
    {
      title: '\u{1F4BE} Save and Print',
      text: 'When you are done, save your map and export it to print!',
      target: '.editor-toolbar',
      arrow: 'down'
    }
  ];

  shouldShow() {
    return !this._settings.get('tutorialSeen');
  }

  show(onComplete) {
    this._onComplete = onComplete;
    this._step = 0;
    this._createOverlay();
    this._renderStep();
  }

  _createOverlay() {
    this._overlay = document.createElement('div');
    this._overlay.className = 'tutorial-overlay';
    this._overlay.setAttribute('role', 'dialog');
    this._overlay.setAttribute('aria-modal', 'true');
    this._overlay.setAttribute('aria-labelledby', 'tutorial-step-title');
    document.body.appendChild(this._overlay);

    this._boundKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this._skip();
      } else if (e.key === 'Tab') {
        // Focus trap
        e.preventDefault();
        const btns = this._overlay.querySelectorAll('button');
        if (btns.length === 0) return;
        const focused = document.activeElement;
        const arr = Array.from(btns);
        const idx = arr.indexOf(focused);
        if (e.shiftKey) {
          arr[(idx - 1 + arr.length) % arr.length].focus();
        } else {
          arr[(idx + 1) % arr.length].focus();
        }
      }
    };
    document.addEventListener('keydown', this._boundKeydown);

    // Re-position on resize/rotation
    this._boundResize = () => this._renderStep();
    window.addEventListener('resize', this._boundResize);
  }

  _renderStep() {
    if (!this._overlay) return;
    const steps = Tutorial.STEPS;
    const s = steps[this._step];

    // Build DOM using safe methods
    this._overlay.innerHTML = '';

    // Highlight target element
    const targetEl = document.querySelector(s.target);
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const highlight = document.createElement('div');
      highlight.className = 'tutorial-highlight';
      highlight.setAttribute('aria-hidden', 'true');
      highlight.style.top = rect.top + 'px';
      highlight.style.left = rect.left + 'px';
      highlight.style.width = rect.width + 'px';
      highlight.style.height = rect.height + 'px';
      this._overlay.appendChild(highlight);
    }

    const isLast = this._step === steps.length - 1;
    const stepNum = (this._step + 1) + ' of ' + steps.length;

    // Build card via DOM
    const card = document.createElement('div');
    card.className = 'tutorial-card tutorial-arrow-' + s.arrow;
    card.setAttribute('role', 'document');

    const indicator = document.createElement('div');
    indicator.className = 'tutorial-step-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.textContent = stepNum;
    card.appendChild(indicator);

    const title = document.createElement('h3');
    title.className = 'tutorial-title';
    title.id = 'tutorial-step-title';
    title.textContent = s.title;
    card.appendChild(title);

    const text = document.createElement('p');
    text.className = 'tutorial-text';
    text.textContent = s.text;
    card.appendChild(text);

    const btnRow = document.createElement('div');
    btnRow.className = 'tutorial-buttons';

    const skipBtn = document.createElement('button');
    skipBtn.className = 'tutorial-skip';
    skipBtn.setAttribute('aria-label', 'Skip tutorial');
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', () => this._skip());
    btnRow.appendChild(skipBtn);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'tutorial-next primary';
    nextBtn.setAttribute('aria-label', isLast ? 'Finish tutorial' : 'Next step');
    nextBtn.textContent = isLast ? 'Got it!' : 'Next';
    nextBtn.addEventListener('click', () => this._next());
    btnRow.appendChild(nextBtn);

    card.appendChild(btnRow);
    this._overlay.appendChild(card);

    // Position the card near the target
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      if (s.arrow === 'right') {
        card.style.left = Math.min(rect.right + 16, vw - 320) + 'px';
        card.style.top = Math.max(rect.top + rect.height / 2 - 80, 16) + 'px';
      } else if (s.arrow === 'left') {
        card.style.left = Math.max(rect.left - 316, 16) + 'px';
        card.style.top = Math.max(rect.top + rect.height / 2 - 80, 16) + 'px';
      } else if (s.arrow === 'down') {
        card.style.left = Math.max(rect.left + rect.width / 2 - 150, 16) + 'px';
        card.style.top = Math.min(rect.bottom + 16, vh - 200) + 'px';
      }
    }

    nextBtn.focus();
  }

  _next() {
    this._step++;
    if (this._step >= Tutorial.STEPS.length) {
      this._finish();
    } else {
      this._renderStep();
    }
  }

  _skip() {
    this._finish();
  }

  _finish() {
    this._settings.markTutorialSeen();
    this._cleanup();
    if (this._onComplete) this._onComplete();
  }

  _cleanup() {
    if (this._boundKeydown) {
      document.removeEventListener('keydown', this._boundKeydown);
      this._boundKeydown = null;
    }
    if (this._boundResize) {
      window.removeEventListener('resize', this._boundResize);
      this._boundResize = null;
    }
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
  }

  destroy() {
    this._cleanup();
  }
}
