'use client';

import { useState } from 'react';

import type { LearningProfile } from '@/lib/student/types';

export function ProfileForm({ initial }: { initial: LearningProfile }) {
  const [profile, setProfile] = useState(initial);
  const [subjects, setSubjects] = useState(initial.subjects.join(', '));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setSaved(false);
    const next = {
      displayName: profile.displayName,
      gradeLevel: profile.gradeLevel,
      focus: profile.focus,
      subjects: subjects
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    };
    try {
      const response = await fetch('/api/student/profile', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) {
        setError(body?.error || 'The profile could not be saved.');
        return;
      }
      setProfile(body.profile);
      setSaved(true);
    } catch {
      setError('The profile could not be saved.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="max-w-xl space-y-4">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Learning profile</h1>
        <p className="mt-2 text-sm text-slate-600">
          Orbit uses your grade, subjects, and focus to choose examples. It does not infer anything
          else about you.
        </p>
      </header>
      <Field
        label="Name"
        value={profile.displayName}
        onChange={(displayName) => setProfile({ ...profile, displayName })}
      />
      <Field
        label="Grade or level"
        value={profile.gradeLevel}
        onChange={(gradeLevel) => setProfile({ ...profile, gradeLevel })}
      />
      <label className="block text-sm font-medium text-slate-800">
        Subjects
        <input
          className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
          value={subjects}
          onChange={(event) => setSubjects(event.target.value)}
          placeholder="Maths, Science"
        />
      </label>
      <label className="block text-sm font-medium text-slate-800">
        What do you want to get better at?
        <textarea
          className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2"
          maxLength={200}
          value={profile.focus}
          onChange={(event) => setProfile({ ...profile, focus: event.target.value })}
        />
      </label>
      {error ? (
        <p className="text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="text-sm font-medium text-green-800" role="status">
          Profile saved.
        </p>
      ) : null}
      <button
        type="submit"
        className="min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white disabled:opacity-50"
        disabled={pending}
      >
        {pending ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-800">
      {label}
      <input
        className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
