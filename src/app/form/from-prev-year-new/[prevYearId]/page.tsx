import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { loadPrevYearForNewRole } from '@/lib/loadPrevYearForNewRole';
import { getEmployeeById } from '@/lib/employees';
import { Wizard } from '@/components/Wizard';
import { DEFAULT_CONTRACT_START_DATE, type EmployeeData } from '@/lib/formTypes';

/**
 * /form/from-prev-year-new/[prevYearId] — open a BRAND-NEW position for the same employee at
 * the same institution as a תשפ"ו row, without carrying over the role or schedule.
 *
 * Entry point for the "הוסף תקן חדש לשנה זו" button in the תקנים תשפו table. Only the
 * institution token and employee are derived server-side from the row; the secretary picks
 * the role and enters hours from scratch, same as a plain new position. On submit the row is
 * marked "נוסף תקן חדש" (no roleId carried over means it never matches as "same role").
 */
export default async function FromPrevYearNewRolePage({
  params,
}: {
  params: { prevYearId: string };
}) {
  const prevYearId = params.prevYearId;
  if (!/^rec[A-Za-z0-9]{6,}$/.test(prevYearId)) notFound();

  const data = await loadPrevYearForNewRole(prevYearId).catch(() => null);
  if (!data) notFound();

  const institution = await resolveInstitutionByToken(data.token);
  if (!institution) notFound();

  let initialEmployee: EmployeeData | undefined;
  if (data.employeeId) {
    const details = await getEmployeeById(data.employeeId);
    if (details) {
      initialEmployee = {
        recordId: details.id,
        name: details.name,
        tz: details.tz,
        address: details.address,
        email: details.email,
        phone: details.phone,
        gender: details.gender as EmployeeData['gender'],
        maritalStatus: details.maritalStatus as EmployeeData['maritalStatus'],
        childrenUnder14: '',
        birthDate: details.birthDate,
        ageHours: details.ageHours,
        contractStartDate: DEFAULT_CONTRACT_START_DATE,
        youthRulesAcknowledged: false,
        fatherPosition: details.fatherPosition,
        twelveHourEmployment: details.twelveHourEmployment,
        existingSubRoleDocs: details.existingSubRoleDocs,
        existingLicenseNumber: details.licenseNumber,
        existingYouthDocs: details.existingYouthDocs,
      };
    }
  }

  return (
    <Wizard
      token={data.token}
      institution={institution}
      mode="new"
      startStep="employee"
      initialEmployee={initialEmployee}
      prevYearTrackingId={data.prevYearRecordId}
    />
  );
}
