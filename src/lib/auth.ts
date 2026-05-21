import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";
import { headers } from "next/headers";
import { prisma } from "./db";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "user" | "admin" | "super_admin";
      type: "personal" | "company";
    } & DefaultSession["user"];
    sid?: string;
  }
}

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const LAST_SEEN_THROTTLE_MS = 60 * 1000;

function getRequestContext(): { ip?: string; user_agent?: string } {
  try {
    const hdrs = headers();
    const fwd = hdrs.get("x-forwarded-for");
    const ip = fwd?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || undefined;
    const user_agent = hdrs.get("user-agent") || undefined;
    return { ip: ip ?? undefined, user_agent };
  } catch {
    return {};
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(creds) {
        const email = creds?.email as string | undefined;
        const password = creds?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password_hash) return null;
        if (user.status !== "active") return null;

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.display_name ?? user.email.split("@")[0],
          image: user.avatar_url,
          role: user.role,
          type: user.type,
        };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        (token as { id?: string }).id = (user as { id: string }).id;
        (token as { role?: string }).role = (user as { role: "user" | "admin" | "super_admin" }).role;
        (token as { type?: string }).type = (user as { type: "personal" | "company" }).type;

        // Persist credentialed sign-in as a Session row and embed its id as `sid`.
        // Auth.js v5 fires events.signIn AFTER the JWT is already encoded, so the
        // row creation lives here (not in events.signIn) — only place we can write
        // the new row's id into the JWT before it is signed.
        if (account?.provider === "credentials") {
          try {
            const { ip, user_agent } = getRequestContext();
            const refreshSecret = randomBytes(32).toString("hex");
            const refresh_token_hash = createHash("sha256")
              .update(refreshSecret)
              .digest("hex");
            const now = new Date();
            const session = await prisma.session.create({
              data: {
                user_id: (token as { id?: string }).id as string,
                refresh_token_hash,
                expires_at: new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000),
                ip,
                user_agent,
                last_seen_at: now,
              },
            });
            (token as { sid?: string }).sid = session.id;
          } catch (err) {
            console.error("[auth] failed to persist Session row on sign-in", err);
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "user" | "admin" | "super_admin";
        session.user.type = token.type as "personal" | "company";
      }

      const sid = (token as { sid?: string }).sid;
      // Legacy JWTs minted before this change ship pass through unchecked so users
      // are not stranded on deploy. Their next sign-in stamps a fresh Session row.
      if (!sid) {
        return session;
      }

      try {
        const row = await prisma.session.findUnique({
          where: { id: sid },
          select: { id: true, revoked_at: true, expires_at: true, last_seen_at: true },
        });
        const now = new Date();
        if (!row || row.revoked_at !== null || row.expires_at <= now) {
          return { ...session, user: undefined } as unknown as typeof session;
        }
        session.sid = row.id;
        if (
          !row.last_seen_at ||
          now.getTime() - row.last_seen_at.getTime() > LAST_SEEN_THROTTLE_MS
        ) {
          await prisma.session
            .update({ where: { id: row.id }, data: { last_seen_at: now } })
            .catch((err) => {
              console.error("[auth] last_seen_at update failed", err);
            });
        }
      } catch (err) {
        console.error("[auth] session lookup failed", err);
      }
      return session;
    },
  },
});

export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  return session.user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "super_admin") {
    throw new Error("FORBIDDEN");
  }
  return user;
}
