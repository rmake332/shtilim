import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { PlaceholderModule } from '@/components/PlaceholderModule';

export default async function PersonnelPage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const institution = await resolveInstitutionByToken(token);
  if (!institution) notFound();

  return (
    <PlaceholderModule
      token={token}
      institutionName={institution.name}
      title="תיק אישי לעובד"
      description="צפייה בפרטי עובדים והעלאת מסמכים אישיים: אישורים, חוזים ומסמכים נוספים. מודול זה נמצא בפיתוח ויהיה זמין בקרוב."
      icon="folder_shared"
      badgeLabel="בפיתוח"
    />
  );
}
