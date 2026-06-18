/** The four wizard steps, shared by Sidebar and Stepper. */
export type StepId = 'employee' | 'role' | 'schedule' | 'summary';

export interface StepDef {
  id: StepId;
  label: string;
  icon: string;
}

export const STEPS: StepDef[] = [
  { id: 'employee', label: 'עובד', icon: 'person' },
  { id: 'role', label: 'תפקיד', icon: 'work' },
  { id: 'schedule', label: 'מערכת שעות', icon: 'calendar_month' },
  { id: 'summary', label: 'סיכום', icon: 'assignment_turned_in' },
];

export function stepIndex(id: StepId): number {
  return STEPS.findIndex((s) => s.id === id);
}
