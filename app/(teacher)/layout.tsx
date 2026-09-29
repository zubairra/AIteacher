import { TeacherShell } from '@/components/teacher/TeacherShell';
import { requireTeacherPageSession } from '@/lib/server/auth/session';

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireTeacherPageSession();
  return (
    <TeacherShell teacherName={user.name} teacherEmail={user.email} photoURL={user.photoURL}>
      {children}
    </TeacherShell>
  );
}
