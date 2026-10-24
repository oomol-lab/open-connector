import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString, optionalNumber } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  requiredResponseRecord,
  runProviderRequest,
  providerUserAgent,
  ProviderRequestError,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";
import { surfActions } from "./actions.ts";
import { surfRoutes } from "./actions.ts";
const baseUrl = "https://api.asksurf.ai";
const validationEndpoint = "/gateway/v1/me/credit-balance";
interface SurfRequest {
  url: URL;
  method: string;
  headers: Headers;
  body?: string;
  csv?: boolean;
  validation?: boolean;
  timeoutMs?: number;
}
function requestSurf(
  request: SurfRequest,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "Surf", timeoutMs: request.timeoutMs, signal: parentSignal }, async (signal) => {
    const response = await fetcher(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal,
    });
    const text = await response.text();
    if (response.ok && request.csv) return { csv: text };
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        response.ok ? "Surf returned invalid JSON" : `Surf request failed (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    if (!response.ok) {
      const error = optionalRecord(optionalRecord(payload)?.error);
      const code = optionalString(error?.code);
      const message = optionalString(error?.message) ?? `Surf request failed (HTTP ${response.status})`;
      throw new ProviderRequestError(
        request.validation && code === "UNAUTHORIZED" ? 400 : response.status,
        code ? `${code}: ${message}` : message,
        undefined,
        code === "UNAUTHORIZED"
          ? request.validation
            ? "invalid_input"
            : "authorization_failed"
          : code === "RATE_LIMITED"
            ? "rate_limited"
            : "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Surf response");
  });
}
function requestHeaders(apiKey: string) {
  return new Headers({
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  const route = surfRoutes[actionName];
  if (!route) throw providerInputError("Unknown action route");
  let pathname = route.path;
  const headers = requestHeaders(apiKey);
  const query = new URLSearchParams();
  const body = { ...values };
  for (const parameter of route.parameters) {
    const field = parameter.in === "header" ? parameter.name.toLowerCase().replaceAll("-", "_") : parameter.name;
    const value = values[field];
    delete body[field];
    if (value === undefined || value === null) continue;
    if (parameter.in === "path") {
      const segment = String(value);
      if (segment === "." || segment === "..") {
        throw providerInputError(`${field} must not be a dot path segment`);
      }
      pathname = pathname.replace(`{${parameter.name}}`, encodeURIComponent(segment));
    } else if (parameter.in === "header") {
      headers.set(parameter.name, String(value));
    } else {
      query.set(parameter.name, Array.isArray(value) ? value.join(",") : String(value));
    }
  }
  if (actionName === "research") body.stream = false;
  if (route.body) headers.set("content-type", "application/json");
  const csv = actionName === "onchain_sql_job_results" && values.format === "csv";
  if (csv) headers.set("accept", "text/csv");
  const url = new URL(pathname, baseUrl);
  url.search = query.toString();
  const result = await requestSurf(
    {
      url,
      method: route.method.toUpperCase(),
      headers,
      body: route.body ? JSON.stringify(body) : undefined,
      csv,
      timeoutMs:
        actionName === "web_fetch"
          ? (optionalNumber(values.timeout) ?? 30000) + 5000
          : actionName === "research"
            ? 300000
            : actionName === "onchain_sql"
              ? 45000
              : undefined,
    },
    fetcher,
    context.signal,
  );
  if (["onchain_sql", "onchain_sql_job_create", "onchain_sql_job_get", "onchain_sql_job_cancel"].includes(actionName)) {
    const data = optionalRecord(result.data);
    const jobId = optionalString(data?.job_id);
    const status = optionalString(data?.status);
    if (jobId && status) return { ...result, job_id: jobId, status };
    if (actionName !== "onchain_sql") {
      throw providerResponseError("Surf SQL job response is missing job_id or status");
    }
  }
  return result;
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestSurf(
      {
        url: new URL(validationEndpoint, baseUrl),
        method: "GET",
        headers: requestHeaders(input.apiKey),
        validation: true,
      },
      fetcher,
      signal,
    );
    return { profile: { displayName: "Surf API Key" }, grantedScopes: [], metadata: { validationEndpoint } };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "surf",
  Object.fromEntries(
    surfActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "surf",
  baseUrl: baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
