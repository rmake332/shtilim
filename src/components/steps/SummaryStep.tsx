'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ActionBar } from '@/components/shell/ActionBar';
import { EmployeeData, RoleData, ScheduleData, YouthDocs } from '@/lib/formTypes';
import { maskTzClient } from '@/lib/maskClient';
import { DAYS, DAY_LABELS, type Day, type Shift } from '@/lib/schedule/time';
import { DOC_FIELDS } from '@/lib/airtable/schema';

export function SummaryStep({
  token,
  employee,
  role,
  schedule,
  docs,
  mode = 'new',
  positionId,
  onBack,
  onEdit,
  onNewPosition,
  onNewEmployee,
}: {
  token: string;
  employee: EmployeeData;
  role: RoleData;
  schedule: ScheduleData;
  docs: YouthDocs;
  mode?: 'new' | 'edit';
  positionId?: string;
  onBack: () => void;
  onEdit: (step: 'employee' | 'role' | 'schedule') => void;
  onNewPosition?: () => void;
  onNewEmployee?: () => void;
}) {
  const isEdit = mode === 'edit';
  const [consent, setConsent] = useState(isEdit); // edit mode: pre-consent (already acknowledged)
  const [submitting, setSubmitting] = useState(false);
  const [uploadNote, setUploadNote] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  /**
   * Upload youth documents after the position record exists. One request per file
   * (keeps each body small). A failed upload doesn't fail the submission — the
   * position is already saved; we surface a note so the secretary can retry/follow up.
   */
  async function uploadDocs(positionId: string): Promise<boolean> {
    const pending = DOC_FIELDS.filter((d) => docs[d.key]);
    if (pending.length === 0) return true;

    let allOk = true;
    for (let i = 0; i < pending.length; i++) {
      const d = pending[i];
      setUploadNote(`מעלה מסמכים… (${i + 1}/${pending.length})`);
      try {
        const res = await fetch('/api/upload-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, positionId, fieldId: d.fieldId, file: docs[d.key] }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j.ok) allOk = false;
      } catch {
        allOk = false;
      }
    }
    setUploadNote('');
    return allOk;
  }

  async function submit() {
    if (!isEdit && !consent) {
      setResult({ ok: false, message: 'יש לאשר את הצהרת הפרטיות לפני השליחה.' });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      let res: Response;
      let j: { ok: boolean; positionId?: string; message?: string };

      if (isEdit && positionId) {
        res = await fetch(`/api/positions/${positionId}?token=${encodeURIComponent(token)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, employee, role, schedule }),
        });
        j = await res.json();
        if (res.ok && j.ok) {
          setResult({ ok: true, message: 'התקן עודכן בהצלחה!' });
        } else {
          setResult({ ok: false, message: j.message || 'שגיאה בעדכון התקן.' });
        }
      } else {
        res = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, employee, role, schedule, consent }),
        });
        j = await res.json();
        if (res.ok && j.ok) {
          const docsOk = await uploadDocs(j.positionId!);
          setResult({
            ok: true,
            message: docsOk
              ? 'הטופס נשלח בהצלחה! התקן נוצר במערכת.'
              : 'הטופס נשלח והתקן נוצר, אך חלק מהמסמכים לא הועלו. ניתן לפנות למנהל המערכת להשלמתם.',
          });
        } else {
          setResult({ ok: false, message: j.message || 'שגיאה בשליחת הטופס.' });
        }
      }
    } catch {
      setResult({ ok: false, message: isEdit ? 'שגיאת רשת בעדכון התקן.' : 'שגיאת רשת בשליחת הטופס.' });
    } finally {
      setSubmitting(false);
    }
  }

  const week = schedule.week as Record<Day, Shift[]>;
  // Frontal/individual/stay breakdown exists only when the ofek-חדש calculator ran:
  // category פרא רפואי, or scheduleType "הוראה". "רגיל" and the rest have no breakdown.
  const hasBreakdown = role.category === 'פרא רפואי' || role.scheduleType === 'הוראה';

  if (result?.ok) {
    return (
      <div className="bg-white p-10 rounded-xl shadow-card border border-outline-variant text-center space-y-6">
        <Icon name="check_circle" className="text-tertiary text-6xl" fill />
        <p className="text-headline-md text-primary">{result.message}</p>
        {!isEdit && (
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            {onNewPosition && (
              <button
                onClick={onNewPosition}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-on-primary font-bold text-label-lg hover:bg-primary/90 transition-colors"
              >
                <Icon name="add_circle" className="text-[20px]" />
                תקן נוסף לאותו עובד
              </button>
            )}
            {onNewEmployee && (
              <button
                onClick={onNewEmployee}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-secondary-container text-on-secondary-container font-bold text-label-lg hover:bg-secondary-container/80 transition-colors"
              >
                <Icon name="person_add" className="text-[20px]" />
                הזנת עובד חדש
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        <div className="lg:col-span-8 space-y-6">
          <Card title="פרטי עובד" icon="person" onEdit={() => onEdit('employee')}>
            <Grid>
              <Item label="שם מלא" value={employee.name} />
              <Item label="מספר זהות" value={`ת.ז. ${maskTzClient(employee.tz)}`} />
              <Item label="דוא״ל" value={employee.email} />
              <Item label="מצב משפחתי" value={employee.maritalStatus} />
              <Item label="תאריך תחילת חוזה" value={employee.contractStartDate} />
              <Item label="ילדים מתחת לגיל 14" value={employee.childrenUnder14} />
            </Grid>
            {(() => {
              const attached = DOC_FIELDS.filter((d) => docs[d.key]);
              if (attached.length === 0) return null;
              return (
                <div className="mt-3 border-t border-outline-variant pt-3">
                  <p className="text-label-sm text-on-surface-variant mb-1">מסמכים מצורפים:</p>
                  <ul className="space-y-1">
                    {attached.map((d) => (
                      <li key={d.key} className="flex items-center gap-2 text-body-md">
                        <Icon name="description" className="text-primary text-[18px]" />
                        <span>{d.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </Card>

          <Card title="תפקיד ותקנים" icon="work" onEdit={() => onEdit('role')}>
            <Grid>
              <Item label="תפקיד" value={role.roleTitle} />
              <Item label="קטגוריה" value={role.category} />
              <Item label="סמל מוסד" value={role.symbolLabel} />
              <Item label="שכבה" value={role.layer} />
              <Item label="יתרת שעות" value={`${role.remainingHours} שעות`} />
              {role.salaryType && <Item label="סוג שכר" value={role.salaryType} />}
              {role.tariff && <Item label="תעריף" value={role.tariff} />}
              {role.ranking && <Item label="דירוג" value={role.ranking} />}
              {role.seniority && <Item label="ותק / אופק" value={role.seniority} />}
            </Grid>
            {(role.selectedGemulIds.length > 0 || role.selectedExtraRoleIds.length > 0) && (
              <div className="mt-4 pt-4 border-t border-outline-variant space-y-3">
                {role.selectedGemulTitles.length > 0 && (
                  <div>
                    <p className="text-label-sm text-on-surface-variant mb-1">גמולים נבחרים:</p>
                    <ul className="space-y-1">
                      {role.selectedGemulTitles.map((t) => (
                        <li key={t} className="flex items-center gap-2 text-body-md">
                          <Icon name="check_circle" className="text-tertiary text-[16px]" fill />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {role.selectedExtraRoleTitles.length > 0 && (
                  <div>
                    <p className="text-label-sm text-on-surface-variant mb-1">תפקידים נוספים:</p>
                    <ul className="space-y-1">
                      {role.selectedExtraRoleTitles.map((t) => (
                        <li key={t} className="flex items-center gap-2 text-body-md">
                          <Icon name="check_circle" className="text-tertiary text-[16px]" fill />
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card title="מערכת שעות שבועית" icon="calendar_month" onEdit={() => onEdit('schedule')}>
            <div className="divide-y divide-outline-variant/30">
              {DAYS.map((d) => {
                const shifts = (week[d] ?? []).filter((s) => s.in && s.out);
                return (
                  <div key={d} className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
                    <span className="w-16 shrink-0 text-label-md font-semibold text-on-surface-variant pt-0.5">
                      {DAY_LABELS[d]}
                    </span>
                    {shifts.length === 0 ? (
                      <span className="text-body-md text-on-surface-variant">—</span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {shifts.map((s, i) => (
                          <div key={i} className="flex items-center gap-2 text-body-md">
                            <span className="font-bold">{s.in}</span>
                            <span className="text-on-surface-variant text-label-sm">—</span>
                            <span className="font-bold">{s.out}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Hours concentration card */}
        <div className="lg:col-span-4">
          <div className="bg-primary-container text-on-primary rounded-xl shadow-card p-8 sticky top-24">
            <h3 className="text-headline-md mb-6 border-b border-white/20 pb-4 flex items-center gap-2">
              <Icon name="timer" /> ריכוז שעות שבועי
            </h3>
            <div className="flex justify-between items-end mb-6">
              <span className="opacity-80">סה״כ שבועי</span>
              <span className="text-display-lg-mobile font-bold text-on-tertiary-container">
                {schedule.weeklyHours}
              </span>
            </div>
            {hasBreakdown && (
              <>
                <Row label="שעות פרונטלי" value={schedule.frontalHours} />
                <Row label="שעות פרטני" value={schedule.individualHours} />
                <Row label="שהייה מהמוסד" value={schedule.stayHoursInstitution} />
                <Row label="שהייה מהבית" value={schedule.stayHoursHome} />
                {schedule.jobPercent > 0 && (
                  <Row label="אחוז משרה" value={`${Math.round(schedule.jobPercent)}%`} />
                )}
              </>
            )}
            {schedule.reductionReason && (
              <div className="mt-4 pt-3 border-t border-white/20">
                <Row label="סיבת הרעת תנאים" value={schedule.reductionReason} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Privacy consent — shown only for new submissions */}
      {!isEdit && (
        <div className="mt-8 p-6 bg-secondary-container/20 border border-secondary/20 rounded-xl">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
            <span className="text-body-md text-on-surface">
              אני מאשרת שהעובד יודע ומסכים למסירת פרטיו, ושכל הנתונים נכונים ומדויקים. הטופס יועבר לאישור.{' '}
              <a href="#" className="text-primary underline">
                הצהרת פרטיות
              </a>
            </span>
          </label>
        </div>
      )}

      {result && !result.ok && (
        <div className="mt-4 p-3 rounded-lg bg-error-container text-on-error-container text-body-md flex items-center gap-2">
          <Icon name="error" /> {result.message}
        </div>
      )}

      {uploadNote && (
        <div className="mt-4 p-3 rounded-lg bg-secondary-container/40 text-on-secondary-container text-body-md flex items-center gap-2">
          <Icon name="upload_file" /> {uploadNote}
        </div>
      )}

      <ActionBar
        title={isEdit ? 'עדכון התקן' : 'שליחת הטופס'}
        subtitle={submitting ? (uploadNote || (isEdit ? 'שומר שינויים…' : 'שולח…')) : undefined}
        nextLabel={isEdit ? 'שמור שינויים' : 'שלח טופס וסיים'}
        onBack={onBack}
        onNext={submit}
        nextDisabled={submitting}
      />
    </>
  );
}

function Card({
  title,
  icon,
  onEdit,
  children,
}: {
  title: string;
  icon: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl shadow-card border border-outline-variant/30 p-8">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-headline-md text-primary flex items-center gap-2">
          <Icon name={icon} className="text-primary-container" /> {title}
        </h3>
        <button className="text-primary text-label-lg hover:underline" onClick={onEdit}>
          עריכה
        </button>
      </div>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{children}</div>;
}
function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <span className="text-label-sm text-on-surface-variant block">{label}</span>
      <span className="text-body-md font-bold text-on-background">{value || '—'}</span>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between py-1">
      <span className="opacity-80 text-label-lg">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
