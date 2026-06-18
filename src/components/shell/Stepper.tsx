'use client';

import { Icon } from '@/components/ui/Icon';
import { STEPS, StepId, stepIndex } from '@/lib/steps';

/**
 * Horizontal stepper — shell from mockup 2 (integrated, compact).
 * Completed: solid primary + check. Active: white circle with teal ring + number.
 * Upcoming: outlined.
 */
export function Stepper({ current }: { current: StepId }) {
  const currentIdx = stepIndex(current);
  // Mockup 2 shows 3 visible steps in the integrated stepper; show all 4 here for clarity.
  return (
    <div className="hidden lg:flex items-center gap-2 min-w-[340px]">
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <div key={step.id} className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              {done ? (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary">
                  <Icon name="check" className="text-sm" fill />
                </div>
              ) : active ? (
                <div className="w-10 h-10 rounded-full border-4 border-tertiary-fixed-dim bg-white flex items-center justify-center text-primary font-bold text-label-lg shadow-md">
                  {idx + 1}
                </div>
              ) : (
                <div className="w-8 h-8 rounded-full border-2 border-outline-variant bg-white flex items-center justify-center text-on-surface-variant text-label-lg">
                  {idx + 1}
                </div>
              )}
              <span
                className={`text-label-sm mt-1 whitespace-nowrap ${
                  done || active ? 'text-primary font-bold' : 'text-on-surface-variant'
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`h-1 w-10 rounded-full ${done ? 'bg-primary' : 'bg-surface-container-highest'}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
