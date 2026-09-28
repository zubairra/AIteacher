'use client';
import { useEffect, useMemo, useState } from 'react';
import type { ActivityRendererProps } from './activity-registry';
import { button } from './ActivityHost';
import {
  applyAnswer,
  applyRewardEvents,
  calculateQuestionScore,
  consumePowerUp,
  emptyPerformance,
  fiftyFifty,
  performanceTier,
  evaluateRewardRules,
} from '@/lib/teacher/activity-gamification';
import type { PowerUpType } from '@/lib/teacher/native-activities';
export function QuestionActivity({ definition }: ActivityRendererProps) {
  if (definition.type !== 'multiple-choice' && definition.type !== 'true-false') return null;
  return <QuestionActivityBody definition={definition} />;
}
function QuestionActivityBody({
  definition,
}: {
  definition: Extract<
    ActivityRendererProps['definition'],
    { type: 'multiple-choice' | 'true-false' }
  >;
}) {
  const [index, setIndex] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [checked, setChecked] = useState(false),
    [attempt, setAttempt] = useState(1),
    [hidden, setHidden] = useState<string[]>([]),
    [hint, setHint] = useState(false),
    [active, setActive] = useState<PowerUpType[]>([]),
    [performances, setPerformances] = useState<
      [ReturnType<typeof emptyPerformance>, ReturnType<typeof emptyPerformance>]
    >([emptyPerformance(), emptyPerformance()]),
    [activeTeam, setActiveTeam] = useState<0 | 1>(0);
  const [completed, setCompleted] = useState(false);
  const [reward, setReward] = useState<ReturnType<typeof evaluateRewardRules>[number]>();
  const [awardCounts, setAwardCounts] = useState<Record<string, number>>({});
  const [secondsLeft, setSecondsLeft] = useState(
    definition.gamification?.timer?.secondsPerQuestion,
  );
  const questions = definition.questions;
  const question = questions[index]!;
  const config = definition.gamification;
  const performance = performances[config?.mode === 'teams' ? activeTeam : 0];
  const setPerformance = (
    update: (current: ReturnType<typeof emptyPerformance>) => ReturnType<typeof emptyPerformance>,
  ) =>
    setPerformances((current) => {
      const next: typeof current = [...current];
      const player = config?.mode === 'teams' ? activeTeam : 0;
      next[player] = update(current[player]);
      return next;
    });
  const options = useMemo(
    () =>
      definition.type === 'true-false'
        ? [
            { id: 'true', label: 'TRUE' },
            { id: 'false', label: 'FALSE' },
          ]
        : definition.questions[index]!.options,
    [definition, index],
  );
  const correctIds = useMemo(
    () =>
      new Set<string>(
        definition.type === 'true-false'
          ? [String(definition.questions[index]!.answer)]
          : definition.questions[index]!.correctOptionIds,
      ),
    [definition, index],
  );
  const isCorrect = selected.length === correctIds.size && selected.every((x) => correctIds.has(x));
  useEffect(() => {
    if (secondsLeft === undefined || checked || secondsLeft <= 0) return;
    const timer = window.setInterval(
      () => setSecondsLeft((value) => (value === undefined ? value : Math.max(0, value - 1))),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [checked, secondsLeft]);
  const check = () => {
    if (!selected.length) return;
    if (!isCorrect && active.includes('second-chance') && attempt === 1) {
      setHidden((x) => [...x, ...selected]);
      setSelected([]);
      setAttempt(2);
      return;
    }
    const points = calculateQuestionScore({
      basePoints: question.basePoints,
      correct: isCorrect,
      attempt,
      streak: performance.streak + Number(isCorrect),
      activePowerUps: active,
      config,
    });
    setPerformance((p) => {
      const answered = applyAnswer(p, isCorrect, points);
      const events = config?.performanceRewards
        ? evaluateRewardRules(
            config.rewardRules,
            {
              trigger: isCorrect ? 'correct' : 'incorrect',
              streak: answered.streak,
              difficulty: question.difficulty,
            },
            awardCounts,
          )
        : [];
      if (events[0]) {
        setReward(events[0]);
        setAwardCounts((counts) => ({
          ...counts,
          [events[0]!.ruleId]: (counts[events[0]!.ruleId] ?? 0) + 1,
        }));
      }
      return applyRewardEvents(answered, events);
    });
    setChecked(true);
  };
  const next = () => {
    if (index === questions.length - 1) {
      setCompleted(true);
      return;
    }
    setIndex((x) => Math.min(x + 1, questions.length - 1));
    setSelected([]);
    setChecked(false);
    setAttempt(1);
    setHidden([]);
    setHint(false);
    setActive([]);
    setSecondsLeft(config?.timer?.secondsPerQuestion);
  };
  const activatePower = (p: PowerUpType) => {
    if (p === 'hint') setHint(true);
    if (p === 'extra-time' && config?.timer)
      setSecondsLeft((value) => (value ?? 0) + config.timer!.extraTimeSeconds);
    if (p === 'fifty-fifty' && definition.type === 'multiple-choice')
      setHidden(
        fiftyFifty(
          options.map((x) => x.id),
          correctIds,
        ),
      );
    setActive((x) => [...x, p]);
    setPerformance((current) => consumePowerUp(current, p));
  };
  if (completed) return <Summary performance={performance} total={questions.length} />;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <div className="flex justify-between text-lg font-bold">
        <span>
          Question {index + 1} / {questions.length}
        </span>
        {config?.enabled ? (
          <span>
            Score {performance.score} · 🔥 {performance.streak}
          </span>
        ) : null}
        {secondsLeft !== undefined ? <span>⏱ {secondsLeft}s</span> : null}
      </div>
      {config?.enabled && config.mode === 'teams' ? (
        <div className="flex justify-center gap-3">
          <button
            className={button}
            aria-pressed={activeTeam === 0}
            onClick={() => setActiveTeam(0)}
          >
            Team A · {performances[0].score}
          </button>
          <button
            className={button}
            aria-pressed={activeTeam === 1}
            onClick={() => setActiveTeam(1)}
          >
            Team B · {performances[1].score}
          </button>
        </div>
      ) : null}
      <h2 className="text-center text-3xl font-bold sm:text-5xl">{question.prompt}</h2>
      {config?.enabled && config.lifelines ? (
        <div className="flex flex-wrap justify-center gap-2">
          {(
            [
              'fifty-fifty',
              'double-points',
              'safe-bet',
              'second-chance',
              'hint',
              'score-boost',
              'extra-time',
            ] as PowerUpType[]
          )
            .filter(
              (p) =>
                (performance.inventory[p] ?? 0) > 0 &&
                (p !== 'hint' || question.hint) &&
                (p !== 'fifty-fifty' || definition.type === 'multiple-choice') &&
                (p !== 'extra-time' || config.timer?.enabled),
            )
            .map((p) => (
              <button
                key={p}
                type="button"
                disabled={checked || active.includes(p)}
                onClick={() => activatePower(p)}
                className={button}
              >
                {p.replaceAll('-', ' ')} ({performance.inventory[p]})
              </button>
            ))}
        </div>
      ) : null}
      {hint && question.hint ? (
        <p className="rounded-xl bg-cyan-950 p-4 text-center text-xl">Hint: {question.hint}</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {options
          .filter((o) => !hidden.includes(o.id))
          .map((option) => (
            <button
              type="button"
              key={option.id}
              disabled={checked}
              onClick={() =>
                setSelected((current) =>
                  current.includes(option.id)
                    ? current.filter((x) => x !== option.id)
                    : [...current, option.id],
                )
              }
              className={`min-h-20 rounded-2xl border-2 p-5 text-left text-xl font-bold ${selected.includes(option.id) ? 'border-cyan-300 bg-cyan-900' : 'border-white/20 bg-white/5'} ${checked && correctIds.has(option.id) ? '!border-emerald-400 !bg-emerald-900' : ''}`}
            >
              {option.label}
            </button>
          ))}
      </div>
      {attempt === 2 && !checked ? (
        <p className="text-center text-xl text-amber-300">
          Second chance — try another answer for reduced points.
        </p>
      ) : null}
      {checked ? (
        <div
          className={`rounded-2xl p-5 text-center text-2xl font-bold ${isCorrect ? 'bg-emerald-900' : 'bg-amber-900'}`}
        >
          {isCorrect ? '✓ Correct' : 'Try again next question'}
          {question.explanation ? (
            <p className="mt-2 text-lg font-normal">{question.explanation}</p>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-center">
        {checked ? (
          <button className={button} onClick={next}>
            {index === questions.length - 1 ? 'Finish Quiz' : 'Next Question'}
          </button>
        ) : (
          <button className={button} onClick={check} disabled={!selected.length}>
            Check Answer
          </button>
        )}
      </div>
      {reward ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/80 p-6">
          <div className="max-w-xl rounded-3xl border-2 border-cyan-300 bg-slate-900 p-10 text-center shadow-2xl motion-safe:animate-pulse">
            <p className="text-5xl">🔥</p>
            <h2 className="mt-3 text-4xl font-black">{reward.title}</h2>
            <p className="mt-3 text-2xl">
              {reward.reward.kind === 'power-up'
                ? `${reward.reward.powerUp.replaceAll('-', ' ')} unlocked`
                : `Bonus +${reward.reward.points} points`}
            </p>
            <button className={`${button} mt-6`} onClick={() => setReward(undefined)}>
              Continue
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
function Summary({
  performance,
  total,
}: {
  performance: ReturnType<typeof emptyPerformance>;
  total: number;
}) {
  const accuracy = performance.answered
    ? Math.round((performance.correct / performance.answered) * 100)
    : 0;
  return (
    <div className="mx-auto max-w-3xl rounded-3xl bg-white/10 p-10 text-center">
      <p className="text-cyan-300">{performanceTier(performance)}</p>
      <h2 className="text-5xl font-black">Quiz Complete</h2>
      <div className="mt-8 grid grid-cols-2 gap-5 text-2xl">
        <p>
          Score
          <br />
          <b>{performance.score}</b>
        </p>
        <p>
          Correct
          <br />
          <b>
            {performance.correct} / {total}
          </b>
        </p>
        <p>
          Best streak
          <br />
          <b>{performance.bestStreak}</b>
        </p>
        <p>
          Accuracy
          <br />
          <b>{accuracy}%</b>
        </p>
      </div>
    </div>
  );
}
