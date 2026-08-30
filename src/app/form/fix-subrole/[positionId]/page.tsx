import { notFound } from 'next/navigation';
import { loadSubRoleFix } from '@/lib/loadSubRoleFix';
import { FixSubRoleScreen } from '@/components/FixSubRoleScreen';

/**
 * /form/fix-subrole/[positionId] - השלמת תת-תפקיד לתקן שסומן "דורש תיקון".
 *
 * הקישור אינו מכיל את טוקן המוסד: הוא נגזר בשרת מהתקן עצמו (אותו דפוס כמו
 * /form/from-prev-year/[id]), כדי שאפשר יהיה להדביק אותו בכפתור באיירטייבל
 * בלי לחשוף את הטוקן. הכתיבה עצמה עדיין מאומתת מול הטוקן ומול בעלות המוסד
 * ב-POST /api/positions/[id]/fix-subrole.
 */
export default async function FixSubRolePage({
  params,
}: {
  params: { positionId: string };
}) {
  const positionId = params.positionId;
  if (!/^rec[A-Za-z0-9]{6,}$/.test(positionId)) notFound();

  const ctx = await loadSubRoleFix(positionId).catch(() => null);
  if (!ctx) notFound();

  return <FixSubRoleScreen ctx={ctx} />;
}
