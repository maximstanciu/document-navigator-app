import type { SqlValue } from './database';

export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

/** `?, ?, ?` for an `IN (...)` list. Callers must not pass an empty list. */
export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

/** Pattern for `LIKE ? ESCAPE '\'` that matches `value` anywhere, with `%` and `_` taken literally. */
export function containsPattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

export function toJson(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

/** Parses a JSON column; a corrupted value reads as `null` instead of crashing the screen. */
export function fromJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function toFlag(value: boolean): SqlValue {
  return value ? 1 : 0;
}

/**
 * Builds `col = ?, col = ?` from a patch, using only columns listed in `columns`.
 * Keys that are absent or `undefined` are skipped; `null` is written as SQL NULL.
 */
export function buildAssignments<P extends object>(
  patch: P,
  columns: {
    [K in keyof P]-?: { column: string; toSql: (value: NonNullable<P[K]> | null) => SqlValue };
  }
): { sql: string; params: SqlValue[] } {
  const parts: string[] = [];
  const params: SqlValue[] = [];
  for (const key of Object.keys(columns) as (keyof P)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    parts.push(`${columns[key].column} = ?`);
    params.push(columns[key].toSql(value as NonNullable<P[typeof key]> | null));
  }
  return { sql: parts.join(', '), params };
}
