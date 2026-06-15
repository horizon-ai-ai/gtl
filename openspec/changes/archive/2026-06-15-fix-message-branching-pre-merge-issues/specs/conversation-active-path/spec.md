# conversation-active-path Specification (delta)

## ADDED Requirements

### Requirement: Root messages are never siblings of each other

The active-path loader SHALL treat every message whose `parent_message_id` is NULL as a singleton sibling group (count 1, index 0, ids containing only the message itself). The system SHALL NOT group root-level messages of a conversation into a shared sibling set, and the client SHALL therefore never render a version pager on a root message.

#### Scenario: Legacy flat conversation shows no version arrows

- **WHEN** a conversation whose messages all have NULL `parent_message_id` is loaded
- **THEN** every message reports sibling count 1 and no version pager is rendered

#### Scenario: True siblings still paginate

- **WHEN** two user messages share the same non-NULL `parent_message_id`
- **THEN** both report sibling count 2 with their ids in the sibling list

### Requirement: Legacy conversations are backfilled into the message tree

A migration SHALL backfill existing data so that branch-aware reads return full history: for each conversation, every message with a NULL `parent_message_id` except the conversation's earliest message SHALL receive the immediately preceding message (by `created_at` ascending) as its parent, and `active_leaf_message_id` SHALL be set to the conversation's latest message. The backfill SHALL be idempotent: applying it to already-backfilled data SHALL change nothing.

#### Scenario: Full history survives the first post-deploy message

- **WHEN** a user sends a new message in a conversation created before the branching migration
- **THEN** a subsequent conversation read returns all pre-migration messages followed by the new exchange

##### Example: five-message legacy conversation

- **GIVEN** a legacy conversation with messages m1..m5 (all NULL parent), created in that order
- **WHEN** the backfill runs and the user then sends m6
- **THEN** parents are m2→m1, m3→m2, m4→m3, m5→m4, m6→m5 and the conversation read returns m1..m6

### Requirement: All conversation-message writers preserve the append invariant

Every code path that persists a conversation message SHALL go through a single append primitive that (a) defaults the message's parent to the conversation's current `active_leaf_message_id` when no explicit parent is supplied, and (b) creates the message and updates `active_leaf_message_id` atomically in one database transaction. Writers SHALL NOT create conversation messages with an unset parent in a conversation that has an active leaf, and SHALL NOT leave `active_leaf_message_id` pointing away from the newly appended message in the default append case.

#### Scenario: Order confirmation message stays visible

- **WHEN** an order is submitted with a `conversation_id` after the conversation already has an active leaf
- **THEN** the order confirmation message is returned by subsequent conversation reads

#### Scenario: Chat route messages stay visible

- **WHEN** user and assistant messages are persisted through the chat messages route
- **THEN** both messages appear in subsequent branch-aware conversation reads

#### Scenario: Concurrent sends serialize on the leaf

- **WHEN** two message sends for the same conversation commit concurrently
- **THEN** the second committed message has the first committed exchange on its parent chain, and the conversation read returns both exchanges

### Requirement: LLM context is built from the active path

Server-side history used for intent inference and assistant prompt construction SHALL contain only messages on the conversation's active path. Messages on abandoned branches (for example, the pre-edit version of an edited message and its replies) SHALL NOT appear in the prompt context.

#### Scenario: Edited-away branch is excluded from the prompt

- **WHEN** a user edits a previous message (creating a sibling branch) and then sends a new message
- **THEN** the history fed to intent inference and prompt construction contains the edited version and not the original message or its abandoned reply
