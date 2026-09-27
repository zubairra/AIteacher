// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { getTeacherNavigationState, isEditableShortcutTarget } from '@/lib/teacher/teach-mode';
import type { Scene } from '@/lib/types/stage';

const scenes = [{ id: 'scene-1' }, { id: 'scene-2' }, { id: 'scene-3' }] as Scene[];

describe('teacher Teach Mode navigation', () => {
  it('disables previous on the first scene and next on the last scene', () => {
    expect(getTeacherNavigationState(scenes, 'scene-1')).toMatchObject({
      position: 1,
      total: 3,
      previousSceneId: undefined,
      nextSceneId: 'scene-2',
    });
    expect(getTeacherNavigationState(scenes, 'scene-3')).toMatchObject({
      position: 3,
      total: 3,
      previousSceneId: 'scene-2',
      nextSceneId: undefined,
    });
  });

  it('falls back safely when persisted navigation points to a missing scene', () => {
    expect(getTeacherNavigationState(scenes, 'removed-scene')).toMatchObject({
      index: 0,
      position: 1,
      nextSceneId: 'scene-2',
    });
    expect(getTeacherNavigationState([], null)).toMatchObject({ position: 0, total: 0 });
  });

  it('does not claim arrow shortcuts while the teacher is typing', () => {
    const input = document.createElement('input');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const button = document.createElement('button');
    expect(isEditableShortcutTarget(input)).toBe(true);
    expect(isEditableShortcutTarget(editable)).toBe(true);
    expect(isEditableShortcutTarget(button)).toBe(false);
  });
});
