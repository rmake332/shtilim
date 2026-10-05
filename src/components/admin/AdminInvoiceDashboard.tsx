'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { Footer } from '@/components/shell/Footer';
import {
  AdminBudgetRowsManager,
  type AdminBudgetRowItem,
  type AdminInstitution,
} from '@/components/admin/AdminBudgetRowsManager';
import { AdminReportsTab, type AdminInvoiceRow } from '@/components/admin/AdminReportsTab';

type Tab = 'budget' | 'reports';
const TAB_STORAGE_KEY = 'admin-invoice-tab';

/** ברירת מחדל: החודש הקודם, כמו במסך הדיווח החודשי של המוסד. */
function defaultMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * ממשק מנהל לתקני חשבונית, בשתי לשוניות: "ניהול תקציב התחלתי" (שורות התקציב
 * בקטגוריית חשבונית + נעילת/פתיחת ההקצאה השנתית) ו"דיווחים" (פירוט חודשי בכל
 * המוסדות). הנתונים של שתיהן נטענים בקריאה אחת; החודש משפיע רק על הדיווחים.
 */
export function AdminInvoiceDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('budget');
  const [month, setMonth] = useState(defaultMonth());
  const [allMonths, setAllMonths] = useState(false);
  const [rows, setRows] = useState<AdminInvoiceRow[]>([]);
  const [budgetRows, setBudgetRows] = useState<AdminBudgetRowItem[]>([]);
  const [institutions, setInstitutions] = useState<AdminInstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const effectiveMonth = allMonths ? '' : month;

  // הלשונית האחרונה נשמרת לנוחות בלבד - בלי אחסון (מצב פרטי וכו') פשוט מתחילים בראשונה.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved === 'budget' || saved === 'reports') setTab(saved);
    } catch { /* ignore */ }
  }, []);

  function selectTab(t: Tab) {
    setTab(t);
    try { localStorage.setItem(TAB_STORAGE_KEY, t); } catch { /* ignore */ }
  }

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

  async function logout() {
    await fetch('/api/admin/login', { method: 'DELETE' }).catch(() => {});
    router.refresh();
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'budget', label: 'ניהול תקציב התחלתי', icon: 'account_balance_wallet' },
    { id: 'reports', label: 'דיווחים', icon: 'receipt_long' },
  ];

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
            <h1 className="text-display-lg text-primary mb-1">תקני חשבונית</h1>
            <p className="text-body-lg text-on-surface-variant">ניהול התקציב ההתחלתי והדיווחים של כל המוסדות.</p>
          </div>

          <div role="tablist" className="flex gap-1 border-b border-outline-variant">
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectTab(t.id)}
                  className={`flex items-center gap-2 px-5 py-3 -mb-px border-b-2 font-bold text-label-lg transition-colors ${
                    active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Icon name={t.icon} className="text-[20px]" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {error && <p className="text-error text-body-md">{error}</p>}

          <div role="tabpanel">
            {tab === 'budget' ? (
              loading && budgetRows.length === 0 ? (
                <p className="text-center py-16 text-on-surface-variant">טוען…</p>
              ) : (
                <AdminBudgetRowsManager rows={budgetRows} institutions={institutions} onChanged={loadData} />
              )
            ) : (
              <AdminReportsTab
                rows={rows}
                loading={loading}
                month={month}
                allMonths={allMonths}
                onMonthChange={setMonth}
                onAllMonthsChange={setAllMonths}
              />
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
