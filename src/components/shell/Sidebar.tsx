'use client';

import { Icon } from '@/components/ui/Icon';
import { STEPS, StepId, stepIndex } from '@/lib/steps';

/** Right fixed sidebar — shell from mockup 2. Title "טופס קליטה / מערכת תקציבים" + vertical nav + help card. */
export function Sidebar({ current, contactEmail }: { current: StepId; contactEmail?: string }) {
  const currentIdx = stepIndex(current);
  const email = contactEmail || 'bs@irmb.co.il';

  return (
    <aside className="fixed right-0 top-0 h-full flex flex-col pt-24 pb-8 px-4 z-40 bg-surface-container-low shadow-md w-64">
      <nav className="flex flex-col gap-2 mt-2">
        {STEPS.map((step, idx) => {
          const active = step.id === current;
          const done = idx < currentIdx;
          return (
            <div
              key={step.id}
              className={`flex items-center gap-4 p-3 rounded-lg transition-all ${
                active
                  ? 'bg-primary-container text-on-primary-container'
                  : 'text-on-surface-variant'
              }`}
            >
              {done ? (
                <Icon name="check_circle" fill className="text-primary" />
              ) : (
                <Icon name={step.icon} />
              )}
              <span className="text-body-md">{step.label}</span>
            </div>
          );
        })}
      </nav>

      <div className="mt-auto px-4">
        <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant shadow-card">
          <p className="text-label-sm font-bold text-primary mb-2">צריך עזרה?</p>
          <p className="text-label-sm text-on-surface-variant mb-3">זקוק לעזרה בתהליך הקליטה?</p>
          <a
            href={`mailto:${email}`}
            className="block w-full py-2 text-center bg-secondary-fixed text-on-secondary-container text-label-lg rounded-lg hover:bg-secondary-fixed-dim transition-colors"
          >
            צור קשר
          </a>
        </div>
      </div>
    </aside>
  );
}
