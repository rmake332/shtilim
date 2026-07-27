import { describe, it, expect } from 'vitest';
import {
  COMBINED_WEEKLY_CAP_HOURS,
  combinedCapError,
  isCombinedCapExempt,
  isOverCombinedCap,
  positionsInAssociation,
  sumPositionHours,
  type PositionHours,
} from './weeklyTotal';

const ASSOC = 'שתילים רשת חינוך';
const OTHER_ASSOC = 'דרכי הלל';

function pos(hours: number, layer = 'יסודי', association = ASSOC): PositionHours {
  return { id: `rec${hours}${layer}${association}`, name: 'תפקיד', hours, layer, association };
}

describe('COMBINED_WEEKLY_CAP_HOURS', () => {
  it('התקרה המשולבת היא 42', () => {
    expect(COMBINED_WEEKLY_CAP_HOURS).toBe(42);
  });
});

describe('sumPositionHours', () => {
  it('מסכם שעות של כמה תקנים', () => {
    expect(sumPositionHours([pos(10), pos(12.5), pos(3)])).toBe(25.5);
  });

  it('מתעלם מערכים לא מספריים', () => {
    expect(
      sumPositionHours([{ id: 'r', name: 'x', hours: NaN, layer: '', association: ASSOC }, pos(8)]),
    ).toBe(8);
  });

  it('ללא תקנים - 0', () => {
    expect(sumPositionHours([])).toBe(0);
  });
});

describe('isOverCombinedCap', () => {
  it('בדיוק 42 אינו חריגה', () => {
    expect(isOverCombinedCap(12, 30)).toBe(false);
  });

  it('מעל 42 הוא חריגה', () => {
    expect(isOverCombinedCap(12.5, 30)).toBe(true);
  });

  it('סובלנות לשגיאות עיגול בשעות אקדמיות', () => {
    // 42 שהצטבר מחילוקים ב-45 עלול לצאת 42.0000000001
    expect(isOverCombinedCap(42.000000000001, 0)).toBe(false);
  });
});

describe('positionsInAssociation', () => {
  it('מחזיר רק תקנים באותה עמותה', () => {
    const list = [pos(10), pos(20, 'יסודי', OTHER_ASSOC), pos(5)];
    const result = positionsInAssociation(list, ASSOC);
    expect(result).toHaveLength(2);
    expect(sumPositionHours(result)).toBe(15);
  });

  it('מתעלם מרווחים מיותרים בשמות העמותה', () => {
    expect(positionsInAssociation([pos(10, 'יסודי', ` ${ASSOC} `)], ASSOC)).toHaveLength(1);
  });

  it('עמותה ריקה במוסד הנוכחי - אין תקנים בהיקף', () => {
    expect(positionsInAssociation([pos(10), pos(20)], '')).toEqual([]);
  });

  it('תקן ללא עמותה אינו נספר', () => {
    expect(positionsInAssociation([pos(10, 'יסודי', '')], ASSOC)).toEqual([]);
  });
});

describe('isCombinedCapExempt', () => {
  const none: PositionHours[] = [];

  it('עובד רגיל אינו פטור', () => {
    expect(isCombinedCapExempt({ layer: 'יסודי', twelveHourEmployment: false, positions: none })).toBe(false);
  });

  it('"העסקה 12 שעות" פוטר', () => {
    expect(isCombinedCapExempt({ layer: 'יסודי', twelveHourEmployment: true, positions: none })).toBe(true);
  });

  it('שכבת התקן הנוכחי פנימיה פוטרת', () => {
    expect(isCombinedCapExempt({ layer: 'פנימיה', twelveHourEmployment: false, positions: none })).toBe(true);
  });

  it('תקן קיים בפנימיה פוטר גם כשהתקן הנוכחי אינו פנימיה', () => {
    expect(
      isCombinedCapExempt({
        layer: 'יסודי',
        twelveHourEmployment: false,
        positions: [pos(20, 'יסודי'), pos(30, 'פנימיה')],
      }),
    ).toBe(true);
  });
});

describe('combinedCapError', () => {
  it('מתחת לתקרה - אין שגיאה', () => {
    expect(combinedCapError({ newHours: 10, positions: [pos(20)], exempt: false })).toBeNull();
  });

  it('בדיוק בתקרה - אין שגיאה', () => {
    expect(combinedCapError({ newHours: 22, positions: [pos(20)], exempt: false })).toBeNull();
  });

  it('חריגה - מחזיר הודעה עם הפירוט', () => {
    const msg = combinedCapError({ newHours: 25, positions: [pos(20)], exempt: false });
    expect(msg).toContain('42');
    expect(msg).toContain('20');
    expect(msg).toContain('25');
    expect(msg).toContain('45');
  });

  it('התקן החדש לבדו מעל התקרה - חריגה גם ללא תקנים קיימים', () => {
    expect(combinedCapError({ newHours: 45, positions: [], exempt: false })).not.toBeNull();
  });

  it('פטור - אין שגיאה גם בחריגה גדולה', () => {
    expect(combinedCapError({ newHours: 40, positions: [pos(52, 'פנימיה')], exempt: true })).toBeNull();
  });

  it('הודעה בלי קו מפריד ארוך', () => {
    const msg = combinedCapError({ newHours: 25, positions: [pos(20)], exempt: false })!;
    expect(msg).not.toContain('—');
  });
});
