import type { TurnAction } from "./types";

const allowedTransitions: Record<TurnAction, TurnAction[]> = {
  chat: [
    "chat",
    "create_task",
    "update_task",
    "switch_task",
    "ready_to_confirm",
    "generate",
    "analyze_attachment",
    "service_inquiry",
    "one_shot_brief",
  ],
  create_task: ["update_task", "ready_to_confirm", "generate", "chat"],
  update_task: ["update_task", "ready_to_confirm", "generate", "chat"],
  switch_task: ["create_task", "update_task", "ready_to_confirm", "chat"],
  ready_to_confirm: ["generate", "update_task", "chat", "switch_task"],
  generate: ["generate", "update_task", "chat", "switch_task"],
  analyze_attachment: ["analyze_attachment", "chat", "update_task"],
  service_inquiry: ["service_inquiry", "chat", "create_task"],
  one_shot_brief: ["one_shot_brief", "ready_to_confirm", "chat"],
};

export function normalizeActionTransition(
  previous: TurnAction,
  next: TurnAction,
): TurnAction {
  const allowed = allowedTransitions[previous] || [];
  return allowed.includes(next) ? next : "chat";
}

export default { normalizeActionTransition };
