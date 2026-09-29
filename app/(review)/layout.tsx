import { requireTeacherPageSession } from '@/lib/server/auth/session';

export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  await requireTeacherPageSession();
  return children;
}
