import { TeacherDashboard } from '@/components/teacher/TeacherDashboard';
import { requireTeacherPageSession } from '@/lib/server/auth/session';
import { loadTeacherBillingView } from '@/lib/server/billing/store';
import type { TeacherBillingView } from '@/lib/teacher/billing';

async function billingForCurrentTeacher(): Promise<TeacherBillingView | null> {
  try {
    const user = await requireTeacherPageSession();
    return await loadTeacherBillingView(user.id);
  } catch {
    return null;
  }
}

export default async function TeacherDashboardPage() {
  return <TeacherDashboard billing={await billingForCurrentTeacher()} />;
}
