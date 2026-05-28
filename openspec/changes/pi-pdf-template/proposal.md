## Why

The current quotation PDF (`createSimplePdf` in `src/lib/pdf.ts`) emits hand-rolled PDF bytes using Helvetica only. Two concrete problems: (1) CJK characters in seller/buyer company names render as empty boxes because Helvetica has no CJK glyphs, and the trade workspace seeds and tests contain Traditional Chinese and Japanese names; (2) the output is a flat text dump that bears no visual relationship to the Pro Forma Invoice template defined in the product mock — the slide explicitly labels the current output as "目前為示意" placeholder. Replacing the renderer now unblocks downstream PI work (line-item schema, shipping details, tax breakdown) that will plug into the new template without re-doing the layout pass.

## What Changes

- Add `@react-pdf/renderer` as a production dependency
- Vendor `Noto Sans CJK Regular` TTF into the repo so seller and buyer names render correctly in TC/SC/JP/KR
- Add a `<ProFormaInvoice>` React-PDF component tree implementing the slide 3 layout: seller header block, customer block, shipping details box, line items table, totals breakdown, additional details, signature block
- Add a pure adapter `inquiryToPIData(inquiry)` that maps the Prisma `Inquiry` payload (with included product, buyer.company, seller.company) into a stable `PIData` interface — fields not yet stored on `Inquiry` resolve to em-dash `—`
- Add a `renderProFormaInvoice(data)` orchestrator that returns a `Buffer`
- Swap the `createSimplePdf(...)` call in `src/app/api/trade/inquiries/[id]/quotation.pdf/route.ts` for `renderProFormaInvoice(inquiryToPIData(inquiry))`
- Preserve the existing GET side-effects on the route verbatim (`quotation_pdf_url` set on every download, `sent → replied` status flip) — this smell is deliberately deferred to a separate follow-up change
- Leave `src/lib/pdf.ts` (the old `createSimplePdf`) in place as dead code until a follow-up removes it
- Seller and buyer blocks auto-populate from `CompanyProfile`; Shinka Global LLC in the mock is only an example, not a hard-coded constant

## Capabilities

### New Capabilities

- `quotation-pdf`: Server-side rendering of the Pro Forma Invoice PDF for a trade inquiry, including the data adapter that maps `Inquiry` → `PIData` and the React-PDF component tree that renders it.

### Modified Capabilities

(none)

## Impact

- Affected specs: new `quotation-pdf` capability
- Affected code:
  - New:
    - `src/lib/pdf/pro-forma-invoice.tsx`
    - `src/lib/pdf/pi-data.ts`
    - `src/lib/pdf/inquiry-to-pi-data.ts`
    - `src/lib/pdf/render.ts`
    - `src/lib/pdf/fonts/NotoSansCJK-Regular.ttf`
    - `src/lib/pdf/__tests__/inquiry-to-pi-data.test.ts`
    - `src/lib/pdf/__tests__/render.test.ts`
  - Modified:
    - `src/app/api/trade/inquiries/[id]/quotation.pdf/route.ts`
    - `package.json` (add `@react-pdf/renderer`)
  - Removed: (none — `src/lib/pdf.ts` left as dead code, removal deferred)
- Affected dependencies: new production dep `@react-pdf/renderer`; deployment size increases by ~10 MB for the vendored CJK font
- Affected systems: the `GET /api/trade/inquiries/[id]/quotation.pdf` response body changes shape (still `Content-Type: application/pdf`, same filename pattern) — no breaking API change, but visual output is materially different
