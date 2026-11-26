import { notFound } from 'next/navigation';

import { TutorChat } from '@/components/student/TutorChat';
import { sceneTitles } from '@/lib/student/lesson-grounding';
import { isGrantId } from '@/lib/student/nav';
import { requireTeacherPageSession } from '@/lib/server/auth/session';
import { studentStore } from '@/lib/server/student/firestore-store';
import { toPublicMessage } from '@/lib/server/student/tutor-turn';

export default async function StudentLessonPage({
  params,
}: {
  params: Promise<{ grantId: string }>;
}) {
  const { grantId } = await params;
  if (!isGrantId(grantId)) notFound();
  const user = await requireTeacherPageSession();
  const store = studentStore();
  const grant = await store.getGrant(user.id, grantId);
  if (!grant || grant.studentUid !== user.id) notFound();
  const lesson = await store.getLesson(grant.teacherUid, grant.lessonId);
  const sessions = (await store.listSessions(user.id)).filter(
    (session) => session.grantId === grant.id,
  );
  const initial = sessions[0];
  const messages = initial ? await store.listMessages(user.id, initial.id) : [];
  return (
    <TutorChat
      grantId={grant.id}
      lessonTitle={grant.title}
      subject={grant.subject}
      grade={grant.grade}
      topic={grant.topic}
      sceneTitles={sceneTitles(lesson?.scenes ?? [])}
      sessions={sessions.map((session) => ({
        id: session.id,
        updatedAt: session.updatedAt,
        mode: session.mode,
      }))}
      initialSessionId={initial?.id}
      initialMessages={messages.map(toPublicMessage)}
    />
  );
}
