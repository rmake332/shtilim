import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { getEmployeeById } from '@/lib/employees';
import { Wizard } from '@/components/Wizard';
import type { EmployeeData } from '@/lib/formTypes';

/**
 * /form/[token]/new — הוספת תקן חדש (הטופס המקורי).
 * Query param: ?employee=<recordId> — טוען עובד קיים מראש ומדלג לשלב תפקיד.
 */
export default async function NewPositionPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { employee?: string };
}) {
  const token = decodeURIComponent(params.token);
  const institution = await resolveInstitutionByToken(token);
  if (!institution) notFound();

  let initialEmployee: EmployeeData | undefined;
  const employeeId = searchParams.employee;
  if (employeeId) {
    const details = await getEmployeeById(employeeId);
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
        contractStartDate: '',
        youthRulesAcknowledged: false,
        fatherPosition: details.fatherPosition,
      };
    }
  }

  return (
    <Wizard
      token={token}
      institution={institution}
      mode="new"
      initialEmployee={initialEmployee}
      startStep={initialEmployee ? 'role' : undefined}
    />
  );
}
