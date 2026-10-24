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
import { qiuxiaoceActions } from "./actions.ts";
import { qiuxiaoceRoutes } from "./routes.ts";

const baseUrl = "https://www.qiuxiaoce.com/wp-json/abv2-creator/v1";
const defaultHeaders = { accept: "application/json" };
interface QiuxiaoceRequest {
  route: string;
  input: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}
async function request({ route, input, apiKey, fetcher, parentSignal }: QiuxiaoceRequest) {
  return runProviderRequest({ signal: parentSignal, label: "QiuXiaoCe" }, async (signal) => {
    const pathId = route.includes("{id}");
    const url = new URL(`${baseUrl}${pathId ? route.replace("{id}", encodeURIComponent(String(input.id))) : route}`);
    for (const [key, value] of Object.entries(input)) {
      if (value != null && !(pathId && key === "id")) url.searchParams.set(key, String(value));
    }
    const response = await fetcher(url.toString(), {
      method: "GET",
      headers: { ...defaultHeaders, "X-API-Key": apiKey },
      signal,
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
    const body = optionalRecord(payload);
    if (!response.ok || body?.success === false || (body?.code != null && body?.success !== true)) {
      const code = optionalRawString(body?.code) ?? optionalRawString(body?.error);
      const message = optionalRawString(body?.message) ?? optionalRawString(body?.error);
      const detail = [code, message].filter(Boolean).join(": ") || `HTTP ${response.status}`;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `QiuXiaoCe request failed: ${detail.split(apiKey).join("[REDACTED]")}`,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return requiredResponseRecord(payload, "QiuXiaoCe response");
  });
}
const handlers = mapProviderActionHandlers(
  "qiuxiaoce",
  qiuxiaoceActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const route = qiuxiaoceRoutes[action.name];
    return request({
      route: route,
      input: dataInput,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      parentSignal: context.signal,
    });
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("qiuxiaoce", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request({
      route: "/quota",
      input: {},
      apiKey: requiredInputString(input.apiKey, "API Key"),
      fetcher: fetcher,
      parentSignal: signal,
    });
    return { profile: { displayName: "QiuXiaoCe API Key" }, grantedScopes: [], metadata: { apiBaseUrl: baseUrl } };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "qiuxiaoce",
  baseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
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
