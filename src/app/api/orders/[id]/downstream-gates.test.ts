/**
 * Task 1.3 — downstream gates stay closed once the generic PATCH rejects
 * status self-promotion (task 1.1): an owner who tries to self-promote a
 * project order to `confirmed` never reaches revision-quota purchase or
 * revision_request messages, because the order never leaves `quote_pending`
 * outside accept-quote.
 */
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
    return { ...order, items: [...order.items], events: [] };
  }),
};

// Any write transaction reaching this mock means a gate failed.
const transactionMock = jest.fn(async () => {
  throw new Error("transaction must not run for a gated request");
});

const authMock = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: {
    order: orderDelegate,
    $transaction: (...args: unknown[]) => transactionMock(),
  },
}));

jest.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

import { PATCH } from "./route";
import { POST as purchasePOST } from "./revision-quota/purchase/route";
import { POST as messagesPOST } from "./messages/route";

function jsonRequest(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as NextRequest;
}

beforeEach(() => {
  orders.length = 0;
  orderDelegate.findFirst.mockClear();
  orderDelegate.update.mockClear();
  transactionMock.mockClear();
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u_1" } });
  orders.push({
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
  });
});

describe("downstream gates after status self-promotion is rejected", () => {
  it("self-promotion PATCH is rejected, then revision-quota purchase stays blocked", async () => {
    const patchRes = await PATCH(jsonRequest({ status: "confirmed" }), { params: { id: "ord_1" } });
    expect(patchRes.status).toBe(422);
    expect(orders[0].status).toBe("quote_pending");

    const purchaseRes = await purchasePOST(jsonRequest({ quantity: 1, method: "points" }), {
      params: { id: "ord_1" },
    });
    const purchaseBody = await purchaseRes.json();

    expect(purchaseRes.status).toBe(422);
    expect(purchaseBody.error.code).toBe("BUSINESS_RULE_VIOLATION");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("self-promotion PATCH is rejected, then revision_request messages stay blocked", async () => {
    const patchRes = await PATCH(jsonRequest({ status: "confirmed" }), { params: { id: "ord_1" } });
    expect(patchRes.status).toBe(422);
    expect(orders[0].status).toBe("quote_pending");

    const messageRes = await messagesPOST(
      jsonRequest({ body: "please revise", kind: "revision_request" }),
      { params: { id: "ord_1" } }
    );
    const messageBody = await messageRes.json();

    expect(messageRes.status).toBe(422);
    expect(messageBody.error.code).toBe("BUSINESS_RULE_VIOLATION");
    expect(transactionMock).not.toHaveBeenCalled();
  });
});
