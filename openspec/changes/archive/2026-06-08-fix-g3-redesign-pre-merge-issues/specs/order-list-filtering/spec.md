## ADDED Requirements

### Requirement: Date filter parameters are validated

The order list endpoint SHALL validate the `date_start`, `date_end`, `quote_date_start`, and `quote_date_end` query parameters before querying. A parameter that does not parse to a valid date SHALL cause the request to fail with a validation error (HTTP 400) and SHALL NOT reach the database layer.

#### Scenario: Malformed date parameter

- **WHEN** a client requests the order list with `date_start=not-a-date`
- **THEN** the system SHALL respond with a validation error (HTTP 400) instead of an internal server error

#### Scenario: Valid date parameters

- **WHEN** a client requests the order list with well-formed `YYYY-MM-DD` date parameters
- **THEN** the system SHALL apply the corresponding date-range filters and return matching orders

### Requirement: End-date filters include the entire selected day

The order list endpoint SHALL treat `date_end` and `quote_date_end` as inclusive of the entire selected day (UTC): records timestamped at any time during the selected end date SHALL match the filter. The implementation SHALL use an exclusive upper bound of the start of the following day rather than the start of the selected day.

#### Scenario: Order created during the end date is included

- **WHEN** a client filters with `date_end=2026-06-07` and an order was created at 2026-06-07T10:00:00Z
- **THEN** the order SHALL appear in the results

##### Example: end-date boundary behavior

| Order created_at (UTC) | date_end | Included |
| ---------------------- | -------- | -------- |
| 2026-06-07T00:00:00Z | 2026-06-07 | yes |
| 2026-06-07T23:59:59Z | 2026-06-07 | yes |
| 2026-06-08T00:00:00Z | 2026-06-07 | no |
