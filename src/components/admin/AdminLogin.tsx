'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';

export function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (json.ok) router.refresh();
      else setError(json.message || 'שגיאה בכניסה.');
    } catch {
      setError('שגיאה בכניסה.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-bright px-4" dir="rtl">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-surface-container-lowest border border-outline-variant/50 rounded-2xl p-8 shadow-sm space-y-5"
      >
        <div className="flex flex-col items-center gap-3">
          <Image src="/logo_meyuhadim.webp" alt="מיוחדים בחינוך" width={64} height={64} className="object-contain" />
          <h1 className="text-headline-md font-bold text-primary">כניסת מנהל</h1>
        </div>
        <div>
          <label className="text-label-lg text-on-surface block mb-2">סיסמה</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
          />
        </div>
        {error && <p className="text-error text-body-md">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl font-bold text-label-lg hover:opacity-90 disabled:opacity-50 transition-all"
        >
          <Icon name="login" className="text-[20px]" />
          {busy ? 'נכנס…' : 'כניסה'}
        </button>
      </form>
    </div>
  );
}
