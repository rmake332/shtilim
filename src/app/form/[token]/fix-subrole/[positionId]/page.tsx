import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { loadSubRoleFix } from '@/lib/loadSubRoleFix';
import { FixSubRoleScreen } from '@/components/FixSubRoleScreen';

/**
 * /form/[token]/fix-subrole/[positionId] - השלמת תת-תפקיד לתקן שסומן "דורש תיקון".
 * מסך צר שנוגע רק בתת-תפקיד, מספר רישיון ומסמכים (ראו FixSubRoleScreen).
 */
export default async function FixSubRolePage({
  params,
}: {
  params: { token: string; positionId: string };
}) {
  const token = decodeURIComponent(params.token);
  const institution = await resolveInstitutionByToken(token);
  if (!institution) notFound();

  const positionId = params.positionId;
  if (!/^rec[A-Za-z0-9]{6,}$/.test(positionId)) notFound();

  // loadSubRoleFix מחזיר null גם כשהתקן שייך למוסד אחר, ולא רק כשהוא לא קיים.
  const ctx = await loadSubRoleFix(positionId, institution.name).catch(() => null);
  if (!ctx) notFound();

  return <FixSubRoleScreen token={token} ctx={ctx} />;
}
