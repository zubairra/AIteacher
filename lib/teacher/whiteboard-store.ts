'use client';

import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

import { currentFirebaseUid, getFirebaseClient } from '@/lib/firebase/client';
import {
  decodeWhiteboard,
  encodeBoard,
  encodePage,
  encodedPageBytes,
  MAX_WHITEBOARD_PAGE_BYTES,
  type WhiteboardState,
} from '@/lib/teacher/whiteboard';

export function whiteboardBoardPath(uid: string, boardId: string): string {
  return `users/${uid}/whiteboards/${boardId}`;
}

export async function loadTeacherWhiteboard(boardId: string): Promise<WhiteboardState | null> {
  const uid = await currentFirebaseUid();
  const { db } = getFirebaseClient();
  const boardRef = doc(db, whiteboardBoardPath(uid, boardId));
  const snapshot = await getDoc(boardRef);
  if (!snapshot.exists()) return null;
  const pageSnap = await getDocs(collection(boardRef, 'pages'));
  return decodeWhiteboard(
    snapshot.data(),
    new Map(pageSnap.docs.map((page) => [page.id, page.data()])),
  );
}

export async function saveTeacherWhiteboard(input: {
  boardId: string;
  lessonId: string | null;
  state: WhiteboardState;
  pageIds: readonly string[];
}): Promise<void> {
  const uid = await currentFirebaseUid();
  const { db } = getFirebaseClient();
  const boardRef = doc(db, whiteboardBoardPath(uid, input.boardId));
  await setDoc(boardRef, encodeBoard(uid, input.lessonId, input.state));
  for (const pageId of input.pageIds) {
    const page = input.state.pages.find((item) => item.id === pageId);
    if (!page) continue;
    if (encodedPageBytes(page, uid) > MAX_WHITEBOARD_PAGE_BYTES) {
      throw new Error('This page is full. Add a new page.');
    }
    await setDoc(doc(boardRef, 'pages', pageId), encodePage(uid, page));
  }
}
