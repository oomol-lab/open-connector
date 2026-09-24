import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aisa";
const dataForSeoOutput = s.looseObject("The DataForSEO live response returned by AIsa.");

const message = s.requiredObject("One preceding conversation message.", {
  role: s.stringEnum("The author of the preceding message.", ["user", "ai"]),
  message: s.string("The preceding message content.", { maxLength: 500 }),
});

const llmFields = {
  prompt: s.string("The question or task to send to the model.", { maxLength: 500 }),
  model: s.string("The model name or version exposed by DataForSEO."),
  maxOutputTokens: s.integer("The maximum number of output tokens to request.", {
    minimum: 1,
    maximum: 4096,
  }),
  temperature: s.number("The sampling temperature supported by the selected model.", {
    minimum: 0,
    maximum: 2,
  }),
  topP: s.number("The nucleus-sampling probability supported by the selected model.", {
    minimum: 0,
    maximum: 1,
  }),
  webSearch: s.boolean("Whether the model may search the web for current information."),
  forceWebSearch: s.boolean("Whether to require web search when the model supports it."),
  webSearchCountryCode: s.string("The ISO country code used to localize web search."),
  webSearchCity: s.string("The city used to localize web search."),
  systemMessage: s.string("Instructions controlling the model's role or behavior.", {
    maxLength: 500,
  }),
  messageChain: s.array("Up to ten preceding conversation messages.", message, { maxItems: 10 }),
  useReasoning: s.boolean("Whether to enable model reasoning when supported."),
  tag: s.string("A caller-defined identifier returned with the result.", { maxLength: 255 }),
};

export const queryChatGptVisibilityAction: ActionDefinition = defineProviderAction(service, {
  name: "query_dataforseo_chatgpt",
  operationType: "read",
  description: "Run a live ChatGPT response query for GEO research through DataForSEO.",
  requiredScopes: [],
  inputSchema: s.object(
    "A ChatGPT prompt, model, and optional search controls.",
    {
      prompt: llmFields.prompt,
      model: llmFields.model,
      maxOutputTokens: llmFields.maxOutputTokens,
      temperature: llmFields.temperature,
      topP: llmFields.topP,
      webSearch: llmFields.webSearch,
      forceWebSearch: llmFields.forceWebSearch,
      webSearchCountryCode: llmFields.webSearchCountryCode,
      webSearchCity: llmFields.webSearchCity,
      systemMessage: llmFields.systemMessage,
      messageChain: llmFields.messageChain,
      tag: llmFields.tag,
    },
    {
      optional: [
        "maxOutputTokens",
        "temperature",
        "topP",
        "webSearch",
        "forceWebSearch",
        "webSearchCountryCode",
        "webSearchCity",
        "systemMessage",
        "messageChain",
        "tag",
      ],
    },
  ),
  outputSchema: dataForSeoOutput,
});

export const queryClaudeVisibilityAction: ActionDefinition = defineProviderAction(service, {
  name: "query_dataforseo_claude",
  operationType: "read",
  description: "Run a live Claude response query for GEO research through DataForSEO.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Claude prompt, model, and optional search controls.",
    {
      prompt: llmFields.prompt,
      model: llmFields.model,
      maxOutputTokens: llmFields.maxOutputTokens,
      temperature: llmFields.temperature,
      topP: llmFields.topP,
      webSearch: llmFields.webSearch,
      forceWebSearch: llmFields.forceWebSearch,
      webSearchCountryCode: llmFields.webSearchCountryCode,
      webSearchCity: llmFields.webSearchCity,
      systemMessage: llmFields.systemMessage,
      messageChain: llmFields.messageChain,
      useReasoning: llmFields.useReasoning,
      tag: llmFields.tag,
    },
    {
      optional: [
        "maxOutputTokens",
        "temperature",
        "topP",
        "webSearch",
        "forceWebSearch",
        "webSearchCountryCode",
        "webSearchCity",
        "systemMessage",
        "messageChain",
        "useReasoning",
        "tag",
      ],
    },
  ),
  outputSchema: dataForSeoOutput,
});

export const queryGeminiVisibilityAction: ActionDefinition = defineProviderAction(service, {
  name: "query_dataforseo_gemini",
  operationType: "read",
  description: "Run a live Gemini response query for GEO research through DataForSEO.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Gemini prompt, model, and optional search controls.",
    {
      prompt: llmFields.prompt,
      model: llmFields.model,
      maxOutputTokens: llmFields.maxOutputTokens,
      temperature: llmFields.temperature,
      topP: llmFields.topP,
      webSearch: llmFields.webSearch,
      systemMessage: llmFields.systemMessage,
      messageChain: llmFields.messageChain,
      useReasoning: llmFields.useReasoning,
      tag: llmFields.tag,
    },
    {
      optional: [
        "maxOutputTokens",
        "temperature",
        "topP",
        "webSearch",
        "systemMessage",
        "messageChain",
        "useReasoning",
        "tag",
      ],
    },
  ),
  outputSchema: dataForSeoOutput,
});

export const queryPerplexityVisibilityAction: ActionDefinition = defineProviderAction(service, {
  name: "query_dataforseo_perplexity",
  operationType: "read",
  description: "Run a live Perplexity response query for GEO research through DataForSEO.",
  requiredScopes: [],
  inputSchema: s.object(
    "A Perplexity prompt, model, and optional localization controls.",
    {
      prompt: llmFields.prompt,
      model: llmFields.model,
      maxOutputTokens: llmFields.maxOutputTokens,
      temperature: llmFields.temperature,
      topP: llmFields.topP,
      webSearchCountryCode: llmFields.webSearchCountryCode,
      systemMessage: llmFields.systemMessage,
      messageChain: llmFields.messageChain,
      tag: llmFields.tag,
    },
    {
      optional: [
        "maxOutputTokens",
        "temperature",
        "topP",
        "webSearchCountryCode",
        "systemMessage",
        "messageChain",
        "tag",
      ],
    },
  ),
  outputSchema: dataForSeoOutput,
});

export const getAiKeywordVolumeAction: ActionDefinition = defineProviderAction(service, {
  name: "get_dataforseo_ai_keyword_volume",
  operationType: "read",
  description: "Get AI-search volume estimates for up to 1,000 keywords.",
  requiredScopes: [],
  inputSchema: s.requireAnyProperty(
    s.requireAnyProperty(
      s.object(
        "Keywords, location, language, and optional tag for an AI keyword-volume query.",
        {
          keywords: s.array("The keywords to measure.", s.string("A keyword of up to 250 characters."), {
            minItems: 1,
            maxItems: 1000,
            uniqueItems: true,
          }),
          locationName: s.string("The full location name; omit when using locationCode."),
          locationCode: s.integer("The DataForSEO location code; omit when using locationName."),
          languageName: s.string("The full language name; omit when using languageCode."),
          languageCode: s.string("The language code; omit when using languageName."),
          tag: llmFields.tag,
        },
        { optional: ["locationName", "locationCode", "languageName", "languageCode", "tag"] },
      ),
      ["locationName", "locationCode"],
    ),
    ["languageName", "languageCode"],
  ),
  outputSchema: dataForSeoOutput,
});

const mentionTarget = s.requireAnyProperty(
  s.object(
    "One domain or keyword entity used to filter LLM mentions.",
    {
      domain: s.string("The target domain without a scheme or www prefix."),
      keyword: s.string("The target keyword or brand phrase."),
      searchFilter: s.stringEnum("Whether to include or exclude this entity.", ["include", "exclude"]),
      searchScope: s.array(
        "The LLM response sections in which to search for the entity.",
        s.string("An LLM response search scope."),
        { uniqueItems: true },
      ),
      includeSubdomains: s.boolean("Whether a domain target includes its subdomains."),
      matchType: s.stringEnum("How a keyword target is matched.", ["word_match", "partial_match"]),
    },
    {
      optional: ["domain", "keyword", "searchFilter", "searchScope", "includeSubdomains", "matchType"],
    },
  ),
  ["domain", "keyword"],
);

const mentionFields = {
  targets: s.array("The one to ten domain or keyword entities to analyze.", mentionTarget, {
    minItems: 1,
    maxItems: 10,
  }),
  locationName: s.string("The search location name."),
  locationCode: s.integer("The DataForSEO search location code."),
  languageName: s.string("The search language name."),
  languageCode: s.string("The search language code."),
  platform: s.stringEnum("The AI-answer platform whose mentions should be analyzed.", ["chat_gpt", "google"]),
  linksScope: s.stringEnum("Which cited links should contribute to aggregation.", ["sources", "search_results"]),
  limit: s.integer("The maximum number of mention records to return.", {
    minimum: 1,
    maximum: 1000,
  }),
  tag: llmFields.tag,
};

const optionalMentionFields = [
  "locationName",
  "locationCode",
  "languageName",
  "languageCode",
  "platform",
  "linksScope",
  "limit",
  "tag",
];

export const getLlmMentionMetricsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_dataforseo_llm_mention_metrics",
  operationType: "read",
  description: "Aggregate LLM mention metrics for domains and keyword entities.",
  requiredScopes: [],
  inputSchema: s.object("Targets and locale filters for LLM mention aggregation.", mentionFields, {
    optional: optionalMentionFields,
  }),
  outputSchema: dataForSeoOutput,
});

export const searchLlmMentionsAction: ActionDefinition = defineProviderAction(service, {
  name: "search_dataforseo_llm_mentions",
  operationType: "read",
  description: "Search individual LLM mention records for domains and keywords.",
  requiredScopes: [],
  inputSchema: s.object("Targets and locale filters for searching LLM mentions.", mentionFields, {
    optional: optionalMentionFields,
  }),
  outputSchema: dataForSeoOutput,
});

export const getLlmMentionTopDomainsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_dataforseo_llm_mention_top_domains",
  operationType: "read",
  description: "Get domains cited most often in LLM responses matching target entities.",
  requiredScopes: [],
  inputSchema: s.object("Targets and locale filters for ranking cited domains.", mentionFields, {
    optional: optionalMentionFields,
  }),
  outputSchema: dataForSeoOutput,
});

export const dataForSeoActions: ActionDefinition[] = [
  queryChatGptVisibilityAction,
  queryClaudeVisibilityAction,
  queryGeminiVisibilityAction,
  queryPerplexityVisibilityAction,
  getAiKeywordVolumeAction,
  getLlmMentionMetricsAction,
  searchLlmMentionsAction,
  getLlmMentionTopDomainsAction,
];
