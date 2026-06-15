# post-response-settlement Specification

## Purpose

TBD - created by archiving change 'fix-message-branching-pre-merge-issues'. Update Purpose after archive.

## Requirements

### Requirement: Post-response work is scheduled through the runtime lifecycle extension

Server work that must complete after an API response has been returned (persisting marketing-intelligence results to message metadata and publishing the corresponding ready event) SHALL be scheduled through the serverless runtime's lifecycle-extension mechanism (`waitUntil` from `@vercel/functions`; `after()` from `next/server` once the repo is on a Next version that ships it). The system SHALL NOT rely on a detached promise continuation that the runtime is free to freeze when the response returns.

#### Scenario: Marketing intelligence settles after the response

- **WHEN** a message send returns its response while the marketing-intelligence lookup is still running
- **THEN** the lookup's result is persisted to the assistant message's metadata and the ready event is published, with that work registered via the lifecycle-extension mechanism rather than a detached promise

<!-- @trace
source: fix-message-branching-pre-merge-issues
updated: 2026-06-15
code:
  - src/app/(app)/generate/page.tsx
  - src/app/api/conversations/[id]/messages/route.ts
  - src/lib/conversation/dispatch/text-generation.ts
  - src/lib/conversation/intent-resolver.ts
  - package.json
  - src/lib/conversation/dispatch/shared.ts
  - src/hooks/useConversations.ts
  - src/lib/conversation/edit-lineage.ts
  - .claude_pr7.utf8.diff
tests:
  - src/lib/conversation/dispatch/shared.cancel-merge.test.ts
  - src/app/api/conversations/[id]/messages/route.test.ts
  - src/lib/conversation/dispatch/text-generation.test.ts
  - src/lib/conversation/edit-lineage.test.ts
  - src/hooks/useConversations.stream.test.ts
  - src/hooks/useConversations.pendingCancel.test.tsx
  - src/app/api/conversations/[id]/messages/route.force-generate.test.ts
-->