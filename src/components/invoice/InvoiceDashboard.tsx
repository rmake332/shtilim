'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { Footer } from '@/components/shell/Footer';
import { formatNum } from '@/lib/formatNum';

interface InvoiceBudgetRowWithStatus {
  id: string;
  title: string;
  monthlyHoursQuota: number;
  tariffMonthly: number;
  maxHourlyRate: number | null;
  totalAllocatedHours: number;
  remainingHoursToAllocate: number;
  employeeCount: number;
  allocationFinished: boolean;
}

function DashboardTopNav({ institution, onBack }: { institution: string; onBack: () => void }) {
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
        <span className="text-label-lg font-bold text-primary">{now}</span>
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container text-label-sm transition-colors"
        >
          <Icon name="arrow_forward" className="text-[18px]" />
          <span>תפריט</span>
        </button>
      </div>
    </header>
  );
}

export function InvoiceDashboard({ token, institutionName }: { token: string; institutionName: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<InvoiceBudgetRowWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/invoice/budget-rows?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.ok) setRows(json.rows);
        else setError(json.message || 'שגיאה בטעינת הנתונים.');
      } catch {
        if (!cancelled) setError('שגיאה בטעינת הנתונים.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col bg-surface-bright" dir="rtl">
      <DashboardTopNav institution={institutionName} onBack={() => router.push(`/form/${encodeURIComponent(token)}`)} />

      <main className="flex-1 px-margin-desktop py-8">
        <div className="max-w-container-max mx-auto">
          <div className="text-right mb-8">
            <h1 className="text-display-lg text-primary mb-1">ניהול תקני חשבונית</h1>
            <p className="text-body-lg text-on-surface-variant">
              הקצאת שעות ותעריף לעובדים המקושרים לכל תקן, ודיווח חודשי בפועל
            </p>
          </div>

          {loading && <div className="text-center py-16 text-on-surface-variant">טוען…</div>}
          {!loading && error && (
            <div className="text-center py-16 text-error">{error}</div>
          )}
          {!loading && !error && rows.length === 0 && (
            <div className="text-center py-16 text-on-surface-variant">
              אין תקני חשבונית במוסד זה בתקציב ההתחלתי.
            </div>
          )}

          {!loading && !error && rows.length > 0 && (
            <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-right">
                  <thead className="bg-surface-container-low text-label-lg font-bold text-on-surface-variant">
                    <tr>
                      <th className="px-5 py-3">תפקיד</th>
                      <th className="px-5 py-3">שעות לניצול (חודשי)</th>
                      <th className="px-5 py-3">תעריף חודשי</th>
                      <th className="px-5 py-3">תעריף שעתי מקסימלי</th>
                      <th className="px-5 py-3">עובדים מוקצים</th>
                      <th className="px-5 py-3">יתרת שעות להקצאה</th>
                      <th className="px-5 py-3">סטטוס</th>
                      <th className="px-5 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {rows.map((row) => (
                      <tr key={row.id} className="hover:bg-surface-container-low/60 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-on-surface">{row.title || ' - '}</td>
                        <td className="px-5 py-3.5">{formatNum(row.monthlyHoursQuota)}</td>
                        <td className="px-5 py-3.5">{formatNum(row.tariffMonthly)}</td>
                        <td className="px-5 py-3.5">
                          {row.maxHourlyRate != null ? formatNum(row.maxHourlyRate) : ' - '}
                        </td>
                        <td className="px-5 py-3.5">{row.employeeCount}</td>
                        <td className="px-5 py-3.5">
                          <span className={row.remainingHoursToAllocate < 0 ? 'text-error font-bold' : ''}>
                            {formatNum(row.remainingHoursToAllocate)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {row.allocationFinished ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-tertiary-container/40 text-on-surface text-label-sm font-bold">
                              <Icon name="check_circle" className="text-tertiary text-[16px]" fill /> הקצאה הושלמה
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-label-sm font-bold">
                              ממתין להקצאה
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => router.push(`/form/${encodeURIComponent(token)}/invoice/${row.id}`)}
                            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-lg font-bold text-label-sm hover:opacity-90 active:scale-95 transition-all"
                          >
                            <Icon name="tune" className="text-[16px]" />
                            ניהול הקצאה
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
