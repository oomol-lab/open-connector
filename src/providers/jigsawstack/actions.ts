import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jigsawstack";

const nonEmptyString = (description: string, options: { maxLength?: number } = {}) =>
  s.string(description, { minLength: 1, ...options });

const usageSchema = s.looseObject("JigsawStack usage information for the API call.", {
  input_tokens: s.number("The number of input tokens processed."),
  output_tokens: s.number("The number of output tokens generated."),
  inference_time_tokens: s.number("The number of tokens processed during inference time."),
  total_tokens: s.number("The total number of tokens used by the request."),
});

const rawObjectSchema = s.looseObject("The raw JigsawStack response object.");

const baseOutputFields = {
  success: s.boolean("Whether JigsawStack marked the request as successful."),
  logId: s.nullable(s.string("The JigsawStack request log identifier when returned.")),
  usage: s.nullable(usageSchema),
  raw: rawObjectSchema,
};

const looseResultSchema = s.looseObject("One web search result returned by JigsawStack.", {
  title: s.string("The search result title."),
  url: s.url("The search result URL."),
  description: s.string("The search result description."),
  content: s.anyOf("The result content as text or a structured content object.", [
    s.string("The result content as plain text."),
    s.looseObject("Structured result content returned by JigsawStack."),
  ]),
  is_safe: s.boolean("Whether this result passed the safe-search setting."),
  site_name: s.string("The website name returned by JigsawStack."),
  site_long_name: s.string("The website long name returned by JigsawStack."),
  age: s.string("The indexed or published age returned by JigsawStack."),
  language: s.string("The result language code."),
  favicon: s.url("The result favicon URL."),
  snippets: s.array("Relevant result snippets returned by JigsawStack.", s.string("A snippet.")),
  related_index: s.looseObject("Related result metadata returned by JigsawStack."),
});

const searchWebInputSchema = s.object(
  "The input payload for JigsawStack AI web search.",
  {
    query: nonEmptyString("The search query. JigsawStack accepts up to 400 characters.", {
      maxLength: 400,
    }),
    aiOverview: s.boolean("Whether to include an AI-generated overview in the search results."),
    safeSearch: s.stringEnum("The safe-search level to apply.", ["moderate", "strict", "off"]),
    spellCheck: s.boolean("Whether JigsawStack should spell-check the query."),
    byoUrls: s.array("URLs to restrict the search results to.", s.url("One URL to include in the search scope."), {
      minItems: 1,
    }),
    countryCode: nonEmptyString("The ISO country code for geo-aware search."),
    autoScrape: s.boolean("Whether JigsawStack should automatically scrape result URLs."),
    maxResults: s.positiveInteger("The maximum number of search results to return."),
  },
  {
    optional: ["aiOverview", "safeSearch", "spellCheck", "byoUrls", "countryCode", "autoScrape", "maxResults"],
  },
);

const searchWebOutputSchema = s.object("The normalized JigsawStack web search response.", {
  ...baseOutputFields,
  query: s.nullable(s.string("The processed search query returned by JigsawStack.")),
  aiOverview: s.nullable(s.string("The AI-generated overview when requested.")),
  spellFixed: s.nullable(s.boolean("Whether JigsawStack spell-corrected the query.")),
  isSafe: s.nullable(s.boolean("Whether the search results passed the safe-search setting.")),
  results: s.array("The web search results returned by JigsawStack.", looseResultSchema),
  links: s.array("Links extracted from the search results.", s.string("One extracted link.")),
  imageUrls: s.array("Image URLs found in the search results.", s.url("One image URL.")),
  geoResults: s.array(
    "Geographic search results returned by JigsawStack.",
    s.looseObject("One geographic result returned by JigsawStack."),
  ),
});

const searchSuggestionsInputSchema = s.object("The input payload for retrieving JigsawStack search suggestions.", {
  query: nonEmptyString("The query prefix to get suggestions for, up to 200 characters.", {
    maxLength: 200,
  }),
});

const searchSuggestionsOutputSchema = s.object("The normalized JigsawStack search suggestions response.", {
  ...baseOutputFields,
  suggestions: s.array("Search suggestions returned by JigsawStack.", s.string("One search suggestion.")),
});

const textOrTextArraySchema = s.anyOf("One text string or an array of text strings.", [
  nonEmptyString("One text string.", { maxLength: 5000 }),
  s.array("Multiple text strings.", nonEmptyString("One text string.", { maxLength: 5000 }), {
    minItems: 1,
  }),
]);

const translateTextInputSchema = s.object(
  "The input payload for translating text with JigsawStack.",
  {
    text: textOrTextArraySchema,
    targetLanguage: nonEmptyString("The target language code."),
    currentLanguage: nonEmptyString("The source language code. Omit this to let JigsawStack auto-detect it."),
  },
  { optional: ["currentLanguage"] },
);

const translatedTextSchema = s.anyOf("The translated text. The shape matches the input text shape.", [
  s.string("A translated text string."),
  s.array("Translated text strings.", s.string("One translated text string.")),
]);

const translateTextOutputSchema = s.object("The normalized JigsawStack translation response.", {
  ...baseOutputFields,
  translatedText: translatedTextSchema,
});

const summaryTypeSchema = s.stringEnum("The summary format to return.", ["text", "points"]);

const summarizeTextInputSchema = s.object(
  "The input payload for summarizing text or a provider-accessible document with JigsawStack. One of text, url, or fileStoreKey is required.",
  {
    text: nonEmptyString("The text content to summarize, up to 300000 characters.", {
      maxLength: 300000,
    }),
    url: s.url("A provider-accessible PDF document URL for JigsawStack to summarize."),
    fileStoreKey: nonEmptyString("A JigsawStack file-store key for a stored PDF document."),
    type: summaryTypeSchema,
    maxPoints: s.integer("The maximum number of bullet points to generate.", {
      minimum: 1,
      maximum: 100,
    }),
    maxCharacters: s.positiveInteger("The maximum number of characters in the summary."),
  },
  {
    optional: ["text", "url", "fileStoreKey", "type", "maxPoints", "maxCharacters"],
  },
);
summarizeTextInputSchema.anyOf = [{ required: ["text"] }, { required: ["url"] }, { required: ["fileStoreKey"] }];

const summarySchema = s.anyOf("The summary returned by JigsawStack.", [
  s.string("A paragraph summary."),
  s.array("Bullet-point summary strings.", s.string("One summary point.")),
]);

const summarizeTextOutputSchema = s.object("The normalized JigsawStack summary response.", {
  ...baseOutputFields,
  summary: summarySchema,
});

const spamCheckInputSchema = s.object("The input payload for checking text for spam.", {
  text: s.anyOf("The text to check for spam.", [
    nonEmptyString("One text string."),
    s.array("Multiple text strings.", nonEmptyString("One text string."), { minItems: 1 }),
  ]),
});

const spamCheckResultSchema = s.looseObject("One JigsawStack spam check result.", {
  is_spam: s.boolean("Whether the text is spam."),
  score: s.number("The spam score returned by JigsawStack."),
});

const checkSpamOutputSchema = s.object("The normalized JigsawStack spam check response.", {
  ...baseOutputFields,
  check: s.anyOf("The spam check result for one or more input texts.", [
    spamCheckResultSchema,
    s.array("Spam check results for multiple input texts.", spamCheckResultSchema),
  ]),
});

const profanityInputSchema = s.object(
  "The input payload for checking text for profanity.",
  {
    text: nonEmptyString("The text to check for profanity."),
    censorReplacement: nonEmptyString("The character or string to replace profanity with."),
  },
  { optional: ["censorReplacement"] },
);

const profanityHitSchema = s.looseObject("One profanity occurrence returned by JigsawStack.", {
  profanity: s.nullable(s.string("The profane word that was detected.")),
  startIndex: s.number("The starting position of the profanity in the original text."),
  endIndex: s.number("The ending position of the profanity in the original text."),
});

const profanityOutputSchema = s.object("The normalized JigsawStack profanity check response.", {
  ...baseOutputFields,
  message: s.nullable(s.string("The message returned by JigsawStack.")),
  cleanText: s.nullable(s.string("The text with profanity replaced.")),
  profanities: s.array("Profanities found in the text.", profanityHitSchema),
  profanitiesFound: s.nullable(s.boolean("Whether profanity was found in the text.")),
});

export const jigsawstackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_web",
    description: "Search the web with JigsawStack AI Search and return normalized result data.",
    requiredScopes: [],
    inputSchema: searchWebInputSchema,
    outputSchema: searchWebOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_search_suggestions",
    description: "Get JigsawStack search suggestions for a query prefix.",
    requiredScopes: [],
    inputSchema: searchSuggestionsInputSchema,
    outputSchema: searchSuggestionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "translate_text",
    description: "Translate one string or an array of strings with JigsawStack.",
    requiredScopes: [],
    inputSchema: translateTextInputSchema,
    outputSchema: translateTextOutputSchema,
  }),
  defineProviderAction(service, {
    name: "summarize_text",
    description: "Summarize text or a provider-accessible PDF document with JigsawStack.",
    requiredScopes: [],
    inputSchema: summarizeTextInputSchema,
    outputSchema: summarizeTextOutputSchema,
  }),
  defineProviderAction(service, {
    name: "check_spam",
    description: "Check whether one string or an array of strings is spam with JigsawStack.",
    requiredScopes: [],
    inputSchema: spamCheckInputSchema,
    outputSchema: checkSpamOutputSchema,
  }),
  defineProviderAction(service, {
    name: "check_profanity",
    description: "Check text for profanity with JigsawStack and return detected occurrences.",
    requiredScopes: [],
    inputSchema: profanityInputSchema,
    outputSchema: profanityOutputSchema,
  }),
];
