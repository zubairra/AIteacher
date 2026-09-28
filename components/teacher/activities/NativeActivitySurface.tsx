'use client';
import { useState } from 'react';
import { parseNativeActivity } from '@/lib/teacher/native-activities';
import { ActivityHost, button } from './ActivityHost';
import { getActivityRegistration } from './activity-registry';
export function NativeActivitySurface({
  definition: raw,
  onClose,
}: {
  definition: unknown;
  onClose: () => void;
}) {
  const [resetToken, setResetToken] = useState(0);
  const definition = parseNativeActivity(raw);
  const registration = definition ? getActivityRegistration(definition.type) : undefined;
  if (!definition || !registration)
    return (
      <section className="absolute inset-0 z-[60] grid place-items-center bg-slate-950 p-8 text-white">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Activity couldn&apos;t be loaded.</h1>
          <p className="mt-3 text-slate-300">The saved activity data is invalid or unsupported.</p>
          <button type="button" className={`${button} mt-6`} onClick={onClose}>
            Return to Lesson
          </button>
        </div>
      </section>
    );
  const Renderer = registration.renderer;
  return (
    <ActivityHost
      title={definition.title}
      instructions={definition.instructions}
      onReset={() => setResetToken((x) => x + 1)}
      onClose={onClose}
    >
      <Renderer key={resetToken} definition={definition} resetToken={resetToken} />
    </ActivityHost>
  );
}
