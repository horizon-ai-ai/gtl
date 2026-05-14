import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "user" | "admin" | "super_admin";
      type: "personal" | "company";
    } & DefaultSession["user"];
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
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
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: string }).role;
        token.type = (user as { type: string }).type;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "user" | "admin" | "super_admin";
        session.user.type = token.type as "personal" | "company";
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
