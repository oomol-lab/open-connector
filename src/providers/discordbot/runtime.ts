import { looseArray, optionalRecord, optionalString, recordOrEmpty } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { providerInputError, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

// Pin actions to v10. An unversioned route goes to Discord's default version, which is
// still the deprecated v6: 31-bit numeric permissions, no threads, and a 204 without the
// member from Modify Guild Member.
const discordRestBaseUrl = "https://discord.com/api/v10";
// The proxy stays unversioned so existing proxy paths, including ones that already
// start with a version such as /v10, keep resolving as before.
export const discordProxyBaseUrl = "https://discord.com/api";

export interface DiscordbotContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export type DiscordbotActionHandler = (input: Record<string, unknown>, context: DiscordbotContext) => Promise<unknown>;

interface DiscordbotRequestOptions {
  method?: string;
  path: string;
  query?: Record<string, unknown>;
  /** JSON body. Discord's position endpoints take a top-level array. */
  body?: Record<string, unknown> | unknown[];
  context: DiscordbotContext;
  authenticated?: boolean;
  skipError?: boolean;
  /** Sent as `X-Audit-Log-Reason` on endpoints that record one. */
  auditLogReason?: unknown;
}

/** Send a Discord request and parse the JSON response body. */
export async function discordbotRequestJson(input: DiscordbotRequestOptions): Promise<unknown> {
  return readDiscordbotJson(await discordbotRequest(input));
}

/**
 * Send a Discord request whose success may be 200 with a JSON body or 204 with none,
 * returning null for the 204.
 */
export async function discordbotRequestJsonOrNull(input: DiscordbotRequestOptions): Promise<unknown> {
  const response = await discordbotRequest(input);
  return response.status === 204 ? null : readDiscordbotJson(response);
}

/** Send a Discord request that answers with 204 No Content. */
export async function discordbotRequestNoContent(input: DiscordbotRequestOptions): Promise<{ success: true }> {
  await discordbotRequest(input);
  return { success: true };
}

/** Send a Discord request, mapping non-2xx responses to provider errors unless `skipError` is set. */
export async function discordbotRequest(input: DiscordbotRequestOptions): Promise<Response> {
  const url = new URL(`${discordRestBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  const headers = new Headers();
  if (input.authenticated !== false) {
    headers.set("authorization", `Bot ${input.context.apiKey}`);
  }
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  const auditLogReason = optionalString(input.auditLogReason);
  if (auditLogReason) {
    // Discord reads the header as URL-encoded UTF-8.
    headers.set("x-audit-log-reason", encodeURIComponent(auditLogReason));
  }
  const response = await input.context.fetcher(url, {
    method: input.method,
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.context.signal,
  });
  if (!input.skipError && !response.ok) {
    throw await toDiscordbotError(response);
  }
  return response;
}

/**
 * Read a required snowflake input for use as one URL path segment. Only digits are
 * accepted, because percent-encoding cannot keep an arbitrary id inside one segment:
 * URL parsing resolves `.` and `..` as dot segments, and Discord decodes `%2F` into a
 * path separator before routing. Either would send the request, with the same method
 * and bot token, to another endpoint: `role_id: ".."` turns a role DELETE into one on
 * the guild itself, and `user_id: "U/roles/R"` on Add Guild Member grants role R.
 */
export function requiredPath(value: unknown, field: string): string {
  const segment = requiredInputString(value, field);
  if (!/^\d+$/.test(segment)) {
    throw providerInputError(`${field} must be a numeric Discord snowflake id`);
  }
  return segment;
}

async function readDiscordbotJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Discord returned invalid JSON");
  }
}

async function toDiscordbotError(response: Response): Promise<ProviderRequestError> {
  const text = await response.text().catch(() => "");
  let payload: Record<string, unknown> | undefined;
  try {
    payload = optionalRecord(JSON.parse(text));
  } catch {}
  const message =
    optionalString(payload?.message) ??
    optionalString(payload?.error_description) ??
    optionalString(payload?.error) ??
    text;
  // A form error's message is only "Invalid Form Body"; the failing fields are in `errors`.
  const formErrors = collectDiscordbotFormErrors(payload?.errors, "");
  const resolvedMessage =
    formErrors.length > 0
      ? `${message}: ${formErrors.join("; ")}`
      : message || `Discord request failed with ${response.status}`;
  const details = payload
    ? jsonObject({ code: payload.code, errors: payload.errors, retry_after: payload.retry_after })
    : undefined;
  // Discord answers 403 when the bot lacks a guild or channel permission, such as
  // "Missing Permissions" or "Missing Access". The token still works, so this must
  // not read as authorization_failed, which clients treat as "reconnect".
  if (response.status === 403) {
    return new ProviderRequestError(403, resolvedMessage, details, "invalid_input");
  }
  return new ProviderRequestError(response.status, resolvedMessage, details);
}

/**
 * Flatten Discord's form errors into `path: message` entries. Each failing JSON key,
 * or array index, nests down to an `_errors` list of `{ code, message }`; an `_errors`
 * list at the top level describes the request as a whole and has no path.
 */
function collectDiscordbotFormErrors(errors: unknown, path: string): string[] {
  return Object.entries(recordOrEmpty(errors)).flatMap(([key, value]) => {
    if (key !== "_errors") {
      return collectDiscordbotFormErrors(value, path ? `${path}.${key}` : key);
    }
    return looseArray(value).flatMap((item) => {
      const message = optionalString(optionalRecord(item)?.message);
      return message ? [path ? `${path}: ${message}` : message] : [];
    });
  });
}
