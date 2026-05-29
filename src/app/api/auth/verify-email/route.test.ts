import { createHash } from "crypto";

type UserRow = {
  id: string;
  email_verified_at: Date | null;
};

type TokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
};

const users = new Map<string, UserRow>();
const tokens: TokenRow[] = [];

const verifyTokenDelegate = {
  findUnique: jest.fn(
    async ({
      where,
      include,
    }: {
      where: { token_hash: string };
      include?: { user?: { select: { id: boolean; email_verified_at: boolean } } };
    }) => {
      const row = tokens.find((t) => t.token_hash === where.token_hash) ?? null;
      if (!row) return null;
      if (include?.user) {
        const u = users.get(row.user_id);
        return { ...row, user: u ? { id: u.id, email_verified_at: u.email_verified_at } : null };
      }
      return row;
    }
  ),
  update: jest.fn(
    async ({ where, data }: { where: { id: string }; data: Partial<TokenRow> }) => {
      const t = tokens.find((r) => r.id === where.id);
      if (!t) throw new Error("not found");
      Object.assign(t, data);
      return t;
    }
  ),
};

const userDelegate = {
  update: jest.fn(
    async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
      const u = users.get(where.id);
      if (!u) throw new Error("not found");
      Object.assign(u, data);
      return u;
    }
  ),
};

jest.mock("@/lib/db", () => ({
  prisma: {
    user: userDelegate,
    emailVerificationToken: verifyTokenDelegate,
    $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  },
}));

import { GET } from "./route";

function makeReq(token: string | undefined): import("next/server").NextRequest {
  const url = token
    ? `http://localhost/api/auth/verify-email?token=${encodeURIComponent(token)}`
    : "http://localhost/api/auth/verify-email";
  const req = new Request(url, { method: "GET" });
  return req as unknown as import("next/server").NextRequest;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

beforeEach(() => {
  users.clear();
  tokens.length = 0;
  verifyTokenDelegate.findUnique.mockClear();
  verifyTokenDelegate.update.mockClear();
  userDelegate.update.mockClear();
});

describe("GET /api/auth/verify-email", () => {
  it("row (a): unknown hash → 404 RESOURCE_NOT_FOUND, no mutation", async () => {
    const res = await GET(makeReq("unknown"));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
    expect(userDelegate.update).not.toHaveBeenCalled();
    expect(verifyTokenDelegate.update).not.toHaveBeenCalled();
  });

  it("row (b): expired, user unverified → 422 BUSINESS_RULE_VIOLATION, no mutation", async () => {
    users.set("u_1", { id: "u_1", email_verified_at: null });
    tokens.push({
      id: "t_1",
      user_id: "u_1",
      token_hash: sha256("plain-expired"),
      expires_at: new Date(Date.now() - 60 * 60 * 1000),
      consumed_at: null,
    });

    const res = await GET(makeReq("plain-expired"));
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.error.code).toBe("BUSINESS_RULE_VIOLATION");
    expect(users.get("u_1")!.email_verified_at).toBeNull();
    expect(tokens[0].consumed_at).toBeNull();
  });

  it("row (c): unconsumed and unexpired, user unverified → 200, sets email_verified_at and consumed_at", async () => {
    users.set("u_1", { id: "u_1", email_verified_at: null });
    tokens.push({
      id: "t_1",
      user_id: "u_1",
      token_hash: sha256("plain-good"),
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
      consumed_at: null,
    });

    const res = await GET(makeReq("plain-good"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.user_id).toBe("u_1");
    expect(body.data.already_verified).toBe(false);
    expect(users.get("u_1")!.email_verified_at).not.toBeNull();
    expect(tokens[0].consumed_at).not.toBeNull();
  });

  it("row (d): consumed token but user already verified → 200 already_verified:true, no mutation", async () => {
    const verifiedAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    users.set("u_1", { id: "u_1", email_verified_at: verifiedAt });
    tokens.push({
      id: "t_1",
      user_id: "u_1",
      token_hash: sha256("plain-old"),
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
      consumed_at: new Date(),
    });

    const res = await GET(makeReq("plain-old"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.user_id).toBe("u_1");
    expect(body.data.already_verified).toBe(true);
    expect(users.get("u_1")!.email_verified_at!.getTime()).toBe(verifiedAt.getTime());
    expect(userDelegate.update).not.toHaveBeenCalled();
  });
});
