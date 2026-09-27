import { describe, expect, it, vi } from 'vitest';
import { toggleTeacherFullscreen } from '@/lib/teacher/fullscreen';

describe('teacher fullscreen fallback', () => {
  it('enters and exits fullscreen through the browser API', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    const element = { requestFullscreen };

    await expect(
      toggleTeacherFullscreen(element, { fullscreenElement: null, exitFullscreen }),
    ).resolves.toBe('entered');
    expect(requestFullscreen).toHaveBeenCalledOnce();

    await expect(
      toggleTeacherFullscreen(element, { fullscreenElement: element, exitFullscreen }),
    ).resolves.toBe('exited');
    expect(exitFullscreen).toHaveBeenCalledOnce();
  });

  it('keeps Teach Mode usable when fullscreen is unsupported or denied', async () => {
    await expect(toggleTeacherFullscreen({}, { fullscreenElement: null })).resolves.toBe(
      'unavailable',
    );
    await expect(
      toggleTeacherFullscreen(
        { requestFullscreen: vi.fn().mockRejectedValue(new Error('denied')) },
        { fullscreenElement: null },
      ),
    ).resolves.toBe('denied');
  });
});
