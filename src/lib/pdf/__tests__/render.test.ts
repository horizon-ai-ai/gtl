import { describe, expect, it, jest } from "@jest/globals";
import fs from "fs";
import path from "path";
import { renderProFormaInvoice } from "../render";
import { dash, type PIData } from "../pi-data";

function emDashAll(): PIData {
  return {
    metadata: {
      invoice_no: dash(null),
      invoice_date: dash(null),
      expiration_date: dash(null),
      customer_id: dash(null),
    },
    seller: {
      name: dash(null),
      address: dash(null),
      contact_name: dash(null),
      contact_phone: dash(null),
    },
    customer: {
      name: dash(null),
      address: dash(null),
      contact_name: dash(null),
      contact_phone: dash(null),
    },
    shipping: {
      freight_type: dash(null),
      est_ship_date: dash(null),
      est_gross_weight: dash(null),
      est_net_weight: dash(null),
      package_count: dash(null),
      country_of_origin: dash(null),
      port_of_embarkation: dash(null),
      port_of_destination: dash(null),
      delivery_terms: dash(null),
      payment_terms: dash(null),
    },
    line_items: [
      {
        description: dash(null),
        quantity: dash(null),
        unit: dash(null),
        unit_price: dash(null),
        amount: dash(null),
      },
    ],
    totals: {
      subtotal: dash(null),
      tax_rate: dash(null),
      tax: dash(null),
      total: dash(null),
      currency: dash(null),
    },
    additional_details: dash(null),
    signature: {
      typed_name: dash(null),
      date: dash(null),
    },
  };
}

function filled(): PIData {
  return {
    metadata: {
      invoice_no: "PI-2026-001",
      invoice_date: "2026-05-28",
      expiration_date: "2026-06-28",
      customer_id: "C-001",
    },
    seller: {
      name: "Horizon AI Trading",
      address: "Taipei, Taiwan",
      contact_name: "Jacky Chen",
      contact_phone: "+886-2-0000-0000",
    },
    customer: {
      name: "Tokyo Trading Co., Ltd.",
      address: "東京都千代田区丸の内 2-7-2",
      contact_name: "Yamada Taro",
      contact_phone: "+81-3-1234-5678",
    },
    shipping: {
      freight_type: "Air",
      est_ship_date: "2026-06-15",
      est_gross_weight: "120 kg",
      est_net_weight: "100 kg",
      package_count: "10",
      country_of_origin: "TW",
      port_of_embarkation: "Taoyuan TPE",
      port_of_destination: "Port of Tokyo",
      delivery_terms: "FOB",
      payment_terms: "T/T 30%/70%",
    },
    line_items: [
      {
        description: "台灣愛文芒果 (Mango Premium)",
        quantity: "1000",
        unit: "kg",
        unit_price: "15",
        amount: "15000",
      },
    ],
    totals: {
      subtotal: "15000",
      tax_rate: "0",
      tax: "0",
      total: "15000",
      currency: "USD",
    },
    additional_details:
      "日本和牛 A5 (reference order). Lead time 7 days after L/C confirmation.",
    signature: {
      typed_name: "Jacky Chen",
      date: "2026-05-28",
    },
  };
}

function asciiFilled(): PIData {
  const f = filled();
  f.customer.address = "2-7-2 Marunouchi, Chiyoda-ku, Tokyo";
  f.line_items[0].description = "Mango Premium (Aiwen)";
  f.additional_details =
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
    data.additional_details = "日本和牛 A5 reference order.";
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
