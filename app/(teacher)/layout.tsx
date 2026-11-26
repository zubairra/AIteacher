import { redirect } from 'next/navigation';

import { TeacherShell } from '@/components/teacher/TeacherShell';
import { isBillingEnabled } from '@/lib/config/feature-flags';
import { requireTeacherPageSession } from '@/lib/server/auth/session';
import { readAccountRole } from '@/lib/server/student/account';
import { loadTeacherBillingView } from '@/lib/server/billing/store';

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireTeacherPageSession();
  if ((await readAccountRole(user.id)) === 'student') redirect('/learn');
  const billingEnabled = isBillingEnabled();
  let chalkLabel: string | null = null;
  if (billingEnabled) {
    try {
      chalkLabel = (await loadTeacherBillingView(user.id)).chalksLabel;
    } catch {
      chalkLabel = null;
    }
  }
  return (
    <TeacherShell
      teacherName={user.name}
      teacherEmail={user.email}
      photoURL={user.photoURL}
      chalkLabel={chalkLabel}
      billingEnabled={billingEnabled}
    >
      {children}
    </TeacherShell>
  );
}
