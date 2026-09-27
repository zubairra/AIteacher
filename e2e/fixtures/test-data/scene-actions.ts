import { defaultTheme } from './scene-content';
import type { SceneOutline } from '../../../lib/types/generation';

/** Mock response for POST /api/generate/scene-actions */
export function createMockSceneActionsResponse(stageId: string, outline?: SceneOutline) {
  const order = outline?.order ?? 0;
  const title = outline?.title ?? '光合作用的基本概念';
  return {
    success: true,
    scene: {
      id: `scene-${order}`,
      stageId,
      type: 'slide',
      title,
      order,
      ...(outline?.teacherNotes ? { teacherNotes: outline.teacherNotes } : {}),
      content: {
        type: 'slide',
        canvas: {
          id: `slide-${order}`,
          viewportSize: 1000,
          viewportRatio: 0.5625,
          theme: defaultTheme,
          elements: [
            {
              type: 'text',
              id: `title-el-${order}`,
              content: title,
              left: 50,
              top: 50,
              width: 900,
              height: 100,
            },
          ],
        },
      },
      actions: [
        {
          id: `action-${order}`,
          type: 'speech',
          agent: 'teacher',
          text: `Introduce ${title}.`,
        },
      ],
    },
    previousSpeeches: [],
  };
}
