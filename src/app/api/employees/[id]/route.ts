import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { getEmployeeById } from '@/lib/employees';
import { updateRecord } from '@/lib/airtable/client';
import { TABLES, EMPLOYEE_FIELDS } from '@/lib/airtable/schema';
import { logger } from '@/lib/logger';
import type { EmployeeData } from '@/lib/formTypes';

/**
 * PATCH /api/employees/[id]
 * Immediately saves edited employee fields to רשימת עובדים.
 * Called when the secretary clicks "סיום עריכה" in EmployeeStep.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  const { employee } = body as { employee: EmployeeData };
  if (!employee) return NextResponse.json({ ok: false, message: 'חסרים נתונים.' }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if (employee.name)          fields[EMPLOYEE_FIELDS.name]          = employee.name;
  if (employee.address)       fields[EMPLOYEE_FIELDS.address]       = employee.address;
  if (employee.email)         fields[EMPLOYEE_FIELDS.email]         = employee.email;
  if (employee.phone)         fields[EMPLOYEE_FIELDS.phone]         = employee.phone;
  if (employee.maritalStatus) fields[EMPLOYEE_FIELDS.maritalStatus] = employee.maritalStatus;
  if (employee.gender)        fields[EMPLOYEE_FIELDS.gender]        = employee.gender;
  if (employee.birthDate)     fields[EMPLOYEE_FIELDS.birthDate]     = employee.birthDate;

  try {
    logger.info({ requestId: gate.requestId, employeeId: params.id }, 'patching employee record');
    await updateRecord(TABLES.employees, params.id, fields, gate.requestId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'patch employee failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בשמירת פרטי העובד.' }, { status: 500 });
  }
}

/**
 * GET /api/employees/[id]?token=...
 * Full employee details for the editable detail form (returned only after explicit selection).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;
  try {
    const employee = await getEmployeeById(params.id, gate.requestId);
    if (!employee) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ employee });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'get employee failed');
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
