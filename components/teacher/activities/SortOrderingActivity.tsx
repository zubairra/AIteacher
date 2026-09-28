'use client';
import { useState } from 'react';
import type { ActivityRendererProps } from './activity-registry';
import { button } from './ActivityHost';
import { shuffle } from '@/lib/teacher/activity-random';
export function SortOrderingActivity({ definition }: ActivityRendererProps) {
  if (definition.type === 'sort') return <Sort definition={definition} />;
  if (definition.type === 'ordering') return <Ordering definition={definition} />;
  return null;
}
function Sort({
  definition,
}: {
  definition: Extract<ActivityRendererProps['definition'], { type: 'sort' }>;
}) {
  const [placements, setPlacements] = useState<Record<string, string>>({}),
    [selected, setSelected] = useState<string>(),
    [checked, setChecked] = useState(false);
  const place = (categoryId: string) => {
    if (selected) {
      setPlacements((x) => ({ ...x, [selected]: categoryId }));
      setSelected(undefined);
    }
  };
  return (
    <div>
      <div className="mb-5 flex flex-wrap justify-center gap-3">
        {definition.items.map((item) => (
          <button
            key={item.id}
            onPointerDown={() => setSelected(item.id)}
            onClick={() => setSelected(item.id)}
            className={`min-h-14 rounded-xl px-5 text-lg font-bold ${selected === item.id ? 'bg-cyan-700' : 'bg-white/10'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {definition.categories.map((category) => (
          <button
            type="button"
            key={category.id}
            onPointerUp={() => place(category.id)}
            onClick={() => place(category.id)}
            className="min-h-48 rounded-2xl border-2 border-dashed border-white/30 p-5 text-left"
          >
            <strong className="text-2xl">{category.label}</strong>
            <div className="mt-4 flex flex-wrap gap-2">
              {definition.items
                .filter((x) => placements[x.id] === category.id)
                .map((x) => (
                  <span
                    key={x.id}
                    className={`rounded-lg p-3 ${checked ? (x.categoryId === category.id ? 'bg-emerald-800' : 'bg-amber-800') : 'bg-white/10'}`}
                  >
                    {x.label}
                  </span>
                ))}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-6 text-center">
        <button
          className={button}
          onClick={() => setChecked(true)}
          disabled={Object.keys(placements).length !== definition.items.length}
        >
          Check Sort
        </button>
      </div>
    </div>
  );
}
function Ordering({
  definition,
}: {
  definition: Extract<ActivityRendererProps['definition'], { type: 'ordering' }>;
}) {
  const [items, setItems] = useState(() => shuffle(definition.items)),
    [checked, setChecked] = useState(false);
  const move = (index: number, delta: number) => {
    const next = [...items],
      target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setItems(next);
    setChecked(false);
  };
  const correct = items.every((x, i) => x.id === definition.correctOrder[i]);
  return (
    <div className="mx-auto max-w-4xl space-y-3">
      {items.map((item, index) => (
        <div key={item.id} className="flex min-h-16 items-center gap-3 rounded-xl bg-white/10 p-3">
          <span className="w-12 text-center text-2xl font-black">{index + 1}</span>
          <span className="flex-1 text-xl font-bold">{item.label}</span>
          <button
            className={button}
            onClick={() => move(index, -1)}
            aria-label={`Move ${item.label} up`}
          >
            ↑
          </button>
          <button
            className={button}
            onClick={() => move(index, 1)}
            aria-label={`Move ${item.label} down`}
          >
            ↓
          </button>
        </div>
      ))}
      <div className="pt-4 text-center">
        <button className={button} onClick={() => setChecked(true)}>
          Check Order
        </button>
        {checked ? (
          <p
            className={`mt-4 text-2xl font-bold ${correct ? 'text-emerald-300' : 'text-amber-300'}`}
          >
            {correct ? '✓ Correct order' : 'Keep going — adjust the sequence'}
          </p>
        ) : null}
      </div>
    </div>
  );
}
