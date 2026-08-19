import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const ticketSourceApiBaseUrl = "https://api.ticketsource.io";
type Phase = "validate" | "execute";

async function execute(path: string, input: Record<string, unknown>, context: ApiKeyProviderContext, list?: string) {
  const query: Record<string, string> = {};
  if (input.page !== undefined) query.page = String(input.page);
  if (input.perPage !== undefined) query.per_page = String(input.perPage);
  const payload = await request(path, query, context.apiKey, context.fetcher, "execute");
  if (!list) return { event: readResource(optionalRecord(payload)?.data) };
  const body = optionalRecord(payload);
  if (!body || !Array.isArray(body.data))
    throw new ProviderRequestError(502, "TicketSource returned an invalid data list");
  return {
    [list]: body.data.map(readResource),
    links: requiredObject(body.links, "links"),
    meta: requiredObject(body.meta, "meta"),
  };
}

function eventPath(input: Record<string, unknown>, suffix = "") {
  return `/events/${encodeURIComponent(requiredString(input.eventId, "eventId"))}${suffix}`;
}

export const ticketSourceActionHandlers: ProviderActionHandlers<
  "ticket_source",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  list_events: (input, context) => execute("/events", input, context, "events"),
  get_event: (input, context) => execute(eventPath(input), input, context),
  list_event_venues: (input, context) => execute(eventPath(input, "/venues"), input, context, "venues"),
  list_event_dates: (input, context) => execute(eventPath(input, "/dates"), input, context, "dates"),
};

export async function validateTicketSourceCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  await request("/events", { page: "1", per_page: "1" }, apiKey, fetcher, "validate");
  return {
    profile: { displayName: "TicketSource API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: ticketSourceApiBaseUrl },
  };
}

async function request(
  path: string,
  query: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  phase: Phase,
) {
  const url = new URL(path, ticketSourceApiBaseUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  const response = await fetcher(url, {
    headers: { accept: "application/json", authorization: `Bearer ${apiKey}`, "user-agent": providerUserAgent },
  });
  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = { message: text };
    }
  }
  if (!response.ok) throw mapError(response.status, payload, phase);
  return payload;
}

function readResource(value: unknown) {
  const item = requiredObject(value, "resource");
  if (typeof item.id !== "string" || typeof item.type !== "string")
    throw new ProviderRequestError(502, "TicketSource returned an invalid resource");
  return {
    id: item.id,
    type: item.type,
    attributes: requiredObject(item.attributes, "resource attributes"),
    links: requiredObject(item.links, "resource links"),
  };
}

function requiredObject(value: unknown, name: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(502, `TicketSource returned invalid ${name}`);
  return object;
}

function mapError(status: number, payload: unknown, phase: Phase) {
  const body = optionalRecord(payload);
  const message =
    optionalString(body?.message) ??
    optionalString(body?.error) ??
    `TicketSource API request failed with status ${status}`;
  if (status === 401 || status === 403) return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  if (status === 429) return new ProviderRequestError(429, message);
  if (status >= 400 && status < 500) return new ProviderRequestError(status, message);
  return new ProviderRequestError(status || 502, message);
}
