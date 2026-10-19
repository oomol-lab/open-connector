import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { readProviderTextBody } from "../provider-runtime.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  mapProviderActionHandlers,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { bingWebmasterActions } from "./actions.ts";
const service = "bing_webmaster",
  baseUrl = "https://ssl.bing.com/webmaster/api.svc/json";
const endpointOverrides: Record<string, string> = {
  list_sites: "GetUserSites",
  list_sitemaps: "GetFeeds",
  submit_sitemap: "SubmitFeed",
  remove_sitemap: "RemoveFeed",
  list_child_url_info: "GetChildrenUrlInfo",
  list_child_url_traffic_info: "GetChildrenUrlTrafficInfo",
  list_connected_pages: "GetConnectedPages",
  list_fetched_urls: "GetFetchedUrls",
  list_link_counts: "GetLinkCounts",
  list_url_links: "GetUrlLinks",
  list_blocked_urls: "GetBlockedUrls",
  list_page_preview_blocks: "GetActivePagePreviewBlocks",
  list_deep_link_blocks: "GetDeepLinkBlocks",
  list_query_parameters: "GetQueryParameters",
  list_country_region_settings: "GetCountryRegionSettings",
  list_site_moves: "GetSiteMoves",
  list_site_roles: "GetSiteRoles",
  get_sitemap_details: "GetFeedDetails",
  set_query_parameter_enabled: "EnableDisableQueryParameter",
};
const jsonQueryFields = new Set(["page", "query", "url", "link", "feedUrl"]);
const handlers = mapProviderActionHandlers(
  service,
  bingWebmasterActions,
  (action) => async (input: Record<string, unknown>, context: ApiKeyProviderContext) => {
    const endpoint =
      endpointOverrides[action.name] ??
      action.name
        .split("_")
        .map((part) => part[0]!.toUpperCase() + part.slice(1))
        .join("");
    const method = action.operationType === "read" && action.name !== "list_child_url_info" ? "GET" : "POST";
    const data = await request(endpoint, method, input, context);
    const properties = optionalRecord(action.outputSchema.properties) ?? {};
    const output = Object.keys(properties)[0] ?? "result";
    const schema = optionalRecord(properties[output]);
    if (method === "POST" && (data === null || data === undefined)) return { [output]: true };
    if (schema?.type === "array" && !Array.isArray(data))
      throw providerResponseError(`Bing Webmaster ${output} must be a list`);
    if (schema?.type === "object" && (!data || typeof data !== "object" || Array.isArray(data)))
      throw providerResponseError(`Bing Webmaster ${output} must be an object`);
    return { [output]: data };
  },
);
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_query", name: "apikey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await handlers.list_sites({}, { apiKey: input.apiKey, fetcher, signal });
    return {
      profile: { displayName: "Bing Webmaster API Key" },
      grantedScopes: [],
      metadata: { validationEndpoint: "GetUserSites" },
    };
  },
};
async function request(
  endpoint: string,
  method: "GET" | "POST",
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const url = new URL(`${baseUrl}/${endpoint}`);
  url.searchParams.set("apikey", context.apiKey);
  if (method === "GET")
    for (const [key, value] of Object.entries(input))
      url.searchParams.set(key, jsonQueryFields.has(key) ? JSON.stringify(value) : String(value));
  const response = await context.fetcher(url, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json; charset=utf-8",
      "user-agent": providerUserAgent,
    },
    body: method === "POST" ? JSON.stringify(input) : undefined,
    signal: context.signal,
  });
  const text = await readProviderTextBody(response, "Bing Webmaster response");
  let payload: unknown;
  try {
    payload = text.trim() ? JSON.parse(text) : undefined;
  } catch {
    throw new ProviderRequestError(
      response.ok ? 502 : response.status,
      `Bing Webmaster returned invalid JSON (HTTP ${response.status})`,
    );
  }
  const envelope = optionalRecord(payload);
  if (!response.ok || envelope?.ErrorCode !== undefined) {
    const code = envelope?.ErrorCode;
    throw new ProviderRequestError(
      response.status || 502,
      `Bing Webmaster${code === undefined ? "" : ` (${String(code)})`}: ${optionalString(envelope?.Message) ?? `request failed (HTTP ${response.status})`}`,
      payload,
    );
  }
  if (payload === undefined) return null;
  if (!envelope || !("d" in envelope)) throw providerResponseError("Bing Webmaster response is missing d");
  return envelope.d;
}
