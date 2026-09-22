import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalNumber, optionalRawString, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "pulsetic";
const baseUrl = "https://api.pulsetic.com/api/public";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
const handlers: ProviderActionHandlers<"pulsetic", Handler> = {
  async list_monitors(input, context) {
    return {
      monitors: responseArray(
        await request("/monitors", query({ page: input.page, per_page: input.perPage }), context, "execute"),
        "Pulsetic monitors response",
      ),
    };
  },
  async get_monitor(input, context) {
    return {
      monitor: requiredResponseRecord(
        await request(`/monitors/${monitorId(input.monitorId)}`, undefined, context, "execute"),
        "Pulsetic monitor response",
      ),
    };
  },
  list_monitor_snapshots(input, context) {
    return history("snapshots", input, context);
  },
  list_monitor_checks(input, context) {
    return history("checks", input, context);
  },
  list_monitor_events(input, context) {
    return history("events", input, context);
  },
  async get_monitor_stats(input, context) {
    return {
      stats: requiredResponseRecord(
        await request(`/monitors/${monitorId(input.monitorId)}/stats`, undefined, context, "execute"),
        "Pulsetic monitor stats response",
      ),
    };
  },
  async get_monitor_downtime(input, context) {
    const value = await request(
      `/monitors/${monitorId(input.monitorId)}/downtime`,
      query({ seconds: input.seconds }),
      context,
      "execute",
    );
    const downtimeSeconds = optionalNumber(value);
    if (downtimeSeconds == null) throw providerResponseError("Pulsetic monitor downtime response must be a number");
    return { downtimeSeconds };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    responseArray(
      await request("/monitors", query({ per_page: 1 }), { apiKey: input.apiKey, fetcher, signal }, "validate"),
      "Pulsetic monitors response",
    );
    return {
      profile: { accountId: "pulsetic-api-key", displayName: "Pulsetic API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/monitors?per_page=1" },
    };
  },
};
async function history(
  resource: "snapshots" | "checks" | "events",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) {
  const params = query({
    start_dt: input.startTime,
    end_dt: input.endTime,
    page: resource === "snapshots" ? input.page : undefined,
    per_page: resource === "snapshots" ? input.perPage : undefined,
    monitor_event_type: resource === "events" ? input.eventType : undefined,
  });
  append(params, "nodes[]", input.nodes);
  append(params, "response_codes[]", input.responseCodes);
  return {
    [resource]: responseArray(
      await request(`/monitors/${monitorId(input.monitorId)}/${resource}`, params, context, "execute"),
      `Pulsetic ${resource} response`,
    ),
  };
}

function responseArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw providerResponseError(`${label} must be an array`);
  return value;
}
async function request(
  path: string,
  params: URLSearchParams | undefined,
  context: ApiKeyProviderContext,
  phase: "validate" | "execute",
) {
  return runProviderRequest({ signal: context.signal, label: "Pulsetic" }, async (signal) => {
    const url = new URL(path.replace(/^\//, ""), `${baseUrl}/`);
    url.search = params?.toString() ?? "";
    const response = await context.fetcher(url, {
      headers: { accept: "application/json", authorization: context.apiKey, "user-agent": providerUserAgent },
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Pulsetic returned invalid JSON",
      invalidJsonFallback: response.ok ? undefined : (text) => text.trim(),
    });
    if (!response.ok) throw error(response.status, payload, phase);
    return payload;
  });
}
function error(status: number, payload: unknown, phase: "validate" | "execute") {
  const record = optionalRecord(payload);
  const message =
    optionalRawString(payload) ??
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.detail) ??
    `Pulsetic request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && status >= 400 && status < 500) return providerInputError(message);
  if (phase === "execute" && [400, 404, 422].includes(status)) return providerInputError(message);
  return new ProviderRequestError(status || 502, message, payload);
}
function query(values: Record<string, unknown>) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value != null) result.set(key, String(value));
  return result;
}
function append(query: URLSearchParams, name: string, value: unknown) {
  if (Array.isArray(value)) for (const item of value) query.append(name, String(item));
}
function monitorId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw providerInputError("monitorId must be a positive integer");
  return id;
}
