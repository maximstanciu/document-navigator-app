/**
 * Geometry of the page grid on the review screen and the page order while a page is dragged
 * (CAP-6). Plain functions marked as worklets: the drag runs them on the UI thread, tests call them
 * directly.
 */

/** Close to A4, the most common page shape: width / height. */
export const PAGE_ASPECT_RATIO = 0.71;

export type GridMetrics = {
  columns: number;
  cellWidth: number;
  cellHeight: number;
  gap: number;
};

export type Point = { x: number; y: number };

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/** Cells of equal width that fill `width` with `gap` between them, each the shape of a page. */
export function gridMetrics(width: number, columns: number, gap: number): GridMetrics {
  const cellWidth = Math.max(0, (width - gap * (columns - 1)) / columns);
  return { columns, cellWidth, cellHeight: cellWidth / PAGE_ASPECT_RATIO, gap };
}

/** Height of a grid with `count` cells. */
export function gridHeight(count: number, grid: GridMetrics): number {
  const rows = Math.ceil(count / grid.columns);
  return rows === 0 ? 0 : rows * grid.cellHeight + (rows - 1) * grid.gap;
}

/** Top-left corner of the cell at `slot`, counted row by row from the top-left. */
export function slotOrigin(slot: number, grid: GridMetrics): Point {
  'worklet';
  const column = slot % grid.columns;
  const row = Math.floor(slot / grid.columns);
  return { x: column * (grid.cellWidth + grid.gap), y: row * (grid.cellHeight + grid.gap) };
}

/**
 * The slot under `point` among `count` cells. A point in a gap belongs to the nearer cell; a point
 * outside the grid, to the nearest slot.
 */
export function slotAt(point: Point, count: number, grid: GridMetrics): number {
  'worklet';
  const column = clamp(
    Math.floor((point.x + grid.gap / 2) / (grid.cellWidth + grid.gap)),
    0,
    grid.columns - 1
  );
  const row = Math.max(0, Math.floor((point.y + grid.gap / 2) / (grid.cellHeight + grid.gap)));
  return clamp(row * grid.columns + column, 0, count - 1);
}

/** A copy of `items` with the item at `from` moved to `to`; the ones in between shift by one. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  'worklet';
  const result = items.slice();
  if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) {
    return result;
  }
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

/**
 * How far to scroll in one frame while a page is dragged near an edge of the visible area: negative
 * near the top, positive near the bottom, faster the closer it is to the edge, `0` elsewhere.
 * `y` is the dragged point within the visible area of `viewportHeight`.
 */
export function autoScrollStep(
  y: number,
  viewportHeight: number,
  edge: number,
  maxStep: number
): number {
  'worklet';
  // In a very short viewport the edge zones would overlap; keep them apart.
  const zone = Math.min(edge, viewportHeight / 3);
  if (zone <= 0) return 0;
  if (y < zone) return -maxStep * clamp((zone - y) / zone, 0, 1);
  if (y > viewportHeight - zone) return maxStep * clamp((y - (viewportHeight - zone)) / zone, 0, 1);
  return 0;
}
