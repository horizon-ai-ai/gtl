type UsageRow = {
  user_id: string;
  period: string;
  plan_credits: bigint;
  topup_credits: bigint;
  used_credits: bigint;
  reset_at: Date;
};

let usage: UsageRow | null = null;

const userUsageDelegate = {
  findUnique: jest.fn(async () => (usage ? { ...usage } : null)),
  create: jest.fn(async ({ data }: { data: UsageRow }) => {
    usage = { ...data };
    return { ...usage };
  }),
  update: jest.fn(async () => ({})),
};

jest.mock("@/lib/db", () => ({
  prisma: {
    userUsage: userUsageDelegate,
    subscription: { findUnique: jest.fn(async () => null) },
  },
}));

import { assertCreditsAvailable } from "./credits";
import { ApiError } from "./api";

function seedUsage(available: bigint) {
  usage = {
    user_id: "u_1",
    period: "2026-06",
    plan_credits: available,
    topup_credits: BigInt(0),
    used_credits: BigInt(0),
    reset_at: new Date(),
  };
}

async function expectApiError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toThrow(ApiError);
  await promise.catch((err: ApiError) => expect(err.code).toBe(code));
}

beforeEach(() => {
  usage = null;
  jest.clearAllMocks();
});

describe("assertCreditsAvailable — fixed-cost (image) semantics", () => {
  it("rejects when available < cost, without consuming", async () => {
    seedUsage(BigInt(1));

    await expectApiError(assertCreditsAvailable("u_1", BigInt(20000)), "INSUFFICIENT_CREDITS");
    expect(userUsageDelegate.update).not.toHaveBeenCalled();
  });

  it("passes when available equals the cost", async () => {
    seedUsage(BigInt(20000));

    await expect(assertCreditsAvailable("u_1", BigInt(20000))).resolves.toBeUndefined();
  });

  it("rejects a multi-image cost the balance cannot cover", async () => {
    seedUsage(BigInt(30000));

    await expectApiError(assertCreditsAvailable("u_1", BigInt(40000)), "INSUFFICIENT_CREDITS");
    expect(userUsageDelegate.update).not.toHaveBeenCalled();
  });

  it("passes a multi-image cost the balance covers", async () => {
    seedUsage(BigInt(40000));

    await expect(assertCreditsAvailable("u_1", BigInt(40000))).resolves.toBeUndefined();
  });
});

describe("assertCreditsAvailable — post-hoc-cost (text) semantics", () => {
  it("passes with any positive balance when no cost is given", async () => {
    seedUsage(BigInt(1));

    await expect(assertCreditsAvailable("u_1")).resolves.toBeUndefined();
  });

  it("rejects with quota-exceeded when the balance is exhausted", async () => {
    seedUsage(BigInt(0));

    await expectApiError(assertCreditsAvailable("u_1"), "QUOTA_EXCEEDED");
  });

  it("treats a zero cost like the positive-balance check", async () => {
    seedUsage(BigInt(1));

    await expect(assertCreditsAvailable("u_1", BigInt(0))).resolves.toBeUndefined();
  });
});
