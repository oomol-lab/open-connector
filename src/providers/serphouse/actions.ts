import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "serphouse";

const statusField = s.string("SERPHouse response status.");
const messageField = s.string("SERPHouse response message.");
const emptyInputSchema = s.object({}, { description: "No input is required." });
const searchEngineTypeSchema = s.stringEnum("Search engine type accepted by SERPHouse lookup endpoints.", [
  "google",
  "bing",
  "yahoo",
]);

const accountInfoOutputSchema = s.object("SERPHouse account information response.", {
  status: statusField,
  msg: messageField,
  account: s.looseObject("SERPHouse account object with the API key field omitted when present.", {
    email: s.string("Account email address returned by SERPHouse."),
    name: s.string("Account name returned by SERPHouse."),
    plan: looseObjectArray("Plans returned by SERPHouse.", "One SERPHouse plan object."),
  }),
});

const searchWebOutputSchema = s.object("SERPHouse synchronous web SERP response.", {
  status: statusField,
  msg: messageField,
  search_metadata: s.looseObject("Search metadata returned by SERPHouse."),
  search_parameters: s.looseObject("Search parameters returned by SERPHouse."),
  results: s.looseObject("Structured web SERP result sections returned by SERPHouse."),
});

export const serphouseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "account_info",
    description: "Retrieve account and credit usage information for the connected SERPHouse key.",
    inputSchema: emptyInputSchema,
    outputSchema: accountInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_domains",
    description: "List search engine domains supported by SERPHouse SERP requests.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("SERPHouse supported domain list response.", {
      status: statusField,
      msg: messageField,
      domains: s.array(
        "Search engine domains supported by SERPHouse.",
        s.string("One supported search engine domain."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "list_languages",
    description: "List SERPHouse language codes for one supported search engine type.",
    inputSchema: s.object(
      "Input parameters for listing SERPHouse languages.",
      {
        type: searchEngineTypeSchema,
      },
      { required: ["type"] },
    ),
    outputSchema: s.object("SERPHouse language list response.", {
      status: statusField,
      msg: messageField,
      languages: s.record("Language names keyed by SERPHouse language code.", s.string("Language display name.")),
    }),
  }),
  defineProviderAction(service, {
    name: "search_locations",
    description: "Search SERPHouse locations for geo-targeted SERP requests.",
    inputSchema: s.object(
      "Input parameters for searching SERPHouse locations.",
      {
        q: s.nonEmptyString("Location search text."),
        type: s.stringEnum("Search engine type for the location database.", ["google", "bing"]),
      },
      { required: ["q", "type"] },
    ),
    outputSchema: s.object("SERPHouse location search response.", {
      status: statusField,
      msg: messageField,
      locations: s.array(
        "SERPHouse location matches.",
        s.object("One SERPHouse location match.", {
          id: s.integer("SERPHouse location identifier."),
          name: s.string("Location display name."),
          loc: s.string("Location string accepted by SERPHouse SERP requests."),
          type: s.string("Location type returned by SERPHouse."),
          country_code: s.string("Country code returned by SERPHouse."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "search_web",
    description: "Run a synchronous SERPHouse web SERP request and return structured JSON results.",
    inputSchema: searchWebInputSchema(),
    outputSchema: searchWebOutputSchema,
  }),
];

function looseObjectArray(description: string, itemDescription: string): JsonSchema {
  return s.array(description, s.looseObject(itemDescription));
}

function searchWebInputSchema(): JsonSchema {
  return {
    ...s.object(
      "Input parameters for a synchronous SERPHouse web SERP request.",
      {
        q: s.nonEmptyString("Search phrase to send to SERPHouse."),
        domain: s.nonEmptyString("Search engine domain such as google.com, bing.com, or yahoo.com."),
        lang: s.nonEmptyString("Language code such as en or fr."),
        device: s.stringEnum("Device type used for the SERP request.", ["desktop", "mobile"]),
        loc: s.nonEmptyString("SERPHouse location string to target."),
        loc_id: s.integer("SERPHouse location identifier to target."),
        verbatim: s.integer("Google verbatim mode where 0 disables and 1 enables it.", {
          minimum: 0,
          maximum: 1,
        }),
        gfilter: s.integer(
          "Search filter mode where 1 enables similar and omitted result filtering and 0 disables it.",
          {
            minimum: 0,
            maximum: 1,
          },
        ),
        page: s.positiveInteger("Result page number to request."),
        num_result: s.integer("Number of results to request per page.", {
          minimum: 1,
          maximum: 10,
        }),
        date_range: s.nonEmptyString(
          "Date filter accepted by SERPHouse, such as h, d, w, m, y, or YYYY-MM-DD,YYYY-MM-DD.",
        ),
      },
      {
        optional: ["loc", "loc_id", "verbatim", "gfilter", "page", "num_result", "date_range"],
      },
    ),
    not: {
      required: ["loc", "loc_id"],
    },
  };
}
