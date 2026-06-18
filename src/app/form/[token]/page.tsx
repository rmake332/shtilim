import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { InstitutionPortal } from '@/components/InstitutionPortal';

/**
 * /form/[token] — דף בחירת מודול לפי מוסד.
 * מציג 4 כרטיסיות: ניהול תקנים | תקציב התחלתי | עובד חשבונית | תיק אישי
 */
export default async function FormPage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const institution = await resolveInstitutionByToken(token);
  if (!institution) notFound();

  return <InstitutionPortal token={token} institutionName={institution.name} />;
}
