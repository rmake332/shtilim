import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { gateByToken } from '@/lib/apiGate';
import { listRecords, escapeFormulaValue } from '@/lib/airtable/client';
import { TABLES, POSITION_FIELDS } from '@/lib/airtable/schema';
import { logger } from '@/lib/logger';

export interface PositionSummary {
  id: string;
  employeeName: string;
  roleTitle: string;
  category: string;
  subRole: string;
  weeklyHours: number;
  frontalHours: number;
  individualHours: number;
  stayHoursInstitution: number;
  stayHoursHome: number;
  submittedAt: string;
}

function strField(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) {
    const first = v[0];
    if (first == null) return '';
    if (typeof first === 'object' && first !== null && 'name' in first) return String((first as { name: unknown }).name);
    return String(first);
  }
  if (typeof v === 'object' && v !== null && 'name' in v) return String((v as { name: unknown }).name);
  return String(v);
}

/**
 * GET /api/positions?token=
 * Returns all active positions for the institution resolved from the token.
 * Uses lookup text fields (employeeNameText, roleTitleText) to avoid extra round-trips.
 */
export async function GET(req: NextRequest) {
  const gate = await gateByToken(req);
  if (gate instanceof NextResponse) return gate;

  try {
    const safeName = escapeFormulaValue(gate.institution.name);
    const records = await listRecords(
      TABLES.activePositions,
      {
        filterByFormula: `FIND("${safeName}",ARRAYJOIN({${POSITION_FIELDS.mosadNameText}}))>0`,
        fields: [
          POSITION_FIELDS.employeeNameText,
          POSITION_FIELDS.roleTitleText,
          POSITION_FIELDS.category,
          POSITION_FIELDS.subRole,
          POSITION_FIELDS.weeklyHours,
          POSITION_FIELDS.frontalHours,
          POSITION_FIELDS.individualHours,
          POSITION_FIELDS.stayHours,
          POSITION_FIELDS.stayHoursHome,
          POSITION_FIELDS.submittedAt,
        ],
        maxRecords: 200,
      },
      gate.requestId,
    );

    const positions: PositionSummary[] = records.map((r) => {
      const f = r.fields;
      const categoryRaw = f[POSITION_FIELDS.category];
      const category = Array.isArray(categoryRaw) ? strField(categoryRaw[0]) : strField(categoryRaw);

      return {
        id: r.id,
        employeeName: strField(f[POSITION_FIELDS.employeeNameText]),
        roleTitle: strField(f[POSITION_FIELDS.roleTitleText]),
        category,
        subRole: strField(f[POSITION_FIELDS.subRole]),
        weeklyHours: Number(f[POSITION_FIELDS.weeklyHours]) || 0,
        frontalHours: Number(f[POSITION_FIELDS.frontalHours]) || 0,
        individualHours: Number(f[POSITION_FIELDS.individualHours]) || 0,
        stayHoursInstitution: Number(f[POSITION_FIELDS.stayHours]) || 0,
        stayHoursHome: Number(f[POSITION_FIELDS.stayHoursHome]) || 0,
        submittedAt: strField(f[POSITION_FIELDS.submittedAt]),
      };
    });

    return NextResponse.json({ positions });
  } catch (e) {
    logger.error({ requestId: gate.requestId, err: String(e) }, 'list positions failed');
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
