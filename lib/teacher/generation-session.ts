import { nanoid } from 'nanoid';
import { deleteDocumentBlob, storeDocumentBlob } from '@/lib/utils/image-storage';
import { normalizeDocumentMimeType } from '@/lib/document/mime';
import type { SelectedCourseMaterial, SessionDocumentSource } from '@/lib/types/generation';
import type { GenerationSessionState } from '@/app/generation-preview/types';
import {
  compileTeacherLessonRequirement,
  normalizeTeacherLessonRequest,
  toTeacherLessonMetadata,
  type TeacherLessonRequest,
} from './lesson-request';

export interface TeacherGenerationSettings {
  webSearch?: boolean;
  pdfProviderId?: string;
  pdfProviderConfig?: {
    apiKey?: string;
    baseUrl?: string;
    accessKeyId?: string;
    accessKeySecret?: string;
  };
}

/** Build the existing OpenMAIC generation session without creating a parallel pipeline. */
export async function createTeacherGenerationSession(
  request: TeacherLessonRequest,
  materials: SelectedCourseMaterial[],
  settings: TeacherGenerationSettings,
): Promise<GenerationSessionState> {
  const materialReferences = materials.map((material) => material.name);
  const normalizedRequest = normalizeTeacherLessonRequest({
    ...request,
    ...(materialReferences.length > 0 ? { materialReferences } : {}),
  });
  const frozenMaterials = [...materials].sort((a, b) => a.order - b.order);
  const storedDocumentKeys: string[] = [];

  try {
    const documentSources: SessionDocumentSource[] = [];
    for (const [index, item] of frozenMaterials.entries()) {
      const storageKey = await storeDocumentBlob(item.file);
      storedDocumentKeys.push(storageKey);
      documentSources.push({
        id: item.id,
        name: item.name,
        size: item.size,
        lastModified: item.lastModified,
        mimeType: normalizeDocumentMimeType({
          mimeType: item.file.type,
          fileName: item.file.name,
        }),
        order: index + 1,
        storageKey,
        providerId: settings.pdfProviderId,
      });
    }

    return {
      sessionId: nanoid(),
      requirements: {
        requirement: compileTeacherLessonRequirement(normalizedRequest),
        generationMode: 'teacher-led',
        teacherLesson: toTeacherLessonMetadata(normalizedRequest),
        webSearch: settings.webSearch || undefined,
      },
      pdfText: '',
      pdfImages: [],
      imageStorageIds: [],
      documentSources: documentSources.length > 0 ? documentSources : undefined,
      pdfStorageKey: documentSources[0]?.storageKey,
      pdfFileName: documentSources[0]?.name,
      documentMimeType: documentSources[0]?.mimeType,
      pdfProviderId: documentSources.length > 0 ? settings.pdfProviderId : undefined,
      pdfProviderConfig: documentSources.length > 0 ? settings.pdfProviderConfig : undefined,
      sceneOutlines: null,
      currentStep: 'generating',
    };
  } catch (error) {
    await Promise.allSettled(storedDocumentKeys.map((key) => deleteDocumentBlob(key)));
    throw error;
  }
}
