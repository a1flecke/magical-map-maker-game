/* Magical Map Maker — Camera (Pan/Zoom) */

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4.0;
const ZOOM_LERP_DURATION = 150; // ms

class Camera {
  constructor() {
    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom = 1.0;

    // Smooth zoom animation state
    this._zoomAnim = null;
  }

  /** Convert screen pixel coords to world coords */
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.offsetX) / this.zoom,
      y: (sy - this.offsetY) / this.zoom
    };
  }

  /** Convert world coords to screen pixel coords */
  worldToScreen(wx, wy) {
    return {
      x: wx * this.zoom + this.offsetX,
      y: wy * this.zoom + this.offsetY
    };
  }

  /** Apply camera transform to a canvas context */
  applyTransform(ctx) {
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.zoom, this.zoom);
  }

  /** Pan by screen-space delta */
  pan(dx, dy) {
    this.offsetX += dx;
    this.offsetY += dy;
  }

  /** Zoom toward a screen-space point (preserves that point's world position) */
  zoomTo(newZoom, screenCenterX, screenCenterY) {
    newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
    if (newZoom === this.zoom) return;

    // World point under the cursor before zoom
    const worldX = (screenCenterX - this.offsetX) / this.zoom;
    const worldY = (screenCenterY - this.offsetY) / this.zoom;

    this.zoom = newZoom;

    // Adjust offset so the same world point stays under the cursor
    this.offsetX = screenCenterX - worldX * this.zoom;
    this.offsetY = screenCenterY - worldY * this.zoom;
  }

  /** Start a smooth zoom animation toward targetZoom centered at screen point */
  zoomSmooth(targetZoom, screenCenterX, screenCenterY) {
    targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetZoom));
    this._zoomAnim = {
      startZoom: this.zoom,
      targetZoom,
      centerX: screenCenterX,
      centerY: screenCenterY,
      startTime: performance.now(),
      duration: ZOOM_LERP_DURATION
    };
  }

  /** Call each frame to advance smooth zoom. Returns true if animating (dirty). */
  updateAnimation() {
    if (!this._zoomAnim) return false;

    const a = this._zoomAnim;
    const elapsed = performance.now() - a.startTime;
    const t = Math.min(elapsed / a.duration, 1);
    // Ease out quad
    const eased = t * (2 - t);
    const newZoom = a.startZoom + (a.targetZoom - a.startZoom) * eased;

    this.zoomTo(newZoom, a.centerX, a.centerY);

    if (t >= 1) {
      this._zoomAnim = null;
    }
    return true;
  }

  /** Fit the grid into the canvas viewport with some padding */
  fitToGrid(gridWidth, gridHeight, canvasWidth, canvasHeight) {
    const padding = 40;
    const availW = canvasWidth - padding * 2;
    const availH = canvasHeight - padding * 2;
    const scaleX = availW / gridWidth;
    const scaleY = availH / gridHeight;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(scaleX, scaleY)));

    this.zoom = newZoom;
    this.offsetX = (canvasWidth - gridWidth * newZoom) / 2;
    this.offsetY = (canvasHeight - gridHeight * newZoom) / 2;
  }

  /** Zoom in by a step, centered on canvas center */
  zoomIn(canvasWidth, canvasHeight) {
    const step = this.zoom * 0.25;
    this.zoomSmooth(this.zoom + step, canvasWidth / 2, canvasHeight / 2);
  }

  /** Zoom out by a step, centered on canvas center */
  zoomOut(canvasWidth, canvasHeight) {
    const step = this.zoom * 0.25;
    this.zoomSmooth(this.zoom - step, canvasWidth / 2, canvasHeight / 2);
  }
}
