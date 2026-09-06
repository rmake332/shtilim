import 'server-only';
import { unstable_cache } from 'next/cache';
import { listRecords } from '@/lib/airtable/client';
import { TABLES, SUB_ROLE_FIELDS, SUB_ROLE_DOC_CHOICES } from '@/lib/airtable/schema';
import { CACHE_TAGS } from '@/lib/cacheTags';
import type { SubRoleDoc, SubRoleOption } from '@/lib/subRole';

/**
 * טבלת תת-תפקידים (`tblIEck6VDcpdfLFZ`): המקור היחיד לרשימת תת-התפקידים
 * ולתנאים הנגזרים מכל ערך (אישור ולנדברג, מספר רישיון, מסמכי הסמכה).
 *
 * עד המעבר הרשימה והתנאים היו מקודדים בשלושה מקומות בקוד, והוספת תת-תפקיד
 * דרשה שינוי ב-3 קבצים ופריסה. עכשיו זו שורה בטבלה.
 *
 * הצרכנים: השרת קורא ישירות מכאן, ורכיבי הלקוח מקבלים את אותן אופציות דרך
 * `GET /api/sub-roles` (RoleStep, AllocationScreen) או כ-prop מהעמוד
 * (FixSubRoleScreen). הצורה המשותפת מוגדרת ב-`src/lib/subRole.ts`.
 */

export interface SubRoleRow extends SubRoleOption {
  id: string;
  active: boolean;
  /** נשאר בטבלה אך אינו נאכף: הרשימה המלאה מוצגת בכל שכבה. */
  availableInHativa: boolean;
  displayOrder: number;
}

function str(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v[0] == null ? '' : String(v[0]);
  return String(v);
}

/**
 * כל שורות הטבלה, כולל לא-פעילות (הסינון נעשה אצל הצרכן, כדי שתקן שמצביע על
 * ערך שהושבת עדיין יוכל להציג את שמו). ממוין לפי סדר תצוגה.
 */
export const fetchSubRoleRows = unstable_cache(
  async (): Promise<SubRoleRow[]> => {
    const records = await listRecords(TABLES.subRoles, {
      fields: [
        SUB_ROLE_FIELDS.name,
        SUB_ROLE_FIELDS.active,
        SUB_ROLE_FIELDS.requiresLandberg,
        SUB_ROLE_FIELDS.requiresLicenseNumber,
        SUB_ROLE_FIELDS.requiredDocs,
        SUB_ROLE_FIELDS.availableInHativa,
        SUB_ROLE_FIELDS.displayOrder,
      ],
    });

    return records
      .map((r) => {
        const f = r.fields;
        const rawDocs = f[SUB_ROLE_FIELDS.requiredDocs];
        const docNames = Array.isArray(rawDocs) ? rawDocs.map((d) => str(d)) : [];
        return {
          id: r.id,
          name: str(f[SUB_ROLE_FIELDS.name]),
          active: Boolean(f[SUB_ROLE_FIELDS.active]),
          requiresLandberg: Boolean(f[SUB_ROLE_FIELDS.requiresLandberg]),
          requiresLicenseNumber: Boolean(f[SUB_ROLE_FIELDS.requiresLicenseNumber]),
          // בחירה שאין לה מיפוי מדולגת במכוון: היא מעידה על שם בחירה שנוסף
          // באיירטייבל בלי שדה קובץ מתאים, ואין מה לבקש מהמזכירה להעלות.
          docs: docNames
            .map((n) => SUB_ROLE_DOC_CHOICES[n])
            .filter((d): d is SubRoleDoc => Boolean(d)),
          availableInHativa: Boolean(f[SUB_ROLE_FIELDS.availableInHativa]),
          displayOrder: Number(f[SUB_ROLE_FIELDS.displayOrder]) || 0,
        };
      })
      .filter((r) => r.name)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  },
  ['sub-roles'],
  { tags: [CACHE_TAGS.subRoles], revalidate: 3600 },
);

/**
 * האופציות שמוצגות למזכירה ונאכפות בשמירה: השורות הפעילות בלבד, בסדר התצוגה,
 * מצומצמות לצורה שעוברת ללקוח.
 */
export async function activeSubRoleOptions(): Promise<SubRoleOption[]> {
  const rows = await fetchSubRoleRows();
  return rows
    .filter((r) => r.active)
    .map(({ name, requiresLandberg, requiresLicenseNumber, docs }) => ({
      name,
      requiresLandberg,
      requiresLicenseNumber,
      docs,
    }));
}

/** שמות תת-התפקידים הפעילים, ליעדי מפת ההצעה ב-`suggestSubRole`. */
export async function activeSubRoleNames(): Promise<string[]> {
  return (await activeSubRoleOptions()).map((o) => o.name);
}

/**
 * מזהה הרשומה של תת-תפקיד לפי שמו, לכתיבה לשדה הקישור.
 * מחזיר undefined לשם שאינו בטבלה, ואז פשוט לא נכתב קישור (השדה נשאר ריק)
 * במקום ליצור שורה חדשה בטעות: `typecast` על שדה קישור יוצר רשומה בטבלה
 * המקושרת, וזה בדיוק סוג התקלה שהמעבר הזה בא למנוע.
 */
export async function subRoleLinkFor(name: string): Promise<string[] | undefined> {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return undefined;
  const rows = await fetchSubRoleRows();
  const match = rows.find((r) => r.name === trimmed);
  return match ? [match.id] : undefined;
}
