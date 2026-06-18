/**
 * "מחשבון אופק חדש" key building and the derived computations (mother-position,
 * severe-disability bonus, job percent, stay-hours split). Pure & unit-tested.
 */

export interface MotherPositionInput {
  gender: string; // 'נקבה' | 'זכר'
  maritalStatus: string;
  hasChildrenUnder14: boolean;
  jobPercent: number;
}

/** משרת אם = כן only if: female, not single, has children <14, job% >= 79. */
export function isMotherPosition({
  gender,
  maritalStatus,
  hasChildrenUnder14,
  jobPercent,
}: MotherPositionInput): boolean {
  if (gender !== 'נקבה') return false;
  if (maritalStatus.includes('רווק')) return false; // רווק/ה
  if (!hasChildrenUnder14) return false;
  return jobPercent >= 79;
}

/** Job percent = (total final hours / 36) * 100. */
export function jobPercent(finalHours: number): number {
  return (finalHours / 36) * 100;
}

/**
 * Ofek lookup key = שכבה + שעות_גיל + משרת_אם + קטגוריה + סך_שעות_סופי
 * Example: "חטיבה0כןהוראה5"
 */
export function buildOfekKey(params: {
  layer: string;
  ageHours: number | string;
  motherPosition: boolean;
  category: string; // הוראה | פרא
  totalHours: number;
}): string {
  const mother = params.motherPosition ? 'כן' : 'לא';
  return `${params.layer}${params.ageHours}${mother}${params.category}${params.totalHours}`;
}

export interface SevereDisabilityInput {
  severeDisabilityFlag: boolean; // בונוס לקות קשה on budget
  paraBoard: boolean; // לוח פרא
  isBehaviorAnalyst: boolean; // תפקיד = מנתחת התנהגות
  finalLayer: string; // שכבה סופית
  enteredHours: number; // sum of entered schedule hours
}

/**
 * Severe-disability hour bonus (פרא):
 *  - none if flag off, OR (behavior-analyst + paraBoard)
 *  - if flag on + !paraBoard + layer ∈ {יסודי, גנים} + !behavior-analyst:
 *      enteredHours < 15 → +1 ; >= 15 → +2
 */
export function severeDisabilityBonus({
  severeDisabilityFlag,
  paraBoard,
  isBehaviorAnalyst,
  finalLayer,
  enteredHours,
}: SevereDisabilityInput): number {
  if (!severeDisabilityFlag) return 0;
  if (isBehaviorAnalyst && paraBoard) return 0;
  const layerOk = finalLayer === 'יסודי' || finalLayer === 'גנים';
  if (paraBoard || !layerOk || isBehaviorAnalyst) return 0;
  return enteredHours < 15 ? 1 : 2;
}

export interface StaySplitInput {
  paraBoard: boolean;
  layer: string;
  category: string;
  isBehaviorAnalyst: boolean;
}

/** Returns 'institution' (מהמוסד) or 'home' (מהבית) for para stay hours. */
export function paraStaySplit({
  paraBoard,
  layer,
  category,
  isBehaviorAnalyst,
}: StaySplitInput): 'institution' | 'home' {
  // מהמוסד if: paraBoard OR layer=גנים OR (layer=גנים + behavior-analyst)
  if (paraBoard || layer === 'גנים') return 'institution';
  // מהבית if: !paraBoard + layer≠גנים + category≠הוראה + !behavior-analyst
  if (!paraBoard && layer !== 'גנים' && category !== 'הוראה' && !isBehaviorAnalyst) {
    return 'home';
  }
  return 'institution';
}

/** Per-day para hours: total daily minutes divided by 45 (academic units). */
export function paraDailyUnits(dailyMinutes: number): number {
  return dailyMinutes / 45;
}
