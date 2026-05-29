type UserRow = {
  id: string;
  email: string;
  status: "active" | "suspended" | "deleted";
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
const verifyTokens: TokenRow[] = [];

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) return Array.from(users.values()).find((u) => u.email === where.email) ?? null;
        if (where.id) return users.get(where.id) ?? null;
        return null;
      }),
    },
    emailVerificationToken: {
      create: jest.fn(async ({ data }: { data: Partial<TokenRow> }) => {
        const row: TokenRow = {
          id: `t_${verifyTokens.length + 1}`,
          user_id: data.user_id!,
          token_hash: data.token_hash!,
          expires_at: data.expires_at!,
          consumed_at: null,
        };
        verifyTokens.push(row);
        return row;
      }),
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { user_id: string; consumed_at: null };
          data: { consumed_at: Date };
        }) => {
          let count = 0;
          for (const r of verifyTokens) {
            if (r.user_id === where.user_id && r.consumed_at === null) {
              r.consumed_at = data.consumed_at;
              count++;
            }
          }
          return { count };
        }
      ),
    },
  },
}));

jest.mock("@/lib/notify", () => ({
  sendEmail: jest.fn(async () => ({ skipped: true })),
}));

const authMock = jest.fn();
jest.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

import { sendEmail } from "@/lib/notify";
import { POST } from "./route";

const mockedSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

function makeReq(body: unknown): import("next/server").NextRequest {
  const req = new Request("http://localhost/api/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return req as unknown as import("next/server").NextRequest;
}

let infoSpy: jest.SpyInstance;

beforeEach(() => {
  users.clear();
  verifyTokens.length = 0;
  mockedSendEmail.mockClear();
  authMock.mockReset();
  authMock.mockResolvedValue(null);
  infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  infoSpy.mockRestore();
});

describe("POST /api/auth/resend-verification", () => {
  it("issues a token and sends one email for an active, unverified user", async () => {
    users.set("u_bob", {
      id: "u_bob",
      email: "bob@example.com",
      status: "active",
      email_verified_at: null,
    });

    const res = await POST(makeReq({ email: "bob@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({});
    expect(typeof body.meta.request_id).toBe("string");
    expect(verifyTokens).toHaveLength(1);
    expect(verifyTokens[0].user_id).toBe("u_bob");
    expect(mockedSendEmail).toHaveBeenCalledTimes(1);
    expect(mockedSendEmail.mock.calls[0][0].to).toBe("bob@example.com");
  });

  it("resolves the email from the session when the body omits it", async () => {
    users.set("u_bob", {
      id: "u_bob",
      email: "bob@example.com",
      status: "active",
      email_verified_at: null,
    });
    authMock.mockResolvedValue({ user: { id: "u_bob", email: "bob@example.com" } });

    const res = await POST(makeReq({}));

    expect(res.status).toBe(200);
    expect(verifyTokens).toHaveLength(1);
    expect(mockedSendEmail).toHaveBeenCalledTimes(1);
    expect(mockedSendEmail.mock.calls[0][0].to).toBe("bob@example.com");
  });

  it("does not issue a token or send email for an unknown email, still returns 200", async () => {
    const res = await POST(makeReq({ email: "nobody@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({});
    expect(verifyTokens).toHaveLength(0);
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });

  it("does not send email for a non-active user, still returns 200", async () => {
    users.set("u_sus", {
      id: "u_sus",
      email: "sus@example.com",
      status: "suspended",
      email_verified_at: null,
    });

    const res = await POST(makeReq({ email: "sus@example.com" }));

    expect(res.status).toBe(200);
    expect(verifyTokens).toHaveLength(0);
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });

  it("does not send email for an already-verified user, still returns 200", async () => {
    users.set("u_ver", {
      id: "u_ver",
      email: "ver@example.com",
      status: "active",
      email_verified_at: new Date(),
    });

    const res = await POST(makeReq({ email: "ver@example.com" }));

    expect(res.status).toBe(200);
    expect(verifyTokens).toHaveLength(0);
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });

  it("returns VALIDATION_ERROR when neither a session nor a body email is present", async () => {
    const res = await POST(makeReq({}));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });
});
