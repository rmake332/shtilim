/**
 * בניית קובץ CSV שנפתח נכון באקסל בעברית: BOM של UTF-8 בתחילתו (בלעדיו אקסל
 * מפענח את הקובץ בקידוד המקומי ומציג ג'יבריש), ושורות מופרדות ב-CRLF.
 */

function cell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  // מרכאות, פסיק או שורה חדשה מחייבים עטיפה במרכאות והכפלת מרכאות פנימיות.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(cell).join(','));
  return '﻿' + lines.join('\r\n');
}
