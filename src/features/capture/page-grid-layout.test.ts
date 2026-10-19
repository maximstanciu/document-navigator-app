import {
  autoScrollStep,
  gridHeight,
  gridMetrics,
  moveItem,
  PAGE_ASPECT_RATIO,
  slotAt,
  slotOrigin,
} from './page-grid-layout';

// 3 columns of 100 × 140.85 with 10 between them.
const grid = gridMetrics(320, 3, 10);
const rowHeight = 100 / PAGE_ASPECT_RATIO + 10;

describe('gridMetrics', () => {
  it('fills the width with equal cells in the shape of a page', () => {
    expect(grid.cellWidth).toBe(100);
    expect(grid.cellHeight).toBeCloseTo(140.85, 2);
  });

  it('has empty cells before the width is known', () => {
    expect(gridMetrics(0, 3, 10).cellWidth).toBe(0);
  });
});

describe('gridHeight', () => {
  it('counts full and partly filled rows, with gaps only between them', () => {
    expect(gridHeight(0, grid)).toBe(0);
    expect(gridHeight(1, grid)).toBeCloseTo(grid.cellHeight);
    expect(gridHeight(3, grid)).toBeCloseTo(grid.cellHeight);
    expect(gridHeight(4, grid)).toBeCloseTo(2 * grid.cellHeight + 10);
  });
});

describe('slotOrigin', () => {
  it('goes row by row from the top-left', () => {
    expect(slotOrigin(0, grid)).toEqual({ x: 0, y: 0 });
    expect(slotOrigin(2, grid)).toEqual({ x: 220, y: 0 });
    expect(slotOrigin(4, grid)).toEqual({ x: 110, y: rowHeight });
  });
});

describe('slotAt', () => {
  it('finds the cell under a point', () => {
    expect(slotAt({ x: 50, y: 50 }, 6, grid)).toBe(0);
    expect(slotAt({ x: 150, y: rowHeight + 50 }, 6, grid)).toBe(4);
  });

  it('gives a point in a gap to the nearer cell', () => {
    expect(slotAt({ x: 104, y: 50 }, 6, grid)).toBe(0);
    expect(slotAt({ x: 106, y: 50 }, 6, grid)).toBe(1);
    expect(slotAt({ x: 50, y: rowHeight - 6 }, 6, grid)).toBe(0);
    expect(slotAt({ x: 50, y: rowHeight - 4 }, 6, grid)).toBe(3);
  });

  it('keeps a point outside the grid to the nearest slot', () => {
    expect(slotAt({ x: -40, y: -40 }, 6, grid)).toBe(0);
    expect(slotAt({ x: 500, y: 50 }, 6, grid)).toBe(2);
    // Below the last, partly filled row: the last page.
    expect(slotAt({ x: 250, y: 5 * rowHeight }, 5, grid)).toBe(4);
  });
});

describe('moveItem', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('moves an item later, shifting the ones in between earlier', () => {
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an item earlier, shifting the ones in between later', () => {
    expect(moveItem(items, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('leaves the order as it is for the same place or a place out of range', () => {
    expect(moveItem(items, 1, 1)).toEqual(items);
    expect(moveItem(items, -1, 2)).toEqual(items);
    expect(moveItem(items, 1, 4)).toEqual(items);
  });

  it('returns a copy', () => {
    const moved = moveItem(items, 0, 1);
    expect(moved).not.toBe(items);
    expect(items).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('autoScrollStep', () => {
  it('scrolls up near the top and down near the bottom, faster closer to the edge', () => {
    expect(autoScrollStep(0, 600, 80, 12)).toBe(-12);
    expect(autoScrollStep(40, 600, 80, 12)).toBe(-6);
    expect(autoScrollStep(560, 600, 80, 12)).toBe(6);
    expect(autoScrollStep(620, 600, 80, 12)).toBe(12);
  });

  it("doesn't scroll in the middle", () => {
    expect(autoScrollStep(80, 600, 80, 12)).toBe(0);
    expect(autoScrollStep(300, 600, 80, 12)).toBe(0);
    expect(autoScrollStep(520, 600, 80, 12)).toBe(0);
  });

  it('keeps the edge zones apart in a short viewport, and does nothing before it is measured', () => {
    expect(autoScrollStep(60, 120, 80, 12)).toBe(0);
    expect(autoScrollStep(0, 0, 80, 12)).toBe(0);
  });
});
