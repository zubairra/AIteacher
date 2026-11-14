import { TeacherDashboard } from '@/components/teacher/TeacherDashboard';
import { isBillingEnabled } from '@/lib/config/feature-flags';
import { requireTeacherPageSession } from '@/lib/server/auth/session';
import { loadTeacherBillingView } from '@/lib/server/billing/store';
import type { TeacherBillingView } from '@/lib/teacher/billing';

async function billingForCurrentTeacher(): Promise<TeacherBillingView | null> {
  if (!isBillingEnabled()) return null;
  try {
    const user = await requireTeacherPageSession();
    return await loadTeacherBillingView(user.id);
  } catch {
    return null;
  }
}

export default async function TeacherDashboardPage() {
  const billingEnabled = isBillingEnabled();
  return (
    <TeacherDashboard billingEnabled={billingEnabled} billing={await billingForCurrentTeacher()} />
  );
}
