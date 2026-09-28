'use client';
import { Gamepad2, Trash2 } from 'lucide-react';
import { activityTypeLabels, parseNativeActivity } from '@/lib/teacher/native-activities';
import { useStageStore } from '@/lib/store/stage';
export function NativeActivityPreview({
  sceneId,
  definition: raw,
}: {
  sceneId: string;
  definition: unknown;
}) {
  const definition = parseNativeActivity(raw),
    updateScene = useStageStore.use.updateScene();
  if (!definition)
    return raw ? (
      <aside className="absolute right-4 top-20 z-40 rounded-xl bg-amber-100 p-4 text-amber-950">
        Activity data is invalid and will not be presented.
      </aside>
    ) : null;
  const count =
    'questions' in definition
      ? definition.questions.length
      : 'pairs' in definition
        ? definition.pairs.length
        : 'items' in definition
          ? definition.items.length
          : definition.entries.length;
  return (
    <aside
      className="absolute right-4 top-20 z-40 w-72 rounded-2xl border bg-background p-4 shadow-xl"
      aria-label="Native activity preview"
    >
      <div className="flex items-center gap-2">
        <Gamepad2 className="size-5 text-cyan-600" />
        <strong>{definition.title}</strong>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {activityTypeLabels[definition.type]} · {count} items
      </p>
      {definition.instructions ? (
        <p className="mt-2 line-clamp-3 text-sm">{definition.instructions}</p>
      ) : null}
      <button
        type="button"
        onClick={() => updateScene(sceneId, { nativeActivity: undefined })}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold"
      >
        <Trash2 className="size-4" /> Remove Activity
      </button>
    </aside>
  );
}
