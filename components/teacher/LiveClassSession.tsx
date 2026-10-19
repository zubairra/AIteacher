'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { JoinQrCode } from '@/components/teacher/JoinQrCode';
import {
  closeLiveSession,
  publishScene,
  readLiveKeys,
  revealLiveAnswers,
  setPromptIndex,
  startLiveSession,
  watchLiveResponses,
  watchLiveSession,
  type LiveSessionDocument,
} from '@/lib/teacher/live-session-client';
import {
  correctLabels,
  gradeLiveAnswer,
  joinCodeIsValid,
  livePromptsFromScene,
  summarizeLiveResult,
  tallyPrompt,
  type LiveSceneSource,
  type StoredResponse,
} from '@/lib/teacher/live-session';

export function LiveClassSession({
  lessonId,
  lessonTitle,
  scene,
  open,
  onOpenChange,
  onCodeChange,
}: {
  lessonId: string;
  lessonTitle: string;
  scene: LiveSceneSource;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCodeChange: (code: string | null) => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [session, setSession] = useState<LiveSessionDocument | null>(null);
  const [responses, setResponses] = useState<StoredResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [origin, setOrigin] = useState('');
  const starting = useRef(false);
  const publishing = useRef<string | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  useEffect(() => {
    onCodeChange(code);
  }, [code, onCodeChange]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey(lessonId));
    setCode(saved && joinCodeIsValid(saved) ? saved : null);
    setRestored(true);
  }, [lessonId]);

  useEffect(() => {
    if (!restored || !open || code || starting.current) return;
    const current = sceneRef.current;
    starting.current = true;
    setBusy(true);
    setError(null);
    const built = livePromptsFromScene(current);
    void startLiveSession({
      lessonId,
      lessonTitle,
      sceneId: current.id,
      sceneTitle: current.title || 'Scene',
      prompts: built.prompts,
      keys: built.keys,
    })
      .then(({ code: next }) => {
        sessionStorage.setItem(storageKey(lessonId), next);
        setCode(next);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not start the live class.');
      })
      .finally(() => {
        starting.current = false;
        setBusy(false);
      });
  }, [attempt, code, lessonId, lessonTitle, open, restored]);

  useEffect(() => {
    if (!code) return;
    return watchLiveSession(code, setSession, (cause) => setError(cause.message));
  }, [code]);

  useEffect(() => {
    if (!code) return;
    return watchLiveResponses(code, setResponses, (cause) => setError(cause.message));
  }, [code]);

  useEffect(() => {
    if (!code || session?.status !== 'open' || !session) return;
    if (session.sceneId === scene.id || publishing.current === scene.id) return;
    const current = sceneRef.current;
    if (current.id !== scene.id) return;
    publishing.current = scene.id;
    const built = livePromptsFromScene(current);
    void publishScene({
      code,
      lessonId,
      sceneId: current.id,
      sceneTitle: current.title || 'Scene',
      prompts: built.prompts,
      keys: built.keys,
    }).catch((cause: unknown) => {
      if (publishing.current === current.id) publishing.current = null;
      setError(cause instanceof Error ? cause.message : 'Could not open this scene for the class.');
    });
  }, [code, lessonId, scene.id, session]);

  useEffect(() => {
    if (session?.status === 'closed') sessionStorage.removeItem(storageKey(lessonId));
  }, [lessonId, session?.status]);

  if (!open) return null;

  const prompt = session?.prompts[session.promptIndex] ?? null;
  const answers = prompt
    ? responses.flatMap((response) => {
        const answer = response.answers[prompt.id];
        return answer ? [answer] : [];
      })
    : [];
  const rows = prompt ? tallyPrompt(prompt, answers) : [];
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const joinUrl = code && origin ? `${origin}/join?code=${code}` : '';

  const reveal = async () => {
    if (!code || session?.revealed) return;
    setError(null);
    try {
      await revealLiveAnswers(code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reveal the answer.');
    }
  };

  const move = async (index: number) => {
    if (!code) return;
    setError(null);
    try {
      await setPromptIndex(code, index);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not change the question.');
    }
  };

  const end = async () => {
    if (!code || !session) return;
    if (!window.confirm('End the class and save results on this lesson?')) return;
    setBusy(true);
    setError(null);
    try {
      const keyDoc = await readLiveKeys(lessonId, code);
      if (!keyDoc) throw new Error('Could not read the answer key for this class.');
      const result = summarizeLiveResult({
        code,
        lessonId,
        sceneId: session.sceneId,
        sceneTitle: session.sceneTitle,
        closedAt: Date.now(),
        prompts: keyDoc.prompts.length ? keyDoc.prompts : session.prompts,
        keys: keyDoc.keys,
        responses,
      });
      await closeLiveSession({ code, lessonId, result });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save class results.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      data-testid="live-class-panel"
      className="absolute bottom-24 right-3 top-3 z-40 flex w-[min(24rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl bg-white text-slate-950 shadow-2xl"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="text-lg font-semibold">Live class</h2>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="min-h-11 rounded-lg px-3 font-semibold text-slate-600 hover:bg-slate-100"
        >
          Hide
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {!code ? (
          <p className="text-base text-slate-600">
            {busy ? 'Starting the class…' : 'Start a class to show a join code on this screen.'}
          </p>
        ) : (
          <>
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Join code
              </p>
              <p
                data-testid="live-join-code"
                className="mt-1 font-mono text-5xl font-bold tracking-[0.22em]"
              >
                {code}
              </p>
              <p className="mt-2 text-sm text-slate-500">Students open /join on their phones</p>
            </div>
            {joinUrl ? (
              <div className="flex justify-center">
                <JoinQrCode value={joinUrl} />
              </div>
            ) : null}
          </>
        )}
        {session?.status === 'closed' ? (
          <div className="rounded-xl bg-emerald-50 p-4 text-emerald-950">
            <p className="font-semibold">Results saved on this lesson.</p>
            <Link
              href={`/lessons/${lessonId}/results`}
              className="mt-2 inline-flex min-h-11 items-center font-semibold underline"
            >
              View saved results
            </Link>
          </div>
        ) : null}
        {session && session.status === 'open' && prompt ? (
          <section>
            <p className="text-sm font-semibold text-slate-500">
              Question {session.promptIndex + 1} of {session.prompts.length}
            </p>
            <h3 className="mt-1 text-lg font-semibold leading-snug">{prompt.prompt}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {answers.length} answered · {responses.length} joined
            </p>
            <ul className="mt-3 grid gap-2">
              {rows.map((row) => (
                <li key={row.id}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>{row.label}</span>
                    <span className="font-semibold tabular-nums">{row.count}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-violet-500"
                      style={{ width: `${(row.count / maxCount) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            {prompt.kind === 'text' ? (
              <ul className="mt-3 grid gap-2">
                {responses.map((response) => {
                  const answer = response.answers[prompt.id];
                  if (answer?.kind !== 'text') return null;
                  return (
                    <li
                      key={response.displayName + answer.text}
                      className="rounded-lg bg-slate-50 p-3 text-sm"
                    >
                      <span className="font-semibold">{response.displayName}: </span>
                      {answer.text}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {session.revealed ? (
              <Revealed prompt={prompt} responses={responses} lessonId={lessonId} code={code} />
            ) : null}
          </section>
        ) : null}
        {session && session.status === 'open' && !prompt ? (
          <p className="text-base text-slate-600">
            This scene has no question students can answer. Move to an activity or quiz.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {error}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2 border-t border-slate-200 p-3">
        {session?.status === 'open' && session.prompts.length > 1 ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={actionClass}
              disabled={session.promptIndex <= 0}
              onClick={() => void move(session.promptIndex - 1)}
            >
              Previous question
            </button>
            <button
              type="button"
              className={actionClass}
              disabled={session.promptIndex >= session.prompts.length - 1}
              onClick={() => void move(session.promptIndex + 1)}
            >
              Next question
            </button>
          </div>
        ) : null}
        {session?.status === 'open' && prompt ? (
          <button
            type="button"
            data-testid="live-reveal"
            className={actionClass}
            disabled={session.revealed}
            onClick={() => void reveal()}
          >
            {session.revealed ? 'Answer revealed' : 'Reveal answer'}
          </button>
        ) : null}
        {session?.status === 'open' ? (
          <button
            type="button"
            data-testid="live-end"
            className="min-h-12 rounded-xl bg-slate-950 font-semibold text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => void end()}
          >
            End class and save
          </button>
        ) : null}
        {!code && error ? (
          <button
            type="button"
            className={actionClass}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </button>
        ) : null}
        {session?.status === 'closed' ? (
          <button
            type="button"
            className={actionClass}
            onClick={() => {
              setSession(null);
              setResponses([]);
              setError(null);
              setCode(null);
              setAttempt((value) => value + 1);
            }}
          >
            Start another class
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function Revealed({
  prompt,
  responses,
  lessonId,
  code,
}: {
  prompt: NonNullable<LiveSessionDocument['prompts'][number]>;
  responses: StoredResponse[];
  lessonId: string;
  code: string | null;
}) {
  const [labels, setLabels] = useState<string[]>([]);
  const [marks, setMarks] = useState<Array<{ name: string; correct: boolean | null }>>([]);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    void readLiveKeys(lessonId, code).then((keyDoc) => {
      if (cancelled || !keyDoc) return;
      const key = keyDoc.keys[prompt.id];
      if (!key) return;
      setLabels(correctLabels(prompt, key));
      setMarks(
        responses.flatMap((response) => {
          const answer = response.answers[prompt.id];
          if (!answer || answer.kind === 'text') return [];
          return [{ name: response.displayName, correct: gradeLiveAnswer(key, answer) }];
        }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [code, lessonId, prompt, responses]);

  if (!labels.length && !marks.length) return null;
  return (
    <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-emerald-950">
      {labels.length ? (
        <>
          <p className="text-sm font-semibold">Correct answer</p>
          <ul className="mt-1 grid gap-1 text-sm">
            {labels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm font-semibold">Written answers are not graded automatically.</p>
      )}
      {marks.length ? (
        <ul className="mt-2 grid gap-1 text-sm">
          {marks.map((mark) => (
            <li key={mark.name}>
              {mark.name}: {mark.correct ? 'correct' : 'incorrect'}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function storageKey(lessonId: string): string {
  return `smartboard-live-code:${lessonId}`;
}

const actionClass =
  'min-h-12 rounded-xl bg-slate-100 px-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40';
