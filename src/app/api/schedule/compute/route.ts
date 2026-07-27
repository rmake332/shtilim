import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { lookupOfek, type OfekResult } from '@/lib/ofekCalc';
import { getPreviousYearHours } from '@/lib/previousYear';
import { sumExistingPositions, type ExistingHoursSum } from '@/lib/existingPositions';
import {
  isMotherPosition,
  jobPercent,
  buildOfekKey,
  severeDisabilityBonus,
  paraStaySplit,
  ofekCategoryFor,
  motherPositionFromOfekRow,
  ofekRowHoursSum,
  type MotherPositionInput,
} from '@/lib/schedule/ofek';
import { roundToHalf } from '@/lib/schedule/time';
import { logger } from '@/lib/logger';

type MotherInput = Omit<MotherPositionInput, 'jobPercent'>;

type ResolvedOfek =
  | { ok: true; row: OfekResult; key: string; motherPosition: boolean; jobPercent: number }
  /** השליפה השנייה לא מצאה שורה — נחסם בדיוק כמו חוסר התאמה בשליפה הראשונה. */
  | { ok: false; key: string };

/**
 * בדיקה כפולה של משרת אם בתקני פרא.
 *
 * השליפה הראשונה (`row`) שקטה ואינה מוצגת: היא רק מספקת את סכום השעות שהמחשבון
 * מחזיר בפועל (פרונטלי+פרטני+שהייה), שממנו נגזר אחוז המשרה האמיתי. לפיו נקבע
 * משרת אם הסופי, ואם הוא התהפך מול הבדיקה הראשונה נשלפת שורה חדשה עם אותן שעות
 * ומשרת אם המעודכן. התוצאה השנייה היא הקובעת לתצוגה, לשמירה ולקישור לרשומת האופק.
 */
async function resolveByOfekOutput(params: {
  row: OfekResult;
  key: string;
  motherPosition: boolean;
  keyParams: { layer: string; ageHours: number | string; category: string; totalHours: number };
  motherInput: MotherInput;
  requestId?: string;
}): Promise<ResolvedOfek> {
  const { row, key, motherPosition, keyParams, motherInput, requestId } = params;
  const recheck = motherPositionFromOfekRow(row, motherInput);
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
    jobPercent: jobPercent(ofekRowHoursSum(finalRow)),
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

    const motherInput: MotherInput = {
      gender: body.gender ?? '',
      maritalStatus: body.maritalStatus ?? '',
      hasChildrenUnder14: Boolean(body.hasChildrenUnder14),
    };
    const ageHours = body.ageHours ?? 0;
    // פרא בלבד: משרת אם נקבע בבדיקה שנייה לפי הפלט של המחשבון (ראו resolveByOfekOutput).
    const recheckMother = ofekCategory === 'פרא';

    const notFoundResponse = (k: string) =>
      NextResponse.json({
        ok: false,
        reason: 'ofek_not_found',
        message: 'אין מבנה שבוע עבודה בהתאם למערכת השעות שהוזנה',
        key: k,
        finalHours,
        bonus,
      });

    // בדיקה ראשונה — שקטה: משרת אם לפי השעות שהוזנו, רק כדי לקבל שורה מהמחשבון.
    const preliminaryPct = jobPercent(finalHours);
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

    // בדיקה שנייה — הקובעת: משרת אם מחושב מחדש לפי סכום השעות שחזר מהמחשבון.
    let ofek = preliminaryRow;
    let key = preliminaryKey;
    let mother = preliminaryMother;
    let pct = preliminaryPct;
    if (recheckMother) {
      const resolved = await resolveByOfekOutput({
        row: preliminaryRow,
        key: preliminaryKey,
        motherPosition: preliminaryMother,
        keyParams: { layer, ageHours, category: ofekCategory, totalHours: finalHours },
        motherInput,
        requestId: gate.requestId,
      });
      if (!resolved.ok) return notFoundResponse(resolved.key);
      ofek = resolved.row;
      key = resolved.key;
      mother = resolved.motherPosition;
      pct = resolved.jobPercent;
    }

    // ----- additional existing positions (7ו / 8ד) -----
    // If the employee already has active positions in the same category+layer, the ofek
    // breakdown must be computed for the COMBINED hours, then the other roles backed out.
    let frontal = ofek.frontalHours;
    let individual = ofek.individualHours;
    let stay = ofek.stayHours;
    let additionalRoles = 0;
    let ofekAllRecordId: string | undefined;
    let ofekRowForDisplay = ofek;
    let effectiveMother = mother;
    let effectiveKey = key; // combined key when other roles exist, single-role key otherwise
    let effectivePct = pct; // job% for the current position — overridden to combined% when other roles exist
    // Debug-only fields (surfaced in the UI while validating, hidden later).
    let existingDebug: ExistingHoursSum | null = null;
    let combinedKeyDebug: string | undefined;
    let preliminaryCombinedKeyDebug: string | undefined;

    if (body.tz && !body.skipExisting) {
      const existing = await sumExistingPositions(
        {
          tz: String(body.tz),
          category,
          layer,
          mosadId: gate.institution.mosadId,
          excludePositionId: body.editPositionId ?? undefined,
        },
        gate.requestId,
      );
      additionalRoles = existing.count;
      existingDebug = existing;
      if (existing.count > 0) {
        // גנים: כולל שהייה בחישוב משולב. יסודי/חטיבה: שהייה לא נספרת בניצול.
        const isGanim = layer === 'גנים';
        const existingStayForCombined = isGanim ? existing.stayHours : 0;
        const combinedHours = finalHours + existing.frontalHours + existing.individualHours + existingStayForCombined;
        const preliminaryCombinedPct = jobPercent(combinedHours);
        const preliminaryCombinedMother = isMotherPosition({
          ...motherInput,
          jobPercent: preliminaryCombinedPct,
        });
        const preliminaryCombinedKey = buildOfekKey({
          layer,
          ageHours,
          motherPosition: preliminaryCombinedMother,
          category: ofekCategory,
          totalHours: combinedHours,
        });
        combinedKeyDebug = preliminaryCombinedKey;
        preliminaryCombinedKeyDebug = preliminaryCombinedKey;
        const combinedNotFound = (k: string) =>
          NextResponse.json({
            ok: false,
            reason: 'ofek_combined_not_found',
            message: 'סכום השעות בכל המוסדות אינו עומד בתנאי מבנה עבודה שבועי של אופק חדש',
            effectiveKey: k,
            combinedKey: k,
            debug: {
              ofekKey: key,
              existingPositions: existing,
              combinedKey: k,
              motherPosition: mother,
              jobPercent: pct,
            },
          });

        // בדיקה ראשונה שקטה על סכום כל התפקידים.
        const preliminaryCombined = await lookupOfek(preliminaryCombinedKey, gate.requestId);
        if (!preliminaryCombined) return combinedNotFound(preliminaryCombinedKey);

        // בדיקה שנייה הקובעת — גם כאן משרת אם נגזר מהפלט של המחשבון.
        let combined = preliminaryCombined;
        let combinedKey = preliminaryCombinedKey;
        let combinedMother = preliminaryCombinedMother;
        let combinedPct = preliminaryCombinedPct;
        if (recheckMother) {
          const resolved = await resolveByOfekOutput({
            row: preliminaryCombined,
            key: preliminaryCombinedKey,
            motherPosition: preliminaryCombinedMother,
            keyParams: { layer, ageHours, category: ofekCategory, totalHours: combinedHours },
            motherInput,
            requestId: gate.requestId,
          });
          if (!resolved.ok) return combinedNotFound(resolved.key);
          combined = resolved.row;
          combinedKey = resolved.key;
          combinedMother = resolved.motherPosition;
          combinedPct = resolved.jobPercent;
          combinedKeyDebug = resolved.key;
        }
        ofekAllRecordId = combined.recordId;
        ofekRowForDisplay = combined;
        effectiveMother = combinedMother;
        effectiveKey = combinedKey;
        effectivePct = combinedPct;
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
      jobPercent: effectivePct,
      motherPosition: effectiveMother,
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
        // שורות פרא בטבלת המחשבון מגיעות בלי אחוז משרה, ואז מוצג האחוז המחושב.
        jobPercent: ofekRowForDisplay.jobPercent || effectivePct,
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
        preliminaryCombinedKey: preliminaryCombinedKeyDebug,
      },
    });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'schedule compute failed');
    return NextResponse.json({ error: 'compute_failed' }, { status: 500 });
  }
}
