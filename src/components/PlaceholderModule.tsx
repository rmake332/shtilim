'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { Footer } from '@/components/shell/Footer';

function PlaceholderTopNav({ institution, onBack }: { institution: string; onBack: () => void }) {
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

export function PlaceholderModule({
  token,
  institutionName,
  title,
  description,
  icon,
  badgeLabel = 'בפיתוח',
}: {
  token: string;
  institutionName: string;
  title: string;
  description: string;
  icon: string;
  badgeLabel?: string;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col bg-surface-bright" dir="rtl">
      <PlaceholderTopNav
        institution={institutionName}
        onBack={() => router.push(`/form/${encodeURIComponent(token)}`)}
      />

      <main className="flex-1 px-margin-desktop py-10 flex items-center justify-center">
        <div className="max-w-lg w-full text-center bg-surface-container-lowest border border-outline-variant/50 rounded-2xl p-10 shadow-sm">
          <div className="w-20 h-20 rounded-2xl bg-surface-container flex items-center justify-center mx-auto mb-6">
            <Icon name={icon} className="text-[40px] text-on-surface-variant" />
          </div>

          <span className="inline-block mb-4 px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-label-sm font-bold border border-outline-variant/40">
            {badgeLabel}
          </span>

          <h1 className="text-headline-lg font-bold text-on-surface mb-3">{title}</h1>
          <p className="text-body-lg text-on-surface-variant mb-8 leading-relaxed">{description}</p>

          <button
            onClick={() => router.push(`/form/${encodeURIComponent(token)}`)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl font-bold text-label-lg hover:opacity-90 active:scale-[0.98] transition-all"
          >
            <Icon name="arrow_forward" className="text-[18px]" />
            חזרה לתפריט
          </button>
        </div>
      </main>

      <Footer />
    </div>
  );
}
