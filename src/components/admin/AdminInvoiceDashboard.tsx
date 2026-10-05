'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { Footer } from '@/components/shell/Footer';
import { formatNum } from '@/lib/formatNum';
import { toCsv } from '@/lib/csv';
import { AdminBudgetRowsManager, type AdminInstitution } from '@/components/admin/AdminBudgetRowsManager';

interface AdminInvoiceRow {
  key: string;
  mosadId: string;
  mosadName: string;
  budgetRowId: string;
  roleTitle: string;
  employeeName: string;
  subRole: string;
  isDoctor: boolean;
  inactive: boolean;
  weeklyAllocatedHours: number;
  agreedHourlyRate: number;
  month: string;
  reportedHours: number | null;
  totalPay: number | null;
  invoiceNumber: string;
  monthLocked: boolean;
  mergedPdfUrl: string;
}

interface AdminBudgetRow {
  id: string;
  title: string;
  mosadId: string;
  mosadName: string;
  weeklyHoursQuota: number;
  monthHoursQuota: number | null;
  tariffMonthly: number;
  totalAllocatedHours: number;
  allocationLocked: boolean;
  employeeCount: number;
}

/** ברירת מחדל: החודש הקודם, כמו במסך הדיווח החודשי של המוסד. */
function defaultMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function statusLabel(r: AdminInvoiceRow): string {
  if (r.isDoctor) return 'רופא - ללא דיווח';
  if (r.monthLocked) return 'ננעל ונשלח';
  if (r.reportedHours != null) return 'דווח';
  return 'לא דווח';
}

export function AdminInvoiceDashboard() {
  const router = useRouter();
  const [month, setMonth] = useState(defaultMonth());
  const [allMonths, setAllMonths] = useState(false);
  const [mosadFilter, setMosadFilter] = useState('');
  const [rows, setRows] = useState<AdminInvoiceRow[]>([]);
  const [budgetRows, setBudgetRows] = useState<AdminBudgetRow[]>([]);
  const [institutions, setInstitutions] = useState<AdminInstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lockBusy, setLockBusy] = useState('');

  const effectiveMonth = allMonths ? '' : month;

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/invoice${effectiveMonth ? `?month=${effectiveMonth}` : ''}`);
      if (res.status === 401) { router.refresh(); return; }
      const json = await res.json();
      if (json.ok) {
        setRows(json.rows);
        setBudgetRows(json.budgetRows);
        setInstitutions(json.institutions ?? []);
      } else {
        setError(json.message || 'שגיאה בטעינת הנתונים.');
      }
    } catch {
      setError('שגיאה בטעינת הנתונים.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, [effectiveMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const mosadOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of budgetRows) m.set(b.mosadId, b.mosadName || b.mosadId);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'he'));
  }, [budgetRows]);

  const visibleRows = mosadFilter ? rows.filter((r) => r.mosadId === mosadFilter) : rows;
  const visibleBudgetRows = mosadFilter ? budgetRows.filter((b) => b.mosadId === mosadFilter) : budgetRows;
  const totalHours = visibleRows.reduce((s, r) => s + (r.reportedHours ?? 0), 0);
  const totalPay = visibleRows.reduce((s, r) => s + (r.totalPay ?? 0), 0);

  // תקני חשבונית מקובצים לפי מוסד, לפתיחת/נעילת עריכת ההקצאה ברמת המוסד.
  const byMosad = useMemo(() => {
    const m = new Map<string, { name: string; rows: AdminBudgetRow[] }>();
    for (const b of visibleBudgetRows) {
      const g = m.get(b.mosadId) ?? { name: b.mosadName || b.mosadId, rows: [] };
      g.rows.push(b);
      m.set(b.mosadId, g);
    }
    return Array.from(m.entries());
  }, [visibleBudgetRows]);

  function downloadCsv() {
    const headers = [
      'מוסד', 'תפקיד', 'עובד', 'תת-תפקיד', 'חודש', 'שעות שבועיות מוקצות', 'תעריף לשעה (כולל מע"מ)',
      'שעות מדווחות', 'סה"כ לתשלום (כולל מע"מ)', "מס' חשבונית / מס' דרישת תשלום", 'סטטוס', 'לא פעיל', 'קישור ל-PDF',
    ];
    const data = visibleRows.map((r) => [
      r.mosadName, r.roleTitle, r.employeeName, r.subRole, r.month,
      r.isDoctor ? '' : r.weeklyAllocatedHours, r.isDoctor ? '' : r.agreedHourlyRate,
      r.reportedHours ?? '', r.totalPay ?? '', r.invoiceNumber, statusLabel(r), r.inactive ? 'כן' : '', r.mergedPdfUrl,
    ]);
    const blob = new Blob([toCsv(headers, data)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${effectiveMonth || 'all-months'}${mosadFilter ? `-${mosadFilter}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function setLock(target: { mosadId?: string; budgetRowId?: string }, locked: boolean) {
    const key = target.budgetRowId || target.mosadId || '';
    setLockBusy(key);
    try {
      const res = await fetch('/api/admin/invoice/allocation-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, locked }),
      });
      const json = await res.json();
      if (!json.ok) alert(json.message || 'שגיאה בעדכון הנעילה.');
      await loadData();
    } catch {
      alert('שגיאה בעדכון הנעילה.');
    } finally {
      setLockBusy('');
    }
  }

  async function logout() {
    await fetch('/api/admin/login', { method: 'DELETE' }).catch(() => {});
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-bright" dir="rtl">
      <header className="bg-surface-bright shadow-sm flex justify-between items-center w-full px-margin-desktop py-4 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Image src="/logo_meyuhadim.webp" alt="מיוחדים בחינוך" width={48} height={48} className="object-contain" />
          <span className="text-headline-md font-bold text-primary">מיוחדים בחינוך - ממשק מנהל</span>
        </div>
        <button
          onClick={() => void logout()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container text-label-sm transition-colors"
        >
          <Icon name="logout" className="text-[18px]" />
          <span>יציאה</span>
        </button>
      </header>

      <main className="flex-1 px-margin-desktop py-8">
        <div className="max-w-container-max mx-auto space-y-6">
          <div className="text-right">
            <h1 className="text-display-lg text-primary mb-1">תקני חשבונית - כל המוסדות</h1>
            <p className="text-body-lg text-on-surface-variant">כל הדיווחים במרוכז, עם סינון לפי מוסד וחודש והורדה לקובץ CSV.</p>
          </div>

          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="text-label-lg text-on-surface block mb-1">מוסד</label>
              <select
                value={mosadFilter}
                onChange={(e) => setMosadFilter(e.target.value)}
                className="bg-surface-container-low rounded-lg h-11 px-3 text-body-md min-w-[220px]"
              >
                <option value="">כל המוסדות</option>
                {mosadOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-label-lg text-on-surface block mb-1">חודש</label>
              <input
                type="month"
                value={month}
                disabled={allMonths}
                onChange={(e) => setMonth(e.target.value)}
                className="bg-surface-container-low rounded-lg h-11 px-3 text-body-md disabled:opacity-50"
              />
            </div>
            <label className="flex items-center gap-2 h-11 text-body-md cursor-pointer">
              <input type="checkbox" checked={allMonths} onChange={(e) => setAllMonths(e.target.checked)} />
              כל החודשים
            </label>
            <button
              onClick={downloadCsv}
              disabled={loading || visibleRows.length === 0}
              className="flex items-center gap-2 px-5 h-11 bg-secondary text-on-secondary rounded-lg font-bold text-label-lg hover:opacity-90 disabled:opacity-50 transition-all"
            >
              <Icon name="download" className="text-[20px]" />
              הורדה ל-CSV
            </button>
          </div>

          {error && <p className="text-error text-body-md">{error}</p>}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl p-5">
              <p className="text-label-lg text-on-surface-variant">שורות</p>
              <p className="text-headline-md font-bold text-primary">{visibleRows.length}</p>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl p-5">
              <p className="text-label-lg text-on-surface-variant">שעות מדווחות</p>
              <p className="text-headline-md font-bold text-primary">{formatNum(totalHours)}</p>
            </div>
            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl p-5">
              <p className="text-label-lg text-on-surface-variant">סה&quot;כ לתשלום (כולל מע&quot;מ)</p>
              <p className="text-headline-md font-bold text-primary">{formatNum(totalPay)} ₪</p>
            </div>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-surface-container-low text-label-lg font-bold text-on-surface-variant">
                  <tr>
                    <th className="px-4 py-3">מוסד</th>
                    <th className="px-4 py-3">תפקיד</th>
                    <th className="px-4 py-3">עובד</th>
                    <th className="px-4 py-3">תת-תפקיד</th>
                    <th className="px-4 py-3">חודש</th>
                    <th className="px-4 py-3">שעות שבועיות מוקצות</th>
                    <th className="px-4 py-3">תעריף (כולל מע&quot;מ)</th>
                    <th className="px-4 py-3">שעות מדווחות</th>
                    <th className="px-4 py-3">סה&quot;כ לתשלום</th>
                    <th className="px-4 py-3">מס&apos; חשבונית / דרישת תשלום</th>
                    <th className="px-4 py-3">סטטוס</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {loading && (
                    <tr><td colSpan={12} className="px-4 py-8 text-center text-on-surface-variant">טוען…</td></tr>
                  )}
                  {!loading && visibleRows.length === 0 && (
                    <tr><td colSpan={12} className="px-4 py-8 text-center text-on-surface-variant">אין נתונים לסינון הנוכחי.</td></tr>
                  )}
                  {!loading && visibleRows.map((r) => (
                    <tr key={r.key} className={r.inactive ? 'opacity-60' : ''}>
                      <td className="px-4 py-2.5">{r.mosadName}</td>
                      <td className="px-4 py-2.5">{r.roleTitle}</td>
                      <td className="px-4 py-2.5 font-bold">{r.employeeName}</td>
                      <td className="px-4 py-2.5">{r.subRole}</td>
                      <td className="px-4 py-2.5">{r.month}</td>
                      <td className="px-4 py-2.5">{r.isDoctor ? ' - ' : formatNum(r.weeklyAllocatedHours)}</td>
                      <td className="px-4 py-2.5">{r.isDoctor ? ' - ' : formatNum(r.agreedHourlyRate)}</td>
                      <td className="px-4 py-2.5">{r.reportedHours != null ? formatNum(r.reportedHours) : ' - '}</td>
                      <td className="px-4 py-2.5">{r.totalPay != null ? `${formatNum(r.totalPay)} ₪` : ' - '}</td>
                      <td className="px-4 py-2.5">{r.invoiceNumber || ' - '}</td>
                      <td className="px-4 py-2.5">{statusLabel(r)}</td>
                      <td className="px-4 py-2.5">
                        {r.mergedPdfUrl && (
                          <a href={r.mergedPdfUrl} target="_blank" rel="noopener noreferrer" className="text-primary" title="PDF מאוחד">
                            <Icon name="picture_as_pdf" className="text-[20px]" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <AdminBudgetRowsManager
            rows={visibleBudgetRows}
            institutions={institutions}
            defaultMosadId={mosadFilter}
            onChanged={loadData}
          />

          <div className="space-y-3">
            <h2 className="text-headline-sm font-bold text-on-surface">עריכת הקצאה שנתית לפי מוסד</h2>
            <p className="text-body-md text-on-surface-variant">
              לאחר &quot;סיום הקצאה שנתית&quot; המוסד לא יכול לערוך את ההקצאה. כאן ניתן לפתוח אותה מחדש לעריכה, ולנעול שוב.
            </p>
            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead className="bg-surface-container-low text-label-lg font-bold text-on-surface-variant">
                    <tr>
                      <th className="px-4 py-3">מוסד</th>
                      <th className="px-4 py-3">תקנים</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {byMosad.map(([mosadId, g]) => {
                      const anyLocked = g.rows.some((b) => b.allocationLocked);
                      return (
                        <tr key={mosadId} className="align-top">
                          <td className="px-4 py-3 font-bold">{g.name}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1.5">
                              {g.rows.map((b) => (
                                <div key={b.id} className="flex items-center gap-2 flex-wrap">
                                  <span>{b.title}</span>
                                  <span className="text-label-sm text-on-surface-variant">
                                    ({formatNum(b.totalAllocatedHours)} מתוך {formatNum(b.weeklyHoursQuota)} ש&quot;ש, {formatNum(b.tariffMonthly)} ₪ לחודש)
                                  </span>
                                  {b.allocationLocked ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-tertiary-container/40 text-label-sm font-bold">
                                      <Icon name="lock" className="text-[14px]" /> נעול
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-label-sm font-bold">
                                      <Icon name="lock_open" className="text-[14px]" /> פתוח לעריכה
                                    </span>
                                  )}
                                  <button
                                    onClick={() => void setLock({ budgetRowId: b.id }, !b.allocationLocked)}
                                    disabled={!!lockBusy}
                                    className="text-label-sm text-primary underline disabled:opacity-50"
                                  >
                                    {b.allocationLocked ? 'פתיחה' : 'נעילה'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => void setLock({ mosadId }, !anyLocked)}
                              disabled={!!lockBusy}
                              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold text-label-sm hover:opacity-90 disabled:opacity-50 transition-all whitespace-nowrap"
                            >
                              <Icon name={anyLocked ? 'lock_open' : 'lock'} className="text-[16px]" />
                              {lockBusy === mosadId ? 'מעדכן…' : anyLocked ? 'פתיחת עריכת הקצאה' : 'נעילת הקצאה'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
