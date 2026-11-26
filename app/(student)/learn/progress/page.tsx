import { ProgressView } from '@/components/student/ProgressView';
import { viewProgress } from '@/lib/student/progress';
import { studentStore } from '@/lib/server/student/firestore-store';
import { requireTeacherPageSession } from '@/lib/server/auth/session';

export default async function StudentProgressPage() {
  const user = await requireTeacherPageSession();
  const stats = await studentStore().getStats(user.id);
  return <ProgressView progress={viewProgress(stats)} />;
}
