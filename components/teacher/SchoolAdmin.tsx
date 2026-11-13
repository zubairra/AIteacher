'use client';

import { useState } from 'react';

import { CHALK_PLANS } from '@/lib/teacher/billing';

interface SchoolMember {
  uid: string;
  email?: string;
  role?: string;
  chalksUsedThisPeriod?: number;
}

interface SchoolState {
  id?: string;
  name?: string;
  seatCount?: number;
  poolChalks?: number;
  status?: string;
  members?: SchoolMember[];
}

export function SchoolAdmin({ initial }: { initial: Record<string, unknown> | null }) {
  const [school, setSchool] = useState<SchoolState | null>(
    initial ? (initial as SchoolState) : null,
  );
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const response = await fetch('/api/teacher/school');
    const body = (await response.json()) as { school?: SchoolState | null };
    setSchool(body.school ?? null);
  };

  const invite = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/teacher/school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invite', email }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not send the invite.');
      setEmail('');
      setMessage('Invite saved. The teacher joins when they sign in with that Google email.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send the invite.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (uid: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/teacher/school', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', uid }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not remove that teacher.');
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not remove that teacher.');
    } finally {
      setBusy(false);
    }
  };

  if (!school) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold">School</h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          A school plan is one annual bill for at least {CHALK_PLANS.school.minSeats} teachers, with{' '}
          {CHALK_PLANS.school.chalksPerSeatPerMonth} chalks per seat each month in a shared pool. A
          30-day pilot can be granted by SmartBoard. Ask the owner to run the pilot script for your
          Google account, then return here to invite teachers.
        </p>
      </section>
    );
  }

  const members = school.members ?? [];
  return (
    <section data-testid="school-admin" className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold">{school.name || 'School'}</h1>
      <p className="mt-3 text-slate-600">
        {school.status === 'pilot' ? '30-day pilot' : school.status}. {school.poolChalks ?? 0}{' '}
        chalks left in the shared pool. {members.length} of {school.seatCount ?? 0} seats filled.
      </p>
      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void invite();
        }}
      >
        <label className="flex-1 text-sm font-medium">
          Invite a teacher
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-3 text-base"
            placeholder="teacher@school.edu"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 self-end rounded-xl bg-violet-700 px-5 font-semibold text-white"
        >
          Invite
        </button>
      </form>
      <ul className="mt-8 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        {members.map((member) => (
          <li key={member.uid} className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="font-medium">{member.email || member.uid}</p>
              <p className="text-sm text-slate-500">
                {member.role === 'admin' ? 'Admin' : 'Teacher'} · {member.chalksUsedThisPeriod ?? 0}{' '}
                chalks used this period
              </p>
            </div>
            {member.role !== 'admin' ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void remove(member.uid)}
                className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold"
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {message ? <p className="mt-4 text-sm">{message}</p> : null}
    </section>
  );
}
