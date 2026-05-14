import { auth } from "@/lib/auth";
import { ApiError, fail, handleError } from "@/lib/api";
import {
  clearAnalyticsOAuthStateCookie,
  exchangeGoogleOAuthCode,
  fetchGoogleAccountEmail,
  readAnalyticsOAuthStateCookie,
  setPendingAnalyticsTokenCookie,
} from "@/lib/analytics/oauth";

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = readAnalyticsOAuthStateCookie();

    if (!code || !state || !expectedState || state !== expectedState) {
      return fail("VALIDATION_ERROR", "Invalid OAuth callback state");
    }

    const token = await exchangeGoogleOAuthCode(code);
    const googleAccountEmail = await fetchGoogleAccountEmail(token);
    if (!googleAccountEmail) {
      throw new ApiError("VALIDATION_ERROR", "Google account email is unavailable for this authorization");
    }

    setPendingAnalyticsTokenCookie({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      scopes: token.scope.split(" ").filter(Boolean),
      google_account_email: googleAccountEmail,
      expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    });
    clearAnalyticsOAuthStateCookie();

    return Response.redirect(new URL("/settings/integrations?provider=google-analytics&stage=select_property", req.url));
  } catch (err) {
    return handleError(err);
  }
}
