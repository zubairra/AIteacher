import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

import { sessionDocument } from '@/lib/teacher/live-session-client';
import {
  createJoinCode,
  findSecretKeys,
  gradeLiveAnswer,
  joinCodeIsValid,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  livePromptsFromScene,
  normalizeJoinCode,
  parseStudentAnswer,
  summarizeLiveResult,
  tallyPrompt,
  type PublicPrompt,
  type StudentAnswer,
} from '@/lib/teacher/live-session';

const sentinel = 'SENTINEL_ANSWER_KEY_SHOULD_NOT_LEAK';

describe('live class prompts', () => {
  test('join codes use a short unambiguous alphabet', () => {
    expect(createJoinCode(() => 0)).toBe('A'.repeat(JOIN_CODE_LENGTH));
    expect(joinCodeIsValid(createJoinCode())).toBe(true);
    expect(JOIN_CODE_ALPHABET).not.toMatch(/[01IO]/);
    expect(normalizeJoinCode(' k7-m2 pq ')).toBe('K7M2PQ');
    expect(joinCodeIsValid('K7M2PQ')).toBe(true);
    expect(joinCodeIsValid('O0I1AB')).toBe(false);
  });

  test('multiple choice and true/false prompts omit answer keys', () => {
    const set = livePromptsFromScene({
      id: 'scene-1',
      nativeActivity: {
        version: 1,
        id: 'check',
        title: 'Check',
        type: 'multiple-choice',
        questions: [
          {
            id: 'q1',
            prompt: 'Which particle has a negative charge?',
            explanation: sentinel,
            hint: 'SENTINEL_HINT',
            options: [
              { id: 'proton', label: 'Proton' },
              { id: 'electron', label: 'Electron' },
            ],
            correctOptionIds: ['electron'],
          },
        ],
      },
    });
    expect(set.prompts).toEqual([
      {
        kind: 'choice',
        id: 'scene-1:q1',
        prompt: 'Which particle has a negative charge?',
        multi: false,
        options: [
          { id: 'proton', label: 'Proton' },
          { id: 'electron', label: 'Electron' },
        ],
      },
    ]);
    expect(findSecretKeys(set.prompts)).toEqual([]);
    expect(JSON.stringify(set.prompts)).not.toContain(sentinel);
    expect(JSON.stringify(set.prompts)).not.toContain('SENTINEL_HINT');
    expect(set.keys['scene-1:q1']).toEqual({ kind: 'choice', correctOptionIds: ['electron'] });

    const truth = livePromptsFromScene({
      id: 'scene-2',
      nativeActivity: {
        version: 1,
        id: 'tf',
        title: 'True or false',
        type: 'true-false',
        questions: [{ id: 't1', prompt: 'Electrons have a negative charge.', answer: true }],
      },
    });
    expect(truth.prompts[0]).toEqual({
      kind: 'true-false',
      id: 'scene-2:t1',
      prompt: 'Electrons have a negative charge.',
    });
    expect(findSecretKeys(truth.prompts)).toEqual([]);
    expect(truth.keys['scene-2:t1']).toEqual({ kind: 'true-false', answer: true });
  });

  test('match, sort, and order hide the key and do not keep the answer order', () => {
    const match = livePromptsFromScene(
      {
        id: 'scene-m',
        nativeActivity: {
          version: 1,
          id: 'match',
          title: 'Match',
          type: 'match-pairs',
          pairs: [
            { id: 'pair-a', left: 'Cat', right: 'Meow' },
            { id: 'pair-b', left: 'Dog', right: 'Bark' },
          ],
        },
      },
      () => 0,
    );
    const matchPrompt = match.prompts[0];
    expect(matchPrompt?.kind).toBe('match');
    if (matchPrompt?.kind !== 'match') return;
    expect(matchPrompt.left.map((item) => item.id)).toEqual(['pair-a', 'pair-b']);
    expect(matchPrompt.right.map((item) => item.id).join(' ')).not.toContain('pair-');
    expect(matchPrompt.right.every((item) => item.id.startsWith('right_'))).toBe(true);
    expect(findSecretKeys(match.prompts)).toEqual([]);

    const sorted = livePromptsFromScene(
      {
        id: 'scene-s',
        nativeActivity: {
          version: 1,
          id: 'sort',
          title: 'Sort',
          type: 'sort',
          categories: [
            { id: 'charged', label: 'Charged' },
            { id: 'neutral', label: 'Neutral' },
          ],
          items: [
            { id: 'electron', label: 'Electron', categoryId: 'charged' },
            { id: 'neutron', label: 'Neutron', categoryId: 'neutral' },
          ],
        },
      },
      () => 0,
    );
    const sortPrompt = sorted.prompts[0];
    expect(sortPrompt?.kind).toBe('sort');
    if (sortPrompt?.kind !== 'sort') return;
    expect(sortPrompt.items.map((item) => item.id)).not.toEqual(['electron', 'neutron']);
    expect(JSON.stringify(sortPrompt)).not.toContain('categoryId');

    const ordered = livePromptsFromScene(
      {
        id: 'scene-o',
        nativeActivity: {
          version: 1,
          id: 'order',
          title: 'Order',
          type: 'ordering',
          items: [
            { id: 'first', label: 'First' },
            { id: 'second', label: 'Second' },
            { id: 'third', label: 'Third' },
          ],
          correctOrder: ['first', 'second', 'third'],
        },
      },
      () => 0,
    );
    const orderPrompt = ordered.prompts[0];
    expect(orderPrompt?.kind).toBe('order');
    if (orderPrompt?.kind !== 'order') return;
    expect(orderPrompt.items.map((item) => item.id)).not.toEqual(['first', 'second', 'third']);
    expect(JSON.stringify(orderPrompt)).not.toContain('correctOrder');
  });

  test('quiz scenes reuse choice grading and leave short answers ungraded', () => {
    const set = livePromptsFromScene({
      id: 'quiz-scene',
      content: {
        type: 'quiz',
        questions: [
          {
            id: 'pick',
            type: 'multiple',
            question: 'Select the charges',
            options: [
              { label: 'Proton', value: 'proton' },
              { label: 'Electron', value: 'electron' },
              { label: 'Neutron', value: 'neutron' },
            ],
            answer: ['proton', 'electron'],
            analysis: sentinel,
          },
          {
            id: 'write',
            type: 'short_answer',
            question: 'Explain the nucleus',
            commentPrompt: sentinel,
          },
        ],
      },
    });
    expect(findSecretKeys(set.prompts)).toEqual([]);
    expect(JSON.stringify(set.prompts)).not.toContain(sentinel);
    expect(set.prompts.map((prompt) => prompt.kind)).toEqual(['choice', 'text']);
    const choice = set.keys['quiz-scene:pick'];
    expect(choice?.kind).toBe('choice');
    if (choice?.kind !== 'choice') return;
    expect(gradeLiveAnswer(choice, { kind: 'choice', optionIds: ['electron', 'proton'] })).toBe(
      true,
    );
    expect(gradeLiveAnswer(choice, { kind: 'choice', optionIds: ['proton'] })).toBe(false);
    expect(gradeLiveAnswer(set.keys['quiz-scene:write'], { kind: 'text', text: 'A nucleus' })).toBe(
      null,
    );
  });

  test('spin wheel and team battle are not collected on phones', () => {
    expect(
      livePromptsFromScene({
        id: 'wheel',
        nativeActivity: {
          version: 1,
          id: 'wheel',
          title: 'Wheel',
          type: 'spin-wheel',
          entries: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
          ],
        },
      }).prompts,
    ).toEqual([]);
    expect(
      livePromptsFromScene({
        id: 'battle',
        nativeActivity: {
          version: 1,
          id: 'battle',
          title: 'Battle',
          type: 'team-battle',
          questions: [{ id: 'q', prompt: 'Who wins?', answer: 'Team A' }],
        },
      }).prompts,
    ).toEqual([]);
  });

  test('tallies and saved results keep counts without answer keys', () => {
    const prompt: PublicPrompt = {
      kind: 'true-false',
      id: 'scene:t',
      prompt: 'Electrons are negative.',
    };
    const answers: StudentAnswer[] = [
      { kind: 'true-false', value: true },
      { kind: 'true-false', value: true },
      { kind: 'true-false', value: false },
    ];
    expect(tallyPrompt(prompt, answers)).toEqual([
      { id: 'true', label: 'True', count: 2 },
      { id: 'false', label: 'False', count: 1 },
    ]);
    expect(gradeLiveAnswer({ kind: 'true-false', answer: true }, answers[0])).toBe(true);
    const result = summarizeLiveResult({
      code: 'K7M2PQ',
      lessonId: 'lesson-1',
      sceneId: 'scene',
      sceneTitle: 'Charge',
      closedAt: 10,
      prompts: [prompt],
      keys: { 'scene:t': { kind: 'true-false', answer: true } },
      responses: [
        { displayName: 'Ava', answers: { 'scene:t': answers[0] } },
        {
          displayName: 'Ben',
          answers: { 'scene:t': { kind: 'text', text: 'not this shape' } },
        },
      ],
    });
    expect(result.prompts[0]).toMatchObject({
      responseCount: 2,
      correctCount: 1,
      ungradedCount: 0,
      tally: [
        { id: 'true', label: 'True', count: 1 },
        { id: 'false', label: 'False', count: 0 },
      ],
    });
    expect(findSecretKeys(result)).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(sentinel);

    const parsed = parseStudentAnswer({
      kind: 'choice',
      optionIds: ['electron'],
      answer: sentinel,
      explanation: sentinel,
    });
    expect(parsed).toEqual({ kind: 'choice', optionIds: ['electron'] });
    expect(findSecretKeys(parsed)).toEqual([]);
  });

  test('a session document refuses leaked answer fields', () => {
    expect(() =>
      sessionDocument({
        teacherUid: 'teacher-1',
        lessonId: 'lesson-1',
        lessonTitle: 'Atoms',
        sceneId: 'scene-1',
        sceneTitle: 'Charge',
        prompts: [
          {
            kind: 'choice',
            id: 'scene-1:q',
            prompt: 'Which particle?',
            multi: false,
            options: [{ id: 'electron', label: 'Electron' }],
            correctOptionIds: ['electron'],
          } as unknown as PublicPrompt,
        ],
        now: 1,
      }),
    ).toThrow(/answer/i);
  });

  test('student surfaces do not call generation or quiz grading', async () => {
    const files = [
      'components/student/StudentJoin.tsx',
      'components/teacher/LiveClassSession.tsx',
      'lib/teacher/live-session.ts',
      'lib/teacher/live-session-client.ts',
    ];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      expect(source).not.toContain('/api/quiz-grade');
      expect(source).not.toContain('/api/generate');
      expect(source.toLowerCase()).not.toContain('openrouter');
    }
  });
});
