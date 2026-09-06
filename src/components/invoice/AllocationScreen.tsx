'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { Footer } from '@/components/shell/Footer';
import { formatNum } from '@/lib/formatNum';
import { requiresLicenseNumber, subRoleDocsFor, type SubRoleOption } from '@/lib/subRole';
import { joinFullName, splitFullName, type UploadedDoc } from '@/lib/formTypes';
import { DocUpload } from '@/components/steps/DocUpload';
import { BudgetStatCard } from '@/components/invoice/BudgetStatCard';

interface InvoiceBudgetRow {
  id: string;
  title: string;
  monthlyHoursQuota: number;
  tariffMonthly: number;
  maxHourlyRate: number | null;
  totalAllocatedHours: number;
  remainingHoursToAllocate: number;
}

interface InvoicePosition {
  id: string;
  budgetRowId: string;
  employeeId: string;
  employeeName: string;
  subRole: string;
  allocatedHours: number;
  agreedHourlyRate: number;
  allocationTransferDocGenerated: boolean;
  inactive: boolean;
}

interface SearchResult {
  id: string;
  name: string;
  maskedTz: string;
}

const EMPTY_NEW_EMPLOYEE = {
  // name נגזר מ-lastName+firstName (שם משפחה ואז שם פרטי) - אותו מבנה כמו בטופס הקליטה.
  name: '', lastName: '', firstName: '', tz: '', address: '', email: '', phone: '', maritalStatus: '', gender: '', birthDate: '',
};

function TopNav({
  institution,
  roleName,
  onBack,
}: {
  institution: string;
  roleName?: string;
  onBack: () => void;
}) {
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(`${d.toLocaleDateString('he-IL')} | ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <header className="bg-surface-bright shadow-sm flex justify-between items-center w-full px-margin-desktop py-4 sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <Image src="/logo_meyuhadim.webp" alt="מיוחדים בחינוך" width={48} height={48} className="object-contain" />
        <span className="text-headline-md font-bold text-primary">מיוחדים בחינוך - מערכת תקציבים</span>
      </div>
      <div className="flex items-center gap-4">
        {institution && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-tertiary-fixed/40 rounded-full text-tertiary">
            <Icon name="school" className="text-[18px]" />
            <span className="text-label-lg font-bold">{institution}</span>
          </div>
        )}
        {roleName && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-container/50 rounded-full text-white">
            <Icon name="work" className="text-[18px]" />
            <span className="text-label-lg font-bold">{roleName}</span>
          </div>
        )}
        <span className="text-label-lg font-bold text-primary">{now}</span>
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container text-label-sm transition-colors"
        >
          <Icon name="arrow_forward" className="text-[18px]" />
          <span>רשימת תקני חשבונית</span>
        </button>
      </div>
    </header>
  );
}

export function AllocationScreen({
  token,
  institutionName,
  budgetRowId,
}: {
  token: string;
  institutionName: string;
  budgetRowId: string;
}) {
  const router = useRouter();
  const [budgetRow, setBudgetRow] = useState<InvoiceBudgetRow | null>(null);
  const [positions, setPositions] = useState<InvoicePosition[]>([]);
  const [subRoleOptions, setSubRoleOptions] = useState<SubRoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [finishMsg, setFinishMsg] = useState('');

  // ── row edit state (existing positions table) ───────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHours, setEditHours] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // ── add-employee form state ──────────────────────────────────────────────
  const [tzQuery, setTzQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('');
  const [existingSubRoleDocs, setExistingSubRoleDocs] = useState<string[]>([]);
  const [newEmployee, setNewEmployee] = useState({ ...EMPTY_NEW_EMPLOYEE });
  const [subRole, setSubRole] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [licenseDocs, setLicenseDocs] = useState<Record<string, UploadedDoc | undefined>>({});
  const [bankName, setBankName] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [allocatedHours, setAllocatedHours] = useState('');
  const [agreedHourlyRate, setAgreedHourlyRate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // ── edit-employee-details panel state (existing position, not the add form above) ──
  const [editingEmployeeFor, setEditingEmployeeFor] = useState<string | null>(null); // positionId
  const [empForm, setEmpForm] = useState({
    name: '', lastName: '', firstName: '', tz: '', address: '', email: '', phone: '', gender: '', maritalStatus: '', birthDate: '',
    subRole: '', licenseNumber: '', bankName: '', bankBranch: '', bankAccountNumber: '', vatNumber: '',
  });
  const [empExistingSubRoleDocs, setEmpExistingSubRoleDocs] = useState<string[]>([]);
  const [empLicenseDocs, setEmpLicenseDocs] = useState<Record<string, UploadedDoc | undefined>>({});
  const [empLoading, setEmpLoading] = useState(false);
  const [empSaving, setEmpSaving] = useState(false);
  const [empError, setEmpError] = useState('');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/invoice/positions?token=${encodeURIComponent(token)}&budgetRowId=${encodeURIComponent(budgetRowId)}`,
      );
      const json = await res.json();
      if (json.ok) {
        setBudgetRow(json.budgetRow);
        setPositions(json.positions);
      } else {
        setError(json.message || 'שגיאה בטעינת הנתונים.');
      }
    } catch {
      setError('שגיאה בטעינת הנתונים.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, [token, budgetRowId]); // eslint-disable-line react-hooks/exhaustive-deps

  // אותה רשימת תת-תפקידים כמו בטופס הקליטה, מטבלת "תת-תפקידים" באיירטייבל.
  // קודם נשלפו כאן אופציות ה-singleSelect של טבלת תקני חשבונית, שצברה גם היא
  // ערכי זבל מ-typecast ולא נשאה שום מידע על מסמכים או מספר רישיון.
  useEffect(() => {
    fetch(`/api/sub-roles?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => setSubRoleOptions(j.subRoles ?? []))
      .catch(() => {});
  }, [token]);

  // debounced ת.ז. search
  useEffect(() => {
    if (tzQuery.replace(/\D/g, '').length < 4) { setSearchResults([]); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/employees/search?q=${encodeURIComponent(tzQuery)}&token=${encodeURIComponent(token)}`);
        const json = await res.json();
        setSearchResults(json.results ?? []);
      } catch { /* ignore */ }
      setSearching(false);
    }, 350);
    return () => clearTimeout(debounce.current);
  }, [tzQuery, token]);

  async function selectExisting(id: string, name: string) {
    setSelectedEmployeeId(id);
    setSelectedEmployeeName(name);
    setSearchResults([]);
    setTzQuery('');
    try {
      const res = await fetch(`/api/employees/${id}?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      setExistingSubRoleDocs(json.employee?.existingSubRoleDocs ?? []);
      setBankName(json.employee?.bankName ?? '');
      setBankBranch(json.employee?.bankBranch ?? '');
      setBankAccountNumber(json.employee?.bankAccountNumber ?? '');
      setVatNumber(json.employee?.vatNumber ?? '');
    } catch { setExistingSubRoleDocs([]); }
  }

  function resetForm() {
    setSelectedEmployeeId('');
    setSelectedEmployeeName('');
    setExistingSubRoleDocs([]);
    setNewEmployee({ ...EMPTY_NEW_EMPLOYEE });
    setSubRole('');
    setLicenseNumber('');
    setLicenseDocs({});
    setBankName('');
    setBankBranch('');
    setBankAccountNumber('');
    setVatNumber('');
    setAllocatedHours('');
    setAgreedHourlyRate('');
    setFormError('');
  }

  const wantedDocs = subRoleDocsFor(subRoleOptions, subRole);
  const pendingDocs = wantedDocs.filter((d) => !existingSubRoleDocs.includes(d.fieldId));
  const alreadyOnFileDocs = wantedDocs.filter((d) => existingSubRoleDocs.includes(d.fieldId));
  const needsLicenseNumber = requiresLicenseNumber(subRoleOptions, subRole);

  async function submitAddEmployee() {
    setFormError('');
    if (!selectedEmployeeId && !newEmployee.tz) { setFormError('יש לבחור עובד קיים או להזין עובד חדש.'); return; }
    if (!selectedEmployeeId && !newEmployee.lastName.trim()) { setFormError('יש להזין שם משפחה.'); return; }
    if (!selectedEmployeeId && !newEmployee.firstName.trim()) { setFormError('יש להזין שם פרטי.'); return; }
    if (!selectedEmployeeId && !newEmployee.phone) { setFormError('יש להזין טלפון.'); return; }
    if (!selectedEmployeeId && !newEmployee.email) { setFormError('יש להזין אימייל.'); return; }
    if (!selectedEmployeeId && !newEmployee.gender) { setFormError('יש לבחור מין.'); return; }
    if (!subRole) { setFormError('יש לבחור תת-תפקיד.'); return; }
    if (needsLicenseNumber && !licenseNumber) { setFormError("יש להזין מס' רישיון."); return; }
    for (const d of pendingDocs) {
      if (!licenseDocs[d.fieldId]) { setFormError(`יש לצרף ${d.label}.`); return; }
    }
    if (!bankName.trim() || !bankBranch.trim() || !bankAccountNumber.trim()) {
      setFormError('יש להזין פרטי בנק מלאים (בנק, סניף ומספר חשבון).');
      return;
    }
    if (!/^\d{9}$/.test(vatNumber.trim())) { setFormError('מספר עוסק חייב להיות בן 9 ספרות.'); return; }
    const hoursNum = Number(allocatedHours);
    const rateNum = Number(agreedHourlyRate);
    if (!Number.isFinite(hoursNum) || hoursNum <= 0) { setFormError('יש להזין שעות מוקצות תקינות.'); return; }
    if (!Number.isFinite(rateNum) || rateNum <= 0) { setFormError('יש להזין תעריף שעתי תקין.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/invoice/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          budgetRowId,
          employeeId: selectedEmployeeId || undefined,
          employeeName: selectedEmployeeName || undefined,
          newEmployee: selectedEmployeeId ? undefined : newEmployee,
          subRole,
          licenseNumber: needsLicenseNumber ? licenseNumber : undefined,
          bankName: bankName || undefined,
          bankBranch: bankBranch || undefined,
          bankAccountNumber: bankAccountNumber || undefined,
          vatNumber: vatNumber || undefined,
          allocatedHours: hoursNum,
          agreedHourlyRate: rateNum,
        }),
      });
      const json = await res.json();
      if (!json.ok) { setFormError(json.message || 'שגיאה בהקצאת העובד.'); setSubmitting(false); return; }

      const employeeId = json.position.employeeId as string;
      for (const d of pendingDocs) {
        const doc = licenseDocs[d.fieldId];
        if (!doc) continue;
        await fetch('/api/upload-employee-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, employeeId, fieldId: d.fieldId, file: doc }),
        });
      }

      resetForm();
      await loadData();
    } catch {
      setFormError('שגיאה בהקצאת העובד.');
    } finally {
      setSubmitting(false);
    }
  }

  function startEditRow(p: InvoicePosition) {
    setEditingId(p.id);
    setEditHours(String(p.allocatedHours));
    setEditRate(String(p.agreedHourlyRate));
    setEditError('');
  }

  function cancelEditRow() {
    setEditingId(null);
    setEditError('');
  }

  async function saveEditRow(id: string) {
    const hours = Number(editHours);
    const rate = Number(editRate);
    if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(rate) || rate <= 0) {
      setEditError('יש להזין שעות ותעריף תקינים.');
      return;
    }
    setEditSaving(true);
    setEditError('');
    try {
      const res = await fetch(`/api/invoice/positions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, allocatedHours: hours, agreedHourlyRate: rate }),
      });
      const json = await res.json();
      if (json.ok) {
        setPositions((prev) => prev.map((p) => (p.id === id ? json.position : p)));
        setEditingId(null);
      } else {
        setEditError(json.message || 'שגיאה בעדכון ההקצאה.');
      }
    } catch {
      setEditError('שגיאה בעדכון ההקצאה.');
    } finally {
      setEditSaving(false);
    }
  }

  async function removePosition(id: string) {
    if (!confirm('להסיר את העובד מהתקן?')) return;
    const res = await fetch(`/api/invoice/positions/${id}?token=${encodeURIComponent(token)}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.ok) setPositions((prev) => prev.filter((p) => p.id !== id));
    else alert(json.message || 'שגיאה בהסרת העובד.');
  }

  async function toggleActive(p: InvoicePosition) {
    const willBeActive = p.inactive; // כרגע לא פעיל -> מפעילים; כרגע פעיל -> מסמנים לא פעיל
    if (!willBeActive && !confirm('לסמן את העובד כלא פעיל? יתרת השעות שלא נוצלה תשוחרר חזרה לתקן, ולא יהיה ניתן לדווח עבורו שעות נוספות.')) return;
    const res = await fetch(`/api/invoice/positions/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, active: willBeActive }),
    });
    const json = await res.json();
    if (json.ok) setPositions((prev) => prev.map((row) => (row.id === p.id ? json.position : row)));
    else alert(json.message || 'שגיאה בעדכון הסטטוס.');
  }

  async function openEditEmployee(p: InvoicePosition) {
    setEditingEmployeeFor(p.id);
    setEmpError('');
    setEmpLicenseDocs({});
    setEmpExistingSubRoleDocs([]);
    setEmpForm({
      name: p.employeeName, ...splitFullName(p.employeeName), tz: '', address: '', email: '', phone: '', gender: '', maritalStatus: '', birthDate: '',
      subRole: p.subRole, licenseNumber: '', bankName: '', bankBranch: '', bankAccountNumber: '', vatNumber: '',
    });
    setEmpLoading(true);
    try {
      const res = await fetch(`/api/employees/${p.employeeId}?token=${encodeURIComponent(token)}`);
      const json = await res.json();
      const e = json.employee;
      if (e) {
        setEmpForm({
          name: e.name ?? p.employeeName,
          ...splitFullName(e.name ?? p.employeeName),
          tz: e.tz ?? '',
          address: e.address ?? '',
          email: e.email ?? '',
          phone: e.phone ?? '',
          gender: e.gender ?? '',
          maritalStatus: e.maritalStatus ?? '',
          birthDate: e.birthDate ?? '',
          subRole: p.subRole,
          licenseNumber: e.licenseNumber ?? '',
          bankName: e.bankName ?? '',
          bankBranch: e.bankBranch ?? '',
          bankAccountNumber: e.bankAccountNumber ?? '',
          vatNumber: e.vatNumber ?? '',
        });
        setEmpExistingSubRoleDocs(e.existingSubRoleDocs ?? []);
      }
    } catch {
      setEmpError('שגיאה בטעינת פרטי העובד.');
    } finally {
      setEmpLoading(false);
    }
  }

  function closeEditEmployee() {
    setEditingEmployeeFor(null);
    setEmpError('');
  }

  async function saveEditEmployee(p: InvoicePosition) {
    setEmpError('');
    if (!empForm.lastName.trim()) { setEmpError('יש להזין שם משפחה.'); return; }
    if (!empForm.firstName.trim()) { setEmpError('יש להזין שם פרטי.'); return; }
    if (!empForm.phone.trim()) { setEmpError('יש להזין טלפון.'); return; }
    if (!empForm.email.trim()) { setEmpError('יש להזין אימייל.'); return; }
    if (!empForm.gender) { setEmpError('יש לבחור מין.'); return; }
    if (!empForm.subRole) { setEmpError('יש לבחור תת-תפקיד.'); return; }
    const wantedDocs = subRoleDocsFor(subRoleOptions, empForm.subRole);
    const needsLicenseNumber = requiresLicenseNumber(subRoleOptions, empForm.subRole);
    if (needsLicenseNumber && !empForm.licenseNumber) { setEmpError("יש להזין מס' רישיון."); return; }
    const pendingDocs = wantedDocs.filter((d) => !empExistingSubRoleDocs.includes(d.fieldId));
    for (const d of pendingDocs) {
      if (!empLicenseDocs[d.fieldId]) { setEmpError(`יש לצרף ${d.label}.`); return; }
    }
    if (!empForm.bankName.trim() || !empForm.bankBranch.trim() || !empForm.bankAccountNumber.trim()) {
      setEmpError('יש להזין פרטי בנק מלאים (בנק, סניף ומספר חשבון).');
      return;
    }
    if (!/^\d{9}$/.test(empForm.vatNumber.trim())) { setEmpError('מספר עוסק חייב להיות בן 9 ספרות.'); return; }

    setEmpSaving(true);
    try {
      const empRes = await fetch(`/api/employees/${p.employeeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          employee: {
            name: empForm.name,
            lastName: empForm.lastName,
            firstName: empForm.firstName,
            address: empForm.address,
            email: empForm.email,
            phone: empForm.phone,
            gender: empForm.gender,
            maritalStatus: empForm.maritalStatus,
            birthDate: empForm.birthDate,
            licenseNumber: needsLicenseNumber ? empForm.licenseNumber : undefined,
            bankName: empForm.bankName,
            bankBranch: empForm.bankBranch,
            bankAccountNumber: empForm.bankAccountNumber,
            vatNumber: empForm.vatNumber,
          },
        }),
      });
      const empJson = await empRes.json();
      if (!empJson.ok) { setEmpError(empJson.message || 'שגיאה בשמירת פרטי העובד.'); setEmpSaving(false); return; }

      for (const d of pendingDocs) {
        const doc = empLicenseDocs[d.fieldId];
        if (!doc) continue;
        await fetch('/api/upload-employee-doc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, employeeId: p.employeeId, fieldId: d.fieldId, file: doc }),
        });
      }

      const posRes = await fetch(`/api/invoice/positions/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, subRole: empForm.subRole, employeeName: empForm.name }),
      });
      const posJson = await posRes.json();
      if (!posJson.ok) { setEmpError(posJson.message || 'שגיאה בעדכון פרטי התקן.'); setEmpSaving(false); return; }

      setPositions((prev) => prev.map((row) => (row.id === p.id ? posJson.position : row)));
      setEditingEmployeeFor(null);
    } catch {
      setEmpError('שגיאה בשמירת הפרטים.');
    } finally {
      setEmpSaving(false);
    }
  }

  async function finishAllocation() {
    setFinishing(true);
    setFinishMsg('');
    try {
      const res = await fetch(`/api/invoice/budget-rows/${budgetRowId}/finish-allocation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      setFinishMsg(json.ok
        ? 'ההקצאה סומנה כהושלמה. הפקת "בקשת העברות" בגוגל דוקס תתווסף בהמשך.'
        : (json.message || 'שגיאה בסימון סיום ההקצאה.'));
    } catch {
      setFinishMsg('שגיאה בסימון סיום ההקצאה.');
    } finally {
      setFinishing(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-on-surface-variant">טוען…</div>;
  }
  if (error || !budgetRow) {
    return <div className="min-h-screen flex items-center justify-center text-error">{error || 'שורת תקציב לא נמצאה.'}</div>;
  }

  const totalAllocated = positions.reduce((s, p) => s + p.allocatedHours, 0);
  const totalPlannedSpend = positions.reduce((s, p) => s + p.allocatedHours * p.agreedHourlyRate, 0);

  return (
    <div className="min-h-screen flex flex-col bg-surface-bright" dir="rtl">
      <TopNav
        institution={institutionName}
        roleName={budgetRow.title}
        onBack={() => router.push(`/form/${encodeURIComponent(token)}/invoice`)}
      />

      <main className="flex-1 px-margin-desktop py-8">
        <div className="max-w-container-max mx-auto space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="text-right">
              <h1 className="text-display-lg text-primary mb-1">ניהול תקציב</h1>
              <p className="text-body-lg text-on-surface-variant">הקצאת שעות ותעריף לעובדים המקושרים לתקן.</p>
            </div>
            <button
              onClick={() => router.push(`/form/${encodeURIComponent(token)}/invoice/${budgetRowId}/report`)}
              className="flex items-center gap-2 px-5 py-2.5 bg-secondary text-on-secondary rounded-lg font-bold text-label-lg hover:opacity-90 transition-all shrink-0"
            >
              <Icon name="calendar_month" className="text-[20px]" />
              מעבר לדיווח חודשי
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BudgetStatCard
              icon="schedule"
              label={`שעות מוקצות (${positions.length} עובדים)`}
              valueLabel={`${formatNum(totalAllocated)} מתוך ${formatNum(budgetRow.monthlyHoursQuota)} שעות`}
              current={totalAllocated}
              max={budgetRow.monthlyHoursQuota}
              color="primary"
            />
            <BudgetStatCard
              icon="payments"
              label="תקציב חודשי מתוכנן"
              valueLabel={`${formatNum(totalPlannedSpend)} מתוך ${formatNum(budgetRow.tariffMonthly)} ₪`}
              current={totalPlannedSpend}
              max={budgetRow.tariffMonthly}
              color="secondary"
            />
            <BudgetStatCard
              icon="speed"
              label="תעריף שעתי מקסימלי"
              valueLabel={budgetRow.maxHourlyRate != null ? `${formatNum(budgetRow.maxHourlyRate)} ₪ לשעה` : '-'}
              color="tertiary"
            />
          </div>

          {/* Existing positions */}
          <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead className="bg-surface-container-low text-label-lg font-bold text-on-surface-variant">
                  <tr>
                    <th className="px-5 py-3">עובד</th>
                    <th className="px-5 py-3">תת-תפקיד</th>
                    <th className="px-5 py-3">שעות מוקצות</th>
                    <th className="px-5 py-3">תעריף שעתי מוסכם</th>
                    <th className="px-5 py-3">סטטוס</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  {positions.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-8 text-center text-on-surface-variant">אין עדיין עובדים מוקצים לתקן זה.</td></tr>
                  )}
                  {positions.map((p) => {
                    const isEditing = editingId === p.id;
                    return (
                      <tr key={p.id} className={p.inactive ? 'opacity-60' : ''}>
                        <td className="px-5 py-3 font-bold">{p.employeeName}</td>
                        <td className="px-5 py-3">{p.subRole}</td>
                        <td className="px-5 py-3">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editHours}
                              onChange={(e) => setEditHours(e.target.value)}
                              className="w-24 bg-surface-container-low rounded-lg py-2 px-2 text-body-md"
                              autoFocus
                            />
                          ) : (
                            formatNum(p.allocatedHours)
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editRate}
                              onChange={(e) => setEditRate(e.target.value)}
                              className="w-24 bg-surface-container-low rounded-lg py-2 px-2 text-body-md"
                            />
                          ) : (
                            formatNum(p.agreedHourlyRate)
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {p.inactive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-error-container/40 text-error text-label-sm font-bold">
                              <Icon name="pause_circle" className="text-[16px]" fill /> לא פעיל
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-tertiary-container/40 text-on-surface text-label-sm font-bold">
                              <Icon name="check_circle" className="text-tertiary text-[16px]" fill /> פעיל
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {isEditing ? (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => void saveEditRow(p.id)}
                                  disabled={editSaving}
                                  className="text-primary hover:opacity-80 disabled:opacity-50"
                                  aria-label="שמירה"
                                >
                                  <Icon name="check" className="text-[20px]" />
                                </button>
                                <button
                                  onClick={cancelEditRow}
                                  disabled={editSaving}
                                  className="text-on-surface-variant hover:text-error"
                                  aria-label="ביטול"
                                >
                                  <Icon name="close" className="text-[20px]" />
                                </button>
                              </div>
                              {editError && <span className="text-error text-label-sm">{editError}</span>}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              {!p.inactive && (
                                <button
                                  onClick={() => startEditRow(p)}
                                  className="text-on-surface-variant hover:text-primary"
                                  aria-label="עריכה"
                                >
                                  <Icon name="edit" className="text-[18px]" />
                                </button>
                              )}
                              <button
                                onClick={() => void openEditEmployee(p)}
                                className="text-on-surface-variant hover:text-primary"
                                aria-label="עריכת פרטי עובד"
                                title="עריכת פרטי עובד"
                              >
                                <Icon name="manage_accounts" className="text-[20px]" />
                              </button>
                              <button
                                onClick={() => void toggleActive(p)}
                                className="text-on-surface-variant hover:text-tertiary"
                                aria-label={p.inactive ? 'הפעלה מחדש' : 'סימון כלא פעיל'}
                                title={p.inactive ? 'הפעלה מחדש' : 'סימון כלא פעיל'}
                              >
                                <Icon name={p.inactive ? 'play_circle' : 'pause_circle'} className="text-[20px]" />
                              </button>
                              <button onClick={() => void removePosition(p.id)} className="text-on-surface-variant hover:text-error" aria-label="הסרה">
                                <Icon name="delete" className="text-[20px]" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Edit employee details panel (for an existing position) */}
          {editingEmployeeFor && (() => {
            const p = positions.find((row) => row.id === editingEmployeeFor);
            if (!p) return null;
            const empWantedDocs = subRoleDocsFor(subRoleOptions, empForm.subRole);
            const empPendingDocs = empWantedDocs.filter((d) => !empExistingSubRoleDocs.includes(d.fieldId));
            const empAlreadyOnFileDocs = empWantedDocs.filter((d) => empExistingSubRoleDocs.includes(d.fieldId));
            const empNeedsLicenseNumber = requiresLicenseNumber(subRoleOptions, empForm.subRole);
            return (
              <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-headline-sm font-bold text-on-surface">עריכת פרטי עובד: {p.employeeName}</h2>
                  <button onClick={closeEditEmployee} className="text-on-surface-variant hover:text-error" aria-label="סגירה">
                    <Icon name="close" className="text-[20px]" />
                  </button>
                </div>

                {empLoading ? (
                  <p className="text-on-surface-variant text-body-md">טוען…</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
                      <div>
                        <label className="text-label-lg text-on-surface block mb-2">
                          שם משפחה <span className="text-error">*</span>
                        </label>
                        <input
                          value={empForm.lastName}
                          onChange={(e) => setEmpForm((v) => ({ ...v, lastName: e.target.value, name: joinFullName(e.target.value, v.firstName) }))}
                          className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                        />
                      </div>
                      <div>
                        <label className="text-label-lg text-on-surface block mb-2">
                          שם פרטי <span className="text-error">*</span>
                        </label>
                        <input
                          value={empForm.firstName}
                          onChange={(e) => setEmpForm((v) => ({ ...v, firstName: e.target.value, name: joinFullName(v.lastName, e.target.value) }))}
                          className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                        />
                      </div>
                      <div>
                        <label className="text-label-lg text-on-surface block mb-2">ת.ז.</label>
                        <input
                          value={empForm.tz}
                          disabled
                          className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md opacity-60"
                        />
                      </div>
                      <div>
                        <label className="text-label-lg text-on-surface block mb-2">
                          טלפון <span className="text-error">*</span>
                        </label>
                        <input
                          value={empForm.phone}
                          onChange={(e) => setEmpForm((v) => ({ ...v, phone: e.target.value }))}
                          className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                        />
                      </div>
                      <div>
                        <label className="text-label-lg text-on-surface block mb-2">
                          אימייל <span className="text-error">*</span>
                        </label>
                        <input
                          value={empForm.email}
                          onChange={(e) => setEmpForm((v) => ({ ...v, email: e.target.value }))}
                          className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                        />
                      </div>
                      <div>
                        <label className="text-label-lg text-on-surface block mb-2">כתובת</label>
                        <input
                          value={empForm.address}
                          onChange={(e) => setEmpForm((v) => ({ ...v, address: e.target.value }))}
                          className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                        />
                      </div>
                      <div>
                        <label className="text-label-lg text-on-surface block mb-2">תאריך לידה</label>
                        <input
                          type="date"
                          value={empForm.birthDate}
                          onChange={(e) => setEmpForm((v) => ({ ...v, birthDate: e.target.value }))}
                          className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                        />
                      </div>
                      <div>
                        <label className="text-label-lg text-on-surface block mb-2">
                          מין <span className="text-error">*</span>
                        </label>
                        <select
                          value={empForm.gender}
                          onChange={(e) => setEmpForm((v) => ({ ...v, gender: e.target.value }))}
                          className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                        >
                          <option value="">בחר</option>
                          <option value="זכר">זכר</option>
                          <option value="נקבה">נקבה</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-label-lg text-on-surface block mb-2">מצב משפחתי</label>
                        <input
                          value={empForm.maritalStatus}
                          onChange={(e) => setEmpForm((v) => ({ ...v, maritalStatus: e.target.value }))}
                          className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                        />
                      </div>
                      <div>
                        <label className="text-label-lg text-on-surface block mb-2">
                          תת-תפקיד <span className="text-error">*</span>
                        </label>
                        <select
                          value={empForm.subRole}
                          onChange={(e) => {
                            setEmpForm((v) => ({ ...v, subRole: e.target.value }));
                            setEmpLicenseDocs({});
                          }}
                          className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                        >
                          <option value="">בחר תת-תפקיד</option>
                          {subRoleOptions.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
                        </select>
                      </div>
                    </div>

                    {empNeedsLicenseNumber && (
                      <div className="max-w-xs">
                        <label className="text-label-lg text-on-surface block mb-2">
                          מס&apos; רישיון <span className="text-error">*</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={empForm.licenseNumber}
                          onChange={(e) => setEmpForm((v) => ({ ...v, licenseNumber: e.target.value }))}
                          className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                        />
                      </div>
                    )}

                    <div>
                      <p className="text-label-lg text-on-surface font-bold mb-3">פרטי בנק (לצורך הפקת בקשת תשלום)</p>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-3xl">
                        <div>
                          <label className="text-label-sm text-on-surface-variant block mb-2">
                            בנק <span className="text-error">*</span>
                          </label>
                          <input
                            value={empForm.bankName}
                            onChange={(e) => setEmpForm((v) => ({ ...v, bankName: e.target.value }))}
                            className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                          />
                        </div>
                        <div>
                          <label className="text-label-sm text-on-surface-variant block mb-2">
                            סניף <span className="text-error">*</span>
                          </label>
                          <input
                            value={empForm.bankBranch}
                            onChange={(e) => setEmpForm((v) => ({ ...v, bankBranch: e.target.value }))}
                            className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                          />
                        </div>
                        <div>
                          <label className="text-label-sm text-on-surface-variant block mb-2">
                            מספר חשבון <span className="text-error">*</span>
                          </label>
                          <input
                            value={empForm.bankAccountNumber}
                            onChange={(e) => setEmpForm((v) => ({ ...v, bankAccountNumber: e.target.value }))}
                            className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                          />
                        </div>
                        <div>
                          <label className="text-label-sm text-on-surface-variant block mb-2">
                            מספר עוסק <span className="text-error">*</span>
                          </label>
                          <input
                            value={empForm.vatNumber}
                            onChange={(e) => setEmpForm((v) => ({ ...v, vatNumber: e.target.value }))}
                            inputMode="numeric"
                            maxLength={9}
                            placeholder="9 ספרות"
                            className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                          />
                        </div>
                      </div>
                    </div>

                    {empAlreadyOnFileDocs.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {empAlreadyOnFileDocs.map((d) => (
                          <span key={d.fieldId} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-tertiary-container/30 text-on-surface text-label-sm">
                            <Icon name="check_circle" className="text-tertiary text-[16px]" fill />
                            {d.label} - קיים בתיק העובד
                          </span>
                        ))}
                      </div>
                    )}
                    {empPendingDocs.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 max-w-2xl">
                        {empPendingDocs.map((d) => (
                          <DocUpload
                            key={d.fieldId}
                            label={d.label}
                            required
                            value={empLicenseDocs[d.fieldId]}
                            onChange={(doc) => setEmpLicenseDocs((v) => ({ ...v, [d.fieldId]: doc }))}
                          />
                        ))}
                      </div>
                    )}

                    {empError && <p className="text-error text-body-md">{empError}</p>}

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => void saveEditEmployee(p)}
                        disabled={empSaving}
                        className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl font-bold text-label-lg hover:opacity-90 disabled:opacity-50 transition-all"
                      >
                        <Icon name="save" className="text-[18px]" />
                        {empSaving ? 'שומר…' : 'שמירת פרטי עובד'}
                      </button>
                      <button
                        onClick={closeEditEmployee}
                        className="px-6 py-3 rounded-xl font-bold text-label-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-all"
                      >
                        ביטול
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })()}

          {/* Add employee form */}
          <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-2xl p-6 shadow-sm space-y-5">
            <h2 className="text-headline-sm font-bold text-on-surface">הוספת עובד לתקן</h2>

            {!selectedEmployeeId && (
              <div className="relative max-w-sm">
                <label className="text-label-lg text-on-surface block mb-2">חיפוש עובד קיים לפי ת.ז.</label>
                <input
                  value={tzQuery}
                  onChange={(e) => setTzQuery(e.target.value)}
                  placeholder="הקלדת ת.ז…"
                  className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                />
                {searching && <p className="text-label-sm text-on-surface-variant mt-1">מחפש…</p>}
                {searchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-surface-container-lowest border border-outline-variant rounded-lg shadow-md overflow-hidden">
                    {searchResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => void selectExisting(r.id, r.name)}
                        className="w-full text-right px-4 py-2.5 hover:bg-surface-container-low text-body-md"
                      >
                        {r.name} ({r.maskedTz})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedEmployeeId ? (
              <div className="flex items-center gap-3 bg-tertiary-container/30 rounded-lg px-4 py-3 max-w-sm">
                <Icon name="person" className="text-tertiary" />
                <span className="font-bold flex-1">{selectedEmployeeName}</span>
                <button onClick={resetForm} className="text-on-surface-variant hover:text-error" aria-label="ביטול בחירה">
                  <Icon name="close" className="text-[18px]" />
                </button>
              </div>
            ) : (
              <details className="max-w-2xl" open={!!newEmployee.tz && searchResults.length === 0}>
                <summary className="cursor-pointer text-label-lg text-primary font-bold">לא נמצא? הוספת עובד חדש</summary>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="text-label-lg text-on-surface block mb-2">
                      שם משפחה <span className="text-error">*</span>
                    </label>
                    <input
                      value={newEmployee.lastName}
                      onChange={(e) => setNewEmployee((v) => ({ ...v, lastName: e.target.value, name: joinFullName(e.target.value, v.firstName) }))}
                      className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                    />
                  </div>
                  <div>
                    <label className="text-label-lg text-on-surface block mb-2">
                      שם פרטי <span className="text-error">*</span>
                    </label>
                    <input
                      value={newEmployee.firstName}
                      onChange={(e) => setNewEmployee((v) => ({ ...v, firstName: e.target.value, name: joinFullName(v.lastName, e.target.value) }))}
                      className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                    />
                  </div>
                  <div>
                    <label className="text-label-lg text-on-surface block mb-2">
                      ת.ז. <span className="text-error">*</span>
                    </label>
                    <input
                      value={newEmployee.tz}
                      onChange={(e) => { setNewEmployee((v) => ({ ...v, tz: e.target.value })); setTzQuery(e.target.value); }}
                      className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                    />
                  </div>
                  <div>
                    <label className="text-label-lg text-on-surface block mb-2">
                      טלפון <span className="text-error">*</span>
                    </label>
                    <input
                      value={newEmployee.phone}
                      onChange={(e) => setNewEmployee((v) => ({ ...v, phone: e.target.value }))}
                      className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                    />
                  </div>
                  <div>
                    <label className="text-label-lg text-on-surface block mb-2">
                      אימייל <span className="text-error">*</span>
                    </label>
                    <input
                      value={newEmployee.email}
                      onChange={(e) => setNewEmployee((v) => ({ ...v, email: e.target.value }))}
                      className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                    />
                  </div>
                  <div>
                    <label className="text-label-lg text-on-surface block mb-2">כתובת</label>
                    <input
                      value={newEmployee.address}
                      onChange={(e) => setNewEmployee((v) => ({ ...v, address: e.target.value }))}
                      className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                    />
                  </div>
                  <div>
                    <label className="text-label-lg text-on-surface block mb-2">תאריך לידה</label>
                    <input
                      type="date"
                      value={newEmployee.birthDate}
                      onChange={(e) => setNewEmployee((v) => ({ ...v, birthDate: e.target.value }))}
                      className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                    />
                  </div>
                  <div>
                    <label className="text-label-lg text-on-surface block mb-2">
                      מין <span className="text-error">*</span>
                    </label>
                    <select
                      value={newEmployee.gender}
                      onChange={(e) => setNewEmployee((v) => ({ ...v, gender: e.target.value }))}
                      className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                    >
                      <option value="">בחר</option>
                      <option value="זכר">זכר</option>
                      <option value="נקבה">נקבה</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-label-lg text-on-surface block mb-2">מצב משפחתי</label>
                    <input
                      value={newEmployee.maritalStatus}
                      onChange={(e) => setNewEmployee((v) => ({ ...v, maritalStatus: e.target.value }))}
                      className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                    />
                  </div>
                </div>
              </details>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl">
              <div>
                <label className="text-label-lg text-on-surface block mb-2">תת-תפקיד <span className="text-error">*</span></label>
                <select value={subRole} onChange={(e) => { setSubRole(e.target.value); setLicenseDocs({}); setLicenseNumber(''); }} className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md">
                  <option value="">בחר תת-תפקיד</option>
                  {subRoleOptions.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-label-lg text-on-surface block mb-2">שעות מוקצות <span className="text-error">*</span></label>
                <input type="number" value={allocatedHours} onChange={(e) => setAllocatedHours(e.target.value)} className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md" />
              </div>
              <div>
                <label className="text-label-lg text-on-surface block mb-2">תעריף שעתי מוסכם <span className="text-error">*</span></label>
                <input type="number" value={agreedHourlyRate} onChange={(e) => setAgreedHourlyRate(e.target.value)} className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md" />
              </div>
            </div>

            {needsLicenseNumber && (
              <div className="max-w-xs">
                <label className="text-label-lg text-on-surface block mb-2">מס&apos; רישיון <span className="text-error">*</span></label>
                <input type="text" inputMode="numeric" value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md" />
              </div>
            )}

            <div>
              <p className="text-label-lg text-on-surface font-bold mb-3">פרטי בנק (לצורך הפקת בקשת תשלום)</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-3xl">
                <div>
                  <label className="text-label-sm text-on-surface-variant block mb-2">
                    בנק <span className="text-error">*</span>
                  </label>
                  <input value={bankName} onChange={(e) => setBankName(e.target.value)} className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md" />
                </div>
                <div>
                  <label className="text-label-sm text-on-surface-variant block mb-2">
                    סניף <span className="text-error">*</span>
                  </label>
                  <input value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md" />
                </div>
                <div>
                  <label className="text-label-sm text-on-surface-variant block mb-2">
                    מספר חשבון <span className="text-error">*</span>
                  </label>
                  <input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md" />
                </div>
                <div>
                  <label className="text-label-sm text-on-surface-variant block mb-2">
                    מספר עוסק <span className="text-error">*</span>
                  </label>
                  <input
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="9 ספרות"
                    className="w-full bg-surface-container-low rounded-lg h-11 px-3 text-body-md"
                  />
                </div>
              </div>
            </div>

            {alreadyOnFileDocs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {alreadyOnFileDocs.map((d) => (
                  <span key={d.fieldId} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-tertiary-container/30 text-on-surface text-label-sm">
                    <Icon name="check_circle" className="text-tertiary text-[16px]" fill />
                    {d.label} - קיים בתיק העובד
                  </span>
                ))}
              </div>
            )}
            {pendingDocs.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 max-w-2xl">
                {pendingDocs.map((d) => (
                  <DocUpload
                    key={d.fieldId}
                    label={d.label}
                    required
                    value={licenseDocs[d.fieldId]}
                    onChange={(doc) => setLicenseDocs((v) => ({ ...v, [d.fieldId]: doc }))}
                  />
                ))}
              </div>
            )}

            {formError && <p className="text-error text-body-md">{formError}</p>}

            <button
              onClick={() => void submitAddEmployee()}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-xl font-bold text-label-lg hover:opacity-90 disabled:opacity-50 transition-all"
            >
              <Icon name="add" className="text-[18px]" />
              {submitting ? 'מוסיף…' : 'הוספת עובד לתקן'}
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => void finishAllocation()}
              disabled={finishing || positions.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-tertiary text-on-tertiary rounded-xl font-bold text-label-lg hover:opacity-90 disabled:opacity-50 transition-all"
            >
              <Icon name="task_alt" className="text-[20px]" />
              {finishing ? 'מסמן…' : 'סיום הקצאה שנתית'}
            </button>
            {finishMsg && <span className="text-body-md text-on-surface-variant">{finishMsg}</span>}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
