import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { fetchInvoiceBudgetRow } from '@/lib/invoice/budget';
import { listPositionsForBudgetRow, getPosition } from '@/lib/invoice/positions';
import { listReportsForPositions, upsertReport } from '@/lib/invoice/reports';
import { checkLiveMonthlyQuota } from '@/lib/invoice/budgetCheck';
import { logger } from '@/lib/logger';

const MONTH_RE = /^\d{4}-\d{2}$/;

/** GET /api/invoice/reports?token=&budgetRowId=&month=YYYY-MM - דיווחי כל העובדים לחודש נתון. */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const budgetRowId = req.nextUrl.searchParams.get('budgetRowId') || '';
  const month = req.nextUrl.searchParams.get('month') || '';
  if (!MONTH_RE.test(month)) {
    return NextResponse.json({ ok: false, message: 'חודש לא תקין.' }, { status: 400 });
  }

  try {
    const row = await fetchInvoiceBudgetRow(gate.institution.mosadId, budgetRowId, gate.requestId);
    if (!row) return NextResponse.json({ ok: false, message: 'שורת תקציב לא נמצאה.' }, { status: 404 });

    const positions = await listPositionsForBudgetRow(budgetRowId, gate.requestId);
    const reports = await listReportsForPositions(positions.map((p) => p.id), month, gate.requestId);
    return NextResponse.json({ ok: true, budgetRow: row, positions, reports });
  } catch (e) {
    logger.error({ requestId: gate.requestId, budgetRowId, month, err: String(e) }, 'invoice reports list failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בטעינת דיווחים.' }, { status: 500 });
  }
}

/**
 * POST /api/invoice/reports - דיווח/עדכון שעות בפועל לעובד חשבונית אחד בחודש נתון.
 * בודק חי מול המכסה החודשית המשותפת, שעות ההקצאה של העובד, והתעריף המוסכם שלו.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  const { positionId, month, reportedHours, reportedRate, invoiceNumber } = body as {
    positionId?: string;
    month?: string;
    reportedHours?: number;
    reportedRate?: number;
    invoiceNumber?: string;
  };

  if (!positionId || !month || !MONTH_RE.test(month)) {
    return NextResponse.json({ ok: false, message: 'חסרים נתוני דיווח.' }, { status: 400 });
  }
  if (!Number.isFinite(reportedHours) || !Number.isFinite(reportedRate) || (reportedHours as number) <= 0 || (reportedRate as number) <= 0) {
    return NextResponse.json({ ok: false, message: 'שעות ותעריף חייבים להיות גדולים מ-0.' }, { status: 400 });
  }

  try {
    const position = await getPosition(positionId, gate.requestId);
    if (!position) return NextResponse.json({ ok: false, message: 'הקצאה לא נמצאה.' }, { status: 404 });
    const row = await fetchInvoiceBudgetRow(gate.institution.mosadId, position.budgetRowId, gate.requestId);
    if (!row) return NextResponse.json({ ok: false, message: 'הקצאה לא נמצאה.' }, { status: 404 });

    const check = await checkLiveMonthlyQuota(
      {
        budgetRowId: position.budgetRowId,
        positionId,
        month,
        reportedHours: reportedHours as number,
        reportedRate: reportedRate as number,
      },
      gate.requestId,
    );
    if (!check.ok) return NextResponse.json({ ok: false, message: check.message }, { status: 409 });

    const report = await upsertReport(
      {
        positionId,
        positionLabel: position.employeeName || positionId,
        month,
        reportedHours: reportedHours as number,
        reportedRate: reportedRate as number,
        invoiceNumber: invoiceNumber || '',
      },
      gate.requestId,
    );
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    logger.error({ requestId: gate.requestId, positionId, month, err: String(e) }, 'invoice report upsert failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בשמירת הדיווח.' }, { status: 500 });
  }
}
