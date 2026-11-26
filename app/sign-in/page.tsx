import { redirect } from 'next/navigation';

import { GoogleSignInForm } from '@/components/teacher/GoogleSignInForm';
import { safeStudentNext } from '@/lib/student/nav';
import { getTeacherPageSession } from '@/lib/server/auth/session';
import { readAccountRole } from '@/lib/server/student/account';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeStudentNext((await searchParams).next);
  const user = await getTeacherPageSession();
  if (user) redirect((await readAccountRole(user.id)) === 'student' ? next : '/');
  return <GoogleSignInForm next={next} />;
}
