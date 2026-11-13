'use client';

import { TeacherWhiteboard } from '@/components/teacher/TeacherWhiteboard';
import { WHITEBOARD_STANDALONE_ID } from '@/lib/teacher/whiteboard';

export default function StandaloneWhiteboardPage() {
  return (
    <div className="relative h-[calc(100dvh-4.5rem)]">
      <TeacherWhiteboard
        key={WHITEBOARD_STANDALONE_ID}
        boardId={WHITEBOARD_STANDALONE_ID}
        lessonId={null}
      />
    </div>
  );
}
