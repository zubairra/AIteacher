import { BillingPanel } from '@/components/teacher/BillingPanel';
import { requireTeacherPageSession } from '@/lib/server/auth/session';
import { loadTeacherBillingView } from '@/lib/server/billing/store';

export default async function BillingPage() {
  const user = await requireTeacherPageSession();
  return <BillingPanel initial={await loadTeacherBillingView(user.id)} />;
}
