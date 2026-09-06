import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { activeSubRoleOptions } from '@/lib/subRoleTable';
import { logger } from '@/lib/logger';

/**
 * GET /api/sub-roles?token=
 *
 * רשימת תת-התפקידים הפעילים מטבלת "תת-תפקידים", עם התנאים הנגזרים מכל ערך
 * (אישור ולנדברג, מספר רישיון, מסמכי הסמכה). מחליף את השליפה שהייתה דרך
 * /api/field-choices מה-Meta API של השדה, שהחזירה גם 40 אופציות שנוצרו בטעות
 * ע"י typecast ולא נשאה שום מידע על התנאים.
 *
 * אותה רשימה בדיוק נאכפת בשמירה ב-POST /api/positions/[id]/fix-subrole, כך
 * שערך שהתפריט מציע הוא תמיד ערך שאפשר לשמור.
 */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  try {
    const subRoles = await activeSubRoleOptions();
    return NextResponse.json({ subRoles });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'sub-roles fetch failed');
    return NextResponse.json({ error: 'fetch_failed' }, { status: 500 });
  }
}
