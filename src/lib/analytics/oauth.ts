import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import {
  GA_OAUTH_STATE_COOKIE,
  GA_PENDING_TOKEN_COOKIE,
  GA_READONLY_SCOPE,
  type GoogleAnalyticsProperty,
  type GoogleTokenResponse,
  type PendingAnalyticsToken,
} from "./types";
import { decryptAnalyticsSecret, encryptAnalyticsSecret } from "./crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_ACCOUNT_SUMMARIES_URL = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function createAnalyticsOAuthState(userId: string) {
  return createHash("sha256")
    .update(`${userId}:${Date.now()}:${randomBytes(12).toString("hex")}`)
    .digest("hex");
}

export function buildGoogleAnalyticsAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: requiredEnv("GOOGLE_OAUTH_REDIRECT_URI"),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GA_READONLY_SCOPE,
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleOAuthCode(code: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: requiredEnv("GOOGLE_CLIENT_ID"),
    client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: requiredEnv("GOOGLE_OAUTH_REDIRECT_URI"),
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status}`);
  }

  return (await res.json()) as GoogleTokenResponse;
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: requiredEnv("GOOGLE_CLIENT_ID"),
    client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status}`);
  }

  return (await res.json()) as GoogleTokenResponse;
}

function readEmailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;

  try {
    const [, payload] = idToken.split(".");
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string };
    return decoded.email ?? null;
  } catch {
    return null;
  }
}

export async function fetchGoogleAccountEmail(token: Pick<GoogleTokenResponse, "access_token" | "id_token">): Promise<string> {
  const emailFromIdToken = readEmailFromIdToken(token.id_token);
  if (emailFromIdToken) {
    return emailFromIdToken;
  }

  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Google user info: ${res.status}`);
  }
  const json = (await res.json()) as { email?: string };
  if (!json.email) {
    throw new Error("Google account email missing");
  }
  return json.email;
}

export async function listGoogleAnalyticsProperties(accessToken: string): Promise<GoogleAnalyticsProperty[]> {
  const res = await fetch(GOOGLE_ACCOUNT_SUMMARIES_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to list GA properties: ${res.status}`);
  }

  const json = (await res.json()) as {
    accountSummaries?: Array<{
      propertySummaries?: Array<{ property: string; displayName: string }>;
    }>;
  };

  return (json.accountSummaries ?? []).flatMap((account) =>
    (account.propertySummaries ?? []).map((property) => ({
      property_id: property.property,
      property_name: property.displayName,
      measurement_id: null,
    })),
  );
}

export function setAnalyticsOAuthStateCookie(state: string) {
  cookies().set(GA_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
}

export function readAnalyticsOAuthStateCookie() {
  return cookies().get(GA_OAUTH_STATE_COOKIE)?.value ?? null;
}

export function clearAnalyticsOAuthStateCookie() {
  cookies().delete(GA_OAUTH_STATE_COOKIE);
}

export function setPendingAnalyticsTokenCookie(token: PendingAnalyticsToken) {
  const encrypted = encryptAnalyticsSecret(JSON.stringify(token));
  cookies().set(GA_PENDING_TOKEN_COOKIE, JSON.stringify(encrypted), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
}

export function readPendingAnalyticsTokenCookie(): PendingAnalyticsToken | null {
  const raw = cookies().get(GA_PENDING_TOKEN_COOKIE)?.value;
  if (!raw) return null;
  const encrypted = JSON.parse(raw) as { ciphertext: string; iv: string; tag: string };
  return JSON.parse(decryptAnalyticsSecret(encrypted)) as PendingAnalyticsToken;
}

export function clearPendingAnalyticsTokenCookie() {
  cookies().delete(GA_PENDING_TOKEN_COOKIE);
}
