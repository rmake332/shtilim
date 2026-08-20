import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { createRecord, updateRecord } from '@/lib/airtable/client';
import { TABLES, EMPLOYEE_FIELDS } from '@/lib/airtable/schema';
import { fetchInvoiceBudgetRow } from '@/lib/invoice/budget';
import { listPositionsForBudgetRow, createPosition } from '@/lib/invoice/positions';
import { checkLiveAnnualAllocation } from '@/lib/invoice/budgetCheck';
import { findEmployeeByExactId } from '@/lib/employees';
import { logger } from '@/lib/logger';

/** GET /api/invoice/positions?token=&budgetRowId= - כל העובדים המוקצים תחת שורת תקציב חשבונית. */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const budgetRowId = req.nextUrl.searchParams.get('budgetRowId') || '';
  try {
    const row = await fetchInvoiceBudgetRow(gate.institution.mosadId, budgetRowId, gate.requestId);
    if (!row) return NextResponse.json({ ok: false, message: 'שורת תקציב לא נמצאה.' }, { status: 404 });

    const positions = await listPositionsForBudgetRow(budgetRowId, gate.requestId);
    return NextResponse.json({ ok: true, budgetRow: row, positions });
  } catch (e) {
    logger.error({ requestId: gate.requestId, budgetRowId, err: String(e) }, 'invoice positions list failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בטעינת עובדים מוקצים.' }, { status: 500 });
  }
}

interface NewEmployeeInput {
  name: string;
  tz: string;
  address: string;
  email: string;
  phone: string;
  maritalStatus: string;
  gender: string;
  birthDate: string;
}

/**
 * POST /api/invoice/positions - הקצאת עובד לשורת תקציב חשבונית (חדש: יצירה שנתית
 * ב"ניהול תקציב"). אם employeeId לא נשלח, מחפש עובד קיים לפי ת.ז. (dedupe),
 * ואם לא נמצא - יוצר עובד חדש. בודק חי מול המכסה החודשית והתעריף המקסימלי לפני כתיבה.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  const {
    budgetRowId,
    employeeId: givenEmployeeId,
    newEmployee,
    subRole,
    licenseNumber,
    bankName,
    bankBranch,
    bankAccountNumber,
    vatNumber,
    allocatedHours,
    agreedHourlyRate,
  } = body as {
    budgetRowId?: string;
    employeeId?: string;
    newEmployee?: NewEmployeeInput;
    subRole?: string;
    licenseNumber?: string;
    bankName?: string;
    bankBranch?: string;
    bankAccountNumber?: string;
    vatNumber?: string;
    allocatedHours?: number;
    agreedHourlyRate?: number;
  };

  if (!budgetRowId || !subRole || !Number.isFinite(allocatedHours) || !Number.isFinite(agreedHourlyRate)) {
    return NextResponse.json({ ok: false, message: 'חסרים נתונים להקצאה.' }, { status: 400 });
  }
  if ((allocatedHours as number) <= 0 || (agreedHourlyRate as number) <= 0) {
    return NextResponse.json({ ok: false, message: 'שעות ותעריף חייבים להיות גדולים מ-0.' }, { status: 400 });
  }
  if (!givenEmployeeId && !newEmployee?.tz) {
    return NextResponse.json({ ok: false, message: 'חסר עובד לשיוך.' }, { status: 400 });
  }
  if (!bankName?.trim() || !bankBranch?.trim() || !bankAccountNumber?.trim() || !vatNumber?.trim()) {
    return NextResponse.json({ ok: false, message: 'פרטי בנק ומספר עוסק הם שדות חובה.' }, { status: 400 });
  }

  try {
    const row = await fetchInvoiceBudgetRow(gate.institution.mosadId, budgetRowId, gate.requestId);
    if (!row) return NextResponse.json({ ok: false, message: 'שורת תקציב לא נמצאה.' }, { status: 404 });

    const check = await checkLiveAnnualAllocation(
      { budgetRowId, allocatedHours: allocatedHours as number, agreedHourlyRate: agreedHourlyRate as number },
      gate.requestId,
    );
    if (!check.ok) return NextResponse.json({ ok: false, message: check.message }, { status: 409 });

    let employeeId = givenEmployeeId ?? '';
    let employeeName = '';

    if (employeeId) {
      employeeName = String(body.employeeName || '');
    } else {
      // Defense-in-depth: never create a duplicate. If the ID already exists, reuse it.
      const existing = await findEmployeeByExactId(newEmployee!.tz, gate.requestId);
      if (existing) {
        employeeId = existing.id;
        employeeName = existing.name;
      } else {
        const created = await createRecord(
          TABLES.employees,
          {
            [EMPLOYEE_FIELDS.name]: newEmployee!.name,
            [EMPLOYEE_FIELDS.tz]: newEmployee!.tz,
            [EMPLOYEE_FIELDS.address]: newEmployee!.address,
            [EMPLOYEE_FIELDS.email]: newEmployee!.email,
            [EMPLOYEE_FIELDS.phone]: newEmployee!.phone,
            [EMPLOYEE_FIELDS.maritalStatus]: newEmployee!.maritalStatus,
            [EMPLOYEE_FIELDS.gender]: newEmployee!.gender,
            [EMPLOYEE_FIELDS.birthDate]: newEmployee!.birthDate,
            [EMPLOYEE_FIELDS.institution]: [gate.institution.mosadId],
          },
          gate.requestId,
        );
        employeeId = created.id;
        employeeName = newEmployee!.name;
      }
    }

    if (licenseNumber) {
      await updateRecord(
        TABLES.employees,
        employeeId,
        { [EMPLOYEE_FIELDS.licenseNumber]: Number(licenseNumber) },
        gate.requestId,
      );
    }

    const bankFields: Record<string, unknown> = {};
    if (bankName) bankFields[EMPLOYEE_FIELDS.bankName] = bankName;
    if (bankBranch) bankFields[EMPLOYEE_FIELDS.bankBranch] = bankBranch;
    if (bankAccountNumber) bankFields[EMPLOYEE_FIELDS.bankAccountNumber] = bankAccountNumber;
    if (vatNumber) bankFields[EMPLOYEE_FIELDS.vatNumber] = vatNumber;
    if (Object.keys(bankFields).length > 0) {
      await updateRecord(TABLES.employees, employeeId, bankFields, gate.requestId);
    }

    const position = await createPosition(
      {
        budgetRowId,
        employeeId,
        employeeName,
        subRole,
        allocatedHours: allocatedHours as number,
        agreedHourlyRate: agreedHourlyRate as number,
      },
      gate.requestId,
    );
    return NextResponse.json({ ok: true, position });
  } catch (e) {
    logger.error({ requestId: gate.requestId, budgetRowId, err: String(e) }, 'invoice position create failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בהקצאת העובד.' }, { status: 500 });
  }
}
