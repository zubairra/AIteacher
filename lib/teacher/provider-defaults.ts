/**
 * Teacher Settings chooses one model for the provider being edited.
 * The list is that provider's own catalog, never a mix of other providers.
 */

export interface TeacherModelOption {
  id: string;
  name?: string;
}

/**
 * Sensible first choice when the teacher has not saved a model yet.
 * DeepSeek uses its current general chat model (V4 Flash). Qwen uses the
 * DashScope Plus model (`qwen3.7-plus`, the current qwen-plus class model).
 */
const PREFERRED_MODEL_IDS: Record<string, string> = {
  deepseek: 'deepseek-v4-flash',
  qwen: 'qwen3.7-plus',
  kimi: 'kimi-k3',
  openrouter: 'deepseek/deepseek-v4-flash',
};

export function defaultTeacherModelId(
  providerId: string,
  models: ReadonlyArray<TeacherModelOption>,
): string {
  const preferred = PREFERRED_MODEL_IDS[providerId];
  if (preferred && models.some((model) => model.id === preferred)) return preferred;
  return models[0]?.id ?? '';
}

/** Keep a saved model only when it belongs to this provider. */
export function selectTeacherModel(
  providerId: string,
  models: ReadonlyArray<TeacherModelOption>,
  savedModelId?: string | null,
): string {
  if (savedModelId && models.some((model) => model.id === savedModelId)) return savedModelId;
  return defaultTeacherModelId(providerId, models);
}

/** Models shown for the provider the teacher is editing. */
export function modelsForTeacherProvider<T extends TeacherModelOption>(
  providers: ReadonlyArray<{ id: string; models: ReadonlyArray<T> }>,
  providerId: string,
): T[] {
  const provider = providers.find((item) => item.id === providerId);
  return provider ? [...provider.models] : [];
}
