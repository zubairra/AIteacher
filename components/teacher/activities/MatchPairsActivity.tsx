'use client';
import { useMemo, useState } from 'react';
import type { ActivityRendererProps } from './activity-registry';
import { shuffle } from '@/lib/teacher/activity-random';
export function MatchPairsActivity({ definition }: ActivityRendererProps) {
  if (definition.type !== 'match-pairs') return null;
  return <MatchPairsBody definition={definition} />;
}
function MatchPairsBody({
  definition,
}: {
  definition: Extract<ActivityRendererProps['definition'], { type: 'match-pairs' }>;
}) {
  const left = useMemo(
    () => (definition.randomize ? shuffle(definition.pairs) : definition.pairs),
    [definition],
  );
  const right = useMemo(
    () => (definition.randomize ? shuffle(definition.pairs) : definition.pairs),
    [definition],
  );
  const [selected, setSelected] = useState<string>(),
    [matched, setMatched] = useState<string[]>([]),
    [feedback, setFeedback] = useState('');
  const choose = (id: string) => {
    if (!selected) {
      setSelected(id);
      return;
    }
    if (selected === id) {
      setMatched((x) => [...x, id]);
      setFeedback('✓ Matched');
    } else setFeedback('Try again');
    setSelected(undefined);
  };
  return (
    <div className="mx-auto max-w-6xl">
      <p role="status" className="mb-4 text-center text-2xl font-bold">
        {matched.length === definition.pairs.length
          ? 'Great — all matched!'
          : feedback || 'Tap one item from each column'}
      </p>
      <div className="grid grid-cols-2 gap-5">
        {' '}
        <div className="space-y-3">
          {left.map((p) => (
            <button
              key={p.id}
              disabled={matched.includes(p.id)}
              onClick={() => setSelected(p.id)}
              className={`min-h-16 w-full rounded-xl border-2 p-4 text-xl font-bold ${selected === p.id ? 'border-cyan-300 bg-cyan-900' : 'border-white/20 bg-white/5'} disabled:opacity-30`}
            >
              {p.left}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {right.map((p) => (
            <button
              key={p.id}
              disabled={matched.includes(p.id)}
              onClick={() => choose(p.id)}
              className="min-h-16 w-full rounded-xl border-2 border-white/20 bg-white/5 p-4 text-xl font-bold disabled:border-emerald-500 disabled:bg-emerald-900"
            >
              {p.right}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
