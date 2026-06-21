"use client";

import { useState } from "react";

function PrivacyModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl shadow-xl max-w-lg w-full mx-4 p-8 flex flex-col gap-6 text-right"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-title-lg font-bold text-on-surface">הצהרת פרטיות</h2>
        <div className="text-body-md text-on-surface-variant flex flex-col gap-4">
          <p>
            המידע שתמסרו בטופס זה נאסף לצורך קליטת עובדים במוסד החינוכי בלבד, ומשמש להליכי גיוס,
            רישום ומינהל פנימי.
          </p>
          <p>
            הנתונים מאוחסנים בצורה מאובטחת ואינם מועברים לגורמים חיצוניים ללא הסכמתכם, אלא אם
            נדרש על פי דין.
          </p>
          <p>
            עומדת לכם הזכות לעיין במידע האישי שנשמר אודותיכם, לתקנו או לבקש את מחיקתו בכל עת,
            באמצעות פנייה אלינו בכתובת{" "}
            <a
              href="mailto:bs@irmb.co.il"
              className="text-primary underline hover:opacity-80"
            >
              bs@irmb.co.il
            </a>
            .
          </p>
          <p>השימוש בטופס מהווה הסכמה לאיסוף המידע לצרכים המפורטים לעיל.</p>
        </div>
        <button
          onClick={onClose}
          className="self-center mt-2 px-6 py-2 rounded-full bg-primary text-on-primary text-label-lg font-medium hover:opacity-90 transition-opacity"
        >
          סגור
        </button>
      </div>
    </div>
  );
}

export function Footer({ contactEmail }: { contactEmail?: string }) {
  const [showPrivacy, setShowPrivacy] = useState(false);
  const email = contactEmail || 'bs@irmb.co.il';

  return (
    <>
      {showPrivacy && <PrivacyModal onClose={() => setShowPrivacy(false)} />}
      <footer className="w-full flex justify-between items-center px-margin-desktop py-base mt-24 border-t border-outline-variant">
        <div className="flex gap-8">
          <button
            className="text-on-surface-variant text-label-sm hover:underline cursor-pointer bg-transparent border-none p-0"
            onClick={() => setShowPrivacy(true)}
          >
            פרטיות
          </button>
          <a
            className="text-on-surface-variant text-label-sm hover:underline cursor-pointer"
            href={`mailto:${email}`}
          >
            צור קשר
          </a>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-on-surface-variant text-label-sm">
            © 2026 כל הזכויות שמורות לרחל פיירשטין | פיתוח והטמעת מערכות לעסקים
          </p>
        </div>
      </footer>
    </>
  );
}
