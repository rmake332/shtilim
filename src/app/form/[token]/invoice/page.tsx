import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { PlaceholderModule } from '@/components/PlaceholderModule';

export default async function InvoicePage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const institution = await resolveInstitutionByToken(token);
  if (!institution) notFound();

  return (
    <PlaceholderModule
      token={token}
      institutionName={institution.name}
      title="הוספת עובד חשבונית"
      description="מודול להוספת עובדים בקטגוריה חשבונית — ללא שיוך לתקן תקציבי. מודול זה נמצא בפיתוח ויהיה זמין בקרוב."
      icon="receipt_long"
      badgeLabel="בפיתוח"
    />
  );
}
