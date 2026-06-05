import type { NextRequest } from "next/server";

type OrderRow = {
  id: string;
  user_id: string;
  status: string;
  project_type: string | null;
  customer: Record<string, unknown> | null;
  shipping: number;
  tax: number;
  subtotal: number;
  total: number;
  notes: string | null;
  deleted_at: Date | null;
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    sku: string | null;
    quantity: number;
    unit_price: number;
  }>;
};

const orders: OrderRow[] = [];

const orderDelegate = {
  findFirst: jest.fn(async ({ where }: { where: { id: string; user_id: string } }) => {
    const order = orders.find(
      (o) => o.id === where.id && o.user_id === where.user_id && o.deleted_at === null
    );
    return order ? { ...order, items: [...order.items] } : null;
  }),
  update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const order = orders.find((o) => o.id === where.id);
    if (!order) throw new Error("not found");
    if (typeof data.status === "string") order.status = data.status;
    if (typeof data.notes === "string") order.notes = data.notes;
    return { ...order, items: [...order.items], events: [] };
  }),
};

const authMock = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: { order: orderDelegate },
}));

jest.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

import { PATCH } from "./route";

function patchRequest(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as NextRequest;
}

function seedOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  const order: OrderRow = {
    id: "ord_1",
    user_id: "u_1",
    status: "quote_pending",
    project_type: "website",
    customer: null,
    shipping: 0,
    tax: 0,
    subtotal: 1000,
    total: 1000,
    notes: null,
    deleted_at: null,
    items: [
      { id: "item_1", name: "Website project", description: null, sku: null, quantity: 1, unit_price: 1000 },
    ],
    ...overrides,
  };
  orders.push(order);
  return order;
}

beforeEach(() => {
  orders.length = 0;
  orderDelegate.findFirst.mockClear();
  orderDelegate.update.mockClear();
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u_1" } });
});

describe("PATCH /api/orders/[id] — project order status integrity", () => {
  it("rejects a status field on a project order and persists no status change", async () => {
    const order = seedOrder({ status: "quote_pending", project_type: "website" });

    const res = await PATCH(patchRequest({ status: "confirmed" }), { params: { id: order.id } });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("BUSINESS_RULE_VIOLATION");
    expect(orderDelegate.update).not.toHaveBeenCalled();
    expect(order.status).toBe("quote_pending");
  });

  it("still applies permitted non-status fields on a project order", async () => {
    const order = seedOrder({ status: "quote_pending", project_type: "website" });

    const res = await PATCH(patchRequest({ notes: "updated notes" }), { params: { id: order.id } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.notes).toBe("updated notes");
    expect(orderDelegate.update).toHaveBeenCalledTimes(1);
    expect(orderDelegate.update.mock.calls[0][0].data.status).toBeUndefined();
    expect(order.status).toBe("quote_pending");
  });

  it("keeps legacy (non-project) order status writes unchanged", async () => {
    const order = seedOrder({ status: "pending", project_type: null });

    const res = await PATCH(patchRequest({ status: "paid" }), { params: { id: order.id } });

    expect(res.status).toBe(200);
    expect(orderDelegate.update).toHaveBeenCalledTimes(1);
    expect(order.status).toBe("paid");
  });
});
