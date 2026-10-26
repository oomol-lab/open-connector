import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const dataForSeoReferencePaths: Record<string, string> = {
  chatgptModels: "ai_optimization/chat_gpt/llm_responses/models",
  geminiModels: "ai_optimization/gemini/llm_responses/models",
  perplexityModels: "ai_optimization/perplexity/llm_responses/models",
  mentionFilters: "ai_optimization/llm_mentions/available_filters",
  mentionLocationsAndLanguages: "ai_optimization/llm_mentions/locations_and_languages",
  aiKeywordLocationsAndLanguages: "ai_optimization/ai_keyword_data/locations_and_languages",
  amazonLocations: "merchant/amazon/locations",
  googlePlayCategories: "app_data/google/categories",
  googlePlayListingCategories: "app_data/google/app_listings/categories",
  appStoreListingCategories: "app_data/apple/app_listings/categories",
  googleShoppingLocations: "merchant/google/locations",
  clickstreamLocationsAndLanguages: "keywords_data/clickstream_data/locations_and_languages",
  whoisFilters: "domain_analytics/whois/available_filters",
  labsFilters: "dataforseo_labs/available_filters",
  contentCategories: "content_analysis/categories",
  contentFilters: "content_analysis/available_filters",
  baiduLocations: "serp/baidu/locations",
  bingLocations: "serp/bing/locations",
  googleLocations: "serp/google/locations",
  seznamLocations: "serp/seznam/locations",
  youtubeLocations: "serp/youtube/locations",
};

export const dataForSeoReferenceAction: ProviderActionDefinition<"get_dataforseo_reference_data"> =
  defineProviderAction("aisa", {
    name: "get_dataforseo_reference_data",
    operationType: "read",
    description:
      "Look up DataForSEO model names, location codes, categories, or supported filter fields before a research query.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The reference catalog to retrieve; availability differs by API family.", {
      resource: s.stringEnum(
        "The model, location, category, or filter catalog to retrieve.",
        Object.keys(dataForSeoReferencePaths),
      ),
    }),
    outputSchema: s.looseObject("The DataForSEO reference response with task statuses and result records preserved."),
  });
