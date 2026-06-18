import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { Wizard } from '@/components/Wizard';
import type { EmployeeData, RoleData, ScheduleData } from '@/lib/formTypes';

/**
 * /form/[token]/edit/[positionId] — עריכת תקן קיים.
 * טוען את נתוני התקן server-side ומעביר ל-Wizard עם mode="edit".
 */
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

  // Fetch position data server-side (uses the same token for auth).
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? vercelUrl ?? 'http://localhost:3010';
  let employee: EmployeeData | undefined;
  let role: RoleData | undefined;
  let schedule: ScheduleData | undefined;

  try {
    const res = await fetch(
      `${baseUrl}/api/positions/${positionId}?token=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) notFound();
    const data = await res.json();
    employee = data.employee;
    role = data.role;
    schedule = data.schedule;
  } catch {
    notFound();
  }

  return (
    <Wizard
      token={token}
      institution={institution}
      mode="edit"
      positionId={positionId}
      initialEmployee={employee}
      initialRole={role}
      initialSchedule={schedule}
    />
  );
}
