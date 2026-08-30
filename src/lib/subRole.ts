import { SUB_ROLE_DOC_FIELDS, type SubRoleDocDef } from '@/lib/airtable/schema';

/**
 * תת-תפקיד: המקור היחיד לרשימה הקנונית, לנרמול ערכים שנקלטו כטקסט חופשי,
 * ולתנאים הנגזרים מכל ערך (אישור ולנדברג, מסמכי הסמכה, מספר רישיון).
 *
 * למה הקובץ הזה קיים: השדה תת-תפקיד בטבלת תשפ"ו הוא טקסט חופשי, והקוד העתיק
 * ממנו ערכים כמו שהם. `typecast: true` באיירטייבל יוצר מכל מחרוזת שאינה מוכרת
 * אופציה חדשה בשדה, ולכן השדה תפח מ-8 ל-48 אופציות, וכל אופציה חדשה חזרה
 * לתפריט הנפתח דרך ה-Meta API. מכיוון שכל ההשוואות בקוד הן התאמת מחרוזת
 * מדויקת, וריאנט כמו "מטפלת רגשית" (במקום "מטפל/ת רגשית") עקף בשקט את שער
 * אישור ולנדברג ואת דרישת מסמכי ההסמכה.
 *
 * כל צרכן פונה לפונקציות כאן ולא למחרוזות ישירות, כדי שהחלפת מקור הרשימה
 * (למשל מעבר לטבלה נפרדת באיירטייבל) תהיה שינוי בתוך הקובץ הזה בלבד.
 */

/** 8 הערכים הקנוניים. כל ערך אחר בשדה נוצר בטעות ע"י typecast. */
export const CANONICAL_SUB_ROLES = [
  'קלינאות תקשורת',
  'ריפוי בעיסוק',
  'מטפל/ת באומנות',
  'מטפל/ת רגשית',
  'פיזיו',
  'עובדת סוציאלית',
  'הדרכה קלינאות',
  'הדרכה ריפוי בעיסוק',
] as const;

export type CanonicalSubRole = (typeof CANONICAL_SUB_ROLES)[number];

const CANONICAL_SET: ReadonlySet<string> = new Set(CANONICAL_SUB_ROLES);

export function isCanonicalSubRole(value: string): value is CanonicalSubRole {
  return CANONICAL_SET.has(value);
}

/** מסנן רשימת אופציות חיה מה-Meta API לערכים הקנוניים בלבד, בסדר המקורי. */
export function canonicalSubRoleChoices(choices: readonly string[]): string[] {
  return choices.filter((c) => isCanonicalSubRole(c));
}

/** תת-תפקיד שדורש אישור אפרת ולנדברג לפני המשך. */
const LANDBERG_SUB_ROLES: ReadonlySet<string> = new Set(['מטפל/ת רגשית', 'מטפל/ת באומנות']);

export function requiresLandbergApproval(subRole: string): boolean {
  return LANDBERG_SUB_ROLES.has(subRole);
}

/** מסמכי הסמכה נדרשים לתת-תפקיד (מערך ריק כשאין). מתויקים על העובד, לא על התקן. */
export function subRoleDocsFor(subRole: string): readonly SubRoleDocDef[] {
  if (!subRole) return [];
  return SUB_ROLE_DOC_FIELDS.filter((d) => d.subRole === subRole);
}

/** האם תת-התפקיד דורש גם מספר רישיון (נגזר ממסמכי ההסמכה שלו). */
export function requiresLicenseNumber(subRole: string): boolean {
  return subRoleDocsFor(subRole).some((d) => d.requiresLicenseNumber);
}

/**
 * נרמול טקסטואלי לפני התאמה: רווחים נגררים/כפולים וגרשיים עבריים (״ ׳) שנכנסו
 * מהקלדה חופשית. "מטפלת רגשית " ו-"מטפלת  רגשית" חייבים להתנהג כמו "מטפלת רגשית".
 */
function normalize(raw: string): string {
  return raw.replace(/\u05f4/g, '"').replace(/\u05f3/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * מפת ההתאמה מטקסט חופשי לערך קנוני.
 *
 * הסדר קריטי: "פסיכותרפיסט" מכיל את המחרוזת "תרפי", ולכן כלל האומנות היה בולע
 * אותו אלמלא הכלל הרגשי מקדים אותו. מאותה סיבה אין להשתמש ב-"תרפי" כטוקן בפני
 * עצמו, אלא רק בצורות המפורשות (אומנות / אמנות / דרמה / מוזיקה).
 */
const SUGGESTION_RULES: readonly [RegExp, CanonicalSubRole][] = [
  [/רגש|ריגש|פסיכותרפ/, 'מטפל/ת רגשית'],
  [/קלינא/, 'קלינאות תקשורת'],
  [/מרפא|ריפוי בעיסוק|בעסוק/, 'ריפוי בעיסוק'],
  [/פיזיו/, 'פיזיו'],
  [/אומנות|אמנות|דרמה|מוזיקה/, 'מטפל/ת באומנות'],
  [/סוציאל|סוצאיל|עו"ס|^עוס$/, 'עובדת סוציאלית'],
];

/**
 * מציע ערך קנוני לטקסט חופשי שנקלט משנה קודמת, או `null` כשאין ודאות.
 *
 * `null` הוא תשובה לגיטימית ומכוונת: תפקידי הדרכה, פדגוגיה וריכוז ("הדרכות",
 * "מדריכה רפ״ע", "פדגוגית", "רכזת טיפול", "מנהלת טיפולית") אינם מתאימים לאף
 * אחד מ-8 הערכים, ולכן התפריט נפתח ריק והמזכירה בוחרת בעצמה.
 */
export function suggestCanonicalSubRole(raw: string): CanonicalSubRole | null {
  const value = normalize(raw ?? '');
  if (!value) return null;
  if (isCanonicalSubRole(value)) return value;

  // תפקידי הדרכה: יש שני ערכים קנוניים נפרדים ("הדרכה קלינאות" / "הדרכה ריפוי
  // בעיסוק"), ואי אפשר להסיק מ-"הדרכות" באיזה מהם מדובר. זה חייב עין אנושית,
  // ולכן נעצרים כאן לפני שכלל הקלינאות/ריפוי היה בולע את הערך לתוך הטיפול עצמו.
  if (value.includes('הדרכ')) return null;

  return SUGGESTION_RULES.find(([re]) => re.test(value))?.[1] ?? null;
}
