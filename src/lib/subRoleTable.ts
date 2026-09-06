import 'server-only';
import { unstable_cache } from 'next/cache';
import { listRecords } from '@/lib/airtable/client';
import { getAttachmentFields } from '@/lib/airtable/meta';
import { TABLES, SUB_ROLE_FIELDS } from '@/lib/airtable/schema';
import { CACHE_TAGS } from '@/lib/cacheTags';
import { logger } from '@/lib/logger';
import { resolveSubRoleDocs, type SubRoleOption } from '@/lib/subRole';

/**
 * טבלת תת-תפקידים (`tblIEck6VDcpdfLFZ`): המקור היחיד לרשימת תת-התפקידים
 * ולתנאים הנגזרים מכל ערך (אישור ולנדברג, מספר רישיון, מסמכי הסמכה).
 *
 * עד המעבר הרשימה והתנאים היו מקודדים בקוד, והוספת תת-תפקיד דרשה שינוי ב-3
 * קבצים ופריסה. עכשיו זו שורה בטבלה.
 *
 * **מסמכי ההסמכה נפתרים לפי שם.** כל בחירה בשדה "מסמכים נדרשים" חייבת להיות
 * זהה לשם של שדה קובץ (multipleAttachments) בטבלת רשימת עובדים, ושם הקובץ הוא
 * גם מה שמוצג למזכירה. כך הוספת סוג מסמך חדש היא יצירת שדה קובץ בעובד והוספת
 * בחירה באותו שם, בלי שינוי קוד.
 *
 * הצרכנים: השרת קורא ישירות מכאן, ורכיבי הלקוח מקבלים את אותן אופציות דרך
 * `GET /api/sub-roles` (RoleStep, SummaryStep, AllocationScreen) או כ-prop
 * מהעמוד (FixSubRoleScreen). הצורה המשותפת מוגדרת ב-`src/lib/subRole.ts`.
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
    const [records, attachmentFields] = await Promise.all([
      listRecords(TABLES.subRoles, {
        fields: [
          SUB_ROLE_FIELDS.name,
          SUB_ROLE_FIELDS.active,
          SUB_ROLE_FIELDS.requiresLandberg,
          SUB_ROLE_FIELDS.requiresLicenseNumber,
          SUB_ROLE_FIELDS.requiredDocs,
          SUB_ROLE_FIELDS.availableInHativa,
          SUB_ROLE_FIELDS.displayOrder,
        ],
      }),
      getAttachmentFields(TABLES.employees),
    ]);

    return records
      .map((r) => {
        const f = r.fields;
        const rawDocs = f[SUB_ROLE_FIELDS.requiredDocs];
        const docNames = Array.isArray(rawDocs) ? rawDocs.map((d) => str(d)) : [];
        const { docs, unresolvedDocs } = resolveSubRoleDocs(docNames, attachmentFields);

        return {
          id: r.id,
          name: str(f[SUB_ROLE_FIELDS.name]),
          active: Boolean(f[SUB_ROLE_FIELDS.active]),
          requiresLandberg: Boolean(f[SUB_ROLE_FIELDS.requiresLandberg]),
          requiresLicenseNumber: Boolean(f[SUB_ROLE_FIELDS.requiresLicenseNumber]),
          docs,
          unresolvedDocs,
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
 * האופציות שמוצגות למזכירה ונאכפות בשמירה: השורות הפעילות בלבד, בסדר התצוגה.
 * מסמך שלא נפתר מדווח ללוג, כי הוא דורש יישור שם שדה באיירטייבל.
 */
export async function activeSubRoleOptions(): Promise<SubRoleOption[]> {
  const rows = await fetchSubRoleRows();
  const active = rows.filter((r) => r.active);

  const broken = active.filter((r) => r.unresolvedDocs.length);
  if (broken.length) {
    logger.warn(
      { subRoles: broken.map((r) => ({ name: r.name, unresolvedDocs: r.unresolvedDocs })) },
      'sub-role required docs have no matching attachment field on רשימת עובדים',
    );
  }

  return active.map(({ name, requiresLandberg, requiresLicenseNumber, docs, unresolvedDocs }) => ({
    name,
    requiresLandberg,
    requiresLicenseNumber,
    docs,
    unresolvedDocs,
  }));
}

/** שמות תת-התפקידים הפעילים, ליעדי מפת ההצעה ב-`suggestSubRole`. */
export async function activeSubRoleNames(): Promise<string[]> {
  return (await activeSubRoleOptions()).map((o) => o.name);
}

/**
 * כל מזהי שדות הקבצים שתת-תפקיד כלשהו דורש. משמש לבדיקה מה כבר בתיק העובד
 * ולרשימת ההיתר של העלאת מסמכים, כדי ששניהם יעקבו אחרי הטבלה בלי רשימה בקוד.
 */
export async function subRoleDocFieldIds(): Promise<string[]> {
  const rows = await fetchSubRoleRows();
  return [...new Set(rows.flatMap((r) => r.docs.map((d) => d.fieldId)))];
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
