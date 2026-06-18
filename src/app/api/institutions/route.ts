import { NextResponse } from 'next/server';
import { listRecords } from '@/lib/airtable/client';
import { TABLES, MOSAD_FIELDS } from '@/lib/airtable/schema';

export interface InstitutionItem {
  id: string;
  name: string;
  token: string;
  association?: string;
}

export async function GET() {
  // Mock mode
  if (process.env.AIRTABLE_MOCK === '1') {
    return NextResponse.json({
      institutions: [
        { id: 'recDEV', name: 'שתילים ירושלים (DEV)', token: 'dev', association: 'שתילים רשת חינוך' },
        { id: 'recDEV2', name: 'שתילים תל אביב (DEV)', token: 'dev', association: 'שתילים רשת חינוך' },
      ] satisfies InstitutionItem[],
    });
  }

  let records;
  try {
    records = await listRecords(TABLES.mosadot, {
      fields: [MOSAD_FIELDS.name, MOSAD_FIELDS.formToken, MOSAD_FIELDS.association],
    });
  } catch {
    return NextResponse.json({ error: 'שגיאה בטעינת מוסדות' }, { status: 500 });
  }

  const institutions: InstitutionItem[] = records
    .map((rec) => {
      const name  = String(rec.fields[MOSAD_FIELDS.name]  ?? '');
      const token = String(rec.fields[MOSAD_FIELDS.formToken] ?? '');
      const assoc = rec.fields[MOSAD_FIELDS.association]
        ? String(rec.fields[MOSAD_FIELDS.association])
        : undefined;
      return { id: rec.id, name, token, association: assoc };
    })
    .filter((i) => i.name && i.token)
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));

  return NextResponse.json({ institutions });
}
