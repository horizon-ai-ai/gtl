## ADDED Requirements

### Requirement: Lifecycle advances validate status transitions and record history

The trade-order lifecycle advance route SHALL NOT write `order.status` directly. Whenever a lifecycle stage advance implies a status change, the route SHALL validate the transition via `assertProjectTransition` against the allowed-transition table and SHALL write an `OrderStatusHistory` row in the same database transaction as the order update. The allowed-transition table SHALL include the trade fulfilment continuations `confirmed -> shipped` and `shipped -> completed`. A stage advance whose implied transition is illegal SHALL fail with a conflict error and SHALL NOT modify the order.

#### Scenario: Admin advances a stage with a legal status transition

- **WHEN** an admin advances a `quoted` trade order to the `order_confirmed` stage
- **THEN** the system SHALL set the order status to `confirmed`, SHALL write an `OrderStatusHistory` row recording `quoted -> confirmed`, and SHALL update `metadata.lifecycle_stage` atomically with the status change

#### Scenario: Stage advance implying an illegal transition is rejected

- **WHEN** an admin advances a trade order to a stage whose mapped status is not reachable from the order's current status in the allowed-transition table
- **THEN** the system SHALL reject the request with a conflict error and SHALL NOT change the order's status, metadata, or history

##### Example: stage-to-status mapping under the extended transition table

| Current status | Target stage | Implied status | Result |
| -------------- | ------------ | -------------- | ------ |
| quoted | order_confirmed | confirmed | allowed, history row quoted -> confirmed |
| confirmed | shipped | shipped | allowed, history row confirmed -> shipped |
| shipped | stocked_inbound | completed | allowed, history row shipped -> completed |
| quoted | shipped | shipped | rejected (quoted -> shipped not allowed) |

### Requirement: Order owners cannot change status through lifecycle advances

The system SHALL NOT allow a non-admin order owner to advance a lifecycle stage that implies an order status change. Non-admin owners SHALL be limited to advancing metadata-only stages (`processing`, `in_transit`, `arrived_warehouse`) by exactly one step forward, and such advances SHALL leave `order.status` unchanged. Stage advances that imply a status change SHALL require the `admin` or `super_admin` role.

#### Scenario: Owner attempts a status-changing stage advance

- **WHEN** an authenticated non-admin owner posts a lifecycle advance targeting `order_confirmed`, `shipped`, or `stocked_inbound`
- **THEN** the system SHALL reject the request with a business-rule error and SHALL NOT change the order's status or metadata

#### Scenario: Owner advances a metadata-only stage

- **WHEN** an authenticated non-admin owner advances the active metadata-only stage (for example `processing`) by one step
- **THEN** the system SHALL update `metadata.lifecycle_stage` and SHALL leave `order.status` unchanged
