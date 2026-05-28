import { inquiryToPIData, type InquiryWithRelations } from "../inquiry-to-pi-data";

function makeInquiry(overrides: Partial<InquiryWithRelations> = {}): InquiryWithRelations {
  const base: InquiryWithRelations = {
    id: "11111111-2222-3333-4444-555555555555",
    buyer_id: "b-id",
    seller_id: "s-id",
    product_id: "p-id",
    quantity: 100,
    target_price: 10,
    quoted_price: 12,
    quoted_quantity: 100,
    quotation_notes: "Thank you for your inquiry.",
    quotation_version: 1,
    quotation_history: null,
    delivery_terms: "FOB",
    port_of_destination: "Port of Tokyo",
    payment_terms: "T/T 30%/70%",
    notes: "Buyer notes",
    status: "replied",
    quotation_pdf_url: null,
    expires_at: new Date("2026-12-31"),
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-02"),
    product: {
      id: "p-id",
      seller_id: "s-id",
      name: "台灣愛文芒果 (Mango Premium)",
      description: "屏東枋山愛文芒果",
      hs_code: "0804.50",
      category: "food",
      images: [],
      specs: null,
      moq: 200,
      unit: "kg",
      price_min: 12,
      price_max: 18,
      currency: "USD",
      origin_country: "TW",
      certifications: [],
      lead_time_days: 7,
      status: "published",
      created_at: new Date("2025-01-01"),
      updated_at: new Date("2025-01-02"),
      deleted_at: null,
    },
    buyer: {
      id: "b-id",
      email: "buyer@example.com",
      password_hash: null,
      type: "company",
      status: "active",
      role: "user",
      email_verified_at: null,
      display_name: "Yamada Taro",
      avatar_url: null,
      locale: "ja-JP",
      created_at: new Date("2025-01-01"),
      updated_at: new Date("2025-01-02"),
      deleted_at: null,
      company: {
        user_id: "b-id",
        tax_id: "JP-123",
        name: "Tokyo Trading Co., Ltd.",
        address: "東京都千代田区丸の内 2-7-2",
        owner_name: null,
        business_items: [],
        industry: null,
        employee_size: null,
        contact_name: "Yamada Taro",
        contact_phone: "+81-3-1234-5678",
        verified: true,
        verified_source: null,
        created_at: new Date("2025-01-01"),
        updated_at: new Date("2025-01-02"),
      },
    },
    seller: {
      id: "s-id",
      email: "seller@example.com",
      password_hash: null,
      type: "company",
      status: "active",
      role: "user",
      email_verified_at: null,
      display_name: "Jacky Chen",
      avatar_url: null,
      locale: "zh-TW",
      created_at: new Date("2025-01-01"),
      updated_at: new Date("2025-01-02"),
      deleted_at: null,
      company: {
        user_id: "s-id",
        tax_id: "TW-123",
        name: "Horizon AI Trading",
        address: "Taipei, Taiwan",
        owner_name: null,
        business_items: [],
        industry: null,
        employee_size: null,
        contact_name: "Jacky Chen",
        contact_phone: "+886-2-0000-0000",
        verified: true,
        verified_source: null,
        created_at: new Date("2025-01-01"),
        updated_at: new Date("2025-01-02"),
      },
    },
  } as InquiryWithRelations;
  return { ...base, ...overrides };
}

describe("inquiryToPIData()", () => {
  it("is pure: deep-equal input produces deep-equal output", () => {
    const a = inquiryToPIData(makeInquiry());
    const b = inquiryToPIData(makeInquiry());
    expect(a).toEqual(b);
  });

  it("does not mutate its input", () => {
    const inquiry = makeInquiry();
    const snapshot = JSON.parse(JSON.stringify(inquiry));
    inquiryToPIData(inquiry);
    expect(JSON.parse(JSON.stringify(inquiry))).toEqual(snapshot);
  });

  it("maps the buyer into the customer block (contact name + company name)", () => {
    const data = inquiryToPIData(makeInquiry());
    expect(data.customer.name).toBe("Yamada Taro");
    expect(data.customer.company_name).toBe("Tokyo Trading Co., Ltd.");
    expect(data.customer.street_address).toBe("東京都千代田区丸の内 2-7-2");
    expect(data.customer.phone).toBe("+81-3-1234-5678");
  });

  it("renders customer block as em-dash when buyer.company is null", () => {
    const inquiry = makeInquiry({
      buyer: { ...makeInquiry().buyer, company: null },
    });
    const data = inquiryToPIData(inquiry);
    expect(data.customer.name).toBe("Yamada Taro"); // contact falls back to display_name
    expect(data.customer.company_name).toBe("Yamada Taro"); // company falls back to display_name
    expect(data.customer.street_address).toBe("—");
    expect(data.customer.phone).toBe("—");
  });

  it("renders customer fields as em-dash when company, display_name, and email are all missing", () => {
    const baseBuyer = makeInquiry().buyer;
    const inquiry = makeInquiry({
      buyer: { ...baseBuyer, company: null, display_name: null, email: "" },
    });
    const data = inquiryToPIData(inquiry);
    expect(data.customer.name).toBe("—");
    expect(data.customer.company_name).toBe("—");
    expect(data.customer.street_address).toBe("—");
  });

  it("renders line-item description and unit of measure as em-dash when product is null", () => {
    const inquiry = makeInquiry({ product: null });
    const data = inquiryToPIData(inquiry);
    expect(data.line_items).toHaveLength(1);
    expect(data.line_items[0].description).toBe("—");
    expect(data.line_items[0].unit_of_measure).toBe("—");
  });

  it("flows quoted_price and quoted_quantity into the single line-items row and totals", () => {
    const inquiry = makeInquiry({ quoted_price: 15, quoted_quantity: 1000 });
    const data = inquiryToPIData(inquiry);
    expect(data.line_items).toHaveLength(1);
    expect(data.line_items[0].qty).toBe("1000");
    expect(data.line_items[0].unit_price).toBe("15");
    expect(data.line_items[0].total_amount).toBe("15000");
    expect(data.totals.subtotal).toBe("15000");
    expect(data.totals.total).toBe("15000");
  });

  it("falls back to inquiry.quantity when quoted_quantity is missing", () => {
    const inquiry = makeInquiry({ quoted_quantity: null, quoted_price: null });
    const data = inquiryToPIData(inquiry);
    expect(data.line_items[0].qty).toBe("100");
    expect(data.line_items[0].unit_price).toBe("—");
    expect(data.line_items[0].total_amount).toBe("—");
  });

  it("maps trade fields into terms-of-sale and additional details", () => {
    const data = inquiryToPIData(makeInquiry());
    expect(data.terms_of_sale.delivery_terms).toBe("FOB");
    expect(data.terms_of_sale.payment_terms).toBe("T/T 30%/70%");
    expect(data.terms_of_sale.comments).toBe("Thank you for your inquiry.");
    expect(data.additional.country_of_origin).toBe("TW");
    expect(data.additional.port_of_discharge).toBe("Port of Tokyo");
    expect(data.totals.currency).toBe("USD");
  });

  it("renders schema-absent fields as em-dash", () => {
    const data = inquiryToPIData(makeInquiry());
    expect(data.metadata.invoice_no).toBe("—");
    expect(data.metadata.expiration_date).toBe("—");
    expect(data.shipping.freight_type).toBe("—");
    expect(data.shipping.est_cubic_weight).toBe("—");
    expect(data.line_items[0].part_number).toBe("—");
    expect(data.line_items[0].tax).toBe("—");
    expect(data.totals.freight).toBe("—");
    expect(data.additional.port_of_embarkation).toBe("—");
    expect(data.additional.reason_for_export).toBe("—");
    expect(data.signature.typed_name).toBe("—");
  });

  it("sets the signature company to the seller's company", () => {
    const data = inquiryToPIData(makeInquiry());
    expect(data.signature.company_name).toBe("Horizon AI Trading");
  });
});
