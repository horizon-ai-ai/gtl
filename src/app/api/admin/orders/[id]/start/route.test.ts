import type { NextRequest } from "next/server";

type OrderRow = {
  id: string;
  status: string;
  project_type: string | null;
  deleted_at: Date | null;
  assigned_reviewer_id: string | null;
};

type PaymentRow = {
  id: string;
  order_id: string;
  kind: string;
  status: string;
};

const orders: OrderRow[] = [];
const payments: PaymentRow[] = [];

const orderDelegate = {
  findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
    const order = orders.find((o) => o.id === where.id);
    return order ? { ...order } : null;
  }),
  update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const order = orders.find((o) => o.id === where.id);
    if (!order) throw new Error("not found");
    if (typeof data.status === "string") order.status = data.status;
    return { ...order };
  }),
};

const projectPaymentDelegate = {
  findFirst: jest.fn(
    async ({ where }: { where: { order_id: string; kind: string; status: string } }) => {
      const payment = payments.find(
        (p) => p.order_id === where.order_id && p.kind === where.kind && p.status === where.status
      );
      return payment ? { ...payment } : null;
    }
  ),
};

const orderStatusHistoryDelegate = {
  create: jest.fn(async () => ({})),
};

const requireAdminMock = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: {
    order: orderDelegate,
    projectPayment: projectPaymentDelegate,
    orderStatusHistory: orderStatusHistoryDelegate,
  },
}));

jest.mock("@/lib/auth", () => ({
  requireAdmin: (...args: unknown[]) => requireAdminMock(...args),
}));

import { POST } from "./route";

beforeEach(() => {
  orders.length = 0;
  payments.length = 0;
  orderDelegate.findUnique.mockClear();
  orderDelegate.update.mockClear();
  projectPaymentDelegate.findFirst.mockClear();
  orderStatusHistoryDelegate.create.mockClear();
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue({ id: "admin_1" });
});

describe("POST /api/admin/orders/[id]/start — deposit-before-start", () => {
  it("transitions confirmed -> in_execution when a paid deposit exists", async () => {
    orders.push({
      id: "ord_1",
      status: "confirmed",
      project_type: "website",
      deleted_at: null,
      assigned_reviewer_id: null,
    });
    payments.push({ id: "pay_1", order_id: "ord_1", kind: "deposit", status: "paid" });

    const res = await POST({} as NextRequest, { params: { id: "ord_1" } });

    expect(res.status).toBe(200);
    expect(orders[0].status).toBe("in_execution");
  });

  it("rejects with a business-rule error when no paid deposit exists", async () => {
    orders.push({
      id: "ord_1",
      status: "confirmed",
      project_type: "website",
      deleted_at: null,
      assigned_reviewer_id: null,
    });

    const res = await POST({} as NextRequest, { params: { id: "ord_1" } });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("BUSINESS_RULE_VIOLATION");
    expect(orderDelegate.update).not.toHaveBeenCalled();
    expect(orders[0].status).toBe("confirmed");
  });

  it("rejects when the only deposit is unpaid", async () => {
    orders.push({
      id: "ord_1",
      status: "confirmed",
      project_type: "website",
      deleted_at: null,
      assigned_reviewer_id: null,
    });
    payments.push({ id: "pay_1", order_id: "ord_1", kind: "deposit", status: "pending" });

    const res = await POST({} as NextRequest, { params: { id: "ord_1" } });

    expect(res.status).toBe(422);
    expect(orders[0].status).toBe("confirmed");
  });
});
