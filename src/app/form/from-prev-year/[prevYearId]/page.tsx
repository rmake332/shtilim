import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { loadPrevYearFull } from '@/lib/loadPrevYearFull';
import { Wizard } from '@/components/Wizard';

/**
 * /form/from-prev-year/[prevYearId] — open the form fully prefilled from a תשפ"ו position.
 *
 * Entry point for the "טען תקן משנה קודמת" button in the תקנים תשפו table. The institution
 * token is DERIVED server-side from the row (never taken from the URL), and employee + role +
 * schedule are prefilled. The form still opens on the employee step so the secretary completes
 * the fields תשפ"ו can't supply (contract date, children, documents).
 */
export default async function FromPrevYearPage({
  params,
}: {
  params: { prevYearId: string };
}) {
  const prevYearId = params.prevYearId;
  if (!/^rec[A-Za-z0-9]{6,}$/.test(prevYearId)) notFound();

  const data = await loadPrevYearFull(prevYearId).catch(() => null);
  if (!data) notFound();

  const institution = await resolveInstitutionByToken(data.token);
  if (!institution) notFound();

  return (
    <Wizard
      token={data.token}
      institution={institution}
      mode="new"
      startStep="employee"
      initialEmployee={data.employee ?? undefined}
      initialRole={data.role}
      initialSchedule={data.schedule}
      initialPrevYear={data.prevYear}
    />
  );
}
