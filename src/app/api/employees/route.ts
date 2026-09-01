import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { upsertEmployee } from '@/lib/saveEmployee';
import { isUnderEmploymentAge, type EmployeeData } from '@/lib/formTypes';
import { isValidIsraeliId } from '@/lib/validation/israeliId';
import { isValidForeignId } from '@/lib/validation/foreignId';
import { logger } from '@/lib/logger';

/**
 * POST /api/employees
 * שומרת את פרטי העובד ל"רשימת עובדים" מיד בסיום שלב פרטי העובד, לפני שנבחר תפקיד
 * ולפני שנוצר תקן - כדי שהמידע לא ילך לאיבוד כשהמזכירה נוטשת את הטופס באמצע.
 *
 * אידמפוטנטית: אם ת.ז. כבר קיימת בטבלה מוחזרת הרשומה הקיימת (מעודכנת) במקום ליצור
 * שנייה. זו גם שכבת ההגנה האחרונה מפני כפילויות - בדיקת הכפילות בצד הלקוח יכולה
 * להיכשל ברשת, כאן זה לא יכול לקרות.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  const employee = body.employee as EmployeeData | undefined;
  if (!employee) return NextResponse.json({ ok: false, message: 'חסרים נתונים.' }, { status: 400 });

  const tzOk = employee.noIsraeliId ? isValidForeignId(employee.tz) : isValidIsraeliId(employee.tz);
  if (!tzOk) {
    return NextResponse.json(
      { ok: false, message: employee.noIsraeliId ? 'מספר זיהוי לא תקין.' : 'ת.ז. לא תקינה.' },
      { status: 400 },
    );
  }
  if (!employee.name?.trim()) {
    return NextResponse.json({ ok: false, message: 'חסר שם העובד.' }, { status: 400 });
  }
  // מתחת לגיל 14 - חסימה חוקית; אין ליצור לו רשומה גם אם הלקוח שלח בכל זאת.
  if (isUnderEmploymentAge(employee.birthDate)) {
    return NextResponse.json(
      { ok: false, message: 'חל איסור חוקי להעסקת נוער תחת גיל 14.' },
      { status: 400 },
    );
  }

  try {
    const { employeeId, created, matchedByTz, matchedName } = await upsertEmployee(
      { employee, institutionMosadId: gate.institution.mosadId },
      gate.requestId,
    );
    return NextResponse.json({ ok: true, employeeId, created, matchedByTz, matchedName });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'employee save failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בשמירת פרטי העובד.' }, { status: 500 });
  }
}
