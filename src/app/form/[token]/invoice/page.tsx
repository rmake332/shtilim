import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { InvoiceDashboard } from '@/components/invoice/InvoiceDashboard';

/**
 * /form/[token]/invoice - ניהול תקני חשבונית למוסד: רשימת שורות התקציב בקטגוריית
 * חשבונית, עם מצב ההקצאה השנתית לכל אחת.
 */
export default async function InvoicePage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const institution = await resolveInstitutionByToken(token);
  if (!institution) notFound();

  return <InvoiceDashboard token={token} institutionName={institution.name} />;
}
