# generation-cancellation Specification (delta)

## ADDED Requirements

### Requirement: Stop before server acknowledgment still cancels server work

When the user stops an in-flight send before the server-assigned assistant message id is known, the client SHALL record a pending cancellation and SHALL issue the server-side cancel as soon as the server message id becomes available (from the send response or a server event). The client-side abort and optimistic message removal SHALL be preserved.

#### Scenario: Stop during the local placeholder phase

- **WHEN** the user stops a send while the assistant message is still a local placeholder, and the server message id subsequently arrives
- **THEN** the client issues the server cancel for that message id and the generation ends as cancelled rather than completing and consuming credits

#### Scenario: Send fails before any server id exists

- **WHEN** the user stops a send and the request fails without ever producing a server message id
- **THEN** the pending cancellation is discarded with the existing abort cleanup and no cancel call is issued

### Requirement: Cancellation requests survive concurrent streaming writes

A cancellation flag written while a generation is streaming SHALL NOT be lost to concurrent metadata writes from the streaming flush path. Every streaming-path metadata write SHALL preserve cancellation state recorded after the writer's in-memory snapshot was taken, and the streaming loop SHALL observe the flag and terminate the generation as cancelled. This SHALL hold on every streaming persistence path, including the legacy streaming path.

#### Scenario: Cancel lands between two streaming flushes

- **WHEN** the cancel endpoint records a cancellation while a streaming generation is between flushes
- **THEN** the next flush does not erase the cancellation state and the generation terminates as cancelled instead of completing and billing
