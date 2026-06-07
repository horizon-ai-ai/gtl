# order-list-filtering Specification

## Purpose

TBD - created by archiving change 'fix-g3-redesign-pre-merge-issues'. Update Purpose after archive.

## Requirements

### Requirement: Date filter parameters are validated

The order list endpoint SHALL validate the `date_start`, `date_end`, `quote_date_start`, and `quote_date_end` query parameters before querying. A parameter that does not parse to a valid date SHALL cause the request to fail with a validation error (HTTP 400) and SHALL NOT reach the database layer.

#### Scenario: Malformed date parameter

- **WHEN** a client requests the order list with `date_start=not-a-date`
- **THEN** the system SHALL respond with a validation error (HTTP 400) instead of an internal server error

#### Scenario: Valid date parameters

- **WHEN** a client requests the order list with well-formed `YYYY-MM-DD` date parameters
- **THEN** the system SHALL apply the corresponding date-range filters and return matching orders


<!-- @trace
source: fix-g3-redesign-pre-merge-issues
updated: 2026-06-08
code:
  - docs/19_修復說明_對話移植審查.html
  - docs/19_修復說明_對話移植審查.pdf
  - src/app/globals.css
  - src/app/admin/trade/quotations/page.tsx
  - docs/19_修復說明_對話移植審查_表格版.pdf
  - src/components/app/hero-breathing.tsx
  - src/app/layout.tsx
  - docs/admin_api_extraction_pattern.md
  - src/app/api/orders/[id]/lifecycle/route.ts
  - docs/21_修復說明_G3改版合併前修正.md
  - docs/17_spec_gap_roadmap.md
  - HANDOFF_G3_UI_REDESIGN.md
  - src/app/(app)/orders/[id]/page.tsx
  - src/app/(app)/trade/page.tsx
  - src/app/api/orders/route.ts
  - src/app/page.tsx
  - src/lib/project-orders.ts
  - docs/19_修復說明_對話移植審查.md
  - docs/20_code_review_g3_ui_redesign.md
  - src/components/app/trade-order-timeline.tsx
  - docs/19_修復說明_對話移植審查_表格版.html
  - tailwind.config.ts
  - src/app/(app)/orders/page.tsx
  - src/components/ui/prompt-chips.tsx
  - docs/21_修復說明_G3改版合併前修正.pdf
  - src/components/app/app-shell.tsx
  - src/components/app/brand-watermark.tsx
  - src/components/ui/ai-chat-input.tsx
  - src/app/(app)/generate/page.tsx
  - src/lib/chips/default-prompts.ts
  - src/lib/trade-order-stages.ts
  - docs/21_修復說明_G3改版合併前修正.html
tests:
  - src/app/api/orders/[id]/lifecycle/lifecycle-gates.test.ts
  - src/app/api/orders/list-date-filters.test.ts
-->

---
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

<!-- @trace
source: fix-g3-redesign-pre-merge-issues
updated: 2026-06-08
code:
  - docs/19_修復說明_對話移植審查.html
  - docs/19_修復說明_對話移植審查.pdf
  - src/app/globals.css
  - src/app/admin/trade/quotations/page.tsx
  - docs/19_修復說明_對話移植審查_表格版.pdf
  - src/components/app/hero-breathing.tsx
  - src/app/layout.tsx
  - docs/admin_api_extraction_pattern.md
  - src/app/api/orders/[id]/lifecycle/route.ts
  - docs/21_修復說明_G3改版合併前修正.md
  - docs/17_spec_gap_roadmap.md
  - HANDOFF_G3_UI_REDESIGN.md
  - src/app/(app)/orders/[id]/page.tsx
  - src/app/(app)/trade/page.tsx
  - src/app/api/orders/route.ts
  - src/app/page.tsx
  - src/lib/project-orders.ts
  - docs/19_修復說明_對話移植審查.md
  - docs/20_code_review_g3_ui_redesign.md
  - src/components/app/trade-order-timeline.tsx
  - docs/19_修復說明_對話移植審查_表格版.html
  - tailwind.config.ts
  - src/app/(app)/orders/page.tsx
  - src/components/ui/prompt-chips.tsx
  - docs/21_修復說明_G3改版合併前修正.pdf
  - src/components/app/app-shell.tsx
  - src/components/app/brand-watermark.tsx
  - src/components/ui/ai-chat-input.tsx
  - src/app/(app)/generate/page.tsx
  - src/lib/chips/default-prompts.ts
  - src/lib/trade-order-stages.ts
  - docs/21_修復說明_G3改版合併前修正.html
tests:
  - src/app/api/orders/[id]/lifecycle/lifecycle-gates.test.ts
  - src/app/api/orders/list-date-filters.test.ts
-->