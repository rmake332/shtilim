import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { Wizard } from '@/components/Wizard';

/**
 * /form/[token]/new — הוספת תקן חדש (הטופס המקורי).
 */
export default async function NewPositionPage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const institution = await resolveInstitutionByToken(token);
  if (!institution) notFound();

  return <Wizard token={token} institution={institution} mode="new" />;
}
