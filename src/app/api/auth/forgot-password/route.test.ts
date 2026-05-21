type TokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  status: "active" | "suspended" | "deleted";
};

const users = new Map<string, UserRow>();
const resetTokens: TokenRow[] = [];

jest.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) return Array.from(users.values()).find((u) => u.email === where.email) ?? null;
        if (where.id) return users.get(where.id) ?? null;
        return null;
      }),
    },
    passwordResetToken: {
      create: jest.fn(async ({ data }: { data: Partial<TokenRow> }) => {
        const row: TokenRow = {
          id: `t_${resetTokens.length + 1}`,
          user_id: data.user_id!,
          token_hash: data.token_hash!,
          expires_at: data.expires_at!,
          consumed_at: null,
          created_at: new Date(),
        };
        resetTokens.push(row);
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
          for (const r of resetTokens) {
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

import { sendEmail } from "@/lib/notify";
import { POST } from "./route";

const mockedSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

function makeReq(body: unknown): import("next/server").NextRequest {
  const req = new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return req as unknown as import("next/server").NextRequest;
}

let infoSpy: jest.SpyInstance;

beforeEach(() => {
  users.clear();
  resetTokens.length = 0;
  mockedSendEmail.mockClear();
  infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  infoSpy.mockRestore();
});

describe("POST /api/auth/forgot-password", () => {
  it("issues a token and dispatches an email for a known active user", async () => {
    users.set("u_alice", {
      id: "u_alice",
      email: "alice@example.com",
      password_hash: "$2b$12$abc",
      status: "active",
    });

    const res = await POST(makeReq({ email: "alice@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({});
    expect(resetTokens).toHaveLength(1);
    expect(resetTokens[0].user_id).toBe("u_alice");
    expect(resetTokens[0].consumed_at).toBeNull();
    expect(mockedSendEmail).toHaveBeenCalledTimes(1);
    expect(mockedSendEmail.mock.calls[0][0].to).toBe("alice@example.com");
  });

  it("returns the same shape and logs [forgot-password:no-match] for an unknown email", async () => {
    const res = await POST(makeReq({ email: "nobody@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({});
    expect(resetTokens).toHaveLength(0);
    expect(mockedSendEmail).not.toHaveBeenCalled();
    const matched = infoSpy.mock.calls.some(
      (call) => call[0] === "[forgot-password:no-match]"
    );
    expect(matched).toBe(true);
  });

  it("returns identical body and status for known and unknown emails", async () => {
    users.set("u_alice", {
      id: "u_alice",
      email: "alice@example.com",
      password_hash: "$2b$12$abc",
      status: "active",
    });

    const knownRes = await POST(makeReq({ email: "alice@example.com" }));
    const knownBody = await knownRes.json();
    const unknownRes = await POST(makeReq({ email: "nobody@example.com" }));
    const unknownBody = await unknownRes.json();

    expect(knownRes.status).toBe(unknownRes.status);
    expect(Object.keys(knownBody).sort()).toEqual(Object.keys(unknownBody).sort());
    expect(knownBody.data).toEqual(unknownBody.data);
  });
});
