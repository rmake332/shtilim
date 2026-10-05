'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { formatNum } from '@/lib/formatNum';

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

const EMPTY_FORM: FormState = { mosadId: '', title: '', weeklyHoursQuota: '', tariffMonthly: '' };

/**
 * ניהול שורות "תקציב התחלתי" בקטגוריית חשבונית בלבד: הוספה, עריכה ומחיקה. הקטגוריה
 * וסוג השכר נקבעים בשרת ל"חשבונית"; מחיקה ושינוי מוסד חסומים כשיש עובדים מוקצים.
 */
export function AdminBudgetRowsManager({
  rows,
  institutions,
  defaultMosadId,
  onChanged,
}: {
  rows: AdminBudgetRowItem[];
  institutions: AdminInstitution[];
  /** המוסד שנבחר בסינון העליון - ברירת מחדל בהוספת שורה. */
  defaultMosadId: string;
  onChanged: () => Promise<void>;
}) {
  /** null = טופס סגור, 'new' = הוספה, אחרת מזהה השורה בעריכה. */
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState('');

  function openNew() {
    setEditing('new');
    setForm({ ...EMPTY_FORM, mosadId: defaultMosadId });
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
    setDeletingId(r.id);
    try {
      const res = await fetch(`/api/admin/invoice/budget-rows/${r.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) alert(json.message || 'שגיאה במחיקה.');
      else await onChanged();
    } catch {
      alert('שגיאה במחיקה.');
    } finally {
      setDeletingId('');
    }
  }

  const editedRow = editing && editing !== 'new' ? rows.find((r) => r.id === editing) : undefined;
  // תקן עם עובדים מוקצים שייך למוסד שלו - השרת חוסם העברה, אז גם הבחירה נעולה.
  const mosadLocked = !!editedRow && editedRow.employeeCount > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-headline-sm font-bold text-on-surface">תקציב התחלתי - קטגוריית חשבונית</h2>
          <p className="text-body-md text-on-surface-variant">
            הוספה, עריכה ומחיקה של תקני חשבונית. השעות שבועיות; התקציב חודשי, כולל מע&quot;מ.
          </p>
        </div>
        {editing !== 'new' && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-5 h-11 bg-primary text-on-primary rounded-lg font-bold text-label-lg hover:opacity-90 transition-all"
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
              {editing === 'new' ? 'שורת תקציב חדשה' : `עריכת "${editedRow?.title ?? ''}"`}
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
                {institutions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {mosadLocked && (
                <p className="text-label-sm text-on-surface-variant mt-1">יש עובדים מוקצים - לא ניתן להעביר מוסד.</p>
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
                תקציב חודשי (₪) <span className="text-error">*</span>
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
                <th className="px-4 py-3">מוסד</th>
                <th className="px-4 py-3">תפקיד</th>
                <th className="px-4 py-3">שעות שבועיות</th>
                <th className="px-4 py-3">תקציב חודשי</th>
                <th className="px-4 py-3">שעות מוקצות</th>
                <th className="px-4 py-3">עובדים</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">אין שורות תקציב חשבונית.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className={editing === r.id ? 'bg-primary-container/10' : ''}>
                  <td className="px-4 py-2.5">{r.mosadName}</td>
                  <td className="px-4 py-2.5 font-bold">{r.title || ' - '}</td>
                  <td className="px-4 py-2.5">{formatNum(r.weeklyHoursQuota)}</td>
                  <td className="px-4 py-2.5">{formatNum(r.tariffMonthly)} ₪</td>
                  <td className="px-4 py-2.5">{formatNum(r.totalAllocatedHours)}</td>
                  <td className="px-4 py-2.5">{r.employeeCount}</td>
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
                        disabled={r.employeeCount > 0 || deletingId === r.id}
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
