import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { MonthlyReportScreen } from '@/components/invoice/MonthlyReportScreen';

/**
 * /form/[token]/invoice/[budgetRowId]/report - דיווח חודשי לתקן חשבונית בודד:
 * שעות בפועל + תעריף לכל עובד מוקצה, בצירוף חשבונית.
 */
export default async function InvoiceMonthlyReportPage({
  params,
}: {
  params: { token: string; budgetRowId: string };
}) {
  const token = decodeURIComponent(params.token);
  const institution = await resolveInstitutionByToken(token);
  if (!institution) notFound();

  return <MonthlyReportScreen token={token} institutionName={institution.name} budgetRowId={params.budgetRowId} />;
}
