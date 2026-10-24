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
  isAbortLikeError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { qqmusicActions } from "./actions.ts";

const baseUrl = "https://a.y.qq.com";
const skillVersion = "0.0.3";
const defaultHeaders = { "content-type": "application/json" };
const routes: Record<string, string> = {
  search: "/discover/search",
  get_daily_mix: "/discover/daily-mix",
  get_radio: "/discover/radio",
  list_ai_playlists: "/discover/ai-playlists",
  list_charts: "/charts",
  get_chart: "/charts/detail",
  get_playlist: "/playlists/detail",
  get_listening_report: "/me/report",
};
interface QqmusicRequest {
  route: string;
  params: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}
async function request({ route, params, apiKey, fetcher, parentSignal }: QqmusicRequest) {
  return runProviderRequest({ signal: parentSignal, label: "QQ Music" }, async (signal) => {
    const response = await fetcher(`${baseUrl}${route}`, {
      method: "POST",
      signal,
      headers: { ...defaultHeaders, authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ params, comm: { skill_version: skillVersion } }),
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      payload = undefined;
    }
    const record = optionalRecord(payload);
    const codes = [record?.ret, record?.sub_ret];
    if (!response.ok || codes.some((code) => code != null && code !== 0 && code !== "0")) {
      const detail = optionalRawString(record?.msg) || `HTTP ${response.status}`;
      const codeDetails = codes
        .filter((code) => code != null)
        .map(String)
        .join("/");
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `QQ Music request failed${codeDetails ? ` (${codeDetails})` : ""}: ${detail}`.split(apiKey).join("[REDACTED]"),
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return requiredResponseRecord(payload, "QQ Music response");
  });
}
const handlers = mapProviderActionHandlers(
  "qqmusic",
  qqmusicActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const route = routes[action.name];
    const params = dataInput;
    if (action.name === "search") params.type ??= "0";
    if (action.name === "get_listening_report") params.timeKey ??= "m";
    if (action.name === "list_ai_playlists") params.reqType = "all";
    return request({
      route: route,
      params: params,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      parentSignal: context.signal,
    });
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("qqmusic", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request({
      route: "/skill/version",
      params: {},
      apiKey: requiredInputString(input.apiKey, "API Key"),
      fetcher: fetcher,
      parentSignal: signal,
    });
    return { profile: { displayName: "QQ Music API Key" }, grantedScopes: [], metadata: { apiBaseUrl: baseUrl } };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "qqmusic",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    for (const [name, value] of Object.entries({ "content-type": "application/json" }))
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
