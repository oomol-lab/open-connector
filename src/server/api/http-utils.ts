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
 * Empty bodies and non-JSON requests resolve to an empty object. Malformed
 * JSON is rejected before route handlers can accidentally execute actions with
 * a damaged request body.
 */
export async function readJsonBody(context: Context, maxBytes?: number): Promise<JsonRequestBody> {
  const contentType = context.req.header("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    const contentLength = Number(context.req.header("content-length"));
    if (maxBytes !== undefined && Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new HttpRequestError("payload_too_large", `Request body must not exceed ${maxBytes} bytes.`, 413);
    }
    let text: string;
    if (maxBytes === undefined) {
      text = await context.req.raw.text();
    } else if (!context.req.raw.body) {
      text = "";
    } else {
      const reader = context.req.raw.body.getReader();
      const decoder = new TextDecoder();
      let byteLength = 0;
      text = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          byteLength += value.byteLength;
          if (byteLength > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new HttpRequestError("payload_too_large", `Request body must not exceed ${maxBytes} bytes.`, 413);
          }
          text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
    const body = text ? (JSON.parse(text) as unknown) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpRequestError("invalid_json", "Request body must be a JSON object.");
    }
    return body as JsonRequestBody;
  } catch (error) {
    if (error instanceof HttpRequestError) {
      throw error;
    }
    throw new HttpRequestError("invalid_json", "Request body must be valid JSON.");
  }
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
export function internalError(context: Context, _error: unknown): Response {
  return jsonError(context, 500, "internal_error", "Internal server error.");
}

/**
 * Escape plain text for the tiny OAuth callback completion page.
 */
export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export class HttpRequestError extends Error {
  readonly code: string;
  readonly status: 400 | 413;

  constructor(code: string, message: string, status: 400 | 413 = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
