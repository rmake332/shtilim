'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { Footer } from '@/components/shell/Footer';
import { formatNum } from '@/lib/formatNum';
import { DocUpload } from '@/components/steps/DocUpload';
import type { UploadedDoc } from '@/lib/formTypes';
import { BudgetStatCard } from '@/components/invoice/BudgetStatCard';

interface InvoiceBudgetRow {
  id: string;
  title: string;
  monthlyHoursQuota: number;
  tariffMonthly: number;
}

interface InvoicePosition {
  id: string;
  employeeName: string;
  subRole: string;
  allocatedHours: number;
  agreedHourlyRate: number;
  inactive: boolean;
}

interface InvoiceMonthlyReport {
  id: string;
  positionId: string;
  reportedHours: number;
  reportedRate: number;
  totalPay: number;
  hasInvoiceDoc: boolean;
  invoiceNumber: string;
  monthlyTransferDocGenerated: boolean;
  paymentRequestDocUrl: string;
  paymentRequestFolderUrl: string;
  mergedPdfUrl: string;
}

interface RowState {
  hours: string;
  rate: string;
  invoiceNumber: string;
  doc?: UploadedDoc;
  saving: boolean;
  error: string;
  /** true = שדות פתוחים לעריכה. שורה עם דיווח שמור נטענת נעולה (false) - "עריכה" פותחת אותה. */
  editing: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** ברירת המחדל היא החודש הקודם - הדיווח החודשי בפועל מוגש בדרך כלל אחרי סיום החודש. */
function defaultReportMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function TopNav({
  institution,
  roleName,
  onBack,
}: {
  institution: string;
  roleName?: string;
  onBack: () => void;
}) {
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(`${d.toLocaleDateString('he-IL')} | ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <header className="bg-surface-bright shadow-sm flex justify-between items-center w-full px-margin-desktop py-4 sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <Image src="/logo_meyuhadim.webp" alt="מיוחדים בחינוך" width={48} height={48} className="object-contain" />
        <span className="text-headline-md font-bold text-primary">מיוחדים בחינוך - מערכת תקציבים</span>
      </div>
      <div className="flex items-center gap-4">
        {institution && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-tertiary-fixed/40 rounded-full text-tertiary">
            <Icon name="school" className="text-[18px]" />
            <span className="text-label-lg font-bold">{institution}</span>
          </div>
        )}
        {roleName && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-container/50 rounded-full text-white">
            <Icon name="work" className="text-[18px]" />
            <span className="text-label-lg font-bold">{roleName}</span>
          </div>
        )}
        <span className="text-label-lg font-bold text-primary">{now}</span>
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container text-label-sm transition-colors"
        >
          <Icon name="arrow_forward" className="text-[18px]" />
          <span>חזרה להקצאה</span>
        </button>
      </div>
    </header>
  );
}

export function MonthlyReportScreen({
  token,
  institutionName,
  budgetRowId,
}: {
  token: string;
  institutionName: string;
  budgetRowId: string;
}) {
  const router = useRouter();
  const [month, setMonth] = useState(defaultReportMonth());
  const [budgetRow, setBudgetRow] = useState<InvoiceBudgetRow | null>(null);
  const [positions, setPositions] = useState<InvoicePosition[]>([]);
  const [reports, setReports] = useState<Record<string, InvoiceMonthlyReport>>({});
  const [rows, setRows] = useState<Record<string, RowState>>({});
  /** יתרת שעות/תקציב (₪) שהועברה מחודשים קודמים (0 אם אין) - ראו src/lib/invoice/monthlyBalance.ts. */
  const [carriedInBalance, setCarriedInBalance] = useState(0);
  const [carriedInBudget, setCarriedInBudget] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [finishMsg, setFinishMsg] = useState('');
  const [emailError, setEmailError] = useState('');
  const [toEmail, setToEmail] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/invoice/reports?token=${encodeURIComponent(token)}&budgetRowId=${encodeURIComponent(budgetRowId)}&month=${month}`,
      );
      const json = await res.json();
      if (!json.ok) { setError(json.message || 'שגיאה בטעינת הנתונים.'); setLoading(false); return; }
      setBudgetRow(json.budgetRow);
      setPositions(json.positions);
      setCarriedInBalance(Number(json.carriedInBalance) || 0);
      setCarriedInBudget(Number(json.carriedInBudget) || 0);
      const byPosition: Record<string, InvoiceMonthlyReport> = {};
      for (const r of json.reports as InvoiceMonthlyReport[]) byPosition[r.positionId] = r;
      setReports(byPosition);
      const nextRows: Record<string, RowState> = {};
      for (const p of json.positions as InvoicePosition[]) {
        const existing = byPosition[p.id];
        nextRows[p.id] = {
          hours: existing ? String(existing.reportedHours) : '',
          rate: existing ? String(existing.reportedRate) : String(p.agreedHourlyRate),
          invoiceNumber: existing?.invoiceNumber ?? '',
          saving: false,
          error: '',
          editing: !existing,
        };
      }
      setRows(nextRows);
    } catch {
      setError('שגיאה בטעינת הנתונים.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, [token, budgetRowId, month]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateRow(positionId: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [positionId]: { ...prev[positionId], ...patch } }));
  }

  async function saveRow(positionId: string) {
    const row = rows[positionId];
    if (!row) return;
    if (monthLocked) {
      updateRow(positionId, { error: 'חודש זה כבר ננעל - בקשת התשלום כבר נשלחה.' });
      return;
    }
    const position = positions.find((p) => p.id === positionId);
    if (position?.inactive) {
      updateRow(positionId, { error: 'עובד לא פעיל - לא ניתן לדווח עבורו שעות נוספות.' });
      return;
    }
    const hours = Number(row.hours);
    const rate = Number(row.rate);
    if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(rate) || rate <= 0) {
      updateRow(positionId, { error: 'יש להזין שעות ותעריף תקינים.' });
      return;
    }
    if (!row.invoiceNumber.trim()) {
      updateRow(positionId, { error: "יש להזין מס' חשבונית." });
      return;
    }
    const existing = reports[positionId];
    if (!row.doc && !existing?.hasInvoiceDoc) {
      updateRow(positionId, { error: 'יש לצרף חשבונית.' });
      return;
    }
    updateRow(positionId, { saving: true, error: '' });
    try {
      const res = await fetch('/api/invoice/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          positionId,
          month,
          reportedHours: hours,
          reportedRate: rate,
          invoiceNumber: row.invoiceNumber,
        }),
      });
      const json = await res.json();
      if (!json.ok) { updateRow(positionId, { saving: false, error: json.message || 'שגיאה בשמירה.' }); return; }

      const report = json.report as InvoiceMonthlyReport;
      if (row.doc) {
        await fetch('/api/invoice/upload-report-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, reportId: report.id, file: row.doc }),
        });
      }
      setReports((prev) => ({ ...prev, [positionId]: report }));
      updateRow(positionId, { saving: false, doc: undefined, editing: false });
    } catch {
      updateRow(positionId, { saving: false, error: 'שגיאה בשמירה.' });
    }
  }

  function startEditRow(positionId: string) {
    if (monthLocked) return;
    updateRow(positionId, { editing: true, error: '' });
  }

  /** ביטול עריכה - חוזר לערכים השמורים האחרונים (לא לריק), נועל מחדש. */
  function cancelEditRow(positionId: string) {
    const report = reports[positionId];
    if (!report) { updateRow(positionId, { editing: false, error: '' }); return; }
    updateRow(positionId, {
      hours: String(report.reportedHours),
      rate: String(report.reportedRate),
      invoiceNumber: report.invoiceNumber,
      doc: undefined,
      editing: false,
      error: '',
    });
  }

  async function finishMonth() {
    if (!EMAIL_RE.test(toEmail.trim())) {
      setFinishMsg('יש להזין כתובת מייל תקינה לפני השליחה.');
      return;
    }
    setFinishing(true);
    setFinishMsg('');
    setEmailError('');
    try {
      const res = await fetch(`/api/invoice/budget-rows/${budgetRowId}/finish-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, month, toEmail: toEmail.trim() }),
      });
      const json = await res.json();
      if (json.ok) {
        setFinishMsg('הדיווח החודשי סומן כהושלם והחודש ננעל.');
        if (json.emailError) setEmailError(json.emailError);
      } else {
        setFinishMsg(json.message || 'שגיאה בהפקת מסמך בקשת התשלום.');
      }
      // גם בכשל חלקי (המסמך הופק אך הנעילה נכשלה) הקישור כבר נשמר ב-Airtable -
      // טעינה מחדש מציגה אותו דרך ה-state הרגיל (mergedPdfUrl).
      await loadData();
    } catch {
      setFinishMsg('שגיאה בהפקת מסמך בקשת התשלום.');
    } finally {
      setFinishing(false);
    }
  }

  if (loading && !budgetRow) {
    return <div className="min-h-screen flex items-center justify-center text-on-surface-variant">טוען…</div>;
  }
  if (error) {
    return <div className="min-h-screen flex items-center justify-center text-error">{error}</div>;
  }

  const totalReported = Object.values(reports).reduce((s, r) => s + r.reportedHours, 0);
  const totalSpent = Object.values(reports).reduce((s, r) => s + r.totalPay, 0);
  // מכסת השעות/התקציב הזמינים לחודש = המכסה/התעריף הרגילים + יתרה שהועברה מחודשים קודמים.
  const availableQuota = (budgetRow?.monthlyHoursQuota ?? 0) + carriedInBalance;
  const availableBudget = (budgetRow?.tariffMonthly ?? 0) + carriedInBudget;
  // חודש שכבר "סיום דיווח חודשי" נלחץ עבורו ננעל לצמיתות - אין עריכה חוזרת/שליחה חוזרת (v1).
  const monthLocked = Object.values(reports).some((r) => r.monthlyTransferDocGenerated);
  // אם כבר קיים קישור מטעינה קודמת (למשל טעינה מחדש של העמוד) - מוצג מיד, בלי צורך ללחוץ שוב.
  const mergedPdfUrl = Object.values(reports).find((r) => r.mergedPdfUrl)?.mergedPdfUrl || null;

  return (
    <div className="min-h-screen flex flex-col bg-surface-bright" dir="rtl">
      <TopNav
        institution={institutionName}
        roleName={budgetRow?.title}
        onBack={() => router.push(`/form/${encodeURIComponent(token)}/invoice/${budgetRowId}`)}
      />

      <main className="flex-1 px-margin-desktop py-8">
        <div className="max-w-container-max mx-auto space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="text-right">
              <h1 className="text-display-lg text-primary mb-1">דיווח חודשי</h1>
              <p className="text-body-lg text-on-surface-variant">
                דיווח שעות בפועל ותעריף לכל עובד, בצירוף חשבונית / דרישת תשלום
              </p>
            </div>
            <div>
              <label className="text-label-lg text-on-surface block mb-1">חודש דיווח</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="bg-surface-container-low rounded-lg py-2.5 px-3 text-body-md"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <BudgetStatCard
              icon="schedule"
              label={
                carriedInBalance > 0
                  ? `שעות מדווחות - ${month} (כולל ${formatNum(carriedInBalance)} יתרה מועברת)`
                  : `שעות מדווחות - ${month}`
              }
              valueLabel={`${formatNum(totalReported)} מתוך ${formatNum(availableQuota)} שעות`}
              current={totalReported}
              max={availableQuota}
              color="primary"
            />
            <BudgetStatCard
              icon="payments"
              label={
                carriedInBudget > 0
                  ? `תקציב חודשי מנוצל (כולל ${formatNum(carriedInBudget)} ₪ יתרה מועברת)`
                  : 'תקציב חודשי מנוצל'
              }
              valueLabel={`${formatNum(totalSpent)} מתוך ${formatNum(availableBudget)} ₪`}
              current={totalSpent}
              max={availableBudget}
              color="secondary"
            />
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-surface-container-low text-label-lg font-bold text-on-surface-variant">
                  <tr>
                    <th className="px-5 py-3">עובד</th>
                    <th className="px-5 py-3">תת-תפקיד</th>
                    <th className="px-5 py-3">שעות מוקצות</th>
                    <th className="px-5 py-3">שעות בפועל</th>
                    <th className="px-5 py-3">תעריף</th>
                    <th className="px-5 py-3">סה&quot;כ לתשלום</th>
                    <th className="px-5 py-3">
                      מס&apos; חשבונית <span className="text-error">*</span>
                    </th>
                    <th className="px-5 py-3">
                      חשבונית <span className="text-error">*</span>
                    </th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {positions.length === 0 && (
                    <tr><td colSpan={9} className="px-5 py-8 text-center text-on-surface-variant">אין עדיין עובדים מוקצים לתקן זה.</td></tr>
                  )}
                  {positions.map((p) => {
                    const row = rows[p.id];
                    const report = reports[p.id];
                    if (!row) return null;
                    // לא פעיל, או שהחודש כבר ננעל לצמיתות - תמיד נעול, בלי אפשרות עריכה.
                    // אחרת - נעול כברירת מחדל ברגע שיש דיווח שמור, עד לחיצה על "עריכה".
                    const locked = p.inactive || monthLocked || !row.editing;
                    return (
                      <tr key={p.id} className={`align-middle ${p.inactive ? 'opacity-60' : ''}`}>
                        <td className="px-5 py-3 font-bold">
                          {p.employeeName}
                          {p.inactive && (
                            <span className="mr-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-error-container/40 text-error text-label-sm font-bold align-middle">
                              <Icon name="pause_circle" className="text-[14px]" fill /> לא פעיל
                            </span>
                          )}
                          {!p.inactive && report && locked && (
                            <span className="mr-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-tertiary-container/40 text-on-surface text-label-sm font-bold align-middle">
                              <Icon name="check_circle" className="text-tertiary text-[14px]" fill /> דווח
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">{p.subRole}</td>
                        <td className="px-5 py-3">{formatNum(p.allocatedHours)}</td>
                        <td className="px-5 py-3">
                          {locked ? (
                            formatNum(Number(row.hours) || 0)
                          ) : (
                            <input
                              type="number"
                              value={row.hours}
                              onChange={(e) => updateRow(p.id, { hours: e.target.value })}
                              className="w-24 bg-surface-container-low rounded-lg py-2 px-2 text-body-md"
                              autoFocus
                            />
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {locked ? (
                            formatNum(Number(row.rate) || 0)
                          ) : (
                            <input
                              type="number"
                              value={row.rate}
                              onChange={(e) => updateRow(p.id, { rate: e.target.value })}
                              className="w-24 bg-surface-container-low rounded-lg py-2 px-2 text-body-md"
                            />
                          )}
                        </td>
                        <td className="px-5 py-3">{report ? formatNum(report.totalPay) : ' - '}</td>
                        <td className="px-5 py-3">
                          {locked ? (
                            row.invoiceNumber || ' - '
                          ) : (
                            <input
                              type="text"
                              value={row.invoiceNumber}
                              onChange={(e) => updateRow(p.id, { invoiceNumber: e.target.value })}
                              className="w-28 bg-surface-container-low rounded-lg py-2 px-2 text-body-md"
                            />
                          )}
                        </td>
                        <td className="px-5 py-3 min-w-[220px]">
                          {locked ? (
                            report?.hasInvoiceDoc && (
                              <span className="flex items-center gap-1.5 text-tertiary text-label-sm font-bold">
                                <Icon name="check_circle" className="text-[16px]" fill /> קובץ הועלה
                              </span>
                            )
                          ) : (
                            <div className="flex flex-col gap-1">
                              {report?.hasInvoiceDoc && !row.doc && (
                                <span className="flex items-center gap-1.5 text-tertiary text-label-sm">
                                  <Icon name="check_circle" className="text-[14px]" fill /> קיים קובץ - ניתן להחליף
                                </span>
                              )}
                              <DocUpload
                                label=""
                                value={row.doc}
                                onChange={(doc) => updateRow(p.id, { doc })}
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {p.inactive || monthLocked ? null : locked ? (
                            <button
                              onClick={() => startEditRow(p.id)}
                              className="text-on-surface-variant hover:text-primary"
                              aria-label="עריכה"
                              title="עריכה"
                            >
                              <Icon name="edit" className="text-[18px]" />
                            </button>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => void saveRow(p.id)}
                                  disabled={row.saving}
                                  className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold text-label-sm hover:opacity-90 disabled:opacity-50 transition-all"
                                >
                                  <Icon name="save" className="text-[16px]" />
                                  {row.saving ? 'שומר…' : 'שמירה'}
                                </button>
                                {report && (
                                  <button
                                    onClick={() => cancelEditRow(p.id)}
                                    disabled={row.saving}
                                    className="text-on-surface-variant hover:text-error"
                                    aria-label="ביטול"
                                  >
                                    <Icon name="close" className="text-[20px]" />
                                  </button>
                                )}
                              </div>
                              {row.error && <p className="text-error text-label-sm mt-1">{row.error}</p>}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {monthLocked && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-tertiary-container/30 text-on-surface">
              <Icon name="lock" className="text-tertiary text-[20px]" />
              <span className="font-bold">חודש זה ננעל - בקשת התשלום כבר הופקה ונשלחה, לא ניתן לערוך או לשלוח שוב.</span>
            </div>
          )}

          {!monthLocked && (
            <div className="max-w-sm">
              <label className="text-label-lg text-on-surface block mb-1">
                כתובת מייל לשליחת בקשת התשלום <span className="text-error">*</span>
              </label>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="example@mail.com"
                className="w-full bg-surface-container-low rounded-lg py-2.5 px-3 text-body-md"
              />
            </div>
          )}

          <div className="flex items-center gap-4 flex-wrap">
            {!monthLocked && (
              <button
                onClick={() => void finishMonth()}
                disabled={finishing || positions.length === 0}
                className="flex items-center gap-2 px-6 py-3 bg-tertiary text-on-tertiary rounded-xl font-bold text-label-lg hover:opacity-90 disabled:opacity-50 transition-all"
              >
                <Icon name="task_alt" className="text-[20px]" />
                {finishing ? 'שולח…' : 'סיום דיווח חודשי ושליחה'}
              </button>
            )}
            {finishMsg && <span className="text-body-md text-on-surface-variant">{finishMsg}</span>}
            {mergedPdfUrl && (
              <a
                href={mergedPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-primary text-primary font-bold text-label-md hover:bg-primary-container/20 transition-colors"
              >
                <Icon name="picture_as_pdf" className="text-[18px]" />
                פתיחת מסמך בקשת העברות
              </a>
            )}
          </div>
          {emailError && <p className="text-error text-body-md">שליחת המייל: {emailError}</p>}
        </div>
      </main>

      <Footer />
    </div>
  );
}
