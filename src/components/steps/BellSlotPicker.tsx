'use client';

import { useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

/** A bell-schedule slot as returned by /api/schedule/bell. */
export interface BellSlot {
  id: string;
  type: string;
  in: string;
  out: string;
  dailyHours: number;
  weekday: 'weekdays' | 'friday' | 'unknown';
}

/**
 * Searchable single-slot picker (combobox). The bell schedule can have ~200 distinct
 * time bands, so a plain dropdown is unusable — the user types e.g. "08:00" to filter.
 * Picking a slot reports it to the parent (which fills the day's entry/exit + hours).
 */
export function BellSlotPicker({
  slots,
  value,
  onPick,
  onClear,
}: {
  slots: BellSlot[];
  /** Currently selected slot id for this row, or null. */
  value: string | null;
  onPick: (slot: BellSlot) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = useMemo(() => slots.find((s) => s.id === value) ?? null, [slots, value]);

  const matches = useMemo(() => {
    const q = query.trim();
    const base = q ? slots.filter((s) => `${s.in}-${s.out}`.includes(q)) : slots;
    return base.slice(0, 50); // cap the rendered list
  }, [slots, query]);

  if (selected) {
    return (
      <div className="flex items-center gap-2 bg-secondary-container/40 rounded-lg py-2 px-3 w-72">
        <Icon name="schedule" className="text-primary text-[18px]" />
        <span className="font-bold text-on-surface">
          {selected.in}–{selected.out}
        </span>
        <span className="text-on-surface-variant text-label-sm">{selected.dailyHours} ש׳</span>
        <button onClick={onClear} aria-label="הסר רצועה" className="mr-auto">
          <Icon name="close" className="text-outline hover:text-error text-[18px]" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-72">
      <div className="flex items-center gap-2 bg-surface-container-low rounded-lg py-2 px-3">
        <Icon name="search" className="text-outline text-[18px]" />
        <input
          type="text"
          value={query}
          placeholder="חיפוש רצועה (למשל 08:00)…"
          onFocus={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            setOpen(true);
          }}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          className="bg-transparent text-body-md w-full outline-none"
        />
      </div>
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-auto bg-white rounded-lg shadow-card border border-outline-variant">
          {matches.length === 0 && (
            <li className="py-2 px-3 text-on-surface-variant text-label-sm">אין רצועות תואמות</li>
          )}
          {matches.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                // onMouseDown so the pick fires before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(s);
                  setQuery('');
                  setOpen(false);
                }}
                className="w-full text-right flex items-center gap-2 py-2 px-3 hover:bg-surface-container-low"
              >
                <span className="font-bold text-on-surface">
                  {s.in}–{s.out}
                </span>
                <span className="text-on-surface-variant text-label-sm mr-auto">
                  {s.dailyHours} ש׳
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
