'use client';

import { Icon } from '@/components/ui/Icon';
import type { SortState } from '@/lib/sortRows';

/** כותרת עמודה שלחיצה עליה ממיינת; חץ מציין את העמודה והכיוון הנוכחיים. */
export function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th className="px-4 py-3" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-primary ${active ? 'text-primary' : ''}`}
      >
        {label}
        <Icon
          name={active ? (sort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
          className={`text-[16px] ${active ? '' : 'opacity-40'}`}
        />
      </button>
    </th>
  );
}
