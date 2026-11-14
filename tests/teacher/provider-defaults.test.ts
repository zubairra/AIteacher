import { describe, expect, test } from 'vitest';

import { PROVIDERS } from '@/lib/ai/providers';
import { teacherProviderCatalog } from '@/lib/server/auth/credential-vault';
import {
  defaultTeacherModelId,
  modelsForTeacherProvider,
  selectTeacherModel,
} from '@/lib/teacher/provider-defaults';

describe('teacher provider model selection', () => {
  test('uses the current chat model for DeepSeek, Qwen, Kimi, and OpenRouter', () => {
    expect(defaultTeacherModelId('deepseek', PROVIDERS.deepseek.models)).toBe('deepseek-v4-flash');
    expect(defaultTeacherModelId('qwen', PROVIDERS.qwen.models)).toBe('qwen3.7-plus');
    expect(defaultTeacherModelId('kimi', PROVIDERS.kimi.models)).toBe('kimi-k3');
    expect(defaultTeacherModelId('openrouter', PROVIDERS.openrouter.models)).toBe(
      'deepseek/deepseek-v4-flash',
    );
  });

  test('ignores a saved model that belongs to a different provider', () => {
    expect(selectTeacherModel('deepseek', PROVIDERS.deepseek.models, 'gemini-2.5-flash')).toBe(
      'deepseek-v4-flash',
    );
    expect(selectTeacherModel('qwen', PROVIDERS.qwen.models, 'deepseek-v4-flash')).toBe(
      'qwen3.7-plus',
    );
    expect(selectTeacherModel('deepseek', PROVIDERS.deepseek.models, 'deepseek-v4-pro')).toBe(
      'deepseek-v4-pro',
    );
  });

  test('lists only the selected provider models', () => {
    const catalog = teacherProviderCatalog();
    for (const provider of catalog) {
      expect(modelsForTeacherProvider(catalog, provider.id)).toEqual(provider.models);
    }

    const deepseekNames = modelsForTeacherProvider(catalog, 'deepseek').map((model) => model.name);
    expect(deepseekNames).toEqual([
      'DeepSeek V4 Pro',
      'DeepSeek V4 Flash',
      'DeepSeek V4 Flash Vision (Exp)',
    ]);
    expect(deepseekNames.join(' ')).not.toMatch(/Gemini|GLM|Kimi|Qwen|硅基流动/);

    const qwenIds = modelsForTeacherProvider(catalog, 'qwen').map((model) => model.id);
    expect(qwenIds).toContain('qwen3.7-plus');
    expect(qwenIds).not.toContain('deepseek-v4-flash');
    expect(qwenIds).not.toContain('gemini-2.5-flash');
  });
});
