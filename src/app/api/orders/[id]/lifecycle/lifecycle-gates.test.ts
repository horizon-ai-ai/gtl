/**
 * Lifecycle-advance gates (fix-g3-redesign-pre-merge-issues, review #1):
 * owners can never change order.status through the lifecycle route, and every
 * admin status change goes through assertProjectTransition plus an
 * OrderStatusHistory row written in the same transaction as the order update.
 */
import type { NextRequest } from "next/server";

type OrderRow = {
  id: string;
  user_id: string;
  status: string;
  metadata: Record<string, unknown>;
  deleted_at: Date | null;
};

const orders: OrderRow[] = [];

const orderDelegate = {
  findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
    const order = orders.find((o) => o.id === where.id);
    return order ? { ...order } : null;
  }),
  update: jest.fn(
    async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const order = orders.find((o) => o.id === where.id);
      if (!order) throw new Error("not found");
      if (typeof data.status === "string") order.status = data.status;
      if (data.metadata && typeof data.metadata === "object") {
        order.metadata = data.metadata as Record<string, unknown>;
      }
      return { ...order, items: [], events: [] };
    },
  ),
};

const historyDelegate = {
  create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "hist_1", ...data })),
};

const transactionMock = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({ order: orderDelegate, orderStatusHistory: historyDelegate }),
);

jest.mock("@/lib/db", () => ({
  prisma: {
    order: orderDelegate,
    orderStatusHistory: historyDelegate,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => transactionMock(fn),
  },
}));

const authMock = jest.fn();

jest.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

import { POST } from "./route";

function jsonRequest(body: Record<string, unknown>) {
  return { json: async () => body } as unknown as NextRequest;
}

function seedOrder(overrides: Partial<OrderRow> = {}) {
  orders.push({
    id: "ord_1",
    user_id: "u_1",
    status: "quoted",
    metadata: { source: "trade_inquiry" },
    deleted_at: null,
    ...overrides,
  });
}

beforeEach(() => {
  orders.length = 0;
  orderDelegate.findUnique.mockClear();
  orderDelegate.update.mockClear();
  historyDelegate.create.mockClear();
  transactionMock.mockClear();
  authMock.mockReset();
});

describe("owner lifecycle advances are metadata-only", () => {
  it("owner targeting order_confirmed (status-changing) is rejected without any write", async () => {
    seedOrder(); // quoted -> active stage is order_confirmed
    authMock.mockResolvedValue({ user: { id: "u_1", role: "user" } });

    const res = await POST(jsonRequest({ stage_key: "order_confirmed" }), { params: { id: "ord_1" } });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("BUSINESS_RULE_VIOLATION");
    expect(orderDelegate.update).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(orders[0].status).toBe("quoted");
  });

  it("owner targeting shipped (status-changing) is rejected without any write", async () => {
    seedOrder({ status: "confirmed", metadata: { source: "trade_inquiry", lifecycle_stage: "processing" } });
    authMock.mockResolvedValue({ user: { id: "u_1", role: "user" } });

    const res = await POST(jsonRequest({ stage_key: "shipped" }), { params: { id: "ord_1" } });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("BUSINESS_RULE_VIOLATION");
    expect(orderDelegate.update).not.toHaveBeenCalled();
    expect(orders[0].status).toBe("confirmed");
  });

  it("owner advancing processing one step updates metadata and leaves status untouched", async () => {
    seedOrder({ status: "confirmed", metadata: { source: "trade_inquiry", lifecycle_stage: "order_confirmed" } });
    authMock.mockResolvedValue({ user: { id: "u_1", role: "user" } });

    const res = await POST(jsonRequest({ stage_key: "processing" }), { params: { id: "ord_1" } });

    expect(res.status).toBe(200);
    expect(orderDelegate.update).toHaveBeenCalledTimes(1);
    const updateArgs = orderDelegate.update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(updateArgs.data.status).toBe("confirmed"); // unchanged
    expect((updateArgs.data.metadata as Record<string, unknown>).lifecycle_stage).toBe("processing");
    expect(historyDelegate.create).not.toHaveBeenCalled();
  });
});

describe("admin lifecycle advances go through the validated state machine", () => {
  it("admin advancing order_confirmed on a quoted order sets confirmed and writes history in a transaction", async () => {
    seedOrder(); // quoted
    authMock.mockResolvedValue({ user: { id: "admin_1", role: "admin" } });

    const res = await POST(jsonRequest({ stage_key: "order_confirmed" }), { params: { id: "ord_1" } });

    expect(res.status).toBe(200);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(orders[0].status).toBe("confirmed");
    expect(historyDelegate.create).toHaveBeenCalledTimes(1);
    const historyArgs = historyDelegate.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(historyArgs.data.from_status).toBe("quoted");
    expect(historyArgs.data.to_status).toBe("confirmed");
    expect(historyArgs.data.actor_id).toBe("admin_1");
  });

  it("admin advance implying an illegal transition (quoted -> shipped) conflicts and writes nothing", async () => {
    seedOrder(); // quoted; shipped is not reachable from quoted
    authMock.mockResolvedValue({ user: { id: "admin_1", role: "admin" } });

    const res = await POST(jsonRequest({ stage_key: "shipped" }), { params: { id: "ord_1" } });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
    expect(transactionMock).not.toHaveBeenCalled();
    expect(orderDelegate.update).not.toHaveBeenCalled();
    expect(historyDelegate.create).not.toHaveBeenCalled();
    expect(orders[0].status).toBe("quoted");
  });
});
