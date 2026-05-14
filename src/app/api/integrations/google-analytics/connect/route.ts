import { auth } from "@/lib/auth";
import { fail, handleError } from "@/lib/api";
import { hasFeature } from "@/lib/feature-flags";
import {
  buildGoogleAnalyticsAuthUrl,
  createAnalyticsOAuthState,
  setAnalyticsOAuthStateCookie,
} from "@/lib/analytics/oauth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const allowed =
      session.user.role === "admin" ||
      session.user.role === "super_admin" ||
      (await hasFeature(session.user.id, "analytics.ga4"));
    if (!allowed) return fail("PLAN_FEATURE_LOCKED", "GA4 integration is not enabled for this plan");

    const state = createAnalyticsOAuthState(session.user.id);
    setAnalyticsOAuthStateCookie(state);

    return Response.redirect(buildGoogleAnalyticsAuthUrl(state));
  } catch (err) {
    return handleError(err);
  }
}
