import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "handelsregister_ai";

const stringOrStringArray = (description: string) =>
  s.describe(
    {
      anyOf: [
        { type: "string", minLength: 1 },
        { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
      ],
    },
    description,
  );

const rangeSchema = s.object(
  "An inclusive numeric range used to filter company financial values.",
  {
    gte: s.number("The inclusive minimum value."),
    lte: s.number("The inclusive maximum value."),
  },
  { optional: ["gte", "lte"] },
);

const financialFiltersSchema = s.object(
  "Financial ranges used to filter organizations by their latest available statements.",
  {
    emp_count: rangeSchema,
    bs_assets_total: rangeSchema,
    bs_equity_total: rangeSchema,
    bs_liabilities_total: rangeSchema,
    bs_cash_and_equivalents: rangeSchema,
    bs_cash_to_liabilities: rangeSchema,
    bs_equity_ratio: rangeSchema,
    bs_debt_to_assets: rangeSchema,
    pl_revenue: rangeSchema,
    pl_net_income: rangeSchema,
    pl_ebit: rangeSchema,
  },
  {
    optional: [
      "emp_count",
      "bs_assets_total",
      "bs_equity_total",
      "bs_liabilities_total",
      "bs_cash_and_equivalents",
      "bs_cash_to_liabilities",
      "bs_equity_ratio",
      "bs_debt_to_assets",
      "pl_revenue",
      "pl_net_income",
      "pl_ebit",
    ],
  },
);

const searchFiltersSchema = s.object(
  "Structured filters for German commercial-register organization search.",
  {
    registration_date_from: s.string("The earliest registration date or timestamp in ISO 8601 format."),
    registration_date_to: s.string("The latest registration date or timestamp in ISO 8601 format."),
    legal_form_code: stringOrStringArray("One or more legal-form codes to match."),
    industry_code: stringOrStringArray("One or more WZ industry codes to match."),
    industry_scheme: s.string("The industry classification scheme, which defaults to WZ2025."),
    active: s.boolean("Whether to include only active or only inactive organizations."),
    postal_code: s.string("The postal code to match."),
    city: s.string("The city to match."),
    state: s.string("The German state to match."),
    location_coordinates: s.object("The center point for a geographic radius filter.", {
      latitude: s.number("The latitude of the radius center."),
      longitude: s.number("The longitude of the radius center."),
    }),
    location_max_distance_km: s.number("The maximum radius in kilometers, from 1 to 100.", {
      minimum: 1,
      maximum: 100,
    }),
    registration_type: stringOrStringArray("One or more register types such as HRA, HRB, GnR, PR, or VR."),
    registration_authority_name: s.string("The registration court or authority name to match."),
    registration_number: s.string("The commercial-register number to match."),
    company_size_category: s.stringEnum("The company size category to match.", [
      "micro",
      "small",
      "medium",
      "large",
    ] as const),
    financial_filters: financialFiltersSchema,
  },
  {
    optional: [
      "registration_date_from",
      "registration_date_to",
      "legal_form_code",
      "industry_code",
      "industry_scheme",
      "active",
      "postal_code",
      "city",
      "state",
      "location_coordinates",
      "location_max_distance_km",
      "registration_type",
      "registration_authority_name",
      "registration_number",
      "company_size_category",
      "financial_filters",
    ],
  },
);

const metaSchema = s.looseObject("Request billing metadata returned by Handelsregister AI.", {
  request_credit_cost: s.number("The number of credits charged for the request."),
  credits_remaining: s.describe(
    { anyOf: [{ type: "number" }, { type: "string" }] },
    "The remaining credit balance, returned as a number or numeric string.",
  ),
});

const organizationSummarySchema = s.looseObject(
  "A German company search result with registry and address details when available.",
  {
    entity_id: s.string("The stable Handelsregister AI organization identifier."),
    name: s.string("The registered organization name."),
    registration: s.looseObject("The organization's commercial-register details."),
    address: s.looseObject("The organization's registered address."),
    registration_date: s.nullable(s.string("The organization registration date or timestamp in ISO 8601 format.")),
    purpose: s.nullable(s.string("The registered business purpose.")),
  },
);

const searchOrganizationsInputSchema = {
  ...s.object(
    "Search parameters for finding German commercial-register organizations.",
    {
      q: s.string("A company name, register number, or free-text search query.", { minLength: 2 }),
      filters: searchFiltersSchema,
      skip: s.integer("The number of matching organizations to skip.", { minimum: 0 }),
      limit: s.integer("The maximum number of organizations to return, up to 30.", {
        minimum: 1,
        maximum: 30,
      }),
      ai_mode: s.stringEnum("Enable AI-assisted search at the provider's documented additional credit cost.", [
        "on-default",
      ] as const),
    },
    { optional: ["q", "filters", "skip", "limit", "ai_mode"] },
  ),
  anyOf: [{ required: ["q"] }, { required: ["filters"] }],
};

const searchOrganizationsOutputSchema = s.object("A page of matching German commercial-register organizations.", {
  results: s.array("The organizations matching the current query and filters.", organizationSummarySchema),
  total: s.integer("The total number of matching organizations."),
  meta: metaSchema,
});

const organizationFeatureValues = [
  "financial_kpi",
  "balance_sheet_accounts",
  "profit_and_loss_account",
  "related_persons",
  "publications",
  "news",
  "insolvency_publications",
  "annual_financial_statements",
  "annual_financial_statements__html",
  "shareholders",
  "ubos",
  "shareholdings",
  "mergers_and_acquisitions",
  "website_content",
] as const;

const fetchOrganizationInputSchema = s.object(
  "Parameters for retrieving one German company profile and optional enrichment features.",
  {
    q: s.nonWhitespaceString("A company name, register number, search query, or entity_id from search_organizations."),
    features: s.array(
      "Optional enrichment features to request; each feature may consume additional credits.",
      s.stringEnum("A documented organization enrichment feature.", organizationFeatureValues),
      { minItems: 1 },
    ),
    ai_search: s.stringEnum(
      "Enable AI enrichment and fuzzy entity resolution at the provider's documented additional credit cost.",
      ["on-default"] as const,
    ),
    realtime_mode: s.stringEnum(
      "Refresh live commercial-register data at the provider's documented additional credit cost.",
      ["handelsregister-default"] as const,
    ),
  },
  { optional: ["features", "ai_search", "realtime_mode"] },
);

const fetchOrganizationOutputSchema = s.looseRequiredObject(
  "The company profile returned by Handelsregister AI, including requested enrichment fields when available.",
  {
    entity_id: s.string("The stable Handelsregister AI organization identifier."),
    name: s.string("The registered organization name."),
    meta: metaSchema,
  },
);

export const handelsregisterAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_organizations",
    operationType: "read",
    description:
      "Search German commercial-register organizations by free text or structured filters and return a paginated result set.",
    requiredScopes: [],
    inputSchema: searchOrganizationsInputSchema,
    outputSchema: searchOrganizationsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "fetch_organization",
    operationType: "read",
    description:
      "Retrieve a German company profile by name, register number, search query, or exact entity identifier, with optional paid enrichment features.",
    requiredScopes: [],
    inputSchema: fetchOrganizationInputSchema,
    outputSchema: fetchOrganizationOutputSchema,
  }),
];
