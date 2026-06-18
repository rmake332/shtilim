import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { InstitutionDashboard } from '@/components/InstitutionDashboard';

/**
 * /form/[token]/positions — ניהול תקנים פעילים למוסד.
 */
export default async function PositionsPage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const institution = await resolveInstitutionByToken(token);
  if (!institution) notFound();

  return <InstitutionDashboard token={token} institutionName={institution.name} />;
}
