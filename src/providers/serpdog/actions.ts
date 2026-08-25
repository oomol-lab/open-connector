import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "serpdog";

const accountInfoOutputSchema = s.object(
  "Account information payload returned by Serpdog.",
  {
    user_name: s.nonEmptyString("The user name returned by Serpdog."),
    api_key: s.nonEmptyString("The API key echoed by Serpdog."),
    email: s.nonEmptyString("The account email address returned by Serpdog."),
    plan: s.nonEmptyString("The current Serpdog plan name."),
    quota: s.nonNegativeInteger("The monthly quota returned by Serpdog."),
    requests: s.nonNegativeInteger("The number of requests already used in the current period."),
    requests_left: s.nonNegativeInteger("The number of requests remaining in the current period."),
    billing_history: s.array(
      "The billing history entries returned by Serpdog when available.",
      s.object("One Serpdog billing history entry.", {
        date: s.nonEmptyString("The billing event timestamp."),
        plan: s.nonEmptyString("The billed plan name."),
        amount: s.nonEmptyString("The billed amount string."),
        invoice: s.nonEmptyString("The invoice URL or label returned by Serpdog."),
      }),
    ),
  },
  {
    required: ["user_name", "api_key", "email", "plan", "quota", "requests", "requests_left"],
    optional: ["billing_history"],
  },
);

const googleSearchInputSchema = s.actionInput(
  {
    q: s.nonEmptyString("Google Search query."),
    mode: s.stringEnum("Search mode used for Google Search requests.", ["advanced", "lite"]),
    num: s.positiveInteger("Number of results to request per page."),
    gl: s.nonEmptyString("Two-letter country code used for localized results."),
    hl: s.nonEmptyString("Language code used for localized results."),
    page: s.nonNegativeInteger("Result offset used by Serpdog pagination, such as 0, 10, or 20."),
    lr: s.nonEmptyString("Document language restriction passed to Google Search."),
    uule: s.nonEmptyString("Encoded location parameter passed to Google Search."),
    duration: s.nonEmptyString("Relative time filter passed to Google Search."),
    nfpr: s.boolean("Whether to exclude results for an auto-corrected query."),
    tbs: s.nonEmptyString("Advanced search filter string passed to Google Search."),
    safe: s.stringEnum("Safe search mode passed to Google Search.", ["active", "off"]),
    domain: s.nonEmptyString("Google domain override such as google.co.uk."),
  },
  ["q"],
  "Input parameters for running a Google Search request through Serpdog.",
);

const googleNewsInputSchema = s.actionInput(
  {
    q: s.nonEmptyString("Google News query."),
    num: s.positiveInteger("Number of results to request per page."),
    gl: s.nonEmptyString("Two-letter country code used for localized results."),
    hl: s.nonEmptyString("Language code used for localized results."),
    page: s.nonNegativeInteger("Result offset used by Serpdog pagination, such as 0, 10, or 20."),
    lr: s.nonEmptyString("Document language restriction passed to Google News."),
    uule: s.nonEmptyString("Encoded location parameter passed to Google News."),
    duration: s.nonEmptyString("Relative time filter passed to Google News."),
    nfpr: s.boolean("Whether to exclude results for an auto-corrected query."),
    tbs: s.nonEmptyString("Advanced search filter string passed to Google News."),
    safe: s.stringEnum("Safe search mode passed to Google News.", ["active", "off"]),
  },
  ["q"],
  "Input parameters for running a Google News request through Serpdog.",
);

const googleVideosInputSchema = s.actionInput(
  {
    q: s.nonEmptyString("Google Videos query."),
    num: s.positiveInteger("Number of results to request per page."),
    gl: s.nonEmptyString("Two-letter country code used for localized results."),
    hl: s.nonEmptyString("Language code used for localized results."),
    page: s.nonNegativeInteger("Result offset used by Serpdog pagination, such as 0, 10, or 20."),
    lr: s.nonEmptyString("Document language restriction passed to Google Videos."),
    uule: s.nonEmptyString("Encoded location parameter passed to Google Videos."),
    duration: s.nonEmptyString("Relative time filter passed to Google Videos."),
    nfpr: s.boolean("Whether to exclude results for an auto-corrected query."),
    tbs: s.nonEmptyString("Advanced search filter string passed to Google Videos."),
    safe: s.stringEnum("Safe search mode passed to Google Videos.", ["active", "off"]),
  },
  ["q"],
  "Input parameters for running a Google Videos request through Serpdog.",
);

const googleAutocompleteInputSchema = s.actionInput(
  {
    q: s.nonEmptyString("Google Autocomplete query."),
    gl: s.nonEmptyString("Two-letter country code used for localized suggestions."),
    hl: s.nonEmptyString("Language code used for localized suggestions."),
  },
  ["q"],
  "Input parameters for running a Google Autocomplete request through Serpdog.",
);

export const serpdogActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_info",
    description: "Retrieve account details and quota usage for the connected Serpdog API key.",
    inputSchema: s.actionInput({}, [], "The input payload for retrieving Serpdog account information."),
    outputSchema: accountInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "google_search",
    description: "Run a Google Search request through Serpdog using either the advanced or lite endpoint.",
    inputSchema: googleSearchInputSchema,
    outputSchema: s.object(
      "Normalized output payload for google_search.",
      {
        meta: s.looseObject("Request metadata returned by Serpdog."),
        organic_results: s.array(
          "Organic search results returned by Serpdog.",
          s.looseObject("One Google Search organic result item."),
        ),
        knowledge_graph: s.looseObject("Knowledge graph payload returned by Serpdog when available."),
        inline_videos: s.array(
          "Inline video results returned by Serpdog when available.",
          s.looseObject("One inline video result item."),
        ),
        local_results: s.array(
          "Local results returned by Serpdog when available.",
          s.looseObject("One local result item."),
        ),
        recipes_results: s.array(
          "Recipe results returned by Serpdog when available.",
          s.looseObject("One recipe result item."),
        ),
        peopleAlsoAskedFor: s.array(
          "Related entity results returned by Serpdog when available.",
          s.looseObject("One related entity item."),
        ),
        relatedSearches: s.array(
          "Related searches returned by Serpdog when available.",
          s.looseObject("One related search item."),
        ),
        pagination: s.looseObject("Google pagination payload returned by Serpdog."),
        serpdog_pagination: s.looseObject("Serpdog pagination helper payload returned by Serpdog."),
      },
      {
        required: ["meta", "organic_results"],
        optional: [
          "knowledge_graph",
          "inline_videos",
          "local_results",
          "recipes_results",
          "peopleAlsoAskedFor",
          "relatedSearches",
          "pagination",
          "serpdog_pagination",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "google_news_search",
    description: "Run a Google News request through Serpdog.",
    inputSchema: googleNewsInputSchema,
    outputSchema: s.object(
      "Normalized output payload for google_news_search.",
      {
        meta: s.looseObject("Request metadata returned by Serpdog."),
        news_results: s.array("News results returned by Serpdog.", s.looseObject("One Google News result item.")),
        subArticles: s.array(
          "Grouped sub-articles returned by Serpdog when available.",
          s.looseObject("One grouped sub-article payload."),
        ),
        pagination: s.looseObject("Google pagination payload returned by Serpdog."),
        serpdog_pagination: s.looseObject("Serpdog pagination helper payload returned by Serpdog."),
      },
      { required: ["meta", "news_results"], optional: ["subArticles", "pagination", "serpdog_pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "google_videos_search",
    description: "Run a Google Videos request through Serpdog.",
    inputSchema: googleVideosInputSchema,
    outputSchema: s.object(
      "Normalized output payload for google_videos_search.",
      {
        meta: s.looseObject("Request metadata returned by Serpdog."),
        video_results: s.array("Video results returned by Serpdog.", s.looseObject("One Google Videos result item.")),
        pagination: s.looseObject("Google pagination payload returned by Serpdog."),
        serpdog_pagination: s.looseObject("Serpdog pagination helper payload returned by Serpdog."),
      },
      { required: ["meta", "video_results"], optional: ["pagination", "serpdog_pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "google_autocomplete",
    description: "Retrieve Google Autocomplete suggestions through Serpdog.",
    inputSchema: googleAutocompleteInputSchema,
    outputSchema: s.actionOutput(
      {
        meta: s.looseObject("Request metadata returned by Serpdog."),
        suggestions: s.array(
          "Autocomplete suggestions returned by Serpdog.",
          s.object("One autocomplete suggestion item.", {
            value: s.nonEmptyString("Suggestion text returned by Serpdog."),
            relevance: s.integer("Suggestion relevance score returned by Serpdog."),
            type: s.nonEmptyString("Suggestion type returned by Serpdog."),
          }),
        ),
        verbatim_relevance: s.integer("Verbatim relevance score returned by Serpdog."),
      },
      "Normalized output payload for google_autocomplete.",
    ),
  }),
];
