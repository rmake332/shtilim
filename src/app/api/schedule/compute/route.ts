import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { lookupOfek } from '@/lib/ofekCalc';
import { getPreviousYearHours } from '@/lib/previousYear';
import { sumExistingPositions, type ExistingHoursSum } from '@/lib/existingPositions';
import {
  isMotherPosition,
  jobPercent,
  buildOfekKey,
  severeDisabilityBonus,
  paraStaySplit,
} from '@/lib/schedule/ofek';
import { roundToHalf } from '@/lib/schedule/time';
import { logger } from '@/lib/logger';

/**
 * POST /api/schedule/compute
 * Body: { token, category, scheduleType, layer, ageHours, enteredHours,
 *         gender, maritalStatus, hasChildrenUnder14,
 *         paraBoard, severeDisabilityFlag, isBehaviorAnalyst,
 *         tz, institution, budgetRemaining }
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
    const ofekCategory = category === 'פרא רפואי' ? 'פרא' : category === 'הוראה' ? 'הוראה' : category;
    const layer: string = body.layer ?? '';
    const enteredHours = Number(body.enteredHours ?? 0);

    // Para: per-day ÷45 already done client-side; apply severe-disability bonus + half rounding.
    const bonus = severeDisabilityBonus({
      severeDisabilityFlag: Boolean(body.severeDisabilityFlag),
      paraBoard: Boolean(body.paraBoard),
      isBehaviorAnalyst: Boolean(body.isBehaviorAnalyst),
      finalLayer: layer,
      enteredHours,
    });
    const finalHours = roundToHalf(enteredHours + bonus);

    const pct = jobPercent(finalHours);
    const mother = isMotherPosition({
      gender: body.gender ?? '',
      maritalStatus: body.maritalStatus ?? '',
      hasChildrenUnder14: Boolean(body.hasChildrenUnder14),
      jobPercent: pct,
    });

    const key = buildOfekKey({
      layer,
      ageHours: body.ageHours ?? 0,
      motherPosition: mother,
      category: ofekCategory,
      totalHours: finalHours,
    });

    const ofek = await lookupOfek(key, gate.requestId);
    if (!ofek) {
      return NextResponse.json({
        ok: false,
        reason: 'ofek_not_found',
        message: 'אין מבנה שבוע עבודה בהתאם למערכת השעות שהוזנה',
        key,
        finalHours,
        bonus,
      });
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
    // Debug-only fields (surfaced in the UI while validating, hidden later).
    let existingDebug: ExistingHoursSum | null = null;
    let combinedKeyDebug: string | undefined;

    if (body.tz && !body.skipExisting) {
      const existing = await sumExistingPositions(
        { tz: String(body.tz), category, layer, excludePositionId: body.editPositionId ?? undefined },
        gate.requestId,
      );
      additionalRoles = existing.count;
      existingDebug = existing;
      if (existing.count > 0) {
        const combinedHours = finalHours + existing.frontalHours + existing.individualHours + existing.stayHours;
        const combinedPct = jobPercent(combinedHours);
        const combinedMother = isMotherPosition({
          gender: body.gender ?? '',
          maritalStatus: body.maritalStatus ?? '',
          hasChildrenUnder14: Boolean(body.hasChildrenUnder14),
          jobPercent: combinedPct,
        });
        const combinedKey = buildOfekKey({
          layer,
          ageHours: body.ageHours ?? 0,
          motherPosition: combinedMother,
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
        effectiveMother = combinedMother;
        effectiveKey = combinedKey;
        // Back out the other roles → values for the CURRENT position only.
        frontal = Math.max(0, combined.frontalHours - existing.frontalHours);
        individual = Math.max(0, combined.individualHours - existing.individualHours);
        stay = Math.max(0, combined.stayHours - existing.stayHours);
      }
    }

    // Stay split (applies to the current position's stay hours).
    const split = paraStaySplit({
      paraBoard: Boolean(body.paraBoard),
      layer,
      category,
      isBehaviorAnalyst: Boolean(body.isBehaviorAnalyst),
    });
    const teaching = category === 'הוראה';
    const stayInstitution = teaching || split === 'institution' ? stay : 0;
    const stayHome = !teaching && split === 'home' ? stay : 0;

    // Budget over-limit check (final > remaining → block).
    const budgetRemaining = Number(body.budgetRemaining ?? Infinity);
    const overBudget = finalHours > budgetRemaining;

    // Previous-year reduction check (warning + reason required).
    // Compare ALL current hours in the same category+institution (this role + existing roles)
    // against the previous year total. Only the comparison uses totalCurrentHours —
    // all ofek breakdowns remain based on finalHours for this role alone.
    let previousYear: number | null = null;
    if (body.tz && category && body.institution) {
      previousYear = await getPreviousYearHours(
        { tz: String(body.tz), category, institution: String(body.institution) },
        gate.requestId,
      );
    }
    const existingHoursSum = existingDebug
      ? existingDebug.frontalHours + existingDebug.individualHours + existingDebug.stayHours
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
        jobPercent: ofekRowForDisplay.jobPercent,
      },
      // ----- debug-only (for validation; hide later) -----
      debug: {
        ofekKey: key, // combination checked for the current position
        existingPositions: existingDebug, // hours found across the employee's other roles
        combinedKey: combinedKeyDebug, // combination checked for ALL positions together
        motherPosition: mother,
        jobPercent: pct,
      },
    });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'schedule compute failed');
    return NextResponse.json({ error: 'compute_failed' }, { status: 500 });
  }
}
