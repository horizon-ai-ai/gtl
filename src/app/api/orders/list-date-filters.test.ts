/**
 * Order-list date filters (fix-g3-redesign-pre-merge-issues, reviews #5/#6):
 * malformed date params fail with 400 before any Prisma query runs, and
 * end-date params include the entire selected day via an exclusive
 * next-day upper bound.
 */
import type { NextRequest } from "next/server";

const orderDelegate = {
  findMany: jest.fn(async () => []),
};

jest.mock("@/lib/db", () => ({
  prisma: { order: orderDelegate },
}));

const authMock = jest.fn();

jest.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

import { GET } from "./route";

function getRequest(query: string) {
  return { nextUrl: new URL(`http://localhost/api/orders${query}`) } as unknown as NextRequest;
}

beforeEach(() => {
  orderDelegate.findMany.mockClear();
  authMock.mockReset();
  authMock.mockResolvedValue({ user: { id: "u_1" } });
});

describe("date filter parameters are validated", () => {
  it.each(["date_start", "date_end", "quote_date_start", "quote_date_end"])(
    "malformed %s returns 400 VALIDATION_ERROR without querying",
    async (param) => {
      const res = await GET(getRequest(`?${param}=not-a-date`));
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(orderDelegate.findMany).not.toHaveBeenCalled();
    },
  );

  it("well-formed date params query with the corresponding range filters", async () => {
    const res = await GET(getRequest("?date_start=2026-06-01&date_end=2026-06-07"));

    expect(res.status).toBe(200);
    expect(orderDelegate.findMany).toHaveBeenCalledTimes(1);
    const where = (orderDelegate.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where.created_at).toEqual({
      gte: new Date("2026-06-01T00:00:00.000Z"),
      lt: new Date("2026-06-08T00:00:00.000Z"),
    });
  });
});

describe("end-date filters include the entire selected day", () => {
  it("date_end uses an exclusive next-day upper bound", async () => {
    await GET(getRequest("?date_end=2026-06-07"));

    const where = (orderDelegate.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    // lt 2026-06-08T00:00:00Z: 2026-06-07T23:59:59Z matches, 2026-06-08T00:00:00Z does not.
    expect(where.created_at).toEqual({ lt: new Date("2026-06-08T00:00:00.000Z") });
  });

  it("quote_date_end applies the same bound to submitted_at", async () => {
    await GET(getRequest("?quote_date_end=2026-06-07"));

    const where = (orderDelegate.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where.submitted_at).toEqual({ lt: new Date("2026-06-08T00:00:00.000Z") });
  });
});
