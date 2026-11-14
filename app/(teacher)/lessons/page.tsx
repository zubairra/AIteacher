import { TeacherDashboard } from '@/components/teacher/TeacherDashboard';
import { isBillingEnabled } from '@/lib/config/feature-flags';
import { requireTeacherPageSession } from '@/lib/server/auth/session';
import { loadTeacherBillingView } from '@/lib/server/billing/store';
import type { TeacherBillingView } from '@/lib/teacher/billing';

export default async function SavedLessonsPage() {
  const billingEnabled = isBillingEnabled();
  let billing: TeacherBillingView | null = null;
  if (billingEnabled) {
    try {
      const user = await requireTeacherPageSession();
      billing = await loadTeacherBillingView(user.id);
    } catch {
      billing = null;
    }
  }
  return <TeacherDashboard showAll billingEnabled={billingEnabled} billing={billing} />;
}
