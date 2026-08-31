import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { jsonObject, queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

const apiPath = "/api/external/v2";

export interface NeetodeskContext {
  apiKey: string;
  subdomain: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export function normalizeNeetodeskSubdomain(value: unknown): string {
  const subdomain = requiredString(
    value,
    "subdomain",
    (message) => new ProviderRequestError(400, message),
  ).toLowerCase();
  if (subdomain.length > 63 || subdomain.startsWith("-") || subdomain.endsWith("-")) {
    throw new ProviderRequestError(400, "subdomain must be a valid NeetoDesk workspace subdomain");
  }
  for (const character of subdomain) {
    const valid = (character >= "a" && character <= "z") || (character >= "0" && character <= "9") || character === "-";
    if (!valid) throw new ProviderRequestError(400, "subdomain must contain only letters, numbers, and hyphens");
  }
  return subdomain;
}

export function neetodeskBaseUrl(subdomain: string): string {
  return `https://${normalizeNeetodeskSubdomain(subdomain)}.neetodesk.com${apiPath}`;
}

const handler =
  (
    method: "GET" | "POST" | "PUT",
    path: (input: Record<string, unknown>) => string,
    mode: "none" | "query" | "body",
  ): ProviderRuntimeHandler<NeetodeskContext> =>
  (input, context) =>
    requestNeetodesk({
      context,
      method,
      path: path(input),
      query: mode === "query" ? inputQuery(input) : undefined,
      body: mode === "body" ? jsonObject(input) : undefined,
      phase: "execute",
    });

function ticketPath(input: Record<string, unknown>): string {
  return `/tickets/${encodeURIComponent(requiredString(input.ticket_id, "ticket_id"))}`;
}

export const neetodeskActionHandlers: ProviderActionHandlers<"neetodesk", ProviderRuntimeHandler<NeetodeskContext>> = {
  list_tickets: handler("GET", () => "/tickets", "query"),
  get_ticket: handler("GET", ticketPath, "none"),
  create_ticket: handler("POST", () => "/tickets", "body"),
  update_ticket: (input, context) =>
    requestNeetodesk({
      context,
      method: "PUT",
      path: ticketPath(input),
      body: withoutTicketId(input),
      phase: "execute",
    }),
  list_comments: (input, context) =>
    requestNeetodesk({
      context,
      method: "GET",
      path: `${ticketPath(input)}/comments`,
      query: queryParams({ page_number: input.page_number as number, page_size: input.page_size as number }),
      phase: "execute",
    }),
  create_comment: (input, context) =>
    requestNeetodesk({
      context,
      method: "POST",
      path: `${ticketPath(input)}/comments`,
      body: withoutTicketId(input),
      phase: "execute",
    }),
  list_team_members: handler("GET", () => "/team-members", "query"),
};

export async function validateNeetodeskCredential(
  apiKey: string,
  subdomainInput: unknown,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const subdomain = normalizeNeetodeskSubdomain(subdomainInput);
  await requestNeetodesk({
    context: { apiKey, subdomain, fetcher, signal },
    method: "GET",
    path: "/tickets",
    query: { page_number: "1", page_size: "1" },
    phase: "validate",
  });
  return {
    profile: { accountId: `neetodesk:${subdomain}`, displayName: `${subdomain}.neetodesk.com` },
    grantedScopes: Object.keys(neetodeskActionHandlers),
    metadata: { subdomain, baseUrl: neetodeskBaseUrl(subdomain) },
  };
}

interface NeetodeskRequest {
  context: NeetodeskContext;
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  phase: "validate" | "execute";
}

async function requestNeetodesk(input: NeetodeskRequest): Promise<unknown> {
  const url = new URL(`${neetodeskBaseUrl(input.context.subdomain)}${input.path}`);
  for (const [name, value] of Object.entries(input.query ?? {})) url.searchParams.set(name, value);
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        ...(input.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
        "x-api-key": input.context.apiKey,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "NeetoDesk returned invalid JSON",
    });
    if (!response.ok) throw neetodeskError(response.status, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortSignalError(timeout.signal, error)) {
      throw new ProviderRequestError(504, "NeetoDesk request timed out");
    }
    throw new ProviderRequestError(502, "NeetoDesk request failed");
  } finally {
    timeout.cleanup();
  }
}

function withoutTicketId(input: Record<string, unknown>): Record<string, unknown> {
  const body = { ...input };
  delete body.ticket_id;
  return jsonObject(body);
}

function inputQuery(input: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "number") query[key] = String(value);
  }
  return query;
}

function neetodeskError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = optionalString(optionalRecord(payload)?.error) ?? `NeetoDesk request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 401 || status === 403) return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}
