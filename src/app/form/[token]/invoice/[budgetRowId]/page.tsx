import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { AllocationScreen } from '@/components/invoice/AllocationScreen';

/**
 * /form/[token]/invoice/[budgetRowId] - "ניהול תקציב": הקצאת עובדים, שעות
 * ותעריף שעתי לתקן חשבונית בודד.
 */
export default async function InvoiceAllocationPage({
  params,
}: {
  params: { token: string; budgetRowId: string };
}) {
  const token = decodeURIComponent(params.token);
  const institution = await resolveInstitutionByToken(token);
  if (!institution) notFound();

  return <AllocationScreen token={token} institutionName={institution.name} budgetRowId={params.budgetRowId} />;
}
