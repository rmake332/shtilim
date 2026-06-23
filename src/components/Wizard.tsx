'use client';

import { useState } from 'react';
import { FormShell } from '@/components/shell/FormShell';
import { EmployeeStep } from '@/components/steps/EmployeeStep';
import { RoleStep } from '@/components/steps/RoleStep';
import { ScheduleStep } from '@/components/steps/ScheduleStep';
import { SummaryStep } from '@/components/steps/SummaryStep';
import { StepId } from '@/lib/steps';
import { EmployeeData, RoleData, ScheduleData, YouthDocs, emptySchedule } from '@/lib/formTypes';
import type { PrevYearPosition } from '@/lib/prevYearPosition';
import type { Institution } from '@/lib/institution';

interface WizardProps {
  token: string;
  institution: Institution;
  mode?: 'new' | 'edit';
  /** Which step to open first (edit mode only). Defaults to 'role'. */
  startStep?: StepId;
  positionId?: string;
  initialEmployee?: EmployeeData;
  initialRole?: RoleData;
  initialSchedule?: ScheduleData;
}

export function Wizard({
  token,
  institution,
  mode = 'new',
  startStep,
  positionId,
  initialEmployee,
  initialRole,
  initialSchedule,
}: WizardProps) {
  const defaultStart: StepId = mode === 'edit' ? (startStep ?? 'schedule') : (startStep ?? 'employee');
  const [step, setStep] = useState<StepId>(defaultStart);
  const [employee, setEmployee] = useState<EmployeeData | undefined>(initialEmployee);
  const [role, setRole] = useState<RoleData | undefined>(initialRole);
  const [schedule, setSchedule] = useState<ScheduleData | undefined>(initialSchedule);
  const [prevYear, setPrevYear] = useState<PrevYearPosition | undefined>();
  const [docs, setDocs] = useState<YouthDocs>({});

  const isEdit = mode === 'edit';

  const titles: Record<StepId, { title: string; subtitle?: string }> = {
    employee: {
      title: isEdit ? 'פרטי עובד' : 'חיפוש עובד',
      subtitle: isEdit
        ? 'עדכנו את פרטי העובד אם יש שינויים.'
        : 'חפשו עובד קיים לפי ת.ז., או הוסיפו עובד חדש למערכת.',
    },
    role: {
      title: isEdit ? 'עריכת תפקיד' : 'בחירת תפקיד',
      subtitle: isEdit
        ? 'ערכו את פרטי התפקיד. כל החישובים יבוצעו מחדש.'
        : 'נא לבחור את התפקיד המתאים עבור העובד החדש מתוך הרשימה.',
    },
    schedule: { title: 'מערכת שעות' },
    summary: { title: isEdit ? 'סיכום ושמירת שינויים' : 'סיכום נתוני קליטה' },
  };

  return (
    <FormShell
      current={step}
      title={titles[step].title}
      subtitle={titles[step].subtitle}
      institution={institution.name}
      employeeName={employee?.name}
      roleName={role?.roleTitle}
      mode={isEdit ? 'edit' : 'new'}
      contactEmail={institution.payrollEmail}
    >
      {step === 'employee' && (
        <EmployeeStep
          token={token}
          initial={employee}
          institutionLayer={institution.layer}
          docs={docs}
          onDocsChange={setDocs}
          mode={isEdit ? 'edit' : 'new'}
          onNext={(data) => {
            setEmployee(data);
            setStep(isEdit ? 'schedule' : 'role');
          }}
          onBack={isEdit ? () => setStep('schedule') : undefined}
        />
      )}

      {step === 'role' && (
        <RoleStep
          token={token}
          initial={role}
          employee={employee}
          mosadName={institution.name}
          institutionLayer={institution.layer}
          isNewEmployee={!isEdit && employee?.recordId === null}
          docs={docs}
          onDocsChange={setDocs}
          onBack={() => setStep('employee')}
          onNext={(data, loadedPrevYear) => {
            setRole(data);
            setPrevYear(loadedPrevYear);
            setSchedule(undefined);
            setStep('schedule');
          }}
        />
      )}

      {step === 'schedule' && employee && role && (
        <ScheduleStep
          token={token}
          employee={employee}
          role={role}
          initial={schedule ?? (prevYear ? { ...emptySchedule(), week: prevYear.week, prevYearRecordId: prevYear.recordId } : undefined)}
          positionId={positionId}
          prevYear={prevYear}
          onBack={isEdit ? undefined : () => setStep('role')}
          onEditEmployee={isEdit ? () => setStep('employee') : undefined}
          onNext={(data) => {
            setSchedule(data);
            setStep('summary');
          }}
        />
      )}

      {step === 'summary' && employee && role && schedule && (
        <SummaryStep
          token={token}
          employee={employee}
          role={role}
          schedule={schedule}
          docs={docs}
          mode={isEdit ? 'edit' : 'new'}
          positionId={positionId}
          onBack={() => setStep('schedule')}
          onEdit={(s) => setStep(s)}
          onNewPosition={!isEdit ? () => {
            setRole(undefined);
            setSchedule(undefined);
            setPrevYear(undefined);
            setDocs({});
            setStep('role');
          } : undefined}
          onNewEmployee={!isEdit ? () => {
            setEmployee(undefined);
            setRole(undefined);
            setSchedule(undefined);
            setPrevYear(undefined);
            setDocs({});
            setStep('employee');
          } : undefined}
        />
      )}
    </FormShell>
  );
}
