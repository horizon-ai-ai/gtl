import type { Message, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

export type MessageWithSiblingMeta = {
  message: Message;
  siblingCount: number;
  siblingIndex: number;
  siblingIds: string[];
};

export type ActivePathResult = {
  messages: Message[];
  metaById: Map<string, { count: number; index: number; ids: string[] }>;
  activeLeafMessageId: string | null;
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function repairedParentMessageId(message: Message, allMessages: Message[]) {
  if (message.message_type !== "generation_result" || !message.parent_message_id) {
    return message.parent_message_id;
  }

  const metadata = recordValue(message.metadata);
  const sourceMessageId = stringValue(metadata.sourceMessageId);
  if (!sourceMessageId || sourceMessageId !== message.parent_message_id) {
    return message.parent_message_id;
  }

  const source = allMessages.find((item) => item.id === sourceMessageId);
  if (!source || source.role !== "assistant") {
    return message.parent_message_id;
  }

  const matchingUser = allMessages
    .filter((item) => {
      if (item.role !== "user") return false;
      if (item.parent_message_id !== source.id) return false;
      if (message.design_task_id && item.design_task_id && item.design_task_id !== message.design_task_id) return false;
      const itemMetadata = recordValue(item.metadata);
      const quickReply = recordValue(itemMetadata.quickReply);
      return stringValue(quickReply.sourceMessageId) === source.id;
    })
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0];

  return matchingUser?.id ?? message.parent_message_id;
}

function siblingsFor(
  message: Message,
  byId: Map<string, Message>,
  childrenByParent: Map<string | null, Message[]>,
  rootSiblings: Message[],
) {
  const parentId = message.parent_message_id;
  const group =
    parentId && byId.has(parentId)
      ? childrenByParent.get(parentId) ?? []
      : rootSiblings;
  const sorted = group
    .slice()
    .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
  const ids = sorted.map((m) => m.id);
  return {
    count: sorted.length,
    index: Math.max(0, sorted.findIndex((m) => m.id === message.id)),
    ids,
  };
}

/**
 * Walk the active branch from the conversation's active_leaf_message_id back
 * to a root (parent_message_id null) and return that chain plus sibling
 * metadata for each message on the chain.
 *
 * If active_leaf_message_id is null OR points at a message that no longer
 * exists, fall back to created_at order over the whole conversation — this
 * preserves behavior for legacy rows that predate branching.
 */
export async function loadActivePathMessages(
  conversationId: string,
): Promise<ActivePathResult> {
  const [conversation, allMessages] = await Promise.all([
    prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { active_leaf_message_id: true },
    }),
    prisma.message.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: "asc" },
    }),
  ]);

  const normalizedMessages = allMessages.map((message) => {
    const parentMessageId = repairedParentMessageId(message, allMessages);
    return parentMessageId === message.parent_message_id
      ? message
      : ({ ...message, parent_message_id: parentMessageId } as Message);
  });

  const byId = new Map<string, Message>();
  const childrenByParent = new Map<string | null, Message[]>();
  for (const m of normalizedMessages) {
    byId.set(m.id, m);
    const list = childrenByParent.get(m.parent_message_id) ?? [];
    list.push(m);
    childrenByParent.set(m.parent_message_id, list);
  }
  const rootSiblings = (childrenByParent.get(null) ?? []).filter((message) => message.role === "user");

  const leafId = conversation?.active_leaf_message_id ?? null;
  let chain: Message[];
  if (leafId && byId.has(leafId)) {
    const walked: Message[] = [];
    const seen = new Set<string>();
    let cursorId: string | null = leafId;
    while (cursorId && !seen.has(cursorId)) {
      seen.add(cursorId);
      const current = byId.get(cursorId);
      if (!current) break;
      walked.push(current);
      cursorId = current.parent_message_id;
    }
    chain = walked.reverse();
  } else {
    chain = normalizedMessages;
  }

  const metaById = new Map<string, { count: number; index: number; ids: string[] }>();
  for (const message of chain) {
    metaById.set(
      message.id,
      siblingsFor(message, byId, childrenByParent, rootSiblings),
    );
  }

  return {
    messages: chain,
    metaById,
    activeLeafMessageId: leafId,
  };
}

/**
 * Walk down from a message to the deepest descendant on the most-recently
 * created child path. Used by the switch endpoint to pick a leaf after the
 * user clicks ‹ or ›.
 */
export async function resolveDeepestLeaf(
  conversationId: string,
  fromMessageId: string,
): Promise<string> {
  const all = await prisma.message.findMany({
    where: { conversation_id: conversationId },
    select: { id: true, parent_message_id: true, created_at: true },
    orderBy: { created_at: "asc" },
  });

  const childrenByParent = new Map<string, { id: string; created_at: Date }[]>();
  for (const m of all) {
    if (!m.parent_message_id) continue;
    const list = childrenByParent.get(m.parent_message_id) ?? [];
    list.push({ id: m.id, created_at: m.created_at });
    childrenByParent.set(m.parent_message_id, list);
  }

  let cursorId = fromMessageId;
  const seen = new Set<string>();
  while (!seen.has(cursorId)) {
    seen.add(cursorId);
    const children = childrenByParent.get(cursorId);
    if (!children || children.length === 0) break;
    const newest = children.reduce((a, b) =>
      a.created_at.getTime() >= b.created_at.getTime() ? a : b,
    );
    cursorId = newest.id;
  }
  return cursorId;
}

export type AppendMessageData = Omit<
  Prisma.MessageUncheckedCreateInput,
  "conversation_id" | "parent_message_id"
>;

export type AppendMessageOptions = {
  /**
   * Explicit parent for sibling-creating flows (edits, regenerations).
   * Omit (or pass undefined) to default to the conversation's current active
   * leaf — appended messages must never detach from the tree when the
   * conversation already has messages. Passing null explicitly creates a
   * root message (sibling of a root, e.g. editing the first message).
   */
  parentMessageId?: string | null;
};

/**
 * Single append primitive for conversation messages. Owns the two-part
 * branch invariant: (a) the new message's parent defaults to the
 * conversation's current active leaf, and (b) the message create plus the
 * active_leaf_message_id bump happen inside ONE transaction, with the leaf
 * re-read inside the transaction so concurrent sends serialize. A transaction
 * failure leaves both the message and the leaf unchanged.
 */
export async function appendMessage(
  conversationId: string,
  data: AppendMessageData,
  options?: AppendMessageOptions,
): Promise<Message> {
  return prisma.$transaction(async (tx) => {
    // undefined → default append; null → explicit root; string → explicit parent.
    const explicitParent = options?.parentMessageId;
    let parentMessageId: string | null = explicitParent ?? null;
    let useDefault = explicitParent === undefined;
    if (parentMessageId) {
      // Guard against dangling explicit parents (e.g. a placeholder deleted
      // by a concurrent path): fall back to the default-append rules below.
      const parent = await tx.message.findFirst({
        where: { id: parentMessageId, conversation_id: conversationId },
        select: { id: true },
      });
      parentMessageId = parent?.id ?? null;
      if (!parentMessageId) useDefault = true;
    }
    if (useDefault && !parentMessageId) {
      const conversation = await tx.conversation.findUnique({
        where: { id: conversationId },
        select: { active_leaf_message_id: true },
      });
      const leafId = conversation?.active_leaf_message_id ?? null;
      if (leafId) {
        const leaf = await tx.message.findFirst({
          where: { id: leafId, conversation_id: conversationId },
          select: { id: true },
        });
        parentMessageId = leaf?.id ?? null;
      }
      if (!parentMessageId) {
        // Legacy conversation without a leaf pointer (or a dangling leaf):
        // chain onto the latest message by created_at.
        const latest = await tx.message.findFirst({
          where: { conversation_id: conversationId },
          select: { id: true },
          orderBy: { created_at: "desc" },
        });
        parentMessageId = latest?.id ?? null;
      }
    }

    const message = await tx.message.create({
      data: {
        ...data,
        conversation_id: conversationId,
        parent_message_id: parentMessageId,
      } as Prisma.MessageUncheckedCreateInput,
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { active_leaf_message_id: message.id },
    });
    return message;
  });
}

export async function resolveSiblingParentMessageId(
  conversationId: string,
  messageId: string,
) {
  const source = await prisma.message.findFirst({
    where: { id: messageId, conversation_id: conversationId },
    select: { id: true, parent_message_id: true, created_at: true },
  });
  if (!source) return null;
  if (source.parent_message_id) return source.parent_message_id;

  const previous = await prisma.message.findFirst({
    where: {
      conversation_id: conversationId,
      created_at: { lt: source.created_at },
    },
    select: { id: true },
    orderBy: { created_at: "desc" },
  });
  if (!previous?.id) return null;

  await prisma.message.updateMany({
    where: {
      id: source.id,
      conversation_id: conversationId,
      parent_message_id: null,
    },
    data: { parent_message_id: previous.id },
  });
  return previous.id;
}
