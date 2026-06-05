# quotation-pdf Specification

## Purpose

TBD - created by syncing change 'pi-pdf-template'. Update Purpose after archive.

## Requirements

### Requirement: PDF response contract

The system SHALL return a Pro Forma Invoice PDF in response to `GET /api/trade/inquiries/:id/quotation.pdf` for any inquiry the requester owns as buyer or seller. The response body MUST begin with the PDF magic header `%PDF-` and use `Content-Type: application/pdf` with `Content-Disposition: inline; filename="quotation-<short-id>.pdf"` where `<short-id>` is the first 8 hex characters of the inquiry UUID.

#### Scenario: Seller downloads quotation PDF

- **WHEN** the seller of an inquiry sends `GET /api/trade/inquiries/<id>/quotation.pdf` while authenticated
- **THEN** the response status SHALL be 200, the `Content-Type` header MUST equal `application/pdf`, and the response body MUST start with the bytes `%PDF-`

#### Scenario: Buyer downloads quotation PDF

- **WHEN** the buyer of an inquiry sends `GET /api/trade/inquiries/<id>/quotation.pdf` while authenticated
- **THEN** the response status SHALL be 200, the `Content-Disposition` header MUST contain `filename="quotation-<8-hex-chars>.pdf"` matching the inquiry id, and the response body MUST start with `%PDF-`

#### Scenario: Unrelated user is denied

- **WHEN** an authenticated user who is neither buyer nor seller of the inquiry requests the PDF
- **THEN** the response status MUST be the `RESOURCE_NOT_FOUND` error code returned by the existing route helper, and no PDF body SHALL be returned


<!-- @trace
source: pi-pdf-template
updated: 2026-06-05
code:
  - docs/19_修復說明_對話移植審查.md
  - src/app/admin/orders/[id]/page.tsx
  - src/app/api/trade/inquiries/[id]/quotation.pdf/route.ts
  - docs/19_修復說明_對話移植審查.pdf
  - src/app/admin/users/[id]/page.tsx
  - src/app/api/trade/products/route.ts
  - src/lib/pdf/render.ts
  - src/middleware.ts
  - src/lib/credits.ts
  - src/lib/pdf/inquiry-to-pi-data.ts
  - src/lib/conversation/intent-resolver.ts
  - tsconfig.json
  - src/app/(app)/generate/page.tsx
  - src/app/api/admin/orders/expire-quotes/route.ts
  - src/app/api/conversations/[id]/stream/route.ts
  - src/app/api/conversations/route.ts
  - src/app/api/orders/[id]/submit/route.ts
  - src/lib/conversation/marketing-intelligence.ts
  - src/lib/notify.ts
  - src/app/api/wallet/topup/route.ts
  - src/lib/conversation/intent-keywords.ts
  - src/app/api/admin/orders/[id]/review-items/route.ts
  - src/app/api/conversations/models/route.ts
  - src/app/api/conversations/[id]/route.ts
  - src/app/api/admin/orders/[id]/complete/route.ts
  - src/app/api/conversations/[id]/design-tasks/route.ts
  - src/lib/website-builder/intent-router.ts
  - src/app/api/admin/orders/[id]/messages/route.ts
  - src/app/api/trade/products/[id]/route.ts
  - src/app/api/admin/orders/[id]/cancel/route.ts
  - src/app/api/conversations/[id]/messages/route.ts
  - docs/18_code_review_conversation_port.md
  - prisma/migrations/20260531000000_conversation_design_tasks/migration.sql
  - src/app/(app)/orders/[id]/page.tsx
  - src/lib/site-builder.ts
  - src/app/api/conversations/[id]/messages/[messageId]/artifact/route.ts
  - src/app/api/conversations/[id]/attachments/upload/route.ts
  - src/components/ui/input.tsx
  - src/lib/pdf/pi-data.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/route.ts
  - src/types/conversation.ts
  - docs/admin_api_extraction_pattern.md
  - src/app/globals.css
  - prisma/schema.prisma
  - src/app/api/orders/[id]/cancel/route.ts
  - src/lib/conversation/schema-registry.ts
  - src/app/api/conversations/default/ai/route.ts
  - tailwind.config.ts
  - src/app/api/wallet/route.ts
  - src/lib/website-builder/collection-script.ts
  - src/app/(app)/sites/preview/[id]/page.tsx
  - src/lib/conversation/stream.ts
  - src/app/api/chat/messages/route.ts
  - src/app/api/orders/[id]/revision-quota/purchase/route.ts
  - README.md
  - prisma/migrations/20260602000000_project_order_flow/migration.sql
  - src/lib/conversation/api.ts
  - src/app/api/orders/[id]/route.ts
  - src/lib/project-brief.ts
  - src/components/app/app-shell.tsx
  - src/lib/banana-image.ts
  - docs/19_修復說明_對話移植審查.html
  - src/app/api/billing/subscription/route.ts
  - src/lib/api.ts
  - jest.config.js
  - src/app/(app)/chat/page.tsx
  - package.json
  - src/app/api/admin/orders/[id]/start/route.ts
  - src/app/api/orders/[id]/accept-quote/route.ts
  - src/app/api/trade/categories/route.ts
  - src/lib/conversation/action-policy.ts
  - src/lib/conversation/template-defaults.ts
  - src/lib/trade-categories.ts
  - src/components/ui/card.tsx
  - docs/19_修復說明_對話移植審查_表格版.html
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.ts
  - src/app/api/orders/[id]/messages/route.ts
  - src/components/ui/ai-chat-input.tsx
  - src/lib/pdf.ts
  - src/lib/pdf/pro-forma-invoice.tsx
  - src/lib/project-orders.ts
  - docs/19_修復說明_對話移植審查_表格版.pdf
  - src/app/layout.tsx
  - src/app/(app)/layout.tsx
  - src/app/(app)/trade/page.tsx
  - src/app/api/billing/plans/route.ts
  - src/app/api/conversations/website-products/route.ts
  - src/lib/website-builder/orchestrator.ts
  - src/hooks/useConversations.ts
  - src/lib/site-puck.tsx
  - src/components/ui/button.tsx
  - src/app/api/conversations/design-task-starters/route.ts
  - src/lib/conversation/types.ts
  - src/app/admin/orders/page.tsx
  - src/app/api/orders/route.ts
  - src/lib/flexion.ts
  - src/app/site-preview/[id]/route.ts
  - .env.example
  - src/app/api/orders/[id]/quote/route.ts
  - src/components/ui/conversation-interface.tsx
  - src/lib/conversation/generation-dispatcher.ts
  - docs/17_spec_gap_roadmap.md
  - src/app/api/admin/orders/[id]/quote/route.ts
  - src/app/(app)/orders/page.tsx
  - src/lib/pdf/fonts/NotoSansCJK-Regular.ttf
tests:
  - src/app/api/orders/[id]/messages/route.test.ts
  - src/lib/pdf/__tests__/render.test.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.test.ts
  - src/app/api/orders/[id]/downstream-gates.test.ts
  - src/lib/pdf/__tests__/inquiry-to-pi-data.test.ts
  - src/app/api/chat/messages/route.test.ts
  - src/lib/conversation/resolve-requested-model.test.ts
  - src/app/api/auth/resend-verification/route.test.ts
  - src/app/api/auth/register/route.test.ts
  - src/app/api/orders/[id]/route.test.ts
  - src/lib/conversation/generation-dispatcher.test.ts
  - src/hooks/useConversations.stream.test.ts
  - src/app/api/admin/orders/[id]/start/route.test.ts
  - src/app/api/conversations/[id]/messages/route.test.ts
  - src/app/api/orders/[id]/accept-quote/route.test.ts
  - src/lib/credits.test.ts
  - src/lib/pdf/__tests__/pi-data.test.ts
  - src/app/api/trade/inquiries/[id]/quotation.pdf/__tests__/route.test.ts
-->

---
### Requirement: CJK glyph rendering

The system SHALL render Traditional Chinese, Simplified Chinese, Japanese, and Korean characters in the PDF using a bundled Noto Sans CJK font registered at module load. Glyphs MUST NOT appear as empty boxes or substitution markers when seller name, buyer name, product name, or notes contain CJK characters.

#### Scenario: Mixed-script inquiry renders all glyphs

- **WHEN** an inquiry has a Traditional Chinese seller company name, a Japanese buyer company name, and a product description containing both scripts
- **THEN** the PDF binary SHALL contain glyph references for all four scripts and the rendered output MUST display the original characters

##### Example: seeded inquiries from local fixtures

- **GIVEN** the seed in `scripts/local/seed-quotations.ts` creates an inquiry with seller company `Horizon AI Trading`, buyer company `Tokyo Trading Co., Ltd.`, and product name `台灣愛文芒果 (Mango Premium)`
- **WHEN** the PDF is rendered for that inquiry
- **THEN** the rendered seller, buyer, and product cells MUST contain the original characters with no empty boxes


<!-- @trace
source: pi-pdf-template
updated: 2026-06-05
code:
  - docs/19_修復說明_對話移植審查.md
  - src/app/admin/orders/[id]/page.tsx
  - src/app/api/trade/inquiries/[id]/quotation.pdf/route.ts
  - docs/19_修復說明_對話移植審查.pdf
  - src/app/admin/users/[id]/page.tsx
  - src/app/api/trade/products/route.ts
  - src/lib/pdf/render.ts
  - src/middleware.ts
  - src/lib/credits.ts
  - src/lib/pdf/inquiry-to-pi-data.ts
  - src/lib/conversation/intent-resolver.ts
  - tsconfig.json
  - src/app/(app)/generate/page.tsx
  - src/app/api/admin/orders/expire-quotes/route.ts
  - src/app/api/conversations/[id]/stream/route.ts
  - src/app/api/conversations/route.ts
  - src/app/api/orders/[id]/submit/route.ts
  - src/lib/conversation/marketing-intelligence.ts
  - src/lib/notify.ts
  - src/app/api/wallet/topup/route.ts
  - src/lib/conversation/intent-keywords.ts
  - src/app/api/admin/orders/[id]/review-items/route.ts
  - src/app/api/conversations/models/route.ts
  - src/app/api/conversations/[id]/route.ts
  - src/app/api/admin/orders/[id]/complete/route.ts
  - src/app/api/conversations/[id]/design-tasks/route.ts
  - src/lib/website-builder/intent-router.ts
  - src/app/api/admin/orders/[id]/messages/route.ts
  - src/app/api/trade/products/[id]/route.ts
  - src/app/api/admin/orders/[id]/cancel/route.ts
  - src/app/api/conversations/[id]/messages/route.ts
  - docs/18_code_review_conversation_port.md
  - prisma/migrations/20260531000000_conversation_design_tasks/migration.sql
  - src/app/(app)/orders/[id]/page.tsx
  - src/lib/site-builder.ts
  - src/app/api/conversations/[id]/messages/[messageId]/artifact/route.ts
  - src/app/api/conversations/[id]/attachments/upload/route.ts
  - src/components/ui/input.tsx
  - src/lib/pdf/pi-data.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/route.ts
  - src/types/conversation.ts
  - docs/admin_api_extraction_pattern.md
  - src/app/globals.css
  - prisma/schema.prisma
  - src/app/api/orders/[id]/cancel/route.ts
  - src/lib/conversation/schema-registry.ts
  - src/app/api/conversations/default/ai/route.ts
  - tailwind.config.ts
  - src/app/api/wallet/route.ts
  - src/lib/website-builder/collection-script.ts
  - src/app/(app)/sites/preview/[id]/page.tsx
  - src/lib/conversation/stream.ts
  - src/app/api/chat/messages/route.ts
  - src/app/api/orders/[id]/revision-quota/purchase/route.ts
  - README.md
  - prisma/migrations/20260602000000_project_order_flow/migration.sql
  - src/lib/conversation/api.ts
  - src/app/api/orders/[id]/route.ts
  - src/lib/project-brief.ts
  - src/components/app/app-shell.tsx
  - src/lib/banana-image.ts
  - docs/19_修復說明_對話移植審查.html
  - src/app/api/billing/subscription/route.ts
  - src/lib/api.ts
  - jest.config.js
  - src/app/(app)/chat/page.tsx
  - package.json
  - src/app/api/admin/orders/[id]/start/route.ts
  - src/app/api/orders/[id]/accept-quote/route.ts
  - src/app/api/trade/categories/route.ts
  - src/lib/conversation/action-policy.ts
  - src/lib/conversation/template-defaults.ts
  - src/lib/trade-categories.ts
  - src/components/ui/card.tsx
  - docs/19_修復說明_對話移植審查_表格版.html
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.ts
  - src/app/api/orders/[id]/messages/route.ts
  - src/components/ui/ai-chat-input.tsx
  - src/lib/pdf.ts
  - src/lib/pdf/pro-forma-invoice.tsx
  - src/lib/project-orders.ts
  - docs/19_修復說明_對話移植審查_表格版.pdf
  - src/app/layout.tsx
  - src/app/(app)/layout.tsx
  - src/app/(app)/trade/page.tsx
  - src/app/api/billing/plans/route.ts
  - src/app/api/conversations/website-products/route.ts
  - src/lib/website-builder/orchestrator.ts
  - src/hooks/useConversations.ts
  - src/lib/site-puck.tsx
  - src/components/ui/button.tsx
  - src/app/api/conversations/design-task-starters/route.ts
  - src/lib/conversation/types.ts
  - src/app/admin/orders/page.tsx
  - src/app/api/orders/route.ts
  - src/lib/flexion.ts
  - src/app/site-preview/[id]/route.ts
  - .env.example
  - src/app/api/orders/[id]/quote/route.ts
  - src/components/ui/conversation-interface.tsx
  - src/lib/conversation/generation-dispatcher.ts
  - docs/17_spec_gap_roadmap.md
  - src/app/api/admin/orders/[id]/quote/route.ts
  - src/app/(app)/orders/page.tsx
  - src/lib/pdf/fonts/NotoSansCJK-Regular.ttf
tests:
  - src/app/api/orders/[id]/messages/route.test.ts
  - src/lib/pdf/__tests__/render.test.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.test.ts
  - src/app/api/orders/[id]/downstream-gates.test.ts
  - src/lib/pdf/__tests__/inquiry-to-pi-data.test.ts
  - src/app/api/chat/messages/route.test.ts
  - src/lib/conversation/resolve-requested-model.test.ts
  - src/app/api/auth/resend-verification/route.test.ts
  - src/app/api/auth/register/route.test.ts
  - src/app/api/orders/[id]/route.test.ts
  - src/lib/conversation/generation-dispatcher.test.ts
  - src/hooks/useConversations.stream.test.ts
  - src/app/api/admin/orders/[id]/start/route.test.ts
  - src/app/api/conversations/[id]/messages/route.test.ts
  - src/app/api/orders/[id]/accept-quote/route.test.ts
  - src/lib/credits.test.ts
  - src/lib/pdf/__tests__/pi-data.test.ts
  - src/app/api/trade/inquiries/[id]/quotation.pdf/__tests__/route.test.ts
-->

---
### Requirement: Pro Forma Invoice layout sections

The system SHALL render a single A4 page (595×842 pt) reproducing the PI 公版 layout: a seller header block and a `CUSTOMER` block (upper-left), the `PRO FORMA INVOICE` title with a metadata grid (Date, Expiration Date, Invoice #, Customer ID) and a `SHIPPING DETAILS` block (upper-right), a line items table with columns `PART NUMBER`, `UNIT OF MEASURE`, `DESCRIPTION`, `QTY`, `UNIT PRICE`, `TAX`, `TOTAL AMOUNT`, a `TERMS OF SALE AND OTHER COMMENTS` block beside a totals breakdown (Subtotal, Taxable, Tax rate, Tax, Freight, Insurance, Legal/Consular Inspection/Cert., Other ×2, TOTAL, Currency), and an `ADDITIONAL DETAILS` block (Country of Origin, Port of Embarkation, Port of Discharge, Reason for Export) with a certification statement and signature area. Section header bars use a blue-grey background with white text (the Additional Details bar is grey) and bodies are borderless, matching the Vertex42 公版. The CUSTOMER and SHIPPING DETAILS bars are narrow (not full-width), and the line items grid uses vertical column separators only — no horizontal dividers between rows. Each section MUST always render, even when its data sources are empty.

#### Scenario: Empty data still draws all sections

- **WHEN** an inquiry has no quoted price, no quoted quantity, and no quotation notes
- **THEN** every PI section box MUST still appear in the rendered PDF, with empty cells filled by em-dash placeholders rather than collapsed sections

#### Scenario: Filled inquiry populates all available cells

- **WHEN** an inquiry has a quoted price, quoted quantity, delivery terms, port of destination, and payment terms
- **THEN** the line items row MUST display the product description, quoted quantity, and quoted price; the Terms of Sale block MUST display the delivery terms and payment terms; and the Additional Details block MUST display the port of destination as Port of Discharge


<!-- @trace
source: pi-pdf-template
updated: 2026-06-05
code:
  - docs/19_修復說明_對話移植審查.md
  - src/app/admin/orders/[id]/page.tsx
  - src/app/api/trade/inquiries/[id]/quotation.pdf/route.ts
  - docs/19_修復說明_對話移植審查.pdf
  - src/app/admin/users/[id]/page.tsx
  - src/app/api/trade/products/route.ts
  - src/lib/pdf/render.ts
  - src/middleware.ts
  - src/lib/credits.ts
  - src/lib/pdf/inquiry-to-pi-data.ts
  - src/lib/conversation/intent-resolver.ts
  - tsconfig.json
  - src/app/(app)/generate/page.tsx
  - src/app/api/admin/orders/expire-quotes/route.ts
  - src/app/api/conversations/[id]/stream/route.ts
  - src/app/api/conversations/route.ts
  - src/app/api/orders/[id]/submit/route.ts
  - src/lib/conversation/marketing-intelligence.ts
  - src/lib/notify.ts
  - src/app/api/wallet/topup/route.ts
  - src/lib/conversation/intent-keywords.ts
  - src/app/api/admin/orders/[id]/review-items/route.ts
  - src/app/api/conversations/models/route.ts
  - src/app/api/conversations/[id]/route.ts
  - src/app/api/admin/orders/[id]/complete/route.ts
  - src/app/api/conversations/[id]/design-tasks/route.ts
  - src/lib/website-builder/intent-router.ts
  - src/app/api/admin/orders/[id]/messages/route.ts
  - src/app/api/trade/products/[id]/route.ts
  - src/app/api/admin/orders/[id]/cancel/route.ts
  - src/app/api/conversations/[id]/messages/route.ts
  - docs/18_code_review_conversation_port.md
  - prisma/migrations/20260531000000_conversation_design_tasks/migration.sql
  - src/app/(app)/orders/[id]/page.tsx
  - src/lib/site-builder.ts
  - src/app/api/conversations/[id]/messages/[messageId]/artifact/route.ts
  - src/app/api/conversations/[id]/attachments/upload/route.ts
  - src/components/ui/input.tsx
  - src/lib/pdf/pi-data.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/route.ts
  - src/types/conversation.ts
  - docs/admin_api_extraction_pattern.md
  - src/app/globals.css
  - prisma/schema.prisma
  - src/app/api/orders/[id]/cancel/route.ts
  - src/lib/conversation/schema-registry.ts
  - src/app/api/conversations/default/ai/route.ts
  - tailwind.config.ts
  - src/app/api/wallet/route.ts
  - src/lib/website-builder/collection-script.ts
  - src/app/(app)/sites/preview/[id]/page.tsx
  - src/lib/conversation/stream.ts
  - src/app/api/chat/messages/route.ts
  - src/app/api/orders/[id]/revision-quota/purchase/route.ts
  - README.md
  - prisma/migrations/20260602000000_project_order_flow/migration.sql
  - src/lib/conversation/api.ts
  - src/app/api/orders/[id]/route.ts
  - src/lib/project-brief.ts
  - src/components/app/app-shell.tsx
  - src/lib/banana-image.ts
  - docs/19_修復說明_對話移植審查.html
  - src/app/api/billing/subscription/route.ts
  - src/lib/api.ts
  - jest.config.js
  - src/app/(app)/chat/page.tsx
  - package.json
  - src/app/api/admin/orders/[id]/start/route.ts
  - src/app/api/orders/[id]/accept-quote/route.ts
  - src/app/api/trade/categories/route.ts
  - src/lib/conversation/action-policy.ts
  - src/lib/conversation/template-defaults.ts
  - src/lib/trade-categories.ts
  - src/components/ui/card.tsx
  - docs/19_修復說明_對話移植審查_表格版.html
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.ts
  - src/app/api/orders/[id]/messages/route.ts
  - src/components/ui/ai-chat-input.tsx
  - src/lib/pdf.ts
  - src/lib/pdf/pro-forma-invoice.tsx
  - src/lib/project-orders.ts
  - docs/19_修復說明_對話移植審查_表格版.pdf
  - src/app/layout.tsx
  - src/app/(app)/layout.tsx
  - src/app/(app)/trade/page.tsx
  - src/app/api/billing/plans/route.ts
  - src/app/api/conversations/website-products/route.ts
  - src/lib/website-builder/orchestrator.ts
  - src/hooks/useConversations.ts
  - src/lib/site-puck.tsx
  - src/components/ui/button.tsx
  - src/app/api/conversations/design-task-starters/route.ts
  - src/lib/conversation/types.ts
  - src/app/admin/orders/page.tsx
  - src/app/api/orders/route.ts
  - src/lib/flexion.ts
  - src/app/site-preview/[id]/route.ts
  - .env.example
  - src/app/api/orders/[id]/quote/route.ts
  - src/components/ui/conversation-interface.tsx
  - src/lib/conversation/generation-dispatcher.ts
  - docs/17_spec_gap_roadmap.md
  - src/app/api/admin/orders/[id]/quote/route.ts
  - src/app/(app)/orders/page.tsx
  - src/lib/pdf/fonts/NotoSansCJK-Regular.ttf
tests:
  - src/app/api/orders/[id]/messages/route.test.ts
  - src/lib/pdf/__tests__/render.test.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.test.ts
  - src/app/api/orders/[id]/downstream-gates.test.ts
  - src/lib/pdf/__tests__/inquiry-to-pi-data.test.ts
  - src/app/api/chat/messages/route.test.ts
  - src/lib/conversation/resolve-requested-model.test.ts
  - src/app/api/auth/resend-verification/route.test.ts
  - src/app/api/auth/register/route.test.ts
  - src/app/api/orders/[id]/route.test.ts
  - src/lib/conversation/generation-dispatcher.test.ts
  - src/hooks/useConversations.stream.test.ts
  - src/app/api/admin/orders/[id]/start/route.test.ts
  - src/app/api/conversations/[id]/messages/route.test.ts
  - src/app/api/orders/[id]/accept-quote/route.test.ts
  - src/lib/credits.test.ts
  - src/lib/pdf/__tests__/pi-data.test.ts
  - src/app/api/trade/inquiries/[id]/quotation.pdf/__tests__/route.test.ts
-->

---
### Requirement: Adapter purity

The system SHALL provide a pure function `inquiryToPIData(inquiry)` that maps a Prisma Inquiry payload (with `product`, `buyer.company`, `seller.company` relations included) into a stable `PIData` interface. The adapter MUST NOT issue database calls, MUST NOT throw on missing or null relations, and MUST be deterministic for identical input.

#### Scenario: Same input produces same output

- **WHEN** `inquiryToPIData` is called twice with deeply-equal inquiry payloads
- **THEN** the returned `PIData` values MUST be deeply equal

#### Scenario: Missing relation does not throw

- **WHEN** `inquiryToPIData` is called with an inquiry whose `buyer.company` is `null`
- **THEN** the function MUST return a `PIData` whose customer-block fields are em-dash placeholders, and MUST NOT throw


<!-- @trace
source: pi-pdf-template
updated: 2026-06-05
code:
  - docs/19_修復說明_對話移植審查.md
  - src/app/admin/orders/[id]/page.tsx
  - src/app/api/trade/inquiries/[id]/quotation.pdf/route.ts
  - docs/19_修復說明_對話移植審查.pdf
  - src/app/admin/users/[id]/page.tsx
  - src/app/api/trade/products/route.ts
  - src/lib/pdf/render.ts
  - src/middleware.ts
  - src/lib/credits.ts
  - src/lib/pdf/inquiry-to-pi-data.ts
  - src/lib/conversation/intent-resolver.ts
  - tsconfig.json
  - src/app/(app)/generate/page.tsx
  - src/app/api/admin/orders/expire-quotes/route.ts
  - src/app/api/conversations/[id]/stream/route.ts
  - src/app/api/conversations/route.ts
  - src/app/api/orders/[id]/submit/route.ts
  - src/lib/conversation/marketing-intelligence.ts
  - src/lib/notify.ts
  - src/app/api/wallet/topup/route.ts
  - src/lib/conversation/intent-keywords.ts
  - src/app/api/admin/orders/[id]/review-items/route.ts
  - src/app/api/conversations/models/route.ts
  - src/app/api/conversations/[id]/route.ts
  - src/app/api/admin/orders/[id]/complete/route.ts
  - src/app/api/conversations/[id]/design-tasks/route.ts
  - src/lib/website-builder/intent-router.ts
  - src/app/api/admin/orders/[id]/messages/route.ts
  - src/app/api/trade/products/[id]/route.ts
  - src/app/api/admin/orders/[id]/cancel/route.ts
  - src/app/api/conversations/[id]/messages/route.ts
  - docs/18_code_review_conversation_port.md
  - prisma/migrations/20260531000000_conversation_design_tasks/migration.sql
  - src/app/(app)/orders/[id]/page.tsx
  - src/lib/site-builder.ts
  - src/app/api/conversations/[id]/messages/[messageId]/artifact/route.ts
  - src/app/api/conversations/[id]/attachments/upload/route.ts
  - src/components/ui/input.tsx
  - src/lib/pdf/pi-data.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/route.ts
  - src/types/conversation.ts
  - docs/admin_api_extraction_pattern.md
  - src/app/globals.css
  - prisma/schema.prisma
  - src/app/api/orders/[id]/cancel/route.ts
  - src/lib/conversation/schema-registry.ts
  - src/app/api/conversations/default/ai/route.ts
  - tailwind.config.ts
  - src/app/api/wallet/route.ts
  - src/lib/website-builder/collection-script.ts
  - src/app/(app)/sites/preview/[id]/page.tsx
  - src/lib/conversation/stream.ts
  - src/app/api/chat/messages/route.ts
  - src/app/api/orders/[id]/revision-quota/purchase/route.ts
  - README.md
  - prisma/migrations/20260602000000_project_order_flow/migration.sql
  - src/lib/conversation/api.ts
  - src/app/api/orders/[id]/route.ts
  - src/lib/project-brief.ts
  - src/components/app/app-shell.tsx
  - src/lib/banana-image.ts
  - docs/19_修復說明_對話移植審查.html
  - src/app/api/billing/subscription/route.ts
  - src/lib/api.ts
  - jest.config.js
  - src/app/(app)/chat/page.tsx
  - package.json
  - src/app/api/admin/orders/[id]/start/route.ts
  - src/app/api/orders/[id]/accept-quote/route.ts
  - src/app/api/trade/categories/route.ts
  - src/lib/conversation/action-policy.ts
  - src/lib/conversation/template-defaults.ts
  - src/lib/trade-categories.ts
  - src/components/ui/card.tsx
  - docs/19_修復說明_對話移植審查_表格版.html
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.ts
  - src/app/api/orders/[id]/messages/route.ts
  - src/components/ui/ai-chat-input.tsx
  - src/lib/pdf.ts
  - src/lib/pdf/pro-forma-invoice.tsx
  - src/lib/project-orders.ts
  - docs/19_修復說明_對話移植審查_表格版.pdf
  - src/app/layout.tsx
  - src/app/(app)/layout.tsx
  - src/app/(app)/trade/page.tsx
  - src/app/api/billing/plans/route.ts
  - src/app/api/conversations/website-products/route.ts
  - src/lib/website-builder/orchestrator.ts
  - src/hooks/useConversations.ts
  - src/lib/site-puck.tsx
  - src/components/ui/button.tsx
  - src/app/api/conversations/design-task-starters/route.ts
  - src/lib/conversation/types.ts
  - src/app/admin/orders/page.tsx
  - src/app/api/orders/route.ts
  - src/lib/flexion.ts
  - src/app/site-preview/[id]/route.ts
  - .env.example
  - src/app/api/orders/[id]/quote/route.ts
  - src/components/ui/conversation-interface.tsx
  - src/lib/conversation/generation-dispatcher.ts
  - docs/17_spec_gap_roadmap.md
  - src/app/api/admin/orders/[id]/quote/route.ts
  - src/app/(app)/orders/page.tsx
  - src/lib/pdf/fonts/NotoSansCJK-Regular.ttf
tests:
  - src/app/api/orders/[id]/messages/route.test.ts
  - src/lib/pdf/__tests__/render.test.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.test.ts
  - src/app/api/orders/[id]/downstream-gates.test.ts
  - src/lib/pdf/__tests__/inquiry-to-pi-data.test.ts
  - src/app/api/chat/messages/route.test.ts
  - src/lib/conversation/resolve-requested-model.test.ts
  - src/app/api/auth/resend-verification/route.test.ts
  - src/app/api/auth/register/route.test.ts
  - src/app/api/orders/[id]/route.test.ts
  - src/lib/conversation/generation-dispatcher.test.ts
  - src/hooks/useConversations.stream.test.ts
  - src/app/api/admin/orders/[id]/start/route.test.ts
  - src/app/api/conversations/[id]/messages/route.test.ts
  - src/app/api/orders/[id]/accept-quote/route.test.ts
  - src/lib/credits.test.ts
  - src/lib/pdf/__tests__/pi-data.test.ts
  - src/app/api/trade/inquiries/[id]/quotation.pdf/__tests__/route.test.ts
-->

---
### Requirement: Em-dash fallback for unstored fields

The system SHALL render em-dash (`—`, U+2014) in any PI cell whose data source is not populated, including all fields not yet present on the `Inquiry` schema (invoice number, expiration date, customer id, freight type, estimated shipping dates, weights, package count, tax breakdown, country of origin, port of embarkation, signature name and date) and any `CompanyProfile` field that is null. Fallback logic MUST live inside the adapter, not inside the React-PDF component.

#### Scenario: Schema-absent field renders em-dash

- **WHEN** the PI template renders a cell whose source column does not exist on the `Inquiry` schema (for example, `freight_type`)
- **THEN** the rendered cell MUST contain exactly `—` and the React-PDF component MUST receive the em-dash string from the adapter, not a `null` or `undefined` value

##### Example: cells that resolve to em-dash with current schema

| PI cell                 | Source planned for    | Renders as |
| ----------------------- | --------------------- | ---------- |
| Invoice #               | future Quote schema   | —          |
| Expiration Date         | future Quote schema   | —          |
| Freight Type            | future Shipping cols  | —          |
| Est Gross Weight        | future Shipping cols  | —          |
| Tax rate                | future Totals cols    | —          |
| Part Number             | future Quote schema   | —          |
| Port of Embarkation     | future Inquiry cols   | —          |
| Reason for Export       | future Inquiry cols   | —          |
| Signature typed name    | future Quote schema   | —          |


<!-- @trace
source: pi-pdf-template
updated: 2026-06-05
code:
  - docs/19_修復說明_對話移植審查.md
  - src/app/admin/orders/[id]/page.tsx
  - src/app/api/trade/inquiries/[id]/quotation.pdf/route.ts
  - docs/19_修復說明_對話移植審查.pdf
  - src/app/admin/users/[id]/page.tsx
  - src/app/api/trade/products/route.ts
  - src/lib/pdf/render.ts
  - src/middleware.ts
  - src/lib/credits.ts
  - src/lib/pdf/inquiry-to-pi-data.ts
  - src/lib/conversation/intent-resolver.ts
  - tsconfig.json
  - src/app/(app)/generate/page.tsx
  - src/app/api/admin/orders/expire-quotes/route.ts
  - src/app/api/conversations/[id]/stream/route.ts
  - src/app/api/conversations/route.ts
  - src/app/api/orders/[id]/submit/route.ts
  - src/lib/conversation/marketing-intelligence.ts
  - src/lib/notify.ts
  - src/app/api/wallet/topup/route.ts
  - src/lib/conversation/intent-keywords.ts
  - src/app/api/admin/orders/[id]/review-items/route.ts
  - src/app/api/conversations/models/route.ts
  - src/app/api/conversations/[id]/route.ts
  - src/app/api/admin/orders/[id]/complete/route.ts
  - src/app/api/conversations/[id]/design-tasks/route.ts
  - src/lib/website-builder/intent-router.ts
  - src/app/api/admin/orders/[id]/messages/route.ts
  - src/app/api/trade/products/[id]/route.ts
  - src/app/api/admin/orders/[id]/cancel/route.ts
  - src/app/api/conversations/[id]/messages/route.ts
  - docs/18_code_review_conversation_port.md
  - prisma/migrations/20260531000000_conversation_design_tasks/migration.sql
  - src/app/(app)/orders/[id]/page.tsx
  - src/lib/site-builder.ts
  - src/app/api/conversations/[id]/messages/[messageId]/artifact/route.ts
  - src/app/api/conversations/[id]/attachments/upload/route.ts
  - src/components/ui/input.tsx
  - src/lib/pdf/pi-data.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/route.ts
  - src/types/conversation.ts
  - docs/admin_api_extraction_pattern.md
  - src/app/globals.css
  - prisma/schema.prisma
  - src/app/api/orders/[id]/cancel/route.ts
  - src/lib/conversation/schema-registry.ts
  - src/app/api/conversations/default/ai/route.ts
  - tailwind.config.ts
  - src/app/api/wallet/route.ts
  - src/lib/website-builder/collection-script.ts
  - src/app/(app)/sites/preview/[id]/page.tsx
  - src/lib/conversation/stream.ts
  - src/app/api/chat/messages/route.ts
  - src/app/api/orders/[id]/revision-quota/purchase/route.ts
  - README.md
  - prisma/migrations/20260602000000_project_order_flow/migration.sql
  - src/lib/conversation/api.ts
  - src/app/api/orders/[id]/route.ts
  - src/lib/project-brief.ts
  - src/components/app/app-shell.tsx
  - src/lib/banana-image.ts
  - docs/19_修復說明_對話移植審查.html
  - src/app/api/billing/subscription/route.ts
  - src/lib/api.ts
  - jest.config.js
  - src/app/(app)/chat/page.tsx
  - package.json
  - src/app/api/admin/orders/[id]/start/route.ts
  - src/app/api/orders/[id]/accept-quote/route.ts
  - src/app/api/trade/categories/route.ts
  - src/lib/conversation/action-policy.ts
  - src/lib/conversation/template-defaults.ts
  - src/lib/trade-categories.ts
  - src/components/ui/card.tsx
  - docs/19_修復說明_對話移植審查_表格版.html
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.ts
  - src/app/api/orders/[id]/messages/route.ts
  - src/components/ui/ai-chat-input.tsx
  - src/lib/pdf.ts
  - src/lib/pdf/pro-forma-invoice.tsx
  - src/lib/project-orders.ts
  - docs/19_修復說明_對話移植審查_表格版.pdf
  - src/app/layout.tsx
  - src/app/(app)/layout.tsx
  - src/app/(app)/trade/page.tsx
  - src/app/api/billing/plans/route.ts
  - src/app/api/conversations/website-products/route.ts
  - src/lib/website-builder/orchestrator.ts
  - src/hooks/useConversations.ts
  - src/lib/site-puck.tsx
  - src/components/ui/button.tsx
  - src/app/api/conversations/design-task-starters/route.ts
  - src/lib/conversation/types.ts
  - src/app/admin/orders/page.tsx
  - src/app/api/orders/route.ts
  - src/lib/flexion.ts
  - src/app/site-preview/[id]/route.ts
  - .env.example
  - src/app/api/orders/[id]/quote/route.ts
  - src/components/ui/conversation-interface.tsx
  - src/lib/conversation/generation-dispatcher.ts
  - docs/17_spec_gap_roadmap.md
  - src/app/api/admin/orders/[id]/quote/route.ts
  - src/app/(app)/orders/page.tsx
  - src/lib/pdf/fonts/NotoSansCJK-Regular.ttf
tests:
  - src/app/api/orders/[id]/messages/route.test.ts
  - src/lib/pdf/__tests__/render.test.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.test.ts
  - src/app/api/orders/[id]/downstream-gates.test.ts
  - src/lib/pdf/__tests__/inquiry-to-pi-data.test.ts
  - src/app/api/chat/messages/route.test.ts
  - src/lib/conversation/resolve-requested-model.test.ts
  - src/app/api/auth/resend-verification/route.test.ts
  - src/app/api/auth/register/route.test.ts
  - src/app/api/orders/[id]/route.test.ts
  - src/lib/conversation/generation-dispatcher.test.ts
  - src/hooks/useConversations.stream.test.ts
  - src/app/api/admin/orders/[id]/start/route.test.ts
  - src/app/api/conversations/[id]/messages/route.test.ts
  - src/app/api/orders/[id]/accept-quote/route.test.ts
  - src/lib/credits.test.ts
  - src/lib/pdf/__tests__/pi-data.test.ts
  - src/app/api/trade/inquiries/[id]/quotation.pdf/__tests__/route.test.ts
-->

---
### Requirement: Preserve route side-effects

The system SHALL preserve the existing `quotation.pdf` route side-effects without change: on every successful GET, the route MUST set `inquiry.quotation_pdf_url` to the route path, and if the inquiry status is exactly `sent` the route MUST update it to `replied`. Inquiries in any other status MUST be left unchanged. This requirement freezes the current behavior; revision is deferred to a separate change tracked in `memory/project_pdf_route_side_effect.md`.

#### Scenario: GET on a sent inquiry flips status

- **WHEN** the PDF route is called for an inquiry with status `sent`
- **THEN** after the response is returned, the inquiry's `status` MUST equal `replied` and `quotation_pdf_url` MUST equal `/api/trade/inquiries/<id>/quotation.pdf`

#### Scenario: GET on a non-sent inquiry preserves status

- **WHEN** the PDF route is called for an inquiry with status `replied`, `negotiating`, `closed`, or `expired`
- **THEN** after the response is returned, the inquiry's `status` MUST equal its prior value and `quotation_pdf_url` MUST equal `/api/trade/inquiries/<id>/quotation.pdf`


<!-- @trace
source: pi-pdf-template
updated: 2026-06-05
code:
  - docs/19_修復說明_對話移植審查.md
  - src/app/admin/orders/[id]/page.tsx
  - src/app/api/trade/inquiries/[id]/quotation.pdf/route.ts
  - docs/19_修復說明_對話移植審查.pdf
  - src/app/admin/users/[id]/page.tsx
  - src/app/api/trade/products/route.ts
  - src/lib/pdf/render.ts
  - src/middleware.ts
  - src/lib/credits.ts
  - src/lib/pdf/inquiry-to-pi-data.ts
  - src/lib/conversation/intent-resolver.ts
  - tsconfig.json
  - src/app/(app)/generate/page.tsx
  - src/app/api/admin/orders/expire-quotes/route.ts
  - src/app/api/conversations/[id]/stream/route.ts
  - src/app/api/conversations/route.ts
  - src/app/api/orders/[id]/submit/route.ts
  - src/lib/conversation/marketing-intelligence.ts
  - src/lib/notify.ts
  - src/app/api/wallet/topup/route.ts
  - src/lib/conversation/intent-keywords.ts
  - src/app/api/admin/orders/[id]/review-items/route.ts
  - src/app/api/conversations/models/route.ts
  - src/app/api/conversations/[id]/route.ts
  - src/app/api/admin/orders/[id]/complete/route.ts
  - src/app/api/conversations/[id]/design-tasks/route.ts
  - src/lib/website-builder/intent-router.ts
  - src/app/api/admin/orders/[id]/messages/route.ts
  - src/app/api/trade/products/[id]/route.ts
  - src/app/api/admin/orders/[id]/cancel/route.ts
  - src/app/api/conversations/[id]/messages/route.ts
  - docs/18_code_review_conversation_port.md
  - prisma/migrations/20260531000000_conversation_design_tasks/migration.sql
  - src/app/(app)/orders/[id]/page.tsx
  - src/lib/site-builder.ts
  - src/app/api/conversations/[id]/messages/[messageId]/artifact/route.ts
  - src/app/api/conversations/[id]/attachments/upload/route.ts
  - src/components/ui/input.tsx
  - src/lib/pdf/pi-data.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/route.ts
  - src/types/conversation.ts
  - docs/admin_api_extraction_pattern.md
  - src/app/globals.css
  - prisma/schema.prisma
  - src/app/api/orders/[id]/cancel/route.ts
  - src/lib/conversation/schema-registry.ts
  - src/app/api/conversations/default/ai/route.ts
  - tailwind.config.ts
  - src/app/api/wallet/route.ts
  - src/lib/website-builder/collection-script.ts
  - src/app/(app)/sites/preview/[id]/page.tsx
  - src/lib/conversation/stream.ts
  - src/app/api/chat/messages/route.ts
  - src/app/api/orders/[id]/revision-quota/purchase/route.ts
  - README.md
  - prisma/migrations/20260602000000_project_order_flow/migration.sql
  - src/lib/conversation/api.ts
  - src/app/api/orders/[id]/route.ts
  - src/lib/project-brief.ts
  - src/components/app/app-shell.tsx
  - src/lib/banana-image.ts
  - docs/19_修復說明_對話移植審查.html
  - src/app/api/billing/subscription/route.ts
  - src/lib/api.ts
  - jest.config.js
  - src/app/(app)/chat/page.tsx
  - package.json
  - src/app/api/admin/orders/[id]/start/route.ts
  - src/app/api/orders/[id]/accept-quote/route.ts
  - src/app/api/trade/categories/route.ts
  - src/lib/conversation/action-policy.ts
  - src/lib/conversation/template-defaults.ts
  - src/lib/trade-categories.ts
  - src/components/ui/card.tsx
  - docs/19_修復說明_對話移植審查_表格版.html
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.ts
  - src/app/api/orders/[id]/messages/route.ts
  - src/components/ui/ai-chat-input.tsx
  - src/lib/pdf.ts
  - src/lib/pdf/pro-forma-invoice.tsx
  - src/lib/project-orders.ts
  - docs/19_修復說明_對話移植審查_表格版.pdf
  - src/app/layout.tsx
  - src/app/(app)/layout.tsx
  - src/app/(app)/trade/page.tsx
  - src/app/api/billing/plans/route.ts
  - src/app/api/conversations/website-products/route.ts
  - src/lib/website-builder/orchestrator.ts
  - src/hooks/useConversations.ts
  - src/lib/site-puck.tsx
  - src/components/ui/button.tsx
  - src/app/api/conversations/design-task-starters/route.ts
  - src/lib/conversation/types.ts
  - src/app/admin/orders/page.tsx
  - src/app/api/orders/route.ts
  - src/lib/flexion.ts
  - src/app/site-preview/[id]/route.ts
  - .env.example
  - src/app/api/orders/[id]/quote/route.ts
  - src/components/ui/conversation-interface.tsx
  - src/lib/conversation/generation-dispatcher.ts
  - docs/17_spec_gap_roadmap.md
  - src/app/api/admin/orders/[id]/quote/route.ts
  - src/app/(app)/orders/page.tsx
  - src/lib/pdf/fonts/NotoSansCJK-Regular.ttf
tests:
  - src/app/api/orders/[id]/messages/route.test.ts
  - src/lib/pdf/__tests__/render.test.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.test.ts
  - src/app/api/orders/[id]/downstream-gates.test.ts
  - src/lib/pdf/__tests__/inquiry-to-pi-data.test.ts
  - src/app/api/chat/messages/route.test.ts
  - src/lib/conversation/resolve-requested-model.test.ts
  - src/app/api/auth/resend-verification/route.test.ts
  - src/app/api/auth/register/route.test.ts
  - src/app/api/orders/[id]/route.test.ts
  - src/lib/conversation/generation-dispatcher.test.ts
  - src/hooks/useConversations.stream.test.ts
  - src/app/api/admin/orders/[id]/start/route.test.ts
  - src/app/api/conversations/[id]/messages/route.test.ts
  - src/app/api/orders/[id]/accept-quote/route.test.ts
  - src/lib/credits.test.ts
  - src/lib/pdf/__tests__/pi-data.test.ts
  - src/app/api/trade/inquiries/[id]/quotation.pdf/__tests__/route.test.ts
-->

---
### Requirement: Component isolation from Prisma

The system SHALL implement the React-PDF component (`<ProFormaInvoice>`) such that it accepts only a `PIData` value and depends on no Prisma type, no `src/lib/db` import, and no `Inquiry`-specific symbol. This isolation MUST allow the component to be tested with hand-built `PIData` fixtures and MUST keep schema changes confined to the adapter file.

#### Scenario: Component renders from hand-built fixture

- **WHEN** a test instantiates `<ProFormaInvoice data={fixturePIData} />` where `fixturePIData` is a hand-built `PIData` object with no Prisma involvement
- **THEN** `renderToBuffer` MUST return a valid PDF `Buffer` and the component module MUST NOT import from `@prisma/client` or `src/lib/db`

<!-- @trace
source: pi-pdf-template
updated: 2026-06-05
code:
  - docs/19_修復說明_對話移植審查.md
  - src/app/admin/orders/[id]/page.tsx
  - src/app/api/trade/inquiries/[id]/quotation.pdf/route.ts
  - docs/19_修復說明_對話移植審查.pdf
  - src/app/admin/users/[id]/page.tsx
  - src/app/api/trade/products/route.ts
  - src/lib/pdf/render.ts
  - src/middleware.ts
  - src/lib/credits.ts
  - src/lib/pdf/inquiry-to-pi-data.ts
  - src/lib/conversation/intent-resolver.ts
  - tsconfig.json
  - src/app/(app)/generate/page.tsx
  - src/app/api/admin/orders/expire-quotes/route.ts
  - src/app/api/conversations/[id]/stream/route.ts
  - src/app/api/conversations/route.ts
  - src/app/api/orders/[id]/submit/route.ts
  - src/lib/conversation/marketing-intelligence.ts
  - src/lib/notify.ts
  - src/app/api/wallet/topup/route.ts
  - src/lib/conversation/intent-keywords.ts
  - src/app/api/admin/orders/[id]/review-items/route.ts
  - src/app/api/conversations/models/route.ts
  - src/app/api/conversations/[id]/route.ts
  - src/app/api/admin/orders/[id]/complete/route.ts
  - src/app/api/conversations/[id]/design-tasks/route.ts
  - src/lib/website-builder/intent-router.ts
  - src/app/api/admin/orders/[id]/messages/route.ts
  - src/app/api/trade/products/[id]/route.ts
  - src/app/api/admin/orders/[id]/cancel/route.ts
  - src/app/api/conversations/[id]/messages/route.ts
  - docs/18_code_review_conversation_port.md
  - prisma/migrations/20260531000000_conversation_design_tasks/migration.sql
  - src/app/(app)/orders/[id]/page.tsx
  - src/lib/site-builder.ts
  - src/app/api/conversations/[id]/messages/[messageId]/artifact/route.ts
  - src/app/api/conversations/[id]/attachments/upload/route.ts
  - src/components/ui/input.tsx
  - src/lib/pdf/pi-data.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/route.ts
  - src/types/conversation.ts
  - docs/admin_api_extraction_pattern.md
  - src/app/globals.css
  - prisma/schema.prisma
  - src/app/api/orders/[id]/cancel/route.ts
  - src/lib/conversation/schema-registry.ts
  - src/app/api/conversations/default/ai/route.ts
  - tailwind.config.ts
  - src/app/api/wallet/route.ts
  - src/lib/website-builder/collection-script.ts
  - src/app/(app)/sites/preview/[id]/page.tsx
  - src/lib/conversation/stream.ts
  - src/app/api/chat/messages/route.ts
  - src/app/api/orders/[id]/revision-quota/purchase/route.ts
  - README.md
  - prisma/migrations/20260602000000_project_order_flow/migration.sql
  - src/lib/conversation/api.ts
  - src/app/api/orders/[id]/route.ts
  - src/lib/project-brief.ts
  - src/components/app/app-shell.tsx
  - src/lib/banana-image.ts
  - docs/19_修復說明_對話移植審查.html
  - src/app/api/billing/subscription/route.ts
  - src/lib/api.ts
  - jest.config.js
  - src/app/(app)/chat/page.tsx
  - package.json
  - src/app/api/admin/orders/[id]/start/route.ts
  - src/app/api/orders/[id]/accept-quote/route.ts
  - src/app/api/trade/categories/route.ts
  - src/lib/conversation/action-policy.ts
  - src/lib/conversation/template-defaults.ts
  - src/lib/trade-categories.ts
  - src/components/ui/card.tsx
  - docs/19_修復說明_對話移植審查_表格版.html
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.ts
  - src/app/api/orders/[id]/messages/route.ts
  - src/components/ui/ai-chat-input.tsx
  - src/lib/pdf.ts
  - src/lib/pdf/pro-forma-invoice.tsx
  - src/lib/project-orders.ts
  - docs/19_修復說明_對話移植審查_表格版.pdf
  - src/app/layout.tsx
  - src/app/(app)/layout.tsx
  - src/app/(app)/trade/page.tsx
  - src/app/api/billing/plans/route.ts
  - src/app/api/conversations/website-products/route.ts
  - src/lib/website-builder/orchestrator.ts
  - src/hooks/useConversations.ts
  - src/lib/site-puck.tsx
  - src/components/ui/button.tsx
  - src/app/api/conversations/design-task-starters/route.ts
  - src/lib/conversation/types.ts
  - src/app/admin/orders/page.tsx
  - src/app/api/orders/route.ts
  - src/lib/flexion.ts
  - src/app/site-preview/[id]/route.ts
  - .env.example
  - src/app/api/orders/[id]/quote/route.ts
  - src/components/ui/conversation-interface.tsx
  - src/lib/conversation/generation-dispatcher.ts
  - docs/17_spec_gap_roadmap.md
  - src/app/api/admin/orders/[id]/quote/route.ts
  - src/app/(app)/orders/page.tsx
  - src/lib/pdf/fonts/NotoSansCJK-Regular.ttf
tests:
  - src/app/api/orders/[id]/messages/route.test.ts
  - src/lib/pdf/__tests__/render.test.ts
  - src/app/api/conversations/[id]/design-tasks/[taskId]/generate/route.test.ts
  - src/app/api/orders/[id]/downstream-gates.test.ts
  - src/lib/pdf/__tests__/inquiry-to-pi-data.test.ts
  - src/app/api/chat/messages/route.test.ts
  - src/lib/conversation/resolve-requested-model.test.ts
  - src/app/api/auth/resend-verification/route.test.ts
  - src/app/api/auth/register/route.test.ts
  - src/app/api/orders/[id]/route.test.ts
  - src/lib/conversation/generation-dispatcher.test.ts
  - src/hooks/useConversations.stream.test.ts
  - src/app/api/admin/orders/[id]/start/route.test.ts
  - src/app/api/conversations/[id]/messages/route.test.ts
  - src/app/api/orders/[id]/accept-quote/route.test.ts
  - src/lib/credits.test.ts
  - src/lib/pdf/__tests__/pi-data.test.ts
  - src/app/api/trade/inquiries/[id]/quotation.pdf/__tests__/route.test.ts
-->