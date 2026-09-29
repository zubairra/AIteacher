import { requireTeacherPageSession } from '@/lib/server/auth/session';

export default async function TeachLayout({ children }: { children: React.ReactNode }) {
  await requireTeacherPageSession();
  return children;
}
