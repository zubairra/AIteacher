import { TeacherProviderSettings } from '@/components/teacher/TeacherProviderSettings';

export default function TeacherSettingsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight">AI Providers</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Configure the AI provider used for lesson generation. Credentials are private to your teacher account.</p>
      <div className="mt-8"><TeacherProviderSettings /></div>
    </div>
  );
}
