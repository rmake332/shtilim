'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';

/** Top app bar — shell from mockup 2. Logo + title + connected institution/employee + live clock + profile. */
export function TopNav({
  institution,
  employeeName,
  roleName,
  mode = 'new',
}: {
  institution?: string;
  employeeName?: string;
  roleName?: string;
  mode?: 'new' | 'edit';
}) {
  const [now, setNow] = useState<string>('');

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      const date = d.toLocaleDateString('he-IL');
      setNow(`${date} | ${time}`);
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
        <span className={`text-label-lg font-bold px-3 py-1.5 rounded-lg ${mode === 'edit' ? 'bg-secondary text-on-secondary' : 'bg-primary text-on-primary'}`}>
          {mode === 'edit' ? 'עריכת תקן' : 'הוספת תקן חדש'}
        </span>
      </div>
      <div className="flex items-center gap-4">
        {institution && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-tertiary-fixed/40 rounded-full text-tertiary">
            <Icon name="school" className="text-[18px]" />
            <span className="text-label-lg font-bold">מוסד: {institution}</span>
          </div>
        )}
        {employeeName && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary-container/50 rounded-full text-on-secondary-container">
            <Icon name="person" className="text-[18px]" />
            <span className="text-label-lg font-bold">{employeeName}</span>
          </div>
        )}
        {roleName && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-container/50 rounded-full text-white">
            <Icon name="work" className="text-[18px]" />
            <span className="text-label-lg font-bold">{roleName}</span>
          </div>
        )}
        <div className="flex flex-col items-end ml-4">
          <span className="text-label-lg font-bold text-primary">{now}</span>
        </div>
        <div className="h-10 w-10 rounded-full bg-primary-container flex items-center justify-center overflow-hidden border-2 border-outline-variant text-on-primary font-bold text-lg">
          {institution ? institution.trim().charAt(0) : <Icon name="person" />}
        </div>
      </div>
    </header>
  );
}
