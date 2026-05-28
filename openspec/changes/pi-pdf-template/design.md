## Context

The current quotation PDF route (`src/app/api/trade/inquiries/[id]/quotation.pdf/route.ts`) calls `createSimplePdf` (`src/lib/pdf.ts`), a hand-rolled PDF byte assembler. It embeds only Helvetica, so any non-Latin-1 glyph in seller or buyer names renders as an empty box. The trade workspace targets Taiwan and Japan, so Traditional Chinese and Japanese names appear in every seeded inquiry. The output is also a flat text dump with one field per line — no boxes, tables, or alignment — which makes it unsuitable as a real Pro Forma Invoice and explicitly labelled "目前為示意" in the product mock.

The route currently allows either buyer or seller to GET the PDF (it finds the inquiry by `OR: [{ buyer_id }, { seller_id }]`), and on every GET it updates `quotation_pdf_url` and flips status `sent → replied`. This side-effect is a known smell (recorded in `memory/project_pdf_route_side_effect.md`) and is deliberately preserved by this change.

Seller and buyer blocks of the PI come from `CompanyProfile` records — `name`, `address`, `contact_name`, `contact_phone`. The "Shinka Global LLC" example in the slide is just an example, not a hard-coded constant.

The `Inquiry` schema feeds only a single product/quote pair, not the multi-line items table the PI mock shows. Other PI fields (freight type, est ship date, weights, totals breakdown, port of embarkation, country of origin, invoice number, expiration date, customer ID) are not in the schema yet. The schema expansion is a separate future change; this change renders the full PI layout against current data with em-dash placeholders for fields that have no source.

## Goals / Non-Goals

**Goals:**

- Replace the flat-text PDF with a Pro Forma Invoice layout that visually matches the product mock (boxed sections, line items table, totals breakdown, signature block)
- Render Traditional Chinese, Japanese, and other CJK glyphs correctly in seller, buyer, product, and notes fields
- Establish a clean seam between data-source (`Inquiry` Prisma payload) and presentation (React-PDF component tree) so future schema work changes only the adapter
- Keep the public route contract stable: same URL, same `Content-Type: application/pdf`, same filename pattern, same caller auth rules
- Provide independently testable units: pure adapter, pure renderer, route as the integration seam

**Non-Goals:**

- Schema expansion: no migration for `QuoteLineItem`, shipping details columns, totals breakdown columns, `country_of_origin`, `port_of_embarkation`, `invoice_no`, `expiration_date`, `customer_id`, or `CompanyProfile.fax`/`website`. These are out of scope; the PDF renders em-dash for fields it cannot populate.
- Form UI: no structured input form for line items, shipping, or totals in `/trade/quotations`. The free-text quotation_notes textarea stays.
- Adding a 「下載 PDF」 button to `quotation-workspace.tsx` (currently only `/trade` and the buyer inbox expose it).
- Cleaning up the GET-mutates-state side-effect. Behavior is preserved verbatim; cleanup is a separate change.
- Restructuring `CompanyProfile.address` into street/city/state/postal_code/country.
- Adding returns/warranty (退換貨與售後保固) field to `Product` (slide 2 gap, separate change).
- Snapshot-on-send (persisting a frozen `QuotationSnapshot` JSON on the inquiry). Considered and deferred — would touch the PATCH route and `quotation_history` shape, out of V1 scope.

## Decisions

### Use @react-pdf/renderer for rendering

React-PDF provides JSX-style component composition over a layout primitive set (`Page`, `View`, `Text`, `StyleSheet` with flex) that maps directly to the boxed PI layout. It runs natively on Vercel Functions with no native binary, registers custom fonts via `Font.register({ src: path })`, and produces a `Buffer` from a single component tree. Server-side `renderToBuffer` API is exactly what the route needs.

Alternatives considered:

- `pdfkit` — imperative, requires manual coordinate math for tables and alignment. Painful for the multi-column line items grid and the totals box.
- Puppeteer / Playwright HTML→PDF — highest visual fidelity but pulls in Chromium (~50–100 MB compressed), 1–3 s cold starts on Vercel Functions, and Chromium maintenance overhead. Overkill for an invoice.
- Continue with hand-rolled bytes in `createSimplePdf` — would have to embed and reference fonts manually for CJK; significant effort for minimal benefit over picking a library.

### Bundle Noto Sans CJK font in the repo

Vendor `NotoSansCJK-Regular.ttf` into `src/lib/pdf/fonts/`. The file shipped is the legacy Adobe Noto Sans CJK TC subset (sourced from `notofonts/noto-cjk/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf`, ~15.7 MiB). It is the only modern Noto CJK distribution whose internal name table carries the literal `Noto Sans CJK` family string — current Google Fonts releases use language-scoped names like `Noto Sans TC`, which the buffer assertion in task 3.2 cannot match. The file is saved with a `.ttf` extension for filename consistency with the route module; fontkit detects OTF by magic bytes regardless of extension. The font's CJK Unified Ideographs subset covers Traditional Chinese, Simplified Chinese, and Japanese kanji glyphs needed for seller/buyer/product fields. Register once at module load in `render.ts` via `Font.register({ family: 'Noto Sans CJK', src: path.join(...) })`. Deterministic, no network at runtime, no cold-start fetch latency. Vercel function size limit (250 MB unzipped) absorbs the ~16 MB easily.

Alternatives considered:

- Load font from URL (Vercel Blob or Google Fonts CDN) — keeps deployment slim but adds 100–300 ms cold-start fetch and an external runtime dependency. PDF render fails if the CDN is unreachable.
- Ship one font per script (Noto Sans TC + Noto Sans JP) — smaller bundle (3–5 MB total) but requires per-text-run font selection logic, which is messy when a single inquiry mixes Traditional Chinese (seller) and Japanese (buyer).

### Adapter layer pattern Prisma Inquiry to PIData

A pure function `inquiryToPIData(inquiry)` maps the Prisma payload to a stable `PIData` interface that mirrors the PI mock. The React-PDF component receives only `PIData` and has no Prisma awareness. Em-dash fallback logic lives in the adapter, not scattered through JSX.

This isolates the renderer from future schema changes: when `QuoteLineItem` and shipping/totals columns land, only the adapter file changes. The renderer signature stays the same.

Alternatives considered:

- Direct render from Inquiry payload — fewer files, but couples the JSX to Prisma shape. Fallback logic ends up sprinkled in `<Text>` nodes. When the schema changes, every cell in the template has to be revisited.
- Snapshot-on-send — persist a `QuotationSnapshot` JSON when the seller sends the quotation; PDF renders the snapshot. Listed in Non-Goals; revisit when the proper `Quote` schema lands.

### Em-dash for unstored fields

Every PI cell whose data source is not yet in the schema renders as em-dash (`—`). Section structure — boxes, headers, the line items grid — always renders, never conditionally hidden. The em-dash is finance/invoice typographic convention for "no value present" and disambiguates missing data from intentional zero. Fallback applies in the adapter via a single `dash(value)` helper.

Alternatives considered:

- Empty cells — boxes render but cells stay blank. Ambiguous for numeric fields (blank vs. zero).
- Bracketed labels like `[TBD]` — loud "this is a placeholder" signal. Useful for stakeholder demos but unprofessional if a real buyer receives the PDF.

### Match the PI 公版 layout exactly

The React-PDF component reproduces the structure of the shared PI 公版 (Pro Forma Invoice) Excel mock rather than an approximate boxed layout: title placement (top-right, steel blue), dark-blue section header bars with white text (`CUSTOMER`, `SHIPPING DETAILS`, `TERMS OF SALE AND OTHER COMMENTS`, `ADDITIONAL DETAILS`, and the line-items header), the seven line-item columns (`PART NUMBER`, `UNIT OF MEASURE`, `DESCRIPTION`, `QTY`, `UNIT PRICE`, `TAX`, `TOTAL AMOUNT`), the full totals column (Subtotal, Taxable, Tax rate, Tax, Freight, Insurance, Legal/Consular Inspection/Cert., Other ×2, TOTAL, Currency), and the Additional Details block (Country of Origin, Port of Embarkation, Port of Discharge, Reason for Export) with the certification statement and signature area. Fields the current schema cannot source render em-dash, exactly as for any other unstored field. `port_of_destination` maps to the mock's Port of Discharge; `product.origin_country` maps to Country of Origin; `delivery_terms`/`payment_terms`/`quotation_notes` populate the Terms of Sale block.

### Preserve GET side-effect behavior verbatim

The route currently sets `quotation_pdf_url` and flips `status: sent → replied` on every GET. This change keeps the mutation block byte-for-byte identical. The smell is recorded in `memory/project_pdf_route_side_effect.md` for a separate follow-up change. Conflating "render PDF" and "send quotation" into one GET is wrong, but cleaning it up requires touching the seller workspace UI and is out of scope here.

### Leave createSimplePdf as dead code

`src/lib/pdf.ts` becomes unused after the route swap. Leaving it in place keeps the diff narrowly scoped — its deletion is a one-line follow-up that does not need to ship with this change. A task entry flags it for follow-up.

### Font registration strategy

`Font.register` is called at module top-level in `render.ts`, not inside `renderProFormaInvoice`. React-PDF caches registrations process-wide. Calling it inside the function would re-register on every request (idempotent but wasteful). Top-level registration runs once when the route module is imported. Font path is resolved via `path.join(process.cwd(), 'src/lib/pdf/fonts/NotoSansCJK-Regular.ttf')` so it works in both Next.js dev (project root) and Vercel build output.

## Implementation Contract

**Behavior:**

- `GET /api/trade/inquiries/:id/quotation.pdf` returns a PDF body with `Content-Type: application/pdf` and `Content-Disposition: inline; filename="quotation-<short-id>.pdf"` (same header shape as today).
- The rendered PDF is a single A4 page (595×842 pt) laid out to match the PI 公版 mock: an upper region with the seller block (top-left, framed) and a `CUSTOMER` block beneath it on the left, and the `PRO FORMA INVOICE` title (top-right, steel blue) over a right-aligned metadata grid (Date, Expiration Date, Invoice #, Customer ID) above a `SHIPPING DETAILS` block; then a line items table with columns `PART NUMBER · UNIT OF MEASURE · DESCRIPTION · QTY · UNIT PRICE · TAX · TOTAL AMOUNT` (filler rows pad the body); then a lower region with a `TERMS OF SALE AND OTHER COMMENTS` block (left) beside a totals breakdown (right) listing Subtotal, Taxable, Tax rate, Tax, Freight, Insurance, Legal/Consular Inspection/Cert., Other (specify) ×2, a highlighted TOTAL, and Currency; then an `ADDITIONAL DETAILS` block (Country of Origin, Port of Embarkation, Port of Discharge, Reason for Export) with the certification statement and a signature area (typed name, company, date). Section bars use a dark-blue background with white text.
- CJK glyphs (Traditional Chinese, Simplified Chinese, Japanese, Korean) render correctly using the bundled Noto Sans CJK font.
- Any field whose data source is missing renders as em-dash (`—`); the surrounding box, header, or table row still draws.
- The route preserves the existing side-effect: every GET sets `inquiry.quotation_pdf_url` to the route path and, if the inquiry status is `sent`, flips it to `replied`. Any other status is left unchanged.
- The route preserves the existing access control: it returns the PDF if the requester is either the buyer or seller of the inquiry, and `RESOURCE_NOT_FOUND` otherwise.

**Interface / data shape:**

- `PIData` (in `src/lib/pdf/pi-data.ts`) is a TypeScript interface mirroring the PI 公版 sections: `metadata` (date, expiration_date, invoice_no, customer_id), `seller` (company_name, street_address, city_state_zip, phone, fax, website), `customer` (name, company_name, street_address, city_state_zip, phone), `shipping` (freight_type, est_ship_date, est_gross_weight, est_cubic_weight, total_packages), `line_items` (array — currently length 1 — of part_number, unit_of_measure, description, qty, unit_price, tax, total_amount), `totals` (subtotal, taxable, tax_rate, tax, freight, insurance, legal_consular, other1, other2, total, currency), `terms_of_sale` (delivery_terms, payment_terms, comments), `additional` (country_of_origin, port_of_embarkation, port_of_discharge, reason_for_export), and `signature` (typed_name, company_name, date). All fields are typed as `string` (already-formatted display values) so the renderer does no formatting.
- `inquiryToPIData(inquiry: InquiryWithRelations): PIData` is a pure function. `InquiryWithRelations` is the Prisma type from `findFirst({ include: { product, buyer: { include: { company } }, seller: { include: { company } } } })`. The function reads only those four relations; no DB calls.
- `<ProFormaInvoice data={piData} />` is a React-PDF component (`Document` → `Page` → nested `View` boxes and `Text` nodes). Receives only `PIData`. No imports from Prisma or `src/lib/db`.
- `renderProFormaInvoice(data: PIData): Promise<Buffer>` calls React-PDF's `renderToBuffer(<ProFormaInvoice data={data} />)`. Returns a Node `Buffer` suitable for the `Response` body.

**Failure modes:**

- If the font file is missing at module-load time, React-PDF surfaces a registration error at the first render. Surface this as a 500 from the route — do not silently fall back to a missing-glyph PDF.
- If the Prisma payload is missing expected relations (e.g., `product` is null because of a bad join), the adapter returns `PIData` with em-dashes for the affected fields; render still succeeds.
- If `renderToBuffer` throws, the route's existing `handleError` wraps it as a 500 response.
- The adapter never throws; missing data always resolves to em-dash.

**Acceptance criteria:**

- Adapter unit tests (`src/lib/pdf/__tests__/inquiry-to-pi-data.test.ts`) assert: missing product → product line items show em-dash; missing company on buyer → buyer block fields show em-dash; CJK characters pass through unchanged; `quoted_price` / `quoted_quantity` feed into the line items row.
- Renderer smoke test (`src/lib/pdf/__tests__/render.test.ts`) asserts: `renderProFormaInvoice(fixturePIData)` returns a `Buffer` whose first bytes are the PDF magic header `%PDF-`; render does not throw for a `PIData` with all em-dash fields.
- Route integration test asserts: response has `Content-Type: application/pdf`, `Content-Disposition` filename matches `quotation-<8 hex chars>.pdf`, and `quotation_pdf_url` is set on the inquiry after the request.
- Manual verification using existing seeded data (`scripts/local/seed-quotations.ts` provides 6 inquiries with CJK content): GET `/api/trade/inquiries/<id>/quotation.pdf` for at least one `replied` and one `negotiating` row from both the seller-side and buyer-side seeds renders a PI-shaped PDF with company names visible in their original scripts.

**Scope boundaries:**

In scope: the new PDF renderer, the adapter, the font bundle, the route swap. Behavior at the existing route URL is the only public surface that changes (visually, not contractually). Tests for adapter and renderer. `package.json` dependency add.

Out of scope: schema migrations, form UI changes, the GET side-effect cleanup, deletion of the old `createSimplePdf`, additions to `CompanyProfile`. These are listed under Non-Goals; do not let them creep in.

## Risks / Trade-offs

- [Bundle size adds ~10 MB from the CJK font] → acceptable within Vercel's 250 MB function size limit. If this becomes a problem, fall back to URL-loaded font (the "Bundle Noto Sans CJK font in the repo" decision lists this alternative).
- [React-PDF's flex layout is not identical to web CSS flex] → layout may need iteration to match the mock precisely. Mitigation: ship the structure first (boxes in roughly the right places), refine spacing in a follow-up pass.
- [Font file in git inflates repo size] → use Git LFS if the operator prefers; otherwise live with a one-time ~10 MB bump. Mitigation: a note in tasks to optionally configure LFS for `*.ttf` if repo size becomes a concern.
- [Preserved GET side-effect is a known correctness issue] → flagged in `memory/project_pdf_route_side_effect.md`. Anyone debugging "why did the inquiry flip to replied?" can find the explanation. Mitigation: separate change planned.
- [Schema gaps mean most fields render as em-dash on day one] → the PDF will look like a partially-completed PI to anyone unfamiliar with the rollout plan. Mitigation: this is by design and documented in Non-Goals; the layout is in place to absorb future schema work without re-doing it.
