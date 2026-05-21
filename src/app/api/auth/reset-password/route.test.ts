import { createHash } from "crypto";

type TokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  revoked_at: Date | null;
  expires_at: Date;
};

const users = new Map<string, UserRow>();
const tokens: TokenRow[] = [];
const sessions: SessionRow[] = [];

function findToken(hash: string) {
  return tokens.find((t) => t.token_hash === hash) ?? null;
}

const passwordResetDelegate = {
  findUnique: jest.fn(async ({ where }: { where: { token_hash: string } }) =>
    findToken(where.token_hash)
  ),
  update: jest.fn(
    async ({ where, data }: { where: { id: string }; data: Partial<TokenRow> }) => {
      const row = tokens.find((t) => t.id === where.id);
      if (!row) throw new Error("not found");
      Object.assign(row, data);
      return row;
    }
  ),
  create: jest.fn(async ({ data }: { data: Partial<TokenRow> }) => {
    const row: TokenRow = {
      id: `t_${tokens.length + 1}`,
      user_id: data.user_id!,
      token_hash: data.token_hash!,
      expires_at: data.expires_at!,
      consumed_at: null,
    };
    tokens.push(row);
    return row;
  }),
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

const sessionDelegate = {
  updateMany: jest.fn(
    async ({
      where,
      data,
    }: {
      where: { user_id: string; revoked_at: null };
      data: { revoked_at: Date };
    }) => {
      let count = 0;
      for (const s of sessions) {
        if (s.user_id === where.user_id && s.revoked_at === null) {
          s.revoked_at = data.revoked_at;
          count++;
        }
      }
      return { count };
    }
  ),
};

const txClient = {
  passwordResetToken: passwordResetDelegate,
  emailVerificationToken: passwordResetDelegate,
  user: userDelegate,
  session: sessionDelegate,
};

jest.mock("@/lib/db", () => ({
  prisma: {
    passwordResetToken: passwordResetDelegate,
    emailVerificationToken: passwordResetDelegate,
    user: userDelegate,
    session: sessionDelegate,
    $transaction: jest.fn(async (fn: (tx: typeof txClient) => Promise<unknown>) => fn(txClient)),
  },
}));

import { POST } from "./route";

function makeReq(body: unknown): import("next/server").NextRequest {
  const req = new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return req as unknown as import("next/server").NextRequest;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

beforeEach(() => {
  users.clear();
  tokens.length = 0;
  sessions.length = 0;
  passwordResetDelegate.findUnique.mockClear();
  passwordResetDelegate.update.mockClear();
  passwordResetDelegate.create.mockClear();
  userDelegate.update.mockClear();
  sessionDelegate.updateMany.mockClear();
});

describe("POST /api/auth/reset-password", () => {
  it("returns 404 RESOURCE_NOT_FOUND when the token hash is unknown", async () => {
    const res = await POST(makeReq({ token: "unknown", new_password: "ValidPass1" }));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
    expect(userDelegate.update).not.toHaveBeenCalled();
  });

  it("returns 422 BUSINESS_RULE_VIOLATION when the token is already consumed", async () => {
    users.set("u_1", { id: "u_1", email: "a@b.c", password_hash: "old" });
    tokens.push({
      id: "t_1",
      user_id: "u_1",
      token_hash: sha256("plain-consumed"),
      expires_at: new Date(Date.now() + 60000),
      consumed_at: new Date(Date.now() - 60000),
    });
    const res = await POST(makeReq({ token: "plain-consumed", new_password: "ValidPass1" }));
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.error.code).toBe("BUSINESS_RULE_VIOLATION");
    expect(userDelegate.update).not.toHaveBeenCalled();
  });

  it("returns 422 BUSINESS_RULE_VIOLATION when the token is expired", async () => {
    users.set("u_1", { id: "u_1", email: "a@b.c", password_hash: "old" });
    tokens.push({
      id: "t_1",
      user_id: "u_1",
      token_hash: sha256("plain-expired"),
      expires_at: new Date(Date.now() - 60000),
      consumed_at: null,
    });
    const res = await POST(makeReq({ token: "plain-expired", new_password: "ValidPass1" }));
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.error.code).toBe("BUSINESS_RULE_VIOLATION");
    expect(userDelegate.update).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR for a weak password", async () => {
    users.set("u_1", { id: "u_1", email: "a@b.c", password_hash: "old" });
    tokens.push({
      id: "t_1",
      user_id: "u_1",
      token_hash: sha256("plain-valid"),
      expires_at: new Date(Date.now() + 60000),
      consumed_at: null,
    });
    const res = await POST(makeReq({ token: "plain-valid", new_password: "short" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(userDelegate.update).not.toHaveBeenCalled();
  });

  it("rotates password, consumes token, and revokes sessions on success", async () => {
    const bcryptLib = await import("bcryptjs");
    const oldHash = await bcryptLib.default.hash("OldPass123", 12);
    users.set("u_1", { id: "u_1", email: "a@b.c", password_hash: oldHash });
    const tokenHash = sha256("plain-good");
    tokens.push({
      id: "t_1",
      user_id: "u_1",
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 60000),
      consumed_at: null,
    });
    sessions.push({
      id: "s_1",
      user_id: "u_1",
      revoked_at: null,
      expires_at: new Date(Date.now() + 86400000),
    });
    sessions.push({
      id: "s_2",
      user_id: "u_1",
      revoked_at: null,
      expires_at: new Date(Date.now() + 86400000),
    });

    const res = await POST(makeReq({ token: "plain-good", new_password: "NewPass1234" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.user_id).toBe("u_1");

    // (a) bcrypt verifies the new password and not the old
    const updated = users.get("u_1")!;
    expect(await bcryptLib.default.compare("NewPass1234", updated.password_hash!)).toBe(true);
    expect(await bcryptLib.default.compare("OldPass123", updated.password_hash!)).toBe(false);

    // (b) token consumed_at is set
    const tokenRow = tokens.find((t) => t.token_hash === tokenHash)!;
    expect(tokenRow.consumed_at).not.toBeNull();

    // (c) all previously-unrevoked sessions are now revoked
    expect(sessions.every((s) => s.revoked_at !== null)).toBe(true);
  });
});
