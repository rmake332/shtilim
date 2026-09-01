import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// אין תווים שדורשים escaping בת.ז./זיהוי זר, ולכן זהות מספיקה לבדיקות כאן.
vi.mock('../../lib/airtable/client', () => ({
  escapeFormulaValue: (s: string) => s,
}));

const { buildTzExactMatchFormula, cleanedTzField } = await import('../../lib/airtable/tzMatch');

const FIELD = 'fldTz';

/**
 * מחקה את חישוב הנוסחה של איירטייבל על ערך מאוחסן בודד: מריץ את UPPER/SUBSTITUTE/TRIM
 * שב-cleanedTzField ומעריך את תנאי ה-OR שנבנה. כך אפשר לבדוק התאמה בפועל, ולא רק את
 * מחרוזת הנוסחה.
 */
function matches(formula: string, stored: string): boolean {
  const cleaned = stored.trim().replace(/ /g, '').replace(/-/g, '').toUpperCase();
  const comparisons = formula.match(/="([^"]*)"/g) ?? [];
  // הנוסחה מורכבת רק מהשוואות של אותו שדה מנוקה, ב-OR או בודדת.
  expect(formula).toContain(cleanedTzField(FIELD));
  return comparisons.some((c) => c.slice(2, -1) === cleaned);
}

describe('buildTzExactMatchFormula', () => {
  it('מחזיר null לקלט ריק', () => {
    expect(buildTzExactMatchFormula('', FIELD)).toBeNull();
    expect(buildTzExactMatchFormula('   ', FIELD)).toBeNull();
  });

  it('ת.ז. מרופדת בקלט מוצאת רשומה שנשמרה בלי אפסים מובילים', () => {
    // הבאג שיצר כפילויות: הקלדת "054733068" לא מצאה את "54733068" שכבר בטבלה.
    const f = buildTzExactMatchFormula('054733068', FIELD)!;
    expect(matches(f, '54733068')).toBe(true);
    expect(matches(f, '054733068')).toBe(true);
  });

  it('ת.ז. לא מרופדת בקלט מוצאת רשומה שנשמרה מרופדת', () => {
    const f = buildTzExactMatchFormula('54733068', FIELD)!;
    expect(matches(f, '054733068')).toBe(true);
    expect(matches(f, '54733068')).toBe(true);
  });

  it('מוצא ת.ז. שנשמרה עם מקף או רווחים', () => {
    const f = buildTzExactMatchFormula('218722312', FIELD)!;
    expect(matches(f, '21872231-2')).toBe(true);
    expect(matches(f, ' 218722312 ')).toBe(true);
  });

  it('לא מתאים לת.ז. אחרת', () => {
    const f = buildTzExactMatchFormula('218722312', FIELD)!;
    expect(matches(f, '218722313')).toBe(false);
    expect(matches(f, '21872231')).toBe(false);
  });

  it('לא מתאים לשדה ריק', () => {
    const f = buildTzExactMatchFormula('218722312', FIELD)!;
    expect(matches(f, '')).toBe(false);
    expect(matches(f, '   ')).toBe(false);
  });

  it('זיהוי זר: מתאים ללא תלות ברישיות, ברווחים ובמקפים', () => {
    const f = buildTzExactMatchFormula('ab 1234-567', FIELD)!;
    expect(matches(f, 'AB1234567')).toBe(true);
    expect(matches(f, 'ab1234567')).toBe(true);
  });

  it('זיהוי זר: שתי סדרות ספרות זהות עם אותיות שונות אינן מתנגשות', () => {
    const f = buildTzExactMatchFormula('AB1234567', FIELD)!;
    expect(matches(f, 'CD1234567')).toBe(false);
    expect(matches(f, '1234567')).toBe(false);
  });
});

describe('ממלא מקום', () => {
  it('אינו מייצר נוסחה כלל - כדי שלא ייבחר אדם אקראי מבין רשומות ה-000000000', () => {
    expect(buildTzExactMatchFormula('000000000', FIELD)).toBeNull();
    expect(buildTzExactMatchFormula('0', FIELD)).toBeNull();
    expect(buildTzExactMatchFormula('000-000-000', FIELD)).toBeNull();
    expect(buildTzExactMatchFormula('AAAA', FIELD)).toBeNull();
  });
});
