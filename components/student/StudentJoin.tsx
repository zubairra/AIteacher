'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { getFirebaseClient } from '@/lib/firebase/client';
import {
  submitLiveAnswer,
  watchLiveSession,
  type LiveSessionDocument,
} from '@/lib/teacher/live-session-client';
import {
  joinCodeIsValid,
  normalizeJoinCode,
  sanitizeDisplayName,
  type PublicOption,
  type PublicPrompt,
  type StudentAnswer,
} from '@/lib/teacher/live-session';

export function StudentJoin({ initialCode = '' }: { initialCode?: string }) {
  const [code, setCode] = useState(normalizeJoinCode(initialCode));
  const [name, setName] = useState('');
  const [studentUid, setStudentUid] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<LiveSessionDocument | null>(null);
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({});
  const [draft, setDraft] = useState<StudentAnswer | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    const saved = sessionStorage.getItem(nameKey(normalizeJoinCode(initialCode)));
    if (saved) setName(saved);
  }, [initialCode]);

  useEffect(() => {
    if (!studentUid || !joinCodeIsValid(code)) return;
    return watchLiveSession(
      code,
      (next) => {
        setSession(next);
        setError(next ? null : 'That code is not an open class.');
      },
      () => setError('This class is no longer available.'),
    );
  }, [code, studentUid]);

  const prompt = session?.prompts[session.promptIndex] ?? null;
  const promptRef = useRef(prompt);
  promptRef.current = prompt;

  useEffect(() => {
    const current = promptRef.current;
    if (!current) {
      setDraft(null);
      return;
    }
    setDraft(answersRef.current[current.id] ?? emptyAnswer(current));
  }, [prompt?.id]);

  const submitted = prompt ? answers[prompt.id] : undefined;

  const join = async () => {
    const nextCode = normalizeJoinCode(code);
    const displayName = sanitizeDisplayName(name);
    setCode(nextCode);
    if (!joinCodeIsValid(nextCode)) {
      setError('Enter the 6-character code from the board.');
      return;
    }
    if (!displayName) {
      setError('Enter the name you want the teacher to see.');
      return;
    }
    setJoining(true);
    setError(null);
    try {
      const { auth } = getFirebaseClient();
      await auth.authStateReady();
      if (auth.currentUser && !auth.currentUser.isAnonymous) {
        setError('This browser is signed in as a teacher. Open the join page on a student phone.');
        return;
      }
      const credential = auth.currentUser?.isAnonymous
        ? auth.currentUser
        : (await signInAnonymously(auth)).user;
      sessionStorage.setItem(nameKey(nextCode), displayName);
      setName(displayName);
      setStudentUid(credential.uid);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not join this class.');
    } finally {
      setJoining(false);
    }
  };

  const send = async () => {
    if (!studentUid || !prompt || !draft || session?.revealed || session?.status !== 'open') return;
    setError(null);
    try {
      const next = { ...answers, [prompt.id]: draft };
      await submitLiveAnswer({
        code,
        studentUid,
        displayName: sanitizeDisplayName(name),
        promptId: prompt.id,
        answer: draft,
        previous: answers,
      });
      setAnswers(next);
    } catch {
      setError('Could not send your answer. The teacher may have revealed it or ended the class.');
    }
  };

  if (!studentUid || !session) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center bg-slate-950 px-5 py-10 text-white">
        <p className="text-sm font-semibold uppercase tracking-wide text-violet-200">Join class</p>
        <h1 className="mt-2 text-3xl font-semibold">Enter the code on the board</h1>
        <label className="mt-8 block text-sm font-medium text-slate-300" htmlFor="join-code">
          Class code
        </label>
        <input
          id="join-code"
          value={code}
          onChange={(event) => setCode(normalizeJoinCode(event.target.value))}
          autoCapitalize="characters"
          autoComplete="off"
          inputMode="text"
          maxLength={6}
          className="mt-2 min-h-14 rounded-xl border border-white/15 bg-white px-4 text-center text-2xl font-bold tracking-[0.3em] text-slate-950"
        />
        <label className="mt-5 block text-sm font-medium text-slate-300" htmlFor="join-name">
          Your name
        </label>
        <input
          id="join-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="nickname"
          maxLength={40}
          className="mt-2 min-h-14 rounded-xl border border-white/15 bg-white px-4 text-lg text-slate-950"
        />
        {error ? (
          <p role="alert" className="mt-4 text-sm text-amber-200">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          data-testid="join-submit"
          onClick={() => void join()}
          disabled={joining}
          className="mt-6 min-h-14 rounded-xl bg-violet-500 text-lg font-semibold disabled:opacity-60"
        >
          {joining ? 'Joining…' : 'Join'}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-slate-950 px-5 py-8 text-white">
      <p className="text-sm text-slate-300">{session.lessonTitle}</p>
      <h1 className="mt-1 text-2xl font-semibold">{session.sceneTitle}</h1>
      <p className="mt-1 text-sm text-slate-400">Answering as {sanitizeDisplayName(name)}</p>
      {session.status !== 'open' ? (
        <p className="mt-8 text-lg">This class session has ended.</p>
      ) : !prompt ? (
        <p className="mt-8 text-lg">Waiting for the teacher to open a question.</p>
      ) : (
        <section className="mt-6 flex flex-1 flex-col">
          <h2 className="text-xl font-semibold leading-snug">{prompt.prompt}</h2>
          {session.revealed ? (
            <p className="mt-6 rounded-xl bg-white/10 p-4 text-lg">
              The teacher revealed the answer. Look at the board.
            </p>
          ) : (
            <AnswerForm key={prompt.id} prompt={prompt} value={draft} onChange={setDraft} />
          )}
          {error ? (
            <p role="alert" className="mt-4 text-sm text-amber-200">
              {error}
            </p>
          ) : null}
          {!session.revealed ? (
            <button
              type="button"
              onClick={() => void send()}
              className="mt-6 min-h-14 rounded-xl bg-violet-500 text-lg font-semibold"
            >
              {submitted ? 'Update answer' : 'Send answer'}
            </button>
          ) : null}
          {submitted && !session.revealed ? (
            <p className="mt-3 text-sm text-emerald-200">
              Sent. You can change it until the teacher reveals.
            </p>
          ) : null}
        </section>
      )}
    </main>
  );
}

function nameKey(code: string): string {
  return `smartboard-join-name:${code}`;
}

function emptyAnswer(prompt: PublicPrompt | null): StudentAnswer | null {
  if (!prompt) return null;
  if (prompt.kind === 'choice') return { kind: 'choice', optionIds: [] };
  if (prompt.kind === 'true-false') return { kind: 'true-false', value: true };
  if (prompt.kind === 'match') return { kind: 'match', pairs: [] };
  if (prompt.kind === 'sort') return { kind: 'sort', placements: [] };
  if (prompt.kind === 'order')
    return { kind: 'order', itemIds: prompt.items.map((item) => item.id) };
  return { kind: 'text', text: '' };
}

function AnswerForm({
  prompt,
  value,
  onChange,
}: {
  prompt: PublicPrompt;
  value: StudentAnswer | null;
  onChange: (answer: StudentAnswer) => void;
}) {
  if (prompt.kind === 'choice' && value?.kind === 'choice') {
    return (
      <div className="mt-5 grid gap-3">
        {prompt.options.map((option) => {
          const selected = value.optionIds.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onChange({
                  kind: 'choice',
                  optionIds: prompt.multi
                    ? selected
                      ? value.optionIds.filter((id) => id !== option.id)
                      : [...value.optionIds, option.id]
                    : [option.id],
                })
              }
              className={optionClass(selected)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (prompt.kind === 'true-false' && value?.kind === 'true-false') {
    return (
      <div className="mt-5 grid grid-cols-2 gap-3">
        {[true, false].map((choice) => (
          <button
            key={String(choice)}
            type="button"
            aria-pressed={value.value === choice}
            onClick={() => onChange({ kind: 'true-false', value: choice })}
            className={optionClass(value.value === choice)}
          >
            {choice ? 'True' : 'False'}
          </button>
        ))}
      </div>
    );
  }
  if (prompt.kind === 'text' && value?.kind === 'text') {
    return (
      <textarea
        value={value.text}
        onChange={(event) => onChange({ kind: 'text', text: event.target.value })}
        rows={5}
        maxLength={2000}
        className="mt-5 min-h-32 w-full rounded-xl border border-white/15 bg-white p-4 text-lg text-slate-950"
        placeholder="Write your answer"
      />
    );
  }
  if (prompt.kind === 'order' && value?.kind === 'order') {
    const labels = new Map(prompt.items.map((item) => [item.id, item.label]));
    const move = (index: number, direction: -1 | 1) => {
      const next = [...value.itemIds];
      const target = index + direction;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      onChange({ kind: 'order', itemIds: next });
    };
    return (
      <ol className="mt-5 grid gap-2">
        {value.itemIds.map((id, index) => (
          <li key={id} className="flex items-center gap-2 rounded-xl bg-white/10 p-2">
            <span className="flex-1 px-2 text-lg">{labels.get(id)}</span>
            <button
              type="button"
              className={nudgeClass}
              onClick={() => move(index, -1)}
              aria-label="Move up"
            >
              Up
            </button>
            <button
              type="button"
              className={nudgeClass}
              onClick={() => move(index, 1)}
              aria-label="Move down"
            >
              Down
            </button>
          </li>
        ))}
      </ol>
    );
  }
  if (prompt.kind === 'sort' && value?.kind === 'sort') {
    return (
      <div className="mt-5 grid gap-3">
        {prompt.items.map((item) => {
          const placed = value.placements.find((placement) => placement.itemId === item.id);
          return (
            <label key={item.id} className="rounded-xl bg-white/10 p-3">
              <span className="block text-lg">{item.label}</span>
              <select
                className="mt-2 min-h-12 w-full rounded-lg bg-white px-3 text-base text-slate-950"
                value={placed?.categoryId ?? ''}
                onChange={(event) => {
                  const placements = value.placements.filter(
                    (placement) => placement.itemId !== item.id,
                  );
                  if (event.target.value) {
                    placements.push({ itemId: item.id, categoryId: event.target.value });
                  }
                  onChange({ kind: 'sort', placements });
                }}
              >
                <option value="">Choose a category</option>
                {prompt.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    );
  }
  if (prompt.kind === 'match' && value?.kind === 'match') {
    return <MatchForm prompt={prompt} value={value} onChange={onChange} />;
  }
  return null;
}

function MatchForm({
  prompt,
  value,
  onChange,
}: {
  prompt: Extract<PublicPrompt, { kind: 'match' }>;
  value: Extract<StudentAnswer, { kind: 'match' }>;
  onChange: (answer: StudentAnswer) => void;
}) {
  const [leftId, setLeftId] = useState<string | null>(null);
  const usedRight = useMemo(() => new Set(value.pairs.map((pair) => pair.rightId)), [value.pairs]);
  const pair = (right: PublicOption) => {
    if (!leftId) return;
    onChange({
      kind: 'match',
      pairs: [
        ...value.pairs.filter((item) => item.leftId !== leftId && item.rightId !== right.id),
        { leftId, rightId: right.id },
      ],
    });
    setLeftId(null);
  };
  const leftLabel = new Map(prompt.left.map((item) => [item.id, item.label]));
  const rightLabel = new Map(prompt.right.map((item) => [item.id, item.label]));
  return (
    <div className="mt-5 grid gap-4">
      <div className="grid gap-2">
        {prompt.left.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={leftId === item.id}
            onClick={() => setLeftId(item.id)}
            className={optionClass(leftId === item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-300">Choose a left item, then the match on the right.</p>
      <div className="grid gap-2">
        {prompt.right.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={!leftId || usedRight.has(item.id)}
            onClick={() => pair(item)}
            className={optionClass(usedRight.has(item.id))}
          >
            {item.label}
          </button>
        ))}
      </div>
      {value.pairs.length ? (
        <ul className="grid gap-1 text-sm text-slate-200">
          {value.pairs.map((item) => (
            <li key={item.leftId}>
              {leftLabel.get(item.leftId)} → {rightLabel.get(item.rightId)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function optionClass(selected: boolean): string {
  return [
    'min-h-14 rounded-xl px-4 text-left text-lg font-medium',
    selected ? 'bg-violet-500 text-white' : 'bg-white text-slate-950',
  ].join(' ');
}

const nudgeClass = 'min-h-11 min-w-14 rounded-lg bg-white/15 px-3 font-semibold';
