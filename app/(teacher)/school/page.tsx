import { BillingPausedNote } from '@/components/teacher/BillingPausedNote';
import { SchoolAdmin } from '@/components/teacher/SchoolAdmin';
import { isBillingEnabled } from '@/lib/config/feature-flags';
import { requireTeacherPageSession } from '@/lib/server/auth/session';
import { readSchoolForAdmin } from '@/lib/server/billing/store';

export default async function SchoolPage() {
  const user = await requireTeacherPageSession();
  if (!isBillingEnabled()) return <BillingPausedNote title="School" />;
  const school = await readSchoolForAdmin(user.id);
  return <SchoolAdmin initial={school} />;
}
