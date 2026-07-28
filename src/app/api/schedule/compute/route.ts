import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { lookupOfek, type OfekResult } from '@/lib/ofekCalc';
import { getPreviousYearHours } from '@/lib/previousYear';
import { sumExistingPositions, totalHours, type ExistingHoursSum } from '@/lib/existingPositions';
import {
  isMotherPosition,
  jobPercent,
  buildOfekKey,
  severeDisabilityBonus,
  paraStaySplit,
  ofekCategoryFor,
  motherPositionFromOfekRow,
  ofekRowHoursSum,
  type MotherEmployeeInput,
} from '@/lib/schedule/ofek';
import { roundToHalf } from '@/lib/schedule/time';
import { logger } from '@/lib/logger';

type MotherInput = MotherEmployeeInput;

type ResolvedOfek =
  | { ok: true; row: OfekResult; key: string; motherPosition: boolean; jobPercent: number }
  /** השליפה השנייה לא מצאה שורה — נחסם בדיוק כמו חוסר התאמה בשליפה הראשונה. */
  | { ok: false; key: string };

/**
 * בדיקה כפולה של משרת אם.
 *
 * השליפה הראשונה (`row`) שקטה ואינה מוצגת: היא רק מספקת את סכום השעות שהמחשבון
 * מחזיר בפועל (פרונטלי+פרטני+שהייה), שהוא היקף המשרה האמיתי של התקן. יחד עם
 * `otherScopeHours` - היקף יתר תקני העובד במערכת - נגזר אחוז המשרה הכולל, ולפיו
 * נקבע משרת אם הסופי. אם הוא התהפך מול הבדיקה הראשונה נשלפת שורה חדשה עם אותן
 * שעות ומשרת אם המעודכן. התוצאה השנייה היא הקובעת לתצוגה, לשמירה ולקישור לרשומה.
 */
async function resolveByOfekOutput(params: {
  row: OfekResult;
  key: string;
  motherPosition: boolean;
  keyParams: { layer: string; ageHours: number | string; category: string; totalHours: number };
  motherInput: MotherInput;
  /** היקף יתר תקני העובד (פרונטלי+פרטני+שהייה), 0 כשאין לו תקנים אחרים. */
  otherScopeHours: number;
  requestId?: string;
}): Promise<ResolvedOfek> {
  const { row, key, motherPosition, keyParams, motherInput, otherScopeHours, requestId } = params;
  const recheck = motherPositionFromOfekRow(row, motherInput, otherScopeHours);
  if (recheck.motherPosition === motherPosition) {
    return { ok: true, row, key, motherPosition, jobPercent: recheck.jobPercent };
  }
  const finalKey = buildOfekKey({ ...keyParams, motherPosition: recheck.motherPosition });
  const finalRow = await lookupOfek(finalKey, requestId);
  if (!finalRow) return { ok: false, key: finalKey };
  return {
    ok: true,
    row: finalRow,
    key: finalKey,
    motherPosition: recheck.motherPosition,
    // אחוז המשרה המוצג נגזר מהשורה הסופית, זו שהשעות שלה נשמרות לתקן.
    jobPercent: jobPercent(ofekRowHoursSum(finalRow) + otherScopeHours, motherInput.ageHours),
  };
}

/**
 * POST /api/schedule/compute
 * Body: { token, category, scheduleType, layer, ageHours, enteredHours,
 *         gender, maritalStatus, hasChildrenUnder14,
 *         paraBoard, severeDisabilityFlag, isBehaviorAnalyst,
 *         tz, budgetRemaining }
 *
 * Returns the ofek breakdown (frontal/individual/stay split), bonus, motherPosition,
 * jobPercent, and budget / previous-year warnings. Reuses the tested pure functions.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const gate = await gateByToken(req, body.token);
  if (gate instanceof NextResponse) return gate;

  try {
    const category: string = body.category ?? '';
    const scheduleType: string = body.scheduleType ?? '';
    // קטגוריית האופק נגזרת מסוג מערכת השעות ולא מהקטגוריה: תקן בקטגוריית "פרא רפואי"
    // שסוג מערכת השעות שלו "רגיל" אינו נמדד באופק כלל. הקטגוריה משמשת רק לאיתור
    // תפקידים קיימים ולהשוואה לשנה קודמת, שם ההצלבה היא ברמת הקטגוריה.
    const ofekCategory = ofekCategoryFor(scheduleType);
    if (!ofekCategory) {
      return NextResponse.json({
        ok: false,
        reason: 'ofek_not_applicable',
        message: 'סוג מערכת השעות של התקן אינו נמדד במחשבון אופק חדש',
      });
    }
    const layer: string = body.layer ?? '';
    const fatherPosition = Boolean(body.fatherPosition);
    const enteredHours = Number(body.enteredHours ?? 0) + (fatherPosition ? 2 : 0);

    // Para: per-day ÷45 already done client-side; only half rounding here.
    // תוספת לקות קשה היא נתון סטטי לידיעת המשתמש בלבד: היא אינה נכנסת למחשבון
    // אופק חדש ואינה מנצלת מהתקן, ולכן אינה מתווספת ל-finalHours.
    const bonus = severeDisabilityBonus({
      severeDisabilityFlag: Boolean(body.severeDisabilityFlag),
      enteredHours,
    });
    const finalHours = roundToHalf(enteredHours);

    // שעות גיל נכנסות גם למפתח המחשבון וגם לבסיס אחוז המשרה (36 בניכוי שעות גיל).
    const ageHours = body.ageHours ?? 0;
    const motherInput: MotherInput = {
      gender: body.gender ?? '',
      maritalStatus: body.maritalStatus ?? '',
      hasChildrenUnder14: Boolean(body.hasChildrenUnder14),
      ageHours,
    };

    // ----- כל תקני העובד במערכת -----
    // משרת אם נקבעת לפי היקף ההעסקה הכולל של העובד, ולכן הסריקה רצה כבר לקראת
    // הבדיקה הראשונה ולא רק לקראת המשולבת. skipExisting מדלג על מפתח "כל
    // התפקידים" בלבד, לא על איסוף השעות.
    let existing: ExistingHoursSum | null = null;
    if (body.tz) {
      existing = await sumExistingPositions(
        {
          tz: String(body.tz),
          category,
          layer,
          mosadId: gate.institution.mosadId,
          excludePositionId: body.editPositionId ?? undefined,
        },
        gate.requestId,
      );
    }
    // היקף יתר תקני העובד: פרונטלי+פרטני+שהייה, בתקני פרא / הוראה / הוראה - לוח פרא בלבד.
    const otherScopeHours = existing ? totalHours(existing.allRoles) : 0;
    const otherPositionsCount = existing ? existing.allRoles.count : 0;

    const notFoundResponse = (k: string) =>
      NextResponse.json({
        ok: false,
        reason: 'ofek_not_found',
        message: 'אין מבנה שבוע עבודה בהתאם למערכת השעות שהוזנה',
        key: k,
        finalHours,
        bonus,
      });

    // בדיקה ראשונה — שקטה: משרת אם לפי השעות שהוזנו בתוספת יתר תקני העובד,
    // רק כדי לקבל שורה מהמחשבון.
    const preliminaryPct = jobPercent(finalHours + otherScopeHours, ageHours);
    const preliminaryMother = isMotherPosition({ ...motherInput, jobPercent: preliminaryPct });
    const preliminaryKey = buildOfekKey({
      layer,
      ageHours,
      motherPosition: preliminaryMother,
      category: ofekCategory,
      totalHours: finalHours,
    });

    const preliminaryRow = await lookupOfek(preliminaryKey, gate.requestId);
    if (!preliminaryRow) return notFoundResponse(preliminaryKey);

    // בדיקה שנייה — הקובעת: היקף התקן הנוכחי לפי פלט המחשבון, ועליו יתר התקנים.
    const resolved = await resolveByOfekOutput({
      row: preliminaryRow,
      key: preliminaryKey,
      motherPosition: preliminaryMother,
      keyParams: { layer, ageHours, category: ofekCategory, totalHours: finalHours },
      motherInput,
      otherScopeHours,
      requestId: gate.requestId,
    });
    if (!resolved.ok) return notFoundResponse(resolved.key);
    const ofek = resolved.row;
    const key = resolved.key;
    // משרת אם היא עובדה ברמת העובד: נקבעת פעם אחת ומוזרקת גם למפתח המשולב, כדי
    // שהתוצאה לא תתהפך בין בדיקה 1 לבדיקה 3.
    const mother = resolved.motherPosition;
    const pct = resolved.jobPercent;
    /** היקף המשרה של כל תקני העובד יחד, לרבות התקן המוזן כעת. */
    const totalScopeHours = ofekRowHoursSum(ofek) + otherScopeHours;

    // ----- additional existing positions (7ו / 8ד) -----
    // If the employee already has active positions in the same category+layer, the ofek
    // breakdown must be computed for the COMBINED hours, then the other roles backed out.
    let frontal = ofek.frontalHours;
    let individual = ofek.individualHours;
    let stay = ofek.stayHours;
    let additionalRoles = 0;
    let ofekAllRecordId: string | undefined;
    let ofekRowForDisplay = ofek;
    let effectiveKey = key; // combined key when other roles exist, single-role key otherwise
    // Debug-only fields (surfaced in the UI while validating, hidden later).
    const existingDebug: ExistingHoursSum | null = existing;
    let combinedKeyDebug: string | undefined;

    if (existing && !body.skipExisting) {
      additionalRoles = existing.count;
      if (existing.count > 0) {
        // גנים: כולל שהייה בחישוב משולב. יסודי/חטיבה: שהייה לא נספרת בניצול.
        const isGanim = layer === 'גנים';
        const existingStayForCombined = isGanim ? existing.stayHours : 0;
        const combinedHours = finalHours + existing.frontalHours + existing.individualHours + existingStayForCombined;
        // משרת אם כבר הוכרעה על היקף כל התקנים, ולכן היא נכנסת למפתח כמות שהיא.
        const combinedKey = buildOfekKey({
          layer,
          ageHours,
          motherPosition: mother,
          category: ofekCategory,
          totalHours: combinedHours,
        });
        combinedKeyDebug = combinedKey;
        const combined = await lookupOfek(combinedKey, gate.requestId);
        if (!combined) {
          return NextResponse.json({
            ok: false,
            reason: 'ofek_combined_not_found',
            message: 'סכום השעות בכל המוסדות אינו עומד בתנאי מבנה עבודה שבועי של אופק חדש',
            effectiveKey: combinedKey,
            combinedKey,
            debug: {
              ofekKey: key,
              existingPositions: existing,
              combinedKey,
              motherPosition: mother,
              jobPercent: pct,
            },
          });
        }
        ofekAllRecordId = combined.recordId;
        ofekRowForDisplay = combined;
        effectiveKey = combinedKey;
        // Back out the other roles → values for the CURRENT position only.
        frontal = Math.max(0, combined.frontalHours - existing.frontalHours);
        individual = Math.max(0, combined.individualHours - existing.individualHours);
        // גנים: חסר שהייה קיימת. יסודי/חטיבה: שהייה לא נכנסה ל-combined, אז combined.stayHours = שהייה של התפקיד הנוכחי בלבד.
        stay = isGanim
          ? Math.max(0, combined.stayHours - existing.stayHours)
          : combined.stayHours;
      }
    }

    // Stay split (applies to the current position's stay hours).
    const split = paraStaySplit({
      paraBoard: Boolean(body.paraBoard),
      layer,
      category: ofekCategory,
      isBehaviorAnalyst: Boolean(body.isBehaviorAnalyst),
    });
    const teaching = ofekCategory === 'הוראה';
    const stayInstitution = teaching || split === 'institution' ? stay : 0;
    const stayHome = !teaching && split === 'home' ? stay : 0;

    // Budget over-limit check (final > remaining → block).
    const budgetRemaining = Number(body.budgetRemaining ?? Infinity);
    const overBudget = finalHours > budgetRemaining;

    // Previous-year reduction check (warning + reason required).
    // Both sides are scoped to קטגוריה + מוסד + שכבה: current hours = this role plus the
    // employee's other roles IN THIS INSTITUTION, previous year = the matching תקנים תשפו rows.
    // Ofek deliberately stays cross-institution, so it keeps using the unscoped totals.
    let previousYear: number | null = null;
    if (body.tz && category) {
      previousYear = await getPreviousYearHours(
        { tz: String(body.tz), category, mosadName: gate.institution.name, layer },
        gate.requestId,
      );
    }
    const sameInstitution = existingDebug?.sameInstitution;
    const existingHoursSum = sameInstitution
      ? sameInstitution.frontalHours + sameInstitution.individualHours + sameInstitution.stayHours
      : 0;
    const totalCurrentHours = finalHours + existingHoursSum;
    const reducedVsLastYear = previousYear != null && totalCurrentHours < previousYear;

    return NextResponse.json({
      ok: true,
      key,
      effectiveKey,
      finalHours,
      bonus,
      jobPercent: pct,
      motherPosition: mother,
      // היקף כל תקני העובד, שממנו נגזרו אחוז המשרה ומשרת אם.
      otherPositionsHours: otherScopeHours,
      otherPositionsCount,
      totalScopeHours,
      frontalHours: frontal,
      individualHours: individual,
      stayHoursInstitution: stayInstitution,
      stayHoursHome: stayHome,
      ofekRecordId: ofek.recordId,
      ofekAllRolesRecordId: ofekAllRecordId,
      additionalRoles,
      overBudget,
      budgetRemaining,
      previousYear,
      totalCurrentHours,
      reducedVsLastYear,
      // Ofek-salary row shown to the user: combined row when other roles exist, single-role row otherwise.
      ofekRow: {
        frontalHours: ofekRowForDisplay.frontalHours,
        individualHours: ofekRowForDisplay.individualHours,
        stayHours: ofekRowForDisplay.stayHours,
        totalHours: ofekRowForDisplay.totalHours,
        // שדה אחוז המשרה באיירטייבל שמור כשבר (0.7813), ולכן מומר לאחוז לפני
        // התצוגה. שורות פרא מגיעות בלי אחוז משרה, ואז מוצג האחוז המחושב, שהוא
        // כבר באחוזים.
        jobPercent: ofekRowForDisplay.jobPercent ? ofekRowForDisplay.jobPercent * 100 : pct,
      },
      // ----- debug-only (for validation; hide later) -----
      debug: {
        ofekKey: key, // combination checked for the current position
        existingPositions: existingDebug, // hours found across the employee's other roles
        combinedKey: combinedKeyDebug, // combination checked for ALL positions together
        motherPosition: mother,
        jobPercent: pct,
        // הבדיקה הראשונה השקטה — לא מוצגת, נשמרת לצורכי אימות בלבד.
        preliminaryKey,
        preliminaryMotherPosition: preliminaryMother,
        preliminaryJobPercent: preliminaryPct,
      },
    });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'schedule compute failed');
    return NextResponse.json({ error: 'compute_failed' }, { status: 500 });
  }
}
