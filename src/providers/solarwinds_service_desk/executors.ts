import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineProviderExecutors, requireApiKeyCredential, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  providerUserAgent,
  readProviderTextBody,
} from "../provider-runtime.ts";
import { solarwindsServiceDeskActions } from "./actions.ts";
const origins: Record<string, string> = {
  us: "https://api.samanage.com",
  eu: "https://apieu.samanage.com",
  au: "https://apiau.samanage.com",
};
const defaultHeaders = {
  accept: "application/vnd.samanage.v2.1+json",
  "content-type": "application/json",
  "user-agent": providerUserAgent,
};
function resolveRegion(value: unknown) {
  const region = optionalRawString(value)?.trim() || "us";
  if (!Object.hasOwn(origins, region)) throw providerInputError("region must be us, eu, or au");
  return region;
}
function paginationHeader(headers: Headers, name: string) {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}
async function request(
  baseUrl: string,
  route: string,
  apiKey: string,
  fetcher: typeof fetch,
  method = "GET",
  body?: unknown,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ label: "SolarWinds Service Desk", signal: parentSignal }, async (signal) => {
    const response = await fetcher(`${baseUrl}${route}`, {
      method,
      headers: { ...defaultHeaders, "X-Samanage-Authorization": `Bearer ${apiKey}` },
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await readProviderTextBody(response, "solarwinds_service_desk response", undefined, signal);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) throw providerResponseError("SolarWinds returned invalid JSON");
      payload = text;
    }
    if (!response.ok) {
      const error = optionalRecord(payload);
      const message =
        optionalRawString(error?.message) ??
        optionalRawString(error?.error) ??
        optionalRawString(payload) ??
        `SolarWinds request failed with HTTP ${response.status}`;
      throw new ProviderRequestError(
        response.status,
        message.replaceAll(apiKey, "[REDACTED]"),
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return { payload, headers: response.headers };
  });
}
interface Context extends ApiKeyProviderContext {
  region?: string;
}
const handlers = mapProviderActionHandlers(
  "solarwinds_service_desk",
  solarwindsServiceDeskActions,
  (action) => async (values: Record<string, unknown>, context: Context) => {
    const { apiKey, fetcher } = context;
    const baseUrl = origins[resolveRegion(context.region)]!;
    let route = "/incidents.json";
    let method = "GET";
    let body: unknown;
    const query = new URLSearchParams();
    switch (action.name) {
      case "list_incidents":
        for (const [key, value] of Object.entries(values)) if (value !== undefined) query.set(key, String(value));
        break;
      case "get_incident":
        route = `/incidents/${values.id}.json`;
        if (values.layout !== undefined) query.set("layout", String(values.layout));
        break;
      case "create_incident":
        method = "POST";
        body = { incident: values.incident };
        break;
      case "update_incident":
        route = `/incidents/${values.id}.json`;
        method = "PUT";
        body = { incident: values.incident };
        break;
      case "delete_incident":
        route = `/incidents/${values.id}.json`;
        method = "DELETE";
        break;
      case "create_incident_comment":
        route = `/incidents/${values.id}/comments.json`;
        method = "POST";
        body = { comment: { body: values.body, is_private: values.is_private, user_id: values.user_id } };
        if (values.add_callbacks !== undefined) query.set("add_callbacks", String(values.add_callbacks));
        break;
    }
    const { payload, headers } = await request(
      baseUrl,
      `${route}?${query}`,
      apiKey,
      fetcher,
      method,
      body,
      context.signal,
    );
    if (action.name === "list_incidents") {
      if (!Array.isArray(payload)) throw providerResponseError("SolarWinds returned an invalid incident list");
      return {
        incidents: payload,
        page: values.page ?? 1,
        per_page: paginationHeader(headers, "x-per-page"),
        total_count: paginationHeader(headers, "x-total-count"),
        total_pages: paginationHeader(headers, "x-total-pages"),
        link: headers.get("link"),
      };
    }
    const result = requiredResponseRecord(payload, "SolarWinds response");
    if (action.name === "delete_incident") {
      if (!Array.isArray(result.deleted_ids)) throw providerResponseError("SolarWinds response is missing deleted_ids");
      return result;
    }
    if (action.name === "create_incident_comment") {
      requiredResponseRecord(result.comment, "SolarWinds comment");
      return result;
    }
    return { incident: result };
  },
);
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "solarwinds_service_desk",
  handlers,
  async createContext(context, fetcher): Promise<Context> {
    const credential = await requireApiKeyCredential(context, "solarwinds_service_desk");
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      region: credential.values?.region,
    };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiKey = requiredInputString(input.apiKey, "API Key");
    const region = resolveRegion(input.values.region);
    const { payload } = await request(origins[region]!, "/api.json", apiKey, fetcher, undefined, undefined, signal);
    if (!Array.isArray(payload)) throw providerResponseError("SolarWinds returned an invalid API directory");
    return {
      profile: { displayName: "SolarWinds Service Desk API Token" },
      grantedScopes: [],
      metadata: { region, validationEndpoint: "/api.json" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "solarwinds_service_desk",
  baseUrl: async (context) =>
    origins[resolveRegion((await requireApiKeyCredential(context, "solarwinds_service_desk")).values?.region)]!,
  auth: {
    type: "credential_headers",
    headers: [{ name: "X-Samanage-Authorization", source: { type: "api_key" }, prefix: "Bearer " }],
  },
  allowedOrigins: Object.values(origins),
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries(defaultHeaders)) if (!headers.has(name)) headers.set(name, value);
  },
});
