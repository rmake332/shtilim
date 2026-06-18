'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ActionBar } from '@/components/shell/ActionBar';
import { RoleData, EmployeeData, emptyRole } from '@/lib/formTypes';
import type { PrevYearPosition } from '@/lib/prevYearPosition';

interface SymbolOption {
  id: string;
  label: string;
}
interface RoleOption {
  id: string;
  title: string;
  category: string;
  scheduleType: string | null;
  remainingHours: number;
  layer: string[];
  paraBoard: boolean;
  ofekChadash: boolean;
  severeDisability: boolean;
  bellScheduleNums: string[];
}
interface ExtraLine {
  id: string;
  title: string;
  remainingHours: number;
}

const LAYER_OPTIONS = ['גנים', 'יסודי', 'חטיבה', 'שכר יסוד'];
const PARA_CATEGORY = 'פרא רפואי';

export function RoleStep({
  token,
  initial,
  employee,
  mosadName,
  institutionLayer,
  onNext,
  onBack,
}: {
  token: string;
  initial?: RoleData;
  employee?: EmployeeData;
  mosadName?: string;
  /** שכבת המוסד — fallback when the selected budget row carries no layer of its own. */
  institutionLayer?: string;
  onNext: (data: RoleData, prevYear?: PrevYearPosition) => void;
  onBack: () => void;
}) {
  const [symbols, setSymbols] = useState<SymbolOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [gemulLines, setGemulLines] = useState<ExtraLine[]>([]);
  const [extraRoleLines, setExtraRoleLines] = useState<ExtraLine[]>([]);
  const [data, setData] = useState<RoleData>(initial ?? emptyRole());
  const [addGemul, setAddGemul] = useState((initial?.selectedGemulIds.length ?? 0) > 0);
  const [addRoles, setAddRoles] = useState((initial?.selectedExtraRoleIds.length ?? 0) > 0);
  const [roleQuery, setRoleQuery] = useState('');
  const [error, setError] = useState('');
  const [prevYear, setPrevYear] = useState<PrevYearPosition | null>(null);
  const [prevYearLoading, setPrevYearLoading] = useState(false);
  const [prevYearChecked, setPrevYearChecked] = useState(false);
  const [loadedPrevYear, setLoadedPrevYear] = useState<PrevYearPosition | undefined>(undefined);
  const prevYearAbort = useRef<AbortController | null>(null);

  // Load symbols once.
  useEffect(() => {
    fetch(`/api/symbols?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => setSymbols(j.symbols ?? []))
      .catch(() => setSymbols([]));
  }, [token]);

  // Load roles when a symbol is picked.
  useEffect(() => {
    if (!data.symbolId) {
      setRoles([]);
      return;
    }
    fetch(`/api/roles?token=${encodeURIComponent(token)}&symbolId=${encodeURIComponent(data.symbolId)}`)
      .then((r) => r.json())
      .then((j) => setRoles(j.roles ?? []))
      .catch(() => setRoles([]));
  }, [token, data.symbolId]);

  // Restore gemul/extra-role lists when returning from a later step.
  useEffect(() => {
    if ((initial?.selectedGemulIds.length ?? 0) > 0) loadExtra('gemul');
    if ((initial?.selectedExtraRoleIds.length ?? 0) > 0) loadExtra('roles');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for a prior-year position whenever a role is selected.
  useEffect(() => {
    if (prevYearAbort.current) prevYearAbort.current.abort();
    setPrevYear(null);
    setPrevYearChecked(false);
    setLoadedPrevYear(undefined);

    const tz = employee?.tz;
    const roleTitle = data.roleTitle;
    const category = data.category;
    const mName = mosadName;
    if (!tz || !roleTitle || !category || !mName) return;

    const ctrl = new AbortController();
    prevYearAbort.current = ctrl;
    setPrevYearLoading(true);

    const params = new URLSearchParams({
      token,
      tz,
      roleTitle,
      category,
      mosadName: mName,
    });
    fetch(`/api/prev-year-position?${params}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        if (j.found) {
          setPrevYear({ week: j.week, subRole: j.subRole, notes: j.notes });
        }
        setPrevYearChecked(true);
      })
      .catch(() => {})
      .finally(() => { if (!ctrl.signal.aborted) setPrevYearLoading(false); });

    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.roleId]);

  function loadExtra(kind: 'gemul' | 'roles') {
    fetch(`/api/roles?token=${encodeURIComponent(token)}&extra=${kind}`)
      .then((r) => r.json())
      .then((j) => (kind === 'gemul' ? setGemulLines(j.lines ?? []) : setExtraRoleLines(j.lines ?? [])))
      .catch(() => {});
  }

  function pickSymbol(id: string) {
    const sym = symbols.find((s) => s.id === id);
    setData({ ...emptyRole(), symbolId: id, symbolLabel: sym?.label ?? '' });
    setRoleQuery('');
    setError('');
  }

  function pickRole(role: RoleOption) {
    if (role.remainingHours <= 0) {
      setError('לתפקיד זה אין שעות פנויות');
      return;
    }
    setError('');
    setLoadedPrevYear(undefined);
    setData((d) => ({
      ...d,
      roleId: role.id,
      roleTitle: role.title,
      category: role.category,
      scheduleType: role.scheduleType,
      remainingHours: role.remainingHours,
      layer: role.layer[0] ?? institutionLayer ?? '',
      subRole: '',
      paraBoard: role.paraBoard,
      ofekChadash: role.ofekChadash,
      severeDisability: role.severeDisability,
      bellScheduleNums: role.bellScheduleNums,
    }));
  }

  const selectedRole = roles.find((r) => r.id === data.roleId);
  const q = roleQuery.trim();
  const filteredRoles = q
    ? roles.filter((r) => r.title.includes(q) || r.category.includes(q))
    : roles;
  const needsLayer = Boolean(selectedRole && selectedRole.layer.length === 0 && !institutionLayer);
  const isPara = data.category === PARA_CATEGORY;

  function validateAndNext(withPrevYear?: PrevYearPosition) {
    if (!data.roleId) {
      setError('יש לבחור תפקיד');
      return;
    }
    if (data.remainingHours <= 0) {
      setError('לתפקיד זה אין שעות פנויות');
      return;
    }
    if (needsLayer && !data.layer) {
      setError('יש לבחור שכבה');
      return;
    }
    // When loading from prior year, subRole comes from there; otherwise require manual input.
    const effectiveSubRole = withPrevYear?.subRole?.trim() || data.subRole.trim();
    if (isPara && !effectiveSubRole) {
      setError('יש להזין תת תפקיד');
      return;
    }
    const finalData = withPrevYear?.subRole?.trim()
      ? { ...data, subRole: withPrevYear.subRole.trim() }
      : data;
    setError('');
    onNext(finalData, withPrevYear);
  }

  return (
    <>
      {/* Symbol dropdown */}
      <div className="mb-6 max-w-md">
        <label className="text-label-lg text-on-surface block mb-2">סמל מוסד</label>
        <select
          className="w-full bg-white border border-outline-variant rounded-xl py-3 px-3 focus:ring-2 focus:ring-primary text-body-md shadow-card"
          value={data.symbolId}
          onChange={(e) => pickSymbol(e.target.value)}
        >
          <option value="">בחר סמל מוסד</option>
          {symbols.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Role search */}
      {data.symbolId && (
        <div className="relative w-full md:w-1/2 lg:w-1/3 mb-4">
          <Icon
            name="search"
            className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            className="w-full pr-12 pl-4 py-3 bg-white border border-outline-variant rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all text-body-md outline-none shadow-card"
            placeholder="חיפוש תפקיד..."
            value={roleQuery}
            onChange={(e) => setRoleQuery(e.target.value)}
          />
        </div>
      )}

      {/* Roles table — collapsed to selected row once a role is picked */}
      {data.symbolId && (
        <div className="bg-white rounded-xl shadow-card border border-outline-variant overflow-hidden mb-4">
          <div className="grid grid-cols-12 bg-surface-container-low px-6 py-4 border-b border-outline-variant text-label-lg font-bold text-on-surface-variant">
            <div className="col-span-1">בחירה</div>
            <div className="col-span-5">שם התפקיד</div>
            <div className="col-span-3">קטגוריה</div>
            <div className="col-span-3 text-center">יתרת שעות</div>
          </div>
          {selectedRole ? (
            // Collapsed: show only selected role + change button
            <div className="grid grid-cols-12 px-6 py-3 items-center selected-row">
              <div className="col-span-1">
                <div className="w-6 h-6 rounded-full border-2 border-primary bg-primary flex items-center justify-center">
                  <Icon name="check" className="text-white text-[16px]" fill />
                </div>
              </div>
              <div className="col-span-5 font-medium text-on-surface">{selectedRole.title}</div>
              <div className="col-span-3 text-on-surface-variant text-body-md">{selectedRole.category}</div>
              <div className="col-span-3 flex items-center justify-end gap-3">
                <span className="px-3 py-1 rounded-full text-label-sm font-bold bg-tertiary-fixed text-on-tertiary-fixed">
                  {selectedRole.remainingHours} שעות
                </span>
                <button
                  type="button"
                  className="px-3 py-1 rounded-lg border border-primary text-primary text-label-sm font-semibold hover:bg-primary/10 transition-colors shrink-0"
                  onClick={() => setData((d) => ({ ...emptyRole(), symbolId: d.symbolId, symbolLabel: d.symbolLabel }))}
                >
                  שנה
                </button>
              </div>
            </div>
          ) : (
            // Expanded: full list
            <div className="divide-y divide-outline-variant/30 max-h-[460px] overflow-y-auto">
              {roles.length === 0 && (
                <div className="px-6 py-6 text-on-surface-variant text-body-md">אין תפקידים זמינים לסמל זה.</div>
              )}
              {roles.length > 0 && filteredRoles.length === 0 && (
                <div className="px-6 py-6 text-on-surface-variant text-body-md">לא נמצאו תפקידים התואמים לחיפוש.</div>
              )}
              {filteredRoles.map((role) => {
                const noHours = role.remainingHours <= 0;
                return (
                  <div
                    key={role.id}
                    className={`grid grid-cols-12 px-6 py-3 items-center transition-colors cursor-pointer hover:bg-secondary-container/20 ${noHours ? 'opacity-50' : ''}`}
                    onClick={() => pickRole(role)}
                  >
                    <div className="col-span-1">
                      <div className="w-6 h-6 rounded-full border-2 border-outline-variant bg-white flex items-center justify-center" />
                    </div>
                    <div className="col-span-5 font-medium text-on-surface">{role.title}</div>
                    <div className="col-span-3 text-on-surface-variant text-body-md">{role.category}</div>
                    <div className="col-span-3 text-center">
                      <span
                        className={`px-3 py-1 rounded-full text-label-sm font-bold ${
                          role.remainingHours > 0
                            ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                            : 'bg-surface-container-high text-on-surface-variant'
                        }`}
                      >
                        {role.remainingHours} שעות
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Remaining-hours note */}
      {selectedRole && data.remainingHours > 0 && (
        <p className="text-on-surface-variant text-label-lg mb-4">
          נותרו {data.remainingHours} שעות לניצול עבור התפקיד שנבחר.
        </p>
      )}

      {/* No prior-year match notice */}
      {selectedRole && !prevYearLoading && prevYearChecked && !prevYear && !loadedPrevYear && (
        <div className="mb-4 p-4 rounded-xl border border-primary/40 bg-primary-container/30 flex items-start gap-3">
          <Icon name="info" className="text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-label-lg font-semibold text-on-surface mb-1">
              לא נמצא תקן מהשנה הקודמת
            </p>
            <p className="text-body-sm text-on-surface-variant">
              לא קיים תפקיד זהה עבור עובד זה בשנה שעברה (תשפ&quot;ו). יש להזין את מערכת השעות ידנית.
            </p>
          </div>
        </div>
      )}

      {/* Prior-year position banner */}
      {selectedRole && !prevYearLoading && prevYear && !loadedPrevYear && (
        <div className="mb-4 p-4 rounded-xl border border-primary/40 bg-primary-container/30 flex items-start gap-3">
          <Icon name="history" className="text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-label-lg font-semibold text-on-surface mb-1">
              נמצא תקן מהשנה הקודמת (תשפ&quot;ו)
            </p>
            <p className="text-body-sm text-on-surface-variant mb-3">
              קיים תפקיד זהה עבור עובד זה בשנה שעברה. ניתן לטעון את מערכת השעות שלו ולחסוך הזנה ידנית.
            </p>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-label-md font-semibold hover:bg-primary/90 transition-colors"
              onClick={() => {
                setLoadedPrevYear(prevYear);
                if (prevYear.subRole) {
                  setData((d) => ({ ...d, subRole: prevYear.subRole }));
                }
              }}
            >
              טען מהשנה הקודמת
            </button>
          </div>
        </div>
      )}

      {/* Loaded prior-year confirmation */}
      {selectedRole && loadedPrevYear && (
        <div className="mb-4 p-4 rounded-xl border border-tertiary/40 bg-tertiary-container/30 flex items-start gap-3">
          <Icon name="check_circle" className="text-tertiary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-label-lg font-semibold text-on-surface mb-1">
              מערכת השעות נטענה מהשנה הקודמת
            </p>
            <p className="text-body-sm text-on-surface-variant">
              שעות הכניסה והיציאה יועברו לשלב הבא. ניתן לערוך אותן לאחר מעבר לשלב מערכת השעות.
            </p>
            {loadedPrevYear.notes && (
              <p className="text-body-sm text-on-surface-variant mt-1">
                <span className="font-semibold">הערות:</span> {loadedPrevYear.notes}
              </p>
            )}
          </div>
          <button
            type="button"
            className="text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
            title="בטל טעינה"
            onClick={() => {
              setLoadedPrevYear(undefined);
              setData((d) => ({ ...d, subRole: '' }));
            }}
          >
            <Icon name="close" />
          </button>
        </div>
      )}

      {/* Conditional fields */}
      {selectedRole && (
        <section className="bg-white p-6 rounded-xl shadow-card border border-outline-variant mb-4 space-y-5">
          {needsLayer && (
            <div className="max-w-xs">
              <label className="text-label-lg text-on-surface block mb-2">
                שכבה <span className="text-error">*</span>
              </label>
              <select
                className="w-full bg-surface-container-low rounded-lg py-3 px-3 text-body-md"
                value={data.layer}
                onChange={(e) => setData((d) => ({ ...d, layer: e.target.value }))}
              >
                <option value="">בחר שכבה</option>
                {LAYER_OPTIONS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isPara && (
            <div className="max-w-md">
              <label className="text-label-lg text-on-surface block mb-2">
                תת תפקיד <span className="text-error">*</span>
              </label>
              <input
                className="w-full bg-surface-container-low rounded-lg py-3 px-3 text-body-md"
                value={data.subRole}
                onChange={(e) => setData((d) => ({ ...d, subRole: e.target.value }))}
                placeholder="לדוגמה: ריפוי בעיסוק"
              />
            </div>
          )}

          {/* Gemulim */}
          <div>
            <label className="flex items-center gap-2 text-body-md text-on-surface cursor-pointer">
              <input
                type="checkbox"
                checked={addGemul}
                onChange={(e) => {
                  setAddGemul(e.target.checked);
                  if (e.target.checked) loadExtra('gemul');
                  else setData((d) => ({ ...d, selectedGemulIds: [] }));
                }}
              />
              הוספת גמולים
            </label>
            {addGemul && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {gemulLines.length === 0 && <p className="text-on-surface-variant text-label-sm">אין גמולים זמינים.</p>}
                {gemulLines.map((g) => (
                  <CheckboxLine
                    key={g.id}
                    line={g}
                    checked={data.selectedGemulIds.includes(g.id)}
                    onToggle={(checked) =>
                      setData((d) => ({
                        ...d,
                        selectedGemulIds: checked
                          ? [...d.selectedGemulIds, g.id]
                          : d.selectedGemulIds.filter((x) => x !== g.id),
                        selectedGemulTitles: checked
                          ? [...d.selectedGemulTitles, g.title]
                          : d.selectedGemulTitles.filter((x) => x !== g.title),
                      }))
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Extra roles */}
          <div>
            <label className="flex items-center gap-2 text-body-md text-on-surface cursor-pointer">
              <input
                type="checkbox"
                checked={addRoles}
                onChange={(e) => {
                  setAddRoles(e.target.checked);
                  if (e.target.checked) loadExtra('roles');
                  else setData((d) => ({ ...d, selectedExtraRoleIds: [] }));
                }}
              />
              הוספת תפקידים
            </label>
            {addRoles && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                {extraRoleLines.length === 0 && (
                  <p className="text-on-surface-variant text-label-sm">אין תפקידים זמינים.</p>
                )}
                {extraRoleLines.map((g) => (
                  <CheckboxLine
                    key={g.id}
                    line={g}
                    checked={data.selectedExtraRoleIds.includes(g.id)}
                    onToggle={(checked) =>
                      setData((d) => ({
                        ...d,
                        selectedExtraRoleIds: checked
                          ? [...d.selectedExtraRoleIds, g.id]
                          : d.selectedExtraRoleIds.filter((x) => x !== g.id),
                        selectedExtraRoleTitles: checked
                          ? [...d.selectedExtraRoleTitles, g.title]
                          : d.selectedExtraRoleTitles.filter((x) => x !== g.title),
                      }))
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-error-container text-on-error-container text-body-md flex items-center gap-2">
          <Icon name="error" /> {error}
        </div>
      )}

      <ActionBar
        title="השלמת בחירת תפקיד"
        subtitle="לאחר המעבר לשלב הבא, תגדירו את מערכת השעות עבור התפקיד הנבחר."
        onBack={onBack}
        onNext={() => validateAndNext(loadedPrevYear)}
      />
    </>
  );
}

function CheckboxLine({
  line,
  checked,
  onToggle,
}: {
  line: ExtraLine;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 p-3 rounded-lg border border-outline-variant cursor-pointer hover:bg-surface-container-low">
      <span className="flex items-center gap-2 text-body-md">
        <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
        {line.title}
      </span>
      <span className="px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed text-label-sm font-bold">
        {line.remainingHours} ש'
      </span>
    </label>
  );
}
