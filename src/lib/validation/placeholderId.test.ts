import { describe, it, expect } from 'vitest';
import { isPlaceholderId } from '../../lib/validation/placeholderId';
import { isValidIsraeliId } from '../../lib/validation/israeliId';
import { isValidForeignId } from '../../lib/validation/foreignId';

describe('isPlaceholderId', () => {
  it('פוסל ערך ריק ותווים זהים', () => {
    expect(isPlaceholderId('')).toBe(true);
    expect(isPlaceholderId('   ')).toBe(true);
    expect(isPlaceholderId('000000000')).toBe(true);
    expect(isPlaceholderId('0')).toBe(true);
    expect(isPlaceholderId('111111111')).toBe(true);
    expect(isPlaceholderId('AAAA')).toBe(true);
    expect(isPlaceholderId('aaaa')).toBe(true);
  });

  it('מתעלם מרווחים ומקפים לפני הבדיקה', () => {
    expect(isPlaceholderId('000-000-000')).toBe(true);
    expect(isPlaceholderId('0 0 0')).toBe(true);
  });

  it('לא פוסל מזהים אמיתיים', () => {
    expect(isPlaceholderId('054733068')).toBe(false);
    expect(isPlaceholderId('014373658')).toBe(false);
    expect(isPlaceholderId('AB1234567')).toBe(false);
  });
});

describe('000000000 נחסם בשני מסלולי הזיהוי', () => {
  it('ת.ז. ישראלית - למרות שהצ\'קסאם עובר', () => {
    // סכום הצ'קסאם של אפסים הוא 0 ומתחלק ב-10, ולכן בלי isPlaceholderId זה היה עובר.
    expect(isValidIsraeliId('000000000')).toBe(false);
    expect(isValidIsraeliId('0')).toBe(false);
    expect(isValidIsraeliId('00')).toBe(false);
  });

  it('זיהוי זר - כדי שתיבת "ללא ת.ז. ישראלית" לא תהיה דלת אחורית', () => {
    expect(isValidForeignId('000000000')).toBe(false);
    expect(isValidForeignId('0000')).toBe(false);
    expect(isValidForeignId('AAAA')).toBe(false);
  });

  it('ת.ז. תקינות עם אפסים מובילים ממשיכות לעבור', () => {
    // מהנתונים האמיתיים - ריפוד אפסים אינו סימן לממלא מקום.
    expect(isValidIsraeliId('014373658')).toBe(true);
    expect(isValidIsraeliId('054733068')).toBe(true);
    expect(isValidIsraeliId('039843008')).toBe(true);
  });

  it('זיהוי זר אמיתי ממשיך לעבור', () => {
    expect(isValidForeignId('UNA0447700')).toBe(true);
    expect(isValidForeignId('EP8027501')).toBe(true);
  });
});
