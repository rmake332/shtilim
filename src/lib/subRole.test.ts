import { describe, it, expect } from 'vitest';
import {
  findSubRole,
  isKnownSubRole,
  requiresLandbergApproval,
  requiresLicenseNumber,
  subRoleDocsFor,
  suggestSubRole,
  type SubRoleOption,
} from './subRole';
import { SUB_ROLE_DOC_FIELDS, SUB_ROLE_DOC_CHOICES } from './airtable/schema';

/**
 * העתק של 8 השורות בטבלת "תת-תפקידים" (tblIEck6VDcpdfLFZ) כפי שהן מוגדרות שם.
 * מקור האמת בזמן ריצה הוא הטבלה; הפיקסצ'ר הזה מתעד מה היא אמורה להכיל, ומאפשר
 * לבדוק את הלוגיקה בלי לפנות לאיירטייבל.
 */
const DOC = SUB_ROLE_DOC_CHOICES;
const OPTIONS: SubRoleOption[] = [
  {
    name: 'קלינאות תקשורת',
    requiresLandberg: false,
    requiresLicenseNumber: true,
    docs: [DOC['רישיון משרד הבריאות (קלינאות תקשורת)']],
  },
  {
    name: 'ריפוי בעיסוק',
    requiresLandberg: false,
    requiresLicenseNumber: true,
    docs: [DOC['רישיון משרד הבריאות (ריפוי בעיסוק)']],
  },
  {
    name: 'מטפל/ת באומנות',
    requiresLandberg: true,
    requiresLicenseNumber: false,
    docs: [DOC['אישור תואר שני בטיפול'], DOC["אישור 960 שעות סטאז'"]],
  },
  { name: 'מטפל/ת רגשית', requiresLandberg: true, requiresLicenseNumber: false, docs: [] },
  { name: 'פיזיו', requiresLandberg: false, requiresLicenseNumber: false, docs: [] },
  {
    name: 'עובד/ת סוציאלי/ת',
    requiresLandberg: false,
    requiresLicenseNumber: false,
    docs: [DOC['תעודת רישום משרד הרווחה']],
  },
  {
    name: 'הדרכה קלינאות',
    requiresLandberg: false,
    requiresLicenseNumber: true,
    docs: [DOC['רישיון משרד הבריאות (קלינאות תקשורת)']],
  },
  {
    name: 'הדרכה ריפוי בעיסוק',
    requiresLandberg: false,
    requiresLicenseNumber: true,
    docs: [DOC['רישיון משרד הבריאות (ריפוי בעיסוק)']],
  },
];
const NAMES = OPTIONS.map((o) => o.name);

describe('isKnownSubRole', () => {
  it('מקבל כל שם שקיים באופציות', () => {
    for (const o of OPTIONS) expect(isKnownSubRole(OPTIONS, o.name)).toBe(true);
  });

  it('דוחה וריאנטים, רווח נגרר ומחרוזת ריקה', () => {
    expect(isKnownSubRole(OPTIONS, 'מטפלת רגשית')).toBe(false);
    expect(isKnownSubRole(OPTIONS, 'עובדת סוציאלית')).toBe(false); // השם הישן, לפני השינוי בטבלה
    expect(isKnownSubRole(OPTIONS, 'מטפל/ת רגשית ')).toBe(false); // ההשוואה מדויקת, בלי נרמול
    expect(isKnownSubRole(OPTIONS, '')).toBe(false);
  });

  it('רשימת אופציות ריקה דוחה הכול, ולא קורסת', () => {
    expect(isKnownSubRole([], 'קלינאות תקשורת')).toBe(false);
    expect(subRoleDocsFor([], 'קלינאות תקשורת')).toEqual([]);
    expect(requiresLandbergApproval([], 'מטפל/ת רגשית')).toBe(false);
    expect(requiresLicenseNumber([], 'קלינאות תקשורת')).toBe(false);
  });
});

describe('requiresLandbergApproval', () => {
  it('נדרש לטיפול רגשי ובאומנות בלבד', () => {
    const needLandberg = NAMES.filter((n) => requiresLandbergApproval(OPTIONS, n));
    expect(needLandberg).toEqual(['מטפל/ת באומנות', 'מטפל/ת רגשית']);
  });

  it('וריאנט כתיב לא עוקף את השער אחרי נרמול', () => {
    // הבאג המקורי: "מטפלת רגשית" לא נמצא ברשימה ולכן דילג על השאלה בשקט.
    // הנרמול הוא שמחזיר אותו לשם שבטבלה, ורק אז השער נתפס.
    expect(requiresLandbergApproval(OPTIONS, 'מטפלת רגשית')).toBe(false);
    expect(requiresLandbergApproval(OPTIONS, suggestSubRole('מטפלת רגשית', NAMES)!)).toBe(true);
  });
});

describe('requiresLicenseNumber', () => {
  it('נדרש לקלינאות, לריפוי בעיסוק ולשני ערכי ההדרכה', () => {
    const needLicense = NAMES.filter((n) => requiresLicenseNumber(OPTIONS, n));
    expect(needLicense).toEqual([
      'קלינאות תקשורת',
      'ריפוי בעיסוק',
      'הדרכה קלינאות',
      'הדרכה ריפוי בעיסוק',
    ]);
  });

  it('לא נדרש לעובדת סוציאלית, לאומנות, ולערך ריק', () => {
    expect(requiresLicenseNumber(OPTIONS, 'עובד/ת סוציאלי/ת')).toBe(false);
    expect(requiresLicenseNumber(OPTIONS, 'מטפל/ת באומנות')).toBe(false);
    expect(requiresLicenseNumber(OPTIONS, '')).toBe(false);
  });
});

describe('subRoleDocsFor', () => {
  it('מטפל/ת באומנות דורש שני מסמכים', () => {
    expect(subRoleDocsFor(OPTIONS, 'מטפל/ת באומנות').map((d) => d.label)).toEqual([
      'אישור תואר שני בטיפול',
      "אישור 960 שעות סטאז'",
    ]);
  });

  it('ערך ללא מסמכים ושם לא מוכר מחזירים מערך ריק', () => {
    expect(subRoleDocsFor(OPTIONS, 'פיזיו')).toEqual([]);
    expect(subRoleDocsFor(OPTIONS, 'מטפלת רגשית')).toEqual([]);
  });
});

describe('findSubRole', () => {
  it('מחזיר undefined לשם ריק או לא מוכר', () => {
    expect(findSubRole(OPTIONS, '')).toBeUndefined();
    expect(findSubRole(OPTIONS, 'פרא רפואי')).toBeUndefined();
  });
});

describe('suggestSubRole', () => {
  it('מחזיר שם שקיים בטבלה כמות שהוא', () => {
    for (const n of NAMES) expect(suggestSubRole(n, NAMES)).toBe(n);
  });

  it('סדר הכללים: פסיכותרפיסט הוא רגשי ולא אומנות', () => {
    // "פסיכותרפיסט" מכיל "תרפי". אילו כלל האומנות היה מקדים, הוא היה בולע אותו.
    expect(suggestSubRole('פסיכותרפיסט', NAMES)).toBe('מטפל/ת רגשית');
  });

  it('מנרמל רווחים נגררים, רווחים כפולים וגרשיים עבריים', () => {
    expect(suggestSubRole('עובדת סוציאלית ', NAMES)).toBe('עובד/ת סוציאלי/ת');
    expect(suggestSubRole('מטפלת  רגשית', NAMES)).toBe('מטפל/ת רגשית');
    expect(suggestSubRole('עו״ס', NAMES)).toBe('עובד/ת סוציאלי/ת');
  });

  it('מחזיר null לקלט ריק', () => {
    expect(suggestSubRole('', NAMES)).toBeNull();
    expect(suggestSubRole('   ', NAMES)).toBeNull();
  });

  it('תפקידי הדרכה נעצרים במכוון: אי אפשר להסיק לאיזה ערך הדרכה מדובר', () => {
    expect(suggestSubRole('הדרכות', NAMES)).toBeNull();
    expect(suggestSubRole('הדרכה מהבית', NAMES)).toBeNull();
    // בלי שער ה-"הדרכ" הערך הזה היה נופל לטיפול עצמו במקום להדרכה
    expect(suggestSubRole('הדרכה קלינאית', NAMES)).toBeNull();
  });

  it('לא מציע ערך שאינו קיים בטבלה', () => {
    // הטבלה היא מקור האמת: אם "מטפל/ת רגשית" הוסר ממנה, המפה לא תציע אותו.
    const without = NAMES.filter((n) => n !== 'מטפל/ת רגשית');
    expect(suggestSubRole('מטפלת רגשית', without)).toBeNull();
    expect(suggestSubRole('מטפלת רגשית', NAMES)).toBe('מטפל/ת רגשית');
    expect(suggestSubRole('קלינאית תקשורת', [])).toBeNull();
  });

  it('שינוי שם בטבלה לא שובר את המיפוי', () => {
    // זה קרה בפועל: "עובדת סוציאלית" שונה ל-"עובד/ת סוציאלי/ת", ויעד קבוע
    // במפה היה מפסיק להתאים בשקט. ההתאמה לפי כלל שורדת כל שם שנשאר באותו מקצוע.
    const renamed = ['עו"ס מוסדי', 'מטפל/ת רגשית'];
    expect(suggestSubRole('עוס', renamed)).toBe('עו"ס מוסדי');
    expect(suggestSubRole('עובד סוציאלי', renamed)).toBe('עו"ס מוסדי');
  });

  it('שני מועמדים לאותו כלל מחזירים null במקום ניחוש', () => {
    const ambiguous = ['קלינאות תקשורת', 'קלינאית מוסדית'];
    expect(suggestSubRole('קלינאית', ambiguous)).toBeNull();
  });

  it('ערכי הדרכה אינם יעד לקלט שאינו הדרכה', () => {
    // "הדרכה קלינאות" מכיל "קלינא", ובלי ההחרגה הוא היה מועמד שני
    // ל-"קלינאית תקשורת" והתוצאה הייתה null במקום הטיפול עצמו.
    expect(suggestSubRole('קלינאית תקשורת', NAMES)).toBe('קלינאות תקשורת');
    expect(suggestSubRole('מרפאה בעיסוק', NAMES)).toBe('ריפוי בעיסוק');
  });

  // 40 הערכים הלא-מוכרים שנמצאו בפועל בטבלת תקנים פעילים (155 רשומות).
  const REAL: [string, string | null][] = [
    ['מטפלת רגשית', 'מטפל/ת רגשית'],
    ['מטפלת רגשית ', 'מטפל/ת רגשית'],
    ['מטפל רגשי', 'מטפל/ת רגשית'],
    ['מטפלת ריגשית', 'מטפל/ת רגשית'],
    ['מטפלת ריגשית ', 'מטפל/ת רגשית'],
    ['טיפול רגשי', 'מטפל/ת רגשית'],
    ['רגשי', 'מטפל/ת רגשית'],
    ['פסיכותרפיסט', 'מטפל/ת רגשית'],
    ['קלינאית תקשורת', 'קלינאות תקשורת'],
    ['קלינאית תקשורת ', 'קלינאות תקשורת'],
    ['קלינאי תקשורת', 'קלינאות תקשורת'],
    ['קלינאית', 'קלינאות תקשורת'],
    ['אחראית תחום קלינאית תקשורת', 'קלינאות תקשורת'],
    ['מרפאה בעיסוק', 'ריפוי בעיסוק'],
    ['מרפא בעיסוק', 'ריפוי בעיסוק'],
    ['מטפלת באומנות', 'מטפל/ת באומנות'],
    ['מטפלת באומנות ', 'מטפל/ת באומנות'],
    ['טיפול באומנות', 'מטפל/ת באומנות'],
    ['תרפיה באומנות', 'מטפל/ת באומנות'],
    ['מטפל במוזיקה', 'מטפל/ת באומנות'],
    ['מטפלת במוזיקה', 'מטפל/ת באומנות'],
    ['מטפלת בדרמה', 'מטפל/ת באומנות'],
    ['מטפלת בדרמה בועה', 'מטפל/ת באומנות'],
    ['דרמה תרפיסט', 'מטפל/ת באומנות'],
    ['עוס', 'עובד/ת סוציאלי/ת'],
    ['עו"ס', 'עובד/ת סוציאלי/ת'],
    ['עובד סוציאלי', 'עובד/ת סוציאלי/ת'],
    ['עובדת סוצאילית', 'עובד/ת סוציאלי/ת'],
    ['עובדת סוציאלית ', 'עובד/ת סוציאלי/ת'],
    // אין התאמה: התפריט נפתח ריק והמזכירה בוחרת
    ['הדרכות', null],
    ['הדרכה מהבית', null],
    ['מדריכה רפ"ע', null],
    ['פדגוגית', null],
    ['פדגוגי', null],
    ['מנחה פדגוגית', null],
    ['מדריכה פדגוגית', null],
    ['רכזת טיפול', null],
    ['מנהלת טיפולית', null],
    ['פרא רפואי', null],
    ['מטפלת', null],
  ];

  it.each(REAL)('%j → %j', (raw, expected) => {
    expect(suggestSubRole(raw, NAMES)).toBe(expected);
  });

  it('כל הצעה שאינה null היא שם שקיים בטבלה', () => {
    for (const [raw] of REAL) {
      const s = suggestSubRole(raw, NAMES);
      if (s !== null) expect(isKnownSubRole(OPTIONS, s)).toBe(true);
    }
  });
});

// ── שמירה על סנכרון בין הקוד לטבלת תת-תפקידים ──────────────────────────────
// מסמכי ההסמכה הם החוליה היחידה שנשארה בקוד, כי הם מפנים לשדות קבצים ממשיים
// על רשומת העובד. הבדיקות האלה מוודאות שהמיפוי מהטבלה לשדות תואם את מה שהקוד
// מכיר, כדי ששם בחירה שיתווסף בטבלה בלי שדה מתאים לא יישאר בלי שיבחין בו איש.
describe('סנכרון עם טבלת תת-תפקידים', () => {
  it('SUB_ROLE_DOC_CHOICES מכסה בדיוק את שדות המסמכים שהקוד מכיר', () => {
    const fromChoices = new Set(Object.values(SUB_ROLE_DOC_CHOICES).map((d) => d.fieldId));
    const fromCode = new Set(SUB_ROLE_DOC_FIELDS.map((d) => d.fieldId));
    expect([...fromChoices].sort()).toEqual([...fromCode].sort());
  });

  it('כל בחירה ממופה לתווית התצוגה שהמזכירה רואה', () => {
    for (const { fieldId, label } of Object.values(SUB_ROLE_DOC_CHOICES)) {
      const def = SUB_ROLE_DOC_FIELDS.find((d) => d.fieldId === fieldId);
      expect(def, `אין הגדרה בקוד לשדה ${fieldId}`).toBeDefined();
      expect(label).toBe(def!.label);
    }
  });
});
