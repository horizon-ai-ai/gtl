type Row = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
};

function makeStore() {
  const rows = new Map<string, Row>();
  let nextId = 1;
  return {
    rows,
    delegate: {
      create: jest.fn(async ({ data }: { data: Partial<Row> }) => {
        const row: Row = {
          id: `row_${nextId++}`,
          user_id: data.user_id!,
          token_hash: data.token_hash!,
          expires_at: data.expires_at!,
          consumed_at: data.consumed_at ?? null,
          created_at: new Date(),
        };
        rows.set(row.token_hash, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { token_hash: string } }) => {
        return rows.get(where.token_hash) ?? null;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        let found: Row | undefined;
        rows.forEach((r) => {
          if (r.id === where.id) found = r;
        });
        if (!found) throw new Error("not found");
        Object.assign(found, data);
        return found;
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
          rows.forEach((r) => {
            if (r.user_id === where.user_id && r.consumed_at === null) {
              r.consumed_at = data.consumed_at;
              count += 1;
            }
          });
          return { count };
        }
      ),
    },
  };
}

const resetStore = makeStore();
const verifyStore = makeStore();

jest.mock("@/lib/db", () => ({
  prisma: {
    passwordResetToken: resetStore.delegate,
    emailVerificationToken: verifyStore.delegate,
  },
}));

import { issueToken, consumeToken } from "./tokens";
import { ApiError } from "@/lib/api";

beforeEach(() => {
  resetStore.rows.clear();
  verifyStore.rows.clear();
  resetStore.delegate.create.mockClear();
  resetStore.delegate.findUnique.mockClear();
  resetStore.delegate.update.mockClear();
  resetStore.delegate.updateMany.mockClear();
  verifyStore.delegate.create.mockClear();
  verifyStore.delegate.findUnique.mockClear();
  verifyStore.delegate.update.mockClear();
  verifyStore.delegate.updateMany.mockClear();
});

describe("issueToken", () => {
  it("returns a 64-char hex token, SHA-256 hash, and a future expires_at", async () => {
    const before = Date.now();
    const result = await issueToken("u_1", "reset");
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    const elapsed = result.expires_at.getTime() - before;
    expect(elapsed).toBeGreaterThanOrEqual(29 * 60 * 1000);
    expect(elapsed).toBeLessThanOrEqual(31 * 60 * 1000);
    expect(resetStore.delegate.create).toHaveBeenCalledTimes(1);
  });

  it("uses a 24h TTL for verify purpose", async () => {
    const before = Date.now();
    const result = await issueToken("u_1", "verify");
    const elapsed = result.expires_at.getTime() - before;
    expect(elapsed).toBeGreaterThanOrEqual(23 * 60 * 60 * 1000);
    expect(elapsed).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    expect(verifyStore.delegate.create).toHaveBeenCalledTimes(1);
  });

  it("supersedes prior unconsumed reset tokens for the same user when re-issuing", async () => {
    const first = await issueToken("u_supersede", "reset");
    const second = await issueToken("u_supersede", "reset");

    const firstRow = resetStore.rows.get(first.hash)!;
    const secondRow = resetStore.rows.get(second.hash)!;
    expect(firstRow.consumed_at).not.toBeNull();
    expect(secondRow.consumed_at).toBeNull();

    await expect(consumeToken(first.token, "reset")).rejects.toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
    });
    const ok = await consumeToken(second.token, "reset");
    expect(ok.user_id).toBe("u_supersede");
  });

  it("does not supersede tokens belonging to other users", async () => {
    const a = await issueToken("u_a", "reset");
    await issueToken("u_b", "reset");

    const rowA = resetStore.rows.get(a.hash)!;
    expect(rowA.consumed_at).toBeNull();
  });

  it("supersedes prior unconsumed verify tokens independently of reset tokens", async () => {
    const reset = await issueToken("u_x", "reset");
    const firstVerify = await issueToken("u_x", "verify");
    const secondVerify = await issueToken("u_x", "verify");

    expect(resetStore.rows.get(reset.hash)!.consumed_at).toBeNull();
    expect(verifyStore.rows.get(firstVerify.hash)!.consumed_at).not.toBeNull();
    expect(verifyStore.rows.get(secondVerify.hash)!.consumed_at).toBeNull();
  });
});

describe("consumeToken", () => {
  it("resolves a fresh token to its user and sets consumed_at", async () => {
    const issued = await issueToken("u_42", "reset");
    const result = await consumeToken(issued.token, "reset");
    expect(result.user_id).toBe("u_42");
    const row = resetStore.rows.get(issued.hash)!;
    expect(row.consumed_at).not.toBeNull();
  });

  it("throws RESOURCE_NOT_FOUND when the hash is unknown", async () => {
    await expect(consumeToken("nonexistent-token", "reset")).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
    await expect(consumeToken("nonexistent-token", "verify")).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });

  it("throws BUSINESS_RULE_VIOLATION when the token is expired but unconsumed", async () => {
    const issued = await issueToken("u_99", "reset");
    const row = resetStore.rows.get(issued.hash)!;
    row.expires_at = new Date(Date.now() - 60 * 1000);

    const err = await consumeToken(issued.token, "reset").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("BUSINESS_RULE_VIOLATION");
    expect(row.consumed_at).toBeNull();
  });

  it("throws BUSINESS_RULE_VIOLATION when the token is already consumed", async () => {
    const issued = await issueToken("u_7", "verify");
    const row = verifyStore.rows.get(issued.hash)!;
    row.consumed_at = new Date();

    const err = await consumeToken(issued.token, "verify").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe("BUSINESS_RULE_VIOLATION");
  });
});
