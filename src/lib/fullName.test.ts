import { describe, it, expect } from 'vitest';
import { splitFullName, joinFullName } from '../lib/formTypes';

describe('splitFullName / joinFullName', () => {
  it('מפצל על הרווח הראשון: המילה הראשונה היא שם המשפחה', () => {
    expect(splitFullName('גולדברג ברוך יוסף')).toEqual({ lastName: 'גולדברג', firstName: 'ברוך יוסף' });
    expect(splitFullName('כהן שרה')).toEqual({ lastName: 'כהן', firstName: 'שרה' });
  });

  it('שם במילה אחת - שם משפחה בלבד', () => {
    expect(splitFullName('לפקוביץ')).toEqual({ lastName: 'לפקוביץ', firstName: '' });
    expect(splitFullName('')).toEqual({ lastName: '', firstName: '' });
    expect(splitFullName('   ')).toEqual({ lastName: '', firstName: '' });
  });

  it('מאחד בסדר שם משפחה ואז שם פרטי', () => {
    expect(joinFullName('כהן', 'שרה')).toBe('כהן שרה');
    expect(joinFullName(' כהן ', ' שרה ')).toBe('כהן שרה');
  });

  it('חלק ריק אינו מוסיף רווח', () => {
    expect(joinFullName('כהן', '')).toBe('כהן');
    expect(joinFullName('', 'שרה')).toBe('שרה');
    expect(joinFullName('', '')).toBe('');
  });

  /**
   * התכונה הקריטית: בטבלה יש שמות גם בסדר ההפוך ("מרים הורביץ" לצד "הורביץ מרים").
   * הפיצול עלול לנחש לא נכון מי שם המשפחה, אבל טעינה ושמירה חוזרת חייבות להחזיר
   * בדיוק את הערך המאוחסן - אחרת כל פתיחת טופס של עובד קיים הייתה משנה לו את השם.
   */
  it('פיצול ואיחוד מחזירים את המקור', () => {
    for (const name of [
      'הורביץ מרים', 'מרים הורביץ', 'גולדברג ברוך יוסף', 'MABRHTU TADESE',
      'לפקוביץ', 'טליאס נתן שמעון', 'אידלסון שרה גוליה',
    ]) {
      const { lastName, firstName } = splitFullName(name);
      expect(joinFullName(lastName, firstName)).toBe(name);
    }
  });

  it('רווחים כפולים מנורמלים לרווח יחיד', () => {
    const { lastName, firstName } = splitFullName('כהן   שרה');
    expect(joinFullName(lastName, firstName)).toBe('כהן שרה');
  });
});
