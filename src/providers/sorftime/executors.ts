import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { executeSorftimeAction, sorftimeApiBaseUrl, validateSorftimeCredential } from "./runtime.ts";

const service = "sorftime";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"sorftime", Handler> = {
  get_product_details(input, context) {
    return executeSorftimeAction("get_product_details", input, context.apiKey, context.fetcher);
  },
  search_products_by_name(input, context) {
    return executeSorftimeAction("search_products_by_name", input, context.apiKey, context.fetcher);
  },
  search_categories_by_name(input, context) {
    return executeSorftimeAction("search_categories_by_name", input, context.apiKey, context.fetcher);
  },
  get_category_best_sellers(input, context) {
    return executeSorftimeAction("get_category_best_sellers", input, context.apiKey, context.fetcher);
  },
  get_category_trend(input, context) {
    return executeSorftimeAction("get_category_trend", input, context.apiKey, context.fetcher);
  },
  get_keyword_details(input, context) {
    return executeSorftimeAction("get_keyword_details", input, context.apiKey, context.fetcher);
  },
  extend_keywords(input, context) {
    return executeSorftimeAction("extend_keywords", input, context.apiKey, context.fetcher);
  },
  reverse_lookup_asin_keywords(input, context) {
    return executeSorftimeAction("reverse_lookup_asin_keywords", input, context.apiKey, context.fetcher);
  },
  get_credit_balance(input, context) {
    return executeSorftimeAction("get_credit_balance", input, context.apiKey, context.fetcher);
  },
  list_credit_usage(input, context) {
    return executeSorftimeAction("list_credit_usage", input, context.apiKey, context.fetcher);
  },
  get_request_usage(input, context) {
    return executeSorftimeAction("get_request_usage", input, context.apiKey, context.fetcher);
  },
  search_products(input, context) {
    return executeSorftimeAction("search_products", input, context.apiKey, context.fetcher);
  },
  get_asin_sales_history(input, context) {
    return executeSorftimeAction("get_asin_sales_history", input, context.apiKey, context.fetcher);
  },
  get_product_variations(input, context) {
    return executeSorftimeAction("get_product_variations", input, context.apiKey, context.fetcher);
  },
  get_product_review_summary(input, context) {
    return executeSorftimeAction("get_product_review_summary", input, context.apiKey, context.fetcher);
  },
  list_product_reviews(input, context) {
    return executeSorftimeAction("list_product_reviews", input, context.apiKey, context.fetcher);
  },
  list_category_products(input, context) {
    return executeSorftimeAction("list_category_products", input, context.apiKey, context.fetcher);
  },
  search_keywords(input, context) {
    return executeSorftimeAction("search_keywords", input, context.apiKey, context.fetcher);
  },
  get_keyword_search_results(input, context) {
    return executeSorftimeAction("get_keyword_search_results", input, context.apiKey, context.fetcher);
  },
  get_keyword_search_result_trend(input, context) {
    return executeSorftimeAction("get_keyword_search_result_trend", input, context.apiKey, context.fetcher);
  },
  reverse_lookup_category_keywords(input, context) {
    return executeSorftimeAction("reverse_lookup_category_keywords", input, context.apiKey, context.fetcher);
  },
  get_keyword_product_rankings(input, context) {
    return executeSorftimeAction("get_keyword_product_rankings", input, context.apiKey, context.fetcher);
  },
  get_asin_keyword_rankings(input, context) {
    return executeSorftimeAction("get_asin_keyword_rankings", input, context.apiKey, context.fetcher);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, values: credential.values, metadata: credential.metadata, fetcher };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: sorftimeApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "BasicAuth " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("browser", "Cli");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateSorftimeCredential({ apiKey: input.apiKey }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
