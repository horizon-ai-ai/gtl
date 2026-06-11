-- Message-level branching: parent_message_id on Message + active_leaf_message_id on Conversation
-- Both columns are nullable. Existing rows stay flat (parent_message_id NULL,
-- active_leaf_message_id NULL) and the read path falls back to created_at order
-- when no leaf is set. New messages will set parent_message_id and bump the leaf.

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "parent_message_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Message_parent_message_id_fkey'
  ) THEN
    ALTER TABLE "Message"
      ADD CONSTRAINT "Message_parent_message_id_fkey"
      FOREIGN KEY ("parent_message_id") REFERENCES "Message"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Message_parent_message_id_idx" ON "Message"("parent_message_id");

ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "active_leaf_message_id" UUID;
