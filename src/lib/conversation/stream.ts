type ConversationEvent = {
  id: string;
  type: string;
  payload: unknown;
  createdAt: string;
};

type Subscriber = {
  send: (event: ConversationEvent) => void;
};

const subscribers = new Map<string, Set<Subscriber>>();
const recentEvents = new Map<string, ConversationEvent[]>();
const RECENT_LIMIT = 40;

function eventId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function publishConversationEvent(conversationId: string, type: string, payload: unknown) {
  const event: ConversationEvent = {
    id: eventId(),
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
  const recent = recentEvents.get(conversationId) ?? [];
  recent.push(event);
  recentEvents.set(conversationId, recent.slice(-RECENT_LIMIT));

  const listeners = subscribers.get(conversationId);
  if (!listeners) return;
  for (const listener of listeners) listener.send(event);
}

export function subscribeConversationEvents(
  conversationId: string,
  subscriber: Subscriber,
  options?: { replayRecent?: boolean },
) {
  const listeners = subscribers.get(conversationId) ?? new Set<Subscriber>();
  listeners.add(subscriber);
  subscribers.set(conversationId, listeners);

  if (options?.replayRecent !== false) {
    for (const event of recentEvents.get(conversationId) ?? []) {
      subscriber.send(event);
    }
  }

  return () => {
    const current = subscribers.get(conversationId);
    if (!current) return;
    current.delete(subscriber);
    if (current.size === 0) subscribers.delete(conversationId);
  };
}
