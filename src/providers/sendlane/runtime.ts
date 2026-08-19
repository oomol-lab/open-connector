import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { SendlaneActionName } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const sendlaneApiBaseUrl = "https://api.sendlane.com/v2";

type SendlaneRequestPhase = "validate" | "execute";
interface SendlaneRequestSpec {
  path: string;
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  pathField?: string;
  queryFields?: string[];
  bodyFields?: string[];
}

const requests: Record<SendlaneActionName, SendlaneRequestSpec> = {
  list_lists: { path: "/lists", queryFields: ["limit", "page"] },
  get_list: { path: "/lists", pathField: "listId" },
  create_list: { path: "/lists", method: "POST", bodyFields: ["name", "description"] },
  update_list: { path: "/lists", method: "PUT", pathField: "listId", bodyFields: ["name", "description"] },
  delete_list: { path: "/lists", method: "DELETE", pathField: "listId" },
  list_tags: { path: "/tags" },
  get_tag: { path: "/tags", pathField: "tagId" },
  create_tag: { path: "/tags", method: "POST", bodyFields: ["name"] },
  update_tag: { path: "/tags", method: "PATCH", pathField: "tagId", bodyFields: ["name"] },
  delete_tag: { path: "/tags", method: "DELETE", pathField: "tagId" },
  list_campaigns: { path: "/campaigns" },
  get_campaign: { path: "/campaigns", pathField: "campaignId" },
  list_custom_fields: { path: "/custom-fields", queryFields: ["limit", "page"] },
  get_custom_field: { path: "/custom-fields", pathField: "customFieldId" },
  create_custom_field: { path: "/custom-fields", method: "POST", bodyFields: ["name", "type"] },
  update_custom_field: {
    path: "/custom-fields",
    method: "PATCH",
    pathField: "customFieldId",
    bodyFields: ["name", "type"],
  },
};

async function execute(
  name: SendlaneActionName,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return sendlaneRequest(buildRequest(requests[name], input), context.apiKey, context.fetcher, "execute");
}

const handler =
  (name: SendlaneActionName): ProviderRuntimeHandler<ApiKeyProviderContext> =>
  (input, context) =>
    execute(name, input, context);

export const sendlaneActionHandlers: ProviderActionHandlers<
  "sendlane",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  list_lists: handler("list_lists"),
  get_list: handler("get_list"),
  create_list: handler("create_list"),
  update_list: handler("update_list"),
  delete_list: handler("delete_list"),
  list_tags: handler("list_tags"),
  get_tag: handler("get_tag"),
  create_tag: handler("create_tag"),
  update_tag: handler("update_tag"),
  delete_tag: handler("delete_tag"),
  list_campaigns: handler("list_campaigns"),
  get_campaign: handler("get_campaign"),
  list_custom_fields: handler("list_custom_fields"),
  get_custom_field: handler("get_custom_field"),
  create_custom_field: handler("create_custom_field"),
  update_custom_field: handler("update_custom_field"),
};

export async function validateSendlaneCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<{ profile: { displayName: string }; grantedScopes: string[] }> {
  await sendlaneRequest({ path: "/lists", query: { limit: "1", page: "1" } }, apiKey, fetcher, "validate");
  return { profile: { displayName: "Sendlane API Token" }, grantedScopes: [] };
}

function buildRequest(
  spec: SendlaneRequestSpec,
  input: Record<string, unknown>,
): { path: string; method?: string; query?: Record<string, string>; body?: Record<string, unknown> } {
  const path = spec.pathField ? `${spec.path}/${encodeURIComponent(String(input[spec.pathField]))}` : spec.path;
  const query = Object.fromEntries(
    (spec.queryFields ?? [])
      .filter((field) => input[field] !== undefined)
      .map((field) => [field, String(input[field])]),
  );
  const body = Object.fromEntries(
    (spec.bodyFields ?? []).filter((field) => input[field] !== undefined).map((field) => [field, input[field]]),
  );
  return {
    path,
    method: spec.method,
    ...(Object.keys(query).length ? { query } : {}),
    ...(Object.keys(body).length ? { body } : {}),
  };
}

async function sendlaneRequest(
  request: { path: string; method?: string; query?: Record<string, string>; body?: Record<string, unknown> },
  apiKey: string,
  fetcher: typeof fetch,
  phase: SendlaneRequestPhase,
): Promise<unknown> {
  const url = new URL(`${sendlaneApiBaseUrl}${request.path}`);
  for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value);
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  const init: RequestInit = { method: request.method ?? "GET", headers };
  if (request.body) {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(request.body);
  }
  const response = await fetcher(url, init);
  const text = await response.text();
  const payload = parseJson(text, response.status, response.ok);
  if (!response.ok) throw mapError(response, payload, phase);
  return payload;
}

function parseJson(text: string, status: number, requireJson: boolean): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!requireJson) return {};
    throw new ProviderRequestError(502, `Sendlane returned invalid JSON with status ${status}`);
  }
}

function mapError(response: Response, payload: unknown, phase: SendlaneRequestPhase): ProviderRequestError {
  const object = optionalRecord(payload) ?? {};
  const data = optionalRecord(object.data);
  const message =
    optionalString(object.message) ??
    optionalString(object.error) ??
    optionalString(data?.message) ??
    `Sendlane request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403)
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (response.status >= 400 && response.status < 500) return new ProviderRequestError(response.status, message);
  return new ProviderRequestError(response.status || 502, message);
}
