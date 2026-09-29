'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Paperclip, Sparkles } from 'lucide-react';
import { nanoid } from 'nanoid';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { SettingsDialog } from '@/components/settings';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/lib/store/settings';
import {
  courseMaterialFingerprint,
  dedupeCourseMaterialFiles,
} from '@/lib/document/course-materials';
import type { SettingsSection } from '@/lib/types/settings';
import type { SelectedCourseMaterial } from '@/lib/types/generation';
import {
  teacherLessonRequestSchema,
  TEACHING_STYLE_LABELS,
  type TeachingStyle,
} from '@/lib/teacher/lesson-request';
import { createTeacherGenerationSession } from '@/lib/teacher/generation-session';

const SUBJECTS = [
  'Mathematics',
  'Science',
  'Physics',
  'Chemistry',
  'Biology',
  'English',
  'History',
  'Geography',
  'Computer Science',
  'Other',
];
const GRADES = [...Array.from({ length: 12 }, (_, index) => `Grade ${index + 1}`), 'Other'];
const CURRICULA = ['Not specified', 'CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge', 'Other'];
const DURATIONS = [20, 30, 40, 45, 60] as const;

type FieldErrors = Partial<
  Record<'subject' | 'grade' | 'topic' | 'durationMinutes' | 'curriculum', string>
>;

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">
        {label}
        {required ? (
          <span className="ml-1 text-red-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const controlClass =
  'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base shadow-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-violet-900';

export function CreateLessonForm() {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [customGrade, setCustomGrade] = useState('');
  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState('40');
  const [customDuration, setCustomDuration] = useState('');
  const [curriculum, setCurriculum] = useState('Not specified');
  const [customCurriculum, setCustomCurriculum] = useState('');
  const [teachingStyle, setTeachingStyle] = useState<TeachingStyle>('balanced');
  const [materials, setMaterials] = useState<SelectedCourseMaterial[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>();

  const addMaterials = (files: File[]) => {
    if (generating) return;
    const deduped = dedupeCourseMaterialFiles(materials, files);
    const additions = deduped.map((file, index) => ({
      id: nanoid(8),
      file,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      type: file.type,
      order: materials.length + index + 1,
    }));
    setMaterials((current) => {
      const missing = additions.filter(
        (addition) =>
          !current.some(
            (item) => courseMaterialFingerprint(item) === courseMaterialFingerprint(addition),
          ),
      );
      return [...current, ...missing];
    });
  };

  const removeMaterial = (id: string) => {
    if (generating) return;
    setMaterials((current) =>
      current
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, order: index + 1 })),
    );
  };

  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section);
    setSettingsOpen(true);
  };

  const handleGenerate = async () => {
    if (generating) return;
    const selectedSubject = subject === 'Other' ? customSubject : subject;
    const selectedGrade = grade === 'Other' ? customGrade : grade;
    const selectedCurriculum = curriculum === 'Other' ? customCurriculum : curriculum;
    const durationMinutes = Number(duration === 'custom' ? customDuration : duration);
    const parsed = teacherLessonRequestSchema.safeParse({
      subject: selectedSubject,
      grade: selectedGrade,
      topic,
      durationMinutes,
      curriculum: selectedCurriculum,
      teachingStyle,
    });

    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        if (!next[field]) next[field] = issue.message;
      }
      setErrors(next);
      setGeneralError('Please check the highlighted lesson details.');
      return;
    }

    const providerResponse = await fetch('/api/teacher/providers', { cache: 'no-store' });
    if (!providerResponse.ok) {
      setGeneralError('AI provider setup required. Add an API key once to generate lessons.');
      return;
    }
    const providerState = (await providerResponse.json()) as {
      credentials?: Array<{ configured: boolean }>;
      preference?: { providerId: string | null };
    };
    if (
      !providerState.preference?.providerId ||
      !providerState.credentials?.some((item) => item.configured)
    ) {
      setGeneralError('AI provider setup required. Add an API key once to generate lessons.');
      return;
    }

    const settings = useSettingsStore.getState();

    setErrors({});
    setGeneralError(null);
    setGenerating(true);
    try {
      const pdfConfig = settings.pdfProvidersConfig?.[settings.pdfProviderId];
      const session = await createTeacherGenerationSession(parsed.data, materials, {
        webSearch: settings.webSearchEnabled,
        pdfProviderId: settings.pdfProviderId,
        pdfProviderConfig: pdfConfig
          ? {
              apiKey: pdfConfig.apiKey,
              baseUrl: pdfConfig.baseUrl,
              accessKeyId: pdfConfig.accessKeyId,
              accessKeySecret: pdfConfig.accessKeySecret,
            }
          : undefined,
      });
      sessionStorage.setItem('generationSession', JSON.stringify(session));
      router.push('/generation-preview');
    } catch (cause) {
      setGeneralError(
        cause instanceof Error ? cause.message : 'Could not prepare lesson generation.',
      );
      setGenerating(false);
    }
  };

  return (
    <>
      <form
        className="space-y-8"
        onSubmit={(event) => {
          event.preventDefault();
          void handleGenerate();
        }}
        noValidate
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Subject" required error={errors.subject}>
            <select
              aria-label="Subject"
              className={controlClass}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              disabled={generating}
            >
              <option value="">Select a subject</option>
              {SUBJECTS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            {subject === 'Other' ? (
              <input
                aria-label="Custom subject"
                className={`${controlClass} mt-2`}
                value={customSubject}
                onChange={(event) => setCustomSubject(event.target.value)}
                placeholder="Enter subject"
                disabled={generating}
              />
            ) : null}
          </Field>
          <Field label="Grade" required error={errors.grade}>
            <select
              aria-label="Grade"
              className={controlClass}
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              disabled={generating}
            >
              <option value="">Select a grade</option>
              {GRADES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            {grade === 'Other' ? (
              <input
                aria-label="Custom grade"
                className={`${controlClass} mt-2`}
                value={customGrade}
                onChange={(event) => setCustomGrade(event.target.value)}
                placeholder="Enter grade or level"
                disabled={generating}
              />
            ) : null}
          </Field>
        </div>

        <Field label="Topic" required error={errors.topic}>
          <input
            aria-label="Topic"
            className={controlClass}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Structure of the Atom"
            disabled={generating}
          />
        </Field>

        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Duration" required error={errors.durationMinutes}>
            <select
              aria-label="Duration"
              className={controlClass}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              disabled={generating}
            >
              {DURATIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
            {duration === 'custom' ? (
              <input
                aria-label="Custom duration in minutes"
                className={`${controlClass} mt-2`}
                type="number"
                min={10}
                max={180}
                step={1}
                value={customDuration}
                onChange={(event) => setCustomDuration(event.target.value)}
                placeholder="Minutes"
                disabled={generating}
              />
            ) : null}
          </Field>
          <Field label="Curriculum" error={errors.curriculum}>
            <select
              aria-label="Curriculum"
              className={controlClass}
              value={curriculum}
              onChange={(event) => setCurriculum(event.target.value)}
              disabled={generating}
            >
              {CURRICULA.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            {curriculum === 'Other' ? (
              <input
                aria-label="Custom curriculum"
                className={`${controlClass} mt-2`}
                value={customCurriculum}
                onChange={(event) => setCustomCurriculum(event.target.value)}
                placeholder="Enter curriculum"
                disabled={generating}
              />
            ) : null}
          </Field>
        </div>

        <fieldset>
          <legend className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Teaching style
          </legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(Object.entries(TEACHING_STYLE_LABELS) as [TeachingStyle, string][]).map(
              ([value, label]) => (
                <label
                  key={value}
                  className={`flex min-h-12 cursor-pointer items-center rounded-xl border px-4 text-sm font-medium transition ${teachingStyle === value ? 'border-violet-500 bg-violet-50 text-violet-800 ring-2 ring-violet-100 dark:bg-violet-950/50 dark:text-violet-100 dark:ring-violet-900' : 'border-slate-300 bg-white hover:border-violet-300 dark:border-slate-700 dark:bg-slate-950'}`}
                >
                  <input
                    className="mr-2 accent-violet-600"
                    type="radio"
                    name="teachingStyle"
                    value={value}
                    checked={teachingStyle === value}
                    onChange={() => setTeachingStyle(value)}
                    disabled={generating}
                  />
                  {label}
                </label>
              ),
            )}
          </div>
        </fieldset>

        <section
          className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950/50"
          aria-labelledby="materials-heading"
        >
          <div className="flex items-start gap-3">
            <Paperclip className="mt-0.5 size-5 text-violet-600" aria-hidden="true" />
            <div>
              <h2 id="materials-heading" className="font-semibold">
                Teaching materials <span className="font-normal text-slate-500">(optional)</span>
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Add textbook pages, notes, images, or an existing presentation.
              </p>
              <div className="mt-3">
                <GenerationToolbar
                  courseMaterials={materials}
                  onCourseMaterialsAdd={addMaterials}
                  onCourseMaterialRemove={removeMaterial}
                  onPdfError={setGeneralError}
                  materialsLocked={generating}
                  onSettingsOpen={openSettings}
                />
              </div>
            </div>
          </div>
        </section>

        {generalError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {generalError}
            {generalError.startsWith('AI provider setup required') ? (
              <button
                type="button"
                className="ml-3 font-semibold underline underline-offset-4"
                onClick={() => router.push('/settings')}
              >
                Configure AI
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            type="submit"
            size="lg"
            className="min-h-13 rounded-xl px-7 text-base"
            disabled={generating}
          >
            {generating ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-5" aria-hidden="true" />
            )}
            {generating ? 'Preparing lesson…' : 'Generate Lesson'}
          </Button>
        </div>
      </form>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsSection(undefined);
        }}
        initialSection={settingsSection}
      />
    </>
  );
}
