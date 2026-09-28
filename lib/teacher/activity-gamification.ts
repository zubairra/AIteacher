import type { GamificationConfig, PowerUpType, RewardRule } from './native-activities';

export interface PlayerPerformance {
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  answered: number;
  earned: number;
  used: number;
  inventory: Partial<Record<PowerUpType, number>>;
}
export interface ScoreInput {
  basePoints: number;
  correct: boolean;
  attempt: number;
  streak: number;
  activePowerUps: PowerUpType[];
  config?: GamificationConfig;
}
export interface RewardEvent {
  ruleId: string;
  title: string;
  reward: RewardRule['reward'];
}

export function applyRewardEvents(
  performance: PlayerPerformance,
  events: readonly RewardEvent[],
): PlayerPerformance {
  return events.reduce(
    (current, event) =>
      event.reward.kind === 'power-up'
        ? addPowerUp(current, event.reward.powerUp)
        : { ...current, score: current.score + event.reward.points },
    performance,
  );
}

export const emptyPerformance = (): PlayerPerformance => ({
  score: 0,
  streak: 0,
  bestStreak: 0,
  correct: 0,
  answered: 0,
  earned: 0,
  used: 0,
  inventory: {},
});

export function calculateQuestionScore(input: ScoreInput): number {
  if (!input.correct) return 0;
  const config = input.config;
  if (!config?.enabled) return input.basePoints;
  let multiplier = input.attempt > 1 ? config.secondChanceFactor : 1;
  if (input.activePowerUps.includes('double-points')) multiplier *= 2;
  if (input.activePowerUps.includes('score-boost')) multiplier *= config.scoreBoostMultiplier;
  if (config.streakBonuses && input.streak >= 2) multiplier += Math.min(input.streak, 5) * 0.05;
  return Math.round(input.basePoints * Math.min(multiplier, config.maxScoreMultiplier));
}

export function applyAnswer(
  performance: PlayerPerformance,
  correct: boolean,
  points: number,
): PlayerPerformance {
  const streak = correct ? performance.streak + 1 : 0;
  return {
    ...performance,
    score: performance.score + points,
    streak,
    bestStreak: Math.max(performance.bestStreak, streak),
    correct: performance.correct + Number(correct),
    answered: performance.answered + 1,
  };
}

export function addPowerUp(
  performance: PlayerPerformance,
  powerUp: PowerUpType,
): PlayerPerformance {
  return {
    ...performance,
    earned: performance.earned + 1,
    inventory: { ...performance.inventory, [powerUp]: (performance.inventory[powerUp] ?? 0) + 1 },
  };
}
export function consumePowerUp(
  performance: PlayerPerformance,
  powerUp: PowerUpType,
): PlayerPerformance {
  const count = performance.inventory[powerUp] ?? 0;
  if (!count) return performance;
  return {
    ...performance,
    used: performance.used + 1,
    inventory: { ...performance.inventory, [powerUp]: count - 1 },
  };
}

export function evaluateRewardRules(
  rules: readonly RewardRule[],
  event: {
    trigger: RewardRule['trigger'];
    streak: number;
    difficulty?: 'easy' | 'medium' | 'hard';
  },
  awardCounts: Readonly<Record<string, number>>,
): RewardEvent[] {
  return rules
    .filter(
      (rule) =>
        rule.trigger === event.trigger &&
        event.streak >= (rule.minStreak ?? 0) &&
        (!rule.difficulty || rule.difficulty === event.difficulty) &&
        (awardCounts[rule.id] ?? 0) < rule.maxAwards,
    )
    .map((rule) => ({
      ruleId: rule.id,
      title: event.streak >= 3 ? 'On a Roll!' : 'Performance Reward',
      reward: rule.reward,
    }));
}

export function performanceTier(
  p: PlayerPerformance,
): 'Getting Started' | 'Building Momentum' | 'On a Roll' | 'Excellent Round' | 'Perfect Round' {
  if (!p.answered) return 'Getting Started';
  const accuracy = p.correct / p.answered;
  if (accuracy === 1 && p.answered >= 3) return 'Perfect Round';
  if (accuracy >= 0.8) return 'Excellent Round';
  if (p.bestStreak >= 3) return 'On a Roll';
  return accuracy >= 0.5 ? 'Building Momentum' : 'Getting Started';
}

export function fiftyFifty(
  optionIds: readonly string[],
  correctIds: ReadonlySet<string>,
): string[] {
  return optionIds.filter((id) => !correctIds.has(id)).slice(0, Math.max(0, optionIds.length - 2));
}
