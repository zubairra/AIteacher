import type { ClaimDecision, StoredMessage, TutorSessionRecord } from './turn-types';

export type { ClaimDecision, StoredMessage, TutorSessionRecord } from './turn-types';

export function decideClaim(input: {
  existing: TutorSessionRecord | null;
  messages: StoredMessage[];
  incoming: TutorSessionRecord;
  userMessage: StoredMessage;
}): ClaimDecision {
  const { existing, incoming, userMessage } = input;
  if (existing && existing.studentUid !== incoming.studentUid) return { kind: 'forbidden' };
  if (existing && existing.grantId !== incoming.grantId) return { kind: 'forbidden' };

  const prior = input.messages.find(
    (message) => message.role === 'user' && message.clientMessageId === userMessage.clientMessageId,
  );
  if (prior && existing) {
    const assistant = input.messages.find(
      (message) => message.role === 'assistant' && message.createdAt >= prior.createdAt,
    );
    if (assistant) {
      return { kind: 'replay', session: existing, userMessage: prior, assistantMessage: assistant };
    }
    if (existing.inflightClientMessageId === userMessage.clientMessageId) return { kind: 'busy' };
    return {
      kind: 'resume',
      session: { ...existing, inflightClientMessageId: userMessage.clientMessageId ?? null },
      userMessage: prior,
    };
  }

  const session: TutorSessionRecord = {
    ...(existing ?? incoming),
    inflightClientMessageId: userMessage.clientMessageId ?? null,
    updatedAt: userMessage.createdAt,
  };
  const messages = [...input.messages, userMessage];
  return { kind: 'start', session, messages, userMessage };
}

export function decideComplete(
  session: TutorSessionRecord,
  messages: StoredMessage[],
  assistant: StoredMessage,
): { session: TutorSessionRecord; messages: StoredMessage[] } {
  return {
    session: {
      ...session,
      inflightClientMessageId: null,
      updatedAt: assistant.createdAt,
      mode: assistant.mode,
    },
    messages: [...messages, assistant],
  };
}

export function decideAbort(session: TutorSessionRecord): TutorSessionRecord {
  return { ...session, inflightClientMessageId: null };
}
