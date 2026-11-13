import { describe, expect, it } from 'vitest';
import { buildOutlinePrompt } from '../../packages/@openmaic/generation/src/outline-generator';
import { buildPrompt } from '../../packages/@openmaic/generation/src/prompts/loader';
import {
  generateSceneActions,
  generateSceneContent,
} from '../../packages/@openmaic/generation/src/scene-generator';
import type { UserRequirements } from '../../packages/@openmaic/generation/src/outline-types';

function teacherRequirements(): UserRequirements {
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
      teachingStyle: 'balanced',
    },
  };
}

describe('teacher-led generation prompts', () => {
  it('keeps the learner-course outline when teacher mode is off', () => {
    const prompt = buildOutlinePrompt({ requirement: 'Teach recursion to beginners' }, {});
    expect(prompt.system).toContain("student's perspective");
    expect(prompt.system).toContain('General learners');
    expect(prompt.user).toContain('every 3-5 slides');
    expect(prompt.system).not.toContain('Do not design a learner self-study course');
  });

  it('drops self-study and narration instructions from a teacher-led outline', () => {
    const prompt = buildOutlinePrompt(teacherRequirements(), {});
    expect(prompt.system).not.toContain("student's perspective");
    expect(prompt.system).not.toContain('General learners');
    expect(prompt.user).not.toContain('every 3-5 slides');
    expect(prompt.system).toContain('whole class');
    expect(prompt.system).toContain('teacherNotes');
    expect(prompt.system).toContain('Do not design a learner self-study course');
    expect(prompt.user).toContain('whole-class');
    expect(prompt.user).toContain('teacherNotes');
    expect(prompt.user).toContain('Do not design a self-study quiz course');
  });

  it('stops slide-action prompts from requesting a narration track in teacher mode', () => {
    const learner = buildPrompt('slide-actions', { title: 'Atoms' });
    const teacher = buildPrompt('slide-actions', {
      title: 'Atoms',
      teacherMode: true,
      learnerCourse: false,
    });
    expect(learner?.system).toContain('Generate natural teaching speech');
    expect(learner?.system).toContain('5-10 action/text objects');
    expect(teacher?.system).not.toContain('Generate natural teaching speech');
    expect(teacher?.system).not.toContain('5-10 action/text objects');
    expect(teacher?.system).toContain('whole-class');
    expect(teacher?.system).toContain('human teacher');
    expect(teacher?.system).toContain('Do not write a spoken lecture');
  });

  it('asks quiz prompts for a whole-class check instead of an AI monologue', async () => {
    const learner = buildPrompt('quiz-actions', { title: 'Check' });
    const teacher = buildPrompt('quiz-actions', {
      title: 'Check',
      teacherMode: true,
      learnerCourse: false,
    });
    expect(learner?.system).toContain('INDEPENDENTLY');
    expect(learner?.system).toContain("I'll be right here after you submit");
    expect(teacher?.system).not.toContain('INDEPENDENTLY');
    expect(teacher?.system).not.toContain("I'll be right here after you submit");
    expect(teacher?.system).toContain('whole-class');
    expect(teacher?.system).toContain('Do not write a spoken monologue');

    const learnerQuiz = buildPrompt('quiz-content', { title: 'Check' });
    expect(learnerQuiz?.system).toContain('shown to the learner');
    expect(learnerQuiz?.system).not.toContain('whole-class projected checks');

    let teacherQuiz = '';
    await generateSceneContent(
      {
        id: 'quiz-1',
        type: 'quiz',
        title: 'Atom check',
        description: 'Check the model',
        keyPoints: ['Protons'],
        order: 1,
        quizConfig: { questionCount: 1, difficulty: 'easy', questionTypes: ['single'] },
      },
      async (system) => {
        teacherQuiz = system;
        return '[]';
      },
      { userRequirements: teacherRequirements() },
    );
    expect(teacherQuiz).toContain('whole-class projected checks');
    expect(teacherQuiz).toContain('not an AI-narrated course');
  });

  it('passes teacher-led flags into slide and quiz action generation', async () => {
    let slideSystem = '';
    await generateSceneActions(
      {
        id: 'slide-1',
        type: 'slide',
        title: 'Atoms',
        description: 'Explain the atom',
        keyPoints: ['Protons'],
        order: 1,
      },
      { elements: [] },
      async (system) => {
        slideSystem = system;
        return '[]';
      },
      { userRequirements: teacherRequirements() },
    );
    expect(slideSystem).toContain('human teacher');
    expect(slideSystem).not.toContain('Generate natural teaching speech');

    let quizSystem = '';
    await generateSceneActions(
      {
        id: 'quiz-1',
        type: 'quiz',
        title: 'Atom check',
        description: 'Check the model',
        keyPoints: ['Protons'],
        order: 2,
      },
      { questions: [] },
      async (system) => {
        quizSystem = system;
        return '[]';
      },
      { userRequirements: teacherRequirements() },
    );
    expect(quizSystem).toContain('whole-class');
    expect(quizSystem).not.toContain('INDEPENDENTLY');
  });
});
