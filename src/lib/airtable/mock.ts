import type { AirtableRecord } from './client';
import { TABLES, EMPLOYEE_FIELDS, BUDGET_FIELDS, SYMBOL_FIELDS, OFEK_FIELDS, POSITION_FIELDS } from './schema';

// An existing active position for מיכל אהרוני (029876547) in פרא רפואי / יסודי,
// so the "additional roles" combined ofek path is testable.
const MOCK_EXISTING_POSITIONS: AirtableRecord[] = [
  {
    id: 'recExistingPos1',
    fields: {
      [POSITION_FIELDS.tzLookup]: '029876547',
      [POSITION_FIELDS.category]: 'פרא רפואי',
      [POSITION_FIELDS.layer]: 'יסודי',
      [POSITION_FIELDS.frontalHours]: 6,
      [POSITION_FIELDS.individualHours]: 2,
      [POSITION_FIELDS.stayHours]: 3,
    },
  },
];

const MOCK_MOSAD = 'recDEV';
const MOCK_SYMBOL = 'recSymA';

const MOCK_SYMBOLS: AirtableRecord[] = [
  {
    id: MOCK_SYMBOL,
    fields: {
      [SYMBOL_FIELDS.displayName]: 'גן שתילים ירושלים (710236)',
      [SYMBOL_FIELDS.symbolCode]: '710236',
      [SYMBOL_FIELDS.institutionName]: 'שתילים ירושלים',
    },
  },
];

// One role per סוג מערכת שעות so every schedule branch is testable in mock mode.
const MOCK_BUDGET: AirtableRecord[] = [
  {
    id: 'recRoleRegular',
    fields: {
      [BUDGET_FIELDS.role]: 'מורה מקצועי למתמטיקה (רגיל)',
      [BUDGET_FIELDS.institutionLink]: [{ id: MOCK_MOSAD }],
      [BUDGET_FIELDS.symbolLink]: [{ id: MOCK_SYMBOL }],
      [BUDGET_FIELDS.category]: { name: 'סיוע' },
      [BUDGET_FIELDS.scheduleType]: { name: 'רגיל' },
      [BUDGET_FIELDS.remainingHours]: 24,
      [BUDGET_FIELDS.layer]: [{ name: 'חטיבה' }],
    },
  },
  {
    id: 'recRoleTeaching',
    fields: {
      [BUDGET_FIELDS.role]: 'מורה לאנגלית (הוראה)',
      [BUDGET_FIELDS.institutionLink]: [{ id: MOCK_MOSAD }],
      [BUDGET_FIELDS.symbolLink]: [{ id: MOCK_SYMBOL }],
      [BUDGET_FIELDS.category]: { name: 'הוראה' },
      [BUDGET_FIELDS.scheduleType]: { name: 'הוראה' },
      [BUDGET_FIELDS.remainingHours]: 30,
      [BUDGET_FIELDS.layer]: [{ name: 'חטיבה' }],
      [BUDGET_FIELDS.bellScheduleNum]: [{ name: '1' }],
    },
  },
  {
    id: 'recRolePara',
    fields: {
      [BUDGET_FIELDS.role]: 'פרא רפואי - ריפוי בעיסוק (פרא)',
      [BUDGET_FIELDS.institutionLink]: [{ id: MOCK_MOSAD }],
      [BUDGET_FIELDS.symbolLink]: [{ id: MOCK_SYMBOL }],
      [BUDGET_FIELDS.category]: { name: 'פרא רפואי' },
      [BUDGET_FIELDS.scheduleType]: { name: 'פרא' },
      [BUDGET_FIELDS.remainingHours]: 18,
      [BUDGET_FIELDS.layer]: [],
    },
  },
  {
    id: 'recRoleTeachingParaSchedule',
    fields: {
      [BUDGET_FIELDS.role]: 'מורה שילוב (הוראה - לוח פרא)',
      [BUDGET_FIELDS.institutionLink]: [{ id: MOCK_MOSAD }],
      [BUDGET_FIELDS.symbolLink]: [{ id: MOCK_SYMBOL }],
      [BUDGET_FIELDS.category]: { name: 'הוראה' },
      [BUDGET_FIELDS.scheduleType]: { name: 'הוראה - לוח פרא' },
      [BUDGET_FIELDS.remainingHours]: 20,
      [BUDGET_FIELDS.layer]: [{ name: 'יסודי' }],
    },
  },
  {
    id: 'recRoleDeputy1',
    fields: {
      [BUDGET_FIELDS.role]: 'סגן מנהל ראשון (סגן ראשון)',
      [BUDGET_FIELDS.institutionLink]: [{ id: MOCK_MOSAD }],
      [BUDGET_FIELDS.symbolLink]: [{ id: MOCK_SYMBOL }],
      [BUDGET_FIELDS.category]: { name: 'שכר יסוד' },
      [BUDGET_FIELDS.scheduleType]: { name: 'סגן ראשון' },
      [BUDGET_FIELDS.remainingHours]: 40,
      [BUDGET_FIELDS.layer]: [{ name: 'יסודי' }],
    },
  },
  {
    id: 'recRoleDeputy2',
    fields: {
      [BUDGET_FIELDS.role]: 'סגן מנהל שני (סגן שני)',
      [BUDGET_FIELDS.institutionLink]: [{ id: MOCK_MOSAD }],
      [BUDGET_FIELDS.symbolLink]: [{ id: MOCK_SYMBOL }],
      [BUDGET_FIELDS.category]: { name: 'שכר יסוד' },
      [BUDGET_FIELDS.scheduleType]: { name: 'סגן שני' },
      [BUDGET_FIELDS.remainingHours]: 20,
      [BUDGET_FIELDS.layer]: [{ name: 'יסודי' }],
    },
  },
  {
    id: 'recRoleManager',
    fields: {
      [BUDGET_FIELDS.role]: 'מנהלת (מנהל/ת)',
      [BUDGET_FIELDS.institutionLink]: [{ id: MOCK_MOSAD }],
      [BUDGET_FIELDS.symbolLink]: [{ id: MOCK_SYMBOL }],
      [BUDGET_FIELDS.category]: { name: 'שכר יסוד' },
      [BUDGET_FIELDS.scheduleType]: { name: 'מנהל/ת' },
      [BUDGET_FIELDS.remainingHours]: 40,
      [BUDGET_FIELDS.layer]: [{ name: 'גנים' }],
    },
  },
  {
    id: 'recRoleSubstitute',
    fields: {
      [BUDGET_FIELDS.role]: 'ממלאת מקום (מילוי מקום)',
      [BUDGET_FIELDS.institutionLink]: [{ id: MOCK_MOSAD }],
      [BUDGET_FIELDS.symbolLink]: [{ id: MOCK_SYMBOL }],
      [BUDGET_FIELDS.category]: { name: 'שכר יסוד' },
      [BUDGET_FIELDS.scheduleType]: { name: 'מילוי מקום' },
      [BUDGET_FIELDS.remainingHours]: 12,
      [BUDGET_FIELDS.layer]: [{ name: 'יסודי' }],
    },
  },
  {
    id: 'recRoleTempSubstitute',
    fields: {
      [BUDGET_FIELDS.role]: 'ממלאת מקום זמנית (מילוי מקום לתקופה מוגבלת)',
      [BUDGET_FIELDS.institutionLink]: [{ id: MOCK_MOSAD }],
      [BUDGET_FIELDS.symbolLink]: [{ id: MOCK_SYMBOL }],
      [BUDGET_FIELDS.category]: { name: 'מילוי מקום לתקופה מוגבלת' },
      [BUDGET_FIELDS.scheduleType]: { name: 'רגיל' },
      [BUDGET_FIELDS.remainingHours]: 15,
      [BUDGET_FIELDS.layer]: [{ name: 'יסודי' }],
    },
  },
  {
    id: 'recRoleInvoice',
    fields: {
      [BUDGET_FIELDS.role]: 'יועצת חיצונית (חשבונית)',
      [BUDGET_FIELDS.institutionLink]: [{ id: MOCK_MOSAD }],
      [BUDGET_FIELDS.symbolLink]: [{ id: MOCK_SYMBOL }],
      [BUDGET_FIELDS.category]: { name: 'חשבונית' },
      [BUDGET_FIELDS.scheduleType]: { name: 'חשבונית' },
      [BUDGET_FIELDS.remainingHours]: 10,
      [BUDGET_FIELDS.layer]: [{ name: 'חטיבה' }],
    },
  },
  {
    id: 'recRoleNoHours',
    fields: {
      [BUDGET_FIELDS.role]: 'תקן ללא שעות (חסום)',
      [BUDGET_FIELDS.institutionLink]: [{ id: MOCK_MOSAD }],
      [BUDGET_FIELDS.symbolLink]: [{ id: MOCK_SYMBOL }],
      [BUDGET_FIELDS.category]: { name: 'הוראה' },
      [BUDGET_FIELDS.scheduleType]: { name: 'רגיל' },
      [BUDGET_FIELDS.remainingHours]: 0,
      [BUDGET_FIELDS.layer]: [{ name: 'יסודי' }],
    },
  },
  {
    id: 'recGemul1',
    fields: {
      [BUDGET_FIELDS.role]: 'גמול ריכוז מקצוע',
      [BUDGET_FIELDS.institutionLink]: [{ id: MOCK_MOSAD }],
      [BUDGET_FIELDS.symbolLink]: [{ id: MOCK_SYMBOL }],
      [BUDGET_FIELDS.category]: { name: 'גמול' },
      [BUDGET_FIELDS.scheduleType]: { name: 'רגיל' },
      [BUDGET_FIELDS.remainingHours]: 6,
    },
  },
  {
    id: 'recExtraRole1',
    fields: {
      [BUDGET_FIELDS.role]: 'רכז טיולים',
      [BUDGET_FIELDS.institutionLink]: [{ id: MOCK_MOSAD }],
      [BUDGET_FIELDS.symbolLink]: [{ id: MOCK_SYMBOL }],
      [BUDGET_FIELDS.category]: { name: 'תפקידים' },
      [BUDGET_FIELDS.scheduleType]: { name: 'רגיל' },
      [BUDGET_FIELDS.remainingHours]: 4,
    },
  },
];

/**
 * Local fixtures for AIRTABLE_MOCK=1. Lets the UI run without touching real PII.
 * Keep small and obviously fake.
 */
// Mock IDs use real checksum-valid Israeli test IDs so the duplicate-check is exercisable.
const MOCK_EMPLOYEES: AirtableRecord[] = [
  {
    id: 'recMockEmp1',
    fields: {
      [EMPLOYEE_FIELDS.name]: 'שרה כהן',
      [EMPLOYEE_FIELDS.tz]: '123456782',
      [EMPLOYEE_FIELDS.email]: 'sara@example.test',
      [EMPLOYEE_FIELDS.phone]: '050-1234567',
      [EMPLOYEE_FIELDS.address]: 'רחוב הנביאים 12, ירושלים',
      [EMPLOYEE_FIELDS.gender]: 'נקבה',
      [EMPLOYEE_FIELDS.maritalStatus]: 'נשוי/ה',
      [EMPLOYEE_FIELDS.birthDate]: '1988-04-12',
      [EMPLOYEE_FIELDS.ageHours]: 4,
    },
  },
  {
    id: 'recMockEmp2',
    fields: {
      [EMPLOYEE_FIELDS.name]: 'אברהם לוי',
      [EMPLOYEE_FIELDS.tz]: '000000018',
      [EMPLOYEE_FIELDS.email]: 'avraham@example.test',
      [EMPLOYEE_FIELDS.address]: 'רחוב יפו 5, ירושלים',
      [EMPLOYEE_FIELDS.gender]: 'זכר',
      [EMPLOYEE_FIELDS.maritalStatus]: 'נשוי/ה',
      [EMPLOYEE_FIELDS.birthDate]: '1979-11-03',
      [EMPLOYEE_FIELDS.ageHours]: 2,
    },
  },
  {
    id: 'recMockEmp3',
    fields: {
      [EMPLOYEE_FIELDS.name]: 'מיכל אהרוני',
      [EMPLOYEE_FIELDS.tz]: '029876547',
      [EMPLOYEE_FIELDS.email]: 'michal@example.test',
      [EMPLOYEE_FIELDS.phone]: '052-9876543',
      [EMPLOYEE_FIELDS.address]: 'רחוב הרצל 40, תל אביב',
      [EMPLOYEE_FIELDS.gender]: 'נקבה',
      [EMPLOYEE_FIELDS.maritalStatus]: 'גרוש/ה',
      [EMPLOYEE_FIELDS.birthDate]: '1992-07-21',
      [EMPLOYEE_FIELDS.ageHours]: 0,
    },
  },
];

export function getMock(
  tableId: string,
  opts: { filterByFormula?: string; maxRecords?: number } = {},
): AirtableRecord[] {
  if (tableId === TABLES.employees) {
    const formula = opts.filterByFormula ?? '';
    // RECORD_ID() lookup → match by record id directly.
    if (formula.includes('RECORD_ID()')) {
      const m = formula.match(/"([^"]+)"/);
      const id = m?.[1];
      return MOCK_EMPLOYEES.filter((r) => r.id === id);
    }
    // Otherwise: naive client-side filter by the search term embedded in the formula.
    let rows = MOCK_EMPLOYEES;
    const m = formula.match(/"([^"]+)"/);
    const term = m?.[1];
    if (term) {
      rows = rows.filter((r) => Object.values(r.fields).some((v) => String(v).includes(term)));
    }
    return rows.slice(0, opts.maxRecords ?? rows.length);
  }
  if (tableId === TABLES.budget) return MOCK_BUDGET;
  if (tableId === TABLES.institutionSymbols) return MOCK_SYMBOLS;
  if (tableId === TABLES.ofekCalc) {
    // Match on the key embedded in the formula; return a fixture row if key looks like para/teaching.
    const m = opts.filterByFormula?.match(/"([^"]+)"/);
    const key = m?.[1] ?? '';
    return [
      {
        id: 'recOfekMock',
        fields: {
          [OFEK_FIELDS.key]: key,
          [OFEK_FIELDS.frontalHours]: 12,
          [OFEK_FIELDS.individualHours]: 4,
          [OFEK_FIELDS.stayHours]: 6,
          [OFEK_FIELDS.totalHours]: 22,
          [OFEK_FIELDS.jobPercent]: 0.61,
        },
      },
    ];
  }
  if (tableId === TABLES.hoursSummary) return []; // no previous-year record in mock
  if (tableId === TABLES.activePositions) {
    const m = opts.filterByFormula?.match(/"([^"]+)"/);
    const tz = m?.[1];
    return MOCK_EXISTING_POSITIONS.filter((r) => String(r.fields[POSITION_FIELDS.tzLookup]) === tz);
  }
  return [];
}
