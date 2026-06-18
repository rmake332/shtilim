'use client';

/**
 * Inner blue action card (mockup 2, rounded-2xl). No title text.
 * Buttons span the width: "המשך לשלב הבא" on the LEFT, "חזרה לשלב הקודם" on the RIGHT (RTL).
 */
export function ActionBar({
  nextLabel = 'המשך לשלב הבא',
  backLabel = 'חזרה לשלב הקודם',
  onNext,
  onBack,
  onEditEmployee,
  nextDisabled = false,
  showBack = true,
  // accepted for backwards-compat but no longer rendered
  title: _title,
  subtitle: _subtitle,
}: {
  nextLabel?: string;
  backLabel?: string;
  onNext?: () => void;
  onBack?: () => void;
  onEditEmployee?: () => void;
  nextDisabled?: boolean;
  showBack?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const hasLeft = showBack || !!onEditEmployee;
  return (
    <div className="mt-8 flex justify-between items-center p-4 bg-primary rounded-2xl shadow-xl shadow-primary/10">
      {/* RIGHT in RTL (first child = start = right): Back + optional edit-employee */}
      {hasLeft ? (
        <div className="flex items-center gap-3">
          {showBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-8 py-2.5 border border-white/30 text-white font-bold rounded-xl hover:bg-white/10 transition-all active:scale-95"
            >
              {backLabel}
            </button>
          )}
          {onEditEmployee && (
            <button
              type="button"
              onClick={onEditEmployee}
              className="px-6 py-2.5 border border-white/30 text-white font-bold rounded-xl hover:bg-white/10 transition-all active:scale-95 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
              עריכת פרטי עובד
            </button>
          )}
        </div>
      ) : (
        <span />
      )}

      {/* LEFT in RTL (last child = end = left): Next */}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="px-8 py-2.5 bg-white text-primary font-bold rounded-xl hover:bg-primary-fixed transition-all active:scale-95 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {nextLabel}
      </button>
    </div>
  );
}
