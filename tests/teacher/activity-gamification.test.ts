import { describe, expect, it } from 'vitest';
import {
  addPowerUp,
  applyAnswer,
  calculateQuestionScore,
  consumePowerUp,
  emptyPerformance,
  evaluateRewardRules,
  fiftyFifty,
  performanceTier,
} from '@/lib/teacher/activity-gamification';
import { gamificationConfigSchema } from '@/lib/teacher/native-activities';
const config = gamificationConfigSchema.parse({
  enabled: true,
  mode: 'class',
  lifelines: true,
  performanceRewards: true,
  streakBonuses: true,
  secondChanceFactor: 0.5,
  maxScoreMultiplier: 3,
  scoreBoostMultiplier: 1.5,
  rewardRules: [],
});
describe('classroom power-ups', () => {
  it('calculates deterministic bounded stacking', () => {
    expect(
      calculateQuestionScore({
        basePoints: 100,
        correct: true,
        attempt: 1,
        streak: 0,
        activePowerUps: ['double-points', 'score-boost'],
        config,
      }),
    ).toBe(300);
    expect(
      calculateQuestionScore({
        basePoints: 100,
        correct: true,
        attempt: 2,
        streak: 0,
        activePowerUps: ['double-points'],
        config,
      }),
    ).toBe(100);
    expect(
      calculateQuestionScore({
        basePoints: 100,
        correct: false,
        attempt: 1,
        streak: 4,
        activePowerUps: ['safe-bet'],
        config,
      }),
    ).toBe(0);
  });
  it('disables scoring modifiers with gamification off', () =>
    expect(
      calculateQuestionScore({
        basePoints: 100,
        correct: true,
        attempt: 1,
        streak: 5,
        activePowerUps: ['double-points'],
        config: { ...config, enabled: false },
      }),
    ).toBe(100));
  it('tracks streak increment/reset and summary tiers', () => {
    let p = applyAnswer(emptyPerformance(), true, 100);
    p = applyAnswer(p, true, 100);
    expect(p.streak).toBe(2);
    p = applyAnswer(p, false, 0);
    expect(p.streak).toBe(0);
    expect(performanceTier(p)).toBe('Building Momentum');
  });
  it('manages inventory without underflow', () => {
    const earned = addPowerUp(emptyPerformance(), 'hint');
    const used = consumePowerUp(earned, 'hint');
    expect(used.inventory.hint).toBe(0);
    expect(consumePowerUp(used, 'hint')).toEqual(used);
  });
  it('removes exactly two incorrect choices for four-option 50/50', () =>
    expect(fiftyFifty(['a', 'b', 'c', 'd'], new Set(['a']))).toHaveLength(2));
  it('triggers configured deterministic rewards', () => {
    const rules = [
      {
        id: 'r',
        trigger: 'correct' as const,
        minStreak: 2,
        maxAwards: 1,
        reward: { kind: 'power-up' as const, powerUp: 'double-points' as const },
      },
    ];
    expect(evaluateRewardRules(rules, { trigger: 'correct', streak: 2 }, {})).toHaveLength(1);
    expect(evaluateRewardRules(rules, { trigger: 'correct', streak: 2 }, { r: 1 })).toHaveLength(0);
  });
  it('rejects malformed reward configuration', () =>
    expect(
      gamificationConfigSchema.safeParse({
        enabled: true,
        rewardRules: [
          {
            id: 'r',
            trigger: 'correct',
            maxAwards: 0,
            reward: { kind: 'bonus-points', points: -1 },
          },
        ],
      }).success,
    ).toBe(false));
});
