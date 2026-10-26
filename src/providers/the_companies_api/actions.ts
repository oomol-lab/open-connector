import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const refreshOptions = {
  refresh: s.boolean("Request a real-time refresh of company data for 10 additional credits."),
  simplified: s.boolean("Return the simplified company representation."),
};

const company = s.looseObject("Company profile. Available fields depend on the data and simplified option.", {
  id: s.string("Company ID."),
  about: s.looseObject("Company identity, industry and workforce information.", {}),
  domain: s.looseObject("Company domain information.", {}),
  contacts: s.looseObject("Company contact information.", {}),
  locations: s.looseObject("Company office and headquarters locations.", {}),
  socials: s.looseObject("Company social profiles.", {}),
  technologies: s.looseObject("Company technology information.", {}),
});

const segmentationCondition = s.object(
  "Company segmentation condition.",
  {
    attribute: s.stringEnum("Company attribute to filter.", [
      "about.businessType",
      "about.industries",
      "about.industry",
      "about.name",
      "about.totalEmployees",
      "about.yearFounded",
      "ai.search",
      "analytics.monthlyVisitors",
      "apps",
      "codes.naics",
      "codes.sic",
      "contacts",
      "domain.domain",
      "domain.tld",
      "finances.revenue",
      "finances.stockExchange",
      "locations.headquarters.city.code",
      "locations.headquarters.continent.code",
      "locations.headquarters.country.code",
      "locations.headquarters.county.code",
      "locations.headquarters.state.code",
      "meta.listIds",
      "meta.score",
      "meta.syncedAt",
      "socials",
      "socials.linkedin.id",
      "technologies.active",
      "technologies.categories",
      "urls",
    ]),
    blockedOperator: s.boolean("Whether the condition operator is blocked."),
    operator: s.stringEnum("Logical operator joining this condition.", ["and", "or"]),
    sign: s.stringEnum("Comparison to apply to the attribute.", [
      "equals",
      "exactEquals",
      "greater",
      "lower",
      "notEquals",
    ]),
    values: s.array("Values to compare against.", {
      anyOf: [s.string("Text comparison value."), s.number("Numeric comparison value.")],
      description: "Text or numeric comparison value.",
    }),
  },
  {
    optional: ["blockedOperator"],
  },
);

const filter = {
  actionId: s.number("Existing action ID used as the search source."),
  query: s.array("Company segmentation conditions.", segmentationCondition),
  search: s.string("Text to search for in the selected fields."),
  searchFields: s.array(
    "Company fields searched by the text query.",
    s.stringEnum("Searchable company field.", ["about.name", "domain.domain"]),
  ),
};

const sortKey = s.stringEnum("Company field used for sorting.", [
  "about.businessType",
  "about.industries",
  "about.industry",
  "about.name",
  "about.totalEmployees",
  "about.yearFounded",
  "analytics.monthlyVisitors",
  "apps",
  "codes.naics",
  "codes.sic",
  "contacts",
  "domain.domain",
  "domain.tld",
  "finances.revenue",
  "locations.headquarters.city.code",
  "locations.headquarters.country.code",
  "locations.headquarters.county.code",
  "locations.headquarters.state.code",
  "meta.score",
  "meta.syncedAt",
  "socials",
  "technologies.active",
  "urls",
]);

const sortOrder = s.stringEnum("Sort direction.", ["asc", "desc"]);

const searchProperties = {
  ...filter,
  domainsToExclude: s.string("Comma-separated company domains to exclude."),
  linkedinToExclude: s.string("Comma-separated LinkedIn profile URLs to exclude."),
  page: s.number("Page number to retrieve. Defaults to 1."),
  simplified: refreshOptions.simplified,
  size: s.number("Number of companies per page, between 1 and 100. Defaults to 10.", {
    minimum: 1,
    maximum: 100,
  }),
  sortFields: s.array(
    "Ordered sorting criteria.",
    s.object(
      "One sorting criterion.",
      {
        key: sortKey,
        missing: s.stringEnum("Where to place records without a sort value.", ["_first", "_last"]),
        order: sortOrder,
      },
      {
        optional: ["missing"],
      },
    ),
  ),
  sortKey,
  sortOrder,
};

const pagination = s.object(
  "Pagination and credit usage for this response.",
  {
    cost: s.number("Credits charged for this request."),
    credits: s.number("Credit balance reported by the API."),
    currentPage: s.number("Current page number."),
    firstPage: s.number("First page number."),
    freeRequest: s.boolean("Whether this request was free."),
    lastPage: s.number("Last available page number."),
    perPage: s.number("Number of results per page."),
    total: s.number("Total matching companies."),
    maxScrollResultsReached: s.boolean("Whether the maximum scroll result limit has been reached."),
  },
  {
    additionalProperties: true,
    optional: ["maxScrollResultsReached"],
  },
);

const socialProperties: Record<string, JsonSchema> = {
  angellist: s.string("angellist company profile URL.", { format: "uri" }),
  dribbble: s.string("dribbble company profile URL.", { format: "uri" }),
  facebook: s.string("facebook company profile URL.", { format: "uri" }),
  github: s.string("github company profile URL.", { format: "uri" }),
  instagram: s.string("instagram company profile URL.", { format: "uri" }),
  linkedin: s.string("linkedin company profile URL.", { format: "uri" }),
  pinterest: s.string("pinterest company profile URL.", { format: "uri" }),
  snapchat: s.string("snapchat company profile URL.", { format: "uri" }),
  souncloud: s.string("SoundCloud company profile URL; the upstream parameter is spelled souncloud.", {
    format: "uri",
  }),
  tiktok: s.string("tiktok company profile URL.", { format: "uri" }),
  twitter: s.string("twitter company profile URL.", { format: "uri" }),
  wellfound: s.string("wellfound company profile URL.", { format: "uri" }),
  youtube: s.string("youtube company profile URL.", { format: "uri" }),
};

interface TheCompaniesApiEndpoint {
  path: string;
  method: "GET" | "POST";
  action: ActionDefinition;
}

function endpoint(
  name: string,
  path: string,
  method: "GET" | "POST",
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
  operationType: "read" | "write",
): TheCompaniesApiEndpoint {
  return {
    path,
    method,
    action: defineProviderAction("the_companies_api", {
      name,
      description,
      inputSchema,
      outputSchema,
      operationType,
      requiredScopes: [],
    }),
  };
}

const endpoints = [
  endpoint(
    "get_company",
    "/v2/companies/{domain}",
    "GET",
    "Get company data by domain, optionally requesting a data refresh.",
    s.object(
      "Company domain lookup parameters.",
      {
        domain: s.string("Company domain, such as example.com.", {
          minLength: 1,
          not: { enum: [".", ".."] },
        }),
        ...refreshOptions,
      },
      {
        optional: Object.keys(refreshOptions),
      },
    ),
    company,
    "write",
  ),
  endpoint(
    "get_company_by_email",
    "/v2/companies/by-email",
    "GET",
    "Get company data and email analysis from an email address, optionally requesting a data refresh.",
    s.object(
      "Company email lookup parameters.",
      { email: s.string("Email address to analyze.", { minLength: 1 }), ...refreshOptions },
      {
        optional: Object.keys(refreshOptions),
      },
    ),
    s.object(
      "Email analysis with company data when available.",
      {
        company,
        email: s.looseObject("Email address analysis and classification.", {}),
        meta: s.looseObject("Request billing metadata.", {
          freeRequest: s.boolean("Whether this request was free."),
        }),
        refreshing: s.boolean("Whether company data is being refreshed."),
      },
      {
        additionalProperties: true,
        required: ["email"],
      },
    ),
    "write",
  ),
  endpoint(
    "get_company_by_social",
    "/v2/companies/by-social",
    "GET",
    "Get company data from social profile URLs, optionally requesting a data refresh.",
    s.object(
      "Company social profile lookup parameters. Provide at least one profile URL.",
      { ...socialProperties, ...refreshOptions },
      {
        optional: [...Object.keys(socialProperties), ...Object.keys(refreshOptions)],
        anyOf: Object.keys(socialProperties).map((key) => ({ required: [key] })),
      },
    ),
    company,
    "write",
  ),
  endpoint(
    "search_companies",
    "/v2/companies",
    "POST",
    "Search companies using segmentation conditions or text, returning one page and its pagination metadata.",
    s.object("Company search parameters.", searchProperties, {
      optional: Object.keys(searchProperties),
    }),
    s.object(
      "Matching companies, pagination and applied conditions.",
      {
        companies: s.array("Companies on the requested page.", company),
        meta: pagination,
        query: s.array("Segmentation conditions used by the API.", segmentationCondition),
      },
      {
        optional: [],
        additionalProperties: true,
      },
    ),
    "read",
  ),
  endpoint(
    "count_companies",
    "/v2/companies/count",
    "POST",
    "Count companies matching segmentation conditions or a text query.",
    s.object("Company count parameters.", filter, {
      optional: Object.keys(filter),
    }),
    s.object(
      "Company count result.",
      {
        count: s.number("Number of matching companies."),
      },
      {
        optional: [],
        additionalProperties: true,
      },
    ),
    "read",
  ),
];

export const theCompaniesApiActions: ActionDefinition[] = endpoints.map((item) => item.action);

export const theCompaniesApiEndpointByName: Map<string, TheCompaniesApiEndpoint> = new Map(
  endpoints.map((item) => [item.action.name, item]),
);
