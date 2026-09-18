import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "leadfeeder";

const accountIdSchema = s.nonEmptyString(
  "The Leadfeeder account ID. Retrieve available account IDs with list_accounts.",
);
const companyIdSchema = s.nonEmptyString(
  "The Leadfeeder company ID. Older string-based company IDs are also supported by Leadfeeder.",
);
const includeSchema = s.stringEnum("Additional relationship data to attach to a company response.", [
  "group_company",
  "tags",
  "lists",
  "web_visits",
  "icps",
  "crm_connections",
  "crm_connections.crm_record",
  "crm_connections.crm_record.crm_owner",
  "crm_suggestions",
  "crm_suggestions.crm_record",
  "crm_suggestions.crm_record.crm_owner",
  "crm_group_connections",
  "crm_group_connections.crm_connection",
  "crm_group_connections.crm_connection.crm_record",
  "crm_group_connections.crm_connection.crm_record.crm_owner",
]);
const resourceSchema = s.looseObject("A Leadfeeder JSON:API resource object.", {
  type: s.string("The Leadfeeder resource type."),
  id: s.string("The Leadfeeder resource ID."),
  attributes: s.looseObject("The attributes returned for this Leadfeeder resource."),
  relationships: s.looseObject("The relationships returned for this Leadfeeder resource."),
});
const metaSchema = s.looseObject("Leadfeeder response metadata.", {
  request_id: s.string("The unique request ID assigned by Leadfeeder."),
  credits: s.looseObject("Credit consumption metadata returned by Leadfeeder."),
  pagination: s.looseObject("Pagination metadata returned by Leadfeeder."),
  num_results: s.integer("The number of results returned by Leadfeeder."),
});
const objectOutputSchema = s.object("A Leadfeeder response containing one JSON:API resource.", {
  data: resourceSchema,
  meta: metaSchema,
});
const arrayOutputSchema = s.object("A Leadfeeder response containing an array of JSON:API resources.", {
  data: s.array("The Leadfeeder resources returned by the API.", resourceSchema),
  meta: metaSchema,
});
const locationSchema = s.object(
  "A company address or geographic filter used by Leadfeeder company search.",
  {
    street: s.nonEmptyString("The full street address line."),
    postalCode: s.nonEmptyString("The postal code related to the company's location."),
    city: s.nonEmptyString("The city name."),
    countryCode: s.nonEmptyString("The ISO 3166-1 alpha-2 country code."),
    regionCode: s.nonEmptyString("The region code for the company's location."),
    geo: s.object(
      "A geographic radius filter for company search.",
      {
        latitude: s.number("The latitude of the geographical point."),
        longitude: s.number("The longitude of the geographical point."),
        distance: s.number("Maximum distance in kilometers from the geographical point.", {
          minimum: 0,
          maximum: 500,
        }),
      },
      { optional: ["latitude", "longitude", "distance"] },
    ),
  },
  { optional: ["street", "postalCode", "city", "countryCode", "regionCode", "geo"] },
);
const industriesSchema = s.object(
  "Industry classification filters for company search.",
  {
    classification: s.stringEnum("The industry classification system for the supplied codes.", [
      "internal",
      "wz",
      "nace",
    ]),
    codes: s.array("The industry codes to filter companies by.", s.nonEmptyString("An industry code."), {
      minItems: 1,
    }),
  },
  { optional: ["classification"] },
);
const employeeRangeSchema = s.stringEnum("An approximate company employee count range.", [
  "1-10",
  "11-100",
  "101-500",
  "501-1.000",
  "1.001-5.000",
  "5.001-10.000",
  "10.000+",
]);
const revenueSchema = s.object(
  "A revenue range filter for companies. At least one of min or max is required when revenue is provided.",
  {
    min: s.nonNegativeInteger("The minimum annual revenue."),
    max: s.nonNegativeInteger("The maximum annual revenue."),
  },
  { optional: ["min", "max"] },
);
const filtersSchema = s.object(
  "Boolean company search filters combined by Leadfeeder using AND.",
  {
    hasPhone: s.boolean("Whether to return only companies with at least one phone number."),
    hasEmail: s.boolean("Whether to return only companies with at least one known email address."),
    hasSocialMediaProfiles: s.boolean("Whether to return only companies with at least one social media profile."),
    doNotContact: s.boolean("Whether to return only companies marked as do-not-contact."),
    hasFinancialsRevenue: s.boolean("Whether to return only companies with known revenue data."),
    hasFinancialsEarnings: s.boolean("Whether to return only companies with known earnings data."),
    hasFinancialsNetWorth: s.boolean("Whether to return only companies with known net worth data."),
    hasIpAddresses: s.boolean("Whether to return only companies with IP address data."),
  },
  {
    optional: [
      "hasPhone",
      "hasEmail",
      "hasSocialMediaProfiles",
      "doNotContact",
      "hasFinancialsRevenue",
      "hasFinancialsEarnings",
      "hasFinancialsNetWorth",
      "hasIpAddresses",
    ],
  },
);
const matchCompanySchema = s.object(
  "A company record to match against Leadfeeder company data. At least one of companyName, url, vatId, or registerId is required.",
  {
    companyName: s.nonEmptyString("The legal name of the company."),
    url: s.nonEmptyString("The URL of the company website."),
    email: s.nonEmptyString("A company email address."),
    phone: s.nonEmptyString("A company phone number in E.164 format when available."),
    country: s.nonEmptyString("The country name."),
    countryCode: s.nonEmptyString("The ISO 3166-1 alpha-2 country code."),
    city: s.nonEmptyString("The city name."),
    postalCode: s.nonEmptyString("The postal code for the company's location."),
    street: s.nonEmptyString("The full street address line."),
    streetName: s.nonEmptyString("The street name part of the company's primary address."),
    streetNumber: s.nonEmptyString("The street number part of the company's primary address."),
    registerId: s.nonEmptyString("The company's commercial register identifier."),
    registerLocation: s.nonEmptyString("The company's commercial register location."),
    vatId: s.nonEmptyString("The company's VAT ID or tax ID."),
  },
  {
    optional: [
      "companyName",
      "url",
      "email",
      "phone",
      "country",
      "countryCode",
      "city",
      "postalCode",
      "street",
      "streetName",
      "streetNumber",
      "registerId",
      "registerLocation",
      "vatId",
    ],
  },
);

export const leadfeederActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    operationType: "read",
    description:
      "List Leadfeeder accounts available to the API key, optionally including credit details for one account.",
    inputSchema: s.object(
      "Request parameters for listing Leadfeeder accounts.",
      {
        accountId: accountIdSchema,
      },
      { optional: ["accountId"] },
    ),
    outputSchema: arrayOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Retrieve the Leadfeeder user associated with the connected API key.",
    inputSchema: s.object("Request parameters for retrieving the current Leadfeeder user.", {}),
    outputSchema: objectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_company",
    operationType: "read",
    description: "Fetch detailed Leadfeeder firmographic and hierarchy data for one company ID.",
    inputSchema: s.object(
      "Request parameters for retrieving one Leadfeeder company.",
      { accountId: accountIdSchema, companyId: companyIdSchema, include: includeSchema },
      { optional: ["include"] },
    ),
    outputSchema: objectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_companies",
    operationType: "read",
    description: "Fetch detailed Leadfeeder firmographic data for up to 100 company IDs in one request.",
    inputSchema: s.object(
      "Request parameters for retrieving multiple Leadfeeder companies.",
      {
        accountId: accountIdSchema,
        companyIds: s.array("Leadfeeder company IDs to retrieve.", companyIdSchema, { minItems: 1, maxItems: 100 }),
        include: includeSchema,
      },
      { optional: ["include"] },
    ),
    outputSchema: arrayOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_companies",
    operationType: "read",
    description:
      "Search Leadfeeder company intelligence using company terms, location, industry, size, revenue, ICP, and boolean filters.",
    inputSchema: s.object(
      "Request parameters for searching Leadfeeder companies. At least one search criterion is required.",
      {
        accountId: accountIdSchema,
        pageCursor: s.nonEmptyString("Cursor for retrieving the next page of company search results."),
        pageSize: s.integer("The number of company search results to return. Leadfeeder caps this at 100.", {
          minimum: 1,
          maximum: 100,
        }),
        searchTerms: s.array(
          "Strings matched against company names, alternative names, trade names, and domains.",
          s.nonEmptyString("A company search term."),
          { minItems: 1 },
        ),
        locations: s.array(
          "Company address or geographic filters. Multiple locations are combined as an OR query.",
          locationSchema,
          { minItems: 1 },
        ),
        industries: industriesSchema,
        employeeRanges: s.array("Employee count ranges to filter companies by.", employeeRangeSchema, { minItems: 1 }),
        revenue: revenueSchema,
        icpIds: s.array(
          "Ideal Customer Profile IDs to use as company search filters.",
          s.nonEmptyString("A Leadfeeder Ideal Customer Profile ID."),
          { minItems: 1 },
        ),
        filters: filtersSchema,
      },
      {
        optional: [
          "pageCursor",
          "pageSize",
          "searchTerms",
          "locations",
          "industries",
          "employeeRanges",
          "revenue",
          "icpIds",
          "filters",
        ],
      },
    ),
    outputSchema: arrayOutputSchema,
  }),
  defineProviderAction(service, {
    name: "match_companies",
    operationType: "read",
    description:
      "Match one or more company records to Leadfeeder companies and return ranked matches for each input record.",
    inputSchema: s.object(
      "Request parameters for matching company records to Leadfeeder companies.",
      {
        accountId: accountIdSchema,
        maxResultsPerCompany: s.integer("Maximum number of Leadfeeder matches returned per input company.", {
          minimum: 1,
          maximum: 20,
        }),
        companies: s.array("Company records to match.", matchCompanySchema, { minItems: 1, maxItems: 200 }),
      },
      { optional: ["maxResultsPerCompany"] },
    ),
    outputSchema: s.object("The Leadfeeder company match response.", {
      data: s.array(
        "Match result groups in the same order as the input companies.",
        s.array("Leadfeeder company match resources for one input company.", resourceSchema),
      ),
      meta: metaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "enrich_ip",
    operationType: "read",
    description: "Enrich one IPv4 or IPv6 address with Leadfeeder company or network intelligence.",
    inputSchema: s.object("Request parameters for enriching one IP address.", {
      accountId: accountIdSchema,
      ip: s.nonEmptyString("A valid IPv4 or IPv6 address to enrich."),
    }),
    outputSchema: objectOutputSchema,
  }),
];
