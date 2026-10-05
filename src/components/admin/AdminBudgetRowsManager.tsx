'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { formatNum } from '@/lib/formatNum';
import { toCsv } from '@/lib/csv';
import { downloadCsv } from '@/components/admin/downloadCsv';
import { sortRows, nextSort, type SortState } from '@/lib/sortRows';
import { SortableTh } from '@/components/admin/SortableTh';

export interface AdminBudgetRowItem {
  id: string;
  title: string;
  mosadId: string;
  mosadName: string;
  weeklyHoursQuota: number;
  tariffMonthly: number;
  totalAllocatedHours: number;
  allocationLocked: boolean;
  employeeCount: number;
}

export interface AdminInstitution {
  id: string;
  name: string;
}

interface FormState {
  mosadId: string;
  title: string;
  weeklyHoursQuota: string;
  tariffMonthly: string;
}

type SortKey = 'mosadName' | 'title' | 'weeklyHoursQuota' | 'tariffMonthly' | 'totalAllocatedHours' | 'employeeCount' | 'allocationLocked';
type LockFilter = '' | 'locked' | 'open';

const EMPTY_FORM: FormState = { mosadId: '', title: '', weeklyHoursQuota: '', tariffMonthly: '' };

/**
 * לשונית "ניהול תקציב התחלתי": שורות תקציב בקטגוריית חשבונית בלבד (תפקיד אחד לכל
 * מוסד) - הוספה, עריכה, מחיקה, ונעילה/פתיחה של ההקצאה השנתית. סינון, מיון והורדה
 * ל-CSV. הקטגוריה וסוג השכר נקבעים בשרת ל"חשבונית"; מחיקה ושינוי מוסד חסומים כשיש
 * עובדים מוקצים.
 */
export function AdminBudgetRowsManager({
  rows,
  institutions,
  onChanged,
}: {
  rows: AdminBudgetRowItem[];
  institutions: AdminInstitution[];
  onChanged: () => Promise<void>;
}) {
  /** null = טופס סגור, 'new' = הוספה, אחרת מזהה השורה בעריכה. */
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [search, setSearch] = useState('');
  const [lockFilter, setLockFilter] = useState<LockFilter>('');
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'mosadName', dir: 'asc' });

  const visible = useMemo(() => {
    const q = search.trim();
    const filtered = rows.filter(
      (r) =>
        (!q || r.mosadName.includes(q) || r.title.includes(q)) &&
        (!lockFilter || (lockFilter === 'locked') === r.allocationLocked),
    );
    return sortRows(filtered, sort, (r, k) => r[k]);
  }, [rows, search, lockFilter, sort]);

  // תפקיד אחד לכל מוסד: בהוספה מוצגים רק מוסדות שעדיין אין להם שורה.
  const takenMosadIds = new Set(rows.map((r) => r.mosadId));
  const editedRow = editing && editing !== 'new' ? rows.find((r) => r.id === editing) : undefined;
  const mosadChoices = institutions.filter((m) => !takenMosadIds.has(m.id) || m.id === editedRow?.mosadId);
  // תקן עם עובדים מוקצים שייך למוסד שלו - השרת חוסם העברה, אז גם הבחירה נעולה.
  const mosadLocked = !!editedRow && editedRow.employeeCount > 0;

  function openNew() {
    setEditing('new');
    setForm(EMPTY_FORM);
    setError('');
  }

  function openEdit(r: AdminBudgetRowItem) {
    setEditing(r.id);
    setForm({
      mosadId: r.mosadId,
      title: r.title,
      weeklyHoursQuota: String(r.weeklyHoursQuota),
      tariffMonthly: String(r.tariffMonthly),
    });
    setError('');
  }

  function close() {
    setEditing(null);
    setError('');
  }

  async function save() {
    if (!form.mosadId) { setError('יש לבחור מוסד.'); return; }
    if (!form.title.trim()) { setError('יש להזין שם תפקיד.'); return; }
    const hours = Number(form.weeklyHoursQuota);
    const tariff = Number(form.tariffMonthly);
    if (!Number.isFinite(hours) || hours <= 0) { setError('יש להזין שעות שבועיות גדולות מ-0.'); return; }
    if (!Number.isFinite(tariff) || tariff <= 0) { setError('יש להזין תקציב חודשי גדול מ-0.'); return; }

    setSaving(true);
    setError('');
    try {
      const isNew = editing === 'new';
      const res = await fetch(isNew ? '/api/admin/invoice/budget-rows' : `/api/admin/invoice/budget-rows/${editing}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mosadId: form.mosadId, title: form.title.trim(), weeklyHoursQuota: hours, tariffMonthly: tariff }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.message || 'שגיאה בשמירה.'); return; }
      setEditing(null);
      await onChanged();
    } catch {
      setError('שגיאה בשמירה.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: AdminBudgetRowItem) {
    if (!confirm(`למחוק את שורת התקציב "${r.title}" של ${r.mosadName}?`)) return;
    setBusyId(r.id);
    try {
      const res = await fetch(`/api/admin/invoice/budget-rows/${r.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) alert(json.message || 'שגיאה במחיקה.');
      else await onChanged();
    } catch {
      alert('שגיאה במחיקה.');
    } finally {
      setBusyId('');
    }
  }

  async function toggleLock(r: AdminBudgetRowItem) {
    const locked = !r.allocationLocked;
    if (!locked && !confirm(`לפתוח את ההקצאה השנתית של ${r.mosadName} לעריכה?`)) return;
    setBusyId(r.id);
    try {
      const res = await fetch('/api/admin/invoice/allocation-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budgetRowId: r.id, locked }),
      });
      const json = await res.json();
      if (!json.ok) alert(json.message || 'שגיאה בעדכון הנעילה.');
      await onChanged();
    } catch {
      alert('שגיאה בעדכון הנעילה.');
    } finally {
      setBusyId('');
    }
  }

  function exportCsv() {
    const headers = ['מוסד', 'תפקיד', 'שעות שבועיות', 'תקציב חודשי (₪)', 'שעות שבועיות מוקצות', 'עובדים', 'הקצאה שנתית'];
    const data = visible.map((r) => [
      r.mosadName, r.title, r.weeklyHoursQuota, r.tariffMonthly, r.totalAllocatedHours, r.employeeCount,
      r.allocationLocked ? 'נעולה' : 'פתוחה לעריכה',
    ]);
    downloadCsv(toCsv(headers, data), 'invoice-budget.csv');
  }

  const onSort = (key: SortKey) => setSort((s) => nextSort(s, key));

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="text-label-lg text-on-surface block mb-1">חיפוש</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="מוסד או תפקיד…"
            className="bg-surface-container-low rounded-lg h-11 px-3 text-body-md min-w-[220px]"
          />
        </div>
        <div>
          <label className="text-label-lg text-on-surface block mb-1">הקצאה שנתית</label>
          <select
            value={lockFilter}
            onChange={(e) => setLockFilter(e.target.value as LockFilter)}
            className="bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
          >
            <option value="">הכל</option>
            <option value="locked">נעולה</option>
            <option value="open">פתוחה לעריכה</option>
          </select>
        </div>
        <button
          onClick={exportCsv}
          disabled={visible.length === 0}
          className="flex items-center gap-2 px-5 h-11 bg-secondary text-on-secondary rounded-lg font-bold text-label-lg hover:opacity-90 disabled:opacity-50 transition-all"
        >
          <Icon name="download" className="text-[20px]" />
          הורדה ל-CSV
        </button>
        {editing !== 'new' && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-5 h-11 bg-primary text-on-primary rounded-lg font-bold text-label-lg hover:opacity-90 transition-all ms-auto"
          >
            <Icon name="add" className="text-[20px]" />
            הוספת שורת תקציב
          </button>
        )}
      </div>

      {editing && (
        <div className="bg-surface-container-lowest border border-primary/40 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-label-lg font-bold text-on-surface">
              {editing === 'new' ? 'שורת תקציב חדשה' : `עריכת "${editedRow?.title ?? ''}" - ${editedRow?.mosadName ?? ''}`}
            </h3>
            <button onClick={close} className="text-on-surface-variant hover:text-error" aria-label="סגירה">
              <Icon name="close" className="text-[20px]" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-label-lg text-on-surface block mb-2">
                מוסד <span className="text-error">*</span>
              </label>
              <select
                value={form.mosadId}
                onChange={(e) => setForm((v) => ({ ...v, mosadId: e.target.value }))}
                disabled={mosadLocked}
                className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md disabled:opacity-60"
              >
                <option value="">בחר מוסד</option>
                {mosadChoices.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {mosadLocked ? (
                <p className="text-label-sm text-on-surface-variant mt-1">יש עובדים מוקצים - לא ניתן להעביר מוסד.</p>
              ) : (
                <p className="text-label-sm text-on-surface-variant mt-1">מוצגים רק מוסדות שאין להם עדיין תפקיד חשבונית.</p>
              )}
            </div>
            <div>
              <label className="text-label-lg text-on-surface block mb-2">
                תפקיד <span className="text-error">*</span>
              </label>
              <input
                value={form.title}
                onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))}
                className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
              />
            </div>
            <div>
              <label className="text-label-lg text-on-surface block mb-2">
                שעות שבועיות <span className="text-error">*</span>
              </label>
              <input
                type="number"
                value={form.weeklyHoursQuota}
                onChange={(e) => setForm((v) => ({ ...v, weeklyHoursQuota: e.target.value }))}
                className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
              />
              {editedRow && editedRow.totalAllocatedHours > 0 && (
                <p className="text-label-sm text-on-surface-variant mt-1">
                  כבר הוקצו {formatNum(editedRow.totalAllocatedHours)} שעות - לא ניתן לרדת מתחת לכך.
                </p>
              )}
            </div>
            <div>
              <label className="text-label-lg text-on-surface block mb-2">
                תקציב חודשי (₪, כולל מע&quot;מ) <span className="text-error">*</span>
              </label>
              <input
                type="number"
                value={form.tariffMonthly}
                onChange={(e) => setForm((v) => ({ ...v, tariffMonthly: e.target.value }))}
                className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
              />
            </div>
          </div>
          {error && <p className="text-error text-body-md">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={() => void save()}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl font-bold text-label-lg hover:opacity-90 disabled:opacity-50 transition-all"
            >
              <Icon name="save" className="text-[18px]" />
              {saving ? 'שומר…' : 'שמירה'}
            </button>
            <button
              onClick={close}
              className="px-6 py-3 rounded-xl font-bold text-label-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-all"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-surface-container-low text-label-lg font-bold text-on-surface-variant">
              <tr>
                <SortableTh label="מוסד" sortKey="mosadName" sort={sort} onSort={onSort} />
                <SortableTh label="תפקיד" sortKey="title" sort={sort} onSort={onSort} />
                <SortableTh label="שעות שבועיות" sortKey="weeklyHoursQuota" sort={sort} onSort={onSort} />
                <SortableTh label="תקציב חודשי" sortKey="tariffMonthly" sort={sort} onSort={onSort} />
                <SortableTh label="שעות מוקצות" sortKey="totalAllocatedHours" sort={sort} onSort={onSort} />
                <SortableTh label="עובדים" sortKey="employeeCount" sort={sort} onSort={onSort} />
                <SortableTh label="הקצאה שנתית" sortKey="allocationLocked" sort={sort} onSort={onSort} />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {visible.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-on-surface-variant">אין שורות לסינון הנוכחי.</td></tr>
              )}
              {visible.map((r) => (
                <tr key={r.id} className={editing === r.id ? 'bg-primary-container/10' : ''}>
                  <td className="px-4 py-2.5 font-bold">{r.mosadName}</td>
                  <td className="px-4 py-2.5">{r.title || ' - '}</td>
                  <td className="px-4 py-2.5">{formatNum(r.weeklyHoursQuota)}</td>
                  <td className="px-4 py-2.5">{formatNum(r.tariffMonthly)} ₪</td>
                  <td className="px-4 py-2.5">{formatNum(r.totalAllocatedHours)}</td>
                  <td className="px-4 py-2.5">{r.employeeCount}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => void toggleLock(r)}
                      disabled={busyId === r.id}
                      title={r.allocationLocked ? 'לחיצה תפתח את ההקצאה לעריכה' : 'לחיצה תנעל את ההקצאה'}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label-sm font-bold transition-colors disabled:opacity-50 ${
                        r.allocationLocked
                          ? 'bg-tertiary-container/40 text-on-surface hover:bg-tertiary-container/70'
                          : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                      }`}
                    >
                      <Icon name={r.allocationLocked ? 'lock' : 'lock_open'} className="text-[14px]" />
                      {r.allocationLocked ? 'נעולה' : 'פתוחה לעריכה'}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(r)}
                        className="text-on-surface-variant hover:text-primary"
                        aria-label="עריכה"
                        title="עריכה"
                      >
                        <Icon name="edit" className="text-[18px]" />
                      </button>
                      <button
                        onClick={() => void remove(r)}
                        disabled={r.employeeCount > 0 || busyId === r.id}
                        className="text-on-surface-variant hover:text-error disabled:opacity-30 disabled:hover:text-on-surface-variant"
                        aria-label="מחיקה"
                        title={r.employeeCount > 0 ? 'לא ניתן למחוק תקן עם עובדים מוקצים' : 'מחיקה'}
                      >
                        <Icon name="delete" className="text-[20px]" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
