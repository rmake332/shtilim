'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { formatNum } from '@/lib/formatNum';
import { toCsv } from '@/lib/csv';
import { sortRows, nextSort, type SortState } from '@/lib/sortRows';
import { SortableTh } from '@/components/admin/SortableTh';
import { downloadCsv } from '@/components/admin/downloadCsv';

export interface AdminInvoiceRow {
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

type SortKey =
  | 'mosadName' | 'roleTitle' | 'employeeName' | 'subRole' | 'month' | 'weeklyAllocatedHours'
  | 'agreedHourlyRate' | 'reportedHours' | 'totalPay' | 'invoiceNumber' | 'status';

function statusLabel(r: AdminInvoiceRow): string {
  if (r.isDoctor) return 'רופא - ללא דיווח';
  if (r.monthLocked) return 'ננעל ונשלח';
  if (r.reportedHours != null) return 'דווח';
  return 'לא דווח';
}

/**
 * לשונית "דיווחים": פירוט הדיווחים החודשיים בכל המוסדות, סינון לפי מוסד/חודש, מיון
 * והורדה ל-CSV. החודש נשלט מבחוץ, כי הוא קובע מה נטען מהשרת.
 */
export function AdminReportsTab({
  rows,
  loading,
  month,
  allMonths,
  onMonthChange,
  onAllMonthsChange,
}: {
  rows: AdminInvoiceRow[];
  loading: boolean;
  month: string;
  allMonths: boolean;
  onMonthChange: (m: string) => void;
  onAllMonthsChange: (v: boolean) => void;
}) {
  const [mosadFilter, setMosadFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sort, setSort] = useState<SortState<SortKey>>({ key: 'mosadName', dir: 'asc' });

  const mosadOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.mosadId, r.mosadName || r.mosadId);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'he'));
  }, [rows]);

  const visible = useMemo(() => {
    const filtered = rows.filter(
      (r) => (!mosadFilter || r.mosadId === mosadFilter) && (!statusFilter || statusLabel(r) === statusFilter),
    );
    return sortRows(filtered, sort, (r, k) => (k === 'status' ? statusLabel(r) : r[k]));
  }, [rows, mosadFilter, statusFilter, sort]);

  const totalHours = visible.reduce((s, r) => s + (r.reportedHours ?? 0), 0);
  const totalPay = visible.reduce((s, r) => s + (r.totalPay ?? 0), 0);
  const onSort = (key: SortKey) => setSort((s) => nextSort(s, key));

  function exportCsv() {
    const headers = [
      'מוסד', 'תפקיד', 'עובד', 'תת-תפקיד', 'חודש', 'שעות שבועיות מוקצות', 'תעריף לשעה (כולל מע"מ)',
      'שעות מדווחות', 'סה"כ לתשלום (כולל מע"מ)', "מס' חשבונית / מס' דרישת תשלום", 'סטטוס', 'לא פעיל', 'קישור ל-PDF',
    ];
    const data = visible.map((r) => [
      r.mosadName, r.roleTitle, r.employeeName, r.subRole, r.month,
      r.isDoctor ? '' : r.weeklyAllocatedHours, r.isDoctor ? '' : r.agreedHourlyRate,
      r.reportedHours ?? '', r.totalPay ?? '', r.invoiceNumber, statusLabel(r), r.inactive ? 'כן' : '', r.mergedPdfUrl,
    ]);
    downloadCsv(toCsv(headers, data), `invoice-reports-${allMonths ? 'all-months' : month}.csv`);
  }

  return (
    <div className="space-y-4">
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
            onChange={(e) => onMonthChange(e.target.value)}
            className="bg-surface-container-low rounded-lg h-11 px-3 text-body-md disabled:opacity-50"
          />
        </div>
        <label className="flex items-center gap-2 h-11 text-body-md cursor-pointer">
          <input type="checkbox" checked={allMonths} onChange={(e) => onAllMonthsChange(e.target.checked)} />
          כל החודשים
        </label>
        <div>
          <label className="text-label-lg text-on-surface block mb-1">סטטוס</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
          >
            <option value="">הכל</option>
            <option value="לא דווח">לא דווח</option>
            <option value="דווח">דווח</option>
            <option value="ננעל ונשלח">ננעל ונשלח</option>
            <option value="רופא - ללא דיווח">רופא</option>
          </select>
        </div>
        <button
          onClick={exportCsv}
          disabled={loading || visible.length === 0}
          className="flex items-center gap-2 px-5 h-11 bg-secondary text-on-secondary rounded-lg font-bold text-label-lg hover:opacity-90 disabled:opacity-50 transition-all"
        >
          <Icon name="download" className="text-[20px]" />
          הורדה ל-CSV
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl p-5">
          <p className="text-label-lg text-on-surface-variant">שורות</p>
          <p className="text-headline-md font-bold text-primary">{visible.length}</p>
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
                <SortableTh label="מוסד" sortKey="mosadName" sort={sort} onSort={onSort} />
                <SortableTh label="תפקיד" sortKey="roleTitle" sort={sort} onSort={onSort} />
                <SortableTh label="עובד" sortKey="employeeName" sort={sort} onSort={onSort} />
                <SortableTh label="תת-תפקיד" sortKey="subRole" sort={sort} onSort={onSort} />
                <SortableTh label="חודש" sortKey="month" sort={sort} onSort={onSort} />
                <SortableTh label={'ש"ש מוקצות'} sortKey="weeklyAllocatedHours" sort={sort} onSort={onSort} />
                <SortableTh label={'תעריף (כולל מע"מ)'} sortKey="agreedHourlyRate" sort={sort} onSort={onSort} />
                <SortableTh label="שעות מדווחות" sortKey="reportedHours" sort={sort} onSort={onSort} />
                <SortableTh label={'סה"כ לתשלום'} sortKey="totalPay" sort={sort} onSort={onSort} />
                <SortableTh label="מס' חשבונית / דרישת תשלום" sortKey="invoiceNumber" sort={sort} onSort={onSort} />
                <SortableTh label="סטטוס" sortKey="status" sort={sort} onSort={onSort} />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {loading && (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-on-surface-variant">טוען…</td></tr>
              )}
              {!loading && visible.length === 0 && (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-on-surface-variant">אין נתונים לסינון הנוכחי.</td></tr>
              )}
              {!loading && visible.map((r) => (
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
    </div>
  );
}
