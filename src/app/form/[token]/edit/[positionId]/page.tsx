import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { loadPosition } from '@/lib/loadPosition';
import { Wizard } from '@/components/Wizard';

export default async function EditPositionPage({
  params,
}: {
  params: { token: string; positionId: string };
}) {
  const token = decodeURIComponent(params.token);
  const institution = await resolveInstitutionByToken(token);
  if (!institution) notFound();

  const positionId = params.positionId;
  if (!/^rec[A-Za-z0-9]{6,}$/.test(positionId)) notFound();

  const data = await loadPosition(positionId).catch(() => null);
  if (!data) notFound();

  return (
    <Wizard
      token={token}
      institution={institution}
      mode="edit"
      positionId={positionId}
      initialEmployee={data.employee}
      initialRole={data.role}
      initialSchedule={data.schedule}
    />
  );
}
