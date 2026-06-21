import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { Stepper } from './Stepper';
import { Footer } from './Footer';
import { StepId } from '@/lib/steps';

/**
 * Fixed shell wrapper (from mockup 2). Pages render only their center content as children.
 * header (top) + sidebar (right, w-64) + main (mr-64) with stepper + footer.
 */
export function FormShell({
  current,
  title,
  subtitle,
  institution,
  employeeName,
  roleName,
  mode = 'new',
  contactEmail,
  children,
}: {
  current: StepId;
  title: string;
  subtitle?: string;
  institution?: string;
  employeeName?: string;
  roleName?: string;
  mode?: 'new' | 'edit';
  contactEmail?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav institution={institution} employeeName={employeeName} roleName={roleName} mode={mode} />
      <div className="flex flex-1">
        <Sidebar current={current} contactEmail={contactEmail} />
        <main className="flex-1 mr-64 p-margin-desktop bg-surface-bright">
          <div className="max-w-container-max mx-auto">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h1 className="text-display-lg text-primary mb-2">{title}</h1>
                {subtitle && <p className="text-body-lg text-on-surface-variant">{subtitle}</p>}
              </div>
              <Stepper current={current} />
            </div>
            {children}
          </div>
          <Footer contactEmail={contactEmail} />
        </main>
      </div>
    </div>
  );
}
