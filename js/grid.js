/* Magical Map Maker — Grid Rendering (Square, Hex, Diamond, Octagon) */

/**
 * Grid sizes per shape, aligned with spec §5 (fit on 8.5×11" paper).
 * cellSize is screen pixels at 96 DPI.
 */
const GRID_CONFIGS = {
  square: {
    small:  { cols: 8,  rows: 6,  cellSize: 64 },
    medium: { cols: 13, rows: 10, cellSize: 48 },
    large:  { cols: 20, rows: 16, cellSize: 32 }
  },
  hex: {
    small:  { cols: 7,  rows: 6,  cellSize: 64 },
    medium: { cols: 11, rows: 10, cellSize: 48 },
    large:  { cols: 18, rows: 15, cellSize: 32 }
  },
  diamond: {
    small:  { cols: 8,  rows: 7,  cellSize: 64 },
    medium: { cols: 13, rows: 10, cellSize: 48 },
    large:  { cols: 20, rows: 16, cellSize: 32 }
  },
  octagon: {
    small:  { cols: 7,  rows: 6,  cellSize: 64 },
    medium: { cols: 11, rows: 9,  cellSize: 48 },
    large:  { cols: 18, rows: 14, cellSize: 32 }
  }
};

/** Get grid config for a shape and size */
function getGridConfig(shape, sizeKey) {
  const shapeConfigs = GRID_CONFIGS[shape] || GRID_CONFIGS.square;
  return shapeConfigs[sizeKey] || shapeConfigs.medium;
}

/* ============================================================
   Base Grid — shared interface for all shapes
   ============================================================ */

class Grid {
  constructor(shape, cols, rows, cellSize) {
    this.shape = shape;
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
  }

  /** Factory: create the right grid subclass */
  static create(shape, cols, rows, cellSize) {
    switch (shape) {
      case 'hex':     return new HexGrid(cols, rows, cellSize);
      case 'diamond': return new DiamondGrid(cols, rows, cellSize);
      case 'octagon': return new OctagonGrid(cols, rows, cellSize);
      default:        return new SquareGrid(cols, rows, cellSize);
    }
  }

  // Subclasses must implement:
  // get widthPx(), get heightPx()
  // pixelToGrid(x, y) → { col, row, [cellType] } | null
  // gridToPixel(col, row, [cellType]) → { x, y } (center of cell)
  // getCellPath(col, row, [cellType]) → Path2D
  // getCell(col, row, [cellType]) → cell data | null
  // setBase(col, row, tileId, [cellType]) → bool
  // getNeighbors(col, row, [cellType]) → [{ col, row, [cellType] }]
  // floodFill(col, row, tileId, maxCells, [cellType]) → [{ col, row, [cellType] }]
  // drawGridLines(ctx, gridColor)
  // forEachCell(callback) — iterate all cells
}

/* ============================================================
   Square Grid
   ============================================================ */

class SquareGrid extends Grid {
  constructor(cols, rows, cellSize) {
    super('square', cols, rows, cellSize);
    this.cells = [];
    for (let r = 0; r < rows; r++) {
      this.cells[r] = [];
      for (let c = 0; c < cols; c++) {
        this.cells[r][c] = { base: null, overlays: [], rotation: 0, flipH: false, flipV: false };
      }
    }
  }

  get widthPx() { return this.cols * this.cellSize; }
  get heightPx() { return this.rows * this.cellSize; }

  pixelToGrid(x, y) {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
    return { col, row };
  }

  gridToPixel(col, row) {
    return {
      x: col * this.cellSize + this.cellSize / 2,
      y: row * this.cellSize + this.cellSize / 2
    };
  }

  /** Top-left origin for drawing (used by tile renderer) */
  cellOrigin(col, row) {
    return { x: col * this.cellSize, y: row * this.cellSize };
  }

  getCellPath(col, row) {
    const { x, y } = this.cellOrigin(col, row);
    const path = new Path2D();
    path.rect(x, y, this.cellSize, this.cellSize);
    return path;
  }

  getCell(col, row) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    return this.cells[row][col];
  }

  setBase(col, row, tileId) {
    const cell = this.getCell(col, row);
    if (!cell || cell.base === tileId) return false;
    cell.base = tileId;
    return true;
  }

  getNeighbors(col, row) {
    return [
      { col: col - 1, row }, { col: col + 1, row },
      { col, row: row - 1 }, { col, row: row + 1 }
    ].filter(n => this.getCell(n.col, n.row));
  }

  floodFill(col, row, tileId, maxCells = 500) {
    const startCell = this.getCell(col, row);
    if (!startCell) return [];
    const targetBase = startCell.base;
    if (targetBase === tileId) return [];

    const queue = [{ col, row }];
    const visited = new Set([`${col},${row}`]);
    const filled = [];

    while (queue.length > 0 && filled.length < maxCells) {
      const cur = queue.shift();
      const cell = this.getCell(cur.col, cur.row);
      if (!cell || cell.base !== targetBase) continue;
      cell.base = tileId;
      filled.push(cur);

      for (const n of this.getNeighbors(cur.col, cur.row)) {
        const key = `${n.col},${n.row}`;
        if (!visited.has(key)) {
          visited.add(key);
          const nc = this.getCell(n.col, n.row);
          if (nc && nc.base === targetBase) queue.push(n);
        }
      }
    }
    return filled;
  }

  drawGridLines(ctx, gridColor) {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= this.cols; c++) {
      const x = c * this.cellSize;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.heightPx);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let r = 0; r <= this.rows; r++) {
      const y = r * this.cellSize;
      ctx.moveTo(0, y);
      ctx.lineTo(this.widthPx, y);
    }
    ctx.stroke();
  }

  forEachCell(cb) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        cb(c, r, this.cells[r][c]);
      }
    }
  }
}

/* ============================================================
   Hex Grid (pointy-top, offset columns)
   ============================================================ */

class HexGrid extends Grid {
  constructor(cols, rows, cellSize) {
    super('hex', cols, rows, cellSize);

    // Hex width = cellSize. Height rounded to whole pixels to prevent sub-pixel gaps.
    this.hexW = cellSize;
    this.hexH = Math.round(cellSize * 2 / Math.sqrt(3));
    // Derive effective horizontal spacing
    this.colSpacing = this.hexW * 0.75;
    this.rowSpacing = this.hexH;

    this.cells = [];
    for (let r = 0; r < rows; r++) {
      this.cells[r] = [];
      for (let c = 0; c < cols; c++) {
        this.cells[r][c] = { base: null, overlays: [], rotation: 0, flipH: false, flipV: false };
      }
    }
  }

  get widthPx() {
    return this.colSpacing * (this.cols - 1) + this.hexW;
  }

  get heightPx() {
    return this.rowSpacing * this.rows + this.hexH / 2;
  }

  /** Center of hex at (col, row) */
  gridToPixel(col, row) {
    const x = col * this.colSpacing + this.hexW / 2;
    const yOffset = (col % 2 === 1) ? this.hexH / 2 : 0;
    const y = row * this.rowSpacing + this.hexH / 2 + yOffset;
    return { x, y };
  }

  /** Top-left bounding box origin for drawing */
  cellOrigin(col, row) {
    const center = this.gridToPixel(col, row);
    return { x: center.x - this.hexW / 2, y: center.y - this.hexH / 2 };
  }

  /** Nearest-hex: find closest hex center by brute-force distance check.
   *  More robust than analytical cube-coord conversion with custom spacing. */
  pixelToGrid(px, py) {
    // Quick estimate to narrow search
    const estCol = Math.round((px - this.hexW / 2) / this.colSpacing);
    const estRow = Math.round((py - this.hexH / 2) / this.rowSpacing);

    let bestCol = -1, bestRow = -1, bestDist = Infinity;

    // Check a small neighborhood around the estimate
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const c = estCol + dc;
        const r = estRow + dr;
        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) continue;
        const center = this.gridToPixel(c, r);
        const dx = px - center.x;
        const dy = py - center.y;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestCol = c;
          bestRow = r;
        }
      }
    }

    if (bestCol < 0) return null;

    // Verify the point is actually inside (or close to) the hex
    const center = this.gridToPixel(bestCol, bestRow);
    const dx = Math.abs(px - center.x) / (this.hexW / 2);
    const dy = Math.abs(py - center.y) / (this.hexH / 2);
    if (dx > 1.1 || dy > 1.1) return null;

    return { col: bestCol, row: bestRow };
  }

  getCellPath(col, row) {
    const center = this.gridToPixel(col, row);
    const path = new Path2D();
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 180 * (60 * i - 30); // pointy-top
      const vx = center.x + (this.hexW / 2) * Math.cos(angle);
      const vy = center.y + (this.hexH / 2) * Math.sin(angle);
      if (i === 0) path.moveTo(vx, vy);
      else path.lineTo(vx, vy);
    }
    path.closePath();
    return path;
  }

  getCell(col, row) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    return this.cells[row][col];
  }

  setBase(col, row, tileId) {
    const cell = this.getCell(col, row);
    if (!cell || cell.base === tileId) return false;
    cell.base = tileId;
    return true;
  }

  getNeighbors(col, row) {
    const isOdd = col % 2 === 1;
    const offsets = isOdd
      ? [[-1, 0], [1, 0], [-1, 1], [0, 1], [0, -1], [1, 1]]
      : [[-1, -1], [1, -1], [-1, 0], [0, -1], [0, 1], [1, 0]];
    return offsets
      .map(([dc, dr]) => ({ col: col + dc, row: row + dr }))
      .filter(n => this.getCell(n.col, n.row));
  }

  floodFill(col, row, tileId, maxCells = 500) {
    const startCell = this.getCell(col, row);
    if (!startCell) return [];
    const targetBase = startCell.base;
    if (targetBase === tileId) return [];

    const queue = [{ col, row }];
    const visited = new Set([`${col},${row}`]);
    const filled = [];

    while (queue.length > 0 && filled.length < maxCells) {
      const cur = queue.shift();
      const cell = this.getCell(cur.col, cur.row);
      if (!cell || cell.base !== targetBase) continue;
      cell.base = tileId;
      filled.push(cur);

      for (const n of this.getNeighbors(cur.col, cur.row)) {
        const key = `${n.col},${n.row}`;
        if (!visited.has(key)) {
          visited.add(key);
          const nc = this.getCell(n.col, n.row);
          if (nc && nc.base === targetBase) queue.push(n);
        }
      }
    }
    return filled;
  }

  drawGridLines(ctx, gridColor) {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const center = this.gridToPixel(c, r);
        for (let i = 0; i < 6; i++) {
          const angle = Math.PI / 180 * (60 * i - 30);
          const nextAngle = Math.PI / 180 * (60 * (i + 1) - 30);
          const x1 = center.x + (this.hexW / 2) * Math.cos(angle);
          const y1 = center.y + (this.hexH / 2) * Math.sin(angle);
          const x2 = center.x + (this.hexW / 2) * Math.cos(nextAngle);
          const y2 = center.y + (this.hexH / 2) * Math.sin(nextAngle);
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
        }
      }
    }
    ctx.stroke();
  }

  forEachCell(cb) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        cb(c, r, this.cells[r][c]);
      }
    }
  }
}

/* ============================================================
   Isometric Diamond Grid (45° rotated squares)
   ============================================================ */

class DiamondGrid extends Grid {
  constructor(cols, rows, cellSize) {
    super('diamond', cols, rows, cellSize);
    this.dW = cellSize;        // diamond full width
    this.dH = cellSize / 2;    // diamond full height

    this.cells = [];
    for (let r = 0; r < rows; r++) {
      this.cells[r] = [];
      for (let c = 0; c < cols; c++) {
        this.cells[r][c] = { base: null, overlays: [], rotation: 0, flipH: false, flipV: false };
      }
    }
  }

  get widthPx() {
    return (this.cols + this.rows) * (this.dW / 2);
  }

  get heightPx() {
    return (this.cols + this.rows) * (this.dH / 2);
  }

  /** Center of diamond at (col, row) */
  gridToPixel(col, row) {
    const x = (col - row) * (this.dW / 2) + this.rows * (this.dW / 2);
    const y = (col + row) * (this.dH / 2) + this.dH / 2;
    return { x, y };
  }

  /** Top-left bounding box for drawing */
  cellOrigin(col, row) {
    const center = this.gridToPixel(col, row);
    return { x: center.x - this.dW / 2, y: center.y - this.dH / 2 };
  }

  /** Pixel to diamond: inverse of gridToPixel using -45° rotation */
  pixelToGrid(px, py) {
    // Invert the isometric transform
    const adjX = px - this.rows * (this.dW / 2);
    const adjY = py - this.dH / 2;

    const col = Math.floor((adjX / (this.dW / 2) + adjY / (this.dH / 2)) / 2);
    const row = Math.floor((adjY / (this.dH / 2) - adjX / (this.dW / 2)) / 2);

    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;

    // Verify point is actually inside the diamond (not just bounding box)
    const center = this.gridToPixel(col, row);
    const dx = Math.abs(px - center.x) / (this.dW / 2);
    const dy = Math.abs(py - center.y) / (this.dH / 2);
    if (dx + dy > 1.0) return null;

    return { col, row };
  }

  getCellPath(col, row) {
    const center = this.gridToPixel(col, row);
    const hw = this.dW / 2;
    const hh = this.dH / 2;
    const path = new Path2D();
    path.moveTo(center.x, center.y - hh);      // top
    path.lineTo(center.x + hw, center.y);       // right
    path.lineTo(center.x, center.y + hh);       // bottom
    path.lineTo(center.x - hw, center.y);       // left
    path.closePath();
    return path;
  }

  getCell(col, row) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    return this.cells[row][col];
  }

  setBase(col, row, tileId) {
    const cell = this.getCell(col, row);
    if (!cell || cell.base === tileId) return false;
    cell.base = tileId;
    return true;
  }

  getNeighbors(col, row) {
    // 4 neighbors: N, S, E, W in isometric space
    return [
      { col: col, row: row - 1 },   // N
      { col: col, row: row + 1 },   // S
      { col: col + 1, row: row },   // E
      { col: col - 1, row: row }    // W
    ].filter(n => this.getCell(n.col, n.row));
  }

  floodFill(col, row, tileId, maxCells = 500) {
    const startCell = this.getCell(col, row);
    if (!startCell) return [];
    const targetBase = startCell.base;
    if (targetBase === tileId) return [];

    const queue = [{ col, row }];
    const visited = new Set([`${col},${row}`]);
    const filled = [];

    while (queue.length > 0 && filled.length < maxCells) {
      const cur = queue.shift();
      const cell = this.getCell(cur.col, cur.row);
      if (!cell || cell.base !== targetBase) continue;
      cell.base = tileId;
      filled.push(cur);

      for (const n of this.getNeighbors(cur.col, cur.row)) {
        const key = `${n.col},${n.row}`;
        if (!visited.has(key)) {
          visited.add(key);
          const nc = this.getCell(n.col, n.row);
          if (nc && nc.base === targetBase) queue.push(n);
        }
      }
    }
    return filled;
  }

  drawGridLines(ctx, gridColor) {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const center = this.gridToPixel(c, r);
        const hw = this.dW / 2;
        const hh = this.dH / 2;
        ctx.moveTo(center.x, center.y - hh);
        ctx.lineTo(center.x + hw, center.y);
        ctx.lineTo(center.x, center.y + hh);
        ctx.lineTo(center.x - hw, center.y);
        ctx.closePath();
      }
    }
    ctx.stroke();
  }

  forEachCell(cb) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        cb(c, r, this.cells[r][c]);
      }
    }
  }
}

/* ============================================================
   Octagon Grid (octagons + square fillers)
   ============================================================ */

class OctagonGrid extends Grid {
  constructor(cols, rows, cellSize) {
    super('octagon', cols, rows, cellSize);

    // Octagon side length from cellSize
    // Octagon fits in a square of size cellSize.
    // Side = cellSize / (1 + sqrt(2))
    this.octSize = cellSize;
    this.side = cellSize / (1 + Math.SQRT2);
    this.sqSize = this.side; // filler square size = octagon side length

    // Spacing between octagon centers
    this.spacing = this.octSize + this.sqSize;

    // Oct cells [row][col]
    this.octCells = [];
    for (let r = 0; r < rows; r++) {
      this.octCells[r] = [];
      for (let c = 0; c < cols; c++) {
        this.octCells[r][c] = { base: null, overlays: [], rotation: 0, flipH: false, flipV: false };
      }
    }

    // Square filler cells between octagons: (cols-1) x (rows-1)
    this.sqCells = [];
    for (let r = 0; r < rows - 1; r++) {
      this.sqCells[r] = [];
      for (let c = 0; c < cols - 1; c++) {
        this.sqCells[r][c] = { base: null, overlays: [], rotation: 0, flipH: false, flipV: false };
      }
    }
  }

  get widthPx() {
    return this.cols * this.octSize + (this.cols - 1) * this.sqSize;
  }

  get heightPx() {
    return this.rows * this.octSize + (this.rows - 1) * this.sqSize;
  }

  /** Center of octagon or filler square */
  gridToPixel(col, row, cellType = 'oct') {
    if (cellType === 'sq') {
      // Filler square center is between 4 octagons
      const x = (col + 1) * this.octSize + col * this.sqSize + this.sqSize / 2;
      const y = (row + 1) * this.octSize + row * this.sqSize + this.sqSize / 2;
      return { x, y };
    }
    // Octagon center
    const x = col * (this.octSize + this.sqSize) + this.octSize / 2;
    const y = row * (this.octSize + this.sqSize) + this.octSize / 2;
    return { x, y };
  }

  cellOrigin(col, row, cellType = 'oct') {
    const center = this.gridToPixel(col, row, cellType);
    if (cellType === 'sq') {
      return { x: center.x - this.sqSize / 2, y: center.y - this.sqSize / 2 };
    }
    return { x: center.x - this.octSize / 2, y: center.y - this.octSize / 2 };
  }

  getCellPath(col, row, cellType = 'oct') {
    const center = this.gridToPixel(col, row, cellType);
    const path = new Path2D();

    if (cellType === 'sq') {
      const hs = this.sqSize / 2;
      path.rect(center.x - hs, center.y - hs, this.sqSize, this.sqSize);
      return path;
    }

    // Regular octagon
    const hs = this.octSize / 2;
    const inset = this.side / 2;  // inset from corner for the cut
    path.moveTo(center.x - hs + inset, center.y - hs);               // top-left after cut
    path.lineTo(center.x + hs - inset, center.y - hs);               // top-right before cut
    path.lineTo(center.x + hs, center.y - hs + inset);               // right-top after cut
    path.lineTo(center.x + hs, center.y + hs - inset);               // right-bottom before cut
    path.lineTo(center.x + hs - inset, center.y + hs);               // bottom-right after cut
    path.lineTo(center.x - hs + inset, center.y + hs);               // bottom-left before cut
    path.lineTo(center.x - hs, center.y + hs - inset);               // left-bottom after cut
    path.lineTo(center.x - hs, center.y - hs + inset);               // left-top before cut
    path.closePath();
    return path;
  }

  pixelToGrid(px, py) {
    const spacing = this.spacing;
    // Estimate which oct cell we're near
    const estCol = Math.round((px - this.octSize / 2) / spacing);
    const estRow = Math.round((py - this.octSize / 2) / spacing);

    // Check filler squares in the neighborhood first (they sit in corners)
    for (let dr = -1; dr <= 0; dr++) {
      for (let dc = -1; dc <= 0; dc++) {
        const sc = estCol + dc;
        const sr = estRow + dr;
        if (sc < 0 || sc >= this.cols - 1 || sr < 0 || sr >= this.rows - 1) continue;
        const center = this.gridToPixel(sc, sr, 'sq');
        const hs = this.sqSize / 2;
        if (px >= center.x - hs && px <= center.x + hs &&
            py >= center.y - hs && py <= center.y + hs) {
          return { col: sc, row: sr, cellType: 'sq' };
        }
      }
    }

    // Check octagons in the neighborhood
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const oc = estCol + dc;
        const or2 = estRow + dr;
        if (oc < 0 || oc >= this.cols || or2 < 0 || or2 >= this.rows) continue;
        const center = this.gridToPixel(oc, or2, 'oct');
        const hs = this.octSize / 2;
        const dx = Math.abs(px - center.x);
        const dy = Math.abs(py - center.y);
        if (dx > hs || dy > hs) continue;
        // Inside octagon if not in the cut corners
        const inset = this.side / 2;
        if (dx + dy <= hs + (hs - inset)) {
          return { col: oc, row: or2, cellType: 'oct' };
        }
      }
    }

    return null;
  }

  getCell(col, row, cellType = 'oct') {
    if (cellType === 'sq') {
      if (row < 0 || row >= this.rows - 1 || col < 0 || col >= this.cols - 1) return null;
      return this.sqCells[row][col];
    }
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    return this.octCells[row][col];
  }

  setBase(col, row, tileId, cellType = 'oct') {
    const cell = this.getCell(col, row, cellType);
    if (!cell || cell.base === tileId) return false;
    cell.base = tileId;
    return true;
  }

  getNeighbors(col, row, cellType = 'oct') {
    const neighbors = [];
    if (cellType === 'oct') {
      // Octagon neighbors: 4 adjacent octagons + up to 4 adjacent squares
      if (this.getCell(col, row - 1, 'oct')) neighbors.push({ col, row: row - 1, cellType: 'oct' });
      if (this.getCell(col, row + 1, 'oct')) neighbors.push({ col, row: row + 1, cellType: 'oct' });
      if (this.getCell(col - 1, row, 'oct')) neighbors.push({ col: col - 1, row, cellType: 'oct' });
      if (this.getCell(col + 1, row, 'oct')) neighbors.push({ col: col + 1, row, cellType: 'oct' });
      // Adjacent filler squares (4 diagonal corners)
      if (this.getCell(col - 1, row - 1, 'sq')) neighbors.push({ col: col - 1, row: row - 1, cellType: 'sq' });
      if (this.getCell(col, row - 1, 'sq')) neighbors.push({ col, row: row - 1, cellType: 'sq' });
      if (this.getCell(col - 1, row, 'sq')) neighbors.push({ col: col - 1, row, cellType: 'sq' });
      if (this.getCell(col, row, 'sq')) neighbors.push({ col, row, cellType: 'sq' });
    } else {
      // Square filler neighbors: 4 surrounding octagons
      if (this.getCell(col, row, 'oct')) neighbors.push({ col, row, cellType: 'oct' });
      if (this.getCell(col + 1, row, 'oct')) neighbors.push({ col: col + 1, row, cellType: 'oct' });
      if (this.getCell(col, row + 1, 'oct')) neighbors.push({ col, row: row + 1, cellType: 'oct' });
      if (this.getCell(col + 1, row + 1, 'oct')) neighbors.push({ col: col + 1, row: row + 1, cellType: 'oct' });
    }
    return neighbors;
  }

  floodFill(col, row, tileId, maxCells = 500, cellType = 'oct') {
    const startCell = this.getCell(col, row, cellType);
    if (!startCell) return [];
    const targetBase = startCell.base;
    if (targetBase === tileId) return [];

    const queue = [{ col, row, cellType }];
    const visited = new Set([`${cellType},${col},${row}`]);
    const filled = [];

    while (queue.length > 0 && filled.length < maxCells) {
      const cur = queue.shift();
      const cell = this.getCell(cur.col, cur.row, cur.cellType);
      if (!cell || cell.base !== targetBase) continue;
      cell.base = tileId;
      filled.push(cur);

      for (const n of this.getNeighbors(cur.col, cur.row, cur.cellType)) {
        const key = `${n.cellType},${n.col},${n.row}`;
        if (!visited.has(key)) {
          visited.add(key);
          const nc = this.getCell(n.col, n.row, n.cellType);
          if (nc && nc.base === targetBase) queue.push(n);
        }
      }
    }
    return filled;
  }

  drawGridLines(ctx, gridColor) {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();

    // Draw octagons
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const center = this.gridToPixel(c, r, 'oct');
        const hs = this.octSize / 2;
        const inset = this.side / 2;
        ctx.moveTo(center.x - hs + inset, center.y - hs);
        ctx.lineTo(center.x + hs - inset, center.y - hs);
        ctx.lineTo(center.x + hs, center.y - hs + inset);
        ctx.lineTo(center.x + hs, center.y + hs - inset);
        ctx.lineTo(center.x + hs - inset, center.y + hs);
        ctx.lineTo(center.x - hs + inset, center.y + hs);
        ctx.lineTo(center.x - hs, center.y + hs - inset);
        ctx.lineTo(center.x - hs, center.y - hs + inset);
        ctx.closePath();
      }
    }

    // Draw filler squares
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < this.cols - 1; c++) {
        const center = this.gridToPixel(c, r, 'sq');
        const hs = this.sqSize / 2;
        ctx.moveTo(center.x - hs, center.y - hs);
        ctx.lineTo(center.x + hs, center.y - hs);
        ctx.lineTo(center.x + hs, center.y + hs);
        ctx.lineTo(center.x - hs, center.y + hs);
        ctx.closePath();
      }
    }

    ctx.stroke();
  }

  forEachCell(cb) {
    // Octagons first
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        cb(c, r, this.octCells[r][c], 'oct');
      }
    }
    // Then filler squares
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < this.cols - 1; c++) {
        cb(c, r, this.sqCells[r][c], 'sq');
      }
    }
  }
}
