import { BillingPanel } from '@/components/teacher/BillingPanel';
import { BillingPausedNote } from '@/components/teacher/BillingPausedNote';
import { isBillingEnabled } from '@/lib/config/feature-flags';
import { requireTeacherPageSession } from '@/lib/server/auth/session';
import { loadTeacherBillingView } from '@/lib/server/billing/store';

export default async function BillingPage() {
  const user = await requireTeacherPageSession();
  if (!isBillingEnabled()) return <BillingPausedNote />;
  return <BillingPanel initial={await loadTeacherBillingView(user.id)} />;
}
