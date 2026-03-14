/* Magical Map Maker — Grid Rendering (Square) */

class Grid {
  constructor(cols, rows, cellSize) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    this.shape = 'square';

    // cells[row][col] = { base: null, overlays: [], rotation: 0, flipH: false, flipV: false }
    this.cells = [];
    for (let r = 0; r < rows; r++) {
      this.cells[r] = [];
      for (let c = 0; c < cols; c++) {
        this.cells[r][c] = { base: null, overlays: [], rotation: 0, flipH: false, flipV: false };
      }
    }
  }

  get widthPx() {
    return this.cols * this.cellSize;
  }

  get heightPx() {
    return this.rows * this.cellSize;
  }

  /** Convert world pixel coords to grid {col, row} or null if out of bounds */
  pixelToGrid(x, y) {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
    return { col, row };
  }

  /** Convert grid coords to world pixel origin {x, y} of the cell */
  gridToPixel(col, row) {
    return {
      x: col * this.cellSize,
      y: row * this.cellSize
    };
  }

  /** Get Path2D for a cell (for hit testing or clipping) */
  getCellPath(col, row) {
    const { x, y } = this.gridToPixel(col, row);
    const path = new Path2D();
    path.rect(x, y, this.cellSize, this.cellSize);
    return path;
  }

  /** Get cell data, or null if out of bounds */
  getCell(col, row) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    return this.cells[row][col];
  }

  /** Set base tile on a cell. Returns true if changed. */
  setBase(col, row, tileId) {
    const cell = this.getCell(col, row);
    if (!cell) return false;
    if (cell.base === tileId) return false;
    cell.base = tileId;
    return true;
  }

  /** Flood fill from (col, row) with tileId. BFS, max cells limit. Returns array of filled {col, row}. */
  floodFill(col, row, tileId, maxCells = 500) {
    const startCell = this.getCell(col, row);
    if (!startCell) return [];

    const targetBase = startCell.base;
    if (targetBase === tileId) return [];

    const queue = [{ col, row }];
    const visited = new Set();
    visited.add(`${col},${row}`);
    const filledCells = [];

    while (queue.length > 0 && filledCells.length < maxCells) {
      const { col: c, row: r } = queue.shift();
      const cell = this.getCell(c, r);
      if (!cell || cell.base !== targetBase) continue;

      cell.base = tileId;
      filledCells.push({ col: c, row: r });

      // 4-directional neighbors
      const neighbors = [
        { col: c - 1, row: r },
        { col: c + 1, row: r },
        { col: c, row: r - 1 },
        { col: c, row: r + 1 }
      ];

      for (const n of neighbors) {
        const key = `${n.col},${n.row}`;
        if (!visited.has(key)) {
          visited.add(key);
          const nc = this.getCell(n.col, n.row);
          if (nc && nc.base === targetBase) {
            queue.push(n);
          }
        }
      }
    }

    return filledCells;
  }

  /** Draw grid lines (batched into two paths for performance) */
  drawGridLines(ctx, gridColor) {
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;

    // Vertical lines — single path
    ctx.beginPath();
    for (let c = 0; c <= this.cols; c++) {
      const x = c * this.cellSize;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.heightPx);
    }
    ctx.stroke();

    // Horizontal lines — single path
    ctx.beginPath();
    for (let r = 0; r <= this.rows; r++) {
      const y = r * this.cellSize;
      ctx.moveTo(0, y);
      ctx.lineTo(this.widthPx, y);
    }
    ctx.stroke();
  }
}
