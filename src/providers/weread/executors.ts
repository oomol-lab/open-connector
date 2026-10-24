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
import { wereadActions } from "./actions.ts";

const baseUrl = "https://i.weread.qq.com";
const skillVersion = "1.0.5";
const defaultHeaders = { accept: "application/json", "content-type": "application/json" };
const routes: Record<string, string> = {
  search: "/store/search",
  get_book: "/book/info",
  list_chapters: "/book/chapterinfo",
  get_reading_progress: "/book/getprogress",
  get_shelf: "/shelf/sync",
  list_notebooks: "/user/notebooks",
  list_highlights: "/book/bookmarklist",
  list_my_reviews: "/review/list/mine",
  get_underline_stats: "/book/underlines",
  list_popular_highlights: "/book/bestbookmarks",
  list_highlight_reviews: "/book/readreviews",
  get_review: "/review/single",
  get_reading_stats: "/readdata/detail",
  list_book_reviews: "/review/list",
  list_recommendations: "/book/recommend",
  list_similar_books: "/book/similar",
};
interface WereadRequest {
  apiName: string;
  fields: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  parentSignal?: AbortSignal;
}
async function request({ apiName, fields, apiKey, fetcher, parentSignal }: WereadRequest) {
  return runProviderRequest({ signal: parentSignal, label: "WeRead" }, async (signal) => {
    const response = await fetcher(`${baseUrl}/api/agent/gateway`, {
      method: "POST",
      signal,
      headers: { ...defaultHeaders, authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ ...fields, api_name: apiName, skill_version: skillVersion }),
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
    const record = optionalRecord(payload);
    const code = record?.errcode;
    if (!response.ok || (code !== undefined && code !== 0 && code !== "0")) {
      const detail =
        optionalRawString(record?.errmsg) || optionalRawString(record?.message) || optionalRawString(record?.error);
      const message = `WeRead request failed${code === undefined ? "" : ` (errcode ${String(code)})`}: ${detail || (record ? `HTTP ${response.status}` : text) || `HTTP ${response.status}`}`;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        message.split(apiKey).join("[REDACTED]"),
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    const result = requiredResponseRecord(payload, "WeRead response");
    if (result.upgrade_info != null) {
      const message = optionalRawString(optionalRecord(result.upgrade_info)?.message);
      throw new ProviderRequestError(
        502,
        `WeRead integration version ${skillVersion} requires an update${message ? `: ${message.split(apiKey).join("[REDACTED]")}` : ""}`,
        undefined,
        "provider_error",
      );
    }
    return result;
  });
}
const handlers = mapProviderActionHandlers(
  "weread",
  wereadActions,
  (action) => async (dataInput: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const route = routes[action.name];
    const fields = dataInput;
    const body =
      action.name === "list_similar_books"
        ? { ...fields, count: fields.count ?? 12, maxIdx: fields.maxIdx ?? 0 }
        : fields;
    return request({
      apiName: route,
      fields: body,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      parentSignal: context.signal,
    });
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors("weread", handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request({
      apiName: "/_list",
      fields: {},
      apiKey: requiredInputString(input.apiKey, "API Key"),
      fetcher: fetcher,
      parentSignal: signal,
    });
    return { profile: { displayName: "WeRead API Key" }, grantedScopes: [], metadata: { apiBaseUrl: baseUrl } };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "weread",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
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
