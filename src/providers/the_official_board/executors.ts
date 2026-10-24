import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { executeTheOfficialBoardAction, validateTheOfficialBoardCredential } from "./runtime.ts";

const handlers = {
  search_companies: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    executeTheOfficialBoardAction("search_companies", input, context.apiKey, context.fetcher),
  get_company_org_chart: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    executeTheOfficialBoardAction("get_company_org_chart", input, context.apiKey, context.fetcher),
  search_executives: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    executeTheOfficialBoardAction("search_executives", input, context.apiKey, context.fetcher),
  find_executive: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    executeTheOfficialBoardAction("find_executive", input, context.apiKey, context.fetcher),
  get_executive_biography: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    executeTheOfficialBoardAction("get_executive_biography", input, context.apiKey, context.fetcher),
  list_direct_colleagues: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    executeTheOfficialBoardAction("list_direct_colleagues", input, context.apiKey, context.fetcher),
  list_recent_org_chart_news: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    executeTheOfficialBoardAction("list_recent_org_chart_news", input, context.apiKey, context.fetcher),
  list_watchlist_changes: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    executeTheOfficialBoardAction("list_watchlist_changes", input, context.apiKey, context.fetcher),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("the_official_board", handlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "the_official_board",
  baseUrl: "https://rest.theofficialboard.com/rest/",
  auth: { type: "api_key_header", name: "token" },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateTheOfficialBoardCredential({ apiKey: input.apiKey }, fetcher);
    return { profile: { displayName: result.accountLabel }, grantedScopes: [], metadata: result.providerMetadata };
  },
};
