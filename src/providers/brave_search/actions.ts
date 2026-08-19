import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "brave_search";

const queryField = s.string({
  description: "The user's search query term. Maximum of 400 characters.",
  minLength: 1,
  maxLength: 400,
});

const searchLangField = s.string({
  description: "The preferred search result language code.",
  minLength: 2,
});

const uiLangField = s.string({
  description: "The preferred user interface language for response formatting.",
  minLength: 2,
});

const countryField = s.string({
  description: "The two-letter country code for result localization, or ALL for worldwide results.",
  minLength: 2,
  maxLength: 3,
});

const webSafeSearchField = s.stringEnum("Filters adult content from web results.", ["off", "moderate", "strict"]);
const newsSafeSearchField = s.stringEnum("Filters adult content from news results.", ["off", "moderate", "strict"]);
const videoSafeSearchField = s.stringEnum("Filters adult content from video results.", ["off", "moderate", "strict"]);
const imageSafeSearchField = s.stringEnum("Filters adult content from image results.", ["off", "strict"]);

const freshnessField = (description: string) =>
  s.anyOf(description, [
    s.stringEnum("A predefined freshness window such as past day or past year.", ["pd", "pw", "pm", "py"]),
    s.nonEmptyString("A custom date range in the format YYYY-MM-DDtoYYYY-MM-DD."),
  ]);

const webCountField = s.integer("The maximum number of web results to return.", { minimum: 1, maximum: 20 });
const searchCountField = s.integer("The maximum number of results to return.", { minimum: 1, maximum: 50 });
const imageCountField = s.integer("The maximum number of image results to return.", { minimum: 1, maximum: 200 });
const offsetField = s.integer("The zero-based results page offset used for pagination.", { minimum: 0, maximum: 9 });
const spellcheckField = s.boolean("Whether Brave Search should spellcheck the query before searching.");
const extraSnippetsField = s.boolean("Whether Brave Search should return extra alternate snippets.");
const gogglesField = s.anyOf("One or more Brave Search goggles used to rerank results.", [
  s.nonEmptyString("One goggle URL or inline definition."),
  s.stringArray("Multiple goggles to apply to the search request.", {
    minItems: 1,
    itemDescription: "One goggle URL or inline definition.",
  }),
]);
const resultFilterField = s.nonEmptyString(
  "A comma-delimited list of result types to include, such as web,news,videos,locations,discussions,faq,infobox,mixed,summarizer or rich.",
);
const textDecorationsField = s.boolean("Whether display strings should include decoration markers such as highlights.");
const operatorsField = s.boolean("Whether Brave Search should apply search operators.");
const includeFetchMetadataField = s.boolean(
  "Whether Brave Search should include fetch metadata in results when available.",
);
const unitsField = s.stringEnum("The measurement units used for localized results.", ["metric", "imperial"]);

const nullableLooseObject = (description: string) => s.nullable(s.looseObject(description));
const looseObjectArray = (itemDescription: string, description: string) =>
  s.array(description, s.looseObject(itemDescription));

export const braveSearchActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "web_search",
    description: "Search the Brave Search web index and return the selected result families.",
    inputSchema: s.object(
      "Input parameters for a Brave Search web search request.",
      {
        q: queryField,
        search_lang: searchLangField,
        ui_lang: uiLangField,
        country: countryField,
        safesearch: webSafeSearchField,
        count: webCountField,
        offset: offsetField,
        spellcheck: spellcheckField,
        freshness: freshnessField("Filters web results by page age."),
        result_filter: resultFilterField,
        extra_snippets: extraSnippetsField,
        goggles: gogglesField,
        text_decorations: textDecorationsField,
        units: unitsField,
        operators: operatorsField,
        include_fetch_metadata: includeFetchMetadataField,
      },
      {
        required: ["q"],
        optional: [
          "search_lang",
          "ui_lang",
          "country",
          "safesearch",
          "count",
          "offset",
          "spellcheck",
          "freshness",
          "result_filter",
          "extra_snippets",
          "goggles",
          "text_decorations",
          "units",
          "operators",
          "include_fetch_metadata",
        ],
      },
    ),
    outputSchema: s.object(
      "A normalized Brave Search web search response.",
      {
        type: s.string("The Brave Search response type."),
        query: nullableLooseObject("Query metadata returned by Brave Search."),
        web: nullableLooseObject("Web result payload returned by Brave Search."),
        news: nullableLooseObject("News result payload returned by Brave Search."),
        videos: nullableLooseObject("Video result payload returned by Brave Search."),
        locations: nullableLooseObject("Location result payload returned by Brave Search."),
        discussions: nullableLooseObject("Discussion clusters returned by Brave Search."),
        faq: nullableLooseObject("Frequently asked questions returned by Brave Search."),
        infobox: nullableLooseObject("Infobox payload returned by Brave Search."),
        mixed: nullableLooseObject("Mixed ranking payload returned by Brave Search."),
        summarizer: nullableLooseObject("Summary metadata returned by Brave Search."),
        rich: nullableLooseObject("Rich result callback payload returned by Brave Search."),
      },
      {
        optional: [
          "query",
          "web",
          "news",
          "videos",
          "locations",
          "discussions",
          "faq",
          "infobox",
          "mixed",
          "summarizer",
          "rich",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "news_search",
    description: "Search Brave's news index for recent articles related to a query.",
    inputSchema: s.object(
      "Input parameters for a Brave Search news request.",
      {
        q: queryField,
        search_lang: searchLangField,
        ui_lang: uiLangField,
        country: countryField,
        safesearch: newsSafeSearchField,
        count: searchCountField,
        offset: offsetField,
        spellcheck: spellcheckField,
        freshness: freshnessField("Filters news results by page age."),
        extra_snippets: extraSnippetsField,
        goggles: gogglesField,
        operators: operatorsField,
        include_fetch_metadata: includeFetchMetadataField,
      },
      {
        required: ["q"],
        optional: [
          "search_lang",
          "ui_lang",
          "country",
          "safesearch",
          "count",
          "offset",
          "spellcheck",
          "freshness",
          "extra_snippets",
          "goggles",
          "operators",
          "include_fetch_metadata",
        ],
      },
    ),
    outputSchema: s.object(
      "A normalized Brave Search news response.",
      {
        type: s.string("The Brave Search response type."),
        query: nullableLooseObject("Query metadata returned by Brave Search."),
        results: looseObjectArray(
          "One news result item returned by Brave Search.",
          "The list of news results returned by Brave Search.",
        ),
      },
      { optional: ["query", "results"] },
    ),
  }),
  defineProviderAction(service, {
    name: "video_search",
    description: "Search Brave's video index for videos related to a query.",
    inputSchema: s.object(
      "Input parameters for a Brave Search video request.",
      {
        q: queryField,
        search_lang: searchLangField,
        ui_lang: uiLangField,
        country: countryField,
        safesearch: videoSafeSearchField,
        count: searchCountField,
        offset: offsetField,
        spellcheck: spellcheckField,
        freshness: freshnessField("Filters video results by page age."),
        operators: operatorsField,
        include_fetch_metadata: includeFetchMetadataField,
      },
      {
        required: ["q"],
        optional: [
          "search_lang",
          "ui_lang",
          "country",
          "safesearch",
          "count",
          "offset",
          "spellcheck",
          "freshness",
          "operators",
          "include_fetch_metadata",
        ],
      },
    ),
    outputSchema: s.object(
      "A normalized Brave Search video response.",
      {
        type: s.string("The Brave Search response type."),
        query: nullableLooseObject("Query metadata returned by Brave Search."),
        results: looseObjectArray(
          "One video result item returned by Brave Search.",
          "The list of video results returned by Brave Search.",
        ),
        extra: nullableLooseObject("Additional metadata returned with the video results."),
      },
      { optional: ["query", "results", "extra"] },
    ),
  }),
  defineProviderAction(service, {
    name: "image_search",
    description: "Search Brave's image index for images related to a query.",
    inputSchema: s.object(
      "Input parameters for a Brave Search image request.",
      {
        q: queryField,
        search_lang: searchLangField,
        country: countryField,
        safesearch: imageSafeSearchField,
        count: imageCountField,
        spellcheck: spellcheckField,
      },
      { required: ["q"], optional: ["search_lang", "country", "safesearch", "count", "spellcheck"] },
    ),
    outputSchema: s.object(
      "A normalized Brave Search image response.",
      {
        type: s.string("The Brave Search response type."),
        query: nullableLooseObject("Query metadata returned by Brave Search."),
        results: looseObjectArray(
          "One image result item returned by Brave Search.",
          "The list of image results returned by Brave Search.",
        ),
        extra: nullableLooseObject("Additional metadata returned with the image results."),
      },
      { optional: ["query", "results", "extra"] },
    ),
  }),
];
