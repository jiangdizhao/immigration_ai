import { compare } from "bcrypt-ts";
import NextAuth, { type DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { isSessionVersionValid } from "@/lib/auth/session-version";
import { DUMMY_PASSWORD } from "@/lib/constants";
import { createGuestUser, getUser, getUserAuthVersion } from "@/lib/db/queries";
import { authConfig } from "./auth.config";

export type UserType = "guest" | "regular";
export type UserRole = "user" | "admin";
export type MembershipTier = "free" | "vip";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
      role: UserRole;
      membershipTier: MembershipTier;
      vipExpiresAt: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
    role: UserRole;
    membershipTier: MembershipTier;
    vipExpiresAt?: Date | null;
    authVersion?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
    role: UserRole;
    membershipTier: MembershipTier;
    vipExpiresAt: string | null;
    authVersion: number | null;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {},
      async authorize({ email, password }: any) {
        const normalizedEmail = typeof email === "string" ? email : "";
        const suppliedPassword = typeof password === "string" ? password : "";
        const users = normalizedEmail ? await getUser(normalizedEmail) : [];

        // Do not guess which account to use if historical data contains
        // duplicate normalized emails. Authentication fails closed instead.
        if (users.length !== 1) {
          await compare(suppliedPassword, DUMMY_PASSWORD);
          return null;
        }

        const [user] = users;

        if (!user.password) {
          await compare(suppliedPassword, DUMMY_PASSWORD);
          return null;
        }

        const passwordsMatch = await compare(suppliedPassword, user.password);

        if (!passwordsMatch || !user.emailVerifiedAt) {
          return null;
        }

        return { ...user, type: "regular" };
      },
    }),
    Credentials({
      id: "guest",
      credentials: {},
      async authorize() {
        const [guestUser] = await createGuestUser();
        return { ...guestUser, type: "guest" };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.type = user.type;
        token.role = user.role;
        token.membershipTier = user.membershipTier;
        token.vipExpiresAt = user.vipExpiresAt?.toISOString() ?? null;
        token.authVersion =
          user.type === "regular" ? (user.authVersion ?? null) : null;
      }

      if (token.type === "regular") {
        const currentAuthVersion = token.id
          ? await getUserAuthVersion(token.id)
          : null;
        if (
          !isSessionVersionValid({
            type: token.type,
            tokenAuthVersion: token.authVersion,
            currentAuthVersion,
          })
        ) {
          return null;
        }
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
        session.user.role = token.role ?? "user";
        session.user.membershipTier = token.membershipTier ?? "free";
        session.user.vipExpiresAt = (token.vipExpiresAt ??
          null) as typeof session.user.vipExpiresAt;
      }

      return session;
    },
  },
});
