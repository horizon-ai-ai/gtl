import type { NextRequest } from "next/server";

type OrderRow = {
  id: string;
  user_id: string;
  status: string;
  project_type: string | null;
  deleted_at: Date | null;
  total: number;
  subtotal: number;
  confirmed_at: Date | null;
};

type PaymentRow = { id: string; order_id: string; kind: string; status: string; amount: number };

const orders: OrderRow[] = [];
const payments: PaymentRow[] = [];
const quotes: Array<{
  id: string;
  order_id: string;
  status: string;
  amount: number;
  deposit_amount: number;
  quoted_at: Date;
  expires_at: Date;
}> = [];

const txDelegates = {
  order: {
    // Status-guarded claim: the in-memory mutation is synchronous, so two
    // interleaved transactions observe each other's writes exactly like
    // PostgreSQL row-level locking would resolve them.
    updateMany: jest.fn(async ({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) => {
      const order = orders.find((o) => o.id === where.id && o.status === where.status);
      if (!order) return { count: 0 };
      order.status = data.status as string;
      order.total = data.total as number;
      order.subtotal = data.subtotal as number;
      order.confirmed_at = data.confirmed_at as Date;
      return { count: 1 };
    }),
    findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
      const order = orders.find((o) => o.id === where.id);
      if (!order) throw new Error("not found");
      return { ...order, payments: payments.filter((p) => p.order_id === order.id) };
    }),
  },
  projectQuote: {
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
      const quote = quotes.find((q) => q.id === where.id);
      if (quote) quote.status = data.status;
      return quote;
    }),
  },
  projectPayment: {
    create: jest.fn(async ({ data }: { data: { order_id: string; kind: string; status: string; amount: number } }) => {
      const payment = { id: `pay_${payments.length + 1}`, ...data };
      payments.push(payment);
      return payment;
    }),
  },
  revisionQuota: { upsert: jest.fn(async () => ({})) },
  reviewItem: {
    count: jest.fn(async () => 0),
    createMany: jest.fn(async () => ({ count: 0 })),
  },
  orderMessage: { create: jest.fn(async () => ({})) },
  orderEvent: { create: jest.fn(async () => ({})) },
  orderStatusHistory: { create: jest.fn(async () => ({})) },
};

const authMock = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: {
    order: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; user_id: string } }) => {
        const order = orders.find(
          (o) => o.id === where.id && o.user_id === where.user_id && o.deleted_at === null
        );
        return order ? { ...order } : null;
      }),
    },
    projectQuote: {
      findFirst: jest.fn(async ({ where }: { where: { order_id: string; status: string } }) => {
        const quote = quotes.find((q) => q.order_id === where.order_id && q.status === where.status);
        return quote ? { ...quote } : null;
      }),
    },
    $transaction: jest.fn(async (fn: (tx: typeof txDelegates) => Promise<unknown>) => fn(txDelegates)),
  },
}));

jest.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

import { POST } from "./route";

function acceptRequest() {
  return { json: async () => ({ method: "manual" }) } as unknown as NextRequest;
}

beforeEach(() => {
  orders.length = 0;
  payments.length = 0;
  quotes.length = 0;
  jest.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u_1" } });
  orders.push({
    id: "ord_1",
    user_id: "u_1",
    status: "quoted",
    project_type: "website",
    deleted_at: null,
    total: 0,
    subtotal: 0,
    confirmed_at: null,
  });
  quotes.push({
    id: "q_1",
    order_id: "ord_1",
    status: "active",
    amount: 50000,
    deposit_amount: 15000,
    quoted_at: new Date(),
    expires_at: new Date(Date.now() + 86400000),
  });
});

describe("POST /api/orders/[id]/accept-quote — concurrency", () => {
  it("accepts a single request and records one paid deposit", async () => {
    const res = await POST(acceptRequest(), { params: { id: "ord_1" } });

    expect(res.status).toBe(200);
    expect(orders[0].status).toBe("confirmed");
    expect(payments.filter((p) => p.kind === "deposit" && p.status === "paid")).toHaveLength(1);
  });

  it("two concurrent accepts yield exactly one paid deposit and one confirmed order", async () => {
    const [res1, res2] = await Promise.all([
      POST(acceptRequest(), { params: { id: "ord_1" } }),
      POST(acceptRequest(), { params: { id: "ord_1" } }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).not.toBe(200);
    expect(payments.filter((p) => p.kind === "deposit" && p.status === "paid")).toHaveLength(1);
    expect(orders[0].status).toBe("confirmed");
  });

  it("rejects when the order already left the pre-accept status", async () => {
    orders[0].status = "confirmed";

    const res = await POST(acceptRequest(), { params: { id: "ord_1" } });

    expect(res.status).not.toBe(200);
    expect(payments).toHaveLength(0);
  });
});
