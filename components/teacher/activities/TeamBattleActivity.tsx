'use client';
import { useState } from 'react';
import type { ActivityRendererProps } from './activity-registry';
import { button } from './ActivityHost';
import { emptyPerformance, performanceTier } from '@/lib/teacher/activity-gamification';
import type { PowerUpType } from '@/lib/teacher/native-activities';
export function TeamBattleActivity({ definition }: ActivityRendererProps) {
  if (definition.type !== 'team-battle') return null;
  return <TeamBattleBody definition={definition} />;
}
function TeamBattleBody({
  definition,
}: {
  definition: Extract<ActivityRendererProps['definition'], { type: 'team-battle' }>;
}) {
  const [index, setIndex] = useState(0),
    [revealed, setRevealed] = useState(false),
    [scores, setScores] = useState<[number, number]>([0, 0]),
    [streaks, setStreaks] = useState<[number, number]>([0, 0]),
    [powerUps, setPowerUps] = useState<[PowerUpType[], PowerUpType[]]>([[], []]);
  const question = definition.questions[index],
    done = index >= definition.questions.length;
  const award = (team: 0 | 1, delta: number) => {
    setScores((s) => {
      const n: [number, number] = [...s];
      n[team] = Math.max(0, n[team] + delta);
      return n;
    });
    if (delta > 0)
      setStreaks((s) => {
        const n: [number, number] = [...s];
        n[team] += 1;
        return n;
      });
  };
  if (done) {
    const winner =
      scores[0] === scores[1]
        ? 'Excellent round — a tie!'
        : `${definition.teamNames[scores[0] > scores[1] ? 0 : 1]} wins this round!`;
    return (
      <div className="text-center">
        <p className="text-cyan-300">
          {performanceTier({
            ...emptyPerformance(),
            score: scores[0] + scores[1],
            answered: definition.questions.length,
            correct: definition.questions.length,
          })}
        </p>
        <h2 className="text-5xl font-black">Final Results</h2>
        <p className="my-8 text-3xl">{winner}</p>
        <div className="grid grid-cols-2 gap-8 text-4xl">
          <p>
            {definition.teamNames[0]}
            <br />
            <b>{scores[0]}</b>
          </p>
          <p>
            {definition.teamNames[1]}
            <br />
            <b>{scores[1]}</b>
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid grid-cols-2 gap-8 text-center">
        <Team
          name={definition.teamNames[0]}
          score={scores[0]}
          streak={streaks[0]}
          onAdd={() => award(0, question!.basePoints)}
          onSubtract={() => award(0, -question!.basePoints)}
          powerUps={powerUps[0]}
          onAwardPowerUp={() => setPowerUps((p) => [[...p[0], 'double-points'], p[1]])}
          onRemovePowerUp={() => setPowerUps((p) => [p[0].slice(0, -1), p[1]])}
        />
        <Team
          name={definition.teamNames[1]}
          score={scores[1]}
          streak={streaks[1]}
          onAdd={() => award(1, question!.basePoints)}
          onSubtract={() => award(1, -question!.basePoints)}
          powerUps={powerUps[1]}
          onAwardPowerUp={() => setPowerUps((p) => [p[0], [...p[1], 'double-points']])}
          onRemovePowerUp={() => setPowerUps((p) => [p[0], p[1].slice(0, -1)])}
        />
      </div>
      <div className="my-8 rounded-3xl bg-white/10 p-8 text-center">
        <p className="text-lg">
          Question {index + 1} / {definition.questions.length} · {question!.basePoints} points
        </p>
        <h2 className="mt-3 text-4xl font-black">{question!.prompt}</h2>
        {revealed ? (
          <div className="mt-6 rounded-xl bg-emerald-900 p-5 text-3xl font-bold">
            {question!.answer}
            {question!.explanation ? (
              <p className="mt-2 text-lg font-normal">{question!.explanation}</p>
            ) : null}
          </div>
        ) : (
          <button className={`${button} mt-6`} onClick={() => setRevealed(true)}>
            Reveal Answer
          </button>
        )}
      </div>
      <div className="flex justify-center gap-4">
        <button
          className={button}
          onClick={() => {
            setIndex((x) => x + 1);
            setRevealed(false);
          }}
        >
          {revealed ? 'Next' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
function Team({
  name,
  score,
  streak,
  onAdd,
  onSubtract,
  powerUps,
  onAwardPowerUp,
  onRemovePowerUp,
}: {
  name: string;
  score: number;
  streak: number;
  onAdd: () => void;
  onSubtract: () => void;
  powerUps: PowerUpType[];
  onAwardPowerUp: () => void;
  onRemovePowerUp: () => void;
}) {
  return (
    <section className="rounded-2xl bg-white/10 p-5">
      <h2 className="text-2xl font-bold">{name}</h2>
      <p className="my-3 text-6xl font-black tabular-nums">{score}</p>
      <p>🔥 {streak} streak</p>
      <p className="mt-2 text-sm">Power-ups: {powerUps.length ? powerUps.join(', ') : 'None'}</p>
      <div className="mt-4 flex justify-center gap-3">
        <button className={button} onClick={onAdd}>
          + Award
        </button>
        <button className={button} onClick={onSubtract}>
          − Correct
        </button>
        <button className={button} onClick={onAwardPowerUp}>
          + Power-up
        </button>
        <button className={button} disabled={!powerUps.length} onClick={onRemovePowerUp}>
          − Power-up
        </button>
      </div>
    </section>
  );
}
