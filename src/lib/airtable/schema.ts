/**
 * Airtable table & field IDs for base תשפ"ז (appKlvldLrk14ird8).
 * Single source of truth — derived from the field mapping in the plan.
 */

export const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appKlvldLrk14ird8';

export const TABLES = {
  mosadot: 'tblQExDYGObeQBbMn', // מוסדות
  employees: 'tbl2jY3mzY279TsxU', // רשימת עובדים
  activePositions: 'tbl6nWUseVBUIylhV', // תקנים פעילים (main write target)
  prevYearPositions: 'tblRy4vCSm7ePybx8', // תקנים תשפו (read-only, prior year)
  budget: 'tblOL1fYEC9ZMOBE5', // תקציב התחלתי
  ofekCalc: 'tbluSqfzeX9Ns452y', // מחשבון אופק חדש
  hoursSummary: 'tblSXESwLy4tedbJR', // סיכום שעות לעובד
  bellSchedule: 'tblmglINeMA2YItox', // לוח צלצולים
  institutionSymbols: 'tbl4BCMW4gwsIPxG7', // סמלי מוסד
} as const;

/** מוסדות fields (institution lookup by token) */
export const MOSAD_FIELDS = {
  name: 'fldnfaoPngf5e0yfq', // שם המוסד (primary)
  responsible: 'fld73bMG96uk1a3Ac', // אחראי
  association: 'flddUGSUzZMDKmzXu', // עמותה
  layer: 'fldzGg1JddI1bJwH3', // שכבה (singleSelect) — fallback when budget row has no layer
  formToken: 'fldn1VdIkJLl2GPWD', // form_token
  formActive: 'fldZUUcUCKPYAXiZK', // form_active
  payrollEmail: 'fldSSieNcnGfsePGa', // מייל חשבת שכר
} as const;

/** רשימת עובדים fields */
export const EMPLOYEE_FIELDS = {
  name: 'fldM8uUGnWA0Q1EvT',
  tz: 'fldnr6x7loWne3CJI',
  address: 'fld1GcJ85ecEm8e1J',
  maritalStatus: 'fld67gJC3ofqb4s8w',
  email: 'fldn6lV7OKDMPjaZS',
  birthDate: 'fldNraALYMHCAT9O3',
  gender: 'fldp7dNkDDKMMT1Ub',
  ageHours: 'fldaw1LMV6s18X91k', // formula
  institution: 'fld5nl16DpoM7Xn1h',
  fatherPosition: 'fldmjgP5oDc49Gmz1', // משרת אב (checkbox) — adds 2h to entered hours
} as const;

/** תקנים פעילים fields */
export const POSITION_FIELDS = {
  employeeLink: 'fldFEk0sjsaDy0c9B', // → רשימת עובדים
  employeeNameLink: 'fld8M1JMXkaKHqkmU', // linkedRecord → employee IDs (not names)
  employeeNameText: 'fldTu3q08qnIksiKD', // lookup text → שם העובד (singleLineText lookup)
  roleTitleText: 'fldj0mMBrS5n5QxlL',   // lookup text → שם התפקיד
  mosadNameText: 'fldFdcjyhrWoo6Pg9',   // multipleLookupValues → שם מוסד (for filtering)
  category: 'fldh649jMlkn1ipqR', // קטגוריה (lookup)
  tzLookup: 'fldkPFYk5eyckkMf3', // ת.ז. (lookup)
  roleLink: 'fldelhbayZ5YBxIqw', // → תקציב התחלתי
  symbolLink: 'fldEVBPoFW1nUcMJh', // → סמל מוסד
  contractStartDate: 'fld1MIv38C6TWkceL',
  childrenUnder14: 'fld4tBs8ZD7meiFG6', // singleSelect כן/לא
  layer: 'fldcbVOaF1RXu7Lrb', // שכבה (manual fallback)
  subRole: 'fldNEsEr5LCQujJmN', // תת תפקיד (פרא)
  weeklyHours: 'fldd2cW5PIKabwmMv', // שעות שבועיות
  totalUtilizedHours: 'fldOijiio8e3LTzr3', // סה"כ שעות לניצול מהתקציב
  motherPosition: 'fldD59TOuspojEHZV', // משרת אם (singleLineText — "כן"/"לא")
  frontalHours: 'fldgQIUbAElaz4gJq',
  individualHours: 'fldwrhgjVw4V2ASZQ',
  stayHours: 'fldHR94deU1X2VFfk',
  stayHoursHome: 'fld27zVS3ioNFB2rt',
  stayHoursHomeParaGanim: 'fldApdvCGgifPFtCB', // ⚠️ split logic TBD
  severeDisabilityBonus: 'fldNzajQ3q86v8EdO',
  bonusesLink: 'fldn7UQ5iYjIncFm5', // גמולים
  rolesLink: 'fldfpRG4wd19TUs72', // תפקידים
  worksElsewherePara: 'fldrNbCFqLAvKObNi',
  ofekCalcLink: 'fldCcPkWY39eiwSIW',
  ofekCalcAllRolesLink: 'fldh6fLOpOI2zqb7t',
  prevYearStatus: 'fldUZsgL5PJqQFWfb', // תקן שנה קודמת (כן/לא) — "כן" = תפקיד שנה קודמת, לא נספר כתפקיד נוסף
  updateStatus: 'fld1iUv3ge1zGuSVB', // → "ממתין לעדכון"
  employeeStatus: 'fld6bWDfusUy8d7oY',
  submittedAt: 'fldLlJ96ZBwOWZACL',
  conditionsWorseningReason: 'fldSi9R0RCfrHNDuU', // סיבת הרעת תנאים
  systemUpdateDate: 'fldgoevjfnIveWkp4', // תאריך עדכון מערכת (date) — edit mode
  updateReason: 'fldbAkB0EJBSnbyg6', // סיבת עדכון (singleSelect) — edit mode
  hasMinistryFile: 'fld4RpO0teYLfUQ8C', // קיים תיק במשרד החינוך (כן/לא)
  // Youth-employee document attachments (multipleAttachments) — uploaded post-create.
  docEducationalInstitution: 'fldKu5XvvJNEd1vDV', // אישור ממוסד לימודי - נוער
  docMedical: 'fldHVsFFxOfkDYO4H', // אישור רפואי- נוער
  docNoViolence: 'fld3LLyKU8wcbQXdk', // אישור-העדר עבירות אלימות
  docPoliceNoSexOffense: 'fldZBF1Fw0aCcuONK', // אישור משטרה-העדר עבירות מין
  docEmployment: 'fldhzxp5c6BM6EREa', // נתוני העסקה — חובה לעובד חדש בפרא/הוראה
  // weekly schedule durations (3 shifts/day) — keyed [day][shift]
} as const;

/**
 * Document attachment fields, in display order, with their show conditions.
 * All render on the employee step: age/gender come from the employee, and the
 * violence-cert condition uses the INSTITUTION's layer (known from the token),
 * not the role's — so a role doesn't need to be chosen first.
 * When shown, every field is mandatory.
 */
export const DOC_FIELDS = [
  {
    key: 'docEducationalInstitution',
    fieldId: POSITION_FIELDS.docEducationalInstitution,
    label:
      'אישור לימודים: אישור ממקום לימודו של הנער המופיע בו שעות לימוד הנער.\nחל איסור חוקי להעסיק בזמן שעות לימוד הנער.',
    condition: 'youth', // age 15–17 (>=15, <18)
  },
  {
    key: 'docMedical',
    fieldId: POSITION_FIELDS.docMedical,
    label: 'צרוף אישור רפואי המאשר העסקתו של הנער',
    condition: 'youth', // age 15–17 (>=15, <18)
  },
  {
    key: 'docPoliceNoSexOffense',
    fieldId: POSITION_FIELDS.docPoliceNoSexOffense,
    label: 'אישור משטרה - העדר עבירות מין',
    condition: 'male', // gender = זכר
  },
  {
    key: 'docNoViolence',
    fieldId: POSITION_FIELDS.docNoViolence,
    label: 'אישור העדר עבירות אלימות',
    condition: 'kindergartenLayer', // institution layer = גנים
  },
  {
    key: 'docEmployment',
    fieldId: POSITION_FIELDS.docEmployment,
    label: 'נתוני העסקה',
    condition: 'newEmployeeParaOrTeaching', // עובד חדש + קטגוריה פרא/הוראה
  },
] as const;

export type DocFieldDef = (typeof DOC_FIELDS)[number];
export type DocKey = DocFieldDef['key'];

/** סיבת עדכון (POSITION_FIELDS.updateReason) — singleSelect choices, edit mode only. */
export const UPDATE_REASON_OPTIONS = [
  'אישור תקן שנה קודמת',
  'שינוי מערכת שעות (ללא הורדה בשעות)',
  'שינוי בהיקף משרה ',
  'הוספת גמול / ריכוז / הערה',
  'שינוי תפקיד',
] as const;

/** Weekly schedule entry/exit duration fields per day, with shift variants (1,2,3). */
export const SCHEDULE_FIELDS = {
  sun: { in: ['fldRs7nLEvFS2UX1P', 'fldh8hi9nshbkE9DZ', 'fldHlFHRUMIh9LPL1'], out: ['fld1LZh4tlLjyy7fW', 'fld8vPa6b0Ym9J87V', 'fldK7TdLd8WjdtpTp'] },
  mon: { in: ['fldJZm0ppgqi1Sw07', 'fldXbmQqFtsE8iwIm', 'fldWRvWWWsTww9IO0'], out: ['fldmWdwntev0ZdsCH', 'fldY09VhryQUAw9wg', 'fldTDZsAFIjBdoYfX'] },
  tue: { in: ['fld5HCn0pLPdzcAti', 'fldjSz03lzNdtHrcy', 'fldBextRtl1fuPwXL'], out: ['fldEF6Pvdwn5CxsV4', 'fldfi4HZF3XYrRHgk', 'fldfQC66WarKThNOq'] },
  wed: { in: ['fldqRS0nsqYRBuY3z', 'fldQMFQqfHidvKxdH', 'fldYmvcGklghQsEsS'], out: ['fldide6dKF3I5ZMEZ', 'fldfP9jHtloy7FLRD', 'fldd8vWuepMvzlasQ'] },
  thu: { in: ['fldx6EMqIKtSSKsHA', 'fldwXfhhSVJTG3Cl9', 'fldf6HsXbb0j0BR7n'], out: ['fld6L9sIeQmLlmWfE', 'fldpNBHJ7COzrf1HA', 'fldGrJ2h5lZbFh1Ji'] },
  fri: { in: ['flddTGbnwxpSOVbXI', 'fldMzeIlH06Sz2Diu', 'fldqFb2ko8DV3nDBP'], out: ['flddOx4eM0KgJdNW9', 'fld91SeV6Jr6c1PcR', 'fldIlwMFtr5n8RNrW'] },
  // מוצ"ש — regular schedules only, a single shift (one entry/exit).
  motzash: { in: ['fld3Bh04ocFY8neUw'], out: ['fldQlk76he0xsnmsd'] },
} as const;

/** לוח צלצולים fields (bell-schedule slots, keyed by סוג to match BUDGET_FIELDS.bellScheduleNum) */
export const BELL_FIELDS = {
  type: 'fldTW7xDbJTHeUHQY', // סוג (singleSelect) — matches תקציב התחלתי.לוח צלצולים choices
  entry: 'fldecyieufEg6iHOX', // כניסה (duration, seconds from midnight)
  exit: 'fld30uied9QyRvqxR', // יציאה (duration, seconds from midnight)
  dailyHours: 'fldsEs7xEW0PJdOGT', // שעות יומיות (number) — the hours that count when picked
  weekday: 'fldNb6rcmG8gugWyw', // יום בשבוע (singleSelect: "א-ה" / "ו")
  category: 'fld9eKY0lDfNbpJ4v', // קטגוריה (singleSelect: "עובדי הוראה")
  range: 'fldbDAXiqolYhSaou', // כניסה ויציאה (formula text "HH:MM-HH:MM")
  afternoonTeacher: 'fldmM6mMAHJYhqFBx', // מורת צהריים (checkbox) — רצועה שמתחילה לפני 12:00 אסורה פרט ליום בוקר
} as const;

/** מחשבון אופק חדש fields */
export const OFEK_FIELDS = {
  key: 'fldbLwWMO4KFfo7KY', // סיכום (lookup key)
  layer: 'fldyY3SmHo5aU3LNu',
  ageHours: 'fldkkmXtDjQKDiTDK',
  motherPosition: 'fldXL5DaXsvIZ6Rmt',
  category: 'fldrIPtEFFHNQggLj',
  frontalHours: 'fldg22XX78vV8T436',
  individualHours: 'fld7yMvggoR6NFIqk',
  stayHours: 'fldD3FoN1K5VgZHsR',
  totalHours: 'fldrFRAYPc479uPeR',
  jobPercent: 'fldYr6bOHs7wgJoko',
} as const;

/** סמלי מוסד fields */
export const SYMBOL_FIELDS = {
  symbolCode: 'fldgAfHPhzPJ8FWxl', // סמל מוסד (e.g. "710236")
  displayName: 'fldUrL9qRVCpxNWFP', // שם תצוגה
  institutionName: 'fldBdsMIzlLPWJ6Rl',
  institutionLink: 'fld7zWKFmxILasQqR', // → נתוני מוסדות (note: links to a different mosadot table)
  address: 'fld1dYk10RMkg7mFL',
} as const;

/** תקציב התחלתי fields */
export const BUDGET_FIELDS = {
  role: 'fldNSVjtprJUPUOZ7', // תפקיד (text)
  institutionLink: 'fld91lKf1ba2ADEnL', // → מוסדות
  symbolLink: 'fldG29aOqYleLgfGt', // → סמלי מוסד
  bellScheduleNum: 'fldjzY10TI7bcDsBZ', // לוח צלצולים (multipleSelects)
  severeDisabilityBonus: 'fldOgeNqOSkZZKbmC', // לקות קשה (checkbox)
  category: 'fld396nSlQajFyFir', // קטגוריה (singleSelect)
  ofekChadash: 'fld2Rydg2hk61j86a', // אופק חדש (checkbox)
  paraBoard: 'fldpsfFEtZcf1Ax2P', // לוח פרא (checkbox)
  layer: 'fld73g5XuRBvVSdRR', // שכבה (multipleSelects)
  remainingHours: 'fldIQkVfVbYWRh7KT', // שעות שנותרו (formula)
  scheduleType: 'fldGS2hMdyzpoJXyG', // סוג מערכת שעות (singleSelect)
  remainingGemulim: 'fldNkctOqCocC2nAs', // יתרת גמולים לניצול (formula)
  remainingRoles: 'fldAVzTMiDkiDpMKh',  // יתרת תפקידים לניצול (formula)
  salaryType: 'fldwRQWa4elIIZ8zc',  // סוג שכר (singleSelect)
  tariff: 'fldXCXha3m4ddSLlB',      // תעריף (text)
  ranking: 'fldGa1xyA97oY2sMh',     // מס כיתות / דירוג (text)
  seniority: 'fld2lspCubFLNIncX',   // שעות לתפקיד / ותק-אופק (text)
} as const;

/** קטגוריה / סוג מערכת שעות choice names (from live schema). */
export const CATEGORY = {
  teaching: 'הוראה',
  assistance: 'סיוע',
  paramedical: 'פרא רפואי',
  baseSalary: 'שכר יסוד',
  gemul: 'גמול',
  gradedAssistance: 'סיוע מדורג',
  invoice: 'חשבונית',
  roles: 'תפקידים',
  paraGemul: 'גמולי פרא',
} as const;

export const SCHEDULE_TYPE = {
  regular: 'רגיל',
  teaching: 'הוראה',
  para: 'פרא',
  deputy1: 'סגן ראשון',
  deputy2: 'סגן שני',
  manager: 'מנהל/ת',
  substitute: 'מילוי מקום',
  invoice: 'חשבונית',
} as const;

/** תקנים תשפו fields (prior year, read-only) */
export const PREV_YEAR_FIELDS = {
  tz: 'fldRkCIhWZs1xXJa6',
  role: 'fldRrjKUvrqQ4XEBs',
  category: 'fld3e93VixbRrLpjE',
  mosad: 'fldlOx2cVBnd9ykn6',
  subRole: 'fldP90ItzxZgRB9ce',
  notes: 'fldxaIME5M14G33Ta',
  hoursForBudget: 'fldDkiaemqG0uz9zW',  // סה"כ שעות לניצול להתקציב
  frontalHours: 'fldc4mXKic2RctRYI',    // שעות פרונטלי
  individualHours: 'fld78iBf1OyCL7zF9', // שעות פרטני
  stayHours: 'fldyDjVoeYuDO75CS',       // שעות שהייה
  updateStatusTshapaz: 'fldhkHOZb8mnfZjxe', // סטטוס עדכון תשפז
  schedule: {
    sun: { in: ['fldpgqFyN1uyUoKGE', 'fldcPrMHJm8uSjDys', 'fldIZe6VLHteipbuk'], out: ['fld2FyJWnymMuoXNt', 'fld7jgxlhHHXGR1ai', 'fldBcafnyJtHEBPEO'] },
    mon: { in: ['fldB0uusSBJqdf5jB', 'fldd5S8QQYWTxKPSW', 'fldFYymHU8LxmN0i9'], out: ['fldldESPCaOvdjz20', 'fldmuoQohcgWoKr3x', 'fldV0WO3e5lRirvYA'] },
    tue: { in: ['fld07wheUuGjvrNG5', 'fld8E1qr3IWzUxQ4u', 'fldKmWBEmMZrWL1jD'], out: ['fldMmHHmKkxANBcMw', 'fldazAIT2zSMSr231', 'fldJFXHLFtCY1TXrv'] },
    wed: { in: ['fld7XstxECOutEijI', 'fldULq6KmbaHXDEnY', 'fldLkgLN8oREAOu6P'], out: ['fldbrxaBppY4Pz0Sr', 'fldutDW35NLuUbZhc', 'fldnx0etv2KZp6nRp'] },
    thu: { in: ['fldnYNjLWsqXxeUa6', 'fldrXzp2xVwEuYLet', 'fldzmj4eVxJUtNRUk'], out: ['fldMN3hyJadOxG4gy', 'fldLaoXdEAbZ1meCP', 'fldMDQE3M5lcdnaXp'] },
    fri: { in: ['fld0KZZfHC1EMxqSr', 'fldvBi3tLaXWSLreJ', 'fldxiXMTwjCQ7dqw1'], out: ['fldkQ62n6C3Y6c9sO', 'fld1GLvzSPF7bMIxA', 'fldilyw2oIcW8lH35'] },
  },
} as const;

/** סיכום שעות לעובד fields */
export const HOURS_SUMMARY_FIELDS = {
  name: 'fld45tmxh7eUCiwEx',
  tz: 'fldCxP5CyLSTzdQaz',
  institution: 'fldWr5w6Ix6ommYbd',
  category: 'fldVhBXVbJ3l39p9k',
  currentHours: 'fldiVjh1QE5Uu1Mqr',
  previousYearHours: 'fldTJRZNg5to1WKQk',
} as const;
