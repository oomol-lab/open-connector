import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  ProviderRequestError,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { portedenActions } from "./actions.ts";

const baseUrl = "https://api.porteden.com";
const defaultHeaders = { accept: "application/json" };
interface PortedenRequest {
  route: string;
  method: string;
  data: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}
async function request({ route, method, data, apiKey, fetcher, parentSignal }: PortedenRequest) {
  try {
    return await runProviderRequest({ signal: parentSignal, label: "PortEden" }, async (signal) => {
      const url = new URL(`${baseUrl}${route}`);
      if (method === "GET") {
        for (const [key, value] of Object.entries(data)) {
          if (value != null) url.searchParams.set(key, String(value));
        }
      }
      const hasBody = method === "POST" || method === "PATCH";
      const headers = new Headers(defaultHeaders);
      headers.set("Authorization", `Bearer ${apiKey}`);
      if (hasBody) headers.set("content-type", "application/json");
      const response = await fetcher(url.toString(), {
        method,
        headers,
        body: hasBody ? JSON.stringify(data) : undefined,
        signal,
      });
      if (response.status === 204 && (method === "PATCH" || method === "DELETE")) return { success: true };
      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
      const body = optionalRecord(payload);
      if (!response.ok || body?.success === false) {
        const detail =
          [
            optionalRawString(body?.code),
            optionalRawString(body?.error),
            optionalRawString(body?.message),
            optionalRawString(body?.errorMessage),
          ]
            .filter(Boolean)
            .join(": ") || `HTTP ${response.status}`;
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          `PortEden request failed: ${detail}`,
          undefined,
          body?.error === "API authentication failed"
            ? "authorization_failed"
            : response.status === 429
              ? "rate_limited"
              : "provider_error",
        );
      }
      return requiredResponseRecord(payload, "PortEden response");
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) error.message = error.message.split(apiKey).join("[REDACTED]");
    throw error;
  }
}
const handlers = mapProviderActionHandlers(
  "porteden",
  portedenActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const { emailId, threadId, ...data } = dataInput;
    let route = "/api/access/email/messages";
    let method = "GET";
    switch (action.name) {
      case "get_email":
        route += `/${encodeURIComponent(String(emailId))}`;
        break;
      case "get_thread":
        route = `/api/access/email/threads/${encodeURIComponent(String(threadId))}`;
        break;
      case "send_email":
        route += "/send";
        method = "POST";
        break;
      case "reply_email":
        route += `/${encodeURIComponent(String(emailId))}/reply`;
        method = "POST";
        break;
      case "forward_email":
        route += `/${encodeURIComponent(String(emailId))}/forward`;
        method = "POST";
        break;
      case "modify_email":
        route += `/${encodeURIComponent(String(emailId))}`;
        method = "PATCH";
        break;
      case "delete_email":
        route += `/${encodeURIComponent(String(emailId))}`;
        method = "DELETE";
        break;
    }
    return request({
      route: route,
      method: method,
      data: data,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      parentSignal: context.signal,
    });
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("porteden", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const body = await request({
      route: "/api/auth/token/status",
      method: "GET",
      data: {},
      apiKey: requiredInputString(input.apiKey, "API Key"),
      fetcher: fetcher,
      parentSignal: signal,
    });
    if (body.authenticated !== true)
      throw new ProviderRequestError(400, "PortEden token is not authenticated", undefined, "invalid_input");
    return {
      profile: {
        displayName: optionalRawString(body.operatorName) || optionalRawString(body.userName) || "PortEden API Key",
      },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "porteden",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({ accept: "application/json" }))
      if (!headers.has(name)) headers.set(name, value);
  },
  async readError(response) {
    return new ProviderRequestError(
      response.status,
      await readProviderProxyErrorMessage(response, "Provider request failed"),
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  },
});
