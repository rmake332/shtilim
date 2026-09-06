/**
 * תת-תפקיד: הצורה המשותפת לשרת וללקוח, והנרמול של ערכים שנקלטו כטקסט חופשי.
 *
 * **מקור הרשימה הוא טבלת "תת-תפקידים" באיירטייבל** (`tblIEck6VDcpdfLFZ`), ולא
 * רשימה קשיחה כאן. כל פונקציה בקובץ הזה מקבלת את האופציות כפרמטר, כדי שגם
 * רכיבי לקוח (שאינם יכולים לקרוא לאיירטייבל) יעבדו על אותם נתונים בדיוק:
 * השרת שולף אותם דרך `src/lib/subRoleTable.ts`, והלקוח מקבל אותם דרך
 * `GET /api/sub-roles` או כ-prop.
 *
 * למה זה חשוב: השדה תת-תפקיד בטבלת תשפ"ו הוא טקסט חופשי, והקוד העתיק ממנו
 * ערכים כמו שהם. `typecast: true` באיירטייבל יוצר מכל מחרוזת שאינה מוכרת אופציה
 * חדשה, ולכן השדה תפח מ-8 ל-48 אופציות. מכיוון שכל ההשוואות בקוד הן התאמת
 * מחרוזת מדויקת, וריאנט כמו "מטפלת רגשית" (במקום "מטפל/ת רגשית") עקף בשקט את
 * שער אישור ולנדברג ואת דרישת מסמכי ההסמכה.
 */

/** מסמך הסמכה נדרש, כבר ממופה לשדה הקובץ בפועל על העובד. */
export interface SubRoleDoc {
  fieldId: string;
  label: string;
}

/**
 * תת-תפקיד אחד כפי שהוא מוגדר בטבלה. זו הצורה שעוברת לרכיבי הלקוח, ולכן היא
 * מכילה רק את מה שהם צריכים כדי להציג ולוודא (בלי מזהה רשומה או סדר תצוגה).
 */
export interface SubRoleOption {
  name: string;
  requiresLandberg: boolean;
  requiresLicenseNumber: boolean;
  docs: SubRoleDoc[];
  /**
   * שמות מסמכים שסומנו בטבלה אך לא נמצא להם שדה קובץ מתאים ברשימת עובדים.
   *
   * לא מדלגים עליהם בשקט: מסמך שלא נפתר פירושו דרישת הסמכה שנעלמה מהטופס, וזו
   * בדיוק סוג התקלה שהפרויקט הזה בא לתקן. הטופס חוסם שמירה ומציג את השמות, כדי
   * שיהיה ברור שצריך ליישר שם שדה באיירטייבל.
   */
  unresolvedDocs: string[];
}

export function findSubRole(
  options: readonly SubRoleOption[],
  name: string,
): SubRoleOption | undefined {
  if (!name) return undefined;
  return options.find((o) => o.name === name);
}

/** האם הערך מוכר בטבלה. מחליף את בדיקת הרשימה הקשיחה שהייתה כאן. */
export function isKnownSubRole(options: readonly SubRoleOption[], name: string): boolean {
  return Boolean(findSubRole(options, name));
}

/** מסמכי הסמכה נדרשים לתת-תפקיד (מערך ריק כשאין). מתויקים על העובד, לא על התקן. */
export function subRoleDocsFor(options: readonly SubRoleOption[], name: string): SubRoleDoc[] {
  return findSubRole(options, name)?.docs ?? [];
}

/** תת-תפקיד שדורש אישור אפרת ולנדברג לפני המשך. */
export function requiresLandbergApproval(
  options: readonly SubRoleOption[],
  name: string,
): boolean {
  return findSubRole(options, name)?.requiresLandberg ?? false;
}

/** האם תת-התפקיד דורש גם מספר רישיון. */
export function requiresLicenseNumber(
  options: readonly SubRoleOption[],
  name: string,
): boolean {
  return findSubRole(options, name)?.requiresLicenseNumber ?? false;
}

/**
 * מסמכים שסומנו לתת-התפקיד בטבלה אך שם הבחירה שלהם אינו תואם לשם שדה קובץ
 * ברשימת עובדים. רשימה לא ריקה חוסמת שמירה.
 */
export function unresolvedDocsFor(
  options: readonly SubRoleOption[],
  name: string,
): string[] {
  return findSubRole(options, name)?.unresolvedDocs ?? [];
}

/**
 * נרמול טקסטואלי לפני התאמה: רווחים נגררים/כפולים וגרשיים עבריים (״ ׳) שנכנסו
 * מהקלדה חופשית. "מטפלת רגשית " ו-"מטפלת  רגשית" חייבים להתנהג כמו "מטפלת רגשית".
 */
function normalize(raw: string): string {
  return raw.replace(/״/g, '"').replace(/׳/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * פותר את שמות המסמכים שסומנו בטבלת תת-תפקידים לשדות הקבצים בפועל ברשימת עובדים,
 * לפי התאמת שם. זה כל המיפוי, ואין לו עותק קשיח בקוד: הוספת סוג מסמך חדש היא
 * יצירת שדה קובץ בעובד והוספת בחירה באותו שם.
 *
 * ההשוואה מנורמלת (רווחים וגרשיים) כי שם שדה באיירטייבל נוצר בהקלדה חופשית,
 * ורווח מוביל אינו הבדל אמיתי. שם שלא נפתר מוחזר ב-`unresolvedDocs` ולא מושמט:
 * דרישת הסמכה שנעלמת בשקט היא בדיוק התקלה שהמערכת הזו באה למנוע.
 */
export function resolveSubRoleDocs(
  choiceNames: readonly string[],
  attachmentFields: ReadonlyArray<{ id: string; name: string }>,
): { docs: SubRoleDoc[]; unresolvedDocs: string[] } {
  const byName = new Map(attachmentFields.map((f) => [normalize(f.name), f]));
  const docs: SubRoleDoc[] = [];
  const unresolvedDocs: string[] = [];

  for (const choice of choiceNames) {
    const match = byName.get(normalize(choice));
    if (match) docs.push({ fieldId: match.id, label: match.name.trim() });
    else unresolvedDocs.push(choice);
  }
  return { docs, unresolvedDocs };
}

/**
 * כללי ההתאמה מטקסט חופשי למקצוע. כל כלל מזהה מקצוע אחד, ומופעל גם על הקלט
 * הגולמי וגם על שמות תת-התפקידים שבטבלה, כדי למצוא לאיזה מהם הקלט מתכוון.
 *
 * למה לא לרשום שם יעד קבוע לכל כלל: שם בטבלה הוא נתון שאפשר לערוך. כשהערך
 * "עובדת סוציאלית" שונה ל-"עובד/ת סוציאלי/ת", יעד קבוע היה מפסיק להתאים בשקט
 * וכל וריאנטי העו"ס היו נפתחים ריקים. התאמה לפי אותו כלל שורדת שינוי שם.
 *
 * הסדר קריטי: "פסיכותרפיסט" מכיל את המחרוזת "תרפי", ולכן כלל האומנות היה בולע
 * אותו אלמלא הכלל הרגשי מקדים אותו. מאותה סיבה אין להשתמש ב-"תרפי" כטוקן בפני
 * עצמו, אלא רק בצורות המפורשות (אומנות / אמנות / דרמה / מוזיקה).
 */
const SUGGESTION_RULES: readonly RegExp[] = [
  /רגש|ריגש|פסיכותרפ/,
  /קלינא/,
  /מרפא|ריפוי בעיסוק|בעסוק/,
  /פיזיו/,
  /אומנות|אמנות|דרמה|מוזיקה/,
  /סוציאל|סוצאיל|עו"ס|^עוס$/,
];

/**
 * מציע שם תת-תפקיד לטקסט חופשי שנקלט משנה קודמת, או `null` כשאין ודאות.
 *
 * `null` הוא תשובה לגיטימית ומכוונת: תפקידי הדרכה, פדגוגיה וריכוז ("הדרכות",
 * "מדריכה רפ״ע", "פדגוגית", "רכזת טיפול", "מנהלת טיפולית") אינם מתאימים לאף
 * ערך בטבלה, ולכן התפריט נפתח ריק והמזכירה בוחרת בעצמה.
 *
 * `names` הם השמות הקיימים בטבלה, וההצעה היא תמיד אחד מהם, כדי שערך שהוצע
 * יהיה תמיד ערך שאפשר לשמור.
 */
export function suggestSubRole(raw: string, names: readonly string[]): string | null {
  const value = normalize(raw ?? '');
  if (!value) return null;

  if (names.includes(value)) return value;

  // תפקידי הדרכה: יש כמה ערכי הדרכה נפרדים בטבלה, ואי אפשר להסיק מ-"הדרכות"
  // באיזה מהם מדובר. זה חייב עין אנושית, ולכן נעצרים כאן לפני שכלל
  // הקלינאות/ריפוי היה בולע את הערך לתוך הטיפול עצמו.
  if (value.includes('הדרכ')) return null;

  const rule = SUGGESTION_RULES.find((re) => re.test(value));
  if (!rule) return null;

  // היעד נבחר מבין שמות הטבלה לפי אותו כלל. שמות הדרכה מוחרגים: קלט שאינו
  // הדרכה מתכוון לטיפול עצמו, ובלעדי ההחרגה "קלינאית תקשורת" היה מתלבט בין
  // "קלינאות תקשורת" ל-"הדרכה קלינאות". יותר ממועמד אחד מחזיר null, כי ניחוש
  // בין שני מקצועות גרוע מתפריט ריק.
  const candidates = names.filter((n) => !n.includes('הדרכ') && rule.test(n));
  return candidates.length === 1 ? candidates[0] : null;
}
