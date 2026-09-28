import { z } from 'zod';

const id = z.string().trim().min(1).max(80);
const text = z.string().trim().min(1).max(1200);
const shortText = z.string().trim().min(1).max(240);
const item = z.object({ id, label: shortText }).strict();

export const powerUpTypes = [
  'fifty-fifty',
  'double-points',
  'safe-bet',
  'second-chance',
  'extra-time',
  'hint',
  'score-boost',
] as const;
export type PowerUpType = (typeof powerUpTypes)[number];

const rewardRuleSchema = z
  .object({
    id,
    trigger: z.enum(['correct', 'incorrect', 'round-complete']),
    minStreak: z.number().int().min(0).max(20).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    maxAwards: z.number().int().min(1).max(10).default(1),
    reward: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('power-up'), powerUp: z.enum(powerUpTypes) }).strict(),
      z
        .object({ kind: z.literal('bonus-points'), points: z.number().int().min(1).max(1000) })
        .strict(),
    ]),
  })
  .strict();

const defaultRewardRules = [
  {
    id: 'streak-2-hint',
    trigger: 'correct' as const,
    minStreak: 2,
    maxAwards: 1,
    reward: { kind: 'power-up' as const, powerUp: 'hint' as const },
  },
  {
    id: 'streak-3-double',
    trigger: 'correct' as const,
    minStreak: 3,
    maxAwards: 1,
    reward: { kind: 'power-up' as const, powerUp: 'double-points' as const },
  },
];

export const gamificationConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    mode: z.enum(['class', 'teams']).default('class'),
    lifelines: z.boolean().default(true),
    performanceRewards: z.boolean().default(true),
    timer: z
      .object({
        enabled: z.boolean(),
        secondsPerQuestion: z.number().int().min(5).max(600),
        extraTimeSeconds: z.number().int().min(5).max(300).default(30),
      })
      .strict()
      .optional(),
    streakBonuses: z.boolean().default(true),
    secondChanceFactor: z.number().min(0.1).max(1).default(0.5),
    maxScoreMultiplier: z.number().min(1).max(4).default(3),
    scoreBoostMultiplier: z.number().min(1.1).max(3).default(1.5),
    rewardRules: z.array(rewardRuleSchema).max(20).default(defaultRewardRules),
  })
  .strict();

const questionBase = z.object({
  id,
  prompt: text,
  explanation: text.optional(),
  hint: shortText.optional(),
  basePoints: z.number().int().min(1).max(1000).default(100),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
});

const base = z.object({
  version: z.literal(1),
  id,
  title: shortText,
  instructions: text.optional(),
  gamification: gamificationConfigSchema.optional(),
});

const multipleChoice = base
  .extend({
    type: z.literal('multiple-choice'),
    questions: z
      .array(
        questionBase
          .extend({
            options: z.array(item).min(2).max(6),
            correctOptionIds: z.array(id).min(1).max(6),
            shuffleOptions: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .superRefine((value, ctx) => {
    value.questions.forEach((q, qi) => {
      unique(
        q.options.map((o) => o.id),
        ctx,
        ['questions', qi, 'options'],
      );
      const optionIds = new Set(q.options.map((o) => o.id));
      unique(q.correctOptionIds, ctx, ['questions', qi, 'correctOptionIds']);
      q.correctOptionIds.forEach((answer, ai) => {
        if (!optionIds.has(answer))
          ctx.addIssue({
            code: 'custom',
            path: ['questions', qi, 'correctOptionIds', ai],
            message: 'Answer must reference an option',
          });
      });
    });
  });

const trueFalse = base
  .extend({
    type: z.literal('true-false'),
    questions: z
      .array(questionBase.extend({ answer: z.boolean() }).strict())
      .min(1)
      .max(30),
  })
  .strict();

const matchPairs = base
  .extend({
    type: z.literal('match-pairs'),
    randomize: z.boolean().default(true),
    pairs: z
      .array(z.object({ id, left: shortText, right: shortText }).strict())
      .min(2)
      .max(20),
  })
  .strict()
  .superRefine((v, ctx) =>
    unique(
      v.pairs.map((p) => p.id),
      ctx,
      ['pairs'],
    ),
  );

const sort = base
  .extend({
    type: z.literal('sort'),
    categories: z.array(item).min(2).max(8),
    items: z
      .array(item.extend({ categoryId: id }).strict())
      .min(2)
      .max(30),
  })
  .strict()
  .superRefine((v, ctx) => {
    unique(
      v.categories.map((x) => x.id),
      ctx,
      ['categories'],
    );
    unique(
      v.items.map((x) => x.id),
      ctx,
      ['items'],
    );
    const ids = new Set(v.categories.map((x) => x.id));
    v.items.forEach((x, i) => {
      if (!ids.has(x.categoryId))
        ctx.addIssue({
          code: 'custom',
          path: ['items', i, 'categoryId'],
          message: 'Unknown category',
        });
    });
  });

const ordering = base
  .extend({
    type: z.literal('ordering'),
    explanation: text.optional(),
    items: z.array(item).min(2).max(20),
    correctOrder: z.array(id).min(2).max(20),
  })
  .strict()
  .superRefine((v, ctx) => {
    unique(
      v.items.map((x) => x.id),
      ctx,
      ['items'],
    );
    unique(v.correctOrder, ctx, ['correctOrder']);
    const ids = new Set(v.items.map((x) => x.id));
    if (v.correctOrder.length !== ids.size || v.correctOrder.some((x) => !ids.has(x)))
      ctx.addIssue({
        code: 'custom',
        path: ['correctOrder'],
        message: 'Order must reference every item exactly once',
      });
  });

const spinWheel = base
  .extend({
    type: z.literal('spin-wheel'),
    entries: z.array(item).min(2).max(24),
  })
  .strict()
  .superRefine((v, ctx) =>
    unique(
      v.entries.map((x) => x.id),
      ctx,
      ['entries'],
    ),
  );

const teamBattle = base
  .extend({
    type: z.literal('team-battle'),
    teamNames: z.tuple([shortText, shortText]).default(['Team A', 'Team B']),
    questions: z
      .array(questionBase.extend({ answer: text }).strict())
      .min(1)
      .max(40),
  })
  .strict();

export const nativeActivitySchema = z.discriminatedUnion('type', [
  multipleChoice,
  trueFalse,
  matchPairs,
  sort,
  ordering,
  spinWheel,
  teamBattle,
]);
export type NativeActivityDefinition = z.infer<typeof nativeActivitySchema>;
export type NativeActivityType = NativeActivityDefinition['type'];
export type GamificationConfig = z.infer<typeof gamificationConfigSchema>;
export type RewardRule = z.infer<typeof rewardRuleSchema>;

export function parseNativeActivity(value: unknown): NativeActivityDefinition | null {
  const result = nativeActivitySchema.safeParse(value);
  return result.success ? result.data : null;
}

function unique(values: string[], ctx: z.RefinementCtx, path: PropertyKey[]) {
  if (new Set(values).size !== values.length)
    ctx.addIssue({ code: 'custom', path, message: 'IDs must be unique' });
}

export const activityTypeLabels: Record<NativeActivityType, string> = {
  'multiple-choice': 'Multiple Choice',
  'true-false': 'True / False',
  'match-pairs': 'Match Pairs',
  sort: 'Category Sort',
  ordering: 'Ordering',
  'spin-wheel': 'Spin the Wheel',
  'team-battle': 'Team Battle',
};
