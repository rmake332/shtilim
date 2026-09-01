'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ActionBar } from '@/components/shell/ActionBar';
import {
  ageFromBirthDate,
  EmployeeData,
  emptyEmployee,
  isDocVisible,
  isMinor,
  isUnder16,
  isUnderEmploymentAge,
  MARITAL_STATUS_FALLBACK,
  joinFullName,
  showChildrenUnder14Question,
  splitFullName,
  YesNo,
  YouthDocs,
  type Gender,
  type UploadedDoc,
} from '@/lib/formTypes';
import { isValidIsraeliId } from '@/lib/validation/israeliId';
import { isValidForeignId } from '@/lib/validation/foreignId';
import { isPlaceholderId } from '@/lib/validation/placeholderId';
import { isValidIsraeliPhone } from '@/lib/validation/phone';
import { DOC_FIELDS, EMPLOYEE_FIELDS, TABLES } from '@/lib/airtable/schema';
import { uploadEmployeeDocs } from '@/lib/uploadDocs';
import { DocUpload } from '@/components/steps/DocUpload';

interface SearchResult {
  id: string;
  name: string;
  maskedTz: string;
}

const UNDER_AGE_MESSAGE = 'חל איסור חוקי להעסקת נוער תחת גיל 14.';

/**
 * הודעת השגיאה לשדה ת.ז. ממלא מקום (000000000 וכדומה) מקבל הודעה נפרדת, כי "ת.ז. לא
 * תקינה" סתמי לא היה עונה על מה שהמזכירה בעצם ניסתה לומר - "אני לא יודעת את המספר".
 */
function tzErrorMessage(data: EmployeeData): string {
  if (isPlaceholderId(data.tz)) {
    return data.noIsraeliId
      ? 'מספר זה אינו מספר זיהוי תקין - יש להזין מספר דרכון/זיהוי אמיתי.'
      : 'מספר זה אינו ת.ז. תקינה. אם המספר אינו ידוע לא ניתן לקלוט את העובד; לעובד/ת ללא ת.ז. ישראלית יש לסמן את התיבה שמתחת ולהזין מספר דרכון.';
  }
  return data.noIsraeliId ? 'מספר זיהוי לא תקין' : 'ת.ז. לא תקינה';
}

export function EmployeeStep({
  token,
  initial,
  institutionLayer,
  institutionRequireViolenceCert,
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
  /** חריג ידני מהמוסד: מציג את מסמך אישור-העדר אלימות גם כשהשכבה אינה גנים. */
  institutionRequireViolenceCert?: boolean;
  docs: YouthDocs;
  /** Dispatch של ה-Wizard: מקבל גם updater, כדי שהעלאה אסינכרונית לא תדרוס צירוף מקביל. */
  onDocsChange: React.Dispatch<React.SetStateAction<YouthDocs>>;
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
    setData((d) => ({
      ...emptyEmployee(),
      contractStartDate: d.contractStartDate,
      recordId,
      name: fallbackName,
      ...splitFullName(fallbackName),
    }));
    setErrors({});
    setEditing(false);
    setLoadingEmployee(true);
    try {
      const res = await fetch(`/api/employees/${recordId}?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      if (json.employee) {
        const e = json.employee;
        const gender = (e.gender as Gender) || '';
        const loaded = {
          recordId,
          name: (e.name ?? fallbackName) as string,
          ...splitFullName((e.name ?? fallbackName) as string),
          tz: (e.tz ?? '') as string,
          // אין שדה מאוחסן לכך - נגזר מחדש מפורמט ה-tz בכל טעינה.
          noIsraeliId: !isValidIsraeliId(e.tz ?? ''),
          address: (e.address ?? '') as string,
          email: (e.email ?? '') as string,
          phone: (e.phone ?? '') as string,
          gender,
          maritalStatus: ((e.maritalStatus as EmployeeData['maritalStatus']) || '') as EmployeeData['maritalStatus'],
          birthDate: (e.birthDate ?? '') as string,
          ageHours: Number(e.ageHours) || 0,
          fatherPosition: Boolean(e.fatherPosition),
          twelveHourEmployment: Boolean(e.twelveHourEmployment),
          existingSubRoleDocs: (e.existingSubRoleDocs ?? []) as string[],
          existingLicenseNumber: (e.licenseNumber ?? '') as string,
          existingYouthDocs: (e.existingYouthDocs ?? []) as string[],
        };
        setData((d) => ({ ...d, ...loaded }));
        // מה שנטען מהשרת הוא בהגדרה מה ששמור - כדי שהחיווי לא יסמן עובד קיים כ"לא נשמר".
        setSavedSnapshot(personalSnapshot({ ...emptyEmployee(), ...loaded }));
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
    const tzOk = data.noIsraeliId ? isValidForeignId(tz) : isValidIsraeliId(tz);
    if (!tzOk) return false;
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

  /**
   * ערכי "מצב משפחתי" נמשכים חי מרשימת הבחירה של השדה באיירטייבל, כמו תת-תפקיד
   * וסיבת עדכון. הרשימה הקשיחה שהייתה כאן החזיקה 4 ערכים שמתוכם 2 כלל לא היו קיימים
   * בשדה (`גרוש/ה`, `אלמן/ה`) - ומכיוון שכל כתיבה היא עם typecast, בחירתם הייתה
   * יוצרת אופציות חדשות בשדה בשקט. בנוסף, יותר ממחצית העובדים מחזיקים צורות ממוגדרות
   * היסטוריות (נשואה/נשוי/גרושה) שה-select לא ידע להציג.
   */
  const [maritalChoices, setMaritalChoices] = useState<string[]>([]);
  useEffect(() => {
    fetch(
      `/api/field-choices?token=${encodeURIComponent(token)}` +
        `&fieldId=${EMPLOYEE_FIELDS.maritalStatus}&tableId=${TABLES.employees}`,
    )
      .then((r) => r.json())
      .then((j) => setMaritalChoices(Array.isArray(j.choices) ? j.choices : []))
      .catch(() => setMaritalChoices([]));
  }, [token]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  /** מעבר לשלב הבא בעיצומו: שמירת העובד + העלאת המסמכים. */
  const [advancing, setAdvancing] = useState(false);
  const [uploadNote, setUploadNote] = useState('');

  function set<K extends keyof EmployeeData>(key: K, value: EmployeeData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  /**
   * שם משפחה/שם פרטי מוזנים בנפרד, אבל באיירטייבל יש שדה שם אחד. כל שינוי בשדות
   * מרכיב מחדש את `name`, שנשאר מקור האמת היחיד לכל מה שמציג או שומר שם.
   */
  function setNamePart(key: 'lastName' | 'firstName', value: string) {
    setData((d) => {
      const next = { ...d, [key]: value };
      return { ...next, name: joinFullName(next.lastName, next.firstName) };
    });
  }

  /**
   * 'duplicate' - הת.ז. הובילה לרשומה קיימת אחרת; הטופס כבר נטען מחדש עליה ויש לעצור.
   * 'error' - השמירה נכשלה; ההודעה כבר מוצגת ויש לעצור, אבל ניסיון חוזר מותר.
   */
  type PersistOutcome =
    | { kind: 'saved'; employee: EmployeeData }
    | { kind: 'duplicate' }
    | { kind: 'error' };

  async function postEmployee(current: EmployeeData): Promise<PersistOutcome> {
    setSaveError('');
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, employee: current }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok || !json.employeeId) {
        setSaveError(json.message || 'שגיאה בשמירת פרטי העובד');
        return { kind: 'error' };
      }
      // מקרה נדיר: בדיקת הכפילות בצד הלקוח לא מצאה, השרת כן. מציגים ועוצרים כדי
      // שהמזכירה תראה לאיזו רשומה קיימת הפרטים מוזגו, במקום לצרף תקן בלי לדעת.
      // matchedByTz ולא created===false: עדכון של הרשומה שכבר שייכת לטופס הוא תקין.
      if (json.matchedByTz) {
        setDupNotice(
          `עובד עם ת.ז. זו כבר קיים במערכת${json.matchedName ? ` (${json.matchedName})` : ''} - הפרטים עודכנו ברשומה הקיימת.`,
        );
        setShowNewForm(false);
        await loadAndSelect(json.employeeId, current.name);
        return { kind: 'duplicate' };
      }
      const saved: EmployeeData = {
        ...current,
        recordId: json.employeeId,
        newlyCreated: current.newlyCreated || json.created === true,
      };
      setData((d) => ({ ...d, recordId: saved.recordId, newlyCreated: saved.newlyCreated }));
      return { kind: 'saved', employee: saved };
    } catch {
      setSaveError('שגיאת רשת - פרטי העובד לא נשמרו');
      return { kind: 'error' };
    }
  }

  /**
   * כתיבת פרטי העובד ל"רשימת עובדים". יוצרת רשומה כשעדיין אין, ומעדכנת כשכבר יש -
   * ולכן בטוח לקרוא לה שוב ושוב לאותו עובד.
   *
   * נקראת בשני מצבים: אוטומטית ברגע שפרטי העובד תקינים (ראו האפקט למטה), ושוב
   * בלחיצת "המשך" כדי לשמור עריכות שנעשו אחרי היצירה האוטומטית.
   *
   * כתיבה אחת בכל רגע: לחיצה על "המשך" בזמן שהיצירה האוטומטית עוד רצה הייתה שולחת
   * שתי בקשות עם recordId ריק, ושתיהן היו יוצרות רשומה. לכן ממתינים לקודמת ומאמצים
   * את ה-recordId שלה לפני הכתיבה הבאה.
   */
  const persistInFlight = useRef<Promise<PersistOutcome> | null>(null);
  async function persistEmployee(current: EmployeeData): Promise<PersistOutcome> {
    const prior = persistInFlight.current;
    if (prior) {
      const done = await prior.catch((): PersistOutcome => ({ kind: 'error' }));
      if (done.kind === 'duplicate') return done;
      if (done.kind === 'saved' && !current.recordId) {
        current = { ...current, recordId: done.employee.recordId, newlyCreated: done.employee.newlyCreated };
      }
    }
    const run = postEmployee(current);
    persistInFlight.current = run;
    try {
      return await run;
    } finally {
      if (persistInFlight.current === run) persistInFlight.current = null;
    }
  }

  /**
   * טביעת האצבע של השדות שנשמרים לרשומת העובד. משמשת להבחנה בין "נשמר" לבין "נשמר
   * ומאז נערך", כדי שהחיווי לא יבטיח שמירה של ערכים שעדיין לא נכתבו.
   */
  function personalSnapshot(e: EmployeeData): string {
    return JSON.stringify([
      e.lastName.trim(), e.firstName.trim(), e.tz.trim(), e.address.trim(), e.email.trim(), e.phone.trim(),
      e.gender, e.maritalStatus, e.birthDate,
    ]);
  }
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(() =>
    initial?.recordId ? personalSnapshot(initial) : null,
  );

  /**
   * שמירה מפורשת של פרטי העובד ל"רשימת עובדים", מכפתור "שמירת פרטי העובד".
   *
   * זהו השער לשאר השלב: כל עוד אין רשומה אי אפשר להעלות מסמכים (אין למה לצרף אותם)
   * ואי אפשר להמשיך לשלב הבא. כך הפרטים נשמרים לפני שהמזכירה יוצאת לחפש אישור חסר,
   * במקום להיתקע מאחורי חובת המסמכים.
   */
  async function saveEmployeeNow() {
    setAdvancing(true);
    try {
      const outcome = await persistEmployee(data);
      if (outcome.kind !== 'saved') return;
      setSavedSnapshot(personalSnapshot(outcome.employee));
      // בדרך כלל אין מה להעלות (המסמכים נעולים עד השמירה), אבל אם נשארו כאלה מניסיון
      // קודם שנכשל - זו ההזדמנות שלהם.
      await uploadPendingDocs(outcome.employee.recordId!, outcome.employee);
    } finally {
      setAdvancing(false);
    }
  }

  /**
   * צירוף מסמך: נכנס ל-docs מיד (כדי שייראה מצורף), ואם רשומת העובד כבר קיימת הוא
   * גם נשלח לאיירטייבל באותו רגע. בהצלחה הוא עובר מ-docs ל-existingYouthDocs ומוצג
   * כ"קיים בתיק העובד". בכישלון הוא נשאר ב-docs, ויעלה בלחיצת "המשך" או בשליחה.
   */
  async function attachDoc(doc: (typeof DOC_FIELDS)[number], uploaded: UploadedDoc | undefined) {
    onDocsChange({ ...docs, [doc.key]: uploaded });
    if (uploaded && errors[`doc_${doc.key}`]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`doc_${doc.key}`];
        return next;
      });
    }
    if (!uploaded || !data.recordId) return;

    const shortLabel = doc.label.split('\n')[0];
    setUploadNote(`שומר ${shortLabel}...`);
    const { uploadedFieldIds } = await uploadEmployeeDocs({
      token,
      employeeId: data.recordId,
      items: [{ docsKey: doc.key, fieldId: doc.fieldId, label: doc.label, file: uploaded }],
    });
    setUploadNote('');
    if (uploadedFieldIds.length === 0) return;

    // updater ולא אובייקט מוכן: ייתכן שצורף בינתיים מסמך נוסף, ואסור לדרוס אותו.
    onDocsChange((prev) => {
      const next = { ...prev };
      delete next[doc.key];
      return next;
    });
    setData((d) => ({
      ...d,
      existingYouthDocs: [...new Set([...(d.existingYouthDocs ?? []), doc.fieldId])],
    }));
  }

  /**
   * העלאת המסמכים שצורפו בשלב זה לרשומת העובד מיד, ולא רק בשליחת הטופס - מאותו טעם
   * שבגללו פרטי העובד נשמרים כאן: מה שכבר הוזן לא הולך לאיבוד אם התהליך ננטש.
   *
   * קובץ שהועלה מוסר מ-docs ונרשם ב-existingYouthDocs, כך שהוא מוצג כ"קיים בתיק
   * העובד", אינו נדרש שוב, ובעיקר - אינו מועלה פעם שנייה בשליחה (שדה הקובץ מוסיף
   * קבצים ולא דורס). כישלון אינו חוסם: הקובץ נשאר ב-docs ו-SummaryStep ינסה שוב.
   */
  async function uploadPendingDocs(employeeId: string, base: EmployeeData): Promise<EmployeeData> {
    const items = pendingDocs
      .filter((doc) => docs[doc.key])
      .map((doc) => ({ docsKey: doc.key, fieldId: doc.fieldId, label: doc.label, file: docs[doc.key]! }));
    if (items.length === 0) return base;

    setUploadNote(`מעלה מסמכים... (1/${items.length})`);
    const { uploadedKeys, uploadedFieldIds } = await uploadEmployeeDocs(
      { token, employeeId, items },
      (done, total) => setUploadNote(`מעלה מסמכים... (${done}/${total})`),
    );
    setUploadNote('');
    if (uploadedKeys.length === 0) return base;

    onDocsChange((prev) => {
      const nextDocs = { ...prev };
      uploadedKeys.forEach((k) => delete nextDocs[k]);
      return nextDocs;
    });
    const next: EmployeeData = {
      ...base,
      existingYouthDocs: [...new Set([...(base.existingYouthDocs ?? []), ...uploadedFieldIds])],
    };
    setData(next);
    return next;
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
    const tzOk = data.noIsraeliId ? isValidForeignId(data.tz) : isValidIsraeliId(data.tz);
    // For a new employee, block duplicates first — if the ID exists, auto-select instead.
    if (!data.recordId && tzOk) {
      const dup = await checkDuplicate(data.tz);
      if (dup) return; // existing employee selected; secretary continues from the notice
    }

    const e: Record<string, string> = {};
    // Validate employee fields whenever the detail form is shown (new OR editable existing).
    if (showNewForm || selectedExisting) {
      if (!data.lastName.trim()) e.lastName = 'שדה חובה';
      if (!data.firstName.trim()) e.firstName = 'שדה חובה';
      if (!tzOk) e.tz = tzErrorMessage(data);
      if (!data.address.trim()) e.address = 'שדה חובה';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) e.email = 'מייל לא תקין';
      if (!data.phone.trim()) e.phone = 'שדה חובה';
      else if (!isValidIsraeliPhone(data.phone)) e.phone = 'מספר טלפון לא תקין';
      if (!data.gender) e.gender = 'שדה חובה';
      if (!data.maritalStatus) e.maritalStatus = 'שדה חובה';
      if (!data.birthDate) e.birthDate = 'שדה חובה';
    }
    // ילדים מתחת 14 — when shown (non-single woman), a choice is mandatory to
    // prevent continuing past an unnoticed default.
    if (showChildrenField && !data.childrenUnder14) e.childrenUnder14 = 'יש לבחור כן/לא';
    if (!data.contractStartDate) e.contractStartDate = 'שדה חובה';
    // Every document that is shown (and not already on file) is mandatory.
    for (const doc of pendingDocs) {
      if (!docs[doc.key]) e[`doc_${doc.key}`] = 'יש לצרף קובץ';
    }
    // Minor → must acknowledge the youth-employment rules before continuing.
    if (showYouthRules && !data.youthRulesAcknowledged) {
      e.youthRulesAcknowledged = 'יש לאשר שקראת את הוראות העסקת הנוער';
    }
    // Under 14 → hard stop, whatever else is filled in.
    if (underEmploymentAge) e.birthDate = UNDER_AGE_MESSAGE;
    setErrors(e);
    // An existing employee shows read-only; if a profile field is invalid (e.g. a
    // missing phone), open edit mode so the secretary can actually fix it.
    const profileKeys = ['lastName', 'firstName', 'tz', 'address', 'email', 'phone', 'gender', 'maritalStatus', 'birthDate'];
    if (selectedExisting && !editing && profileKeys.some((k) => e[k])) {
      setEditing(true);
    }
    if (Object.keys(e).length !== 0) return;

    setAdvancing(true);
    try {
      // תמיד upsert: יוצר את הרשומה אם היצירה האוטומטית עוד לא הספיקה לרוץ, ומעדכן
      // אותה אם היא כבר קיימת (גם עריכות שנעשו אחרי היצירה האוטומטית נשמרות כך).
      const outcome = await persistEmployee(data);
      if (outcome.kind !== 'saved') return;
      // מה שנותר ב-docs: מסמך שצורף לפני שהרשומה נוצרה, או כזה שהעלאתו נכשלה.
      const ready = await uploadPendingDocs(outcome.employee.recordId!, outcome.employee);
      onNext(ready);
    } finally {
      setAdvancing(false);
    }
  }

  const selectedExisting = Boolean(data.recordId);
  /**
   * עובד *שנבחר* מהחיפוש או נטען מראש - מוצג לקריאה בלבד עד לחיצה על "עריכה".
   * עובד שנוצר עכשיו מתוך טופס "עובד חדש" מחזיק אף הוא recordId (הרשומה נשמרת מיד),
   * אבל הטופס שלו חייב להישאר פתוח לעריכה - אחרת השדות היו ננעלים תוך כדי ההקלדה.
   */
  const pickedExisting = selectedExisting && !data.newlyCreated;
  // ילדים מתחת לגיל 14 is only relevant for a woman who is not single.
  const showChildrenField = showChildrenUnder14Question(data);

  // Documents applicable right now: youth (age 15-17) + male + גנים (institution layer),
  // excluding מעון for the docs flagged menoExcluded and minors for those flagged adultOnly.
  const visibleDocs = DOC_FIELDS.filter((doc) =>
    isDocVisible(
      doc.condition,
      {
        birthDate: data.birthDate,
        gender: data.gender,
        layer: institutionLayer,
        requireViolenceCert: institutionRequireViolenceCert,
      },
      doc,
    ),
  );
  // Docs already on file for this employee (from a previous position/year) aren't
  // re-requested — same pattern as SUB_ROLE_DOC_FIELDS in RoleStep.
  const existingYouthDocs = new Set(data.existingYouthDocs ?? []);
  const pendingDocs = visibleDocs.filter((d) => !existingYouthDocs.has(d.fieldId));
  const alreadyOnFileDocs = visibleDocs.filter((d) => existingYouthDocs.has(d.fieldId));

  // Under 14 → employment is illegal at any time; the form is a dead end here.
  const underEmploymentAge = isUnderEmploymentAge(data.birthDate);

  /**
   * פרטי העובד עצמם מלאים ותקינים - התנאי להפעלת כפתור "שמירת פרטי העובד".
   * מכוון: אינו כולל מסמכים ושאלת ילדים - אלו שדות של התהליך ולא של זהות העובד,
   * והם אלה שחסמו קודם את השמירה ולכן סיכנו את מה שכבר הוקלד.
   */
  const missingPersonalField = (() => {
    if (!data.lastName.trim()) return 'שם משפחה';
    if (!data.firstName.trim()) return 'שם פרטי';
    if (!(data.noIsraeliId ? isValidForeignId(data.tz) : isValidIsraeliId(data.tz)))
      return isPlaceholderId(data.tz) ? 'מספר זיהוי אמיתי (המספר שהוקלד אינו מזהה תקין)' : data.noIsraeliId ? 'מספר זיהוי תקין' : 'ת.ז. תקינה';
    if (!data.address.trim()) return 'כתובת';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return 'מייל תקין';
    if (!data.phone.trim() || !isValidIsraeliPhone(data.phone)) return 'טלפון תקין';
    if (!data.gender) return 'מין';
    if (!data.maritalStatus) return 'מצב משפחתי';
    if (!data.birthDate) return 'תאריך לידה';
    return '';
  })();
  const personalFieldsValid = missingPersonalField === '';
  /** העובד קיים באיירטייבל והערכים שעל המסך הם אלה שנשמרו. */
  const employeeSaved = selectedExisting && savedSnapshot === personalSnapshot(data);
  /** נשמר, ומאז נערך שדה - החיווי חייב לומר זאת ולא להבטיח שמירה שלא קרתה. */
  const employeeDirty = selectedExisting && !employeeSaved;
  /** אין רשומת עובד עדיין - אין למה לצרף מסמכים, וגם אי אפשר להמשיך לשלב הבא. */
  const docsLocked = !selectedExisting;

  /**
   * הרשימה המוצגת: הערכים מאיירטייבל (או ה-fallback אם השליפה נכשלה), ובנוסף הערך
   * השמור של העובד אם אינו ברשימה - אחרת ה-select לא היה יכול להציג אותו, והמזכירה
   * הייתה דורסת ערך תקין רק כדי "למלא" שדה שנראה לה ריק.
   */
  const maritalOptions = (() => {
    const base = maritalChoices.length > 0 ? maritalChoices : MARITAL_STATUS_FALLBACK;
    return data.maritalStatus && !base.includes(data.maritalStatus)
      ? [...base, data.maritalStatus]
      : base;
  })();

  // Youth-employment warnings (by age) + a mandatory acknowledgement checkbox.
  // The working-hours limits differ between 14–16 and 16–18.
  const under16 = isUnder16(data.birthDate);
  // Any minor → show rules + checkbox. Under 14 there is nothing to acknowledge.
  const showYouthRules = isMinor(data.birthDate) && !underEmploymentAge;

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
  }, [data.birthDate, data.gender, institutionLayer, institutionRequireViolenceCert, docs]);

  // Sync childrenUnder14 when visibility CHANGES:
  // hidden → force "לא" so it doesn't submit a stale value.
  // shown → clear to '' so the user must actively choose.
  // הרינדור הראשון מוחרג בכוונה: ערך שנטען מראש (עריכת תקן, או הוספת תפקיד לעובד
  // קיים שהתשובה שלו נלקחה מתקן אחר) הוא תשובה קיימת ואין למחוק אותה בכניסה לשלב.
  const childrenSyncMounted = useRef(false);
  useEffect(() => {
    if (!childrenSyncMounted.current) {
      childrenSyncMounted.current = true;
      // עדיין נדרש לאכוף "לא" כשהשאלה כלל אינה רלוונטית, גם בטעינה ראשונה.
      if (!showChildrenField) setData((d) => (d.childrenUnder14 !== 'לא' ? { ...d, childrenUnder14: 'לא' } : d));
      return;
    }
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
      {pickedExisting && !data.gender && !loadingEmployee && (
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
              {pickedExisting ? 'פרטי העובד' : 'פרטי עובד חדש'}
            </h3>
            <div className="flex items-center gap-4">
              {/* עובד חדש: השמירה מפורשת. עד שהיא מתבצעת אין רשומה באיירטייבל, ולכן
                  גם אי אפשר להעלות מסמכים (אין למה לצרף אותם) ולא להמשיך לשלב הבא. */}
              {!pickedExisting && !isEditMode && (
                <button
                  className="px-5 py-2 bg-primary text-on-primary text-label-lg font-bold rounded-xl flex items-center gap-2 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={saveEmployeeNow}
                  disabled={!personalFieldsValid || underEmploymentAge || advancing || employeeSaved}
                  title={
                    personalFieldsValid ? undefined : `יש להשלים: ${missingPersonalField}`
                  }
                >
                  <Icon name={employeeSaved ? 'check' : 'save'} className="text-[18px]" />
                  {advancing ? 'שומר…' : employeeSaved ? 'נשמר' : employeeDirty ? 'שמירת השינויים' : 'שמירת פרטי העובד'}
                </button>
              )}
              {pickedExisting && !editing && (
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
                    setSavedSnapshot(null);
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

          {/* חיווי מצב השמירה — רק לעובד חדש; לעובד קיים "עריכה/סיום עריכה" כבר משדר זאת. */}
          {!pickedExisting && !isEditMode && (
            <div
              className={`mb-5 -mt-2 px-3 py-2 rounded-lg text-body-md flex items-center gap-2 ${
                employeeSaved
                  ? 'bg-tertiary-container/30 text-on-surface'
                  : 'bg-secondary-container/40 text-on-secondary-container'
              }`}
            >
              <Icon
                name={employeeSaved ? 'check_circle' : 'info'}
                className={employeeSaved ? 'text-tertiary text-[18px]' : 'text-[18px]'}
                fill={employeeSaved}
              />
              {employeeSaved
                ? 'פרטי העובד נשמרו במערכת.'
                : employeeDirty
                  ? 'יש שינויים שטרם נשמרו - לחצו "שמירת השינויים".'
                  : personalFieldsValid
                    ? 'טרם נשמר - לחצו "שמירת פרטי העובד" כדי ליצור את העובד במערכת.'
                    : `טרם נשמר - יש להשלים ${missingPersonalField}.`}
            </div>
          )}

          {/* Same layout always; fields are locked unless editing (new employee = always editable). */}
          {(() => {
            const locked = pickedExisting && !editing;
            const age = ageFromBirthDate(data.birthDate);
            return (
              <div
                className={`grid grid-cols-1 md:grid-cols-3 gap-x-gutter gap-y-5 ${
                  locked ? 'cursor-pointer' : ''
                }`}
                onClick={locked ? () => setEditing(true) : undefined}
                title={locked ? 'לחצו לעריכה' : undefined}
              >
                {/* שם משפחה לפני שם פרטי - זה גם הסדר שנכתב לשדה הבודד באיירטייבל. */}
                <Field label="שם משפחה" error={errors.lastName} locked={locked}>
                  <Input value={data.lastName} onChange={(v) => setNamePart('lastName', v)} placeholder="שם משפחה" disabled={locked} />
                </Field>
                <Field label="שם פרטי" error={errors.firstName} locked={locked}>
                  <Input value={data.firstName} onChange={(v) => setNamePart('firstName', v)} placeholder="שם פרטי" disabled={locked} />
                </Field>
                <Field label="ת.ז." error={errors.tz} locked={locked}>
                  <Input
                    value={data.tz}
                    onChange={(v) => {
                      set('tz', v);
                      if (dupNotice) setDupNotice('');
                    }}
                    onBlur={() => {
                      if (!pickedExisting) checkDuplicate(data.tz);
                    }}
                    placeholder={data.noIsraeliId ? 'מספר דרכון / מספר זיהוי זר' : '9 ספרות'}
                    disabled={locked}
                  />
                  <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary"
                      checked={data.noIsraeliId}
                      disabled={locked}
                      onChange={(e) => set('noIsraeliId', e.target.checked)}
                    />
                    <span className="text-body-sm text-on-surface-variant">
                      עובד/ת ללא תעודת זהות ישראלית
                    </span>
                  </label>
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
                <Field label="טלפון" error={errors.phone} locked={locked}>
                  <Input
                    value={data.phone}
                    onChange={(v) => set('phone', v)}
                    placeholder="05X-XXXXXXX"
                    type="tel"
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
                      onChange={(e) => set('maritalStatus', e.target.value)}
                    >
                      <option value="">בחר מצב משפחתי</option>
                      {maritalOptions.map((m) => (
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
                {/* Derived from תאריך לידה — display only, never edited or saved. */}
                <Field label="גיל" locked={locked} required={false}>
                  <span
                    className={`text-body-md font-bold block py-3 ${
                      underEmploymentAge ? 'text-error' : 'text-on-background'
                    }`}
                  >
                    {age !== null ? age : '—'}
                  </span>
                </Field>
                {pickedExisting && editing && (
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

      {/* Under 14 → hard block; the form cannot continue. */}
      {(selectedExisting || showNewForm) && underEmploymentAge && (
        <section className="bg-error-container text-on-error-container p-6 rounded-xl shadow-card mb-6">
          <div className="flex items-start gap-3">
            <Icon name="block" className="mt-0.5" />
            <div>
              <p className="text-body-md font-bold leading-relaxed">{UNDER_AGE_MESSAGE}</p>
              <p className="text-body-md leading-relaxed mt-1">
                לא ניתן להמשיך בטופס. יש לוודא שתאריך הלידה הוזן נכון.
              </p>
            </div>
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

          <div className="mb-4 p-4 rounded-lg bg-secondary-container/40 text-on-secondary-container">
            <div className="flex items-start gap-2">
              <Icon name="schedule" className="mt-0.5" />
              <p className="text-body-md leading-relaxed">
                <span className="font-bold">חוק העסקת נוער:</span>
                <br />
                {under16 ? (
                  <>
                    העסקת נוער מותרת עד 8 שעות ביום ועד 40 שעות בשבוע,
                    <br />
                    לא לפני השעה 8:00 בבוקר ולא אחרי השעה 20:00.
                  </>
                ) : (
                  <>
                    העסקת נוער מותרת עד 9 שעות ביום ועד 40 שעות בשבוע,
                    <br />
                    לא לפני השעה 6:00 בבוקר ולא אחרי השעה 22:00.
                  </>
                )}
              </p>
            </div>
          </div>

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

      {/* Documents — shown only when applicable (age 15–17 / male / גנים). All mandatory,
          except docs already on file for this employee (filed on רשימת עובדים). */}
      {(selectedExisting || showNewForm) && visibleDocs.length > 0 && (
        <section className="bg-surface-container-lowest p-8 rounded-xl shadow-card border border-outline-variant mb-6">
          <div className="flex items-center gap-2 mb-1 border-b border-outline-variant pb-3">
            <Icon name="folder" className="text-primary" />
            <h3 className="text-headline-md text-primary">מסמכים נדרשים</h3>
          </div>
          <p className="text-body-md text-on-surface-variant mb-5">
            יש לצרף את המסמכים הבאים (PDF או תמונה, עד 5MB לקובץ).
          </p>
          {/* אין רשומת עובד - אין למה לצרף את הקבצים, וההעלאה נעולה עד השמירה. */}
          {docsLocked && (
            <div className="mb-5 p-3 rounded-lg bg-secondary-container/40 text-on-secondary-container text-body-md flex items-center gap-2">
              <Icon name="lock" />
              יש לשמור תחילה את פרטי העובד. לאחר השמירה כל מסמך שיצורף יישמר מיד.
            </div>
          )}
          {alreadyOnFileDocs.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-5">
              {alreadyOnFileDocs.map((d) => (
                <span
                  key={d.key}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-tertiary-container/30 text-on-surface text-label-sm"
                >
                  <Icon name="check_circle" className="text-tertiary text-[16px]" fill />
                  {d.label} — קיים בתיק העובד
                </span>
              ))}
            </div>
          )}
          {pendingDocs.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-gutter gap-y-5">
              {pendingDocs.map((doc) => (
                <DocUpload
                  key={doc.key}
                  label={doc.label}
                  required
                  value={docs[doc.key]}
                  error={errors[`doc_${doc.key}`]}
                  disabled={docsLocked}
                  onChange={(uploaded) => void attachDoc(doc, uploaded)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* כשל בשמירת עובד חדש לאיירטייבל — נשארים בשלב, הפרטים שהוקלדו לא אבדו. */}
      {saveError && (
        <div className="mt-6 p-3 rounded-lg bg-error-container/40 text-error text-body-md flex items-center gap-2">
          <Icon name="error" /> {saveError}
        </div>
      )}
      {uploadNote && (
        <div className="mt-6 p-3 rounded-lg bg-secondary-container/40 text-on-secondary-container text-body-md flex items-center gap-2">
          <Icon name="cloud_upload" /> {uploadNote}
        </div>
      )}

      <ActionBar
        title={isEditMode ? 'עדכון פרטי עובד' : 'השלמת פרטי העובד'}
        subtitle={isEditMode ? 'לחצו "הבא" לחזרה לעריכת התפקיד.' : 'לאחר המעבר לשלב הבא, תבחרו את התפקיד עבור העובד.'}
        showBack={Boolean(onBack)}
        onBack={onBack}
        nextLabel={uploadNote ? 'מעלה מסמכים…' : advancing ? 'שומר…' : undefined}
        // בלי רשומת עובד אין להמשיך: שלב התפקיד מניח שהעובד כבר קיים במערכת, וזה גם
        // מה שמכריח את השמירה המפורשת לפני שממשיכים.
        nextDisabled={!selectedExisting || underEmploymentAge || advancing}
        onNext={validateAndNext}
      />
    </>
  );
}

function Field({
  label,
  error,
  locked = false,
  required = true,
  children,
}: {
  label: string;
  error?: string;
  locked?: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className={`${locked ? 'text-label-sm text-on-surface-variant' : 'text-label-lg text-on-surface'}`}>
        {label} {!locked && required && <span className="text-error">*</span>}
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
