import { notFound, redirect } from 'next/navigation';

import { lessonPath, isShareToken } from '@/lib/student/nav';
import { getTeacherPageSession } from '@/lib/server/auth/session';
import { readAccountRole } from '@/lib/server/student/account';
import { studentStore } from '@/lib/server/student/firestore-store';
import { redeemShareToken } from '@/lib/server/student/sharing';

export default async function ShareRedeemPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isShareToken(token)) notFound();
  const user = await getTeacherPageSession();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/learn/share/${token}`)}`);
  if ((await readAccountRole(user.id)) !== 'student') redirect('/');
  const grant = await redeemShareToken(studentStore(), {
    studentUid: user.id,
    token,
    now: Date.now(),
  });
  if (!grant) notFound();
  redirect(lessonPath(grant.id));
}
