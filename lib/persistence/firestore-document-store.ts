'use client';

import type { DocumentStore, DocumentSummary, MaicDocument } from '@openmaic/storage';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  writeBatch,
  type Firestore,
  type WriteBatch,
} from 'firebase/firestore';
import { chunkWriteOperations } from '@/lib/persistence/firestore-batch';

import type { AppDocument, AppStage } from '@/lib/document-store/persistence-types';
import { validateAppScene, validateAppStage } from '@/lib/document-store/validators';
import { currentFirebaseUid, getFirebaseClient } from '@/lib/firebase/client';
import type { AppScene } from '@/lib/types/stage';

export function firebaseLessonPath(uid: string, stageId: string) {
  return `users/${uid}/lessons/${stageId}`;
}

type BatchOperation = (batch: WriteBatch) => void;

async function commitBatched(db: Firestore, operations: BatchOperation[]): Promise<void> {
  for (const chunk of chunkWriteOperations(operations)) {
    const batch = writeBatch(db);
    chunk.forEach((operation) => operation(batch));
    await batch.commit();
  }
}

function summary(
  stage: AppStage,
  sceneCount: number,
  createdAt: number,
  updatedAt: number,
): DocumentSummary {
  return {
    id: stage.id,
    name: stage.name,
    ...(stage.description !== undefined ? { description: stage.description } : {}),
    ...(stage.interactiveMode !== undefined ? { interactiveMode: stage.interactiveMode } : {}),
    ...(stage.taskEngineMode !== undefined ? { taskEngineMode: stage.taskEngineMode } : {}),
    ...(stage.teacherLesson !== undefined ? { teacherLesson: stage.teacherLesson } : {}),
    createdAt,
    updatedAt,
    sceneCount,
  };
}

/** UID-scoped Firestore adapter for OpenMAIC's existing Stage/Scene persistence seam. */
export class FirestoreDocumentStore implements DocumentStore<AppScene, AppStage> {
  async saveDocument(document: AppDocument): Promise<void> {
    validateAppStage(document.stage);
    document.scenes.forEach(validateAppScene);
    const uid = await currentFirebaseUid();
    const { db } = getFirebaseClient();
    const lesson = doc(db, firebaseLessonPath(uid, document.stage.id));
    const existing = await getDoc(lesson);
    const oldScenes = await getDocs(collection(lesson, 'scenes'));
    const incoming = new Set(document.scenes.map((scene) => scene.id));
    const now = Date.now();
    const operations: BatchOperation[] = [];
    for (const stored of oldScenes.docs) {
      if (!incoming.has(stored.id)) operations.push((batch) => batch.delete(stored.ref));
    }
    for (const scene of document.scenes) {
      operations.push((batch) => batch.set(doc(lesson, 'scenes', scene.id), { scene }));
    }
    operations.push((batch) =>
      batch.set(lesson, {
        version: 1,
        ownerUid: uid,
        stage: document.stage,
        outline: document.outline ?? null,
        dslVersion: document.dslVersion ?? null,
        ...summary(
          document.stage,
          document.scenes.length,
          Number(existing.data()?.createdAt ?? now),
          now,
        ),
      }),
    );
    await commitBatched(db, operations);
  }

  async loadDocument(stageId: string): Promise<MaicDocument<AppScene, AppStage> | null> {
    const uid = await currentFirebaseUid();
    const { db } = getFirebaseClient();
    const lesson = doc(db, firebaseLessonPath(uid, stageId));
    const [snapshot, scenes] = await Promise.all([
      getDoc(lesson),
      getDocs(query(collection(lesson, 'scenes'), orderBy('scene.order', 'asc'))),
    ]);
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    const stage = data.stage as AppStage;
    const values = scenes.docs.map((item) => item.data().scene as AppScene);
    validateAppStage(stage);
    values.forEach(validateAppScene);
    return {
      stage,
      scenes: values,
      ...(data.outline !== null && data.outline !== undefined ? { outline: data.outline } : {}),
      ...(typeof data.dslVersion === 'string' ? { dslVersion: data.dslVersion } : {}),
    };
  }

  async listDocuments(): Promise<DocumentSummary[]> {
    const uid = await currentFirebaseUid();
    const { db } = getFirebaseClient();
    const snapshot = await getDocs(
      query(collection(db, `users/${uid}/lessons`), orderBy('updatedAt', 'desc')),
    );
    return snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        name: String(data.name ?? 'Untitled lesson'),
        ...(typeof data.description === 'string' ? { description: data.description } : {}),
        ...(typeof data.interactiveMode === 'boolean'
          ? { interactiveMode: data.interactiveMode }
          : {}),
        ...(typeof data.taskEngineMode === 'boolean'
          ? { taskEngineMode: data.taskEngineMode }
          : {}),
        ...(data.teacherLesson ? { teacherLesson: data.teacherLesson } : {}),
        createdAt: Number(data.createdAt),
        updatedAt: Number(data.updatedAt),
        sceneCount: Number(data.sceneCount),
      };
    });
  }

  async deleteDocument(stageId: string): Promise<void> {
    const uid = await currentFirebaseUid();
    const { db } = getFirebaseClient();
    const lesson = doc(db, firebaseLessonPath(uid, stageId));
    const scenes = await getDocs(collection(lesson, 'scenes'));
    const operations: BatchOperation[] = scenes.docs.map(
      (scene) => (batch) => batch.delete(scene.ref),
    );
    operations.push((batch) => batch.delete(lesson));
    await commitBatched(db, operations);
  }

  async putStage(stageId: string, stage: AppStage): Promise<void> {
    validateAppStage(stage);
    if (stage.id !== stageId) throw new Error('Stage id mismatch');
    const uid = await currentFirebaseUid();
    const { db } = getFirebaseClient();
    const reference = doc(db, firebaseLessonPath(uid, stageId));
    await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(reference);
      if (!existing.exists()) throw new Error('Lesson not found');
      transaction.update(reference, {
        stage,
        ...summary(
          stage,
          Number(existing.data().sceneCount),
          Number(existing.data().createdAt),
          Date.now(),
        ),
      });
    });
  }

  async putScene(stageId: string, scene: AppScene): Promise<void> {
    validateAppScene(scene);
    const uid = await currentFirebaseUid();
    const { db } = getFirebaseClient();
    const lesson = doc(db, firebaseLessonPath(uid, stageId));
    if (!(await getDoc(lesson)).exists()) throw new Error('Lesson not found');
    await runTransaction(db, async (transaction) => {
      transaction.set(doc(lesson, 'scenes', scene.id), { scene });
      transaction.update(lesson, { updatedAt: Date.now() });
    });
  }

  async getScene(stageId: string, sceneId: string): Promise<AppScene | null> {
    const uid = await currentFirebaseUid();
    const { db } = getFirebaseClient();
    const snapshot = await getDoc(doc(db, firebaseLessonPath(uid, stageId), 'scenes', sceneId));
    if (!snapshot.exists()) return null;
    const scene = snapshot.data().scene as AppScene;
    validateAppScene(scene);
    return scene;
  }

  async deleteScene(stageId: string, sceneId: string): Promise<void> {
    const uid = await currentFirebaseUid();
    const { db } = getFirebaseClient();
    const lesson = doc(db, firebaseLessonPath(uid, stageId));
    await deleteDoc(doc(lesson, 'scenes', sceneId));
    const scenes = await getDocs(collection(lesson, 'scenes'));
    await runTransaction(db, async (transaction) =>
      transaction.update(lesson, { sceneCount: scenes.size, updatedAt: Date.now() }),
    );
  }
}
