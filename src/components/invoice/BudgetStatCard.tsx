'use client';

import { Icon } from '@/components/ui/Icon';

/**
 * כרטיס KPI - לשעות/תקציב מול מכסה (לשימוש בהקצאה השנתית ובדיווח החודשי).
 * כש-current/max לא מועברים, מוצג כערך קבוע ללא פס התקדמות (למשל תעריף שעתי מקסימלי).
 */
export function BudgetStatCard({
  icon,
  label,
  valueLabel,
  current,
  max,
  color,
}: {
  icon: string;
  label: string;
  valueLabel: string;
  current?: number;
  max?: number;
  color: 'primary' | 'secondary' | 'tertiary';
}) {
  const hasBar = current != null && max != null;
  const over = hasBar && max > 0 && current > max;
  const pct = hasBar && max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const bg = { primary: 'bg-primary-fixed', secondary: 'bg-secondary-container', tertiary: 'bg-tertiary-fixed' };
  const text = { primary: 'text-primary', secondary: 'text-secondary', tertiary: 'text-tertiary' };
  const bar = { primary: 'bg-primary', secondary: 'bg-secondary', tertiary: 'bg-tertiary' };
  return (
    <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/50">
      <div className={`flex flex-row-reverse items-center justify-between ${hasBar ? 'mb-3' : ''}`}>
        <div className="text-right">
          <p className="text-label-sm text-on-surface-variant">{label}</p>
          <p className={`text-headline-sm font-bold ${over ? 'text-error' : text[color]}`}>{valueLabel}</p>
        </div>
        <div
          className={`w-12 h-12 rounded-lg flex items-center justify-center ${
            over ? 'bg-error-container text-error' : `${bg[color]} ${text[color]}`
          }`}
        >
          <Icon name={icon} className="text-[22px]" />
        </div>
      </div>
      {hasBar && (
        <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
          <div className={`h-full transition-all ${over ? 'bg-error' : bar[color]}`} style={{ width: `${pct}%` }} />
        </div>
      )}
      {over && <p className="text-error text-label-sm mt-1.5">חריגה מהמכסה</p>}
    </div>
  );
}
