import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, POSITION_FIELDS, SCHEDULE_FIELDS } from '@/lib/airtable/schema';
import type { Day } from '@/lib/schedule/time';
import { toMinutes } from '@/lib/schedule/time';

/**
 * GET /api/schedule/overlap-check
 * ?token=&tz=&week[sun]=08:00-14:00,15:00-17:00&week[mon]=...&excludePositionId=
 *
 * Checks whether the submitted weekly schedule overlaps with any existing
 * active position for the same employee (identified by ת.ז.).
 *
 * Returns:
 *   { ok: true }                          — no overlaps
 *   { ok: false, overlaps: OverlapItem[] } — list of clashing positions
 */

// Includes מוצ"ש (regular schedules); absent days simply have no shifts to compare.
const DAYS: Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'motzash'];

interface TimeRange {
  in: string;  // "HH:MM"
  out: string; // "HH:MM"
}

interface OverlapItem {
  positionId: string;
  positionName: string; // role title + institution name
  day: Day;
  dayLabel: string;
  newShift: TimeRange;
  existingShift: TimeRange;
}

const DAY_LABELS: Record<Day, string> = {
  sun: 'ראשון',
  mon: 'שני',
  tue: 'שלישי',
  wed: 'רביעי',
  thu: 'חמישי',
  fri: 'שישי',
  motzash: 'מוצ״ש',
};

function secsToHHMM(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fieldVal(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'number') return secsToHHMM(v); // Airtable duration fields: seconds from midnight
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return fieldVal(v[0]);
  if (typeof v === 'object' && 'name' in (v as Record<string, unknown>))
    return String((v as Record<string, unknown>).name);
  return String(v);
}

function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  const aIn = toMinutes(a.in);
  const aOut = toMinutes(a.out);
  const bIn = toMinutes(b.in);
  const bOut = toMinutes(b.out);
  if (aIn === null || aOut === null || bIn === null || bOut === null) return false;
  if (aIn >= aOut || bIn >= bOut) return false; // incomplete shift
  return aIn < bOut && bIn < aOut;
}

export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  const { searchParams } = req.nextUrl;
  const tz = searchParams.get('tz') ?? '';
  if (!tz) return NextResponse.json({ error: 'missing_tz' }, { status: 400 });

  const excludePositionId = searchParams.get('excludePositionId') ?? undefined;

  // Parse the submitted week: week[sun]=HH:MM-HH:MM,HH:MM-HH:MM ...
  const newWeek: Record<Day, TimeRange[]> = {} as Record<Day, TimeRange[]>;
  for (const day of DAYS) {
    const raw = searchParams.get(`week[${day}]`) ?? '';
    if (!raw) { newWeek[day] = []; continue; }
    newWeek[day] = raw.split(',').map((segment) => {
      const [inn, out] = segment.split('-');
      return { in: inn?.trim() ?? '', out: out?.trim() ?? '' };
    }).filter((r) => r.in && r.out);
  }

  const hasAnyNewShift = DAYS.some((d) => newWeek[d].length > 0);
  if (!hasAnyNewShift) {
    // No schedule to check against — pass through.
    return NextResponse.json({ ok: true, overlaps: [] });
  }

  try {
    const escaped = escapeFormulaValue(tz);
    const formula = `FIND("${escaped}", {${POSITION_FIELDS.tzLookup}})`;
    const records = await listRecords(
      TABLES.activePositions,
      { filterByFormula: formula, maxRecords: 50 },
      gate.requestId,
    );

    const overlaps: OverlapItem[] = [];

    for (const rec of records) {
      if (excludePositionId && rec.id === excludePositionId) continue;
      if (fieldVal(rec.fields[POSITION_FIELDS.prevYearStatus]) === 'כן') continue;

      const roleTitle = fieldVal(rec.fields[POSITION_FIELDS.roleTitleText]);
      const mosadName = fieldVal(rec.fields[POSITION_FIELDS.mosadNameText]);
      const positionName = [roleTitle, mosadName].filter(Boolean).join(' — ');

      for (const day of DAYS) {
        const dayFields = SCHEDULE_FIELDS[day];
        const newShifts = newWeek[day];
        if (newShifts.length === 0) continue;

        // Read up to 3 existing shifts for this day from the position record.
        const existingShifts: TimeRange[] = [];
        for (let i = 0; i < dayFields.in.length; i++) {
          const inVal = fieldVal(rec.fields[dayFields.in[i]]);
          const outVal = fieldVal(rec.fields[dayFields.out[i]]);
          if (inVal && outVal) existingShifts.push({ in: inVal, out: outVal });
        }

        for (const newShift of newShifts) {
          for (const existingShift of existingShifts) {
            if (rangesOverlap(newShift, existingShift)) {
              overlaps.push({
                positionId: rec.id,
                positionName,
                day,
                dayLabel: DAY_LABELS[day],
                newShift,
                existingShift,
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: overlaps.length === 0, overlaps });
  } catch {
    return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
  }
}
