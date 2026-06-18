'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { Footer } from '@/components/shell/Footer';

// ── Top Nav ─────────────────────────────────────────────────────────────────

function PortalTopNav({ institution, onBack }: { institution: string; onBack: () => void }) {
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
          title="חזרה לרשימת מוסדות"
        >
          <Icon name="arrow_forward" className="text-[18px]" />
          <span>רשימת מוסדות</span>
        </button>
        <div className="h-10 w-10 rounded-full bg-primary-container flex items-center justify-center border-2 border-outline-variant text-on-primary font-bold text-lg">
          {institution ? institution.trim().charAt(0) : <Icon name="person" />}
        </div>
      </div>
    </header>
  );
}

// ── Module Card ──────────────────────────────────────────────────────────────

interface ModuleCardProps {
  icon: string;
  title: string;
  description: string;
  actionLabel: string;
  color: 'primary' | 'secondary' | 'tertiary' | 'neutral';
  disabled?: boolean;
  badge?: string;
  onClick: () => void;
}

function ModuleCard({ icon, title, description, actionLabel, color, disabled, badge, onClick }: ModuleCardProps) {
  const iconBg = {
    primary: 'bg-primary-fixed text-primary',
    secondary: 'bg-secondary-container text-secondary',
    tertiary: 'bg-tertiary-fixed text-tertiary',
    neutral: 'bg-surface-container-high text-on-surface-variant',
  }[color];

  const btnStyle = {
    primary: 'bg-primary text-on-primary hover:opacity-90',
    secondary: 'bg-secondary text-on-secondary hover:opacity-90',
    tertiary: 'bg-tertiary text-on-tertiary hover:opacity-90',
    neutral: 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest',
  }[color];

  return (
    <div className={`relative bg-surface-container-lowest border border-outline-variant/50 rounded-2xl p-6 shadow-sm flex flex-col gap-4 transition-all ${disabled ? 'opacity-60' : 'hover:shadow-md hover:border-outline-variant'}`}>
      {badge && (
        <span className="absolute top-4 left-4 px-2 py-0.5 rounded-full text-[11px] font-bold bg-surface-container-high text-on-surface-variant border border-outline-variant/40">
          {badge}
        </span>
      )}

      {/* אייקון */}
      <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${iconBg}`}>
        <Icon name={icon} className="text-[28px]" />
      </div>

      {/* כותרת + תיאור */}
      <div className="flex-1">
        <h2 className="text-title-lg font-bold text-on-surface mb-1">{title}</h2>
        <p className="text-body-md text-on-surface-variant leading-relaxed">{description}</p>
      </div>

      {/* כפתור */}
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-label-lg transition-all active:scale-[0.98] disabled:cursor-not-allowed ${btnStyle}`}
      >
        <Icon name={disabled ? 'lock' : 'arrow_back'} className="text-[18px]" />
        {actionLabel}
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function InstitutionPortal({
  token,
  institutionName,
}: {
  token: string;
  institutionName: string;
}) {
  const router = useRouter();
  const enc = encodeURIComponent(token);

  return (
    <div className="min-h-screen flex flex-col bg-surface-bright" dir="rtl">
      <PortalTopNav institution={institutionName} onBack={() => router.push('/')} />

      <main className="flex-1 px-margin-desktop py-10">
        <div className="max-w-container-max mx-auto">

          {/* כותרת */}
          <div className="text-right mb-10">
            <h1 className="text-display-lg text-primary mb-2">שלום, {institutionName}</h1>
            <p className="text-body-lg text-on-surface-variant">
              מה תרצי לעשות היום?
            </p>
          </div>

          {/* כרטיסיות מודולים */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* 1 — ניהול תקנים */}
            <ModuleCard
              icon="manage_accounts"
              title="ניהול תקנים"
              description="צפייה, עריכה ומחיקת תקני עובדים פעילים במוסד. הוספת תקנים חדשים לכל קטגוריה."
              actionLabel="כניסה לניהול תקנים"
              color="primary"
              onClick={() => router.push(`/form/${enc}/positions`)}
            />

            {/* 2 — תקציב התחלתי */}
            <ModuleCard
              icon="account_balance_wallet"
              title="תקציב התחלתי"
              description="צפייה בכל נתוני התקציב ההתחלתי למוסד: שעות, גמולים, תפקידים וסמלים."
              actionLabel="צפייה בתקציב"
              color="secondary"
              onClick={() => router.push(`/form/${enc}/budget`)}
            />

            {/* 3 — עובד חשבונית */}
            <ModuleCard
              icon="receipt_long"
              title="הוספת עובד חשבונית"
              description="הוספת עובד בקטגוריה חשבונית — ללא שיוך לתקן תקציבי."
              actionLabel="בקרוב"
              color="tertiary"
              disabled
              badge="בפיתוח"
              onClick={() => router.push(`/form/${enc}/invoice`)}
            />

            {/* 4 — תיק אישי */}
            <ModuleCard
              icon="folder_shared"
              title="תיק אישי לעובד"
              description="צפייה בפרטי עובדים והעלאת מסמכים אישיים: אישורים, חוזים ועוד."
              actionLabel="בקרוב"
              color="neutral"
              disabled
              badge="בפיתוח"
              onClick={() => router.push(`/form/${enc}/personnel`)}
            />

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
