type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  type: "personal" | "company";
  display_name: string;
  status: "active" | "suspended" | "deleted";
};

type VerificationToken = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
};

const users = new Map<string, UserRow>();
const verifyTokens: VerificationToken[] = [];

const userDelegate = {
  findUnique: jest.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
    if (where.email) return Array.from(users.values()).find((u) => u.email === where.email) ?? null;
    if (where.id) return users.get(where.id) ?? null;
    return null;
  }),
  create: jest.fn(async ({ data }: { data: Partial<UserRow> }) => {
    const u: UserRow = {
      id: `u_${users.size + 1}`,
      email: data.email!,
      password_hash: data.password_hash ?? null,
      type: data.type ?? "personal",
      display_name: data.display_name ?? "",
      status: "active",
    };
    users.set(u.id, u);
    return u;
  }),
};

const verifyTokenDelegate = {
  findUnique: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(
    async ({
      where,
      data,
    }: {
      where: { user_id: string; consumed_at: null };
      data: { consumed_at: Date };
    }) => {
      let count = 0;
      for (const t of verifyTokens) {
        if (t.user_id === where.user_id && t.consumed_at === null) {
          t.consumed_at = data.consumed_at;
          count++;
        }
      }
      return { count };
    }
  ),
  create: jest.fn(async ({ data }: { data: Partial<VerificationToken> }) => {
    const t: VerificationToken = {
      id: `vt_${verifyTokens.length + 1}`,
      user_id: data.user_id!,
      token_hash: data.token_hash!,
      expires_at: data.expires_at!,
      consumed_at: null,
    };
    verifyTokens.push(t);
    return t;
  }),
};

jest.mock("@/lib/db", () => ({
  prisma: {
    user: userDelegate,
    emailVerificationToken: verifyTokenDelegate,
    passwordResetToken: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    companyProfile: { findUnique: jest.fn(async () => null) },
  },
}));

jest.mock("@/lib/subscriptions", () => ({
  ensureDefaultSubscription: jest.fn(async () => undefined),
}));

jest.mock("@/lib/gcis", () => ({
  lookupTaxId: jest.fn(async () => null),
  validateTaxIdFormat: jest.fn(() => true),
}));

type EmailPayload = { to: string; subject: string; text: string; html?: string };
const sendEmailMock = jest.fn(async (payload: EmailPayload) => {
  void payload;
  return { skipped: true } as unknown;
});
jest.mock("@/lib/notify", () => ({
  sendEmail: (payload: EmailPayload) => sendEmailMock(payload),
}));

import { POST } from "./route";

function makeReq(body: unknown): import("next/server").NextRequest {
  const req = new Request("http://localhost/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return req as unknown as import("next/server").NextRequest;
}

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  users.clear();
  verifyTokens.length = 0;
  userDelegate.findUnique.mockClear();
  userDelegate.create.mockClear();
  verifyTokenDelegate.create.mockClear();
  sendEmailMock.mockReset();
  sendEmailMock.mockImplementation(async () => ({ skipped: true }));
  errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("POST /api/auth/register — verification email", () => {
  it("creates exactly one verification token with ~24h TTL and dispatches the email", async () => {
    const before = Date.now();
    const res = await POST(
      makeReq({ type: "personal", email: "bob@example.com", password: "StrongPass1" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.user_id).toBeTruthy();
    expect(verifyTokens).toHaveLength(1);
    const t = verifyTokens[0];
    expect(t.user_id).toBe(body.data.user_id);
    expect(t.consumed_at).toBeNull();
    const ttl = t.expires_at.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0]?.[0]?.to).toBe("bob@example.com");
  });

  it("still returns 200 and persists the user when sendEmail throws", async () => {
    sendEmailMock.mockImplementation(async () => {
      throw new Error("smtp down");
    });

    const res = await POST(
      makeReq({ type: "personal", email: "carol@example.com", password: "StrongPass1" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.user_id).toBeTruthy();
    expect(users.size).toBe(1);
    expect(verifyTokens).toHaveLength(1);
    const matched = errorSpy.mock.calls.some(
      (call) => call[0] === "[register] failed to dispatch verification email"
    );
    expect(matched).toBe(true);
  });
});
