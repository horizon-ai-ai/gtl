import type { InquiryWithRelations } from "@/lib/pdf/inquiry-to-pi-data";

const SELLER_ID = "seller-uuid";
const BUYER_ID = "buyer-uuid";
const STRANGER_ID = "stranger-uuid";
const INQUIRY_ID = "abcdef12-3456-7890-abcd-ef1234567890";

const store = new Map<string, InquiryWithRelations>();

function makeInquiry(
  overrides: Partial<InquiryWithRelations> = {}
): InquiryWithRelations {
  return {
    id: INQUIRY_ID,
    buyer_id: BUYER_ID,
    seller_id: SELLER_ID,
    product_id: "p-id",
    quantity: 1000,
    target_price: 13,
    quoted_price: 15,
    quoted_quantity: 1000,
    quotation_notes: "Thank you.",
    quotation_version: 1,
    quotation_history: null,
    delivery_terms: "FOB",
    port_of_destination: "Port of Tokyo",
    payment_terms: "L/C at sight",
    notes: null,
    status: "sent",
    quotation_pdf_url: null,
    expires_at: new Date("2026-12-31"),
    created_at: new Date("2026-01-01"),
    updated_at: new Date("2026-01-02"),
    product: {
      id: "p-id",
      seller_id: SELLER_ID,
      name: "台灣愛文芒果 (Mango Premium)",
      description: null,
      hs_code: null,
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
      id: BUYER_ID,
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
        user_id: BUYER_ID,
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
      id: SELLER_ID,
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
        user_id: SELLER_ID,
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
    ...overrides,
  } as InquiryWithRelations;
}

const inquiryDelegate = {
  findFirst: jest.fn(
    async ({
      where,
    }: {
      where: {
        id: string;
        OR: Array<{ buyer_id?: string; seller_id?: string }>;
      };
    }) => {
      const row = store.get(where.id);
      if (!row) return null;
      const allowed = where.OR.some(
        (clause) =>
          (clause.buyer_id !== undefined && clause.buyer_id === row.buyer_id) ||
          (clause.seller_id !== undefined && clause.seller_id === row.seller_id)
      );
      return allowed ? row : null;
    }
  ),
  update: jest.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { quotation_pdf_url: string; status: InquiryWithRelations["status"] };
    }) => {
      const row = store.get(where.id);
      if (!row) throw new Error("not found");
      row.quotation_pdf_url = data.quotation_pdf_url;
      row.status = data.status;
      return row;
    }
  ),
};

const authMock = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: { inquiry: inquiryDelegate },
}));

jest.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

jest.mock("@/lib/pdf/render", () => ({
  renderProFormaInvoice: jest.fn(async () => Buffer.from("%PDF-1.3\nmock", "utf8")),
}));

import { GET } from "../route";

function ctx(id: string) {
  return { params: { id } };
}

beforeEach(() => {
  store.clear();
  inquiryDelegate.findFirst.mockClear();
  inquiryDelegate.update.mockClear();
  authMock.mockReset();
});

describe("GET /api/trade/inquiries/[id]/quotation.pdf", () => {
  it("(a) seller GET returns 200 with application/pdf body starting %PDF-", async () => {
    store.set(INQUIRY_ID, makeInquiry({ status: "replied" }));
    authMock.mockResolvedValue({ user: { id: SELLER_ID } });

    const res = await GET(new Request("http://localhost"), ctx(INQUIRY_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("(b) buyer GET returns 200 with the correct Content-Disposition filename", async () => {
    store.set(INQUIRY_ID, makeInquiry({ status: "replied" }));
    authMock.mockResolvedValue({ user: { id: BUYER_ID } });

    const res = await GET(new Request("http://localhost"), ctx(INQUIRY_ID));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe(
      `inline; filename="quotation-${INQUIRY_ID.slice(0, 8)}.pdf"`
    );
    expect(INQUIRY_ID.slice(0, 8)).toMatch(/^[0-9a-f]{8}$/);
  });

  it("(c) GET on a sent inquiry flips status to replied and sets quotation_pdf_url", async () => {
    store.set(INQUIRY_ID, makeInquiry({ status: "sent" }));
    authMock.mockResolvedValue({ user: { id: SELLER_ID } });

    await GET(new Request("http://localhost"), ctx(INQUIRY_ID));
    const row = store.get(INQUIRY_ID)!;
    expect(row.status).toBe("replied");
    expect(row.quotation_pdf_url).toBe(
      `/api/trade/inquiries/${INQUIRY_ID}/quotation.pdf`
    );
  });

  it("(d) GET on a replied inquiry leaves status unchanged but still sets quotation_pdf_url", async () => {
    store.set(INQUIRY_ID, makeInquiry({ status: "replied" }));
    authMock.mockResolvedValue({ user: { id: SELLER_ID } });

    await GET(new Request("http://localhost"), ctx(INQUIRY_ID));
    const row = store.get(INQUIRY_ID)!;
    expect(row.status).toBe("replied");
    expect(row.quotation_pdf_url).toBe(
      `/api/trade/inquiries/${INQUIRY_ID}/quotation.pdf`
    );
  });

  it("(e) GET by an unrelated user returns RESOURCE_NOT_FOUND and does not mutate", async () => {
    store.set(INQUIRY_ID, makeInquiry({ status: "sent" }));
    authMock.mockResolvedValue({ user: { id: STRANGER_ID } });

    const res = await GET(new Request("http://localhost"), ctx(INQUIRY_ID));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
    expect(inquiryDelegate.update).not.toHaveBeenCalled();
    expect(store.get(INQUIRY_ID)!.status).toBe("sent");
  });
});
