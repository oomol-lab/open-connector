import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const waiverforeverApiBaseUrl = "https://api.waiverforever.com";
export const waiverforeverUserInfoPath = "/openapi/v1/auth/userInfo";

type WaiverForeverRequestPhase = "validate" | "execute";
type WaiverForeverActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export interface WaiverForeverUserInfo {
  username: string | null;
  raw: Record<string, unknown>;
}

export const waiverforeverActionHandlers: ProviderActionHandlers<"waiverforever", WaiverForeverActionHandler> = {
  get_user_info(_input, context) {
    return getWaiverForeverUserInfo(context.apiKey, context.fetcher, context.signal);
  },
  list_templates(_input, context) {
    return executeListTemplates(context);
  },
  create_template_signing_link(input, context) {
    return executeCreateTemplateSigningLink(input, context);
  },
  get_waiver(input, context) {
    return executeGetWaiver(input, context);
  },
  search_waivers(input, context) {
    return executeSearchWaivers(input, context);
  },
  create_waiver_request(input, context) {
    return executeCreateWaiverRequest(input, context);
  },
  get_waiver_request(input, context) {
    return executeGetWaiverRequest(input, context);
  },
  list_waiver_requests(input, context) {
    return executeListWaiverRequests(input, context);
  },
};

export async function getWaiverForeverUserInfo(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
  phase: WaiverForeverRequestPhase = "execute",
): Promise<WaiverForeverUserInfo> {
  const payload = await waiverforeverGetJson(waiverforeverUserInfoPath, { apiKey, fetcher, signal }, phase);
  return normalizeUserInfoPayload(payload);
}

async function executeListTemplates(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await waiverforeverGetJson("/openapi/v1/templates", context);
  return normalizeTemplateListPayload(payload);
}

async function executeCreateTemplateSigningLink(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const query = new URLSearchParams();
  appendOptionalQuery(query, "ttl", input.ttl);
  appendOptionalQuery(query, "pending_enabled", input.pending_enabled);
  const payload = await waiverforeverGetJson(
    `/openapi/v1/template/${encodeURIComponent(String(input.template_id))}/requestWaiver`,
    context,
    "execute",
    query,
  );
  const data = extractObjectData(payload);
  return {
    tracking_id: optionalString(data.tracking_id) ?? null,
    request_waiver_url: optionalString(data.request_waiver_url) ?? null,
    ttl: optionalNumber(data.ttl) ?? null,
    pending_enabled: optionalBoolean(data.pending_enabled) ?? null,
    pending_available: optionalBoolean(data.pending_available) ?? null,
    raw: asRawObject(payload),
  };
}

async function executeGetWaiver(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await waiverforeverGetJson(
    `/openapi/v1/waiver/${encodeURIComponent(String(input.waiver_id))}`,
    context,
  );
  return { waiver: extractObjectData(payload), raw: asRawObject(payload) };
}

async function executeSearchWaivers(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await waiverforeverPostJson(
    "/openapi/v1/waiver/search",
    compactObject({
      search_term: input.search_term,
      start_timestamp: input.start_timestamp,
      end_timestamp: input.end_timestamp,
      page: input.page,
      per_page: input.per_page,
      template_ids: input.template_ids,
      note: input.note,
      tags: input.tags,
      device_ids: input.device_ids,
      request_id: input.request_id,
      request_ids: input.request_ids,
      status: input.status,
    }),
    context,
  );
  return normalizeListPayload(payload, "waivers");
}

async function executeCreateWaiverRequest(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await waiverforeverPostJson(
    "/openapi/v2/waiverRequest",
    compactObject({
      name: input.name,
      size: input.size,
      template_id: input.template_id,
      note: input.note,
      type: input.type,
      contact_info: input.contact_info,
      group_prefill_data: optionalRecord(input.group_prefill_data),
    }),
    context,
  );
  return normalizeObjectPayload(payload, "waiver_request");
}

async function executeGetWaiverRequest(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const query = new URLSearchParams();
  appendOptionalQuery(query, "include_waivers", input.include_waivers);
  const payload = await waiverforeverGetJson(
    `/openapi/v2/waiverRequest/${encodeURIComponent(String(input.waiver_request_id))}`,
    context,
    "execute",
    query,
  );
  return normalizeObjectPayload(payload, "waiver_request");
}

async function executeListWaiverRequests(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const query = new URLSearchParams();
  appendOptionalQuery(query, "template_id", input.template_id);
  appendOptionalQuery(query, "name", input.name);
  appendOptionalQuery(query, "status", input.status);
  appendOptionalQuery(query, "start_timestamp", input.start_timestamp);
  appendOptionalQuery(query, "end_timestamp", input.end_timestamp);
  appendOptionalQuery(query, "page", input.page);
  appendOptionalQuery(query, "per_page", input.per_page);
  appendOptionalQuery(query, "include_waivers", input.include_waivers);
  appendArrayQuery(query, "request_ids[]", input.request_ids);
  const payload = await waiverforeverGetJson("/openapi/v2/waiverRequests", context, "execute", query);
  return normalizeListPayload(payload, "waiver_requests");
}

async function waiverforeverGetJson(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: WaiverForeverRequestPhase = "execute",
  query?: URLSearchParams,
): Promise<unknown> {
  const url = new URL(path, waiverforeverApiBaseUrl);
  for (const [key, value] of query ?? []) url.searchParams.append(key, value);
  return waiverforeverFetchJson(
    url,
    {
      method: "GET",
      headers: waiverforeverHeaders(context.apiKey, { accept: "application/json" }),
      signal: context.signal,
    },
    context.fetcher,
    phase,
  );
}

async function waiverforeverPostJson(
  path: string,
  body: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  return waiverforeverFetchJson(
    new URL(path, waiverforeverApiBaseUrl),
    {
      method: "POST",
      headers: waiverforeverHeaders(context.apiKey, {
        accept: "application/json",
        "content-type": "application/json",
      }),
      body: JSON.stringify(body),
      signal: context.signal,
    },
    context.fetcher,
    "execute",
  );
}

async function waiverforeverFetchJson(
  url: URL,
  init: RequestInit,
  fetcher: ProviderFetch,
  phase: WaiverForeverRequestPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await fetcher(url, init);
    payload = await readWaiverForeverPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `waiverforever request failed: ${error.message}` : "waiverforever request failed",
    );
  }
  if (!response.ok) throw createWaiverForeverError(response, payload, phase);
  return payload;
}

function waiverforeverHeaders(apiKey: string, extraHeaders: Record<string, string>): Record<string, string> {
  return { "X-API-Key": apiKey, "user-agent": providerUserAgent, ...extraHeaders };
}

async function readWaiverForeverPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    if (response.ok) throw new Error("waiverforever returned an empty response");
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) throw new Error("waiverforever returned invalid JSON");
    return text;
  }
}

function createWaiverForeverError(
  response: Response,
  payload: unknown,
  phase: WaiverForeverRequestPhase,
): ProviderRequestError {
  const message = extractWaiverForeverErrorMessage(payload) ?? response.statusText ?? "waiverforever request failed";
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractWaiverForeverErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.msg) ??
        optionalString(record.message) ??
        optionalString(record.error) ??
        optionalString(record.detail))
    : undefined;
}

function normalizeUserInfoPayload(payload: unknown): WaiverForeverUserInfo {
  const data = extractObjectData(payload);
  return { username: optionalString(data.username) ?? null, raw: asRawObject(payload) };
}

function normalizeObjectPayload(payload: unknown, outputKey: string): Record<string, unknown> {
  return { [outputKey]: extractObjectData(payload), raw: asRawObject(payload) };
}

function normalizeListPayload(payload: unknown, outputKey: string): Record<string, unknown> {
  const data = extractEnvelopeData(payload);
  const dataObject = optionalRecord(data);
  return {
    [outputKey]: readWaiverForeverListItems(data, outputKey),
    page: dataObject ? (optionalNumber(dataObject.page) ?? null) : null,
    per_page: dataObject ? (optionalNumber(dataObject.per_page) ?? null) : null,
    count: dataObject ? (optionalNumber(dataObject.count) ?? null) : null,
    raw: asRawObject(payload),
  };
}

function normalizeTemplateListPayload(payload: unknown): Record<string, unknown> {
  return {
    templates: readWaiverForeverListItems(extractEnvelopeData(payload), "templates"),
    raw: asRawObject(payload),
  };
}

function readWaiverForeverListItems(data: unknown, outputKey: string): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.map(asRawObject);
  }

  const dataObject = optionalRecord(data);
  if (!dataObject) {
    return [];
  }

  for (const candidate of [dataObject[outputKey], dataObject.data, dataObject.results, dataObject.items]) {
    if (Array.isArray(candidate)) {
      return candidate.map(asRawObject);
    }
  }
  return [];
}

function extractObjectData(payload: unknown): Record<string, unknown> {
  return asRawObject(extractEnvelopeData(payload));
}

function extractEnvelopeData(payload: unknown): unknown {
  const record = optionalRecord(payload);
  return record && "data" in record ? record.data : payload;
}

function asRawObject(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? { value };
}

function appendOptionalQuery(query: URLSearchParams, key: string, value: unknown): void {
  if (value != null) query.append(key, String(value));
}

function appendArrayQuery(query: URLSearchParams, key: string, value: unknown): void {
  if (Array.isArray(value)) for (const item of value) query.append(key, String(item));
}
