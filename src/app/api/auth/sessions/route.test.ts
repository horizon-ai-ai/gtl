type SessionRow = {
  id: string;
  user_id: string;
  ip: string | null;
  user_agent: string | null;
  refresh_token_hash: string;
  revoked_at: Date | null;
  expires_at: Date;
  created_at: Date;
  last_seen_at: Date | null;
};

const sessions: SessionRow[] = [];

const sessionDelegate = {
  findMany: jest.fn(
    async ({
      where,
      select,
    }: {
      where: { user_id: string; revoked_at: null; expires_at: { gt: Date } };
      select: Record<string, boolean>;
    }) => {
      const filtered = sessions.filter(
        (s) =>
          s.user_id === where.user_id &&
          s.revoked_at === null &&
          s.expires_at > where.expires_at.gt
      );
      return filtered.map((row) => {
        const projected: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          if (select[key]) projected[key] = (row as Record<string, unknown>)[key];
        }
        return projected;
      });
    }
  ),
};

const authMock = jest.fn();

jest.mock("@/lib/db", () => ({
  prisma: { session: sessionDelegate },
}));

jest.mock("@/lib/auth", () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

import { GET } from "./route";

beforeEach(() => {
  sessions.length = 0;
  sessionDelegate.findMany.mockClear();
  authMock.mockReset();
});

describe("GET /api/auth/sessions", () => {
  it("returns only the caller's active sessions, flags current correctly, and never leaks refresh_token_hash", async () => {
    const now = Date.now();
    sessions.push(
      {
        id: "s_a",
        user_id: "u_123",
        ip: "1.1.1.1",
        user_agent: "ua-a",
        refresh_token_hash: "secret-a",
        revoked_at: null,
        expires_at: new Date(now + 86400000),
        created_at: new Date(now - 1000),
        last_seen_at: new Date(now - 500),
      },
      {
        id: "s_b",
        user_id: "u_123",
        ip: "2.2.2.2",
        user_agent: "ua-b",
        refresh_token_hash: "secret-b",
        revoked_at: null,
        expires_at: new Date(now + 86400000),
        created_at: new Date(now - 2000),
        last_seen_at: new Date(now - 100),
      },
      {
        id: "s_c",
        user_id: "u_123",
        ip: "3.3.3.3",
        user_agent: "ua-c",
        refresh_token_hash: "secret-c",
        revoked_at: new Date(now - 86400000),
        expires_at: new Date(now + 86400000),
        created_at: new Date(now - 3000),
        last_seen_at: null,
      },
      {
        id: "s_x",
        user_id: "u_999",
        ip: "9.9.9.9",
        user_agent: "ua-x",
        refresh_token_hash: "secret-x",
        revoked_at: null,
        expires_at: new Date(now + 86400000),
        created_at: new Date(now - 4000),
        last_seen_at: null,
      }
    );

    authMock.mockResolvedValue({ user: { id: "u_123" }, sid: "s_b" });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.sessions).toHaveLength(2);
    const ids = body.data.sessions.map((s: { id: string }) => s.id).sort();
    expect(ids).toEqual(["s_a", "s_b"]);

    const current = body.data.sessions.find((s: { id: string }) => s.id === "s_b");
    const notCurrent = body.data.sessions.find((s: { id: string }) => s.id === "s_a");
    expect(current.current).toBe(true);
    expect(notCurrent.current).toBe(false);

    expect(JSON.stringify(body).includes("refresh_token_hash")).toBe(false);
    expect(JSON.stringify(body).includes("secret-")).toBe(false);
    expect(JSON.stringify(body).includes("s_c")).toBe(false);
    expect(JSON.stringify(body).includes("s_x")).toBe(false);
  });

  it("returns 401 when no session is present", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
