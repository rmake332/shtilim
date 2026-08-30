import { describe, it, expect } from 'vitest';
import {
  CANONICAL_SUB_ROLES,
  isCanonicalSubRole,
  canonicalSubRoleChoices,
  requiresLandbergApproval,
  requiresLicenseNumber,
  suggestCanonicalSubRole,
} from './subRole';

describe('isCanonicalSubRole', () => {
  it('מקבל את 8 הערכים הקנוניים', () => {
    for (const v of CANONICAL_SUB_ROLES) expect(isCanonicalSubRole(v)).toBe(true);
  });

  it('דוחה וריאנטים ומחרוזת ריקה', () => {
    expect(isCanonicalSubRole('מטפלת רגשית')).toBe(false);
    expect(isCanonicalSubRole('מטפל/ת רגשית ')).toBe(false); // רווח נגרר לא מנורמל כאן
    expect(isCanonicalSubRole('')).toBe(false);
  });
});

describe('canonicalSubRoleChoices', () => {
  it('מסנן את אופציות הזבל ושומר על סדר המקור', () => {
    // דגימה אמיתית מהשדה באיירטייבל: 8 קנוניים ואחריהם ערכים שנוצרו ע"י typecast
    const live = [
      'קלינאות תקשורת',
      'ריפוי בעיסוק',
      'מטפל/ת באומנות',
      'קלינאית תקשורת ',
      'עוס',
      'פרא רפואי',
      'הדרכה קלינאות',
    ];
    expect(canonicalSubRoleChoices(live)).toEqual([
      'קלינאות תקשורת',
      'ריפוי בעיסוק',
      'מטפל/ת באומנות',
      'הדרכה קלינאות',
    ]);
  });

  it('מסנן גם את אופציות הזבל של טבלת תקני חשבונית', () => {
    expect(canonicalSubRoleChoices(['פיזיו', 'פיזיותרפיה', 'בדיקה'])).toEqual(['פיזיו']);
  });
});

describe('requiresLandbergApproval', () => {
  it('נדרש לטיפול רגשי ובאומנות בלבד', () => {
    expect(requiresLandbergApproval('מטפל/ת רגשית')).toBe(true);
    expect(requiresLandbergApproval('מטפל/ת באומנות')).toBe(true);
    expect(requiresLandbergApproval('קלינאות תקשורת')).toBe(false);
  });

  it('וריאנט כתיב לא עוקף את השער אחרי נרמול', () => {
    // הבאג המקורי: "מטפלת רגשית" לא נמצא בסט ולכן דילג על השאלה בשקט.
    // הנרמול הוא שמחזיר אותו לערך הקנוני, ורק אז השער נתפס.
    expect(requiresLandbergApproval('מטפלת רגשית')).toBe(false);
    expect(requiresLandbergApproval(suggestCanonicalSubRole('מטפלת רגשית')!)).toBe(true);
  });
});

describe('requiresLicenseNumber', () => {
  it('נדרש לקלינאות תקשורת ולריפוי בעיסוק', () => {
    expect(requiresLicenseNumber('קלינאות תקשורת')).toBe(true);
    expect(requiresLicenseNumber('ריפוי בעיסוק')).toBe(true);
  });

  it('לא נדרש לעובדת סוציאלית, לאומנות, ולערך ריק', () => {
    expect(requiresLicenseNumber('עובדת סוציאלית')).toBe(false);
    expect(requiresLicenseNumber('מטפל/ת באומנות')).toBe(false);
    expect(requiresLicenseNumber('')).toBe(false);
  });
});

describe('suggestCanonicalSubRole', () => {
  it('מחזיר ערך קנוני כמות שהוא', () => {
    for (const v of CANONICAL_SUB_ROLES) expect(suggestCanonicalSubRole(v)).toBe(v);
  });

  it('סדר הכללים: פסיכותרפיסט הוא רגשי ולא אומנות', () => {
    // "פסיכותרפיסט" מכיל "תרפי". אילו כלל האומנות היה מקדים, הוא היה בולע אותו.
    expect(suggestCanonicalSubRole('פסיכותרפיסט')).toBe('מטפל/ת רגשית');
  });

  it('מנרמל רווחים נגררים, רווחים כפולים וגרשיים עבריים', () => {
    expect(suggestCanonicalSubRole('עובדת סוציאלית ')).toBe('עובדת סוציאלית');
    expect(suggestCanonicalSubRole('מטפלת  רגשית')).toBe('מטפל/ת רגשית');
    expect(suggestCanonicalSubRole('עו\u05f4ס')).toBe('עובדת סוציאלית');
  });

  it('מחזיר null לקלט ריק', () => {
    expect(suggestCanonicalSubRole('')).toBeNull();
    expect(suggestCanonicalSubRole('   ')).toBeNull();
  });

  it('תפקידי הדרכה נעצרים במכוון: אי אפשר להסיק איזה מבין שני ערכי ההדרכה', () => {
    expect(suggestCanonicalSubRole('הדרכות')).toBeNull();
    expect(suggestCanonicalSubRole('הדרכה מהבית')).toBeNull();
    // בלי שער ה-"הדרכ" הערך הזה היה נופל לטיפול עצמו במקום להדרכה
    expect(suggestCanonicalSubRole('הדרכה קלינאית')).toBeNull();
  });

  // 40 הערכים הלא-קנוניים שנמצאו בפועל בטבלת תקנים פעילים (155 רשומות).
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
    ['עוס', 'עובדת סוציאלית'],
    ['עו"ס', 'עובדת סוציאלית'],
    ['עובד סוציאלי', 'עובדת סוציאלית'],
    ['עובדת סוצאילית', 'עובדת סוציאלית'],
    ['עובדת סוציאלית ', 'עובדת סוציאלית'],
    // אין התאמה קנונית: התפריט נפתח ריק והמזכירה בוחרת
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
    expect(suggestCanonicalSubRole(raw)).toBe(expected);
  });

  it('כל הצעה שאינה null היא ערך קנוני', () => {
    for (const [raw] of REAL) {
      const s = suggestCanonicalSubRole(raw);
      if (s !== null) expect(isCanonicalSubRole(s)).toBe(true);
    }
  });
});
