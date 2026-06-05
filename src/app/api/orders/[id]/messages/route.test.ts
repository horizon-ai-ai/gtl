import type { NextRequest } from "next/server";

type QuotaRow = { order_id: string; used: number; total: number };

const orders: Array<{ id: string; user_id: string; status: string; deleted_at: Date | null }> = [];
const quotas: QuotaRow[] = [];
const messages: Array<{ order_id: string; kind: string }> = [];

const TOTAL_FIELD_REF = { __field: "total" };

const txDelegates = {
  revisionQuota: {
    // Guarded increment: mutation is synchronous, so interleaved requests
    // resolve like PostgreSQL conditional updates — only one can win the
    // last quota slot.
    updateMany: jest.fn(async ({ where }: { where: { order_id: string; used: { lt: unknown } } }) => {
      const quota = quotas.find((q) => q.order_id === where.order_id);
      if (!quota || quota.used >= quota.total) return { count: 0 };
      quota.used += 1;
      return { count: 1 };
    }),
  },
  orderMessage: {
    create: jest.fn(async ({ data }: { data: { order_id: string; kind: string } }) => {
      messages.push({ order_id: data.order_id, kind: data.kind });
      return { id: `msg_${messages.length}`, ...data };
    }),
  },
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
    revisionQuota: { fields: { total: TOTAL_FIELD_REF } },
    $transaction: jest.fn(async (fn: (tx: typeof txDelegates) => Promise<unknown>) => fn(txDelegates)),
  },
}));

jest.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

import { POST } from "./route";

function revisionRequest() {
  return {
    json: async () => ({ body: "please revise", kind: "revision_request" }),
  } as unknown as NextRequest;
}

beforeEach(() => {
  orders.length = 0;
  quotas.length = 0;
  messages.length = 0;
  jest.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u_1" } });
  orders.push({ id: "ord_1", user_id: "u_1", status: "in_execution", deleted_at: null });
});

describe("POST /api/orders/[id]/messages — revision quota concurrency", () => {
  it("consumes one quota slot for a revision request", async () => {
    quotas.push({ order_id: "ord_1", used: 0, total: 2 });

    const res = await POST(revisionRequest(), { params: { id: "ord_1" } });

    expect(res.status).toBe(200);
    expect(quotas[0].used).toBe(1);
    expect(messages.filter((m) => m.kind === "revision_request")).toHaveLength(1);
  });

  it("rejects when the quota is exhausted, without creating a message", async () => {
    quotas.push({ order_id: "ord_1", used: 2, total: 2 });

    const res = await POST(revisionRequest(), { params: { id: "ord_1" } });
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error.code).toBe("BUSINESS_RULE_VIOLATION");
    expect(quotas[0].used).toBe(2);
    expect(messages).toHaveLength(0);
  });

  it("two concurrent revision requests on the last slot never exceed the total", async () => {
    quotas.push({ order_id: "ord_1", used: 1, total: 2 });

    const [res1, res2] = await Promise.all([
      POST(revisionRequest(), { params: { id: "ord_1" } }),
      POST(revisionRequest(), { params: { id: "ord_1" } }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBe(422);
    expect(quotas[0].used).toBeLessThanOrEqual(quotas[0].total);
    expect(quotas[0].used).toBe(2);
    expect(messages.filter((m) => m.kind === "revision_request")).toHaveLength(1);
  });
});
