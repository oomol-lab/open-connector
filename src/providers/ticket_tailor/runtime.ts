import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { readProviderTextBody } from "../provider-runtime.ts";
import {
  basicAuthorizationHeader,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const ticketTailorApiBaseUrl = "https://api.tickettailor.com";
const ticketTailorApiKeyHelpUrl =
  "https://help.tickettailor.com/en/articles/4593218-how-do-i-connect-to-the-ticket-tailor-api";
interface RequestInput {
  apiKey: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}
interface ActionRoute {
  collectionPath: string;
  idField?: string;
  queryFields?: readonly string[];
}
const paginationFields = ["starting_after", "ending_before", "limit"];
const actionRoutes: Record<string, ActionRoute> = {
  list_events: {
    collectionPath: "/v1/events",
    queryFields: [
      ...paginationFields,
      "start_at",
      "start_at.gt",
      "start_at.gte",
      "start_at.lt",
      "start_at.lte",
      "end_at",
      "end_at.gt",
      "end_at.gte",
      "end_at.lt",
      "end_at.lte",
      "status",
      "name",
      "venue",
    ],
  },
  get_event: { collectionPath: "/v1/events", idField: "event_id" },
  list_orders: {
    collectionPath: "/v1/orders",
    queryFields: [
      ...paginationFields,
      "created_at",
      "created_at.gt",
      "created_at.gte",
      "created_at.lt",
      "created_at.lte",
      "name",
      "email",
      "txn_id",
      "barcode",
      "event_id",
      "event_series_id",
      "status",
      "store_id",
      "referral_tag",
    ],
  },
  get_order: { collectionPath: "/v1/orders", idField: "order_id" },
  list_issued_tickets: {
    collectionPath: "/v1/issued_tickets",
    queryFields: [
      ...paginationFields,
      "event_id",
      "event_series_id",
      "order_id",
      "barcode",
      "name",
      "email",
      "reference",
      "status",
      "created_at",
      "created_at.gt",
      "created_at.gte",
      "created_at.lt",
      "created_at.lte",
    ],
  },
  get_issued_ticket: { collectionPath: "/v1/issued_tickets", idField: "issued_ticket_id" },
};
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
function createHandler(route: ActionRoute): Handler {
  return async (input, context) => {
    const path = route.idField
      ? `${route.collectionPath}/${encodeURIComponent(requiredInputString(input[route.idField], route.idField))}`
      : route.collectionPath;
    const payload = await requestTicketTailorJson({
      apiKey: context.apiKey,
      path,
      query: route.idField ? undefined : buildListQuery(input, route.queryFields ?? []),
      fetcher: context.fetcher,
      signal: context.signal,
    });
    if (route.idField) return requiredResponseRecord(payload, "Ticket Tailor resource response");
    const response = requiredResponseRecord(payload, "Ticket Tailor list response");
    return { ...response, data: requireArray(response.data, "Ticket Tailor list response data") };
  };
}
export const ticketTailorActionHandlers = Object.fromEntries(
  Object.entries(actionRoutes).map(([name, route]) => [name, createHandler(route)]),
) as ProviderActionHandlers<"ticket_tailor", Handler>;
export async function validateTicketTailorCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestTicketTailorJson({ apiKey, path: "/v1/ping", fetcher, signal });
  return {
    profile: { accountId: "ticket-tailor", displayName: "Ticket Tailor Box Office" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: ticketTailorApiBaseUrl,
      validationEndpoint: "/v1/ping",
      credentialHelpUrl: ticketTailorApiKeyHelpUrl,
    },
  };
}
function buildListQuery(
  input: Record<string, unknown>,
  fields: readonly string[],
): Record<string, string | number | undefined> {
  const query: Record<string, string | number | undefined> = {};
  for (const field of fields)
    query[field] =
      field === "limit" || field.includes("_at") ? optionalInteger(input[field]) : optionalString(input[field]);
  return compactObject(query);
}
async function requestTicketTailorJson(input: RequestInput): Promise<unknown> {
  return runProviderRequest({ label: "Ticket Tailor", signal: input.signal }, async (signal) => {
    const url = new URL(input.path, ticketTailorApiBaseUrl);
    for (const [key, value] of Object.entries(input.query ?? {}))
      if (value !== undefined) url.searchParams.set(key, String(value));
    const response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: basicAuthorizationHeader(`${input.apiKey}:`),
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createError(response, payload);
    return payload;
  });
}
async function readPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Ticket Tailor response");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Ticket Tailor returned invalid JSON");
  }
}
function createError(response: Response, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload) ?? {};
  const upstreamMessage =
    optionalString(record.message) ??
    optionalString(record.error) ??
    `Ticket Tailor request failed with HTTP ${response.status}`;
  const code = optionalString(record.error_code);
  return new ProviderRequestError(
    response.status || 502,
    code ? `[${code}] ${upstreamMessage}` : upstreamMessage,
    payload,
  );
}
function requireArray(value: unknown, label: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw new ProviderRequestError(502, `${label} must be an array`);
}
