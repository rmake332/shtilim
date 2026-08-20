import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { buildPaymentRequestHtml } = await import('./paymentRequestDoc');

function row(overrides: Partial<Parameters<typeof buildPaymentRequestHtml>[0]['rows'][0]> = {}) {
  return {
    employeeName: 'דוד כהן',
    invoiceNumber: '7014',
    vatNumber: '123456782',
    bankName: 'לאומי (10)',
    bankBranch: '623',
    bankAccountNumber: '123456',
    budgetLine: 'פיזיותרפיה',
    amount: 3600,
    ...overrides,
  };
}

describe('buildPaymentRequestHtml', () => {
  it('includes exactly one <tr> per row (plus header + total)', () => {
    const html = buildPaymentRequestHtml({
      institutionName: 'מוסד לדוגמה',
      month: '2026-07',
      rows: [row(), row({ employeeName: 'שרה לוי', amount: 4500 })],
    });
    // 2 data rows + 1 header row + 1 total row = 4 <tr>
    expect(html.match(/<tr/g)).toHaveLength(4);
  });

  it('writes table columns in reverse order (RTL trap) so display order is right-to-left', () => {
    const html = buildPaymentRequestHtml({
      institutionName: 'מוסד לדוגמה',
      month: '2026-07',
      rows: [row()],
    });
    const headerOrder = ["אישור מח' שכר", 'סעיף תקציב', 'סכום', 'שם ספק', 'מספר עוסק', "מס' חשבונית", 'פרטי חשבון בנק', 'תאריך תשלום'];
    const positions = headerOrder.map((label) => html.indexOf(`<th>${label}</th>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it('sums the amount column correctly in the total row', () => {
    const html = buildPaymentRequestHtml({
      institutionName: 'מוסד לדוגמה',
      month: '2026-07',
      rows: [row({ amount: 3600 }), row({ amount: 4500 })],
    });
    expect(html).toContain('8,100 ₪');
  });

  it('merges the total row as colspan="2" + amount + colspan="5"', () => {
    const html = buildPaymentRequestHtml({
      institutionName: 'מוסד לדוגמה',
      month: '2026-07',
      rows: [row()],
    });
    expect(html).toContain('<td colspan="2" class="total-label">סה"כ</td>');
    expect(html).toContain('<td colspan="5"></td>');
  });

  it('formats the month in Hebrew', () => {
    const html = buildPaymentRequestHtml({ institutionName: 'מוסד לדוגמה', month: '2026-07', rows: [] });
    expect(html).toContain('יולי 2026');
  });

  it('combines the 3 bank fields into a single column', () => {
    const html = buildPaymentRequestHtml({
      institutionName: 'מוסד לדוגמה',
      month: '2026-07',
      rows: [row({ bankName: 'לאומי (10)', bankBranch: '623', bankAccountNumber: '123456' })],
    });
    expect(html).toContain('בנק לאומי (10), סניף 623, ח-ן 123456');
  });

  it('leaves "תאריך תשלום" and "אישור מח\' שכר" empty for every data row', () => {
    const html = buildPaymentRequestHtml({
      institutionName: 'מוסד לדוגמה',
      month: '2026-07',
      rows: [row(), row({ employeeName: 'שרה לוי' })],
    });
    // כל שורת נתונים מתחילה ב-<td></td> (אישור מח' שכר) ומסתיימת ב-<td></td> (תאריך תשלום)
    const dataRowMatches = html.match(/<tr>\n\s*<td><\/td>[\s\S]*?<td><\/td>\n\s*<\/tr>/g) ?? [];
    expect(dataRowMatches).toHaveLength(2);
  });

  it('escapes HTML-special characters in free-text fields', () => {
    const html = buildPaymentRequestHtml({
      institutionName: 'מוסד & שות"פ',
      month: '2026-07',
      rows: [row({ employeeName: 'כהן <בדיקה>' })],
    });
    expect(html).not.toContain('<בדיקה>');
    expect(html).toContain('&lt;בדיקה&gt;');
    expect(html).toContain('מוסד &amp; שות&quot;פ');
  });

  it('handles zero rows without throwing, with an empty total', () => {
    const html = buildPaymentRequestHtml({ institutionName: 'מוסד לדוגמה', month: '2026-07', rows: [] });
    expect(html).toContain('0 ₪');
    expect(html.match(/<tr/g)).toHaveLength(2); // header + total only
  });

  it('trims trailing zero decimals in the amount, matching formatNum style', () => {
    const html = buildPaymentRequestHtml({
      institutionName: 'מוסד לדוגמה',
      month: '2026-07',
      rows: [row({ amount: 3600.5 })],
    });
    expect(html).toContain('3,600.5 ₪');
  });
});
