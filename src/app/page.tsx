import { listRecords } from '@/lib/airtable/client';
import { TABLES, MOSAD_FIELDS } from '@/lib/airtable/schema';
import { InstitutionsHome } from '@/components/InstitutionsHome';

async function getInstitutions() {
  if (process.env.AIRTABLE_MOCK === '1') {
    return [
      { id: 'recDEV', name: 'שתילים ירושלים (DEV)', token: 'dev', association: 'שתילים רשת חינוך' },
      { id: 'recDEV2', name: 'שתילים תל אביב (DEV)', token: 'dev', association: 'שתילים רשת חינוך' },
      { id: 'recDEV3', name: 'מיוחדים חיפה (DEV)', token: 'dev', association: 'אחר' },
    ];
  }

  try {
    const records = await listRecords(TABLES.mosadot, {
      fields: [MOSAD_FIELDS.name, MOSAD_FIELDS.formToken, MOSAD_FIELDS.association],
    });
    return records
      .map((rec) => ({
        id: rec.id,
        name: String(rec.fields[MOSAD_FIELDS.name] ?? ''),
        token: String(rec.fields[MOSAD_FIELDS.formToken] ?? ''),
        association: rec.fields[MOSAD_FIELDS.association]
          ? String(rec.fields[MOSAD_FIELDS.association])
          : undefined,
      }))
      .filter((i) => i.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  } catch {
    return [];
  }
}

export default async function Home() {
  const institutions = await getInstitutions();
  return <InstitutionsHome institutions={institutions} />;
}
