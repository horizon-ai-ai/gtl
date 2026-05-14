import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "PLAN_FEATURE_LOCKED"
  | "QUOTA_EXCEEDED"
  | "RESOURCE_NOT_FOUND"
  | "CONFLICT"
  | "BUSINESS_RULE_VIOLATION"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "UPSTREAM_ERROR";

const STATUS: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  PLAN_FEATURE_LOCKED: 403,
  QUOTA_EXCEEDED: 403,
  RESOURCE_NOT_FOUND: 404,
  CONFLICT: 409,
  BUSINESS_RULE_VIOLATION: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  UPSTREAM_ERROR: 502,
};

function requestId(): string {
  return `req_${Math.random().toString(36).slice(2, 14)}`;
}

export function ok<T>(data: T, init?: { meta?: Record<string, unknown> }) {
  return NextResponse.json({
    data,
    meta: { request_id: requestId(), ...init?.meta },
  });
}

export function fail(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error: { code, message, details, request_id: requestId() },
    },
    { status: STATUS[code] }
  );
}

export class ApiError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export function handleError(err: unknown) {
  if (err instanceof ApiError) {
    return fail(err.code, err.message, err.details);
  }
  if (err instanceof ZodError) {
    return fail("VALIDATION_ERROR", "Invalid input", {
      issues: err.flatten(),
    });
  }
  console.error("[API ERROR]", err);
  return fail("INTERNAL_ERROR", "Internal server error");
}
