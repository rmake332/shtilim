import 'server-only';
import { unstable_cache } from 'next/cache';
import { listRecords } from '@/lib/airtable/client';
import { TABLES, SUB_ROLE_FIELDS, SUB_ROLE_DOC_CHOICES } from '@/lib/airtable/schema';
import { CACHE_TAGS } from '@/lib/cacheTags';

/**
 * טבלת תת-תפקידים: הרשימה הקנונית והתנאים הנגזרים מכל ערך, כנתונים במקום כקוד.
 *
 * עד היום הרשימה, שער ולנדברג ומסמכי ההסמכה היו מקודדים בשלושה מקומות
 * (`CANONICAL_SUB_ROLES`, `LANDBERG_SUB_ROLES`, `SUB_ROLE_DOC_FIELDS`), והוספת
 * תת-תפקיד דרשה שינוי קוד ופריסה. עכשיו זו שורה בטבלה.
 *
 * מצב המעבר: `src/lib/subRole.ts` עדיין מחזיק את אותה רשימה כברירת מחדל, כי
 * הוא נטען גם בצד הלקוח ואי אפשר לקרוא ממנו לאיירטייבל. הקובץ הזה הוא הצד
 * השרתי, והוא מה שיחליף אותו כשהמעבר יושלם.
 */

export interface SubRoleRow {
  id: string;
  name: string;
  active: boolean;
  requiresLandberg: boolean;
  requiresLicenseNumber: boolean;
  /** מסמכי ההסמכה הנדרשים, כבר ממופים לשדה הקובץ בפועל על העובד. */
  docs: { fieldId: string; label: string }[];
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
          docs: docNames.map((n) => SUB_ROLE_DOC_CHOICES[n]).filter((d): d is { fieldId: string; label: string } => Boolean(d)),
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
