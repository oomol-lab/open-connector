import { optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { providerInputError, ProviderRequestError } from "../provider-runtime.ts";

export const discordApiBaseUrl = "https://discord.com/api";

export interface DiscordbotContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export type DiscordbotActionHandler = (input: Record<string, unknown>, context: DiscordbotContext) => Promise<unknown>;

export interface DiscordbotRequestOptions {
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
  const response = await discordbotRequest(input);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Discord returned invalid JSON");
  }
}

/** Send a Discord request that answers with 204 No Content. */
export async function discordbotRequestNoContent(input: DiscordbotRequestOptions): Promise<{ success: true }> {
  await discordbotRequest(input);
  return { success: true };
}

/** Send a Discord request, mapping non-2xx responses to provider errors unless `skipError` is set. */
export async function discordbotRequest(input: DiscordbotRequestOptions): Promise<Response> {
  const url = new URL(`${discordApiBaseUrl}${input.path}`);
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
    throw await toDiscordbotError(response, input.authenticated !== false);
  }
  return response;
}

/** Read a required snowflake input and encode it as one URL path segment. */
export function requiredPath(value: unknown, field: string): string {
  return encodePathSegment(requiredString(value, field, providerInputError));
}

async function toDiscordbotError(response: Response, authenticated: boolean): Promise<ProviderRequestError> {
  const text = await response.text().catch(() => "");
  let message = text;
  if (text) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      message =
        optionalString(parsed.message) ??
        optionalString(parsed.error_description) ??
        optionalString(parsed.error) ??
        text;
    } catch {}
  }
  const resolvedMessage = message || `Discord request failed with ${response.status}`;
  if (authenticated && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, resolvedMessage);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, resolvedMessage);
  }
  return new ProviderRequestError(response.status, resolvedMessage);
}
