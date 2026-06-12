export type LineageMessageRef = {
  id: string;
  parentMessageId?: string | null;
};

export type LineageGenerationRef = {
  messageId: string;
  sourceMessageId?: string | null;
};

/**
 * Decide whether editing a user message may trigger a paid regeneration of
 * the target generation. True only when the edited message is the
 * generation's recorded instruction message (sourceMessageId) or an ancestor
 * on the generation's branch path, walked over the already-loaded client
 * messages.
 *
 * Conservative by design: a false negative costs the user one click on the
 * existing regenerate affordance; a false positive costs credits.
 */
export function isEditWithinGenerationLineage(params: {
  editedMessageId: string;
  generation: LineageGenerationRef | null | undefined;
  messages: LineageMessageRef[];
}): boolean {
  const { editedMessageId, generation, messages } = params;
  if (!editedMessageId || !generation) return false;
  if (generation.sourceMessageId && generation.sourceMessageId === editedMessageId) {
    return true;
  }

  const byId = new Map(messages.map((message) => [message.id, message]));
  const start =
    byId.get(generation.messageId) ??
    (generation.sourceMessageId ? byId.get(generation.sourceMessageId) : undefined) ??
    null;

  const seen = new Set<string>();
  let cursor: LineageMessageRef | null = start;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (cursor.id === editedMessageId) return true;
    const parentId = cursor.parentMessageId ?? null;
    cursor = parentId ? byId.get(parentId) ?? null : null;
  }
  return false;
}
