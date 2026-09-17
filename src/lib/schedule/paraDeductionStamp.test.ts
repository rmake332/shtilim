import { describe, it, expect } from 'vitest';
import {
  buildParaDeductionStamp,
  parseParaDeductionDetail,
  deductedOnDay,
  PARA_DEDUCTION_STATUS,
  NOT_APPLICABLE_STAMP,
} from './paraDeductionStamp';

describe('buildParaDeductionStamp', () => {
  it('כל הימים נוכו', () => {
    expect(
      buildParaDeductionStamp([
        { day: 'mon', minutes: 40 },
        { day: 'wed', minutes: 40 },
      ]),
    ).toEqual({ status: PARA_DEDUCTION_STATUS.deducted, detail: 'ב:40, ד:40' });
  });

  it('יום אחד דולג - ניכוי חלקי, עם שם התקן החוסם', () => {
    expect(
      buildParaDeductionStamp([
        { day: 'mon', minutes: 0, blockedBy: 'הדרכה פרא' },
        { day: 'wed', minutes: 40 },
      ]),
    ).toEqual({ status: PARA_DEDUCTION_STATUS.partial, detail: 'ב:0 (הדרכה פרא), ד:40' });
  });

  it('כל הימים דולגו', () => {
    expect(buildParaDeductionStamp([{ day: 'mon', minutes: 0, blockedBy: 'פרא רפואי' }])).toEqual({
      status: PARA_DEDUCTION_STATUS.skipped,
      detail: 'ב:0 (פרא רפואי)',
    });
  });

  it('ניכוי 35 ביום קצר', () => {
    expect(buildParaDeductionStamp([{ day: 'sun', minutes: 35 }]).detail).toBe('א:35');
  });

  it('בלי ימי עבודה - לא נדרש', () => {
    expect(buildParaDeductionStamp([])).toEqual(NOT_APPLICABLE_STAMP);
  });

  it('מוצ"ש אינו נכנס לחותמת - הזנת פרא רצה על א-ו בלבד', () => {
    expect(
      buildParaDeductionStamp([
        { day: 'motzash', minutes: 40 },
        { day: 'mon', minutes: 40 },
      ]).detail,
    ).toBe('ב:40');
  });

  it('פסיקים וסוגריים בשם התקן החוסם מנוקים, כדי שהפרסור לא יישבר', () => {
    const stamp = buildParaDeductionStamp([
      { day: 'mon', minutes: 0, blockedBy: 'הדרכה פרא, צלילים (יסודי)' },
      { day: 'wed', minutes: 40 },
    ]);
    expect(stamp.detail).toBe('ב:0 (הדרכה פרא צלילים יסודי), ד:40');
    expect(parseParaDeductionDetail(stamp.detail)?.get('wed')).toBe(40);
  });
});

describe('parseParaDeductionDetail', () => {
  it('round-trip של חותמת שנבנתה', () => {
    const { detail } = buildParaDeductionStamp([
      { day: 'mon', minutes: 0, blockedBy: 'הדרכה פרא' },
      { day: 'wed', minutes: 40 },
      { day: 'thu', minutes: 35 },
    ]);
    const parsed = parseParaDeductionDetail(detail);
    expect(parsed?.get('mon')).toBe(0);
    expect(parsed?.get('wed')).toBe(40);
    expect(parsed?.get('thu')).toBe(35);
  });

  it('טקסט ריק או חסר מחזיר null', () => {
    expect(parseParaDeductionDetail('')).toBeNull();
    expect(parseParaDeductionDetail(null)).toBeNull();
    expect(parseParaDeductionDetail('   ')).toBeNull();
  });

  it('טקסט חופשי שנכתב ידנית מחזיר null ולא ניחוש', () => {
    expect(parseParaDeductionDetail('לא ברור מה קרה כאן')).toBeNull();
    expect(parseParaDeductionDetail('נוכה בכל הימים')).toBeNull();
  });

  it('שם תקן שנראה כמו אות יום אינו נקרא כיום', () => {
    // הסוגריים אינם אחרי פסיק, ולכן ה"ה:5" שבתוכם אינו טוקן יום.
    const parsed = parseParaDeductionDetail('ב:0 (תקן ה:5 לדוגמה), ד:40');
    expect(parsed?.get('mon')).toBe(0);
    expect(parsed?.get('wed')).toBe(40);
    expect(parsed?.has('thu')).toBe(false);
  });
});

describe('deductedOnDay', () => {
  const stamp = buildParaDeductionStamp([
    { day: 'mon', minutes: 0, blockedBy: 'הדרכה פרא' },
    { day: 'wed', minutes: 40 },
  ]);

  it('יום שנוכה', () => {
    expect(deductedOnDay({ status: stamp.status, detail: stamp.detail }, 'wed')).toBe(true);
  });

  it('יום שדולג', () => {
    expect(deductedOnDay({ status: stamp.status, detail: stamp.detail }, 'mon')).toBe(false);
  });

  it('יום שהתקן אינו עובד בו', () => {
    expect(deductedOnDay({ status: stamp.status, detail: stamp.detail }, 'thu')).toBe(false);
  });

  it('"לא נדרש" - תקן שאינו פרא לעולם לא ניכה', () => {
    expect(deductedOnDay(NOT_APPLICABLE_STAMP, 'mon')).toBe(false);
  });

  it('בלי חותמת מחזיר null, כדי שהקורא ייפול לגזירה', () => {
    expect(deductedOnDay({ status: null, detail: null }, 'mon')).toBeNull();
    expect(deductedOnDay({ status: 'נוכה', detail: 'טקסט שנערך ידנית' }, 'mon')).toBeNull();
  });
});
