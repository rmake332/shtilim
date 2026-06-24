'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ActionBar } from '@/components/shell/ActionBar';
import { RoleData, EmployeeData, YouthDocs, emptyRole, ageFromBirthDate } from '@/lib/formTypes';
import { CATEGORY, DOC_FIELDS, POSITION_FIELDS } from '@/lib/airtable/schema';
import { DocUpload } from '@/components/steps/DocUpload';
import type { PrevYearPosition } from '@/lib/prevYearPosition';

const HIDDEN_CATEGORIES = new Set<string>([CATEGORY.invoice]);

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="px-6 py-6 flex items-center gap-3 text-on-surface-variant text-body-md">
      <svg className="animate-spin h-5 w-5 text-primary shrink-0" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      {label}
    </div>
  );
}

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
  salaryType: string | null;
  tariff: string | null;
  ranking: string | null;
  seniority: string | null;
}
interface ExtraLine {
  id: string;
  title: string;
  remainingCount: number;
}

const LAYER_OPTIONS = ['גנים', 'יסודי', 'חטיבה', 'שכר יסוד'];
const PARA_CATEGORY = 'פרא רפואי';
const GEMUL_ALLOWED_CATEGORIES = new Set(['הוראה', 'פרא רפואי']);

export function RoleStep({
  token,
  initial,
  employee,
  mosadName,
  institutionLayer,
  isNewEmployee,
  docs,
  onDocsChange,
  onNext,
  onBack,
}: {
  token: string;
  initial?: RoleData;
  employee?: EmployeeData;
  mosadName?: string;
  /** שכבת המוסד — fallback when the selected budget row carries no layer of its own. */
  institutionLayer?: string;
  /** true כשהעובד נוצר חדש בטופס הנוכחי (לא נבחר מרשימה קיימת). */
  isNewEmployee?: boolean;
  docs: YouthDocs;
  onDocsChange: (docs: YouthDocs) => void;
  onNext: (data: RoleData, prevYear?: PrevYearPosition) => void;
  onBack: () => void;
}) {
  const [symbols, setSymbols] = useState<SymbolOption[]>([]);
  const [symbolsLoading, setSymbolsLoading] = useState(true);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [gemulLines, setGemulLines] = useState<ExtraLine[]>([]);
  const [gemulLoading, setGemulLoading] = useState(false);
  const [extraRoleLines, setExtraRoleLines] = useState<ExtraLine[]>([]);
  const [extraRolesLoading, setExtraRolesLoading] = useState(false);
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
  const [subRoleChoices, setSubRoleChoices] = useState<string[]>([]);

  // Load symbols once. Auto-select if only one exists.
  useEffect(() => {
    setSymbolsLoading(true);
    fetch(`/api/symbols?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => {
        const list: SymbolOption[] = j.symbols ?? [];
        setSymbols(list);
        if (list.length === 1 && !data.symbolId) {
          setData((d) => ({ ...d, symbolId: list[0].id, symbolLabel: list[0].label }));
        }
      })
      .catch(() => setSymbols([]))
      .finally(() => setSymbolsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Load roles when a symbol is picked.
  useEffect(() => {
    if (!data.symbolId) {
      setRoles([]);
      setRolesLoading(false);
      return;
    }
    setRolesLoading(true);
    fetch(`/api/roles?token=${encodeURIComponent(token)}&symbolId=${encodeURIComponent(data.symbolId)}`)
      .then((r) => r.json())
      .then((j) => setRoles(j.roles ?? []))
      .catch(() => setRoles([]))
      .finally(() => setRolesLoading(false));
  }, [token, data.symbolId]);

  // Restore gemul/extra-role lists when returning from a later step.
  useEffect(() => {
    if ((initial?.selectedGemulIds.length ?? 0) > 0) loadExtra('gemul');
    if ((initial?.selectedExtraRoleIds.length ?? 0) > 0) loadExtra('roles');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load subRole choices from Airtable when a para role is selected.
  useEffect(() => {
    if (data.category !== PARA_CATEGORY) { setSubRoleChoices([]); return; }
    fetch(`/api/field-choices?token=${encodeURIComponent(token)}&fieldId=fldNEsEr5LCQujJmN`)
      .then((r) => r.json())
      .then((j) => setSubRoleChoices(j.choices ?? []))
      .catch(() => setSubRoleChoices([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.roleId]);

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
          setPrevYear({ recordId: j.recordId ?? '', week: j.week, subRole: j.subRole, notes: j.notes, hoursForBudget: j.hoursForBudget ?? null, frontalHours: j.frontalHours ?? null, individualHours: j.individualHours ?? null, stayHours: j.stayHours ?? null });
        }
        setPrevYearChecked(true);
      })
      .catch(() => {})
      .finally(() => { if (!ctrl.signal.aborted) setPrevYearLoading(false); });

    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.roleId]);

  function loadExtra(kind: 'gemul' | 'roles') {
    if (kind === 'gemul') setGemulLoading(true);
    else setExtraRolesLoading(true);
    fetch(`/api/roles?token=${encodeURIComponent(token)}&extra=${kind}`)
      .then((r) => r.json())
      .then((j) => (kind === 'gemul' ? setGemulLines(j.lines ?? []) : setExtraRoleLines(j.lines ?? [])))
      .catch(() => {})
      .finally(() => { if (kind === 'gemul') setGemulLoading(false); else setExtraRolesLoading(false); });
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
      salaryType: role.salaryType ?? null,
      tariff: role.tariff ?? null,
      ranking: role.ranking ?? null,
      seniority: role.seniority ?? null,
    }));
  }

  const selectedRole = roles.find((r) => r.id === data.roleId);
  const q = roleQuery.trim();
  const filteredRoles = (q
    ? roles.filter((r) => r.title.includes(q) || r.category.includes(q))
    : roles
  ).filter((r) => !HIDDEN_CATEGORIES.has(r.category));

  // Group filtered roles by category, preserving insertion order
  const rolesByCategory: { category: string; roles: RoleOption[] }[] = [];
  for (const role of filteredRoles) {
    const group = rolesByCategory.find((g) => g.category === role.category);
    if (group) group.roles.push(role);
    else rolesByCategory.push({ category: role.category, roles: [role] });
  }
  const needsLayer = Boolean(selectedRole && selectedRole.layer.length === 0 && !institutionLayer);
  const isPara = data.category === PARA_CATEGORY;
  const canAddGemul = GEMUL_ALLOWED_CATEGORIES.has(data.category);

  const employmentDocDef = DOC_FIELDS.find((d) => d.key === 'docEmployment')!;
  const showMinistryFileQuestion = Boolean(
    isNewEmployee && selectedRole && (data.category === 'פרא רפואי' || data.category === 'הוראה'),
  );
  const showEmploymentDoc = showMinistryFileQuestion && data.hasMinistryFile === 'כן';

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
    if (data.category === CATEGORY.assistance) {
      const age = ageFromBirthDate(employee?.birthDate ?? '');
      if (age !== null && age < 18) {
        setError('לא ניתן להעסיק עובד מתחת לגיל 18 בתפקיד סיוע');
        return;
      }
    }
    if (showMinistryFileQuestion && !data.hasMinistryFile) {
      setError('יש לציין האם קיים תיק במשרד החינוך');
      return;
    }
    if (showEmploymentDoc && !docs['docEmployment']) {
      setError('יש להעלות מסמך נתוני העסקה');
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
      {/* Symbol dropdown — hidden when only one symbol exists */}
      {symbolsLoading ? (
        <div className="mb-6 flex items-center gap-3 py-3 text-on-surface-variant text-body-md">
          <svg className="animate-spin h-5 w-5 text-primary shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          טוען סמלי מוסד…
        </div>
      ) : symbols.length > 1 ? (
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
      ) : null}

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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-right">
              <thead>
                <tr className="bg-surface-container-low border-b border-outline-variant text-label-lg font-bold text-on-surface-variant">
                  <th className="px-4 py-4 w-10"></th>
                  <th className="px-4 py-4">שם התפקיד</th>
                  <th className="px-4 py-4">שכבה</th>
                  <th className="px-4 py-4">סוג שכר</th>
                  <th className="px-4 py-4">תעריף</th>
                  <th className="px-4 py-4">דרגה</th>
                  <th className="px-4 py-4">ותק</th>
                  <th className="px-4 py-4 text-center">לקות קשה</th>
                  <th className="px-4 py-4 text-center">יתרת שעות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {selectedRole ? (
                  // Collapsed: show only selected role + change button
                  <tr className="selected-row">
                    <td className="px-4 py-3">
                      <div className="w-6 h-6 rounded-full border-2 border-primary bg-primary flex items-center justify-center">
                        <Icon name="check" className="text-white text-[16px]" fill />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-on-surface">{selectedRole.title}</td>
                    <td className="px-4 py-3 text-on-surface-variant text-body-md">{selectedRole.layer.join(', ') || '—'}</td>
                    <td className="px-4 py-3 text-on-surface-variant text-body-md">{selectedRole.salaryType ?? '—'}</td>
                    <td className="px-4 py-3 text-on-surface-variant text-body-md">{selectedRole.tariff ?? '—'}</td>
                    <td className="px-4 py-3 text-on-surface-variant text-body-md">{selectedRole.ranking ?? '—'}</td>
                    <td className="px-4 py-3 text-on-surface-variant text-body-md">{selectedRole.seniority ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {selectedRole.severeDisability ? (
                        <Icon name="check_box" className="text-error text-[20px]" fill />
                      ) : (
                        <Icon name="check_box_outline_blank" className="text-outline-variant text-[20px]" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-3">
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
                    </td>
                  </tr>
                ) : (
                  <>
                    {rolesLoading && (
                      <tr><td colSpan={9}><LoadingRow label="טוען תפקידים…" /></td></tr>
                    )}
                    {!rolesLoading && roles.length === 0 && (
                      <tr><td colSpan={9} className="px-6 py-6 text-on-surface-variant text-body-md">אין תפקידים זמינים לסמל זה.</td></tr>
                    )}
                    {!rolesLoading && roles.length > 0 && filteredRoles.length === 0 && (
                      <tr><td colSpan={9} className="px-6 py-6 text-on-surface-variant text-body-md">לא נמצאו תפקידים התואמים לחיפוש.</td></tr>
                    )}
                    {rolesByCategory.map(({ category, roles: catRoles }) => (
                      <React.Fragment key={`group-${category}`}>
                        <tr key={`cat-${category}`}>
                          <td colSpan={9} className="px-4 py-2 bg-surface-container text-label-md font-bold text-primary border-t border-outline-variant/50">
                            {category}
                          </td>
                        </tr>
                        {catRoles.map((role) => {
                          const noHours = role.remainingHours <= 0;
                          return (
                            <tr
                              key={role.id}
                              className={`transition-colors cursor-pointer hover:bg-secondary-container/20 ${noHours ? 'opacity-50' : ''}`}
                              onClick={() => pickRole(role)}
                            >
                              <td className="px-4 py-3">
                                <div className="w-6 h-6 rounded-full border-2 border-outline-variant bg-white" />
                              </td>
                              <td className="px-4 py-3 font-medium text-on-surface">{role.title}</td>
                              <td className="px-4 py-3 text-on-surface-variant text-body-md">{role.layer.join(', ') || '—'}</td>
                              <td className="px-4 py-3 text-on-surface-variant text-body-md">{role.salaryType ?? '—'}</td>
                              <td className="px-4 py-3 text-on-surface-variant text-body-md">{role.tariff ?? '—'}</td>
                              <td className="px-4 py-3 text-on-surface-variant text-body-md">{role.ranking ?? '—'}</td>
                              <td className="px-4 py-3 text-on-surface-variant text-body-md">{role.seniority ?? '—'}</td>
                              <td className="px-4 py-3 text-center">
                                {role.severeDisability ? (
                                  <Icon name="check_box" className="text-error text-[20px]" fill />
                                ) : (
                                  <Icon name="check_box_outline_blank" className="text-outline-variant text-[20px]" />
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`px-3 py-1 rounded-full text-label-sm font-bold ${
                                    role.remainingHours > 0
                                      ? 'bg-tertiary-fixed text-on-tertiary-fixed'
                                      : 'bg-surface-container-high text-on-surface-variant'
                                  }`}
                                >
                                  {role.remainingHours} שעות
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Prior-year search in progress */}
      {selectedRole && prevYearLoading && !loadedPrevYear && (
        <div className="mb-4 p-4 rounded-xl border border-primary/30 bg-primary/5 flex items-center gap-3">
          <svg className="animate-spin h-5 w-5 text-primary shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <p className="text-body-md text-on-surface">מבצע חיפוש התקן הנבחר בשנה הקודמת…</p>
        </div>
      )}

      {/* No prior-year match notice */}
      {selectedRole && !prevYearLoading && prevYearChecked && !prevYear && !loadedPrevYear && (
        <div className="mb-4 p-4 rounded-xl border border-error/40 bg-error-container flex items-start gap-3">
          <Icon name="info" className="text-on-error-container mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-label-lg font-semibold text-on-error-container mb-1">
              לא נמצא תקן מהשנה הקודמת
            </p>
            <p className="text-body-sm text-on-error-container/80">
              לא קיים תפקיד זהה עבור עובד זה בשנה שעברה (תשפ&quot;ו). יש להזין את מערכת השעות ידנית.
            </p>
          </div>
        </div>
      )}

      {/* Prior-year position banner */}
      {selectedRole && !prevYearLoading && prevYear && !loadedPrevYear && (
        <div className="mb-4 p-4 rounded-xl border border-[#5eccbe]/40 bg-[#5eccbe]/20 flex items-start gap-3">
          <Icon name="history" className="text-[#5eccbe] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-label-lg font-semibold text-[#5eccbe] mb-1">
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


          {/* Gemulim — only for הוראה / פרא רפואי */}
          {canAddGemul && (
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
                  {gemulLoading && (
                    <p className="text-on-surface-variant text-label-sm flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-primary shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      טוען גמולים…
                    </p>
                  )}
                  {!gemulLoading && gemulLines.length === 0 && <p className="text-on-surface-variant text-label-sm">אין גמולים זמינים.</p>}
                  {gemulLines.map((g) => (
                    <CheckboxLine
                      key={g.id}
                      line={g}
                      kind="gemul"
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
          )}

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
                {extraRolesLoading && (
                  <p className="text-on-surface-variant text-label-sm flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-primary shrink-0" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    טוען תפקידים…
                  </p>
                )}
                {!extraRolesLoading && extraRoleLines.length === 0 && (
                  <p className="text-on-surface-variant text-label-sm">אין תפקידים זמינים.</p>
                )}
                {extraRoleLines.map((g) => (
                  <CheckboxLine
                    key={g.id}
                    line={g}
                    kind="roles"
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

      {/* שאלת תיק משרד החינוך + העלאת נתוני העסקה — לעובד חדש בפרא/הוראה */}
      {showMinistryFileQuestion && (
        <section className="bg-white p-6 rounded-xl shadow-card border border-outline-variant mb-4 space-y-5">
          <div>
            <p className="text-label-lg font-bold text-on-surface mb-3">
              האם קיים תיק במשרד החינוך?
            </p>
            <div className="flex gap-3">
              {(['כן', 'לא'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setData((d) => ({ ...d, hasMinistryFile: opt }));
                    if (error === 'יש לציין האם קיים תיק במשרד החינוך') setError('');
                    if (opt === 'לא') onDocsChange({ ...docs, docEmployment: undefined });
                  }}
                  className={`px-6 py-2 rounded-xl border-2 font-bold text-label-lg transition-colors ${
                    data.hasMinistryFile === opt
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-white text-on-surface border-outline hover:border-primary'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            {error === 'יש לציין האם קיים תיק במשרד החינוך' && (
              <p className="mt-2 text-body-sm text-error flex items-center gap-1">
                <Icon name="error" className="text-[16px]" /> {error}
              </p>
            )}
          </div>

          {data.hasMinistryFile === 'כן' && (
            <div className="space-y-4">
              {/* הודעה בולטת */}
              <div className="flex gap-3 p-4 rounded-xl bg-tertiary-container/30 border border-tertiary/40">
                <Icon name="info" className="text-tertiary text-[22px] shrink-0 mt-0.5" fill />
                <p className="text-body-md text-on-surface leading-relaxed">
                  <span className="font-bold">שימי לב:</span> נתוני השכר של העובד יחושבו על פי נתוני ההעסקה המועלים כאן.
                  מאחר שקיים תיק במשרד החינוך, <span className="font-bold">חשוב מאוד להעלות את נתוני ההעסקה</span> כדי
                  להבטיח חישוב שכר מדויק.
                </p>
              </div>

              <DocUpload
                label={employmentDocDef.label}
                required
                value={docs['docEmployment']}
                error={error === 'יש להעלות מסמך נתוני העסקה' ? error : undefined}
                onChange={(doc) => {
                  onDocsChange({ ...docs, docEmployment: doc });
                  if (doc) setError('');
                }}
              />
            </div>
          )}
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
        nextDisabled={symbolsLoading || rolesLoading || prevYearLoading || gemulLoading || extraRolesLoading}
      />
    </>
  );
}

function CheckboxLine({
  line,
  kind,
  checked,
  onToggle,
}: {
  line: ExtraLine;
  kind: 'gemul' | 'roles';
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const countLabel = kind === 'gemul'
    ? `${line.remainingCount} גמולים`
    : `${line.remainingCount} תפקידים`;
  return (
    <label className="flex items-center justify-between gap-2 p-3 rounded-lg border border-outline-variant cursor-pointer hover:bg-surface-container-low">
      <span className="flex items-center gap-2 text-body-md">
        <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
        {line.title}
      </span>
      <span className="px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed text-label-sm font-bold">
        {countLabel}
      </span>
    </label>
  );
}
