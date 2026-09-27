import type { Scene } from '@/lib/types/stage';

export interface TeacherNavigationState {
  readonly index: number;
  readonly position: number;
  readonly total: number;
  readonly previousSceneId?: string;
  readonly nextSceneId?: string;
}

export function getTeacherNavigationState(
  scenes: readonly Scene[],
  currentSceneId: string | null,
): TeacherNavigationState {
  const index = Math.max(
    0,
    scenes.findIndex((scene) => scene.id === currentSceneId),
  );
  return {
    index,
    position: scenes.length === 0 ? 0 : index + 1,
    total: scenes.length,
    previousSceneId: index > 0 ? scenes[index - 1]?.id : undefined,
    nextSceneId: index < scenes.length - 1 ? scenes[index + 1]?.id : undefined,
  };
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable="true"], [role="slider"]'),
  );
}
