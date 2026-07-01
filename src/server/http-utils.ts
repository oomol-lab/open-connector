import type { Context } from "hono";

/**
 * Loose JSON body shape accepted by local HTTP handlers.
 */
export type JsonRequestBody = {
  input?: unknown;
  values?: Record<string, unknown>;
  clientId?: unknown;
  clientSecret?: unknown;
  extra?: unknown;
  [key: string]: unknown;
};

/**
 * Read an optional JSON object request body.
 *
 * Empty bodies, non-JSON requests, and malformed JSON currently resolve to an
 * empty object because connection and execution services perform their own
 * field-level validation.
 */
export async function readJsonBody(context: Context): Promise<JsonRequestBody> {
  const contentType = context.req.header("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  return (await context.req.json().catch(() => ({}))) as JsonRequestBody;
}

/**
 * Write the standard JSON error envelope used by local HTTP routes.
 */
export function jsonError(
  context: Context,
  status: 400 | 401 | 404 | 413 | 500,
  code: string,
  message: string,
): Response {
  return context.json(
    {
      error: {
        code,
        message,
      },
    },
    status,
  );
}

/**
 * Write the standard not-found response.
 */
export function notFound(context: Context): Response {
  return jsonError(context, 404, "not_found", "Not found.");
}

/**
 * Write an unexpected server error without exposing stack traces.
 */
export function internalError(context: Context, error: unknown): Response {
  return jsonError(context, 500, "internal_error", error instanceof Error ? error.message : "Unknown error.");
}

/**
 * Escape plain text for the tiny OAuth callback completion page.
 */
export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
