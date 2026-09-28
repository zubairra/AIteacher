import { describe, expect, it } from 'vitest';
import { nativeActivitySchema, parseNativeActivity } from '@/lib/teacher/native-activities';
import { createSeededRandom, selectRandom, shuffle } from '@/lib/teacher/activity-random';
import {
  adjustTeamScore,
  isOrderCorrect,
  isSortCorrect,
  matchPair,
  moveOrderedItem,
  placeSortItem,
  removeWheelEntry,
} from '@/lib/teacher/activity-runtime';
import { activityRegistry } from '@/components/teacher/activities/activity-registry';

const base = { version: 1 as const, id: 'a', title: 'Review' };
const question = {
  id: 'q1',
  prompt: 'Question?',
  options: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
  correctOptionIds: ['a'],
};
describe('native activity contract', () => {
  it.each([
    { ...base, type: 'multiple-choice', questions: [question] },
    { ...base, type: 'true-false', questions: [{ id: 'q', prompt: 'Statement', answer: true }] },
    {
      ...base,
      type: 'match-pairs',
      pairs: [
        { id: 'p1', left: 'One', right: '1' },
        { id: 'p2', left: 'Two', right: '2' },
      ],
    },
    {
      ...base,
      type: 'sort',
      categories: [
        { id: 'c1', label: 'A' },
        { id: 'c2', label: 'B' },
      ],
      items: [
        { id: 'i1', label: 'Item', categoryId: 'c1' },
        { id: 'i2', label: 'Other', categoryId: 'c2' },
      ],
    },
    {
      ...base,
      type: 'ordering',
      items: [
        { id: 'i1', label: 'First' },
        { id: 'i2', label: 'Second' },
      ],
      correctOrder: ['i1', 'i2'],
    },
    {
      ...base,
      type: 'spin-wheel',
      entries: [
        { id: 'e1', label: 'One' },
        { id: 'e2', label: 'Two' },
      ],
    },
    { ...base, type: 'team-battle', questions: [{ id: 'q', prompt: 'Ask', answer: 'Answer' }] },
  ])('validates $type', (value) =>
    expect(nativeActivitySchema.safeParse(value).success).toBe(true),
  );
  it('rejects unsupported versions/types and empty arrays', () => {
    expect(
      parseNativeActivity({ ...base, version: 2, type: 'spin-wheel', entries: [] }),
    ).toBeNull();
    expect(parseNativeActivity({ ...base, type: 'unknown' })).toBeNull();
  });
  it('registers every supported type centrally', () => {
    expect([...activityRegistry.keys()]).toEqual([
      'multiple-choice',
      'true-false',
      'match-pairs',
      'sort',
      'ordering',
      'spin-wheel',
      'team-battle',
    ]);
  });
  it('keeps legacy scenes compatible when activity metadata is absent', () => {
    expect(parseNativeActivity(undefined)).toBeNull();
  });
  it('rejects duplicate IDs and invalid references', () => {
    expect(
      parseNativeActivity({
        ...base,
        type: 'multiple-choice',
        questions: [{ ...question, correctOptionIds: ['missing'] }],
      }),
    ).toBeNull();
    expect(
      parseNativeActivity({
        ...base,
        type: 'ordering',
        items: [
          { id: 'x', label: 'X' },
          { id: 'y', label: 'Y' },
        ],
        correctOrder: ['x', 'x'],
      }),
    ).toBeNull();
  });
  it('accepts arbitrary subject content through the same schema', () => {
    for (const prompt of [
      'Factorisation of Algebraic Expressions',
      'Reflexive and Indefinite Pronouns',
      'Volcanoes',
      'Structure of the Atom',
      'Music of the Andes',
    ])
      expect(
        parseNativeActivity({
          ...base,
          type: 'true-false',
          questions: [{ id: 'q', prompt, answer: true }],
        }),
      ).not.toBeNull();
  });
});
describe('deterministic activity mechanics', () => {
  it('uses deterministic Fisher-Yates shuffle and selection', () => {
    expect(shuffle([1, 2, 3, 4], createSeededRandom(7))).toEqual(
      shuffle([1, 2, 3, 4], createSeededRandom(7)),
    );
    expect(selectRandom(['a', 'b'], () => 0.99)).toBe('b');
  });
  it('matches without losing progress on an incorrect pair', () => {
    expect(matchPair('p1', 'p2', ['p0'])).toEqual({ matched: ['p0'], correct: false });
    expect(matchPair('p1', 'p1', []).correct).toBe(true);
  });
  it('sorts, orders, removes wheel items and isolates team scores', () => {
    const placed = placeSortItem({}, 'i', 'c');
    expect(isSortCorrect([{ id: 'i', categoryId: 'c' }], placed)).toBe(true);
    const moved = moveOrderedItem([{ id: 'b' }, { id: 'a' }], 0, 1);
    expect(isOrderCorrect(moved, ['a', 'b'])).toBe(true);
    expect(removeWheelEntry([{ id: 'a' }, { id: 'b' }], 'a')).toEqual([{ id: 'b' }]);
    expect(adjustTeamScore([100, 200], 0, -50)).toEqual([50, 200]);
  });
});
