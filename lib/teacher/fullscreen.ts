export type FullscreenToggleResult = 'entered' | 'exited' | 'unavailable' | 'denied';

interface FullscreenDocumentLike {
  readonly fullscreenElement: unknown | null;
  exitFullscreen?: () => Promise<void>;
}

interface FullscreenElementLike {
  requestFullscreen?: () => Promise<void>;
}

export async function toggleTeacherFullscreen(
  element: FullscreenElementLike,
  documentLike: FullscreenDocumentLike = document,
): Promise<FullscreenToggleResult> {
  try {
    if (documentLike.fullscreenElement === element) {
      if (!documentLike.exitFullscreen) return 'unavailable';
      await documentLike.exitFullscreen();
      return 'exited';
    }
    if (!element.requestFullscreen) return 'unavailable';
    await element.requestFullscreen();
    return 'entered';
  } catch {
    return 'denied';
  }
}
