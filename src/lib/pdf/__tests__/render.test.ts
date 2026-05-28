import { describe, expect, it, jest } from "@jest/globals";
import fs from "fs";
import path from "path";
import { renderProFormaInvoice } from "../render";
import { dash, type PIData } from "../pi-data";

function emDashAll(): PIData {
  const d = () => dash(null);
  return {
    metadata: { date: d(), expiration_date: d(), invoice_no: d(), customer_id: d() },
    seller: {
      company_name: d(),
      street_address: d(),
      city_state_zip: d(),
      phone: d(),
      fax: d(),
      website: d(),
    },
    customer: {
      name: d(),
      company_name: d(),
      street_address: d(),
      city_state_zip: d(),
      phone: d(),
    },
    shipping: {
      freight_type: d(),
      est_ship_date: d(),
      est_gross_weight: d(),
      est_cubic_weight: d(),
      total_packages: d(),
    },
    line_items: [
      {
        part_number: d(),
        unit_of_measure: d(),
        description: d(),
        qty: d(),
        unit_price: d(),
        tax: d(),
        total_amount: d(),
      },
    ],
    totals: {
      subtotal: d(),
      taxable: d(),
      tax_rate: d(),
      tax: d(),
      freight: d(),
      insurance: d(),
      legal_consular: d(),
      other1: d(),
      other2: d(),
      total: d(),
      currency: d(),
    },
    terms_of_sale: { delivery_terms: d(), payment_terms: d(), comments: d() },
    additional: {
      country_of_origin: d(),
      port_of_embarkation: d(),
      port_of_discharge: d(),
      reason_for_export: d(),
    },
    signature: { typed_name: d(), company_name: d(), date: d() },
  };
}

function filled(): PIData {
  return {
    metadata: {
      date: "2026-05-28",
      expiration_date: "2026-06-28",
      invoice_no: "PI-2026-001",
      customer_id: "C-001",
    },
    seller: {
      company_name: "Horizon AI Trading",
      street_address: "Taipei, Taiwan",
      city_state_zip: "Taipei 100",
      phone: "+886-2-0000-0000",
      fax: "+886-2-0000-0001",
      website: "horizon-ai.ai",
    },
    customer: {
      name: "Yamada Taro",
      company_name: "Tokyo Trading Co., Ltd.",
      street_address: "東京都千代田区丸の内 2-7-2",
      city_state_zip: "Tokyo 100-7014",
      phone: "+81-3-1234-5678",
    },
    shipping: {
      freight_type: "Air",
      est_ship_date: "2026-06-15",
      est_gross_weight: "120 kg",
      est_cubic_weight: "1.2 m3",
      total_packages: "10",
    },
    line_items: [
      {
        part_number: "MGO-001",
        unit_of_measure: "kg",
        description: "台灣愛文芒果 (Mango Premium)",
        qty: "1000",
        unit_price: "15",
        tax: "X",
        total_amount: "15000",
      },
    ],
    totals: {
      subtotal: "15000",
      taxable: "15000",
      tax_rate: "0%",
      tax: "0",
      freight: "500",
      insurance: "100",
      legal_consular: "50",
      other1: "0",
      other2: "0",
      total: "15650",
      currency: "USD",
    },
    terms_of_sale: {
      delivery_terms: "FOB",
      payment_terms: "L/C at sight",
      comments: "日本和牛 A5 reference order. Lead time 7 days after L/C confirmation.",
    },
    additional: {
      country_of_origin: "TW",
      port_of_embarkation: "Taoyuan TPE",
      port_of_discharge: "Port of Tokyo",
      reason_for_export: "Sale",
    },
    signature: {
      typed_name: "Jacky Chen",
      company_name: "Horizon AI Trading",
      date: "2026-05-28",
    },
  };
}

function asciiFilled(): PIData {
  const f = filled();
  f.customer.street_address = "2-7-2 Marunouchi, Chiyoda-ku, Tokyo";
  f.line_items[0].description = "Mango Premium (Aiwen)";
  f.terms_of_sale.comments =
    "Wagyu A5 reference order. Lead time 7 days after L/C confirmation.";
  return f;
}

describe("renderProFormaInvoice()", () => {
  jest.setTimeout(30000);

  it("returns a Buffer whose first bytes are the PDF magic header", async () => {
    const buf = await renderProFormaInvoice(filled());
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("embeds a font reference for the Noto Sans CJK family in the buffer", async () => {
    const data = filled();
    data.line_items[0].description = "台灣愛文芒果";
    data.terms_of_sale.comments = "日本和牛 A5 reference order.";
    const buf = await renderProFormaInvoice(data);
    // react-pdf embeds the font's PostScript name (NotoSansCJKtc-Regular), not
    // the registered family display name, so the buffer carries the spaceless
    // form `NotoSansCJK`.
    expect(buf.includes("NotoSansCJK")).toBe(true);
  });

  it("renders all section boxes for an all-em-dash fixture (byte length at least 50% of an ASCII-filled fixture)", async () => {
    // Compare against an ASCII-only filled fixture so both PDFs embed a
    // similarly-small font subset; otherwise the CJK glyph outlines in a
    // CJK-filled fixture dominate byte size and swamp the structural signal.
    const emptyBuf = await renderProFormaInvoice(emDashAll());
    const filledBuf = await renderProFormaInvoice(asciiFilled());
    const ratio = emptyBuf.length / filledBuf.length;
    expect(ratio).toBeGreaterThanOrEqual(0.5);
  });

  it("does not register the font inside the renderProFormaInvoice function body", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/pdf/render.ts"),
      "utf8"
    );
    const fnStart = source.indexOf("export async function renderProFormaInvoice");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = source.slice(fnStart);
    expect(fnBody.includes("Font.register")).toBe(false);
  });
});
