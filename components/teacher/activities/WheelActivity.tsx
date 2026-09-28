'use client';
import { useState } from 'react';
import type { ActivityRendererProps } from './activity-registry';
import { button } from './ActivityHost';
import { selectRandom } from '@/lib/teacher/activity-random';
export function WheelActivity({ definition }: ActivityRendererProps) {
  if (definition.type !== 'spin-wheel') return null;
  return <WheelBody definition={definition} />;
}
function WheelBody({
  definition,
}: {
  definition: Extract<ActivityRendererProps['definition'], { type: 'spin-wheel' }>;
}) {
  const [entries, setEntries] = useState(definition.entries),
    [selected, setSelected] = useState<(typeof entries)[number]>(),
    [spinning, setSpinning] = useState(false);
  const spin = () => {
    if (entries.length < 1) return;
    setSpinning(true);
    window.setTimeout(
      () => {
        setSelected(selectRandom(entries));
        setSpinning(false);
      },
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900,
    );
  };
  return (
    <div className="grid h-full place-items-center">
      <div className="text-center">
        <div
          className={`mx-auto grid size-72 place-items-center rounded-full border-[18px] border-cyan-500 bg-slate-800 p-8 shadow-2xl ${spinning ? 'motion-safe:animate-spin' : ''}`}
        >
          <span className="text-center text-2xl font-black">
            {selected?.label ?? `${entries.length} prompts`}
          </span>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button className={button} disabled={spinning || !entries.length} onClick={spin}>
            {selected ? 'Spin Again' : 'SPIN'}
          </button>
          {selected ? (
            <>
              <button className={button} onClick={() => setSelected(undefined)}>
                Keep Item
              </button>
              <button
                className={button}
                disabled={entries.length <= 2}
                onClick={() => {
                  setEntries((x) => x.filter((e) => e.id !== selected.id));
                  setSelected(undefined);
                }}
              >
                Remove Item
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
