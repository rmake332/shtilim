import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { getRecord, updateRecord } from '@/lib/airtable/client';
import { TABLES, POSITION_FIELDS, EMPLOYEE_FIELDS, BUDGET_FIELDS } from '@/lib/airtable/schema';
import { existingSubRoleDocsFromFields } from '@/lib/employees';
import {
  isCanonicalSubRole,
  requiresLandbergApproval,
  requiresLicenseNumber,
  subRoleDocsFor,
} from '@/lib/subRole';
import { subRoleLinkFor } from '@/lib/subRoleTable';
import { logger } from '@/lib/logger';

const SUB_ROLE_FIX_HANDLED = 'טופל';

function strField(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) {
    const first = v[0];
    if (first == null) return '';
    if (typeof first === 'object' && 'name' in first) return String((first as { name: unknown }).name);
    return String(first);
  }
  if (typeof v === 'object' && 'name' in v) return String((v as { name: unknown }).name);
  return String(v);
}

function linkIds(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * POST /api/positions/[id]/fix-subrole
 *
 * השלמת תת-תפקיד קנוני לתקן שסומן "דורש תיקון", יחד עם מספר הרישיון הנגזר ממנו.
 * המסמכים עצמם עולים בנפרד דרך /api/upload-employee-doc לפני הקריאה הזו.
 *
 * מה הוא במפורש **לא** עושה, וזו כל הסיבה שהוא קיים בנפרד ממסלול העריכה המלא:
 * לא מריץ checkWeeklyTotal ולא checkLiveBudget, לא נוגע בשעות/מערכת/אופק, לא
 * קורא ל-notifySubmitWebhook, ולא מאפס submittedAt או updateStatus. מעבר של 155
 * תקנים דרך PATCH /api/positions/[id] היה שולח 155 webhooks ועלול היה להיחסם על
 * תקן תקין בגלל יתרת תקציב שהשתנתה מאז שהוזן.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  const positionId = params.id;
  if (!/^rec[A-Za-z0-9]{6,}$/.test(positionId)) {
    return NextResponse.json({ ok: false, message: 'מזהה תקן לא תקין.' }, { status: 400 });
  }

  const { subRole, licenseNumber, landbergApproval } = body as {
    subRole?: string;
    licenseNumber?: string;
    landbergApproval?: string;
  };
  const chosen = (subRole ?? '').trim();

  try {
    const position = await getRecord(TABLES.activePositions, positionId, gate.requestId);
    if (!position) return NextResponse.json({ ok: false, message: 'התקן לא נמצא.' }, { status: 404 });
    const pf = position.fields;

    // אימות בעלות: התקן חייב להשתייך למוסד שהטוקן פותר אליו. מסלול העריכה הקיים
    // מתעד את הפער הזה בהערה ולא אוכף אותו; הנקודה הזו סוגרת אותו לעצמה, באותו
    // פרדיקט שבו GET /api/positions מסנן את רשימת התקנים של המוסד.
    const mosadNames = Array.isArray(pf[POSITION_FIELDS.mosadNameText])
      ? (pf[POSITION_FIELDS.mosadNameText] as unknown[]).map((v) => String(v))
      : [strField(pf[POSITION_FIELDS.mosadNameText])];
    if (!mosadNames.includes(gate.institution.name)) {
      logger.warn({ requestId: gate.requestId, positionId }, 'fix-subrole rejected: position not in institution');
      return NextResponse.json({ ok: false, message: 'התקן אינו שייך למוסד זה.' }, { status: 403 });
    }

    // האם שורת התקציב של התקן בכלל מציגה תת-תפקיד. כשלא, הפעולה הנכונה היא
    // ניקוי הערך ולא בחירה מחדש (הערך זלג לשם מטקסט חופשי של שנה קודמת).
    const roleId = linkIds(pf[POSITION_FIELDS.roleLink])[0];
    let showsSubRole = false;
    if (roleId) {
      const budget = await getRecord(TABLES.budget, roleId, gate.requestId);
      showsSubRole = Boolean(budget?.fields[BUDGET_FIELDS.paraSubRoleList]);
    }

    if (!showsSubRole) {
      if (chosen) {
        return NextResponse.json(
          { ok: false, message: 'שורת התקציב של תקן זה אינה כוללת רשימת תת-תפקיד.' },
          { status: 400 },
        );
      }
      await updateRecord(
        TABLES.activePositions,
        positionId,
        {
          [POSITION_FIELDS.subRole]: null,
          [POSITION_FIELDS.subRoleLink]: [],
          [POSITION_FIELDS.subRoleFixStatus]: SUB_ROLE_FIX_HANDLED,
        },
        gate.requestId,
      );
      logger.info({ requestId: gate.requestId, positionId }, 'fix-subrole: cleared (budget row has no sub-role list)');
      return NextResponse.json({ ok: true, cleared: true });
    }

    if (!isCanonicalSubRole(chosen)) {
      return NextResponse.json({ ok: false, message: 'יש לבחור תת-תפקיד מהרשימה.' }, { status: 400 });
    }
    if (requiresLandbergApproval(chosen) && landbergApproval !== 'כן') {
      return NextResponse.json(
        { ok: false, message: 'לא ניתן לשמור ללא אישור של אפרת ולנדברג.' },
        { status: 400 },
      );
    }

    const employeeId = linkIds(pf[POSITION_FIELDS.employeeLink])[0] ?? '';
    const employee = employeeId ? await getRecord(TABLES.employees, employeeId, gate.requestId) : null;
    const employeeFields = employee?.fields ?? {};

    // אימות שרת אחרי העלאת המסמכים: לא מסמנים "טופל" כשעדיין חסר מסמך נדרש.
    // זו הנקודה שכל 59 התקנים עם וריאנט כתיב דילגו עליה בשקט.
    const onFile = new Set(existingSubRoleDocsFromFields(employeeFields));
    const missing = subRoleDocsFor(chosen).filter((d) => !onFile.has(d.fieldId));
    if (missing.length) {
      return NextResponse.json(
        { ok: false, message: `חסרים מסמכים: ${missing.map((d) => d.label).join(', ')}.` },
        { status: 400 },
      );
    }

    const license = (licenseNumber ?? '').trim();
    if (requiresLicenseNumber(chosen)) {
      const existingLicense = strField(employeeFields[EMPLOYEE_FIELDS.licenseNumber]);
      if (!license && !existingLicense) {
        return NextResponse.json({ ok: false, message: "יש להזין מס' רישיון." }, { status: 400 });
      }
      if (license && employeeId) {
        await updateRecord(
          TABLES.employees,
          employeeId,
          { [EMPLOYEE_FIELDS.licenseNumber]: license },
          gate.requestId,
        );
      }
    }

    await updateRecord(
      TABLES.activePositions,
      positionId,
      {
        [POSITION_FIELDS.subRole]: chosen,
        // dual-write: כל תיקון ממלא גם את הקישור לטבלת תת-תפקידים, כך שבסוף
        // 155 התיקונים השדה יהיה מלא והמעבר יהיה החלפת קריאה בלבד.
        [POSITION_FIELDS.subRoleLink]: (await subRoleLinkFor(chosen)) ?? [],
        [POSITION_FIELDS.subRoleFixStatus]: SUB_ROLE_FIX_HANDLED,
      },
      gate.requestId,
    );
    logger.info({ requestId: gate.requestId, positionId, subRole: chosen }, 'fix-subrole: position updated');
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error({ requestId: gate.requestId, positionId, err: String(e) }, 'fix-subrole failed');
    return NextResponse.json({ ok: false, message: 'שגיאה בשמירה. נסו שוב.' }, { status: 500 });
  }
}
