'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { Footer } from '@/components/shell/Footer';

interface InstitutionItem {
  id: string;
  name: string;
  token: string;
  association?: string;
}

function TopNavHome() {
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
          בחירת מוסד
        </span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-label-lg font-bold text-primary">{now}</span>
        <div className="h-10 w-10 rounded-full bg-primary-container flex items-center justify-center border-2 border-outline-variant text-on-primary font-bold text-lg">
          <Icon name="account_balance" className="text-[20px]" />
        </div>
      </div>
    </header>
  );
}

// ── Token dialog ─────────────────────────────────────────────────────────────

function TokenDialog({
  institution,
  onClose,
  onEnter,
}: {
  institution: InstitutionItem;
  onClose: () => void;
  onEnter: (token: string) => void;
}) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/institutions/verify?token=${encodeURIComponent(t)}`);
      if (res.ok) {
        onEnter(t);
      } else {
        setError('טוקן שגוי — נסי שוב.');
        setLoading(false);
      }
    } catch {
      setError('שגיאת רשת.');
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-bright rounded-2xl shadow-xl border border-outline-variant w-full max-w-sm mx-4 p-8" dir="rtl">
        {/* כותרת */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-title-lg font-bold text-on-surface">כניסה למוסד</h2>
            <p className="text-body-md text-on-surface-variant mt-1">{institution.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container text-on-surface-variant transition-colors">
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-label-md font-bold text-on-surface-variant block mb-1.5">
              טוקן כניסה
            </label>
            <input
              ref={inputRef}
              type="text"
              value={token}
              onChange={(e) => { setToken(e.target.value); setError(''); }}
              placeholder="הכניסי את הטוקן שקיבלת…"
              className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2.5 text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary/20 text-right"
              autoComplete="off"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-error text-body-sm">
              <Icon name="error" className="text-[16px] shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!token.trim() || loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-label-lg hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? <><Icon name="progress_activity" className="animate-spin text-[18px]" /> מאמת…</>
              : <><Icon name="login" className="text-[18px]" /> כניסה</>
            }
          </button>
        </form>
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

const ASSOC_COLORS: Record<string, string> = {
  'שתילים רשת חינוך': 'bg-primary-fixed-dim text-on-primary-fixed-variant',
};

function assocColor(assoc?: string) {
  if (!assoc) return 'bg-surface-container text-on-surface-variant';
  return ASSOC_COLORS[assoc] ?? 'bg-secondary-container text-on-secondary-container';
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
}

const AVATAR_COLORS = [
  'bg-primary-fixed-dim text-on-primary-fixed-variant',
  'bg-secondary-fixed text-on-secondary-fixed-variant',
  'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  'bg-secondary-container text-on-secondary-container',
];

// ── Main Component ───────────────────────────────────────────────────────────

export function InstitutionsHome({ institutions }: { institutions: InstitutionItem[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<InstitutionItem | null>(null);

  const filtered = institutions.filter((i) => {
    const q = search.toLowerCase();
    return (
      i.name.toLowerCase().includes(q) ||
      (i.association ?? '').toLowerCase().includes(q)
    );
  });

  function openDialog(inst: InstitutionItem) {
    setSelected(inst);
  }

  function handleEnter(token: string) {
    setSelected(null);
    router.push(`/form/${encodeURIComponent(token)}`);
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-bright" dir="rtl">
      <TopNavHome />

      {selected && (
        <TokenDialog
          institution={selected}
          onClose={() => setSelected(null)}
          onEnter={handleEnter}
        />
      )}

      <main className="flex-1 px-margin-desktop py-10">
        <div className="max-w-container-max mx-auto">

          {/* כותרת */}
          <div className="flex items-start justify-between mb-8 gap-4">
            <div className="text-right">
              <h1 className="text-display-lg text-primary mb-1">בחירת מוסד</h1>
              <p className="text-body-lg text-on-surface-variant">
                בחרי את המוסד שלך כדי להיכנס למערכת הניהול
              </p>
            </div>

            {/* חיפוש */}
            <div className="relative shrink-0">
              <Icon name="search" className="absolute right-3 top-1/2 -translate-y-1/2 text-outline text-[20px]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש מוסד…"
                className="pr-10 py-2.5 pl-4 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary/20 text-right text-body-md outline-none w-72"
              />
            </div>
          </div>

          {/* רשימת מוסדות */}
          {institutions.length === 0 ? (
            <div className="text-center py-20 bg-surface-container-lowest rounded-xl border border-outline-variant/50">
              <Icon name="school" className="text-5xl text-on-surface-variant block mx-auto mb-4" />
              <p className="text-headline-md text-on-surface-variant">לא נמצאו מוסדות</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-on-surface-variant text-body-lg">
              <Icon name="search_off" className="text-4xl block mx-auto mb-3 opacity-50" />
              לא נמצאו מוסדות התואמים לחיפוש
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((inst, idx) => (
                <button
                  key={inst.id}
                  onClick={() => openDialog(inst)}
                  className="group text-right bg-surface-container-lowest border border-outline-variant/50 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-primary/40 hover:bg-primary-fixed/10 active:scale-[0.98] transition-all flex flex-col gap-3 cursor-pointer"
                >
                  {/* אות + שם */}
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}>
                      {initials(inst.name)}
                    </div>
                    <span className="text-body-lg font-bold text-on-surface group-hover:text-primary transition-colors leading-tight line-clamp-2">
                      {inst.name}
                    </span>
                  </div>

                  {/* עמותה */}
                  {inst.association && (
                    <span className={`inline-block self-start px-2 py-0.5 rounded-full text-[12px] font-bold ${assocColor(inst.association)}`}>
                      {inst.association}
                    </span>
                  )}

                  {/* חץ כניסה */}
                  <div className="flex items-center justify-between mt-auto pt-1">
                    <span className="text-label-sm text-on-surface-variant group-hover:text-primary transition-colors">
                      כניסה למערכת
                    </span>
                    <Icon
                      name="arrow_back"
                      className="text-outline group-hover:text-primary transition-colors text-[20px]"
                    />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* מונה */}
          {institutions.length > 0 && (
            <p className="mt-6 text-label-sm text-on-surface-variant text-center">
              {filtered.length} מוסדות מתוך {institutions.length}
            </p>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
