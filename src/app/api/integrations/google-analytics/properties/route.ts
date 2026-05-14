import { z } from "zod";
import { auth } from "@/lib/auth";
import { ApiError, fail, handleError, ok } from "@/lib/api";
import { getNumericFeature, hasFeature } from "@/lib/feature-flags";
import { prisma } from "@/lib/db";
import { encryptAnalyticsSecret } from "@/lib/analytics/crypto";
import {
  clearPendingAnalyticsTokenCookie,
  listGoogleAnalyticsProperties,
  readPendingAnalyticsTokenCookie,
} from "@/lib/analytics/oauth";

const createSchema = z.object({
  property_id: z.string().min(1),
  property_name: z.string().min(1),
  measurement_id: z.string().optional(),
});

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const allowed =
      session.user.role === "admin" ||
      session.user.role === "super_admin" ||
      (await hasFeature(session.user.id, "analytics.ga4"));
    if (!allowed) return fail("PLAN_FEATURE_LOCKED", "GA4 integration is not enabled for this plan");

    const pending = readPendingAnalyticsTokenCookie();
    if (!pending?.access_token) {
      return ok([]);
    }

    const properties = await listGoogleAnalyticsProperties(pending.access_token);
    return ok(properties);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) return fail("UNAUTHORIZED", "Not signed in");

    const allowed =
      session.user.role === "admin" ||
      session.user.role === "super_admin" ||
      (await hasFeature(session.user.id, "analytics.ga4"));
    if (!allowed) return fail("PLAN_FEATURE_LOCKED", "GA4 integration is not enabled for this plan");

    const pending = readPendingAnalyticsTokenCookie();
    if (!pending?.access_token || !pending.refresh_token) {
      throw new ApiError("VALIDATION_ERROR", "Missing pending OAuth token");
    }

    const body = createSchema.parse(await req.json());
    const maxConnections =
      session.user.role === "admin" || session.user.role === "super_admin"
        ? 9999
        : (await getNumericFeature(session.user.id, "analytics.max_connections")) ?? 1;
    const activeConnections = await prisma.googleAnalyticsConnection.count({
      where: { user_id: session.user.id, status: { not: "revoked" } },
    });
    if (activeConnections >= maxConnections) {
      throw new ApiError("BUSINESS_RULE_VIOLATION", "Analytics connection limit reached");
    }

    const secret = encryptAnalyticsSecret(pending.refresh_token);
    const connection = await prisma.googleAnalyticsConnection.upsert({
      where: {
        user_id_property_id: {
          user_id: session.user.id,
          property_id: body.property_id,
        },
      },
      update: {
        google_account_email: pending.google_account_email,
        property_name: body.property_name,
        measurement_id: body.measurement_id,
        refresh_token_ciphertext: secret.ciphertext,
        refresh_token_iv: secret.iv,
        refresh_token_tag: secret.tag,
        access_token: pending.access_token,
        access_token_expires_at: new Date(pending.expires_at),
        scopes: pending.scopes,
        status: "active",
      },
      create: {
        user_id: session.user.id,
        google_account_email: pending.google_account_email,
        property_id: body.property_id,
        property_name: body.property_name,
        measurement_id: body.measurement_id,
        refresh_token_ciphertext: secret.ciphertext,
        refresh_token_iv: secret.iv,
        refresh_token_tag: secret.tag,
        access_token: pending.access_token,
        access_token_expires_at: new Date(pending.expires_at),
        scopes: pending.scopes,
        status: "active",
      },
    });

    clearPendingAnalyticsTokenCookie();
    return ok(connection);
  } catch (err) {
    return handleError(err);
  }
}
