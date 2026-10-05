import { describe, it, expect } from 'vitest';
import { sortRows, nextSort } from './sortRows';

type Row = { name: string; n: number | null };
const rows: Row[] = [
  { name: 'גימל', n: 3 },
  { name: 'אלף', n: null },
  { name: 'בית', n: 10 },
];
const val = (r: Row, k: 'name' | 'n') => r[k];

describe('sortRows', () => {
  it('sorts numbers numerically, empty values last', () => {
    expect(sortRows(rows, { key: 'n', dir: 'asc' }, val).map((r) => r.n)).toEqual([3, 10, null]);
    expect(sortRows(rows, { key: 'n', dir: 'desc' }, val).map((r) => r.n)).toEqual([10, 3, null]);
  });

  it('sorts Hebrew strings alphabetically', () => {
    expect(sortRows(rows, { key: 'name', dir: 'asc' }, val).map((r) => r.name)).toEqual(['אלף', 'בית', 'גימל']);
  });

  it('does not mutate the input', () => {
    sortRows(rows, { key: 'name', dir: 'asc' }, val);
    expect(rows[0].name).toBe('גימל');
  });
});

describe('nextSort', () => {
  it('toggles direction on the same key and resets on a new key', () => {
    expect(nextSort({ key: 'a', dir: 'asc' }, 'a')).toEqual({ key: 'a', dir: 'desc' });
    expect(nextSort<'a' | 'b'>({ key: 'a', dir: 'desc' }, 'b')).toEqual({ key: 'b', dir: 'asc' });
  });
});
