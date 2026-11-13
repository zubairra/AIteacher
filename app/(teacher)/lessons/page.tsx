import { TeacherDashboard } from '@/components/teacher/TeacherDashboard';
import { requireTeacherPageSession } from '@/lib/server/auth/session';
import { loadTeacherBillingView } from '@/lib/server/billing/store';
import type { TeacherBillingView } from '@/lib/teacher/billing';

export default async function SavedLessonsPage() {
  let billing: TeacherBillingView | null = null;
  try {
    const user = await requireTeacherPageSession();
    billing = await loadTeacherBillingView(user.id);
  } catch {
    billing = null;
  }
  return <TeacherDashboard showAll billing={billing} />;
}
