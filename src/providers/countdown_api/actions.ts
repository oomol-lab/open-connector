import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "countdown_api";

const ebayDomainSchema = s.nonEmptyString("The eBay domain to query, such as ebay.com, ebay.co.uk, or ebay.de.");
const searchTermSchema = s.nonEmptyString("The eBay search term to query.");
const ebayUrlSchema = s.url("The eBay page URL to retrieve through Countdown API.");
const fieldListSchema = s.nonEmptyString("A comma-separated list of response field paths.");

const actionResultSchema = s.object(
  {
    data: s.looseObject("The Countdown API response payload returned by the action."),
    error: s.string("Error if any occurred during the action execution."),
    successful: s.boolean("Whether the action execution was successful."),
  },
  { required: ["data", "successful"], description: "The Countdown API action result." },
);

export const countdownApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve Countdown API account usage, quota, and platform status details.",
    inputSchema: s.object({}, { description: "The input payload for retrieving Countdown API account details." }),
    outputSchema: actionResultSchema,
  }),
  defineProviderAction(service, {
    name: "autocomplete",
    description: "Get eBay autocomplete suggestions for a search term through Countdown API.",
    inputSchema: s.object(
      {
        search_term: searchTermSchema,
        ebay_domain: ebayDomainSchema,
      },
      { required: ["search_term", "ebay_domain"], description: "Countdown API autocomplete request." },
    ),
    outputSchema: actionResultSchema,
  }),
  defineProviderAction(service, {
    name: "search_products",
    description: "Search eBay products through Countdown API with optional filters.",
    inputSchema: s.object(
      {
        search_term: searchTermSchema,
        ebay_url: ebayUrlSchema,
        ebay_domain: ebayDomainSchema,
        page: s.positiveInteger("The result page number to request, starting at 1."),
        max_page: s.positiveInteger("The maximum result page number to retrieve when supported."),
        category_id: s.nonEmptyString("The eBay category ID used to narrow the search."),
        listing_type: s.stringEnum("The eBay listing type filter to apply.", [
          "all",
          "buy it now",
          "auction",
          "accepts offers",
        ]),
        condition: s.stringEnum("The eBay item condition filter to apply.", [
          "all",
          "new",
          "used",
          "open box",
          "manufacturer refurbished",
          "seller refurbished",
          "parts or not working",
          "not specified",
        ]),
        sort_by: s.stringEnum("The Countdown API sort option for product search results.", [
          "best match",
          "price high to low",
          "price low to high",
          "price high to low plus postage",
          "price low to high plus postage",
          "newly listed",
          "ending soonest",
        ]),
        num: s.integer("The number of search results to request. Valid values are 60, 120, or 240."),
        facets: s.nonEmptyString("Comma-separated eBay search facets, such as brand=sandisk,format=microsd."),
        sold_items: s.boolean("Whether to filter search results to sold items."),
        completed_items: s.boolean("Whether to filter search results to completed items."),
        authorized_sellers: s.boolean("Whether to filter search results to authorized seller items."),
        returns_accepted: s.boolean("Whether to filter search results to returns accepted items."),
        free_returns: s.boolean("Whether to filter search results to free return items."),
        authenticity_verified: s.boolean("Whether to filter search results to authenticity verified items."),
        deals_and_savings: s.boolean("Whether to filter search results to deals and savings items."),
        sale_items: s.boolean("Whether to filter search results to sale items."),
        allow_rewritten_results: s.boolean("Whether to include rewritten eBay results."),
        customer_location: s.nonEmptyString("The customer country location to use for eBay retrieval."),
        customer_zipcode: s.nonEmptyString("The customer ZIP or postal code to use for eBay retrieval."),
        include_fields: fieldListSchema,
        exclude_fields: fieldListSchema,
      },
      {
        optional: [
          "search_term",
          "ebay_url",
          "ebay_domain",
          "page",
          "max_page",
          "category_id",
          "listing_type",
          "condition",
          "sort_by",
          "num",
          "facets",
          "sold_items",
          "completed_items",
          "authorized_sellers",
          "returns_accepted",
          "free_returns",
          "authenticity_verified",
          "deals_and_savings",
          "sale_items",
          "allow_rewritten_results",
          "customer_location",
          "customer_zipcode",
          "include_fields",
          "exclude_fields",
        ],
        description: "The input payload for searching eBay products through Countdown API.",
      },
    ),
    outputSchema: actionResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Retrieve eBay product details by product ID through Countdown API.",
    inputSchema: s.object(
      {
        epid: s.nonEmptyString("The eBay EPID product ID to retrieve."),
        gtin: s.nonEmptyString("The GTIN, ISBN, UPC, or EAN code to convert to an eBay EPID."),
        ebay_url: ebayUrlSchema,
        ebay_domain: ebayDomainSchema,
        skip_gtin_cache: s.boolean("Whether to force a fresh GTIN to EPID lookup."),
        include_parts_compatibility: s.boolean("Whether to include product parts compatibility details."),
        customer_location: s.nonEmptyString("The customer country location to use for eBay retrieval."),
        customer_zipcode: s.nonEmptyString("The customer ZIP or postal code to use for eBay retrieval."),
        include_fields: fieldListSchema,
        exclude_fields: fieldListSchema,
      },
      {
        optional: [
          "epid",
          "gtin",
          "ebay_url",
          "ebay_domain",
          "skip_gtin_cache",
          "include_parts_compatibility",
          "customer_location",
          "customer_zipcode",
          "include_fields",
          "exclude_fields",
        ],
        description: "The input payload for retrieving an eBay product through Countdown API.",
      },
    ),
    outputSchema: actionResultSchema,
  }),
];
