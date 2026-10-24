import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  providerInputError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
  providerUserAgent,
  runProviderRequest,
  ProviderRequestError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { cronlyticActions } from "./actions.ts";
const apiBaseUrl = "https://api.cronlytic.com/prog";
interface CronlyticRequest extends CredentialContext {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  validating?: boolean;
}
async function requestCronlytic({
  apiKey,
  userId,
  path,
  method,
  body,
  fetcher,
  validating = false,
  signal: parentSignal,
}: CronlyticRequest) {
  return runProviderRequest({ label: "Cronlytic", signal: parentSignal }, async (signal) => {
    const response = await fetcher(`${apiBaseUrl}${path}`, {
      method,
      signal,
      headers: {
        "X-API-Key": apiKey,
        "X-User-ID": userId,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let payload: unknown = undefined;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Cronlytic returned non-JSON content (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    if (!response.ok) {
      const detail = optionalRecord(payload)?.detail;
      const message =
        optionalRawString(detail) ??
        optionalRawString(optionalRecord(detail)?.error) ??
        (Array.isArray(detail)
          ? detail
              .map((entry) => optionalRawString(optionalRecord(entry)?.msg))
              .filter(Boolean)
              .join("; ")
          : undefined);
      if (response.status === 401 && detail === "Invalid API key") {
        throw new ProviderRequestError(
          401,
          "Cronlytic rejected the API key or User ID",
          undefined,
          validating ? "invalid_input" : "authorization_failed",
        );
      }
      throw new ProviderRequestError(
        response.status,
        message ? `Cronlytic: ${message}` : `Cronlytic request failed (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    return payload;
  });
}
const handlers = mapProviderActionHandlers(
  "cronlytic",
  cronlyticActions,
  (action) => async (values: Record<string, unknown>, context: CredentialContext) => {
    let path = "/jobs";
    let method = "GET";
    let body: Record<string, unknown> | undefined = undefined;
    if (action.name !== "create_job" && action.name !== "list_jobs") {
      const id = requiredInputString(values.job_id, "job_id");
      if (id === "." || id === "..") throw providerInputError("Invalid job_id");
      path += `/${encodeURIComponent(id)}`;
    }
    switch (action.name) {
      case "create_job":
      case "update_job":
        method = action.name === "create_job" ? "POST" : "PUT";
        body = {
          name: values.name,
          url: values.url,
          method: values.method ?? "GET",
          headers: values.headers ?? {},
          body: values.body ?? "",
          cron_expression: values.cron_expression,
        };
        break;
      case "delete_job":
        method = "DELETE";
        break;
      case "pause_job":
        method = "POST";
        path += "/pause";
        break;
      case "resume_job":
        method = "POST";
        path += "/resume";
        break;
      case "get_job_logs":
        path += "/logs";
        break;
    }
    const payload = await requestCronlytic({ ...context, path, method, body });
    if (action.name === "list_jobs") {
      if (!Array.isArray(payload)) throw providerResponseError("Cronlytic returned an invalid job list");
      return { jobs: payload };
    }
    return requiredResponseRecord(payload, "Cronlytic");
  },
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestCronlytic({
      apiKey: requiredInputString(input.apiKey, "API Key"),
      userId: requiredInputString(input.values.userId, "userId"),
      path: "/jobs",
      method: "GET",
      fetcher,
      validating: true,
      signal,
    });
    return {
      profile: { displayName: "Cronlytic API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl },
    };
  },
};
interface CredentialContext extends ApiKeyProviderContext {
  userId: string;
}
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "cronlytic",
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher): Promise<CredentialContext> {
    const credential = await requireApiKeyCredential(context, "cronlytic");
    return {
      apiKey: credential.apiKey,
      userId: requiredInputString(credential.values.userId, "userId"),
      fetcher,
      signal: context.signal,
    };
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "cronlytic",
  baseUrl: apiBaseUrl,
  auth: {
    type: "credential_headers",
    headers: [
      { name: "X-API-Key", source: { type: "api_key" } },
      { name: "X-User-ID", source: { type: "credential_value", name: "userId" } },
    ],
  },
  skipDnsValidation: true,
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, `Provider request failed with HTTP ${response.status}`),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    }))
      if (!headers.has(name)) headers.set(name, value);
  },
});
