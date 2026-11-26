import { ProfileForm } from '@/components/student/ProfileForm';
import { studentStore } from '@/lib/server/student/firestore-store';
import { requireTeacherPageSession } from '@/lib/server/auth/session';

export default async function StudentProfilePage() {
  const user = await requireTeacherPageSession();
  const profile = await studentStore().getProfile(user.id, user.name);
  return <ProfileForm initial={profile} />;
}
