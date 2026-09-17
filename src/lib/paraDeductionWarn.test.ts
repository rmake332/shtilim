import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../lib/airtable/client', () => ({
  getRecord: vi.fn(),
  listRecords: vi.fn(),
  escapeFormulaValue: (s: string) => s,
}));

const { dependentsLosingDeduction } = await import('../lib/paraDeductionWrite');

/**
 * התרחיש: תקן A ניכה ביום ב', תקן B דילג באותו יום ונשען עליו. עכשיו עורכים את
 * A ומשנים את מערכת השעות שלו. B אינו מחושב מחדש בשום מקרה, ולכן השאלה היחידה
 * היא האם הוא נשאר בלי מי שינכה עבורו.
 */
describe('dependentsLosingDeduction', () => {
  const B = { name: 'לוי שרה - פרא רפואי יסודי', detail: 'ב:0 (פרא רפואי חטיבה), ה:40' };

  it('A ממשיך לנכות ביום ב - אין אזהרה', () => {
    expect(
      dependentsLosingDeduction({
        coveredDaysAfterEdit: new Set(['mon']),
        dependents: [B],
      }),
    ).toEqual([]);
  });

  it('A הסיר את יום ב מהמערכת - B נשאר בלי מנכה, ויש אזהרה', () => {
    const out = dependentsLosingDeduction({
      coveredDaysAfterEdit: new Set(['wed']),
      dependents: [B],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('לוי שרה - פרא רפואי יסודי');
    expect(out[0]).toContain('שני');
  });

  it('תקן שלישי לקח את הניכוי ביום ב - B מכוסה, ואין אזהרת שווא', () => {
    // A כבר אינו מנכה ביום ב', אבל תקן אחר של אותו עובד באותו מוסד כן. הקריטריון
    // הוא "יש מנכה ביום הזה", לא "התקן הנערך מנכה בו".
    const out = dependentsLosingDeduction({
      coveredDaysAfterEdit: new Set(['mon']),
      dependents: [B],
    });
    expect(out).toEqual([]);
  });

  it('אף אחד לא מנכה ביום ב אחרי העריכה - אזהרה', () => {
    const out = dependentsLosingDeduction({
      coveredDaysAfterEdit: new Set(),
      dependents: [B],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('אין יותר מי שמנכה');
  });

  it('יום שבו B ניכה בעצמו אינו מייצר אזהרה, גם כש-A לא מנכה בו', () => {
    // ב-B יום ה' רשום כ-40, כלומר הוא ניכה שם לבד ואינו תלוי ב-A.
    const out = dependentsLosingDeduction({
      coveredDaysAfterEdit: new Set(['mon']),
      dependents: [B],
    });
    expect(out.some((m) => m.includes('חמישי'))).toBe(false);
  });

  it('כמה תקנים תלויים - אזהרה לכל אחד ולכל יום', () => {
    const out = dependentsLosingDeduction({
      coveredDaysAfterEdit: new Set(),
      dependents: [
        B,
        { name: 'כהן רות - פרא גנים', detail: 'א:0 (פרא יסודי), ג:0 (פרא יסודי)' },
      ],
    });
    expect(out).toHaveLength(3);
  });

  it('תקן תלוי בלי חותמת קריאה מדולג ולא מנחשים עליו', () => {
    expect(
      dependentsLosingDeduction({
        coveredDaysAfterEdit: new Set(),
        dependents: [{ name: 'תקן ישן', detail: '' }],
      }),
    ).toEqual([]);
  });

  it('אין תקנים תלויים - אין אזהרות', () => {
    expect(
      dependentsLosingDeduction({ coveredDaysAfterEdit: new Set(['mon']), dependents: [] }),
    ).toEqual([]);
  });
});
