import { nanoid } from 'nanoid';

import { callLLM, streamLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { isTutorMode } from '@/lib/student/types';
import { apiError } from '@/lib/server/api-response';
import { normalizeLlmError } from '@/lib/server/llm-error-response';
import { ProviderSetupError } from '@/lib/server/provider-setup-error';
import { resolveSignedInTeacherModel } from '@/lib/server/resolve-model';
import { isGrantId } from '@/lib/student/nav';
import { studentStore } from '@/lib/server/student/firestore-store';
import { isUser, requireStudentRequest, reserveStudentTutorQuota } from '@/lib/server/student/http';
import {
  streamTutorTurn,
  submitTutorTurn,
  type TurnFailure,
} from '@/lib/server/student/tutor-turn';

export const runtime = 'nodejs';

const log = createLogger('Student Tutor');

function turnError(result: TurnFailure) {
  const code =
    result.status === 429
      ? 'RATE_LIMITED'
      : result.status === 403
        ? 'FORBIDDEN'
        : result.status === 401
          ? 'UNAUTHENTICATED'
          : result.status >= 500
            ? 'UPSTREAM_ERROR'
            : 'INVALID_REQUEST';
  return apiError(code, result.status === 499 ? 400 : result.status, result.error);
}

function combineSignals(left: AbortSignal, right: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (left.aborted || right.aborted) {
    controller.abort();
    return controller.signal;
  }
  left.addEventListener('abort', abort, { once: true });
  right.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

export async function POST(request: Request, context: { params: Promise<{ grantId: string }> }) {
  const user = await requireStudentRequest(request, true);
  if (!isUser(user)) return user;
  const { grantId } = await context.params;
  if (!isGrantId(grantId))
    return apiError('INVALID_REQUEST', 404, 'That lesson is not on your account.');
  const body = (await request.json().catch(() => null)) as {
    mode?: unknown;
    text?: unknown;
    clientMessageId?: unknown;
    sessionId?: unknown;
  } | null;
  if (!body || !isTutorMode(body.mode) || typeof body.text !== 'string') {
    return apiError('INVALID_REQUEST', 400, 'Choose a tutor mode and write a message.');
  }
  if (body.sessionId !== undefined && typeof body.sessionId !== 'string') {
    return apiError('INVALID_REQUEST', 400, 'That conversation was not found.');
  }
  if (typeof body.clientMessageId !== 'string') {
    return apiError('INVALID_REQUEST', 400, 'That message could not be saved.');
  }

  const store = studentStore();
  const grant = await store.getGrant(user.id, grantId);
  if (!grant || grant.studentUid !== user.id) {
    return apiError('INVALID_REQUEST', 404, 'That lesson is not on your account.');
  }

  let resolved;
  try {
    resolved = await resolveSignedInTeacherModel(grant.teacherUid);
  } catch (error) {
    if (error instanceof ProviderSetupError) {
      return apiError(
        'AI_PROVIDER_SETUP_REQUIRED',
        503,
        'The tutor is not available yet. A teacher needs to save an AI key, or the server needs its OpenRouter key.',
      );
    }
    log.error('Tutor model resolution failed');
    return apiError('INTERNAL_ERROR', 503, 'The tutor is not available right now.');
  }

  const signal = combineSignals(request.signal, AbortSignal.timeout(45_000));
  const deps = {
    store,
    reserve: reserveStudentTutorQuota,
    now: () => Date.now(),
    newId: (prefix: string) => `${prefix}_${nanoid(16)}`,
    onError: (error: unknown) => {
      log.error(`Tutor provider failed [code=${normalizeLlmError(error).code}]`);
    },
    model: {
      async generate(input: {
        system: string;
        messages: { role: 'user' | 'assistant'; content: string }[];
        signal?: AbortSignal;
      }) {
        const result = await callLLM(
          {
            model: resolved.model,
            messages: [{ role: 'system' as const, content: input.system }, ...input.messages],
            abortSignal: input.signal ?? signal,
          },
          'student-tutor',
          undefined,
          resolved.thinkingConfig,
        );
        return result.text ?? '';
      },
      async *stream(input: {
        system: string;
        messages: { role: 'user' | 'assistant'; content: string }[];
        signal?: AbortSignal;
      }) {
        const result = streamLLM(
          {
            model: resolved.model,
            messages: [{ role: 'system' as const, content: input.system }, ...input.messages],
            abortSignal: input.signal ?? signal,
          },
          'student-tutor',
          resolved.thinkingConfig,
        );
        for await (const chunk of result.textStream) yield chunk;
      },
    },
  };
  const turnInput = {
    studentUid: user.id,
    studentName: user.name,
    grantId,
    sessionId: body.sessionId,
    mode: body.mode,
    text: body.text,
    clientMessageId: body.clientMessageId,
    signal,
  };

  if (body.mode === 'explain' || body.mode === 'step') {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (value: unknown) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        };
        try {
          const result = await streamTutorTurn(deps, turnInput, (text) =>
            send({ type: 'delta', text }),
          );
          if (!result.ok) send({ type: 'error', error: result.error, errorCode: result.code });
          else {
            send({
              type: 'done',
              sessionId: result.sessionId,
              userMessage: result.userMessage,
              assistantMessage: result.assistantMessage,
            });
          }
        } catch {
          log.error('Tutor stream failed');
          send({
            type: 'error',
            error: 'The tutor could not reply. Try again.',
            errorCode: 'PROVIDER',
          });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  const result = await submitTutorTurn(deps, turnInput);
  if (!result.ok) return turnError(result);
  return Response.json(
    {
      success: true,
      sessionId: result.sessionId,
      userMessage: result.userMessage,
      assistantMessage: result.assistantMessage,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
