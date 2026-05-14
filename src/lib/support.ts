import type { AdminAction } from "@prisma/client";

export type SupportTimelineEntry = {
  id: string;
  kind: "status_update" | "assignment" | "public_reply" | "internal_note" | "user_reply";
  created_at: string;
  actor_label: string;
  body: string;
  visibility: "public" | "internal";
};

export function mapSupportTimeline(actions: AdminAction[], adminLookup: Map<string, string>) {
  return actions
    .map((action) => {
      const payload = (action.payload ?? {}) as Record<string, unknown>;
      const actor = adminLookup.get(action.admin_id) ?? action.admin_id;

      if (action.action === "support_ticket_status_update") {
        return {
          id: action.id,
          kind: "status_update" as const,
          created_at: action.created_at.toISOString(),
          actor_label: actor,
          body: `狀態更新為 ${String(payload.status ?? "")}`,
          visibility: "internal" as const,
        };
      }

      if (action.action === "support_ticket_assign_self") {
        return {
          id: action.id,
          kind: "assignment" as const,
          created_at: action.created_at.toISOString(),
          actor_label: actor,
          body: "已指派給目前管理員",
          visibility: "internal" as const,
        };
      }

      if (action.action === "support_ticket_public_reply") {
        return {
          id: action.id,
          kind: "public_reply" as const,
          created_at: action.created_at.toISOString(),
          actor_label: actor,
          body: String(payload.comment ?? ""),
          visibility: "public" as const,
        };
      }

      if (action.action === "support_ticket_user_reply") {
        return {
          id: action.id,
          kind: "user_reply" as const,
          created_at: action.created_at.toISOString(),
          actor_label: String(payload.author ?? "User"),
          body: String(payload.comment ?? ""),
          visibility: "public" as const,
        };
      }

      return {
        id: action.id,
        kind: "internal_note" as const,
        created_at: action.created_at.toISOString(),
        actor_label: actor,
        body: String(payload.comment ?? action.reason ?? ""),
        visibility: "internal" as const,
      };
    })
    .filter((entry) => entry.body.trim().length > 0);
}

export type SupportSource =
  | { type: "chat"; href: string }
  | { type: "order"; href: string; ref_id: string }
  | { type: "trade_inquiry"; href: string; ref_id: string }
  | { type: "general"; href: null };

function readMetaLine(body: string, key: string) {
  const match = body.match(new RegExp(`^\\[meta\\]\\s*${key}=([^\\n]+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

export function inferSupportSource(ticket: {
  category: string;
  body: string;
  conversation_id?: string | null;
}) : SupportSource {
  const orderId = readMetaLine(ticket.body, "order_id");
  if (orderId) {
    return { type: "order", href: `/orders/${orderId}`, ref_id: orderId };
  }

  const inquiryId = readMetaLine(ticket.body, "inquiry_id");
  if (inquiryId) {
    return { type: "trade_inquiry", href: "/trade", ref_id: inquiryId };
  }

  if (ticket.conversation_id) {
    return { type: "chat", href: `/chat?conversation_id=${ticket.conversation_id}` };
  }

  return { type: "general", href: null };
}
