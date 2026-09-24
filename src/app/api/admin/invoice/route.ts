import { NextRequest, NextResponse } from 'next/server';
import { gateAdmin } from '@/lib/adminAuth';
import { listRecords } from '@/lib/airtable/client';
import { TABLES, MOSAD_FIELDS } from '@/lib/airtable/schema';
import { fetchAllInvoiceBudgetRows } from '@/lib/invoice/budget';
import { listAllPositions } from '@/lib/invoice/positions';
import { listAllReports, type InvoiceMonthlyReport } from '@/lib/invoice/reports';
import { monthlyHoursFor } from '@/lib/invoice/rates';
import { logger } from '@/lib/logger';

const MONTH_RE = /^\d{4}-\d{2}$/;

/** שורה אחת בטבלת המנהל: עובד בתקן, ואם נבחר חודש - הדיווח שלו לאותו חודש. */
export interface AdminInvoiceRow {
  key: string;
  mosadId: string;
  mosadName: string;
  budgetRowId: string;
  roleTitle: string;
  employeeName: string;
  subRole: string;
  isDoctor: boolean;
  inactive: boolean;
  weeklyAllocatedHours: number;
  agreedHourlyRate: number;
  month: string;
  /** null כשאין דיווח לחודש. */
  reportedHours: number | null;
  totalPay: number | null;
  invoiceNumber: string;
  monthLocked: boolean;
  mergedPdfUrl: string;
}

/**
 * GET /api/admin/invoice?month=YYYY-MM - כל נתוני תקני החשבונית בכל המוסדות, לממשק
 * המנהל. עם month: כל עובד בכל תקן + הדיווח שלו לחודש (או ריק). בלי month: כל
 * הדיווחים מכל החודשים. הסינון לפי מוסד נעשה בלקוח (הנתונים קטנים).
 */
export async function GET(req: NextRequest) {
  const gate = gateAdmin(req);
  if (gate instanceof NextResponse) return gate;

  const month = req.nextUrl.searchParams.get('month') || '';
  if (month && !MONTH_RE.test(month)) {
    return NextResponse.json({ ok: false, message: 'חודש לא תקין.' }, { status: 400 });
  }

  try {
    const [budgetRows, positions, reports, mosadot] = await Promise.all([
      fetchAllInvoiceBudgetRows(gate.requestId),
      listAllPositions(gate.requestId),
      listAllReports(month || undefined, gate.requestId),
      listRecords(TABLES.mosadot, { fields: [MOSAD_FIELDS.name] }, gate.requestId),
    ]);

    const mosadNames = new Map(mosadot.map((m) => [m.id, String(m.fields[MOSAD_FIELDS.name] ?? '')]));
    const rowsById = new Map(budgetRows.map((r) => [r.id, r]));
    const positionsById = new Map(positions.map((p) => [p.id, p]));

    // חודש נעול = לפחות דיווח אחד של שורת התקציב באותו חודש סומן כהושלם.
    const lockedMonths = new Set<string>();
    for (const rep of reports) {
      const p = positionsById.get(rep.positionId);
      if (p && rep.monthlyTransferDocGenerated) lockedMonths.add(`${p.budgetRowId}|${rep.month}`);
    }

    const toRow = (p: (typeof positions)[number], rep: InvoiceMonthlyReport | undefined, m: string): AdminInvoiceRow | null => {
      const b = rowsById.get(p.budgetRowId);
      if (!b) return null;
      return {
        key: `${p.id}|${m}`,
        mosadId: b.mosadId,
        mosadName: mosadNames.get(b.mosadId) || '',
        budgetRowId: b.id,
        roleTitle: b.title,
        employeeName: p.employeeName,
        subRole: p.isDoctor ? 'רופא' : p.subRole,
        isDoctor: p.isDoctor,
        inactive: p.inactive,
        weeklyAllocatedHours: p.allocatedHours,
        agreedHourlyRate: p.agreedHourlyRate,
        month: m,
        reportedHours: rep ? rep.reportedHours : null,
        totalPay: rep ? rep.totalPay : null,
        invoiceNumber: rep?.invoiceNumber ?? '',
        monthLocked: m ? lockedMonths.has(`${b.id}|${m}`) : false,
        mergedPdfUrl: rep?.mergedPdfUrl ?? '',
      };
    };

    let rows: AdminInvoiceRow[];
    if (month) {
      const byPosition = new Map(reports.map((r) => [r.positionId, r]));
      rows = positions.map((p) => toRow(p, byPosition.get(p.id), month)).filter((r): r is AdminInvoiceRow => !!r);
    } else {
      rows = reports
        .map((rep) => {
          const p = positionsById.get(rep.positionId);
          return p ? toRow(p, rep, rep.month) : null;
        })
        .filter((r): r is AdminInvoiceRow => !!r);
    }
    rows.sort((a, b) =>
      a.mosadName.localeCompare(b.mosadName, 'he') ||
      a.roleTitle.localeCompare(b.roleTitle, 'he') ||
      b.month.localeCompare(a.month) ||
      a.employeeName.localeCompare(b.employeeName, 'he'),
    );

    const budgetRowsOut = budgetRows
      .map((b) => ({
        id: b.id,
        title: b.title,
        mosadId: b.mosadId,
        mosadName: mosadNames.get(b.mosadId) || '',
        weeklyHoursQuota: b.weeklyHoursQuota,
        monthHoursQuota: month ? monthlyHoursFor(b.weeklyHoursQuota, month) : null,
        tariffMonthly: b.tariffMonthly,
        totalAllocatedHours: b.totalAllocatedHours,
        allocationLocked: b.allocationLocked,
      }))
      .sort((a, b) => a.mosadName.localeCompare(b.mosadName, 'he') || a.title.localeCompare(b.title, 'he'));

    return NextResponse.json({ ok: true, month, rows, budgetRows: budgetRowsOut });
  } catch (e) {
    logger.error({ requestId: gate.requestId, month, err: String(e) }, 'admin invoice data failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בטעינת הנתונים.' }, { status: 500 });
  }
}
