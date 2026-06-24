'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { Footer } from '@/components/shell/Footer';
import type { PositionSummary } from '@/app/api/positions/route';
import { DAYS, MOTZASH, DAY_LABELS, type Day, type Shift } from '@/lib/schedule/time';

type WeekData = Record<Day, Shift[]>;

// ── helpers ────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return parts[0][0] + parts[1][0];
  return name.slice(0, 2);
}

const AVATAR_COLORS = [
  'bg-primary-fixed-dim text-on-primary-fixed-variant',
  'bg-secondary-fixed text-on-secondary-fixed-variant',
  'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  'bg-secondary-container text-on-secondary-container',
];

function formatDate(iso: string): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('he-IL'); }
  catch { return iso; }
}

// ── filter types ────────────────────────────────────────────────────────────

type ColType = 'text' | 'number' | 'date' | 'select';

interface ColDef {
  key: keyof PositionSummary;
  label: string;
  type: ColType;
  options?: string[]; // for select
}

const COLUMNS: ColDef[] = [
  { key: 'employeeName',       label: 'שם עובד',        type: 'text' },
  { key: 'roleTitle',          label: 'תפקיד',          type: 'text' },
  { key: 'category',           label: 'קטגוריה',        type: 'select',
    options: ['הוראה', 'פרא רפואי', 'סייע', 'מנהלה', 'אחר'] },
  { key: 'weeklyHours',        label: 'שעות שבועיות',   type: 'number' },
  { key: 'frontalHours',       label: 'פרונטלי',        type: 'number' },
  { key: 'individualHours',    label: 'פרטני',          type: 'number' },
  { key: 'stayHoursHome',      label: 'שהייה מהבית',    type: 'number' },
  { key: 'stayHoursInstitution', label: 'שהייה מהמוסד', type: 'number' },
  { key: 'submittedAt',        label: 'תאריך הגשה',     type: 'date' },
];

type TextOp   = 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'starts_with';
type NumberOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';
type DateOp   = 'before' | 'after' | 'between' | 'equals';
type SelectOp = 'is' | 'is_not';

type FilterOp = TextOp | NumberOp | DateOp | SelectOp;

interface FilterRule {
  id: string;
  col: keyof PositionSummary;
  op: FilterOp;
  value: string;
  value2?: string; // for between
}

const TEXT_OPS: { value: TextOp; label: string }[] = [
  { value: 'contains',     label: 'מכיל' },
  { value: 'not_contains', label: 'אינו מכיל' },
  { value: 'equals',       label: 'שווה בדיוק' },
  { value: 'not_equals',   label: 'שונה מ-' },
  { value: 'starts_with',  label: 'מתחיל ב-' },
];

const NUMBER_OPS: { value: NumberOp; label: string }[] = [
  { value: 'eq',      label: '=' },
  { value: 'neq',     label: '≠' },
  { value: 'gt',      label: '>' },
  { value: 'gte',     label: '≥' },
  { value: 'lt',      label: '<' },
  { value: 'lte',     label: '≤' },
  { value: 'between', label: 'בין' },
];

const DATE_OPS: { value: DateOp; label: string }[] = [
  { value: 'before',  label: 'לפני' },
  { value: 'after',   label: 'אחרי' },
  { value: 'equals',  label: 'בדיוק' },
  { value: 'between', label: 'בין' },
];

const SELECT_OPS: { value: SelectOp; label: string }[] = [
  { value: 'is',     label: 'הוא' },
  { value: 'is_not', label: 'אינו' },
];

function opsForType(type: ColType): { value: FilterOp; label: string }[] {
  if (type === 'number') return NUMBER_OPS;
  if (type === 'date')   return DATE_OPS;
  if (type === 'select') return SELECT_OPS;
  return TEXT_OPS;
}

function defaultOpForType(type: ColType): FilterOp {
  if (type === 'number') return 'eq';
  if (type === 'date')   return 'after';
  if (type === 'select') return 'is';
  return 'contains';
}

function applyFilter(pos: PositionSummary, rule: FilterRule): boolean {
  const colDef = COLUMNS.find((c) => c.key === rule.col);
  if (!colDef) return true;
  const raw = pos[rule.col];
  const { type } = colDef;

  if (type === 'text' || type === 'select') {
    const haystack = String(raw ?? '').toLowerCase();
    const needle   = rule.value.toLowerCase();
    const op = rule.op as TextOp | SelectOp;
    if (op === 'contains'     || op === 'is')     return haystack.includes(needle);
    if (op === 'not_contains' || op === 'is_not') return !haystack.includes(needle);
    if (op === 'equals')      return haystack === needle;
    if (op === 'not_equals')  return haystack !== needle;
    if (op === 'starts_with') return haystack.startsWith(needle);
  }

  if (type === 'number') {
    const n   = Number(raw ?? 0);
    const v1  = Number(rule.value  || 0);
    const v2  = Number(rule.value2 || 0);
    const op  = rule.op as NumberOp;
    if (op === 'eq')      return n === v1;
    if (op === 'neq')     return n !== v1;
    if (op === 'gt')      return n > v1;
    if (op === 'gte')     return n >= v1;
    if (op === 'lt')      return n < v1;
    if (op === 'lte')     return n <= v1;
    if (op === 'between') return n >= v1 && n <= v2;
  }

  if (type === 'date') {
    const d  = new Date(String(raw ?? '')).getTime();
    const d1 = new Date(rule.value  || '').getTime();
    const d2 = new Date(rule.value2 || '').getTime();
    if (isNaN(d) || isNaN(d1)) return true;
    const op = rule.op as DateOp;
    if (op === 'before')  return d < d1;
    if (op === 'after')   return d > d1;
    if (op === 'equals')  return d === d1;
    if (op === 'between') return !isNaN(d2) && d >= d1 && d <= d2;
  }

  return true;
}

// ── filter panel ────────────────────────────────────────────────────────────

let _nextId = 1;
function uid() { return String(_nextId++); }

function FilterPanel({
  rules,
  onChange,
}: {
  rules: FilterRule[];
  onChange: (rules: FilterRule[]) => void;
}) {
  function addRule() {
    const col = COLUMNS[0];
    onChange([
      ...rules,
      { id: uid(), col: col.key, op: defaultOpForType(col.type), value: '', value2: '' },
    ]);
  }

  function removeRule(id: string) {
    onChange(rules.filter((r) => r.id !== id));
  }

  function updateRule(id: string, patch: Partial<FilterRule>) {
    onChange(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function changeCol(id: string, colKey: keyof PositionSummary) {
    const colDef = COLUMNS.find((c) => c.key === colKey)!;
    updateRule(id, { col: colKey, op: defaultOpForType(colDef.type), value: '', value2: '' });
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-4 mb-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-label-lg font-bold text-on-surface flex items-center gap-2">
          <Icon name="filter_list" className="text-[18px] text-primary" />
          סינון תקנים
        </span>
        <button
          onClick={addRule}
          className="flex items-center gap-1 text-primary text-label-sm font-bold hover:underline"
        >
          <Icon name="add" className="text-[16px]" />
          הוסף תנאי
        </button>
      </div>

      {rules.length === 0 && (
        <p className="text-on-surface-variant text-body-sm text-center py-2">
          אין תנאי סינון פעילים — לחץ &quot;הוסף תנאי&quot; להגדרה
        </p>
      )}

      <div className="flex flex-col gap-2">
        {rules.map((rule) => {
          const colDef = COLUMNS.find((c) => c.key === rule.col)!;
          const ops    = opsForType(colDef.type);
          const isBetween = rule.op === 'between';

          return (
            <div key={rule.id} className="flex items-center gap-2 flex-wrap">
              {/* Column picker */}
              <select
                value={rule.col}
                onChange={(e) => changeCol(rule.id, e.target.value as keyof PositionSummary)}
                className="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 min-w-[140px]"
              >
                {COLUMNS.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>

              {/* Operator picker */}
              <select
                value={rule.op}
                onChange={(e) => updateRule(rule.id, { op: e.target.value as FilterOp, value2: '' })}
                className="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 min-w-[100px]"
              >
                {ops.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>

              {/* Value input — type-aware */}
              {colDef.type === 'select' ? (
                <select
                  value={rule.value}
                  onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                  className="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 min-w-[140px]"
                >
                  <option value="">— בחר —</option>
                  {(colDef.options ?? []).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={colDef.type === 'number' ? 'number' : colDef.type === 'date' ? 'date' : 'text'}
                  value={rule.value}
                  onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                  placeholder={colDef.type === 'date' ? 'yyyy-mm-dd' : 'ערך…'}
                  className="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 min-w-[130px]"
                />
              )}

              {/* Second value for "between" */}
              {isBetween && (
                <>
                  <span className="text-on-surface-variant text-body-sm">עד</span>
                  <input
                    type={colDef.type === 'number' ? 'number' : 'date'}
                    value={rule.value2 ?? ''}
                    onChange={(e) => updateRule(rule.id, { value2: e.target.value })}
                    placeholder={colDef.type === 'date' ? 'yyyy-mm-dd' : 'ערך…'}
                    className="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2 text-body-sm text-on-surface outline-none focus:ring-2 focus:ring-primary/20 min-w-[130px]"
                  />
                </>
              )}

              <button
                onClick={() => removeRule(rule.id)}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-error-container/30 text-error transition-colors shrink-0"
                title="הסר תנאי"
              >
                <Icon name="close" className="text-[18px]" />
              </button>
            </div>
          );
        })}
      </div>

      {rules.length > 0 && (
        <div className="flex justify-end mt-3 pt-3 border-t border-outline-variant/30">
          <button
            onClick={() => onChange([])}
            className="text-on-surface-variant text-label-sm hover:underline"
          >
            נקה הכל
          </button>
        </div>
      )}
    </div>
  );
}

// ── sort header ─────────────────────────────────────────────────────────────

function SortTh({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = 'right',
}: {
  label: string;
  col: keyof PositionSummary;
  sortKey: keyof PositionSummary | null;
  sortDir: 'asc' | 'desc';
  onSort: (col: keyof PositionSummary) => void;
  align?: 'right' | 'center';
}) {
  const active = sortKey === col;
  return (
    <th
      className={`p-4 text-label-lg font-bold cursor-pointer select-none hover:bg-surface-container transition-colors ${align === 'center' ? 'text-center' : 'text-right'}`}
      onClick={() => onSort(col)}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'center' ? 'justify-center' : ''} ${active ? 'text-primary' : 'text-on-surface-variant'}`}>
        {label}
        <span className="text-[16px] leading-none">
          {active
            ? (sortDir === 'asc' ? '↑' : '↓')
            : <Icon name="swap_vert" className="text-[16px] opacity-40" />}
        </span>
      </span>
    </th>
  );
}

// ── stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: {
  icon: string; label: string; value: number | string;
  color: 'primary' | 'secondary' | 'tertiary' | 'error';
}) {
  const bg   = { primary: 'bg-primary-fixed', secondary: 'bg-secondary-container', tertiary: 'bg-tertiary-fixed', error: 'bg-error-container' };
  const text = { primary: 'text-primary',     secondary: 'text-secondary',          tertiary: 'text-tertiary',     error: 'text-error' };
  return (
    <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/50 flex flex-row-reverse items-center justify-between">
      <div className="text-right">
        <p className="text-label-sm text-on-surface-variant">{label}</p>
        <p className={`text-headline-md font-bold ${text[color]}`}>{value}</p>
      </div>
      <div className={`w-12 h-12 rounded-lg ${bg[color]} flex items-center justify-center ${text[color]}`}>
        <Icon name={icon} className="text-[22px]" />
      </div>
    </div>
  );
}

// ── week grid (expanded row) ─────────────────────────────────────────────────

function WeekGrid({ week }: { week: WeekData }) {
  const hasAny = DAYS.some((d) => (week[d] ?? []).some((s) => s.in && s.out));
  if (!hasAny) return <p className="text-on-surface-variant text-body-md py-2">אין ימי עבודה מוגדרים.</p>;
  // Show מוצ"ש only when it has shifts (regular schedules).
  const motzashHasShifts = (week[MOTZASH] ?? []).some((s) => s.in && s.out);
  const gridDays: readonly Day[] = motzashHasShifts ? [...DAYS, MOTZASH] : DAYS;
  return (
    <div className="grid grid-cols-3 gap-3">
      {gridDays.map((day) => {
        const shifts = (week[day] ?? []).filter((s) => s.in && s.out);
        const totalMin = shifts.reduce((s, sh) => {
          const [ih, im] = sh.in.split(':').map(Number);
          const [oh, om] = sh.out.split(':').map(Number);
          return s + (oh * 60 + om) - (ih * 60 + im);
        }, 0);
        const dayLabel = totalMin > 0 ? `${(totalMin / 60).toFixed(2)} שע׳` : null;
        return (
          <div
            key={day}
            className={`bg-white p-4 rounded-lg shadow-sm border ${shifts.length ? 'border-transparent hover:border-outline-variant' : 'border-outline-variant/30 opacity-40'}`}
          >
            <div className="flex items-start gap-6 flex-wrap">
              <div className="w-16 flex flex-col items-start gap-1 mt-1">
                <span className="font-bold text-primary text-body-md">{DAY_LABELS[day]}</span>
                {dayLabel && (
                  <span className="text-label-sm font-bold text-[#003466] bg-[#89f5e7] px-2 py-0.5 rounded-md">{dayLabel}</span>
                )}
              </div>
              <div className="flex-1 flex flex-col gap-2">
                {shifts.length > 0 ? shifts.map((s, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-bold text-on-surface-variant">כניסה</span>
                      <div className="bg-surface-container-low rounded-lg py-2 px-3 text-body-md w-28 text-center font-bold text-on-surface">{s.in}</div>
                    </div>
                    <span className="text-on-surface-variant mt-4">—</span>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-bold text-on-surface-variant">יציאה</span>
                      <div className="bg-surface-container-low rounded-lg py-2 px-3 text-body-md w-28 text-center font-bold text-on-surface">{s.out}</div>
                    </div>
                  </div>
                )) : <span className="text-on-surface-variant text-body-md mt-1">—</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── top nav (matches form TopNav) ────────────────────────────────────────────

function DashboardTopNav({ institution, onBack }: { institution: string; onBack: () => void }) {
  const [now, setNow] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function tick() {
      const d = new Date();
      setNow(`${d.toLocaleDateString('he-IL')} | ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`);
    }
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return (
    <header className="bg-surface-bright shadow-sm flex justify-between items-center w-full px-margin-desktop py-4 sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <Image src="/logo_meyuhadim.webp" alt="מיוחדים בחינוך" width={48} height={48} className="object-contain" />
        <span className="text-headline-md font-bold text-primary">מיוחדים בחינוך - מערכת תקציבים</span>
        <span className="text-label-lg font-bold px-3 py-1.5 rounded-lg bg-primary text-on-primary">
          ניהול תקנים
        </span>
      </div>
      <div className="flex items-center gap-4">
        {institution && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-tertiary-fixed/40 rounded-full text-tertiary">
            <Icon name="school" className="text-[18px]" />
            <span className="text-label-lg font-bold">{institution}</span>
          </div>
        )}
        <div className="flex flex-col items-end ml-4">
          <span className="text-label-lg font-bold text-primary">{now}</span>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container text-label-sm transition-colors"
          title="חזרה לתפריט המוסד"
        >
          <Icon name="arrow_forward" className="text-[18px]" />
          <span>תפריט</span>
        </button>
        <div className="h-10 w-10 rounded-full bg-primary-container flex items-center justify-center overflow-hidden border-2 border-outline-variant text-on-primary font-bold text-lg">
          {institution ? institution.trim().charAt(0) : <Icon name="person" />}
        </div>
      </div>
    </header>
  );
}

// ── main component ───────────────────────────────────────────────────────────

export function InstitutionDashboard({
  token,
  institutionName,
}: {
  token: string;
  institutionName: string;
}) {
  const router = useRouter();
  const [positions,     setPositions]     = useState<PositionSummary[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [deletingId,    setDeletingId]    = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set());
  const [weekCache,     setWeekCache]     = useState<Record<string, WeekData | 'loading' | 'error'>>({});
  const [search,        setSearch]        = useState('');
  const [sortKey,       setSortKey]       = useState<keyof PositionSummary | null>(null);
  const [sortDir,       setSortDir]       = useState<'asc' | 'desc'>('asc');
  const [showFilters,   setShowFilters]   = useState(false);
  const [filterRules,   setFilterRules]   = useState<FilterRule[]>([]);

  useEffect(() => {
    fetch(`/api/positions?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.positions) setPositions(j.positions);
        else setError('שגיאה בטעינת התקנים.');
      })
      .catch(() => setError('שגיאת רשת בטעינת התקנים.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    if (!weekCache[id]) {
      setWeekCache((prev) => ({ ...prev, [id]: 'loading' }));
      try {
        const res = await fetch(`/api/positions/${id}?token=${encodeURIComponent(token)}`);
        const j   = await res.json();
        setWeekCache((prev) => ({
          ...prev,
          [id]: res.ok && j.schedule?.week ? (j.schedule.week as WeekData) : 'error',
        }));
      } catch {
        setWeekCache((prev) => ({ ...prev, [id]: 'error' }));
      }
    }
  }

  async function handleDelete(positionId: string) {
    setDeletingId(positionId);
    setDeleteConfirm(null);
    try {
      const res = await fetch(`/api/positions/${positionId}?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
      const j   = await res.json();
      if (res.ok && j.ok) setPositions((prev) => prev.filter((p) => p.id !== positionId));
      else setError(j.message || 'שגיאה במחיקת התקן.');
    } catch {
      setError('שגיאת רשת במחיקת התקן.');
    } finally {
      setDeletingId(null);
    }
  }

  function handleSort(key: keyof PositionSummary) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  const activeFilterCount = filterRules.filter((r) => r.value !== '').length;

  const filtered = positions
    .filter((p) => {
      // free-text search
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !p.employeeName.toLowerCase().includes(q) &&
          !p.category.toLowerCase().includes(q) &&
          !p.subRole.toLowerCase().includes(q) &&
          !p.roleTitle.toLowerCase().includes(q)
        ) return false;
      }
      // structured filters (all must match)
      for (const rule of filterRules) {
        if (!rule.value && rule.op !== 'is_not') continue; // skip empty rules
        if (!applyFilter(p, rule)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (!sortKey) return 0;
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'he');
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const totalHours = positions.reduce((s, p) => s + p.weeklyHours, 0);

  return (
    <div className="min-h-screen flex flex-col bg-surface-bright" dir="rtl">
      <DashboardTopNav institution={institutionName} onBack={() => router.push(`/form/${encodeURIComponent(token)}`)} />

      <main className="flex-1 px-margin-desktop py-8">
        <div className="max-w-container-max mx-auto">

          {/* Page header row */}
          <div className="flex items-start justify-between mb-8 gap-4">
            {/* Title — right */}
            <div className="text-right">
              <h1 className="text-display-lg text-primary mb-1">ניהול תקנים</h1>
              <p className="text-body-lg text-on-surface-variant">צפייה וניהול של כל תקני העובדים במוסד</p>
            </div>

            {/* Actions — left */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Search */}
              <div className="relative">
                <Icon name="search" className="absolute right-3 top-1/2 -translate-y-1/2 text-outline text-[20px]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש…"
                  className="pr-10 py-2.5 pl-4 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary/20 text-right text-body-md outline-none w-64"
                />
              </div>

              {/* Filter toggle */}
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border font-bold text-label-lg transition-colors ${
                  showFilters || activeFilterCount > 0
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-surface-container-low border-outline-variant text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                <Icon name="filter_list" className="text-[20px]" />
                סינון
                {activeFilterCount > 0 && (
                  <span className="bg-on-primary text-primary text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Add button */}
              <button
                onClick={() => router.push(`/form/${encodeURIComponent(token)}/new`)}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-lg font-bold text-label-lg hover:opacity-90 active:scale-95 transition-all shadow-sm"
              >
                <Icon name="add" className="text-[20px]" />
                הוספת תקן חדש
              </button>
            </div>
          </div>

          {/* Stats */}
          {!loading && positions.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard icon="groups"          label='סה"כ תקנים'     value={positions.length} color="primary" />
              <StatCard icon="timer"           label="שעות שבועיות"   value={totalHours}       color="secondary" />
              <StatCard icon="pending_actions" label="ממתין לאישור"   value="—"                color="tertiary" />
              <StatCard icon="warning"         label="חריגות שעות"    value="—"                color="error" />
            </div>
          )}

          {/* Filter panel */}
          {showFilters && (
            <FilterPanel rules={filterRules} onChange={setFilterRules} />
          )}

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-error-container text-on-error-container rounded-xl flex items-center gap-2 text-body-md">
              <Icon name="error" />
              {error}
              <button className="mr-auto text-label-sm underline" onClick={() => setError('')}>סגור</button>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="text-center py-20 text-on-surface-variant">
              <Icon name="progress_activity" className="text-4xl animate-spin block mx-auto mb-4" />
              <p className="text-body-lg">טוען תקנים…</p>
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-20 bg-surface-container-lowest rounded-xl border border-outline-variant/50">
              <Icon name="work_off" className="text-5xl text-on-surface-variant block mx-auto mb-4" />
              <p className="text-headline-md text-on-surface-variant">אין תקנים פעילים כרגע</p>
              <p className="text-body-md text-on-surface-variant/70 mt-2">לחצו על &quot;הוספת תקן חדש&quot; כדי להתחיל</p>
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/50 overflow-hidden">
              <div className="overflow-x-auto max-h-[calc(100vh-380px)] overflow-y-auto">
                <table className="w-full text-right border-collapse min-w-[900px]">
                  <thead className="bg-surface-container-low border-b border-outline-variant sticky top-0 z-10">
                    <tr>
                      <th className="p-4 w-12 text-center" />
                      <SortTh label="שם עובד"       col="employeeName"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh label="תפקיד / קטגוריה" col="roleTitle"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <SortTh label="שעות"           col="weeklyHours"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="center" />
                      <SortTh label="פרונטלי"        col="frontalHours"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="center" />
                      <SortTh label="פרטני"          col="individualHours"    sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="center" />
                      <SortTh label="שהייה מהבית"   col="stayHoursHome"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="center" />
                      <SortTh label="שהייה מהמוסד"  col="stayHoursInstitution" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="center" />
                      <SortTh label="תאריך הגשה"    col="submittedAt"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                      <th className="p-4 text-label-lg font-bold text-primary text-center">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {filtered.map((pos, idx) => {
                      const isOpen      = expanded.has(pos.id);
                      const avatarColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                      return (
                        <>
                          <tr
                            key={pos.id}
                            className={`hover:bg-surface-container-low/50 transition-all cursor-pointer group ${isOpen ? 'bg-surface-container-low' : ''}`}
                            onClick={() => toggleExpand(pos.id)}
                          >
                            <td className="p-4 text-center">
                              <Icon
                                name="keyboard_arrow_left"
                                className={`text-outline group-hover:text-primary transition-transform duration-300 text-[22px] ${isOpen ? '-rotate-90' : ''}`}
                              />
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${avatarColor}`}>
                                  {initials(pos.employeeName || '??')}
                                </div>
                                <span className="font-bold text-on-surface text-body-md">{pos.employeeName || '—'}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex flex-col gap-1">
                                {pos.roleTitle && <span className="text-body-md text-on-surface font-bold">{pos.roleTitle}</span>}
                                {pos.subRole   && <span className="text-body-md text-on-surface-variant">{pos.subRole}</span>}
                                {pos.category  && (
                                  <span className="inline-block px-2 py-0.5 bg-secondary-container text-on-secondary-container rounded-full text-[12px] font-bold w-fit">
                                    {pos.category}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-center font-bold text-primary text-body-md">{pos.weeklyHours > 0 ? pos.weeklyHours : '—'}</td>
                            <td className="p-4 text-center text-on-surface-variant text-body-md">{pos.frontalHours > 0 ? pos.frontalHours : '—'}</td>
                            <td className="p-4 text-center text-on-surface-variant text-body-md">{pos.individualHours > 0 ? pos.individualHours : '—'}</td>
                            <td className="p-4 text-center text-on-surface-variant text-body-md">{pos.stayHoursHome > 0 ? pos.stayHoursHome : '—'}</td>
                            <td className="p-4 text-center text-on-surface-variant text-body-md">{pos.stayHoursInstitution > 0 ? pos.stayHoursInstitution : '—'}</td>
                            <td className="p-4 text-on-surface-variant text-body-md">{formatDate(pos.submittedAt)}</td>
                            <td className="p-4" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => router.push(`/form/${encodeURIComponent(token)}/edit/${pos.id}`)}
                                  className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container text-primary transition-colors"
                                  title="עריכה"
                                >
                                  <Icon name="edit" className="text-[20px]" />
                                </button>
                                {deleteConfirm === pos.id ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => handleDelete(pos.id)}
                                      disabled={deletingId === pos.id}
                                      className="px-2 py-1 bg-error text-on-error rounded text-label-sm disabled:opacity-50 whitespace-nowrap"
                                    >
                                      {deletingId === pos.id ? '…' : 'אישור'}
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirm(null)}
                                      className="px-2 py-1 text-on-surface-variant border border-outline-variant rounded text-label-sm"
                                    >
                                      ביטול
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDeleteConfirm(pos.id)}
                                    className="w-8 h-8 flex items-center justify-center rounded hover:bg-error-container/20 text-error transition-colors"
                                    title="מחיקת תקן"
                                  >
                                    <Icon name="delete" className="text-[20px]" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {isOpen && (
                            <tr key={`${pos.id}-detail`}>
                              <td colSpan={10} className="p-0">
                                <div className="px-6 py-5 bg-surface-container-low border-y border-outline-variant/30">
                                  {weekCache[pos.id] === 'loading' && (
                                    <div className="flex items-center gap-2 text-on-surface-variant text-body-md py-2">
                                      <Icon name="progress_activity" className="animate-spin text-[18px]" />
                                      טוען מערכת שעות…
                                    </div>
                                  )}
                                  {weekCache[pos.id] === 'error' && (
                                    <p className="text-error text-body-md py-2">שגיאה בטעינת מערכת שעות.</p>
                                  )}
                                  {weekCache[pos.id] && weekCache[pos.id] !== 'loading' && weekCache[pos.id] !== 'error' && (
                                    <WeekGrid week={weekCache[pos.id] as WeekData} />
                                  )}
                                  <div className="mt-4 flex justify-end">
                                    <button
                                      onClick={() => router.push(`/form/${encodeURIComponent(token)}/edit/${pos.id}`)}
                                      className="text-primary text-label-lg font-bold underline flex items-center gap-1"
                                    >
                                      <Icon name="edit_calendar" className="text-[16px]" />
                                      עריכת מערכת שעות
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-4 bg-surface-container-low flex flex-row-reverse justify-between items-center border-t border-outline-variant">
                <span className="text-label-sm text-on-surface-variant">
                  {filtered.length} מתוך {positions.length} תקנים
                </span>
                {(search || activeFilterCount > 0) && filtered.length < positions.length && (
                  <span className="text-label-sm text-primary font-bold">
                    מסונן לפי {activeFilterCount > 0 ? `${activeFilterCount} תנאים` : 'חיפוש'}
                  </span>
                )}
              </div>
            </div>
          )}

        </div>
      </main>

      <Footer />
    </div>
  );
}
