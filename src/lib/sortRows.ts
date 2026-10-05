export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/**
 * מיון טבלה לפי עמודה: מספרים מספרית, מחרוזות לפי סדר עברי, וערכים ריקים (null/
 * undefined/מחרוזת ריקה) תמיד בסוף, בלי תלות בכיוון. לא משנה את המערך המקורי.
 */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: SortState<K>,
  valueOf: (row: T, key: K) => string | number | boolean | null | undefined,
): T[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const empty = (v: unknown) => v == null || v === '';
  return [...rows].sort((a, b) => {
    const va = valueOf(a, sort.key);
    const vb = valueOf(b, sort.key);
    if (empty(va) && empty(vb)) return 0;
    if (empty(va)) return 1;
    if (empty(vb)) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
    if (typeof va === 'boolean' && typeof vb === 'boolean') return (Number(va) - Number(vb)) * sign;
    return String(va).localeCompare(String(vb), 'he') * sign;
  });
}

/** לחיצה על כותרת: אותה עמודה הופכת כיוון, עמודה חדשה מתחילה בעולה. */
export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  return current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' };
}
