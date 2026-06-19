'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { Footer } from '@/components/shell/Footer';
import type { BudgetRow } from '@/app/api/budget/route';

// ── Top Nav ─────────────────────────────────────────────────────────────────

function BudgetTopNav({ institution, onBack }: { institution: string; onBack: () => void }) {
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
        <span className="text-label-lg font-bold px-3 py-1.5 rounded-lg bg-secondary text-on-secondary">
          תקציב התחלתי
        </span>
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
        <div className="h-10 w-10 rounded-full bg-primary-container flex items-center justify-center border-2 border-outline-variant text-on-primary font-bold text-lg">
          {institution ? institution.trim().charAt(0) : <Icon name="person" />}
        </div>
      </div>
    </header>
  );
}

// ── Category badge ───────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  'הוראה':        'bg-primary-fixed-dim text-on-primary-fixed-variant',
  'סיוע':         'bg-secondary-container text-on-secondary-container',
  'פרא רפואי':   'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  'גמול':        'bg-surface-container-high text-on-surface-variant',
  'גמולי פרא':  'bg-surface-container-high text-on-surface-variant',
  'תפקידים':     'bg-surface-container-high text-on-surface-variant',
  'שכר יסוד':   'bg-error-container text-on-error-container',
  'סיוע מדורג': 'bg-secondary-container text-on-secondary-container',
  'חשבונית':    'bg-surface-container text-on-surface-variant',
};

function CatBadge({ cat }: { cat: string }) {
  const cls = CAT_COLORS[cat] ?? 'bg-surface-container text-on-surface-variant';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap ${cls}`}>
      {cat || '—'}
    </span>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function BudgetView({
  token,
  institutionName,
  mosadId: _mosadId,
}: {
  token: string;
  institutionName: string;
  mosadId: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');

  useEffect(() => {
    fetch(`/api/budget?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.rows) setRows(j.rows);
        else setError('שגיאה בטעינת התקציב.');
      })
      .catch(() => setError('שגיאת רשת.'))
      .finally(() => setLoading(false));
  }, [token]);

  const categories = Array.from(new Set(rows.map((r) => r.category).filter(Boolean))).sort();

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.role.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || r.symbolName.toLowerCase().includes(q);
    const matchCat = !catFilter || r.category === catFilter;
    return matchSearch && matchCat;
  });

  const totalHoursLeft = filtered.reduce((s, r) => s + r.remainingHours, 0);

  return (
    <div className="min-h-screen flex flex-col bg-surface-bright" dir="rtl">
      <BudgetTopNav institution={institutionName} onBack={() => router.push(`/form/${encodeURIComponent(token)}`)} />

      <main className="flex-1 px-margin-desktop py-8">
        <div className="max-w-container-max mx-auto">

          {/* Page header */}
          <div className="flex items-start justify-between mb-8 gap-4">
            <div className="text-right">
              <h1 className="text-display-lg text-primary mb-1">תקציב התחלתי</h1>
              <p className="text-body-lg text-on-surface-variant">
                כל שורות התקציב שהוקצו למוסד — שעות, גמולים ותפקידים
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {/* חיפוש */}
              <div className="relative">
                <Icon name="search" className="absolute right-3 top-1/2 -translate-y-1/2 text-outline text-[20px]" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש תפקיד…"
                  className="pr-10 py-2.5 pl-4 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary/20 text-right text-body-md outline-none w-60"
                />
              </div>

              {/* פילטר קטגוריה */}
              <select
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                className="bg-surface-container-low border border-outline-variant rounded-lg px-3 py-2.5 text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">כל הקטגוריות</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Stats */}
          {!loading && rows.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/50 flex flex-row-reverse items-center justify-between">
                <div className="text-right">
                  <p className="text-label-sm text-on-surface-variant">סה&quot;כ שורות</p>
                  <p className="text-headline-md font-bold text-primary">{filtered.length}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-primary-fixed text-primary flex items-center justify-center">
                  <Icon name="table_rows" className="text-[22px]" />
                </div>
              </div>
              <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/50 flex flex-row-reverse items-center justify-between">
                <div className="text-right">
                  <p className="text-label-sm text-on-surface-variant">שעות שנותרו</p>
                  <p className="text-headline-md font-bold text-secondary">{totalHoursLeft.toFixed(2)}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-secondary-container text-secondary flex items-center justify-center">
                  <Icon name="timer" className="text-[22px]" />
                </div>
              </div>
              <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/50 flex flex-row-reverse items-center justify-between">
                <div className="text-right">
                  <p className="text-label-sm text-on-surface-variant">קטגוריות</p>
                  <p className="text-headline-md font-bold text-tertiary">{categories.length}</p>
                </div>
                <div className="w-12 h-12 rounded-lg bg-tertiary-fixed text-tertiary flex items-center justify-center">
                  <Icon name="category" className="text-[22px]" />
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-error-container text-on-error-container rounded-xl flex items-center gap-2 text-body-md">
              <Icon name="error" />
              {error}
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="text-center py-20 text-on-surface-variant">
              <Icon name="progress_activity" className="text-4xl animate-spin block mx-auto mb-4" />
              <p className="text-body-lg">טוען תקציב…</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-20 bg-surface-container-lowest rounded-xl border border-outline-variant/50">
              <Icon name="account_balance_wallet" className="text-5xl text-on-surface-variant block mx-auto mb-4" />
              <p className="text-headline-md text-on-surface-variant">אין נתוני תקציב למוסד</p>
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/50 overflow-hidden">
              <div className="overflow-x-auto max-h-[calc(100vh-380px)] overflow-y-auto">
                <table className="w-full text-right border-collapse min-w-[800px]">
                  <thead className="bg-surface-container-low border-b border-outline-variant sticky top-0 z-10">
                    <tr>
                      <th className="p-4 text-label-lg font-bold text-on-surface-variant text-right">תפקיד</th>
                      <th className="p-4 text-label-lg font-bold text-on-surface-variant text-right">קטגוריה</th>
                      <th className="p-4 text-label-lg font-bold text-on-surface-variant text-right">סמל</th>
                      <th className="p-4 text-label-lg font-bold text-on-surface-variant text-right">שכבה</th>
                      <th className="p-4 text-label-lg font-bold text-on-surface-variant text-center">שעות שנותרו</th>
                      <th className="p-4 text-label-lg font-bold text-on-surface-variant text-center">גמולים שנותרו</th>
                      <th className="p-4 text-label-lg font-bold text-on-surface-variant text-center">תפקידים שנותרו</th>
                      <th className="p-4 text-label-lg font-bold text-on-surface-variant text-center">אופק / פרא</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {filtered.map((row) => (
                      <tr key={row.id} className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="p-4 font-bold text-on-surface text-body-md">{row.role || '—'}</td>
                        <td className="p-4"><CatBadge cat={row.category} /></td>
                        <td className="p-4 text-on-surface-variant text-body-md">{row.symbolName || '—'}</td>
                        <td className="p-4 text-on-surface-variant text-body-sm">
                          {row.layer.length ? row.layer.join(', ') : '—'}
                        </td>
                        <td className="p-4 text-center font-bold text-primary text-body-md">
                          {row.remainingHours > 0 ? row.remainingHours.toFixed(2) : '—'}
                        </td>
                        <td className="p-4 text-center text-on-surface-variant text-body-md">
                          {row.remainingGemulim > 0 ? row.remainingGemulim.toFixed(2) : '—'}
                        </td>
                        <td className="p-4 text-center text-on-surface-variant text-body-md">
                          {row.remainingRoles > 0 ? row.remainingRoles.toFixed(2) : '—'}
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {row.ofekChadash && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-primary-fixed text-primary rounded text-[10px] font-bold">
                                <Icon name="check_circle" className="text-[12px]" /> אופק
                              </span>
                            )}
                            {row.paraBoard && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-tertiary-fixed text-tertiary rounded text-[10px] font-bold">
                                <Icon name="check_circle" className="text-[12px]" /> פרא
                              </span>
                            )}
                            {!row.ofekChadash && !row.paraBoard && <span className="text-on-surface-variant">—</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 bg-surface-container-low flex flex-row-reverse justify-between items-center border-t border-outline-variant">
                <span className="text-label-sm text-on-surface-variant">
                  {filtered.length} מתוך {rows.length} שורות
                </span>
                {(search || catFilter) && filtered.length < rows.length && (
                  <span className="text-label-sm text-primary font-bold">מסונן</span>
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
