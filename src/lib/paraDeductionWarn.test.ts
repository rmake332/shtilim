import { describe, it, expect, vi } from 'vitest';
import type { Day } from './schedule/time';

vi.mock('server-only', () => ({}));
vi.mock('../lib/airtable/client', () => ({
  getRecord: vi.fn(),
  listRecords: vi.fn(),
  updateRecord: vi.fn(),
  escapeFormulaValue: (s: string) => s,
}));

const { planDependentUpdates } = await import('../lib/paraDeductionWrite');

/**
 * התרחיש: תקן A ניכה ביום ב', תקן B דילג באותו יום ונשען עליו. עכשיו עורכים את
 * A ומשנים את מערכת השעות שלו. השעות של B לעולם אינן משתנות כאן; השאלות היחידות
 * הן על מי הוא נשען עכשיו, והאם נשאר מישהו שמנכה עבורו.
 */
const A = 'recPositionA';
const C = 'recPositionC';

/** B מדלג ביום ב' ומנכה בעצמו ביום ה'. */
const B = {
  id: 'recPositionB',
  name: 'לוי שרה - פרא רפואי יסודי - שתילים',
  detail: 'ב:0 (פרא רפואי חטיבה), ה:40',
};

const coverage = (entries: [Day, string][]) => new Map(entries);

describe('planDependentUpdates', () => {
  it('A ממשיך לנכות ביום ב - אין דרישת עדכון, והקישור נשאר על A', () => {
    const [u] = planDependentUpdates({
      coverage: coverage([['mon', A]]),
      dependents: [B],
    });
    expect(u.orphanDays).toEqual([]);
    expect(u.leansOn).toEqual([A]);
    expect(u.warning).toBe('');
    expect(u.reason).toBe('');
  });

  it('תקן שלישי לקח את הניכוי - הקישור מופנה אליו, בלי אזהרת שווא', () => {
    // בלי ההפניה הזו הקישור היה נשאר על A, ומחיקת A בעתיד הייתה מייצרת התראה
    // על B למרות ש-B מכוסה לגמרי.
    const [u] = planDependentUpdates({
      coverage: coverage([['mon', C]]),
      dependents: [B],
    });
    expect(u.orphanDays).toEqual([]);
    expect(u.leansOn).toEqual([C]);
    expect(u.warning).toBe('');
  });

  it('אף אחד לא מנכה ביום ב - B מסומן כדורש עדכון והקישור מתרוקן', () => {
    const [u] = planDependentUpdates({
      coverage: coverage([['wed', A]]),
      dependents: [B],
    });
    expect(u.orphanDays).toEqual(['mon']);
    expect(u.leansOn).toEqual([]);
    expect(u.reason).toContain('שני');
    expect(u.warning).toContain('לוי שרה');
    expect(u.warning).toContain('שני');
  });

  it('יום שהתקן ניכה בו בעצמו אינו נחשב תלות', () => {
    // יום ה' רשום ב-B כ-40, כלומר הוא ניכה שם לבד. גם כשאין לו כיסוי במפה,
    // הוא אינו יתום ואינו מייצר דרישת עדכון.
    const [u] = planDependentUpdates({
      coverage: coverage([['mon', A]]),
      dependents: [B],
    });
    expect(u.orphanDays).not.toContain('thu');
  });

  it('תלות מפוצלת: יום אחד עבר לתקן אחר, יום שני נשאר יתום', () => {
    const [u] = planDependentUpdates({
      coverage: coverage([['sun', C]]),
      dependents: [{ id: 'recD', name: 'כהן רות - פרא גנים', detail: 'א:0 (פרא יסודי), ג:0 (פרא יסודי)' }],
    });
    expect(u.orphanDays).toEqual(['tue']);
    expect(u.leansOn).toEqual([C]);
    expect(u.reason).toContain('שלישי');
    expect(u.reason).not.toContain('ראשון');
  });

  it('כמה תקנים תלויים - שורה לכל אחד', () => {
    const out = planDependentUpdates({
      coverage: coverage([]),
      dependents: [B, { id: 'recD', name: 'כהן רות - פרא גנים', detail: 'א:0 (פרא יסודי)' }],
    });
    expect(out).toHaveLength(2);
    expect(out.every((u) => u.orphanDays.length > 0)).toBe(true);
  });

  it('תקן תלוי בלי חותמת קריאה מדולג ולא מנחשים עליו', () => {
    expect(
      planDependentUpdates({
        coverage: coverage([]),
        dependents: [{ id: 'recOld', name: 'תקן ישן', detail: '' }],
      }),
    ).toEqual([]);
  });

  it('אין תקנים תלויים - אין מה לעדכן', () => {
    expect(planDependentUpdates({ coverage: coverage([['mon', A]]), dependents: [] })).toEqual([]);
  });
});
