'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ActionBar } from '@/components/shell/ActionBar';
import { ScheduleData, emptySchedule, RoleData, EmployeeData } from '@/lib/formTypes';
import type { PrevYearPosition } from '@/lib/prevYearPosition';
import { BellSlotPicker, type BellSlot } from './BellSlotPicker';
import {
  DAYS,
  DAY_LABELS,
  validateDay,
  weeklyMinutes,
  shiftMinutes,
  WEEKLY_CAP_HOURS,
  snapToHalf,
  paraDayHours,
  type Shift,
  type Day,
} from '@/lib/schedule/time';

/** Unified over-budget message, shared across all schedule types. */
function overBudgetMessage(hours: number, remaining: number): string {
  return `מספר השעות שהוזן (${hours}) חורג מיתרת התקציב לתפקיד (${remaining})`;
}

const NON_INTEGER_HOURS_ERROR =
  'סה"כ שעות המערכת יהיו במספר עגול בלבד!\nלא ניתן להתקדם בתהליך בהזנת מערכת שכוללת מספר עשרוני';

/**
 * Render all blocking errors (red) and non-blocking warnings (amber) together.
 * Each list shows every message so the user sees all problems at once.
 */
function AlertBanners({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  return (
    <>
      {errors.length > 0 && (
        <div className="p-3 rounded-lg bg-error-container text-on-error-container text-body-md">
          <div className="flex items-center gap-2 font-bold mb-1">
            <Icon name="error" /> {errors.length > 1 ? 'יש לתקן את השגיאות הבאות:' : 'שגיאה'}
          </div>
          <ul className={errors.length > 1 ? 'list-disc pr-7 space-y-0.5' : 'pr-7'}>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="p-3 rounded-lg bg-secondary-container/40 text-on-secondary-container text-body-md">
          <div className="flex items-center gap-2 font-bold mb-1">
            <Icon name="warning" /> {warnings.length > 1 ? 'שימו לב:' : 'שימו לב'}
          </div>
          <ul className={warnings.length > 1 ? 'list-disc pr-7 space-y-0.5' : 'pr-7'}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function PrevYearSummary({ prevYear }: { prevYear: PrevYearPosition }) {
  const rows: { label: string; value: number | null }[] = [
    { label: 'שעות לניצול (תשפ״ו)', value: prevYear.hoursForBudget },
    { label: 'פרונטלי', value: prevYear.frontalHours },
    { label: 'פרטני', value: prevYear.individualHours },
    { label: 'שהייה', value: prevYear.stayHours },
  ];
  const hasData = rows.some((r) => r.value !== null);
  if (!hasData) return null;
  return (
    <div className="mb-4 p-4 rounded-xl border border-outline-variant bg-surface-container-low">
      <div className="flex items-center gap-2 mb-3">
        <Icon name="history" className="text-on-surface-variant text-[18px]" />
        <span className="text-label-md font-semibold text-on-surface-variant">נתוני שנה קודמת (תשפ״ו) — לעיון בלבד</span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {rows.map(({ label, value }) =>
          value !== null ? (
            <div key={label} className="flex items-baseline gap-1.5 text-body-sm">
              <span className="text-on-surface-variant">{label}:</span>
              <span className="font-bold text-on-surface">{value}</span>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

const SCHEDULE_TYPE = {
  regular: 'רגיל',
  teaching: 'הוראה',
  para: 'פרא',
  deputy1: 'סגן ראשון',
  deputy2: 'סגן שני',
  manager: 'מנהל/ת',
  substitute: 'מילוי מקום',
  invoice: 'חשבונית',
};

export function ScheduleStep({
  token,
  employee,
  role,
  initial,
  positionId,
  prevYear,
  onNext,
  onBack,
  onEditEmployee,
}: {
  token: string;
  employee: EmployeeData;
  role: RoleData;
  initial?: ScheduleData;
  positionId?: string;
  prevYear?: PrevYearPosition;
  onNext: (data: ScheduleData) => void;
  onBack?: () => void;
  onEditEmployee?: () => void;
}) {
  const type = role.scheduleType;
  const [data, setData] = useState<ScheduleData>(initial ?? emptySchedule());

  // ----- non-schedule types -----
  if (type === SCHEDULE_TYPE.invoice) {
    return (
      <>
        <div className="p-6 rounded-xl bg-error-container text-on-error-container text-body-md flex items-center gap-2">
          <Icon name="info" /> עובדים בחשבונית לא מוסיפים למערכת תקציבים
        </div>
        <ActionBar title="לא ניתן להמשיך" showBack onNext={() => {}} nextDisabled onBack={onBack} />
      </>
    );
  }

  if (type === SCHEDULE_TYPE.substitute) {
    return (
      <>
        <div className="p-6 rounded-xl bg-secondary-container/30 text-on-secondary-container text-body-md">
          תפקיד מסוג מילוי מקום — אין צורך בהזנת מערכת שעות. ניתן להמשיך לסיכום.
        </div>
        <ActionBar
          title="המשך לסיכום"
          onBack={onBack}
          showBack={!!onBack}
          onEditEmployee={onEditEmployee}
          onNext={() => onNext({ ...emptySchedule(), weeklyHours: 0 })}
        />
      </>
    );
  }

  if (type === SCHEDULE_TYPE.manager || type === SCHEDULE_TYPE.deputy2) {
    const label = type === SCHEDULE_TYPE.manager ? 'מס׳ שעות שבועיות' : 'מס׳ תקנים';
    const value = data.manualWeeklyHours ?? role.remainingHours;
    return (
      <>
        <section className="bg-white p-8 rounded-xl shadow-card border border-outline-variant max-w-md">
          <label className="text-label-lg text-on-surface block mb-2">{label}</label>
          <input
            type="number"
            step="0.5"
            className="w-full bg-surface-container-low rounded-lg py-3 px-3 text-body-md"
            value={value}
            onChange={(e) => setData((d) => ({ ...d, manualWeeklyHours: Number(e.target.value) }))}
          />
        </section>
        <ActionBar
          title="המשך לסיכום"
          onBack={onBack}
          showBack={!!onBack}
          onEditEmployee={onEditEmployee}
          onNext={() => {
            const wh = data.manualWeeklyHours ?? role.remainingHours;
            onNext({ ...emptySchedule(), weeklyHours: wh });
          }}
        />
      </>
    );
  }

  // ----- teaching staff with a bell schedule: pick slots instead of typing times -----
  // Only for the full-timetable teaching type (scheduleType "הוראה"). Roles that are
  // category=הוראה but use a different entry mechanism — סגן ראשון (37.5/40 picker),
  // מנהל/ת & סגן שני (handled above), or רגיל (manual grid) — must NOT land here even
  // if they happen to carry a bell-schedule number.
  if (type === SCHEDULE_TYPE.teaching && role.bellScheduleNums.length > 0) {
    return (
      <BellScheduleGrid
        token={token}
        employee={employee}
        role={role}
        data={data}
        setData={setData}
        positionId={positionId}
        prevYear={prevYear}
        onBack={onBack}
        onEditEmployee={onEditEmployee}
        onNext={onNext}
      />
    );
  }

  // ----- schedule-grid types: regular / deputy1 / para / teaching (no bell schedule) -----
  const maxShifts = type === SCHEDULE_TYPE.deputy1 ? 1 : 3;
  return (
    <GridSchedule
      token={token}
      employee={employee}
      role={role}
      type={type}
      maxShifts={maxShifts}
      data={data}
      setData={setData}
      positionId={positionId}
      prevYear={prevYear}
      onBack={onBack}
      onEditEmployee={onEditEmployee}
      onNext={onNext}
    />
  );
}

function GridSchedule({
  token,
  employee,
  role,
  type,
  maxShifts,
  data,
  setData,
  positionId,
  prevYear,
  onBack,
  onEditEmployee,
  onNext,
}: {
  token: string;
  employee: EmployeeData;
  role: RoleData;
  type: string | null;
  maxShifts: number;
  data: ScheduleData;
  setData: React.Dispatch<React.SetStateAction<ScheduleData>>;
  positionId?: string;
  prevYear?: PrevYearPosition;
  onBack?: () => void;
  onEditEmployee?: () => void;
  onNext: (d: ScheduleData) => void;
}) {
  const deputyWeekly = (employee.gender === 'נקבה' && employee.childrenUnder14 === 'כן') ? 37.5 : 40;
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [computing, setComputing] = useState(false);
  const [ofek1, setOfek1] = useState<OfekResult | null>(null);
  const [hoursAtOfek1, setHoursAtOfek1] = useState<number | null>(null);
  const [existing, setExisting] = useState<ExistingResult | null>(null);
  const [ofek, setOfek] = useState<OfekResult | null>(null);
  const [reductionChoices, setReductionChoices] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/field-choices?token=${encodeURIComponent(token)}&fieldId=fldSi9R0RCfrHNDuU`)
      .then((r) => r.json())
      .then((j) => { if (j.choices) setReductionChoices(j.choices); })
      .catch(() => {});
  }, [token]);

  const week = data.week as Record<Day, Shift[]>;
  const totalMin = weeklyMinutes(week);
  const totalHours = totalMin / 60;
  const overCap = totalHours > WEEKLY_CAP_HOURS;

  // Hours that actually count against the budget.
  // For סגן ראשון this is the chosen 37.5/40 — NOT the sum of the entered grid.
  const isDeputy1 = type === 'סגן ראשון';
  const isParaCat = role.category === 'פרא רפואי';
  // פרא: per-day academic hours using the deduction formula; accumulate errors for days < 80 min.
  let paraHours = 0;
  const paraDayErrors: string[] = [];
  for (const d of DAYS) {
    const dayMin = (week[d] ?? []).reduce((s, sh) => s + shiftMinutes(sh), 0);
    const result = paraDayHours(dayMin);
    if (result === null) continue; // rest day
    if (!result.ok) { paraDayErrors.push(`יום ${DAY_LABELS[d]}: ${result.error}`); continue; }
    paraHours += result.hours;
  }
  const utilizedHours = isDeputy1 ? deputyWeekly : isParaCat ? paraHours : totalHours;

  const dayErrors: Partial<Record<Day, string>> = {};
  for (const d of DAYS) {
    const v = validateDay(week[d] ?? []);
    if (!v.ok) dayErrors[d] = v.error;
  }
  const hasDayError = Object.keys(dayErrors).length > 0;

  function updateShift(day: Day, idx: number, field: 'in' | 'out', val: string) {
    setOfek(null);
    setData((prev) => {
      const w = { ...(prev.week as Record<Day, Shift[]>) };
      const shifts = [...(w[day] ?? [])];
      shifts[idx] = { ...(shifts[idx] ?? { in: '', out: '' }), [field]: val };
      w[day] = shifts;
      return { ...prev, week: w };
    });
  }
  function addShift(day: Day) {
    setOfek(null);
    setData((prev) => {
      const w = { ...(prev.week as Record<Day, Shift[]>) };
      const shifts = [...(w[day] ?? [])];
      if (shifts.length < maxShifts) shifts.push({ in: '', out: '' });
      w[day] = shifts;
      return { ...prev, week: w };
    });
  }
  function removeShift(day: Day, idx: number) {
    setOfek(null);
    setData((prev) => {
      const w = { ...(prev.week as Record<Day, Shift[]>) };
      w[day] = (w[day] ?? []).filter((_, i) => i !== idx);
      return { ...prev, week: w };
    });
  }

  const isPara = role.category === 'פרא רפואי';
  // Ofek is needed only for real timetable entry: פרא, or teaching with scheduleType "הוראה".
  // Roles that are category=הוראה but scheduleType סגן ראשון / מנהל/ת do NOT need the calculator.
  const isTeaching = role.category === 'הוראה' && type === SCHEDULE_TYPE.teaching;
  const needsOfek = isPara || isTeaching;

  // When entered hours change, invalidate all ofek results so the user must re-run check 1.
  const currentHoursForOfek = isPara
    ? (paraDayErrors.length === 0 ? (snapToHalf(paraHours, 0.012) ?? null) : null)
    : totalHours;
  useEffect(() => {
    if (hoursAtOfek1 === null) return;
    if (currentHoursForOfek === null) return;
    if (Math.abs(currentHoursForOfek - hoursAtOfek1) > 0.001) {
      setOfek1(null);
      setHoursAtOfek1(null);
      setExisting(null);
      setOfek(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHoursForOfek]);

  function getEnteredHours(): number | null {
    if (isPara) {
      if (paraDayErrors.length > 0) return null;
      return snapToHalf(paraHours, 0.012) ?? null;
    }
    return totalHours;
  }

  /** Step 1 — current role only, no combined check. */
  async function runOfek1() {
    setErrors([]);
    setWarnings([]);
    if (isPara && paraDayErrors.length > 0) { setErrors(paraDayErrors); return; }
    const hours = getEnteredHours();
    if (hours === null) { setErrors([NON_INTEGER_HOURS_ERROR]); return; }
    setOfek1(null); setHoursAtOfek1(null); setExisting(null); setOfek(null);
    setComputing(true);
    try {
      const j = await computeOfek(token, employee, role, hours, true, positionId);
      setOfek1(j);
      if (!j.ok) { setErrors([j.message || 'לא נמצאה התאמה במחשבון אופק חדש']); return; }
      setHoursAtOfek1(hours);
    } finally { setComputing(false); }
  }

  /** Step 2 — look up existing positions in same category+layer. */
  async function runCheck2() {
    setErrors([]);
    setExisting(null); setOfek(null);
    setComputing(true);
    try {
      const params = new URLSearchParams({ token, tz: employee.tz, category: role.category, layer: role.layer });
      if (positionId) params.set('excludePositionId', positionId);
      const res = await fetch(`/api/schedule/existing-positions?${params}`);
      const j = await res.json();
      if (!j.ok) { setErrors(['שגיאה בבדיקת תפקידים נוספים']); return; }
      setExisting({ count: j.count, frontalHours: j.frontalHours, individualHours: j.individualHours, stayHours: j.stayHours });
    } finally { setComputing(false); }
  }

  /** Step 3 — combined check (with tz → server combines existing + current). */
  async function runOfek3() {
    setErrors([]);
    setWarnings([]);
    const hours = getEnteredHours();
    if (hours === null) { setErrors([NON_INTEGER_HOURS_ERROR]); return; }
    setOfek(null);
    setComputing(true);
    try {
      const j = await computeOfek(token, employee, role, hours, false, positionId);
      setOfek(j);
      if (!j.ok) { setErrors([j.message || 'לא נמצאה התאמה במחשבון אופק חדש']); return; }
      const warns: string[] = [];
      if (j.reducedVsLastYear && !data.reductionReason)
        warns.push('מספר השעות שהוזן קטן ממספר השעות בשנה הקודמת — יש לבחור סיבה להמשך.');
      setWarnings(warns);
    } finally { setComputing(false); }
  }

  async function validateAndNext() {
    setErrors([]);
    setWarnings([]);
    // Collect ALL applicable alerts so the user sees every problem at once.
    const errs: string[] = [];
    const warns: string[] = [];
    if (hasDayError) errs.push('יש לתקן את שגיאות מערכת השעות');
    if (overCap) errs.push('מערכת שעות לעובד מוגבלת לפי חוק ל-42 שעות שבועיות');
    if (isPara) errs.push(...paraDayErrors);
    // פרא: block if hours can't snap to nearest whole/half within ±0.01.
    if (isPara && paraDayErrors.length === 0 && snapToHalf(paraHours, 0.012) === null)
      errs.push(NON_INTEGER_HOURS_ERROR);

    // Deputy-1: weekly hours come from the 37.5/40 selector.
    if (type === 'סגן ראשון') {
      if (errs.length) {
        setErrors(errs);
        return;
      }
      onNext({ ...data, weeklyHours: deputyWeekly });
      return;
    }

    // Regular: just the entered hours; NO ofek calc, so there is no
    // frontal/individual/stay breakdown. Zero those out. Block if over budget.
    if (!needsOfek) {
      const hours = Math.round(totalHours * 100) / 100;
      if (hours > role.remainingHours) errs.push(overBudgetMessage(hours, role.remainingHours));
      if (errs.length) {
        setErrors(errs);
        return;
      }
      onNext({
        ...data,
        weeklyHours: hours,
        frontalHours: 0,
        individualHours: 0,
        stayHoursInstitution: 0,
        stayHoursHome: 0,
        jobPercent: 0,
      });
      return;
    }

    // Para / Teaching: don't proceed if the grid itself is already invalid.
    if (errs.length) {
      setErrors(errs);
      return;
    }
    if (!ofek1?.ok || existing === null) {
      setErrors(['יש לבצע את הבדיקות לפני המשך']);
      return;
    }
    // Step 3 required only when there are additional roles.
    if (existing.count > 0 && !ofek?.ok) {
      setErrors(['יש לבצע את בדיקה 3 לפני המשך']);
      return;
    }
    // Use step-3 result when it exists, otherwise step-1 result.
    const j = (existing.count > 0 ? ofek : ofek1)!;
    if (j.overBudget) errs.push(overBudgetMessage(j.finalHours, role.remainingHours));
    if (j.reducedVsLastYear && !data.reductionReason) {
      warns.push('מספר השעות שהוזן קטן ממספר השעות בשנה הקודמת — יש לבחור סיבה להמשך.');
    }
    // Errors block; warnings are shown but do not block (preserves prior behavior).
    if (errs.length) {
      setErrors(errs);
      setWarnings(warns);
      return;
    }
    setWarnings(warns);
    onNext({
      ...data,
      weeklyHours: j.finalHours,
      frontalHours: j.frontalHours,
      individualHours: j.individualHours,
      stayHoursInstitution: j.stayHoursInstitution,
      stayHoursHome: j.stayHoursHome,
      severeDisabilityBonus: j.bonus,
      jobPercent: j.jobPercent,
      motherPosition: j.motherPosition,
      ofekRecordId: j.ofekRecordId,
      ofekAllRolesRecordId: j.ofekAllRolesRecordId,
    });
  }

  return (
    <>
    {prevYear && <PrevYearSummary prevYear={prevYear} />}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
      {/* Summary panel */}
      <aside className="lg:col-span-4 lg:order-2 order-1">
        <div className="bg-white p-6 rounded-xl shadow-card border border-outline-variant sticky top-24">
          <h3 className="text-headline-md text-primary font-bold mb-6">סיכום שבועי</h3>
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-on-surface-variant text-body-md">שעות לניצול</span>
            <span className={`text-display-lg-mobile font-bold ${overCap ? 'text-error' : 'text-primary'}`}>
              {utilizedHours.toFixed(2)}
            </span>
          </div>
          <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden mb-3">
            <div
              className={`h-full ${overCap ? 'bg-error' : 'bg-primary'}`}
              style={{ width: `${Math.min(100, (utilizedHours / WEEKLY_CAP_HOURS) * 100)}%` }}
            />
          </div>
          <p className="text-label-sm text-on-surface-variant flex items-center gap-1">
            <Icon name="info" className="text-[16px]" /> מוגבל ל-42 שעות שבועיות לפי חוק
          </p>
          {isDeputy1 && (
            <div className="mt-3 text-label-sm flex justify-between text-on-surface-variant">
              <span>סה״כ שעות שהוזנו במערכת:</span>
              <span>{totalHours.toFixed(2)}</span>
            </div>
          )}

          {/* עיגול לאופק — פרא בלבד, טווח ±0.01 */}
          {isPara && paraDayErrors.length === 0 && paraHours > 0 && (() => {
            const snapped = snapToHalf(paraHours, 0.012);
            const diff = snapped !== null ? snapped - paraHours : null;
            return (
              <div className="mt-3 rounded-lg bg-surface-container-low p-3 space-y-1 text-label-sm">
                <div className="flex justify-between text-on-surface-variant">
                  <span>שעות בפועל:</span>
                  <span className="font-bold">{paraHours.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span>שעות לבדיקה באופק:</span>
                  <span className={`font-bold ${snapped === null ? 'text-error' : 'text-primary'}`}>
                    {snapped !== null ? snapped.toFixed(2) : 'לא ניתן לעגל'}
                  </span>
                </div>
                {diff !== null && Math.abs(diff) > 0.001 && (
                  <div className="flex justify-between text-on-surface-variant">
                    <span>הפרש:</span>
                    <span className={`font-bold ${diff > 0 ? 'text-[#1a6b2f]' : 'text-error'}`}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          <div className="mt-4 text-label-lg flex justify-between">
            <span className="text-on-surface-variant">יתרת תקציב:</span>
            <span className="font-bold text-primary">{role.remainingHours} שעות</span>
          </div>

          {needsOfek && ofek?.ok && (
            <OfekBreakdown ofek={ofek} />
          )}
        </div>
      </aside>

      {/* Days grid */}
      <div className="lg:col-span-8 lg:order-1 order-2 space-y-4">
        {(type === 'סגן ראשון') && (
          <div className="bg-white p-4 rounded-lg border border-outline-variant max-w-xs">
            <label className="text-label-lg text-on-surface block mb-2">מס׳ שעות שבועיות</label>
            <div className="flex items-center gap-3">
              <span className="text-display-lg-mobile font-bold text-primary">{deputyWeekly}</span>
              <span className="text-label-sm text-on-surface-variant">
                {deputyWeekly === 37.5 ? '(עובדת עם ילדים מתחת גיל 14)' : '(ברירת מחדל)'}
              </span>
            </div>
          </div>
        )}

        {DAYS.map((day) => {
          const shifts = week[day] ?? [];
          const visible = shifts.length ? shifts : [{ in: '', out: '' }];
          const err = dayErrors[day];
          const dayMin = shifts.reduce((s, sh) => s + shiftMinutes(sh), 0);
          const paraDayResult = isParaCat ? paraDayHours(dayMin) : null;
          const dayLabel = isParaCat
            ? paraDayResult?.ok ? `${paraDayResult.hours.toFixed(2)} שע׳` : null
            : dayMin > 0 ? `${(dayMin / 60).toFixed(2)} שעות` : null;
          return (
            <div
              key={day}
              className={`bg-white p-6 rounded-lg shadow-card border ${
                err ? 'border-error/60' : 'border-transparent hover:border-outline-variant'
              }`}
            >
              <div className="flex items-start gap-6 flex-wrap">
                <div className="w-16 mt-2 flex flex-col items-start gap-1">
                  <span className="font-bold text-primary">{DAY_LABELS[day]}</span>
                  {dayLabel && (
                    <span className="text-label-sm font-bold text-[#003466] bg-[#89f5e7] px-2 py-0.5 rounded-md">
                      {dayLabel}
                    </span>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-3">
                  {visible.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-4">
                      <TimeBox label="כניסה" value={s.in} onChange={(v) => updateShift(day, idx, 'in', v)} />
                      <TimeBox label="יציאה" value={s.out} onChange={(v) => updateShift(day, idx, 'out', v)} />
                      <button onClick={() => removeShift(day, idx)} aria-label="מחק משמרת">
                        <Icon name="delete" className="text-outline hover:text-error" />
                      </button>
                    </div>
                  ))}
                  {shifts.length < maxShifts && (
                    <button
                      onClick={() => addShift(day)}
                      className="flex items-center gap-1 text-primary font-bold hover:underline w-fit"
                    >
                      <Icon name="add" className="text-[20px]" /> הוסף משמרת
                    </button>
                  )}
                </div>
              </div>
              {err && <p className="text-error text-label-sm mt-2">{err}</p>}
            </div>
          );
        })}

        {/* Ofek-חדש check (para / teaching) */}
        {needsOfek && (
          <OfekChecks
            computing={computing}
            disabled={hasDayError}
            ofek1={ofek1}
            existing={existing}
            ofek3={ofek}
            category={role.category}
            layer={role.layer}
            onStep1={runOfek1}
            onStep2={runCheck2}
            onStep3={runOfek3}
          />
        )}

        {/* הרעת תנאים — dropdown מופיע כשהשעות קטנות מהשנה הקודמת */}
        {(() => {
          const activeOfek = (existing?.count ?? 0) > 0 ? ofek : ofek1;
          if (!activeOfek?.reducedVsLastYear) return null;
          return (
            <div className="p-4 rounded-xl bg-secondary-container/30 border border-secondary/30 space-y-3">
              <div className="flex items-start gap-2 text-on-secondary-container">
                <Icon name="warning" className="text-[20px] mt-0.5 shrink-0" />
                <div className="text-body-md">
                  <p className="font-bold">שעות קטנות מהשנה הקודמת — נדרשת סיבה</p>
                  <p className="text-label-sm mt-0.5">
                    שנה שעברה: {activeOfek.previousYear} שעות ← השנה (סה״כ): {activeOfek.totalCurrentHours} שעות
                  </p>
                </div>
              </div>
              <select
                value={data.reductionReason ?? ''}
                onChange={(e) => setData((d) => ({ ...d, reductionReason: e.target.value }))}
                className="w-full rounded-lg bg-white border border-secondary/40 py-2.5 px-3 text-body-md text-on-surface"
              >
                <option value="">— בחר סיבת הפחתה —</option>
                {reductionChoices.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          );
        })()}

        <AlertBanners errors={errors} warnings={warnings} />

        <ActionBar
          backLabel={computing ? 'מחשב…' : 'חזרה לשלב הקודם'}
          onBack={onBack}
          showBack={!!onBack}
          onEditEmployee={onEditEmployee}
          onNext={validateAndNext}
          nextDisabled={computing || (needsOfek && (!ofek1?.ok || existing === null || (existing.count > 0 && !ofek?.ok)))}
        />
      </div>
    </div>
    </>
  );
}

interface OfekResult {
  ok: boolean;
  message?: string;
  key?: string;
  effectiveKey?: string;
  finalHours: number;
  bonus: number;
  jobPercent: number;
  motherPosition: boolean;
  frontalHours: number;
  individualHours: number;
  stayHoursInstitution: number;
  stayHoursHome: number;
  additionalRoles: number;
  overBudget?: boolean;
  reducedVsLastYear?: boolean;
  previousYear?: number | null;
  totalCurrentHours?: number;
  ofekRecordId?: string;
  ofekAllRolesRecordId?: string;
  /** Raw row from מחשבון אופק שכר (before back-out of other roles). Only on step 3. */
  ofekRow?: {
    frontalHours: number;
    individualHours: number;
    stayHours: number;
    totalHours: number;
    jobPercent: number;
  };
  debug?: {
    ofekKey: string;
    existingPositions: {
      count: number;
      frontalHours: number;
      individualHours: number;
      stayHours: number;
    } | null;
    combinedKey?: string;
    motherPosition: boolean;
    jobPercent: number;
  };
}

/** Call the ofek-חדש compute endpoint. Shared by the manual grid and the bell-schedule grid.
 *  Pass skipExisting=true for step-1 (current role only, no combined check). */
async function computeOfek(
  token: string,
  employee: EmployeeData,
  role: RoleData,
  enteredHours: number,
  skipExisting = false,
  editPositionId?: string,
): Promise<OfekResult> {
  const res = await fetch('/api/schedule/compute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      category: role.category,
      scheduleType: role.scheduleType,
      layer: role.layer,
      ageHours: employee.ageHours,
      enteredHours: Math.round(enteredHours * 100) / 100,
      gender: employee.gender,
      maritalStatus: employee.maritalStatus,
      hasChildrenUnder14: employee.childrenUnder14 === 'כן',
      paraBoard: role.paraBoard,
      severeDisabilityFlag: role.severeDisability,
      isBehaviorAnalyst: role.subRole.includes('מנתחת התנהגות'),
      // tz is always sent for the prev-year check; skipExisting controls the combined-roles check
      tz: employee.tz,
      skipExisting,
      editPositionId,
      institution: role.symbolLabel,
      budgetRemaining: role.remainingHours,
    }),
  });
  const j = await res.json();
  if (!j.ok) return { ok: false, message: j.message, effectiveKey: j.effectiveKey, debug: j.debug } as OfekResult;
  return {
    ok: true,
    key: j.key,
    effectiveKey: j.effectiveKey,
    finalHours: j.finalHours,
    bonus: j.bonus,
    jobPercent: j.jobPercent,
    motherPosition: j.motherPosition,
    frontalHours: j.frontalHours,
    individualHours: j.individualHours,
    stayHoursInstitution: j.stayHoursInstitution,
    stayHoursHome: j.stayHoursHome,
    additionalRoles: j.additionalRoles ?? 0,
    overBudget: j.overBudget,
    reducedVsLastYear: j.reducedVsLastYear,
    previousYear: j.previousYear,
    totalCurrentHours: j.totalCurrentHours,
    ofekRecordId: j.ofekRecordId,
    ofekAllRolesRecordId: j.ofekAllRolesRecordId,
    ofekRow: j.ofekRow,
    debug: j.debug,
  };
}

/**
 * Bell-schedule grid for teaching staff. Per day (Sun–Fri) the user picks up to 3
 * slots from the role's bell schedule; each pick fills that day's entry/exit and
 * contributes its שעות יומיות. Weekly hours = Σ picked daily-hours, then ofek runs.
 */
const MAX_BELL_SHIFTS = 3;
function BellScheduleGrid({
  token,
  employee,
  role,
  data,
  setData,
  positionId,
  prevYear,
  onBack,
  onEditEmployee,
  onNext,
}: {
  token: string;
  employee: EmployeeData;
  role: RoleData;
  data: ScheduleData;
  setData: React.Dispatch<React.SetStateAction<ScheduleData>>;
  positionId?: string;
  prevYear?: PrevYearPosition;
  onBack?: () => void;
  onEditEmployee?: () => void;
  onNext: (d: ScheduleData) => void;
}) {
  const [slots, setSlots] = useState<BellSlot[]>([]);
  const [loadErr, setLoadErr] = useState('');
  // Picked slot id + its daily hours, per day/shift. Mirrors data.week (which holds in/out).
  const [picks, setPicks] = useState<Record<Day, (BellSlot | null)[]>>(() => {
    const init = {} as Record<Day, (BellSlot | null)[]>;
    for (const d of DAYS) init[d] = [];
    return init;
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [computing, setComputing] = useState(false);
  const [ofek1, setOfek1] = useState<OfekResult | null>(null);
  const [hoursAtOfek1, setHoursAtOfek1] = useState<number | null>(null);
  const [existing, setExisting] = useState<{ count: number; frontalHours: number; individualHours: number; stayHours: number } | null>(null);
  const [ofek, setOfek] = useState<OfekResult | null>(null);
  const [reductionChoices, setReductionChoices] = useState<string[]>([]);

  useEffect(() => {
    fetch(`/api/field-choices?token=${encodeURIComponent(token)}&fieldId=fldSi9R0RCfrHNDuU`)
      .then((r) => r.json())
      .then((j) => { if (j.choices) setReductionChoices(j.choices); })
      .catch(() => {});
  }, [token]);

  // Friday ("ו") slots differ from Sun–Thu ("א-ה"); offer the right group per day.
  const weekdaySlots = slots.filter((s) => s.weekday !== 'friday');
  const fridaySlots = slots.filter((s) => s.weekday === 'friday');

  useEffect(() => {
    const params = new URLSearchParams({ token, symbolId: role.symbolId, roleId: role.roleId });
    fetch(`/api/schedule/bell?${params.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.slots) setSlots(j.slots);
        else setLoadErr('לא נטענו רצועות לוח צלצולים');
      })
      .catch(() => setLoadErr('שגיאה בטעינת לוח הצלצולים'));
  }, [token, role.symbolId, role.roleId]);

  // When slots are loaded and data.week was pre-populated (e.g. from prior year),
  // reconstruct picks by matching each shift's in/out to an available slot.
  useEffect(() => {
    if (slots.length === 0) return;
    const hasWeek = DAYS.some((d) => (data.week[d]?.length ?? 0) > 0);
    if (!hasWeek) return;
    const alreadyPicked = DAYS.some((d) => picks[d].length > 0);
    if (alreadyPicked) return;

    const newPicks = {} as Record<Day, (BellSlot | null)[]>;
    for (const day of DAYS) {
      const dayShifts = data.week[day] ?? [];
      const isFri = day === 'fri';
      const pool = isFri ? slots.filter((s) => s.weekday === 'friday') : slots.filter((s) => s.weekday !== 'friday');
      newPicks[day] = dayShifts.map((shift) => {
        return pool.find((s) => s.in === shift.in && s.out === shift.out) ?? null;
      });
    }
    setPicks(newPicks);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots]);

  const weeklyHours = DAYS.reduce(
    (acc, d) => acc + picks[d].reduce((s, p) => s + (p?.dailyHours ?? 0), 0),
    0,
  );

  function pickSlot(day: Day, idx: number, slot: BellSlot) {
    setOfek(null); // picks changed → previous check no longer valid
    setPicks((prev) => {
      const arr = [...prev[day]];
      arr[idx] = slot;
      return { ...prev, [day]: arr };
    });
    setData((prev) => {
      const w = { ...(prev.week as Record<Day, Shift[]>) };
      const shifts = [...(w[day] ?? [])];
      shifts[idx] = { in: slot.in, out: slot.out };
      w[day] = shifts;
      return { ...prev, week: w };
    });
  }

  function clearSlot(day: Day, idx: number) {
    setOfek(null); // picks changed → previous check no longer valid
    setPicks((prev) => {
      const arr = prev[day].filter((_, i) => i !== idx);
      return { ...prev, [day]: arr };
    });
    setData((prev) => {
      const w = { ...(prev.week as Record<Day, Shift[]>) };
      w[day] = (w[day] ?? []).filter((_, i) => i !== idx);
      return { ...prev, week: w };
    });
  }

  // snappedHours = weeklyHours מעוגל לשלם/חצי בטווח ±0.3 (מה שנשלח לאופק)
  const snappedHours = weeklyHours > 0 ? (snapToHalf(weeklyHours, 0.3) ?? null) : null;
  const snapDiff = snappedHours !== null ? snappedHours - weeklyHours : null;

  // When the bell-selected hours change, invalidate all ofek results.
  useEffect(() => {
    if (hoursAtOfek1 === null) return;
    const checked = snappedHours ?? 0;
    if (Math.abs(checked - hoursAtOfek1) > 0.001) {
      setOfek1(null);
      setHoursAtOfek1(null);
      setExisting(null);
      setOfek(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snappedHours]);

  function getBellHours(): number | null {
    if (weeklyHours <= 0) return null;
    return snappedHours;
  }

  function bellPreCheck(): string[] {
    const errs: string[] = [];
    if (weeklyHours <= 0) errs.push('יש לבחור לפחות רצועה אחת');
    if (weeklyHours > WEEKLY_CAP_HOURS) errs.push('מערכת שעות לעובד מוגבלת לפי חוק ל-42 שעות שבועיות');
    if (weeklyHours > 0 && snappedHours === null) errs.push(NON_INTEGER_HOURS_ERROR);
    return errs;
  }

  /** Bell step 1 — current role only. */
  async function runOfek1() {
    setErrors([]); setWarnings([]);
    const preErrs = bellPreCheck();
    if (preErrs.length) { setErrors(preErrs); return; }
    const hours = getBellHours()!;
    setOfek1(null); setHoursAtOfek1(null); setExisting(null); setOfek(null);
    setComputing(true);
    try {
      const j = await computeOfek(token, employee, role, hours, true, positionId);
      if (!j.ok) { setOfek1({ ...j, ok: false }); setErrors([j.message || 'לא נמצאה התאמה במחשבון אופק חדש']); return; }
      setOfek1(j);
      setHoursAtOfek1(hours);
    } finally { setComputing(false); }
  }

  /** Bell step 2 — check existing positions. */
  async function runCheck2() {
    setErrors([]); setExisting(null); setOfek(null);
    setComputing(true);
    try {
      const params = new URLSearchParams({ token, tz: employee.tz, category: role.category, layer: role.layer });
      if (positionId) params.set('excludePositionId', positionId);
      const res = await fetch(`/api/schedule/existing-positions?${params}`);
      const j = await res.json();
      if (!j.ok) { setErrors(['שגיאה בבדיקת תפקידים נוספים']); return; }
      setExisting({ count: j.count, frontalHours: j.frontalHours, individualHours: j.individualHours, stayHours: j.stayHours });
    } finally { setComputing(false); }
  }

  /** Bell step 3 — combined check. */
  async function runOfek3() {
    setErrors([]); setWarnings([]);
    const preErrs = bellPreCheck();
    if (preErrs.length) { setErrors(preErrs); return; }
    const hours = getBellHours()!;
    setOfek(null);
    setComputing(true);
    try {
      const j = await computeOfek(token, employee, role, hours, false, positionId);
      if (!j.ok) { setOfek({ ...j, ok: false }); setErrors([j.message || 'לא נמצאה התאמה במחשבון אופק חדש']); return; }
      setOfek(j);
      const warns: string[] = [];
      if (j.reducedVsLastYear && !data.reductionReason)
        warns.push('מספר השעות שהוזן קטן ממספר השעות בשנה הקודמת — יש לבחור סיבה להמשך.');
      setWarnings(warns);
    } finally { setComputing(false); }
  }

  async function validateAndNext() {
    const preErrs = bellPreCheck();
    if (preErrs.length) { setErrors(preErrs); return; }
    if (!ofek1?.ok || existing === null) {
      setErrors(['יש לבצע את הבדיקות לפני המשך']);
      return;
    }
    if (existing.count > 0 && !ofek?.ok) {
      setErrors(['יש לבצע את בדיקה 3 לפני המשך']);
      return;
    }
    const j = (existing.count > 0 ? ofek : ofek1)!;
    // Collect all blocking alerts together.
    const errs: string[] = [];
    if (j.overBudget) errs.push(overBudgetMessage(j.finalHours, role.remainingHours));
    if (j.reducedVsLastYear && !data.reductionReason) {
      errs.push('מספר השעות שהוזן קטן ממספר השעות בשנה הקודמת — יש לבחור סיבה להמשך.');
    }
    if (errs.length) {
      setErrors(errs);
      return;
    }
    onNext({
      ...data,
      weeklyHours: j.finalHours,
      frontalHours: j.frontalHours,
      individualHours: j.individualHours,
      stayHoursInstitution: j.stayHoursInstitution,
      stayHoursHome: j.stayHoursHome,
      severeDisabilityBonus: j.bonus,
      jobPercent: j.jobPercent,
      motherPosition: j.motherPosition,
      ofekRecordId: j.ofekRecordId,
      ofekAllRolesRecordId: j.ofekAllRolesRecordId,
    });
  }

  const overCap = weeklyHours > WEEKLY_CAP_HOURS;

  return (
    <>
    {prevYear && <PrevYearSummary prevYear={prevYear} />}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
      {/* Summary panel */}
      <aside className="lg:col-span-4 lg:order-2 order-1">
        <div className="bg-white p-6 rounded-xl shadow-card border border-outline-variant sticky top-24">
          <h3 className="text-headline-md text-primary font-bold mb-6">סיכום שבועי</h3>
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-on-surface-variant text-body-md">שעות שבועיות</span>
            <span className={`text-display-lg-mobile font-bold ${overCap ? 'text-error' : 'text-primary'}`}>
              {weeklyHours.toFixed(2)}
            </span>
          </div>
          <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden mb-3">
            <div
              className={`h-full ${overCap ? 'bg-error' : 'bg-primary'}`}
              style={{ width: `${Math.min(100, (weeklyHours / WEEKLY_CAP_HOURS) * 100)}%` }}
            />
          </div>
          <p className="text-label-sm text-on-surface-variant flex items-center gap-1">
            <Icon name="info" className="text-[16px]" /> סכום שעות יומיות מהרצועות שנבחרו
          </p>

          {/* עיגול לאופק — מוצג רק כשיש הפרש */}
          {snappedHours !== null && (
            <div className="mt-3 rounded-lg bg-surface-container-low p-3 space-y-1 text-label-sm">
              <div className="flex justify-between text-on-surface-variant">
                <span>שעות בפועל:</span>
                <span className="font-bold">{weeklyHours.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>שעות לבדיקה באופק:</span>
                <span className="font-bold text-primary">{snappedHours.toFixed(2)}</span>
              </div>
              {snapDiff !== null && Math.abs(snapDiff) > 0.001 && (
                <div className="flex justify-between text-on-surface-variant">
                  <span>הפרש:</span>
                  <span className={`font-bold ${snapDiff > 0 ? 'text-[#1a6b2f]' : 'text-error'}`}>
                    {snapDiff > 0 ? '+' : ''}{snapDiff.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 text-label-lg flex justify-between">
            <span className="text-on-surface-variant">יתרת תקציב:</span>
            <span className="font-bold text-primary">{role.remainingHours} שעות</span>
          </div>

          {ofek?.ok && <OfekBreakdown ofek={ofek} />}
        </div>
      </aside>

      {/* Days grid */}
      <div className="lg:col-span-8 lg:order-1 order-2 space-y-4">
        {loadErr && (
          <div className="p-3 rounded-lg bg-error-container text-on-error-container text-body-md flex items-center gap-2">
            <Icon name="error" /> {loadErr}
          </div>
        )}

        {DAYS.map((day) => {
          const daySlots = day === 'fri' ? fridaySlots : weekdaySlots;
          const dayPicks = picks[day];
          const dayHours = dayPicks.reduce((s, p) => s + (p?.dailyHours ?? 0), 0);
          return (
            <div
              key={day}
              className="bg-white p-6 rounded-lg shadow-card border border-transparent hover:border-outline-variant"
            >
              <div className="flex items-start gap-6 flex-wrap">
                <div className="w-16 mt-2 flex flex-col items-start gap-1">
                  <span className="font-bold text-primary">{DAY_LABELS[day]}</span>
                  {dayHours > 0 && (
                    <span className="text-label-sm font-bold text-[#003466] bg-[#89f5e7] px-2 py-0.5 rounded-md">
                      {dayHours.toFixed(2)} שע׳
                    </span>
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-3">
                  {dayPicks.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="flex-1">
                        <BellSlotPicker
                          slots={daySlots}
                          value={p?.id ?? null}
                          onPick={(slot) => pickSlot(day, idx, slot)}
                          onClear={() => clearSlot(day, idx)}
                        />
                      </div>
                      <button onClick={() => clearSlot(day, idx)} aria-label="מחק רצועה">
                        <Icon name="delete" className="text-outline hover:text-error" />
                      </button>
                    </div>
                  ))}
                  {dayPicks.length < MAX_BELL_SHIFTS && (
                    <button
                      className="flex items-center gap-1 text-primary font-bold hover:underline w-fit"
                      onClick={() => setPicks((prev) => ({ ...prev, [day]: [...prev[day], null] }))}
                    >
                      <Icon name="add" className="text-[20px]" /> הוסף משמרת
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <OfekChecks
          computing={computing}
          disabled={weeklyHours <= 0}
          ofek1={ofek1}
          existing={existing}
          ofek3={ofek}
          category={role.category}
          layer={role.layer}
          onStep1={runOfek1}
          onStep2={runCheck2}
          onStep3={runOfek3}
        />

        {/* הרעת תנאים — dropdown מופיע כשהשעות קטנות מהשנה הקודמת */}
        {(() => {
          const activeOfek = (existing?.count ?? 0) > 0 ? ofek : ofek1;
          if (!activeOfek?.reducedVsLastYear) return null;
          return (
            <div className="p-4 rounded-xl bg-secondary-container/30 border border-secondary/30 space-y-3">
              <div className="flex items-start gap-2 text-on-secondary-container">
                <Icon name="warning" className="text-[20px] mt-0.5 shrink-0" />
                <div className="text-body-md">
                  <p className="font-bold">שעות קטנות מהשנה הקודמת — נדרשת סיבה</p>
                  <p className="text-label-sm mt-0.5">
                    שנה שעברה: {activeOfek.previousYear} שעות ← השנה (סה״כ): {activeOfek.totalCurrentHours} שעות
                  </p>
                </div>
              </div>
              <select
                value={data.reductionReason ?? ''}
                onChange={(e) => setData((d) => ({ ...d, reductionReason: e.target.value }))}
                className="w-full rounded-lg bg-white border border-secondary/40 py-2.5 px-3 text-body-md text-on-surface"
              >
                <option value="">— בחר סיבת הפחתה —</option>
                {reductionChoices.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          );
        })()}

        <AlertBanners errors={errors} warnings={warnings} />

        <ActionBar
          backLabel={computing ? 'מחשב…' : 'חזרה לשלב הקודם'}
          onBack={onBack}
          showBack={!!onBack}
          onEditEmployee={onEditEmployee}
          onNext={validateAndNext}
          nextDisabled={computing || !ofek1?.ok || existing === null || (existing.count > 0 && !ofek?.ok)}
        />
      </div>
    </div>
    </>
  );
}

// ── Three-step Ofek check UI ────────────────────────────────────────────────

type ExistingResult = { count: number; frontalHours: number; individualHours: number; stayHours: number };

interface OfekChecksProps {
  computing: boolean;
  disabled: boolean;
  ofek1: OfekResult | null;
  existing: ExistingResult | null;
  ofek3: OfekResult | null;
  category: string;
  layer: string;
  onStep1: () => void;
  onStep2: () => void;
  onStep3: () => void;
}

function OfekChecks({ computing, disabled, ofek1, existing, ofek3, category, layer, onStep1, onStep2, onStep3 }: OfekChecksProps) {
  const showStep2 = ofek1?.ok === true;
  const showStep3 = existing !== null && existing.count > 0;

  return (
    <div className="bg-white p-6 rounded-xl shadow-card border border-outline-variant space-y-4">
      <div className="flex items-center gap-3 pb-3 border-b border-outline-variant">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
          <Icon name="calculate" className="text-on-primary text-[22px]" />
        </div>
        <h3 className="text-headline-sm font-bold text-on-surface">מחשבון אופק חדש</h3>
      </div>

      {/* Step 1 — always visible */}
      <div className="space-y-2">
        <button
          onClick={onStep1}
          disabled={computing || disabled}
          className="w-full py-2.5 rounded-lg font-bold text-on-primary bg-primary disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          {computing && !ofek1 ? 'מחשב…' : 'חישוב מבנה שבוע עבודה'}
        </button>
        {ofek1 && (
          <>
            <div className={`flex items-center gap-2 text-label-sm px-1 ${ofek1.ok ? 'text-[#1a6b2f]' : 'text-error'}`}>
              <Icon name={ofek1.ok ? 'check_circle' : 'cancel'} className="text-[18px]" />
              {ofek1.ok ? 'תקין — נמצאה התאמה במחשבון' : 'לא נמצאה התאמה במחשבון'}
            </div>
            {ofek1.ok && (
              <div className="rounded-lg bg-surface-container-low p-3 space-y-0.5 text-label-sm">
                {ofek1.key && (
                  <p className="font-mono text-[10px] text-on-surface-variant bg-surface-container rounded px-1.5 py-0.5 mb-1 break-all">
                    🔍 {ofek1.key}
                  </p>
                )}
                <Line label="סך שעות סופי" value={ofek1.finalHours} />
                {ofek1.bonus > 0 && <Line label="תוספת לקות קשה" value={ofek1.bonus} />}
                <Line label="פרונטלי" value={ofek1.frontalHours} />
                <Line label="פרטני" value={ofek1.individualHours} />
                <Line label="שהייה מהמוסד" value={ofek1.stayHoursInstitution} />
                <Line label="שהייה מהבית" value={ofek1.stayHoursHome} />
                <Line label="אחוז משרה" value={`${Math.round(ofek1.jobPercent)}%`} />
                <Line label="משרת אם" value={ofek1.motherPosition ? 'כן' : 'לא'} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Step 2 — appears after step 1 succeeds */}
      {showStep2 && (
        <div className="space-y-2">
          <button
            onClick={onStep2}
            disabled={computing}
            className="w-full py-2.5 rounded-lg font-bold bg-secondary-container text-on-secondary-container disabled:opacity-40 hover:bg-secondary-container/80 transition-colors"
          >
            {computing && existing === null ? 'מחשב…' : `איתור תפקידים נוספים לעובד בקטגוריה ${category} בשכבת ${layer}`}
          </button>
          {existing !== null && (
            existing.count === 0
              ? (
                <div className="flex items-center gap-2 text-label-sm px-1 text-[#1a6b2f]">
                  <Icon name="check_circle" className="text-[18px]" />
                  אין תפקידים נוספים באותה שכבה וקטגוריה
                </div>
              )
              : (
                <div className="rounded-lg border border-secondary bg-secondary-container/30 p-3 space-y-1 text-label-sm">
                  <p className="font-bold text-on-secondary-container flex items-center gap-1">
                    <Icon name="group" className="text-[16px]" />
                    נמצאו {existing.count} תפקידים נוספים
                  </p>
                  <div className="space-y-0.5 text-on-surface-variant">
                    <Line label="פרונטלי" value={existing.frontalHours} />
                    <Line label="פרטני" value={existing.individualHours} />
                    <Line label="שהייה" value={existing.stayHours} />
                  </div>
                </div>
              )
          )}
        </div>
      )}

      {/* Step 3 — appears only when there are additional roles */}
      {showStep3 && (
        <div className="space-y-2">
          <button
            onClick={onStep3}
            disabled={computing}
            className="w-full py-2.5 rounded-lg font-bold bg-tertiary-container text-on-tertiary-container disabled:opacity-40 hover:bg-tertiary-container/80 transition-colors"
          >
            {computing && !ofek3 ? 'מחשב…' : 'חישוב מבנה שבוע עבודה לכל התפקידים'}
          </button>
          {ofek3 && (
            <>
              <div className={`flex items-center gap-2 text-label-sm px-1 ${ofek3.ok ? 'text-[#1a6b2f]' : 'text-error'}`}>
                <Icon name={ofek3.ok ? 'check_circle' : 'cancel'} className="text-[18px]" />
                {ofek3.ok ? 'תקין — בדיקה משולבת עברה בהצלחה' : 'לא נמצאה התאמה בבדיקה המשולבת'}
              </div>
              {!ofek3.ok && ofek3.effectiveKey && (
                <p className="font-mono text-[10px] text-on-surface-variant bg-surface-container rounded px-1.5 py-0.5 break-all">
                  🔍 {ofek3.effectiveKey}
                </p>
              )}
              {ofek3.ok && (
                <div className="space-y-2 text-label-sm">
                  <div className="rounded-lg bg-surface-container-low p-3 space-y-0.5">
                    <p className="font-bold text-on-surface mb-1">תוצאות מחשבון אופק שכר</p>
                    {ofek3.effectiveKey && (
                      <p className="font-mono text-[10px] text-on-surface-variant bg-surface-container rounded px-1.5 py-0.5 mb-1 break-all">
                        🔍 {ofek3.effectiveKey}
                      </p>
                    )}
                    {ofek3.ofekRow ? (
                      <>
                        <Line label="סה״כ שעות" value={ofek3.ofekRow.totalHours} />
                        <Line label="פרונטלי" value={ofek3.ofekRow.frontalHours} />
                        <Line label="פרטני" value={ofek3.ofekRow.individualHours} />
                        <Line label="שהייה" value={ofek3.ofekRow.stayHours} />
                        <Line label="אחוז משרה" value={`${Math.round(ofek3.ofekRow.jobPercent)}%`} />
                      </>
                    ) : (
                      <>
                        <Line label="סה״כ שעות" value={ofek3.finalHours} />
                        <Line label="פרונטלי" value={ofek3.frontalHours} />
                        <Line label="פרטני" value={ofek3.individualHours} />
                        <Line label="שהייה מהמוסד" value={ofek3.stayHoursInstitution} />
                        <Line label="שהייה מהבית" value={ofek3.stayHoursHome} />
                        <Line label="אחוז משרה" value={`${Math.round(ofek3.jobPercent)}%`} />
                      </>
                    )}
                  </div>
                  <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-0.5">
                    <p className="font-bold text-primary mb-1">שעות לניצול — תפקיד נוכחי</p>
                    <Line label="סה״כ שעות" value={ofek3.finalHours} />
                    {ofek3.bonus > 0 && <Line label="תוספת לקות קשה" value={ofek3.bonus} />}
                    <Line label="פרונטלי" value={ofek3.frontalHours} />
                    <Line label="פרטני" value={ofek3.individualHours} />
                    <Line label="שהייה מהמוסד" value={ofek3.stayHoursInstitution} />
                    <Line label="שהייה מהבית" value={ofek3.stayHoursHome} />
                    <Line label="משרת אם" value={ofek3.motherPosition ? 'כן' : 'לא'} />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Ofek-חדש results breakdown for the side panel (step 3 result). */
function OfekBreakdown({ ofek }: { ofek: OfekResult }) {
  if (!ofek.ok) return null;
  return (
    <div className="mt-4 pt-4 border-t border-outline-variant space-y-3 text-label-sm">
      {ofek.ofekRow && (
        <div className="space-y-0.5">
          <p className="font-bold text-on-surface mb-1">מחשבון אופק שכר</p>
          <Line label="סה״כ שעות" value={ofek.ofekRow.totalHours} />
          <Line label="פרונטלי" value={ofek.ofekRow.frontalHours} />
          <Line label="פרטני" value={ofek.ofekRow.individualHours} />
          <Line label="שהייה" value={ofek.ofekRow.stayHours} />
          <Line label="אחוז משרה" value={`${Math.round(ofek.ofekRow.jobPercent)}%`} />
        </div>
      )}
      <div className="space-y-0.5">
        <p className="font-bold text-primary mb-1">שעות לניצול — תפקיד נוכחי</p>
        <Line label="סה״כ שעות" value={ofek.finalHours} />
        {ofek.bonus > 0 && <Line label="תוספת לקות קשה" value={ofek.bonus} />}
        <Line label="פרונטלי" value={ofek.frontalHours} />
        <Line label="פרטני" value={ofek.individualHours} />
        <Line label="שהייה מהמוסד" value={ofek.stayHoursInstitution} />
        <Line label="שהייה מהבית" value={ofek.stayHoursHome} />
        <Line label="משרת אם" value={ofek.motherPosition ? 'כן' : 'לא'} />
      </div>
    </div>
  );
}

// ── Utilities ────────────────────────────────────────────────────────────────

function Line({ label, value }: { label: string; value: string | number }) {
  const display = typeof value === 'number' ? value.toFixed(2) : value;
  return (
    <div className="flex justify-between text-on-surface-variant">
      <span>{label}:</span>
      <span className="font-bold text-primary">{display}</span>
    </div>
  );
}

/** Parse a free-text time entry into "HH:MM" or return null if unrecognisable.
 *  Accepts: "8", "08", "8:00", "08:00", "800", "0800", "8.00", "8,00" */
function parseTimeInput(raw: string): string | null {
  const s = raw.trim().replace(/[.,]/g, ':');
  if (!s) return null;

  // Already "H:MM" or "HH:MM"
  const colon = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (colon) {
    const h = Number(colon[1]), m = Number(colon[2]);
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  // Bare digits: "8" → 08:00, "12" → 12:00, "800" → 08:00, "1230" → 12:30
  const digits = /^(\d{1,4})$/.exec(s);
  if (digits) {
    const n = digits[1];
    let h: number, m: number;
    if (n.length <= 2) { h = Number(n); m = 0; }
    else if (n.length === 3) { h = Number(n[0]); m = Number(n.slice(1)); }
    else { h = Number(n.slice(0, 2)); m = Number(n.slice(2)); }
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return null;
}

function TimeBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [raw, setRaw] = useState(value);
  const [invalid, setInvalid] = useState(false);

  // Keep local raw text in sync when parent resets the value (e.g. shift deleted)
  useEffect(() => { setRaw(value); }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setRaw(e.target.value);
    setInvalid(false);
  }

  function handleBlur() {
    if (!raw.trim()) {
      onChange('');
      setInvalid(false);
      return;
    }
    const parsed = parseTimeInput(raw);
    if (parsed) {
      setRaw(parsed);
      setInvalid(false);
      onChange(parsed);
    } else {
      setInvalid(true);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold text-on-surface-variant">{label}</label>
      <input
        type="text"
        inputMode="numeric"
        placeholder="HH:MM"
        value={raw}
        onChange={handleChange}
        onBlur={handleBlur}
        className={`rounded-lg py-2 px-3 text-body-md w-28 text-center ${
          invalid ? 'bg-error-container border border-error' : 'bg-surface-container-low'
        }`}
      />
      {invalid && <span className="text-[10px] text-error">פורמט שגוי</span>}
    </div>
  );
}
