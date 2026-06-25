/**
 * עיצוב מספר לתצוגה:
 * - מספר שלם → ללא נקודה (35)
 * - ספרה אחת משמעותית אחרי הנקודה → ספרה אחת (35.5)
 * - שתי ספרות ומעלה → 2 ספרות, מעוגל (35.55, 35.555→35.56)
 */
export function formatNum(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  // מעגלים ל-2 ספרות ואז מסירים אפסים מובילים מימין
  return value
    .toFixed(2)
    .replace(/\.?0+$/, '');
}
