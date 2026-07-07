import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ninjapear";

export type NinjapearActionName =
  | "get_credit_balance"
  | "check_disposable_email"
  | "lookup_company_website"
  | "get_company_details"
  | "get_employee_count"
  | "list_customers"
  | "list_competitors"
  | "list_products";

const websiteSchema = s.nonEmptyString(
  "The website URL or company name of the target company. A website URL is recommended for precision.",
);
const useCacheSchema = s.stringEnum("How NinjaPear should use cached enrichment data.", [
  "if-recent",
  "if-present",
  "if-present-only",
  "never",
]);
const pageSizeSchema = s.integer("Number of results per page, from 1 to 200.", {
  minimum: 1,
  maximum: 200,
});
const cursorSchema = s.nonEmptyString("Pagination cursor returned by NinjaPear.");
const nullableStringArraySchema = (description: string) =>
  s.nullable(s.array(description, s.string("One string value returned by NinjaPear.")));

const customerCompanySchema = s.looseObject("A company returned by NinjaPear customer listing.", {
  name: s.string("Company name."),
  description: s.nullableString("A brief description of the company."),
  tagline: s.nullableString("Company tagline or slogan."),
  website: s.nullableString("Company website URL."),
  company_logo_url: s.nullableString("URL to the NinjaPear Company Logo API for this company."),
  id: s.string("Unique company identifier."),
  industry: s.nullableInteger("GICS 8-digit industry code."),
  specialties: nullableStringArraySchema("List of company specialties."),
  x_profile: s.nullableString("X profile URL."),
});

const competitorCompanySchema = s.looseObject("A competitor returned by NinjaPear competitor listing.", {
  company_details_url: s.string("URL to the NinjaPear Company Details API for this competitor."),
  website: s.string("Company website URL."),
  competition_reason: s.stringEnum("Why this company is considered a competitor.", [
    "organic_keyword_overlap",
    "product_overlap",
  ]),
});

const productSchema = s.looseObject("A product or service returned by NinjaPear.", {
  name: s.string("Full product or service name."),
  tagline: s.nullableString("One-line product tagline when available."),
  description: s.nullableString("One to three sentences describing what the product does."),
  categories: s.array("Product categories, industries, or use cases.", s.string("A category.")),
  tags: s.array("Short product attributes, deployment styles, or technology labels.", s.string("A tag.")),
  structured_features: s.record(
    "Feature map using canonical feature keys and boolean, string, or numeric values.",
    s.anyOf("A structured feature value.", [
      s.boolean("A boolean feature value."),
      s.string("A string feature value."),
      s.number("A numeric feature value."),
    ]),
  ),
  freeform_features: s.array("Feature phrases that do not fit a canonical key.", s.string("A feature phrase.")),
  pricing: s.nullable(s.looseObject("Pricing model, starting price, and tiers when available.")),
  integrations: s.array(
    "Product, platform, or service names this product integrates with.",
    s.string("An integration."),
  ),
  platforms: s.array("Platforms where the product is available.", s.string("A platform.")),
  source_urls: s.array("URLs where product data was found.", s.string("A source URL.")),
});

const getCreditBalanceAction = defineProviderAction(service, {
  name: "get_credit_balance",
  description: "Get the current NinjaPear credit balance for the authenticated account.",
  inputSchema: s.object("Input parameters for getting the NinjaPear credit balance.", {}),
  outputSchema: s.looseObject("The current NinjaPear credit balance.", {
    credit_balance: s.integer("The current credit balance."),
  }),
});

const checkDisposableEmailAction = defineProviderAction(service, {
  name: "check_disposable_email",
  description: "Check whether an email address is disposable or from a free email provider.",
  inputSchema: s.object(
    "Input parameters for checking an email address.",
    {
      email: s.email("The email address to check."),
    },
    { required: ["email"] },
  ),
  outputSchema: s.looseObject("The email classification returned by NinjaPear.", {
    email: s.email("The email address that was checked."),
    is_disposable_email: s.boolean("Whether the email domain is a known disposable provider."),
    is_free_email: s.boolean("Whether the email domain is a free email provider."),
  }),
});

const lookupCompanyWebsiteAction = defineProviderAction(service, {
  name: "lookup_company_website",
  description: "Resolve a company name to its canonical website URL.",
  inputSchema: s.object(
    "Input parameters for resolving a company website.",
    {
      company_name: s.nonEmptyString("The company name to look up."),
      country_code: s.string("Optional ISO 3166-1 alpha-2 country code used to bias the search.", {
        minLength: 2,
        maxLength: 2,
      }),
      hint: s.nonEmptyString("Hint used to differentiate similarly named companies."),
    },
    { optional: ["country_code", "hint"] },
  ),
  outputSchema: s.looseObject("The resolved company website returned by NinjaPear.", {
    website: s.string("The resolved canonical website URL."),
  }),
});

const getCompanyDetailsAction = defineProviderAction(service, {
  name: "get_company_details",
  description: "Retrieve detailed company information such as description, industry, leadership, and addresses.",
  inputSchema: s.object(
    "Input parameters for retrieving company details.",
    {
      website: websiteSchema,
      include_employee_count: s.boolean("Whether to include fresh employee count data."),
      follower_count: s.stringEnum("Whether to include X follower and following counts.", ["include"]),
      addresses: s.stringEnum("Address detail mode.", ["hq-only", "best-effort-exhaustive"]),
      use_cache: useCacheSchema,
    },
    { optional: ["include_employee_count", "follower_count", "addresses", "use_cache"] },
  ),
  outputSchema: s.looseObject("Detailed company information returned by NinjaPear.", {
    websites: nullableStringArraySchema("List of all company website URLs."),
    description: s.nullableString("A brief description of the company."),
    industry: s.nullableInteger("GICS 8-digit industry code."),
    company_type: s.nullableString("The company type."),
    founded_year: s.nullableInteger("Year the company was founded."),
    specialties: nullableStringArraySchema("List of company specialties."),
    name: s.nullableString("Company name."),
    tagline: s.nullableString("Company tagline or slogan."),
    logo_url: s.nullableString("URL to the company logo endpoint."),
    cover_pic_url: s.nullableString("URL to the company's cover image."),
  }),
});

const getEmployeeCountAction = defineProviderAction(service, {
  name: "get_employee_count",
  description: "Get the estimated employee count for a company.",
  inputSchema: s.object(
    "Input parameters for getting a company employee count.",
    {
      website: websiteSchema,
      use_cache: useCacheSchema,
    },
    { optional: ["use_cache"] },
  ),
  outputSchema: s.looseObject("Employee count data returned by NinjaPear.", {
    employee_count: s.integer("Estimated employee count."),
  }),
});

const listCustomersAction = defineProviderAction(service, {
  name: "list_customers",
  description: "List likely customers, investors, and partner platforms for a target company.",
  inputSchema: s.object(
    "Input parameters for listing likely customers and partners.",
    {
      website: websiteSchema,
      cursor: cursorSchema,
      page_size: pageSizeSchema,
      quality_filter: s.boolean("Whether to filter out low-quality results."),
      use_cache: useCacheSchema,
    },
    { optional: ["cursor", "page_size", "quality_filter", "use_cache"] },
  ),
  outputSchema: s.looseObject("Customer listing returned by NinjaPear.", {
    customers: s.array("Companies that are probable customers of the target company.", customerCompanySchema),
    investors: s.array("Investors that have invested in the target company.", customerCompanySchema),
    partner_platforms: s.array(
      "Partners, platforms, or service providers used by the target company.",
      customerCompanySchema,
    ),
    next_page: s.nullableString("Pagination URL for the next page of results."),
  }),
});

const listCompetitorsAction = defineProviderAction(service, {
  name: "list_competitors",
  description: "Discover direct business competitors of a target company.",
  inputSchema: s.object(
    "Input parameters for listing competitors.",
    {
      website: websiteSchema,
      use_cache: useCacheSchema,
    },
    { optional: ["use_cache"] },
  ),
  outputSchema: s.looseObject("Competitor listing returned by NinjaPear.", {
    competitors: s.array("Competitors for the target company.", competitorCompanySchema),
  }),
});

const listProductsAction = defineProviderAction(service, {
  name: "list_products",
  description: "List products and services offered by a target company.",
  inputSchema: s.object(
    "Input parameters for listing products and services.",
    {
      website: websiteSchema,
      use_cache: useCacheSchema,
    },
    { optional: ["use_cache"] },
  ),
  outputSchema: s.looseObject("Product listing returned by NinjaPear.", {
    website: s.string("The normalized website requested."),
    products: s.array("Products and services offered by the target company.", productSchema),
    credit_cost: s.integer("Total credits charged for this call."),
    error: s.nullableString("Error message when a streamed live response could not return products."),
  }),
});

export const ninjapearActions: ActionDefinition[] = [
  getCreditBalanceAction,
  checkDisposableEmailAction,
  lookupCompanyWebsiteAction,
  getCompanyDetailsAction,
  getEmployeeCountAction,
  listCustomersAction,
  listCompetitorsAction,
  listProductsAction,
];
