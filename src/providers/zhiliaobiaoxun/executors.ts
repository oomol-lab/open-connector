import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString, optionalNumber } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy, readProviderProxyErrorMessage } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  ProviderRequestError,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { zhiliaobiaoxunActions } from "./actions.ts";

const baseUrl = "https://mcp-server.zhiliaobiaoxun.com/api_v2";
const defaultHeaders = { accept: "application/json", "content-type": "application/json" };
interface ZhiliaobiaoxunRequest {
  actionName: string;
  body: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}
async function request({ actionName, body, apiKey, fetcher, parentSignal }: ZhiliaobiaoxunRequest) {
  return runProviderRequest({ signal: parentSignal, label: "Zhiliao Biaoxun" }, async (signal) => {
    const isBalance = actionName === "get_account_balance";
    const response = await fetcher(`${baseUrl}/${isBalance ? "account/balance" : actionName}`, {
      method: isBalance ? "GET" : "POST",
      headers: { ...defaultHeaders, "X-API-Key": apiKey },
      signal,
      body: isBalance ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
    const envelope = optionalRecord(payload);
    if (!response.ok || envelope?.success !== true) {
      const error = optionalRecord(envelope?.error);
      const code = optionalRawString(error?.code);
      const message = optionalRawString(error?.message) || `HTTP ${response.status}; invalid or unsuccessful response`;
      const detail = [code, message].filter(Boolean).join(": ").split(apiKey).join("[REDACTED]");
      const limited = response.status === 429 || code === "RATE_LIMITED";
      throw new ProviderRequestError(
        response.ok ? (limited ? 429 : 502) : response.status,
        `Zhiliao Biaoxun request failed: ${detail}`,
        undefined,
        limited ? "rate_limited" : "provider_error",
      );
    }
    return envelope;
  });
}
const handlers = mapProviderActionHandlers(
  "zhiliaobiaoxun",
  zhiliaobiaoxunActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    return request({
      actionName: action.name,
      body: dataInput,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      parentSignal: context.signal,
    });
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("zhiliaobiaoxun", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const response = await request({
      actionName: "get_account_balance",
      body: {},
      apiKey: requiredInputString(input.apiKey, "API Key"),
      fetcher: fetcher,
      parentSignal: signal,
    });
    const data = requiredResponseRecord(response.data, "Zhiliao Biaoxun account data");
    const userId = optionalNumber(data.user_id);
    return {
      profile: { displayName: userId == null ? "Zhiliao Biaoxun API Key" : `Zhiliao Biaoxun ${userId}` },
      grantedScopes: [],
      metadata: {},
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "zhiliaobiaoxun",
  baseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({ accept: "application/json", "content-type": "application/json" }))
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
