## ADDED Requirements

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

### Requirement: CJK glyph rendering

The system SHALL render Traditional Chinese, Simplified Chinese, Japanese, and Korean characters in the PDF using a bundled Noto Sans CJK font registered at module load. Glyphs MUST NOT appear as empty boxes or substitution markers when seller name, buyer name, product name, or notes contain CJK characters.

#### Scenario: Mixed-script inquiry renders all glyphs

- **WHEN** an inquiry has a Traditional Chinese seller company name, a Japanese buyer company name, and a product description containing both scripts
- **THEN** the PDF binary SHALL contain glyph references for all four scripts and the rendered output MUST display the original characters

##### Example: seeded inquiries from local fixtures

- **GIVEN** the seed in `scripts/local/seed-quotations.ts` creates an inquiry with seller company `Horizon AI Trading`, buyer company `Tokyo Trading Co., Ltd.`, and product name `台灣愛文芒果 (Mango Premium)`
- **WHEN** the PDF is rendered for that inquiry
- **THEN** the rendered seller, buyer, and product cells MUST contain the original characters with no empty boxes

### Requirement: Pro Forma Invoice layout sections

The system SHALL render a single A4 page (595×842 pt) reproducing the PI 公版 layout: a seller header block and a `CUSTOMER` block (upper-left), the `PRO FORMA INVOICE` title with a metadata grid (Date, Expiration Date, Invoice #, Customer ID) and a `SHIPPING DETAILS` block (upper-right), a line items table with columns `PART NUMBER`, `UNIT OF MEASURE`, `DESCRIPTION`, `QTY`, `UNIT PRICE`, `TAX`, `TOTAL AMOUNT`, a `TERMS OF SALE AND OTHER COMMENTS` block beside a totals breakdown (Subtotal, Taxable, Tax rate, Tax, Freight, Insurance, Legal/Consular Inspection/Cert., Other ×2, TOTAL, Currency), and an `ADDITIONAL DETAILS` block (Country of Origin, Port of Embarkation, Port of Discharge, Reason for Export) with a certification statement and signature area. Section header bars use a blue-grey background with white text (the Additional Details bar is grey) and bodies are borderless, matching the Vertex42 公版. Each section MUST always render, even when its data sources are empty.

#### Scenario: Empty data still draws all sections

- **WHEN** an inquiry has no quoted price, no quoted quantity, and no quotation notes
- **THEN** every PI section box MUST still appear in the rendered PDF, with empty cells filled by em-dash placeholders rather than collapsed sections

#### Scenario: Filled inquiry populates all available cells

- **WHEN** an inquiry has a quoted price, quoted quantity, delivery terms, port of destination, and payment terms
- **THEN** the line items row MUST display the product description, quoted quantity, and quoted price; the Terms of Sale block MUST display the delivery terms and payment terms; and the Additional Details block MUST display the port of destination as Port of Discharge

### Requirement: Adapter purity

The system SHALL provide a pure function `inquiryToPIData(inquiry)` that maps a Prisma Inquiry payload (with `product`, `buyer.company`, `seller.company` relations included) into a stable `PIData` interface. The adapter MUST NOT issue database calls, MUST NOT throw on missing or null relations, and MUST be deterministic for identical input.

#### Scenario: Same input produces same output

- **WHEN** `inquiryToPIData` is called twice with deeply-equal inquiry payloads
- **THEN** the returned `PIData` values MUST be deeply equal

#### Scenario: Missing relation does not throw

- **WHEN** `inquiryToPIData` is called with an inquiry whose `buyer.company` is `null`
- **THEN** the function MUST return a `PIData` whose customer-block fields are em-dash placeholders, and MUST NOT throw

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

### Requirement: Preserve route side-effects

The system SHALL preserve the existing `quotation.pdf` route side-effects without change: on every successful GET, the route MUST set `inquiry.quotation_pdf_url` to the route path, and if the inquiry status is exactly `sent` the route MUST update it to `replied`. Inquiries in any other status MUST be left unchanged. This requirement freezes the current behavior; revision is deferred to a separate change tracked in `memory/project_pdf_route_side_effect.md`.

#### Scenario: GET on a sent inquiry flips status

- **WHEN** the PDF route is called for an inquiry with status `sent`
- **THEN** after the response is returned, the inquiry's `status` MUST equal `replied` and `quotation_pdf_url` MUST equal `/api/trade/inquiries/<id>/quotation.pdf`

#### Scenario: GET on a non-sent inquiry preserves status

- **WHEN** the PDF route is called for an inquiry with status `replied`, `negotiating`, `closed`, or `expired`
- **THEN** after the response is returned, the inquiry's `status` MUST equal its prior value and `quotation_pdf_url` MUST equal `/api/trade/inquiries/<id>/quotation.pdf`

### Requirement: Component isolation from Prisma

The system SHALL implement the React-PDF component (`<ProFormaInvoice>`) such that it accepts only a `PIData` value and depends on no Prisma type, no `src/lib/db` import, and no `Inquiry`-specific symbol. This isolation MUST allow the component to be tested with hand-built `PIData` fixtures and MUST keep schema changes confined to the adapter file.

#### Scenario: Component renders from hand-built fixture

- **WHEN** a test instantiates `<ProFormaInvoice data={fixturePIData} />` where `fixturePIData` is a hand-built `PIData` object with no Prisma involvement
- **THEN** `renderToBuffer` MUST return a valid PDF `Buffer` and the component module MUST NOT import from `@prisma/client` or `src/lib/db`
