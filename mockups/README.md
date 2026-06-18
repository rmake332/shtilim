# Stitch Mockups — Design Reference

These are the approved Stitch HTML mockups. They are the **design source of truth** for the implementation.

## Rule: shell from mockup 2
The fixed **shell** (header, sidebar, stepper, ContextBar, action bar, footer) is taken **always from `mockup-2-role.html`** (בחירת תפקיד). Only the **center content** varies per page. If another mockup shows a different shell, ignore its shell and take only its center content.

## Design tokens (from the mockups' `tailwind.config`)
- **Colors (Material 3):** `primary #003466`, `primary-container #1a4b84`, `on-primary #ffffff`, `primary-fixed #d5e3ff`, `tertiary-fixed #89f5e7`, `tertiary-fixed-dim #6bd8cb` (active step ring), `background #f7f9fb`, `surface-container-lowest #ffffff`, `surface-container-low #f2f4f6`, `surface-container-high #e6e8ea`, `surface-container-highest #e0e3e5`, `secondary-container #d0e1fb`, `secondary-fixed #d3e4fe`, `on-surface-variant #424750`, `outline-variant #c3c6d1`, `error #ba1a1a`, `error-container #ffdad6`
- **Font:** Rubik (300–800). Scale: display-lg 48/700, headline-lg 32/600, headline-md 24/600, body-lg 18/400, body-md 16/400, label-lg 14/500, label-sm 12/500
- **Radius:** lg 0.5rem, xl 0.75rem, full. **Spacing:** base 8px, gutter 24px, margin-desktop 48px
- **Icons:** Material Symbols Outlined
- **Standards:** ActionBar = inner blue card `rounded-2xl`. Sidebar subtitle = "מערכת תקציבים". Selected row = bg `#d3e4fe` + `border-right: 4px solid #003466`.

## Files
- `mockup-1-employee.html` — Step 1: employee search / add new
- `mockup-2-role.html` — Step 2: role selection (**shell source of truth**)
- `mockup-3-schedule.html` — Step 3: weekly schedule entry
- `mockup-4-summary.html` — Step 4: summary
