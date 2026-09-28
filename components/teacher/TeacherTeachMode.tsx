'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Eraser,
  Gamepad2,
  LogOut,
  Maximize2,
  Minimize2,
  NotebookPen,
  Pencil,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ContainBox } from '@/components/edit/ContainBox';
import { InteractiveIframeHost } from '@/components/scene-renderers/InteractiveIframeHost';
import { SceneRenderer } from '@/components/stage/scene-renderer';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { parseTeacherLessonMetadata, parseTeacherNotes } from '@/lib/teacher/lesson-request';
import { getTeacherNavigationState, isEditableShortcutTarget } from '@/lib/teacher/teach-mode';
import { useStageStore } from '@/lib/store/stage';
import { AnnotationOverlay } from '@/components/teacher/AnnotationOverlay';
import {
  clearSceneAnnotations,
  createTeacherAnnotationState,
  getSceneAnnotationHistory,
  redoSceneAnnotations,
  undoSceneAnnotations,
  type AnnotationTool,
} from '@/lib/teacher/annotations';
import { TeacherNotesContent } from '@/components/teacher/TeacherNotesPanel';
import { toggleTeacherFullscreen } from '@/lib/teacher/fullscreen';
import { parseNativeActivity } from '@/lib/teacher/native-activities';
import { NativeActivitySurface } from '@/components/teacher/activities/NativeActivitySurface';

export function TeacherTeachMode() {
  const router = useRouter();
  const teachRootRef = useRef<HTMLElement>(null);
  const stage = useStageStore.use.stage();
  const scenes = useStageStore.use.scenes();
  const currentSceneId = useStageStore.use.currentSceneId();
  const setCurrentSceneId = useStageStore.use.setCurrentSceneId();
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('off');
  const [annotations, setAnnotations] = useState(createTeacherAnnotationState);
  const [notesOpen, setNotesOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenNotice, setFullscreenNotice] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const metadata = parseTeacherLessonMetadata(stage?.teacherLesson);
  const navigation = useMemo(
    () => getTeacherNavigationState(scenes, currentSceneId),
    [currentSceneId, scenes],
  );
  const currentScene = scenes[navigation.index] ?? null;
  const annotationHistory = currentScene
    ? getSceneAnnotationHistory(annotations, currentScene.id)
    : undefined;
  const teacherNotes = parseTeacherNotes(currentScene?.teacherNotes);
  const nativeActivity = parseNativeActivity(currentScene?.nativeActivity);

  const prepareSceneChange = useCallback(() => {
    setAnnotationTool('off');
    setNotesOpen(false);
    setActivityOpen(false);
  }, [setActivityOpen, setAnnotationTool, setNotesOpen]);

  const previous = useCallback(() => {
    if (navigation.previousSceneId) {
      prepareSceneChange();
      setCurrentSceneId(navigation.previousSceneId);
    }
  }, [navigation.previousSceneId, prepareSceneChange, setCurrentSceneId]);
  const next = useCallback(() => {
    if (navigation.nextSceneId) {
      prepareSceneChange();
      setCurrentSceneId(navigation.nextSceneId);
    }
  }, [navigation.nextSceneId, prepareSceneChange, setCurrentSceneId]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === teachRootRef.current);
      setFullscreenNotice(null);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [setFullscreenNotice]);

  const toggleFullscreen = useCallback(async () => {
    const root = teachRootRef.current;
    if (!root) return;
    const result = await toggleTeacherFullscreen(root);
    if (result === 'unavailable' || result === 'denied') {
      setFullscreenNotice('Fullscreen is unavailable. Teach Mode remains active in this window.');
    }
  }, [setFullscreenNotice]);

  const exitTeaching = useCallback(async () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen().catch(() => undefined);
    }
    router.push(stage ? `/lessons/${stage.id}/edit` : '/lessons');
  }, [router, stage]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (
        isEditableShortcutTarget(event.target) ||
        isEditableShortcutTarget(document.activeElement)
      ) {
        return;
      }
      if (event.key === 'ArrowLeft' && navigation.previousSceneId) {
        event.preventDefault();
        previous();
      } else if (event.key === 'ArrowRight' && navigation.nextSceneId) {
        event.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigation.nextSceneId, navigation.previousSceneId, next, previous]);

  if (!stage || !metadata) {
    return (
      <main className="grid min-h-0 flex-1 place-items-center bg-slate-950 p-6 text-white">
        <section className="max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
          <h1 className="text-2xl font-semibold">Teach Mode is unavailable</h1>
          <p className="mt-3 text-slate-300">
            This lesson does not contain valid teacher lesson metadata. You can still open it in the
            standard OpenMAIC experience.
          </p>
          <button
            type="button"
            onClick={() => router.push(stage ? `/lessons/${stage.id}/edit` : '/')}
            className="mt-6 min-h-12 rounded-xl bg-white px-5 font-semibold text-slate-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Return to lessons
          </button>
        </section>
      </main>
    );
  }

  if (!currentScene) {
    return (
      <main className="grid min-h-0 flex-1 place-items-center bg-slate-950 p-6 text-white">
        <section className="text-center">
          <h1 className="text-2xl font-semibold">This lesson has no teaching scenes yet</h1>
          <button
            type="button"
            onClick={() => router.push(`/lessons/${stage.id}/edit`)}
            className="mt-6 min-h-12 rounded-xl bg-white px-5 font-semibold text-slate-950"
          >
            Return to lesson review
          </button>
        </section>
      </main>
    );
  }

  const interactive = currentScene.type === 'interactive';
  const sceneContent = (
    <>
      <SceneProvider>
        <SceneRenderer scene={currentScene} mode="playback" />
      </SceneProvider>
      <AnnotationOverlay
        sceneId={currentScene.id}
        tool={annotationTool}
        state={annotations}
        onStateChange={setAnnotations}
      />
    </>
  );

  return (
    <main
      ref={teachRootRef}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-950 text-white"
      data-testid="teacher-teach-mode"
    >
      {fullscreenNotice ? (
        <div
          role="status"
          data-testid="teach-fullscreen-notice"
          className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-950 shadow-lg"
        >
          {fullscreenNotice}
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
        {interactive ? (
          <div className="relative h-full w-full overflow-hidden rounded-xl bg-white shadow-2xl">
            {sceneContent}
          </div>
        ) : (
          <ContainBox className="overflow-hidden rounded-xl bg-white shadow-2xl">
            {sceneContent}
          </ContainBox>
        )}
      </div>

      <nav
        data-testid="teacher-teach-toolbar"
        className="flex min-h-20 shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-slate-900 px-3 py-2 sm:px-5"
        aria-label="Lesson navigation"
      >
        <button
          type="button"
          onClick={() => setActivityOpen(true)}
          className={toolButtonClass(activityOpen)}
          hidden={!nativeActivity}
        >
          <Gamepad2 className="size-5" aria-hidden="true" />
          <span className="hidden lg:inline">Activity</span>
        </button>
        <button
          type="button"
          onClick={previous}
          disabled={!navigation.previousSceneId}
          className="flex min-h-14 min-w-14 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-base font-semibold hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          aria-label="Previous scene"
        >
          <ArrowLeft className="size-6" aria-hidden="true" />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <output
          className="min-w-20 text-center text-lg font-bold tabular-nums"
          aria-label="Lesson position"
        >
          {navigation.position} / {navigation.total}
        </output>
        <div className="flex items-center gap-2" role="toolbar" aria-label="Annotation tools">
          <button
            type="button"
            onClick={() => setAnnotationTool((tool) => (tool === 'pen' ? 'off' : 'pen'))}
            aria-pressed={annotationTool === 'pen'}
            className={toolButtonClass(annotationTool === 'pen')}
          >
            <Pencil className="size-5" aria-hidden="true" />
            <span className="hidden xl:inline">Draw</span>
          </button>
          <button
            type="button"
            onClick={() => setAnnotationTool((tool) => (tool === 'eraser' ? 'off' : 'eraser'))}
            aria-pressed={annotationTool === 'eraser'}
            className={toolButtonClass(annotationTool === 'eraser')}
          >
            <Eraser className="size-5" aria-hidden="true" />
            <span className="sr-only">Eraser</span>
          </button>
          <button
            type="button"
            onClick={() => setAnnotations(undoSceneAnnotations(annotations, currentScene.id))}
            disabled={!annotationHistory?.past.length}
            className={toolButtonClass(false)}
            aria-label="Undo annotation"
          >
            <Undo2 className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setAnnotations(redoSceneAnnotations(annotations, currentScene.id))}
            disabled={!annotationHistory?.future.length}
            className={toolButtonClass(false)}
            aria-label="Redo annotation"
          >
            <Redo2 className="size-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                annotationHistory?.strokes.length &&
                window.confirm('Clear all annotations on this lesson scene?')
              ) {
                setAnnotations(clearSceneAnnotations(annotations, currentScene.id));
              }
            }}
            disabled={!annotationHistory?.strokes.length}
            className={toolButtonClass(false)}
            aria-label="Clear annotations"
          >
            <Trash2 className="size-5" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setNotesOpen((open) => !open)}
          disabled={!teacherNotes}
          aria-pressed={notesOpen}
          className={toolButtonClass(notesOpen)}
        >
          <NotebookPen className="size-5" aria-hidden="true" />
          <span className="hidden xl:inline">Notes</span>
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className={toolButtonClass(false)}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? (
            <Minimize2 className="size-5" aria-hidden="true" />
          ) : (
            <Maximize2 className="size-5" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={next}
          disabled={!navigation.nextSceneId}
          className="flex min-h-14 min-w-14 items-center justify-center gap-2 rounded-xl bg-white/10 px-4 text-base font-semibold hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          aria-label="Next scene"
        >
          <span className="hidden sm:inline">Next</span>
          <ArrowRight className="size-6" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={exitTeaching}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <LogOut className="size-5" aria-hidden="true" />
          <span className="hidden lg:inline">Exit Teaching</span>
        </button>
      </nav>
      {notesOpen && teacherNotes ? (
        <TeacherNotesContent
          notes={teacherNotes}
          onClose={() => setNotesOpen(false)}
          heading="Teacher Notes — quick peek"
          className="absolute bottom-24 right-4 z-50 max-h-[calc(100%-7rem)] w-[min(24rem,calc(100%-2rem))]"
        />
      ) : null}
      {activityOpen && nativeActivity ? (
        <NativeActivitySurface definition={nativeActivity} onClose={() => setActivityOpen(false)} />
      ) : null}
      <InteractiveIframeHost />
    </main>
  );
}

function toolButtonClass(active: boolean): string {
  return [
    'flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-xl px-3 font-semibold',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
    'disabled:cursor-not-allowed disabled:opacity-30',
    active ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/15',
  ].join(' ');
}
