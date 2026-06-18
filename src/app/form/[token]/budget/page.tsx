import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { BudgetView } from '@/components/BudgetView';

export default async function BudgetPage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const institution = await resolveInstitutionByToken(token);
  if (!institution) notFound();

  return <BudgetView token={token} institutionName={institution.name} mosadId={institution.mosadId} />;
}
