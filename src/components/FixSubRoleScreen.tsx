'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Footer } from '@/components/shell/Footer';
import { DashboardTopNav } from '@/components/InstitutionDashboard';
import { DocUpload } from '@/components/steps/DocUpload';
import type { UploadedDoc } from '@/lib/formTypes';
import type { SubRoleFixContext } from '@/lib/loadSubRoleFix';
import {
  requiresLandbergApproval,
  requiresLicenseNumber,
  subRoleDocsFor,
} from '@/lib/subRole';

/**
 * מסך השלמת תת-תפקיד לתקן שסומן "דורש תיקון".
 *
 * מסך צר ונפרד ממסלול העריכה המלא בכוונה: הוא נוגע רק בתת-תפקיד, מספר רישיון
 * ומסמכים, ולכן לא מריץ מחדש בדיקת תקציב, תקרת 42 ש"ש או אופק, ולא שולח webhook.
 *
 * ההצעה הקנונית ממולאת מראש כשיש ודאות, אבל כפתור השמירה נעול עד אישור פעיל:
 * 126 מתוך 155 התקנים ניתנים למיפוי אוטומטי, ובלי אישור מפורש זה היה הופך
 * לאישור גורף שמפספס בדיוק את המקרים שדורשים עין אנושית.
 */
export function FixSubRoleScreen({ ctx }: { ctx: SubRoleFixContext }) {
  const router = useRouter();
  const { token } = ctx;
  const backToList = `/form/${encodeURIComponent(token)}/positions`;

  const [subRole, setSubRole] = useState(ctx.suggestion);
  /** אישור פעיל של הבחירה. מתאפס בכל שינוי ערך, כולל חזרה להצעה המקורית. */
  const [confirmed, setConfirmed] = useState(false);
  const [landberg, setLandberg] = useState<'' | 'כן' | 'לא'>('');
  const [licenseNumber, setLicenseNumber] = useState(ctx.existingLicenseNumber);
  const [docs, setDocs] = useState<Record<string, UploadedDoc | undefined>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const onFile = new Set(ctx.existingSubRoleDocs);
  const options = ctx.subRoleOptions;
  const allDocs = subRoleDocsFor(options, subRole);
  const pendingDocs = allDocs.filter((d) => !onFile.has(d.fieldId));
  const onFileDocs = allDocs.filter((d) => onFile.has(d.fieldId));
  const needsLicense = requiresLicenseNumber(options, subRole);
  const needsLandberg = requiresLandbergApproval(options, subRole);
  const alreadyHandled = ctx.fixStatus === 'טופל';
  const needsConfirm = ctx.suggestion !== '';

  function chooseSubRole(next: string) {
    setSubRole(next);
    setConfirmed(false);
    setLandberg('');
    setDocs({});
    setError('');
  }

  async function save() {
    setError('');

    if (ctx.showsSubRole) {
      if (!subRole) return setError('יש לבחור תת-תפקיד.');
      if (needsConfirm && !confirmed) return setError('יש לאשר את הבחירה לפני השמירה.');
      if (needsLandberg && landberg !== 'כן') {
        return setError(
          landberg === 'לא'
            ? 'לא ניתן לשמור ללא אישור של אפרת ולנדברג.'
            : 'יש לציין האם עבר אישור של אפרת ולנדברג.',
        );
      }
      if (needsLicense && !licenseNumber.trim()) return setError("יש להזין מס' רישיון.");
      for (const d of pendingDocs) {
        if (!docs[d.fieldId]) return setError(`יש לצרף ${d.label}.`);
      }
    }

    setSaving(true);
    try {
      // המסמכים עולים ראשונים ובקשה נפרדת לכל קובץ (שומר כל גוף בקשה מתחת
      // למגבלת הגודל של הפלטפורמה), והשרת מאמת שהם אכן בתיק לפני שהוא מסמן "טופל".
      for (const d of pendingDocs) {
        const file = docs[d.fieldId];
        if (!file || !ctx.employeeId) continue;
        const up = await fetch('/api/upload-employee-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, employeeId: ctx.employeeId, fieldId: d.fieldId, file }),
        });
        const uj = await up.json().catch(() => ({}));
        if (!up.ok || !uj.ok) throw new Error(uj.message || `שגיאה בהעלאת ${d.label}.`);
      }

      const res = await fetch(`/api/positions/${ctx.positionId}/fix-subrole`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          subRole: ctx.showsSubRole ? subRole : '',
          licenseNumber: needsLicense ? licenseNumber.trim() : undefined,
          landbergApproval: needsLandberg ? landberg : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.message || 'שגיאה בשמירה.');

      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשמירה. נסו שוב.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface-bright" dir="rtl">
      <DashboardTopNav institution={ctx.mosadName} onBack={() => router.push(backToList)} />

      <main className="flex-1 px-margin-desktop py-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-right mb-8">
            <h1 className="text-display-lg text-primary mb-1">השלמת תת-תפקיד</h1>
            <p className="text-body-lg text-on-surface-variant">
              תת-התפקיד של תקן זה נקלט משנה קודמת כטקסט חופשי ולא נבחר מהרשימה, ולכן לא נדרשו
              המסמכים הנגזרים ממנו.
            </p>
          </div>

          {/* הקשר התקן, לקריאה בלבד */}
          <div className="bg-surface-container-low rounded-xl p-5 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Detail label="שם עובד" value={ctx.employeeName} />
            <Detail label="תפקיד" value={ctx.roleTitle} />
            <Detail label="מוסד" value={ctx.mosadName} />
          </div>

          <div className="bg-error-container/30 border border-error/30 rounded-xl p-4 mb-6 flex items-start gap-3">
            <Icon name="history" className="text-error text-[20px] mt-0.5 shrink-0" />
            <div className="text-right">
              <p className="text-label-lg font-bold text-on-surface">הערך שנקלט משנה קודמת</p>
              <p className="text-body-md text-on-surface-variant">
                &quot;{ctx.originalSubRole}&quot;
              </p>
            </div>
          </div>

          {done ? (
            <div className="bg-tertiary-container/40 border border-tertiary/40 rounded-xl p-6 text-right">
              <p className="text-title-md text-on-surface flex items-center gap-2 mb-2">
                <Icon name="check_circle" className="text-tertiary text-[22px]" fill />
                התקן טופל
              </p>
              <p className="text-body-md text-on-surface-variant mb-4">
                {ctx.showsSubRole
                  ? `תת-התפקיד עודכן ל"${subRole}" והתקן סומן כטופל.`
                  : 'הערך נוקה והתקן סומן כטופל.'}
              </p>
              <button
                onClick={() => router.push(backToList)}
                className="px-5 py-2.5 rounded-lg bg-primary text-on-primary text-label-lg font-bold hover:bg-primary/90 transition-colors"
              >
                חזרה לרשימת התקנים
              </button>
            </div>
          ) : !ctx.showsSubRole ? (
            /* שורת תקציב ללא רשימת תת-תפקיד: אין מה לבחור, הערך זלג לכאן בטעות */
            <div className="bg-surface-container-low rounded-xl p-6 text-right">
              <p className="text-body-lg text-on-surface mb-2">
                שורת התקציב של תקן זה אינה כוללת רשימת תת-תפקיד.
              </p>
              <p className="text-body-md text-on-surface-variant mb-5">
                הערך זלג לכאן מנתוני שנה קודמת ואינו רלוונטי לתפקיד. אישור יסיר את הערך ויסמן את
                התקן כטופל. לא נדרשים מסמכים.
              </p>
              {error && <ErrorLine text={error} />}
              <button
                onClick={save}
                disabled={saving}
                className="px-5 py-2.5 rounded-lg bg-primary text-on-primary text-label-lg font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? 'שומר…' : 'אישור וניקוי הערך'}
              </button>
            </div>
          ) : (
            <div className="bg-surface-container-low rounded-xl p-6 space-y-6">
              {alreadyHandled && (
                <p className="text-label-md text-on-surface-variant flex items-center gap-2">
                  <Icon name="info" className="text-[18px]" />
                  תקן זה כבר סומן כטופל. שמירה תעדכן אותו שוב.
                </p>
              )}

              <div>
                <label className="block text-label-lg font-bold text-on-surface mb-2 text-right">
                  תת-תפקיד <span className="text-error">*</span>
                </label>
                <select
                  value={subRole}
                  onChange={(e) => chooseSubRole(e.target.value)}
                  className="w-full bg-surface rounded-lg h-11 px-3 text-body-md border border-outline-variant"
                >
                  <option value="">בחר/י תת-תפקיד…</option>
                  {options.map((o) => (
                    <option key={o.name} value={o.name}>{o.name}</option>
                  ))}
                </select>
                <p className="text-label-sm text-on-surface-variant mt-2 text-right">
                  {ctx.suggestion
                    ? `הוצע אוטומטית לפי הערך שנקלט. יש לוודא שהבחירה נכונה לפני אישור.`
                    : 'לא ניתן להסיק את תת-התפקיד מהערך שנקלט. יש לבחור מהרשימה.'}
                </p>
              </div>

              {needsConfirm && subRole && (
                <label className="flex items-start gap-2.5 cursor-pointer text-right bg-surface rounded-lg p-3.5 border border-outline-variant">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => { setConfirmed(e.target.checked); setError(''); }}
                    className="mt-0.5"
                  />
                  <span className="text-body-md text-on-surface">
                    אני מאשר/ת ש<strong>{subRole}</strong> הוא תת-התפקיד הנכון עבור {ctx.employeeName || 'העובד/ת'}.
                  </span>
                </label>
              )}

              {needsLandberg && (
                <div className="text-right">
                  <p className="text-label-lg font-bold text-on-surface mb-2">
                    האם עבר אישור של אפרת ולנדברג? <span className="text-error">*</span>
                  </p>
                  <div className="flex gap-3">
                    {(['כן', 'לא'] as const).map((v) => (
                      <label key={v} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="landberg"
                          checked={landberg === v}
                          onChange={() => { setLandberg(v); setError(''); }}
                        />
                        <span className="text-body-md text-on-surface">{v}</span>
                      </label>
                    ))}
                  </div>
                  {landberg === 'לא' && (
                    <p className="text-label-md text-error mt-2 flex items-center gap-1.5">
                      <Icon name="error" className="text-[16px]" />
                      לא ניתן לשמור ללא אישור של אפרת ולנדברג.
                    </p>
                  )}
                </div>
              )}

              {needsLicense && (
                <div className="text-right">
                  <label className="block text-label-lg font-bold text-on-surface mb-2">
                    מס&apos; רישיון <span className="text-error">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={licenseNumber}
                    onChange={(e) => { setLicenseNumber(e.target.value); setError(''); }}
                    className="w-full bg-surface rounded-lg h-11 px-3 text-body-md border border-outline-variant"
                  />
                </div>
              )}

              {onFileDocs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {onFileDocs.map((d) => (
                    <span
                      key={d.fieldId}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-tertiary-container/30 text-on-surface text-label-sm"
                    >
                      <Icon name="check_circle" className="text-tertiary text-[16px]" fill />
                      {d.label} - קיים בתיק העובד
                    </span>
                  ))}
                </div>
              )}

              {pendingDocs.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pendingDocs.map((d) => (
                    <DocUpload
                      key={d.fieldId}
                      label={d.label}
                      required
                      value={docs[d.fieldId]}
                      onChange={(uploaded) => {
                        setDocs((prev) => ({ ...prev, [d.fieldId]: uploaded }));
                        setError('');
                      }}
                    />
                  ))}
                </div>
              )}

              {error && <ErrorLine text={error} />}

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={save}
                  disabled={saving || !subRole || (needsConfirm && !confirmed)}
                  className="px-5 py-2.5 rounded-lg bg-primary text-on-primary text-label-lg font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'שומר…' : 'שמירה וסימון כטופל'}
                </button>
                <button
                  onClick={() => router.push(backToList)}
                  className="px-5 py-2.5 rounded-lg border border-outline-variant text-on-surface-variant text-label-lg font-bold hover:bg-surface-container transition-colors"
                >
                  ביטול
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-label-sm text-on-surface-variant mb-0.5">{label}</p>
      <p className="text-body-lg text-on-surface font-medium">{value || '-'}</p>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="text-label-md text-error flex items-center gap-1.5 text-right">
      <Icon name="error" className="text-[16px]" />
      {text}
    </p>
  );
}
