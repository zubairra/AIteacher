import { describe, expect, it } from 'vitest';
import {
  buildTeacherLedPromptContext,
  isTeacherLedRequirements,
  normalizeTeacherNotes,
  teacherDurationGuidance,
  teacherActivityGuidance,
} from '../../packages/@openmaic/generation/src/teacher-mode';
import { buildOutlinePrompt } from '../../packages/@openmaic/generation/src/outline-generator';
import { buildCompleteScene } from '../../packages/@openmaic/generation/src/scene-builder';
import type {
  TeachingStyle,
  UserRequirements,
} from '../../packages/@openmaic/generation/src/outline-types';

function requirements(style: TeachingStyle = 'balanced'): UserRequirements {
  return {
    requirement: 'Validated lesson brief',
    generationMode: 'teacher-led',
    teacherLesson: {
      version: 1,
      mode: 'teacher-led',
      subject: 'Chemistry',
      grade: 'Grade 8',
      topic: 'Structure of the Atom',
      durationMinutes: 40,
      curriculum: 'CBSE',
      teachingStyle: style,
    },
  };
}

describe('teacher-led generation mode', () => {
  it('uses an explicit mode contract and leaves legacy requirements unchanged', () => {
    const legacy: UserRequirements = { requirement: 'Legacy lesson' };
    expect(isTeacherLedRequirements(requirements())).toBe(true);
    expect(isTeacherLedRequirements(legacy)).toBe(false);
    expect(buildTeacherLedPromptContext(legacy)).toBe('');
  });

  it('injects human-teacher, duration, curriculum, projection, and notes context', () => {
    const context = buildTeacherLedPromptContext(requirements());
    expect(context).toContain('HUMAN TEACHER');
    expect(context).toContain('Class duration: 40 minutes');
    expect(context).toContain('Curriculum: CBSE');
    expect(context).toContain('projection-ready');
    expect(context).toContain('teacherNotes');
    expect(context).toContain('Do not generate continuous AI speech');
  });

  it('puts explicit teacher mode context into the existing outline prompt', () => {
    const prompt = buildOutlinePrompt(requirements(), {});
    expect(prompt.user).toContain('Teacher-led classroom mode');
    expect(prompt.user).toContain('Structure of the Atom');
  });

  it('produces distinct style and duration directions', () => {
    const visual = buildTeacherLedPromptContext(requirements('visual'));
    const activity = buildTeacherLedPromptContext(requirements('activity-heavy'));
    expect(visual).toContain('diagrams');
    expect(activity).toContain('class discussion');
    expect(visual).not.toEqual(activity);
    expect(teacherDurationGuidance(20)).not.toEqual(teacherDurationGuidance(60));
    expect(teacherActivityGuidance('activity-heavy', 60)).not.toEqual(
      teacherActivityGuidance('explanation-focused', 20),
    );
  });

  it('adds data-only native activity guidance and persists definitions on scenes', () => {
    const context = buildTeacherLedPromptContext(requirements('activity-heavy'));
    expect(context).toContain('nativeActivity');
    expect(context).toContain('Never emit JavaScript');
    const nativeActivity = {
      version: 1,
      id: 'review',
      type: 'true-false',
      title: 'Review',
      questions: [{ id: 'q', prompt: 'A statement', answer: true }],
    };
    const scene = buildCompleteScene(
      {
        id: 'outline-activity',
        type: 'slide',
        title: 'Review',
        description: 'Review',
        keyPoints: [],
        order: 1,
        nativeActivity,
      },
      { elements: [] },
      [],
      'stage-1',
    );
    expect(scene?.nativeActivity).toEqual(nativeActivity);
  });

  it('normalizes model-authored teacher notes as bounded data', () => {
    expect(
      normalizeTeacherNotes({ version: 1, teacherTip: '  Ask why first.  ', script: '<script />' }),
    ).toEqual({
      version: 1,
      teacherTip: 'Ask why first.',
      commonMisconception: undefined,
      discussionPrompt: undefined,
      explanationNote: undefined,
    });
    expect(normalizeTeacherNotes({ version: 2, teacherTip: 'No' })).toBeUndefined();
    expect(normalizeTeacherNotes('<script>alert(1)</script>')).toBeUndefined();
  });

  it('persists normalized teacher notes on the existing Scene shape', () => {
    const teacherNotes = normalizeTeacherNotes({
      version: 1,
      teacherTip: 'Ask students to predict before revealing.',
    });
    const scene = buildCompleteScene(
      {
        id: 'outline-1',
        type: 'slide',
        title: 'Inside the atom',
        description: 'Introduce the three subatomic particles.',
        keyPoints: ['Proton', 'Neutron', 'Electron'],
        order: 1,
        teacherNotes,
      },
      { elements: [] },
      [],
      'stage-1',
      { sceneId: 'scene-1' },
    );
    expect(scene?.teacherNotes).toEqual(teacherNotes);
  });
});
