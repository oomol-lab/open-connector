import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { looseArray, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "aitable_ai";
const baseUrl = "https://aitable.ai/fusion/v1";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"aitable_ai", Handler> = {
  list_spaces: (_input, context) => requestList("/spaces", "spaces", context),
  list_nodes: (input, context) =>
    requestList(`/spaces/${encodeURIComponent(requiredInputString(input.spaceId, "spaceId"))}/nodes`, "nodes", context),
  list_fields: (input, context) =>
    requestList(
      `/datasheets/${encodeURIComponent(requiredInputString(input.datasheetId, "datasheetId"))}/fields`,
      "fields",
      context,
    ),
  list_views: (input, context) =>
    requestList(
      `/datasheets/${encodeURIComponent(requiredInputString(input.datasheetId, "datasheetId"))}/views`,
      "views",
      context,
    ),
  list_records: (input, context) => listRecords(input, context),
  create_records: (input, context) => writeRecords("POST", input, context),
  update_records: (input, context) => writeRecords("PATCH", input, context),
  delete_records: (input, context) => deleteRecords(input, context),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request({ path: "/spaces", phase: "validate", apiKey: input.apiKey, fetcher, signal });
    return {
      profile: { displayName: "AITable API Token" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/spaces" },
    };
  },
};

interface RequestInput {
  path: string;
  phase: "validate" | "execute";
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

async function requestList(
  path: string,
  key: "spaces" | "nodes" | "fields" | "views",
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const payload = await request({ path, phase: "execute", ...context });
  const value = requiredResponseRecord(
    requiredResponseRecord(payload, "AITable response").data,
    "AITable response data",
  )[key];
  if (!Array.isArray(value)) throw providerResponseError(`AITable ${key} response is incomplete`);
  return { [key]: value };
}

async function listRecords(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const id = encodeURIComponent(requiredInputString(input.datasheetId, "datasheetId"));
  const payload = await request({
    path: `/datasheets/${id}/records`,
    phase: "execute",
    ...context,
    query: {
      pageSize: optionalInteger(input.pageSize),
      pageNum: optionalInteger(input.pageNum),
      maxRecords: optionalInteger(input.maxRecords),
      viewId: optionalString(input.viewId),
      filterByFormula: optionalString(input.filterByFormula),
      fieldKey: optionalString(input.fieldKey),
      cellFormat: optionalString(input.cellFormat),
    },
  });
  const data = requiredResponseRecord(
    requiredResponseRecord(payload, "AITable response").data,
    "AITable response data",
  );
  const pageNum = optionalInteger(data.pageNum);
  const pageSize = optionalInteger(data.pageSize);
  const total = optionalInteger(data.total);
  if (pageNum == null || pageSize == null || total == null || !Array.isArray(data.records))
    throw providerResponseError("AITable records response is incomplete");
  return { pageNum, pageSize, total, records: data.records };
}

async function writeRecords(
  method: "POST" | "PATCH",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const id = encodeURIComponent(requiredInputString(input.datasheetId, "datasheetId"));
  const payload = await request({
    path: `/datasheets/${id}/records`,
    phase: "execute",
    ...context,
    method,
    body: { records: input.records, fieldKey: input.fieldKey },
  });
  const data = requiredResponseRecord(
    requiredResponseRecord(payload, "AITable response").data,
    "AITable response data",
  );
  if (!Array.isArray(data.records)) throw providerResponseError("AITable record write response is incomplete");
  return { records: data.records };
}

async function deleteRecords(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const id = encodeURIComponent(requiredInputString(input.datasheetId, "datasheetId"));
  const payload = await request({
    path: `/datasheets/${id}/records`,
    phase: "execute",
    ...context,
    method: "DELETE",
    query: { recordIds: looseArray(input.recordIds).join(",") },
  });
  return { deleted: requiredResponseRecord(payload, "AITable response").data === true };
}

async function request(input: RequestInput): Promise<unknown> {
  return runProviderRequest({ label: "AITable", signal: input.signal }, async (requestSignal) => {
    const url = new URL(`${baseUrl}${input.path}`);
    for (const [key, value] of Object.entries(input.query ?? {}))
      if (value !== undefined) url.searchParams.set(key, String(value));
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: requestSignal,
    });
    const payload = await readPayload(response);
    const envelope = optionalRecord(payload);
    if (!response.ok || envelope?.success === false)
      throw createError(response.status, response.ok, payload, input.phase);
    return payload;
  });
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw providerResponseError("AITable returned invalid JSON");
  }
}
function createError(
  status: number,
  responseOk: boolean,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const envelope = optionalRecord(payload);
  const code = optionalInteger(envelope?.code);
  const message = optionalString(envelope?.message) ?? `AITable request failed with status ${status}`;
  if (status == 429 || code == 429) return new ProviderRequestError(429, message);
  if (phase == "validate" && status == 401 && code == 401) return providerInputError(message);
  return new ProviderRequestError(responseOk ? 502 : status || 502, message);
}
