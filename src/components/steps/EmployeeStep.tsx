'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ActionBar } from '@/components/shell/ActionBar';
import {
  EmployeeData,
  emptyEmployee,
  isDocVisible,
  isUnder16,
  isYouthHoursAge,
  MaritalStatus,
  YesNo,
  YouthDocs,
  type Gender,
} from '@/lib/formTypes';
import { isValidIsraeliId } from '@/lib/validation/israeliId';
import { DOC_FIELDS } from '@/lib/airtable/schema';
import { DocUpload } from '@/components/steps/DocUpload';

interface SearchResult {
  id: string;
  name: string;
  maskedTz: string;
}

const MARITAL_OPTIONS: MaritalStatus[] = ['רווק/ה', 'נשוי/ה', 'גרוש/ה', 'אלמן/ה'];

export function EmployeeStep({
  token,
  initial,
  institutionLayer,
  docs,
  onDocsChange,
  mode = 'new',
  highlightMissing = false,
  onNext,
  onBack,
}: {
  token: string;
  initial?: EmployeeData;
  /** שכבת המוסד (גנים/יסודי/חטיבה) — drives the violence-cert document. */
  institutionLayer?: string;
  docs: YouthDocs;
  onDocsChange: (docs: YouthDocs) => void;
  mode?: 'new' | 'edit';
  /** from-prev-year flow: highlight the fields תשפ"ו couldn't supply (חוזה, ילדים). */
  highlightMissing?: boolean;
  onNext: (data: EmployeeData) => void;
  onBack?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingEmployee, setLoadingEmployee] = useState(false);
  const [showNewForm, setShowNewForm] = useState(() => Boolean(initial && !initial.recordId));
  const [data, setData] = useState<EmployeeData>(initial ?? emptyEmployee());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dupNotice, setDupNotice] = useState('');
  // Existing employees show read-only by default; editing opens on click / edit icon.
  const [editing, setEditing] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (query.replace(/\D/g, '').length < 7) {
      setResults([]);
      return;
    }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/employees/search?q=${encodeURIComponent(query)}&token=${encodeURIComponent(token)}`,
        );
        const json = await res.json();
        setResults(json.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [query, token]);

  /** Load full details for a selected employee. Shown read-only by default. */
  async function loadAndSelect(recordId: string, fallbackName: string) {
    setData((d) => ({ ...emptyEmployee(), contractStartDate: d.contractStartDate, recordId, name: fallbackName }));
    setErrors({});
    setEditing(false);
    setLoadingEmployee(true);
    try {
      const res = await fetch(`/api/employees/${recordId}?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      if (json.employee) {
        const e = json.employee;
        const gender = (e.gender as Gender) || '';
        setData((d) => ({
          ...d,
          recordId,
          name: e.name ?? fallbackName,
          tz: e.tz ?? '',
          address: e.address ?? '',
          email: e.email ?? '',
          gender,
          maritalStatus: (e.maritalStatus as EmployeeData['maritalStatus']) || '',
          birthDate: e.birthDate ?? '',
          ageHours: Number(e.ageHours) || 0,
          fatherPosition: Boolean(e.fatherPosition),
        }));
        // Gender is a new field — open edit mode automatically if it's missing.
        if (!gender) setEditing(true);
      }
    } catch {
      /* keep minimal data on failure */
    } finally {
      setLoadingEmployee(false);
    }
  }

  function pickExisting(r: SearchResult) {
    setQuery('');
    setResults([]);
    void loadAndSelect(r.id, r.name);
  }

  /**
   * Block creating a duplicate: if the entered ת.ז. already exists, auto-select that
   * employee instead of creating a new one. Returns true if a duplicate was found & selected.
   */
  async function checkDuplicate(tz: string): Promise<boolean> {
    if (!isValidIsraeliId(tz)) return false;
    try {
      const res = await fetch(
        `/api/employees/check-id?tz=${encodeURIComponent(tz)}&token=${encodeURIComponent(token)}`,
      );
      const json = await res.json();
      if (json.exists && json.employee) {
        // Auto-select the existing employee, load full details, and close the new-employee form.
        setDupNotice(`עובד עם ת.ז. זו כבר קיים במערכת (${json.employee.name}) ונבחר אוטומטית. ניתן לערוך את פרטיו.`);
        setShowNewForm(false);
        await loadAndSelect(json.employee.id, json.employee.name);
        return true;
      }
    } catch {
      /* ignore — fall through to normal validation */
    }
    return false;
  }

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function set<K extends keyof EmployeeData>(key: K, value: EmployeeData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  async function finishEditing() {
    if (!data.recordId) { setEditing(false); return; }
    if (!data.gender) {
      setErrors((e) => ({ ...e, gender: 'שדה חובה' }));
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/employees/${data.recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, employee: data }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setSaveError(json.message || 'שגיאה בשמירת הפרטים');
        return;
      }
    } catch {
      setSaveError('שגיאת רשת — הפרטים לא נשמרו');
      return;
    } finally {
      setSaving(false);
    }
    setEditing(false);
  }

  async function validateAndNext() {
    // For a new employee, block duplicates first — if the ID exists, auto-select instead.
    if (!data.recordId && isValidIsraeliId(data.tz)) {
      const dup = await checkDuplicate(data.tz);
      if (dup) return; // existing employee selected; secretary continues from the notice
    }

    const e: Record<string, string> = {};
    // Validate employee fields whenever the detail form is shown (new OR editable existing).
    if (showNewForm || selectedExisting) {
      if (!data.name.trim()) e.name = 'שדה חובה';
      if (!isValidIsraeliId(data.tz)) e.tz = 'ת.ז. לא תקינה';
      if (!data.address.trim()) e.address = 'שדה חובה';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) e.email = 'מייל לא תקין';
      if (!data.gender) e.gender = 'שדה חובה';
      if (!data.maritalStatus) e.maritalStatus = 'שדה חובה';
      if (!data.birthDate) e.birthDate = 'שדה חובה';
    }
    // ילדים מתחת 14 — when shown (non-single woman), a choice is mandatory to
    // prevent continuing past an unnoticed default.
    if (showChildrenField && !data.childrenUnder14) e.childrenUnder14 = 'יש לבחור כן/לא';
    if (!data.contractStartDate) e.contractStartDate = 'שדה חובה';
    // Every document that is shown is mandatory.
    for (const doc of visibleDocs) {
      if (!docs[doc.key]) e[`doc_${doc.key}`] = 'יש לצרף קובץ';
    }
    // Minor → must acknowledge the youth-employment rules before continuing.
    if (showYouthRules && !data.youthRulesAcknowledged) {
      e.youthRulesAcknowledged = 'יש לאשר שקראת את הוראות העסקת הנוער';
    }
    setErrors(e);
    if (Object.keys(e).length === 0) onNext(data);
  }

  const selectedExisting = Boolean(data.recordId);
  // ילדים מתחת לגיל 14 is only relevant for a woman who is not single.
  const showChildrenField = data.gender === 'נקבה' && Boolean(data.maritalStatus) && !data.maritalStatus.includes('רווק');

  // Documents applicable right now: youth (age 15–17) + male + גנים (institution layer).
  const visibleDocs = DOC_FIELDS.filter((doc) =>
    isDocVisible(doc.condition, {
      birthDate: data.birthDate,
      gender: data.gender,
      layer: institutionLayer,
    }),
  );

  // Youth-employment warnings (by age) + a mandatory acknowledgement checkbox.
  const under16 = isUnder16(data.birthDate);
  const youthHoursAge = isYouthHoursAge(data.birthDate); // 16 or 17
  const showYouthRules = under16 || youthHoursAge; // any minor → show rules + checkbox

  // Drop any previously-attached doc whose condition no longer holds
  // (e.g. gender switched, or birth date edited out of the youth range).
  useEffect(() => {
    const visibleKeys = new Set(visibleDocs.map((d) => d.key));
    const stale = DOC_FIELDS.filter((d) => !visibleKeys.has(d.key) && docs[d.key]);
    if (stale.length > 0) {
      const next = { ...docs };
      stale.forEach((d) => delete next[d.key]);
      onDocsChange(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.birthDate, data.gender, institutionLayer, docs]);

  // Sync childrenUnder14 when visibility changes:
  // hidden → force "לא" so it doesn't submit a stale value.
  // shown → clear to '' so the user must actively choose.
  useEffect(() => {
    if (!showChildrenField) {
      setData((d) => (d.childrenUnder14 !== 'לא' ? { ...d, childrenUnder14: 'לא' } : d));
    } else {
      setData((d) => ({ ...d, childrenUnder14: '' }));
    }
  }, [showChildrenField]);

  // Reset the youth-rules acknowledgement if the employee is no longer a minor.
  useEffect(() => {
    if (!showYouthRules && data.youthRulesAcknowledged) {
      setData((d) => ({ ...d, youthRulesAcknowledged: false }));
    }
  }, [showYouthRules, data.youthRulesAcknowledged]);

  const isEditMode = mode === 'edit';

  return (
    <>
      {/* Search — hidden in edit mode and once an employee is selected */}
      {!isEditMode && !selectedExisting && (
      <div className="relative w-full md:w-1/2 lg:w-1/3 mb-6">
        <Icon
          name="search"
          className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
        />
        <input
          className="w-full pr-12 pl-4 py-3 bg-white border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all text-body-md outline-none shadow-card"
          placeholder="חיפוש לפי ת.ז...."
          inputMode="numeric"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setData((d) => ({ ...d, recordId: null }));
          }}
        />
      </div>
      )}

      {/* Results */}
      {!isEditMode && !selectedExisting && (results.length > 0 || searching) && (
        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-outline-variant overflow-hidden mb-6">
          <div className="grid grid-cols-3 gap-4 p-4 border-b border-outline-variant bg-surface-container-low text-label-lg font-bold text-on-surface-variant">
            <div>שם העובד</div>
            <div>מספר תעודת זהות</div>
            <div className="text-left">פעולה</div>
          </div>
          <div className="divide-y divide-outline-variant">
            {searching && <div className="p-4 text-on-surface-variant text-body-md">מחפש…</div>}
            {results.map((r) => (
              <div
                key={r.id}
                className={`grid grid-cols-3 gap-4 p-4 items-center text-body-md transition-colors ${
                  data.recordId === r.id ? 'selected-row' : 'hover:bg-secondary-container/20'
                }`}
              >
                <div className="font-medium text-primary">{r.name}</div>
                <div className="text-on-surface-variant">ת.ז. {r.maskedTz}</div>
                <div className="text-left">
                  <button className="text-primary font-bold hover:underline" onClick={() => pickExisting(r)}>
                    בחר
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* From-prev-year: prompt to complete the fields that couldn't be loaded from תשפ"ו. */}
      {highlightMissing && (
        <div className="mb-6 p-4 rounded-xl border border-tertiary/40 bg-tertiary-container/30 flex items-start gap-3">
          <Icon name="info" className="text-tertiary mt-0.5 shrink-0" fill />
          <p className="text-body-md text-on-surface">
            התקן נטען מהשנה הקודמת (תשפ&quot;ו). <strong>השלימי את השדות המסומנים</strong> —
            תאריך תחילת חוזה{showChildrenField ? ', ילדים מתחת לגיל 14' : ''} ומסמכים נדרשים (אם יש) —
            הם אינם נטענים מהשנה הקודמת.
          </p>
        </div>
      )}

      {/* Duplicate auto-select notice */}
      {dupNotice && (
        <div className="mb-6 p-3 rounded-lg bg-secondary-container/40 text-on-secondary-container text-body-md flex items-center gap-2">
          <Icon name="info" /> {dupNotice}
        </div>
      )}

      {/* Add new toggle — hidden in edit mode */}
      {!isEditMode && !selectedExisting && (
        <button
          className="w-full py-3 px-4 border-2 border-dashed border-outline-variant rounded-xl flex items-center justify-center gap-2 text-on-surface-variant hover:border-primary hover:text-primary transition-all mb-6"
          onClick={() => setShowNewForm((v) => !v)}
        >
          <Icon name="add_circle" className="text-xl" />
          <span className="text-body-lg font-medium">הוספת עובד חדש</span>
        </button>
      )}

      {/* Missing gender banner — shown when an existing employee has no gender on record. */}
      {selectedExisting && !data.gender && !loadingEmployee && (
        <div className="mb-4 p-4 rounded-xl border border-tertiary/40 bg-tertiary-container/30 flex items-start gap-3">
          <Icon name="warning" className="text-tertiary mt-0.5 shrink-0" />
          <p className="text-body-md text-on-surface">
            שדה <strong>מין</strong> לא מולא עבור עובד זה. יש לעדכן לפני המשך.
            המידע יישמר אוטומטית לרשימת העובדים.
          </p>
        </div>
      )}

      {/* Employee detail — read-only by default for existing; editable for new or on "edit". */}
      {(showNewForm || selectedExisting) && (
        <section className="bg-surface-container-lowest p-6 rounded-xl shadow-card border border-outline-variant mb-6">
          <div className="flex justify-between items-center mb-5 border-b border-outline-variant pb-3">
            <h3 className="text-headline-md text-primary">
              {selectedExisting ? 'פרטי העובד' : 'פרטי עובד חדש'}
            </h3>
            <div className="flex items-center gap-4">
              {selectedExisting && !editing && (
                <button
                  className="text-primary text-label-lg hover:underline flex items-center gap-1"
                  onClick={() => setEditing(true)}
                >
                  <Icon name="edit" className="text-[18px]" /> עריכה
                </button>
              )}
              {selectedExisting && !isEditMode && (
                <button
                  className="text-on-surface-variant text-label-lg hover:underline"
                  onClick={() => {
                    setData((d) => ({ ...emptyEmployee(), contractStartDate: d.contractStartDate }));
                    setDupNotice('');
                    setErrors({});
                    setEditing(false);
                  }}
                >
                  בחירת עובד אחר
                </button>
              )}
            </div>
          </div>

          {/* Same layout always; fields are locked unless editing (new employee = always editable). */}
          {(() => {
            const locked = selectedExisting && !editing;
            return (
              <div
                className={`grid grid-cols-1 md:grid-cols-3 gap-x-gutter gap-y-5 ${
                  locked ? 'cursor-pointer' : ''
                }`}
                onClick={locked ? () => setEditing(true) : undefined}
                title={locked ? 'לחצו לעריכה' : undefined}
              >
                <Field label="שם מלא" error={errors.name} locked={locked}>
                  <Input value={data.name} onChange={(v) => set('name', v)} placeholder="הכנס שם מלא" disabled={locked} />
                </Field>
                <Field label="ת.ז." error={errors.tz} locked={locked}>
                  <Input
                    value={data.tz}
                    onChange={(v) => {
                      set('tz', v);
                      if (dupNotice) setDupNotice('');
                    }}
                    onBlur={() => {
                      if (!selectedExisting) checkDuplicate(data.tz);
                    }}
                    placeholder="9 ספרות"
                    disabled={locked}
                  />
                </Field>
                <Field label="מייל" error={errors.email} locked={locked}>
                  <Input
                    value={data.email}
                    onChange={(v) => set('email', v)}
                    placeholder="example@mail.com"
                    type="email"
                    disabled={locked}
                  />
                </Field>
                <Field label="כתובת" error={errors.address} locked={locked}>
                  <Input value={data.address} onChange={(v) => set('address', v)} placeholder="רחוב, עיר, מיקוד" disabled={locked} />
                </Field>
                <Field label="מין" error={errors.gender} locked={locked}>
                  <Toggle
                    options={['זכר', 'נקבה']}
                    value={data.gender}
                    onChange={(v) => {
                      set('gender', v as Gender);
                      if (errors.gender) setErrors((e) => { const n = { ...e }; delete n.gender; return n; });
                    }}
                    disabled={locked}
                  />
                </Field>
                <Field label="מצב משפחתי" error={errors.maritalStatus} locked={locked}>
                  {locked ? (
                    <span className="text-body-md font-bold text-on-background block py-3">
                      {data.maritalStatus || '—'}
                    </span>
                  ) : (
                    <select
                      className="w-full bg-surface-container-low border-transparent rounded-lg py-3 px-3 focus:bg-white focus:border-primary focus:ring-0 text-body-md"
                      value={data.maritalStatus}
                      onChange={(e) => set('maritalStatus', e.target.value as MaritalStatus)}
                    >
                      <option value="">בחר מצב משפחתי</option>
                      {MARITAL_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="תאריך לידה" error={errors.birthDate} locked={locked}>
                  <Input value={data.birthDate} onChange={(v) => set('birthDate', v)} type="date" disabled={locked} />
                </Field>
                {selectedExisting && editing && (
                  <div className="flex items-end flex-col gap-1">
                    <button
                      className="text-primary font-bold hover:underline flex items-center gap-1 disabled:opacity-50"
                      onClick={finishEditing}
                      disabled={saving}
                    >
                      <Icon name="check" className="text-[18px]" />
                      {saving ? 'שומר…' : 'סיום עריכה'}
                    </button>
                    {saveError && <span className="text-error text-label-sm">{saveError}</span>}
                  </div>
                )}
              </div>
            );
          })()}
        </section>
      )}

      {/* Contract-level fields — belong to the תקן (re-asked each year), not the employee. */}
      {(selectedExisting || showNewForm) && (
        <section
          className={`bg-surface-container-lowest p-8 rounded-xl shadow-card mb-6 ${
            highlightMissing ? 'border-2 border-tertiary ring-2 ring-tertiary/20' : 'border border-outline-variant'
          }`}
        >
          {highlightMissing && (
            <p className="text-label-lg font-bold text-tertiary mb-4 flex items-center gap-1">
              <Icon name="edit_note" className="text-[20px]" /> שדות להשלמה
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-gutter gap-y-6">
            <Field label="תאריך תחילת חוזה" error={errors.contractStartDate}>
              <Input
                value={data.contractStartDate}
                onChange={(v) => set('contractStartDate', v)}
                type="date"
              />
            </Field>
            {/* ילדים מתחת לגיל 14 — shown only for a non-single woman; starts unset so a
                choice must be made explicitly. (Everyone else defaults to "לא" off-screen.) */}
            {showChildrenField && (
              <Field label="ילדים מתחת לגיל 14" error={errors.childrenUnder14}>
                <Toggle
                  options={['כן', 'לא']}
                  value={data.childrenUnder14}
                  onChange={(v) => set('childrenUnder14', v as YesNo)}
                />
              </Field>
            )}
          </div>
        </section>
      )}

      {/* Youth-employment warnings + mandatory acknowledgement (any minor employee). */}
      {(selectedExisting || showNewForm) && showYouthRules && (
        <section className="bg-surface-container-lowest p-8 rounded-xl shadow-card border border-outline-variant mb-6">
          <div className="flex items-center gap-2 mb-4 border-b border-outline-variant pb-3">
            <Icon name="gavel" className="text-primary" />
            <h3 className="text-headline-md text-primary">הוראות העסקת נוער</h3>
          </div>

          {under16 && (
            <div className="mb-4 p-4 rounded-lg bg-error-container text-on-error-container">
              <div className="flex items-start gap-2">
                <Icon name="warning" className="mt-0.5" />
                <p className="text-body-md leading-relaxed">
                  חל איסור חוקי להעסקת נוער מתחת גיל 16 במהלך שנת הלימודים.
                  <br />
                  גיל ההעסקה הנמוך המותר להעסקה הינו 14, אך רק בחופשת לימודים רשמית (של משרד החינוך).
                </p>
              </div>
            </div>
          )}

          {youthHoursAge && (
            <div className="mb-4 p-4 rounded-lg bg-secondary-container/40 text-on-secondary-container">
              <div className="flex items-start gap-2">
                <Icon name="schedule" className="mt-0.5" />
                <p className="text-body-md leading-relaxed">
                  <span className="font-bold">חוק העסקת נוער:</span>
                  <br />
                  העסקת נוער מותרת עד 9 שעות ביום ועד 40 שעות בשבוע,
                  <br />
                  לא לפני השעה 8:00 בבוקר ולא אחרי השעה 20:00.
                </p>
              </div>
            </div>
          )}

          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-1 w-5 h-5 accent-primary"
              checked={data.youthRulesAcknowledged}
              onChange={(e) => {
                set('youthRulesAcknowledged', e.target.checked);
                if (e.target.checked && errors.youthRulesAcknowledged) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.youthRulesAcknowledged;
                    return next;
                  });
                }
              }}
            />
            <span className="text-body-md text-on-surface">
              קראתי הוראות העסקת נוער ונפעל בהתאם <span className="text-error">*</span>
            </span>
          </label>
          {errors.youthRulesAcknowledged && (
            <p className="text-error text-label-sm mt-1">{errors.youthRulesAcknowledged}</p>
          )}
        </section>
      )}

      {/* Documents — shown only when applicable (age 15–17 / male / גנים). All mandatory. */}
      {(selectedExisting || showNewForm) && visibleDocs.length > 0 && (
        <section className="bg-surface-container-lowest p-8 rounded-xl shadow-card border border-outline-variant mb-6">
          <div className="flex items-center gap-2 mb-1 border-b border-outline-variant pb-3">
            <Icon name="folder" className="text-primary" />
            <h3 className="text-headline-md text-primary">מסמכים נדרשים</h3>
          </div>
          <p className="text-body-md text-on-surface-variant mb-5">
            יש לצרף את המסמכים הבאים (PDF או תמונה, עד 5MB לקובץ).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-gutter gap-y-5">
            {visibleDocs.map((doc) => (
              <DocUpload
                key={doc.key}
                label={doc.label}
                required
                value={docs[doc.key]}
                error={errors[`doc_${doc.key}`]}
                onChange={(uploaded) => {
                  onDocsChange({ ...docs, [doc.key]: uploaded });
                  // Clear the "missing file" error as soon as a file is attached.
                  if (uploaded && errors[`doc_${doc.key}`]) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next[`doc_${doc.key}`];
                      return next;
                    });
                  }
                }}
              />
            ))}
          </div>
        </section>
      )}

      <ActionBar
        title={isEditMode ? 'עדכון פרטי עובד' : 'השלמת פרטי העובד'}
        subtitle={isEditMode ? 'לחצו "הבא" לחזרה לעריכת התפקיד.' : 'לאחר המעבר לשלב הבא, תבחרו את התפקיד עבור העובד.'}
        showBack={Boolean(onBack)}
        onBack={onBack}
        nextDisabled={!selectedExisting && !showNewForm}
        onNext={validateAndNext}
      />
    </>
  );
}

function Field({
  label,
  error,
  locked = false,
  children,
}: {
  label: string;
  error?: string;
  locked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className={`${locked ? 'text-label-sm text-on-surface-variant' : 'text-label-lg text-on-surface'}`}>
        {label} {!locked && <span className="text-error">*</span>}
      </label>
      {children}
      {error && <span className="text-error text-label-sm">{error}</span>}
    </div>
  );
}

function Input({
  value,
  onChange,
  onBlur,
  placeholder,
  type = 'text',
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className="w-full bg-surface-container-low border-transparent rounded-lg py-3 px-3 focus:bg-white focus:border-primary focus:ring-0 text-body-md disabled:bg-transparent disabled:text-on-background disabled:font-bold disabled:px-0 disabled:cursor-default"
    />
  );
}

function Toggle({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  if (disabled) {
    // Read-only: show only the selected value styled like a value, not a toggle.
    return <span className="text-body-md font-bold text-on-background block py-3">{value || '—'}</span>;
  }
  return (
    <div className="flex bg-surface-container-low p-1 rounded-lg">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`flex-1 py-2 rounded-md font-medium text-center transition-all ${
            value === opt ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-outline-variant/20'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
