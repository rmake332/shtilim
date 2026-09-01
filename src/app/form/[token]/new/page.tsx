import { notFound } from 'next/navigation';
import { resolveInstitutionByToken } from '@/lib/institution';
import { getEmployeeById, childrenUnder14FromPositions } from '@/lib/employees';
import { Wizard } from '@/components/Wizard';
import { DEFAULT_CONTRACT_START_DATE, showChildrenUnder14Question, splitFullName, type EmployeeData } from '@/lib/formTypes';
import { isValidIsraeliId } from '@/lib/validation/israeliId';

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
      // "ילדים מתחת לגיל 14" נטענת מתקן קיים של אותו/ה עובד/ת: המסלול הזה מדלג על שלב
      // פרטי העובד, ותשובה ריקה נספרת כ"לא" ומייצרת משרת אם שונה מיתר תקניו/ה.
      const childrenUnder14 = await childrenUnder14FromPositions(details.tz);
      initialEmployee = {
        recordId: details.id,
        name: details.name,
        ...splitFullName(details.name),
        tz: details.tz,
        noIsraeliId: !isValidIsraeliId(details.tz),
        address: details.address,
        email: details.email,
        phone: details.phone,
        gender: details.gender as EmployeeData['gender'],
        maritalStatus: details.maritalStatus as EmployeeData['maritalStatus'],
        childrenUnder14,
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

  // דילוג לשלב התפקיד רק כשאין שאלה פתוחה בשלב פרטי העובד. כשהשאלה "ילדים מתחת
  // לגיל 14" רלוונטית ולא נענתה באף תקן קיים - נפתחים בשלב העובד כדי שתישאל, אחרת
  // התקן ייווצר עם משרת אם "לא" בלי שאיש נשאל.
  const childrenAnswerMissing =
    !!initialEmployee && showChildrenUnder14Question(initialEmployee) && !initialEmployee.childrenUnder14;

  return (
    <Wizard
      token={token}
      institution={institution}
      mode="new"
      initialEmployee={initialEmployee}
      startStep={initialEmployee && !childrenAnswerMissing ? 'role' : undefined}
    />
  );
}
