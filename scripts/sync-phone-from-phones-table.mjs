#!/usr/bin/env node
/**
 * מתאים רשומות בין טבלת "טלפונים" (שדה ת.ז) לטבלת "רשימת עובדים" (שדה ת.ז.),
 * ומעתיק את "טלפון" -> "טלפון עובד" ברשומת העובד התואמת.
 *
 * הרצה יבשה (ברירת מחדל, לא כותב כלום):
 *   node scripts/sync-phone-from-phones-table.mjs
 * הרצה בפועל:
 *   node scripts/sync-phone-from-phones-table.mjs --apply
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '.env.local');
  const text = readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
if (!BASE_ID || !TOKEN) {
  throw new Error('AIRTABLE_BASE_ID / AIRTABLE_TOKEN חסרים ב-.env.local');
}

const TABLE_PHONES = 'tbla4gIX9FFssZZa7'; // טלפונים
const TABLE_EMPLOYEES = 'tbl2jY3mzY279TsxU'; // רשימת עובדים

const FIELD_PHONES_ID_NUM = 'fldrjYZIoGRPqFN16'; // ת.ז (בטבלת טלפונים)
const FIELD_PHONES_PHONE = 'fldOd3u6VftEvdh7Y'; // טלפון (בטבלת טלפונים)

const FIELD_EMP_ID_NUM = 'fldnr6x7loWne3CJI'; // ת.ז. (בטבלת רשימת עובדים)
const FIELD_EMP_PHONE = 'fld6rX2fmXeNM8fNU'; // טלפון עובד (בטבלת רשימת עובדים)

const APPLY = process.argv.includes('--apply');

const API_BASE = 'https://api.airtable.com/v0';

async function listAllRecords(tableId, fieldIds) {
  const records = [];
  let offset;
  do {
    const params = new URLSearchParams();
    params.set('returnFieldsByFieldId', 'true');
    params.set('pageSize', '100');
    fieldIds.forEach((f) => params.append('fields[]', f));
    if (offset) params.set('offset', offset);

    const res = await fetch(`${API_BASE}/${BASE_ID}/${tableId}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Airtable ${res.status} (${tableId}): ${text.slice(0, 300)}`);
    }
    const json = await res.json();
    records.push(...json.records);
    offset = json.offset;
  } while (offset);
  return records;
}

async function updateRecord(tableId, recordId, fields) {
  const res = await fetch(`${API_BASE}/${BASE_ID}/${tableId}/${recordId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Airtable PATCH ${res.status} (${tableId}/${recordId}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** מנרמל ת.ז להשוואה: מסיר רווחים ואפסים מובילים. */
function normalizeId(raw) {
  if (raw === undefined || raw === null) return '';
  return String(raw).trim().replace(/^0+(?=\d)/, '');
}

async function main() {
  console.log(`מצב: ${APPLY ? 'החלה בפועל (--apply)' : 'הרצה יבשה (dry-run)'}`);

  const [phoneRecords, employeeRecords] = await Promise.all([
    listAllRecords(TABLE_PHONES, [FIELD_PHONES_ID_NUM, FIELD_PHONES_PHONE]),
    listAllRecords(TABLE_EMPLOYEES, [FIELD_EMP_ID_NUM, FIELD_EMP_PHONE]),
  ]);

  console.log(`טבלת טלפונים: ${phoneRecords.length} רשומות`);
  console.log(`טבלת רשימת עובדים: ${employeeRecords.length} רשומות`);

  // בונה מפה מת.ז מנורמל -> טלפון (הרשומה האחרונה בטבלה מנצחת אם יש כפילות)
  const phoneByIdNum = new Map();
  for (const rec of phoneRecords) {
    const idNum = normalizeId(rec.fields[FIELD_PHONES_ID_NUM]);
    const phone = rec.fields[FIELD_PHONES_PHONE];
    if (!idNum || !phone) continue;
    phoneByIdNum.set(idNum, phone);
  }

  let matched = 0;
  let toUpdate = 0;
  let noMatch = 0;
  const updates = [];

  for (const emp of employeeRecords) {
    const idNum = normalizeId(emp.fields[FIELD_EMP_ID_NUM]);
    if (!idNum) {
      noMatch++;
      continue;
    }
    const phone = phoneByIdNum.get(idNum);
    if (!phone) {
      noMatch++;
      continue;
    }
    matched++;
    const currentPhone = emp.fields[FIELD_EMP_PHONE];
    if (currentPhone === phone) continue; // כבר מעודכן
    toUpdate++;
    updates.push({ recordId: emp.id, idNum, from: currentPhone ?? '(ריק)', to: phone });
  }

  console.log(`התאמות שנמצאו: ${matched}`);
  console.log(`רשומות עובד ללא התאמה בטבלת טלפונים: ${noMatch}`);
  console.log(`רשומות שדורשות עדכון טלפון: ${toUpdate}`);

  for (const u of updates) {
    console.log(`  ת.ז ${u.idNum}: "${u.from}" -> "${u.to}" (record ${u.recordId})`);
  }

  if (!APPLY) {
    console.log('\nזוהי הרצה יבשה בלבד — לא בוצע שום עדכון. הריצו עם --apply כדי לכתוב בפועל.');
    return;
  }

  console.log('\nמעדכן רשומות...');
  let done = 0;
  for (const u of updates) {
    await updateRecord(TABLE_EMPLOYEES, u.recordId, { [FIELD_EMP_PHONE]: u.to });
    done++;
    if (done % 20 === 0) console.log(`  עודכנו ${done}/${updates.length}`);
  }
  console.log(`הושלם: עודכנו ${done} רשומות.`);
}

main().catch((err) => {
  console.error('שגיאה:', err.message);
  process.exit(1);
});
