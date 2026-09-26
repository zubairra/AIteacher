import { TeacherShell } from '@/components/teacher/TeacherShell';

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <TeacherShell>{children}</TeacherShell>;
}

