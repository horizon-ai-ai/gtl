type SessionRow = {
  id: string;
  user_id: string;
  revoked_at: Date | null;
  expires_at: Date;
};

const sessions: SessionRow[] = [];

const sessionDelegate = {
  updateMany: jest.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string; user_id: string; revoked_at: null };
      data: { revoked_at: Date };
    }) => {
      let count = 0;
      for (const s of sessions) {
        if (
          s.id === where.id &&
          s.user_id === where.user_id &&
          s.revoked_at === null
        ) {
          s.revoked_at = data.revoked_at;
          count++;
        }
      }
      return { count };
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

import { DELETE } from "./route";

function makeReq(): import("next/server").NextRequest {
  const req = new Request("http://localhost/api/auth/sessions/x", { method: "DELETE" });
  return req as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  sessions.length = 0;
  sessionDelegate.updateMany.mockClear();
  authMock.mockReset();
});

describe("DELETE /api/auth/sessions/:id", () => {
  it("revokes a session the caller owns and returns 200", async () => {
    sessions.push({
      id: "s_own",
      user_id: "u_123",
      revoked_at: null,
      expires_at: new Date(Date.now() + 86400000),
    });
    authMock.mockResolvedValue({ user: { id: "u_123" }, sid: "s_other" });

    const res = await DELETE(makeReq(), { params: { id: "s_own" } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({});
    expect(sessions[0].revoked_at).not.toBeNull();
  });

  it("returns 404 RESOURCE_NOT_FOUND when the session belongs to another user; does not mutate the row", async () => {
    sessions.push({
      id: "s_others",
      user_id: "u_999",
      revoked_at: null,
      expires_at: new Date(Date.now() + 86400000),
    });
    authMock.mockResolvedValue({ user: { id: "u_123" }, sid: "s_mine" });

    const res = await DELETE(makeReq(), { params: { id: "s_others" } });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
    expect(sessions[0].revoked_at).toBeNull();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(makeReq(), { params: { id: "anything" } });
    expect(res.status).toBe(401);
  });
});
