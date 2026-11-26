import { redirect } from 'next/navigation';

import { StudentShell } from '@/components/student/StudentShell';
import { getTeacherPageSession } from '@/lib/server/auth/session';
import { readAccountRole } from '@/lib/server/student/account';

import '../../student-tutor.css';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'OrbitTeach',
  description: 'A personal AI tutor grounded in your lessons.',
};

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await getTeacherPageSession();
  if (!user) return children;
  if ((await readAccountRole(user.id)) !== 'student') redirect('/');
  return <StudentShell studentName={user.name}>{children}</StudentShell>;
}
