import { cookies } from 'next/headers';
import { ADMIN_COOKIE, isValidAdminSession } from '@/lib/adminAuth';
import { AdminLogin } from '@/components/admin/AdminLogin';
import { AdminInvoiceDashboard } from '@/components/admin/AdminInvoiceDashboard';

export const dynamic = 'force-dynamic';

/**
 * /admin - ממשק מנהל: כל נתוני תקני החשבונית במרוכז (כל המוסדות), סינון לפי מוסד/
 * חודש, הורדה ל-CSV, ופתיחת עריכת הקצאה שנתית לפי מוסד. כניסה בסיסמה (ADMIN_PASSWORD).
 */
export default function AdminPage() {
  const session = cookies().get(ADMIN_COOKIE)?.value;
  return isValidAdminSession(session) ? <AdminInvoiceDashboard /> : <AdminLogin />;
}
