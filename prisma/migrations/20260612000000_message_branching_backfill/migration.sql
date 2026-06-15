-- Backfill legacy (pre-branching) conversations into the message tree so
-- branch-aware reads keep returning their full history.
--
-- 1) Parent chains: every message whose parent_message_id is NULL — except
--    the conversation's earliest message — is chained to its immediate
--    created_at predecessor within the same conversation.
-- 2) Active leaf: conversations without an active_leaf_message_id point it
--    at their latest message.
--
-- Idempotent by construction: both UPDATEs only touch rows whose target
-- column is still NULL, so re-running on backfilled data changes nothing.

WITH ordered AS (
  SELECT
    id,
    LAG(id) OVER (
      PARTITION BY conversation_id
      ORDER BY created_at ASC, id ASC
    ) AS prev_id
  FROM "Message"
)
UPDATE "Message" m
SET "parent_message_id" = o.prev_id
FROM ordered o
WHERE m.id = o.id
  AND m."parent_message_id" IS NULL
  AND o.prev_id IS NOT NULL;

UPDATE "Conversation" c
SET "active_leaf_message_id" = latest.id
FROM (
  SELECT DISTINCT ON (conversation_id) conversation_id, id
  FROM "Message"
  ORDER BY conversation_id, created_at DESC, id DESC
) latest
WHERE c.id = latest.conversation_id
  AND c."active_leaf_message_id" IS NULL;
