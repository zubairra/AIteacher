'use client';

import { useRef, useState } from 'react';

import { ActivityCard } from './ActivityCard';
import { TutorMarkdown } from './TutorMarkdown';
import {
  TUTOR_MODE_LABELS,
  TUTOR_MODES,
  type PublicMessage,
  type TutorMode,
} from '@/lib/student/types';

interface SessionSummary {
  id: string;
  updatedAt: number;
  mode: TutorMode;
}

function clientMessageId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `msg${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function TutorChat({
  grantId,
  lessonTitle,
  subject,
  grade,
  topic,
  sceneTitles,
  sessions,
  initialSessionId,
  initialMessages,
}: {
  grantId: string;
  lessonTitle: string;
  subject: string;
  grade: string;
  topic: string;
  sceneTitles: string[];
  sessions: SessionSummary[];
  initialSessionId?: string;
  initialMessages: PublicMessage[];
}) {
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [sessionList, setSessionList] = useState(sessions);
  const [messages, setMessages] = useState(initialMessages);
  const [mode, setMode] = useState<TutorMode>('explain');
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function loadSession(id: string) {
    setError(null);
    const response = await fetch(`/api/student/sessions/${id}`);
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) {
      setError(body?.error || 'That conversation could not be opened.');
      return;
    }
    setSessionId(id);
    setMessages(body.messages);
    setMode(body.session.mode);
  }

  async function send(text: string, existingId?: string) {
    const message = text.trim();
    if (!message || pending) return;
    const id = existingId || clientMessageId();
    setPending(true);
    setError(null);
    setSavedNote(null);
    setDraft('');
    setStreamingText('');
    const controller = new AbortController();
    abortRef.current = controller;
    setMessages((current) => [
      ...current.filter((item) => item.id !== 'pending-user'),
      {
        id: 'pending-user',
        role: 'user',
        text: message,
        mode,
        createdAt: Date.now(),
        clientMessageId: id,
      },
    ]);
    try {
      const response = await fetch(`/api/student/lessons/${grantId}/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode,
          text: message,
          clientMessageId: id,
          ...(sessionId ? { sessionId } : {}),
        }),
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('ndjson') && response.body) {
        await readNdjson(response.body);
        return;
      }
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) {
        setError(body?.error || 'The tutor could not reply. Try again.');
        return;
      }
      acceptTurn(body.sessionId, body.userMessage, body.assistantMessage);
    } catch {
      if (controller.signal.aborted) setError('Stopped. You can send it again.');
      else setError('The tutor could not reply. Try again.');
    } finally {
      setPending(false);
      setStreamingText('');
      abortRef.current = null;
    }
  }

  function acceptTurn(
    nextSessionId: string,
    userMessage: PublicMessage,
    assistantMessage: PublicMessage,
  ) {
    setSessionId(nextSessionId);
    setSessionList((current) => {
      const rest = current.filter((item) => item.id !== nextSessionId);
      return [{ id: nextSessionId, updatedAt: Date.now(), mode: assistantMessage.mode }, ...rest];
    });
    setMessages((current) => [
      ...current.filter(
        (item) =>
          item.id !== 'pending-user' && item.clientMessageId !== userMessage.clientMessageId,
      ),
      userMessage,
      assistantMessage,
    ]);
    setSavedNote('Saved');
  }

  async function readNdjson(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      buffer += decoder.decode(step.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as {
          type?: string;
          text?: string;
          error?: string;
          sessionId?: string;
          userMessage?: PublicMessage;
          assistantMessage?: PublicMessage;
        };
        if (event.type === 'delta' && event.text) setStreamingText(event.text);
        if (event.type === 'error')
          setError(event.error || 'The tutor could not reply. Try again.');
        if (
          event.type === 'done' &&
          event.sessionId &&
          event.userMessage &&
          event.assistantMessage
        ) {
          acceptTurn(event.sessionId, event.userMessage, event.assistantMessage);
        }
      }
    }
  }

  async function markAnswer(messageId: string, answers: Record<string, string>) {
    if (!sessionId) return;
    setError(null);
    const response = await fetch(`/api/student/sessions/${sessionId}/grade`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId, answers }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) {
      setError(body?.error || 'That answer could not be checked.');
      return;
    }
    setMessages((current) => current.map((item) => (item.id === messageId ? body.message : item)));
    setSavedNote('Score saved');
  }

  const lastUser = [...messages].reverse().find((message) => message.role === 'user');

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <button
          type="button"
          className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800"
          onClick={() => {
            setSessionId(undefined);
            setMessages([]);
            setError(null);
          }}
        >
          New conversation
        </button>
        <ul className="space-y-1">
          {sessionList.length === 0 ? (
            <li className="text-sm text-slate-500">No saved conversations yet.</li>
          ) : (
            sessionList.map((session) => (
              <li key={session.id}>
                <button
                  type="button"
                  className={`min-h-11 w-full rounded-xl px-3 text-left text-sm ${
                    session.id === sessionId
                      ? 'bg-blue-50 font-semibold text-blue-900'
                      : 'text-slate-700 hover:bg-white'
                  }`}
                  onClick={() => void loadSession(session.id)}
                >
                  {new Date(session.updatedAt).toLocaleDateString()} ·{' '}
                  {TUTOR_MODE_LABELS[session.mode]}
                </button>
              </li>
            ))
          )}
        </ul>
      </aside>
      <section className="flex min-h-[70vh] flex-col rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 px-4 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Lesson</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
            {lessonTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {[subject, grade, topic].filter(Boolean).join(' · ')}
          </p>
          {sceneTitles.length > 0 ? (
            <ol className="mt-3 flex flex-wrap gap-2">
              {sceneTitles.slice(0, 8).map((title) => (
                <li
                  key={title}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
                >
                  {title}
                </li>
              ))}
            </ol>
          ) : null}
        </header>
        <div
          className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6"
          role="log"
          aria-live="polite"
        >
          {messages.length === 0 && !streamingText ? (
            <p className="text-sm text-slate-500">
              Ask about this lesson. Orbit will start from the basics and stay with what the lesson
              actually says.
            </p>
          ) : null}
          {messages.map((message) => (
            <article
              key={message.id}
              className={`max-w-[42rem] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'ml-auto bg-blue-700 text-white'
                  : 'bg-orange-50 text-slate-900'
              }`}
            >
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-70">
                {message.role === 'user' ? 'You' : 'Orbit'}
              </p>
              {message.role === 'user' ? (
                <p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p>
              ) : (
                <TutorMarkdown text={message.text} />
              )}
              {message.activity ? (
                <ActivityCard
                  activity={message.activity}
                  submission={message.submission}
                  disabled={pending}
                  onSubmit={(answers) => void markAnswer(message.id, answers)}
                />
              ) : null}
              {message.followUps && message.followUps.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {message.followUps.map((followUp) => (
                    <button
                      key={followUp}
                      type="button"
                      className="min-h-10 rounded-full border border-orange-200 bg-white px-3 text-left text-xs font-medium text-slate-800"
                      onClick={() => void send(followUp)}
                    >
                      {followUp}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          {streamingText ? (
            <article className="max-w-[42rem] rounded-2xl bg-orange-50 px-4 py-3" aria-busy="true">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
                Orbit
              </p>
              <TutorMarkdown text={streamingText} />
            </article>
          ) : null}
          {pending && !streamingText ? (
            <p className="text-sm text-slate-500" role="status">
              Orbit is thinking…
            </p>
          ) : null}
        </div>
        <form
          className="border-t border-slate-100 px-4 py-4 sm:px-6"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <fieldset className="mb-3">
            <legend className="sr-only">Tutor mode</legend>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {TUTOR_MODES.map((item) => (
                <label
                  key={item}
                  className={`shrink-0 cursor-pointer rounded-full px-3 py-2 text-xs font-semibold ${
                    mode === item ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="mode"
                    value={item}
                    checked={mode === item}
                    onChange={() => setMode(item)}
                  />
                  {TUTOR_MODE_LABELS[item]}
                </label>
              ))}
            </div>
          </fieldset>
          {error ? (
            <p className="mb-2 text-sm font-medium text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          {savedNote ? (
            <p className="mb-2 text-sm text-green-800" role="status">
              {savedNote}
            </p>
          ) : null}
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor="tutor-draft">
              Message
            </label>
            <textarea
              id="tutor-draft"
              value={draft}
              maxLength={4000}
              rows={2}
              placeholder={
                mode === 'step' ? 'Tell Orbit what you have tried so far' : 'Ask about this lesson'
              }
              className="min-h-12 flex-1 resize-y rounded-2xl border border-slate-300 px-3 py-2 text-sm"
              onChange={(event) => setDraft(event.target.value)}
            />
            {pending ? (
              <button
                type="button"
                className="min-h-12 rounded-2xl border border-slate-300 px-4 text-sm font-semibold"
                onClick={() => abortRef.current?.abort()}
              >
                Stop
              </button>
            ) : (
              <button
                type="submit"
                className="min-h-12 rounded-2xl bg-orange-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                disabled={!draft.trim()}
              >
                Send
              </button>
            )}
          </div>
          {error && lastUser ? (
            <button
              type="button"
              className="mt-2 min-h-10 text-sm font-semibold text-blue-800"
              onClick={() => void send(lastUser.text, lastUser.clientMessageId)}
            >
              Retry
            </button>
          ) : null}
        </form>
      </section>
    </div>
  );
}
