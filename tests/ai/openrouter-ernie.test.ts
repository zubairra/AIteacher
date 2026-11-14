import { describe, expect, it } from 'vitest';

import { getCatalogThinkingCapability } from '@/lib/ai/model-metadata';
import { PROVIDERS, getModelInfo, parseModelString } from '@/lib/ai/providers';
import { teacherProviderCatalog } from '@/lib/server/auth/credential-vault';
import { defaultTeacherModelId } from '@/lib/teacher/provider-defaults';
import {
  generateSceneActions,
  generateSceneContent,
  generateSceneOutlinesFromRequirements,
} from '@openmaic/generation';
import type { UserRequirements } from '@openmaic/generation';

const ERNIE_FLASH = 'baidu/ernie-5.5-flash-preview:free';
const ERNIE_LIGHT = 'baidu/ernie-light-dt-1.0-intl';

const teacherRequirements: UserRequirements = {
  requirement: 'Teach the structure of the atom to a whole class.',
  generationMode: 'teacher-led',
  teacherLesson: {
    version: 1,
    mode: 'teacher-led',
    subject: 'Chemistry',
    grade: 'Grade 8',
    topic: 'Structure of the Atom',
    durationMinutes: 40,
    curriculum: 'CBSE',
    teachingStyle: 'balanced',
  },
};

describe('OpenRouter Baidu ERNIE models', () => {
  it('lists the live catalog ids without changing the default OpenRouter model', () => {
    const ids = PROVIDERS.openrouter.models.map((model) => model.id);

    expect(ids).toEqual([
      'deepseek/deepseek-v4-pro',
      'deepseek/deepseek-v4-flash',
      ERNIE_FLASH,
      ERNIE_LIGHT,
    ]);
    expect(defaultTeacherModelId('openrouter', PROVIDERS.openrouter.models)).toBe(
      'deepseek/deepseek-v4-flash',
    );
    expect(PROVIDERS.openrouter.models[0]?.id).toBe('deepseek/deepseek-v4-pro');

    const catalogIds = teacherProviderCatalog()
      .find((provider) => provider.id === 'openrouter')
      ?.models.map((model) => model.id);
    expect(catalogIds).toEqual(ids);
  });

  it('keeps the free-tier suffix when the model string is provider-prefixed', () => {
    expect(parseModelString(`openrouter:${ERNIE_FLASH}`)).toEqual({
      providerId: 'openrouter',
      modelId: ERNIE_FLASH,
    });
  });

  it('records context, output, and capability metadata from the live catalog', () => {
    expect(getModelInfo('openrouter', ERNIE_FLASH)).toMatchObject({
      id: ERNIE_FLASH,
      name: 'ERNIE 5.5 Flash Preview (free)',
      contextWindow: 1024000,
      outputWindow: 921600,
      capabilities: {
        streaming: true,
        tools: true,
        vision: false,
        thinking: {
          control: 'effort',
          requestAdapter: 'openrouter',
          effortValues: ['high'],
          defaultEffort: 'high',
          toggleable: false,
          defaultEnabled: true,
        },
      },
    });
    expect(getModelInfo('openrouter', ERNIE_LIGHT)).toMatchObject({
      id: ERNIE_LIGHT,
      name: 'ERNIE Light DT 1.0',
      contextWindow: 1024000,
      outputWindow: 131072,
      capabilities: {
        streaming: true,
        tools: true,
        vision: false,
        thinking: {
          control: 'effort',
          requestAdapter: 'openrouter',
          effortValues: ['none', 'low', 'high', 'max'],
          defaultEffort: 'max',
          toggleable: true,
          defaultEnabled: true,
        },
      },
    });
    expect(getCatalogThinkingCapability('openrouter', ERNIE_FLASH)?.budgetAdjustable).toBe(false);
    expect(getCatalogThinkingCapability('openrouter', ERNIE_LIGHT)?.budgetAdjustable).toBe(true);
  });

  it('generates outlines and scenes from plain text when the model does not use tool calls or JSON mode', async () => {
    const calls: Array<{ system: string; user: string; images?: unknown }> = [];
    const aiCall = async (
      system: string,
      user: string,
      images?: Array<{ id: string; src: string }>,
    ) => {
      calls.push({ system, user, images });
      if (calls.length === 1) {
        return [
          '<think>Plan a short chemistry lesson, then answer with JSON only.</think>',
          '```json',
          JSON.stringify({
            languageDirective: 'Teach in English.',
            courseTitle: 'Structure of the Atom',
            outlines: [
              {
                type: 'slide',
                title: 'Protons, neutrons, and electrons',
                description: 'Name the three particles in an atom.',
                keyPoints: ['Protons are positive', 'Electrons orbit the nucleus'],
              },
            ],
          }),
          '```',
        ].join('\n');
      }
      if (calls.length === 2) {
        return JSON.stringify({
          elements: [
            {
              type: 'text',
              left: 80,
              top: 60,
              width: 840,
              height: 100,
              content: 'An atom has protons, neutrons, and electrons.',
            },
          ],
          background: { type: 'solid', color: '#ffffff' },
        });
      }
      return JSON.stringify([
        { type: 'text', content: 'Ask the class to name one particle in the nucleus.' },
      ]);
    };

    const outlines = await generateSceneOutlinesFromRequirements(
      teacherRequirements,
      undefined,
      undefined,
      aiCall,
    );
    expect(outlines.success).toBe(true);
    const outline = outlines.data?.outlines[0];
    expect(outlines.data?.courseTitle).toBe('Structure of the Atom');
    expect(outline?.type).toBe('slide');
    expect(outline?.title).toBe('Protons, neutrons, and electrons');
    if (!outline) throw new Error('outline generation did not return a scene');

    const content = await generateSceneContent(outline, aiCall, {
      userRequirements: teacherRequirements,
    });
    expect(content).toMatchObject({
      elements: [
        expect.objectContaining({
          type: 'text',
          content: 'An atom has protons, neutrons, and electrons.',
        }),
      ],
    });
    if (!content) throw new Error('scene content generation returned nothing');

    const actions = await generateSceneActions(outline, content, aiCall, {
      userRequirements: teacherRequirements,
    });
    expect(actions.length).toBeGreaterThan(0);

    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.images).toBeUndefined();
      expect(call.system.length).toBeGreaterThan(0);
      expect(call.user.length).toBeGreaterThan(0);
      expect(JSON.stringify(call)).not.toMatch(/response_format|tool_choice/);
    }
  });
});
