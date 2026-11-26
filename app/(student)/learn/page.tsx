import { StudentHome } from '@/components/student/StudentHome';
import { viewProgress } from '@/lib/student/progress';
import { studentStore } from '@/lib/server/student/firestore-store';
import { requireTeacherPageSession } from '@/lib/server/auth/session';

export default async function StudentHomePage() {
  const user = await requireTeacherPageSession();
  const store = studentStore();
  const [grants, sessions, stats] = await Promise.all([
    store.listGrants(user.id),
    store.listSessions(user.id),
    store.getStats(user.id),
  ]);
  return (
    <StudentHome
      name={user.name}
      grants={grants}
      sessions={sessions}
      progress={viewProgress(stats)}
    />
  );
}
