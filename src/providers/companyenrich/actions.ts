import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "companyenrich";

const companyTypeValues = [
  "private",
  "public",
  "self-employed",
  "self-owned",
  "partnership",
  "nonprofit",
  "educational",
  "government",
];
const companyCategoryValues = ["b2b", "b2c", "b2g", "e-commerce", "media", "service-provider", "mobile", "saas"];
const companyEmployeesValues = ["1-10", "11-50", "51-200", "201-500", "501-1K", "1K-5K", "5K-10K", "over-10K"];
const companyRevenueValues = ["under-1m", "1m-10m", "10m-50m", "50m-100m", "100m-200m", "200m-1b", "over-1b"];
const fundingRoundValues = [
  "seed",
  "debt_financing",
  "angel",
  "venture",
  "series_a",
  "series_b",
  "series_c",
  "series_d",
  "series_e",
  "series_f",
  "series_g",
  "series_h",
  "other",
];
const featureRequirementValues = [
  "linkedin",
  "twitter",
  "facebook",
  "instagram",
  "angellist",
  "crunchbase",
  "youtube",
  "country",
  "city",
  "state",
  "revenue",
  "foundedYear",
  "anyFunding",
];

const companyTypeSchema = s.stringEnum("The company type filter value.", companyTypeValues);
const companyCategorySchema = s.stringEnum("The company category filter value.", companyCategoryValues);
const companyEmployeesSchema = s.stringEnum("The company employee-count range filter value.", companyEmployeesValues);
const companyRevenueSchema = s.stringEnum("The company revenue range filter value.", companyRevenueValues);
const companyFundingRoundSchema = s.stringEnum("The funding-round filter value.", fundingRoundValues);
const featureRequirementSchema = s.stringEnum("The CompanyEnrich feature requirement value.", featureRequirementValues);
const expandFieldSchema = s.stringEnum("The expandable response field to request from CompanyEnrich.", ["workforce"]);
const looseObjectSchema = s.looseObject("The official CompanyEnrich nested object for this filter or response branch.");

const paginationSchema = s.object("The normalized CompanyEnrich pagination summary.", {
  page: s.integer("The current 1-indexed page returned by CompanyEnrich."),
  totalPages: s.integer("The total number of pages returned by CompanyEnrich."),
  totalItems: s.integer("The total number of matching companies returned by CompanyEnrich."),
});

const userSchema = s.object("The normalized CompanyEnrich authenticated user summary.", {
  userId: s.nonEmptyString("The CompanyEnrich user identifier."),
  credits: s.object("The CompanyEnrich credit summary.", {
    total: s.integer("The total credit allotment for the authenticated account."),
    used: s.integer("The number of credits already used by the account."),
  }),
  capabilities: s.object("The CompanyEnrich account capability summary.", {
    lists: s.boolean("Whether company-list features are enabled for the account."),
    previews: s.boolean("Whether preview endpoints are enabled for the account."),
    companySearchLimit: s.integer("The maximum number of companies allowed in synchronous company searches."),
    companySearchAsyncLimit: s.integer("The maximum number of companies allowed in async company searches."),
    peopleSearchLimit: s.integer("The maximum number of people allowed in people-search workflows."),
    searchTermLimit: s.integer("The maximum number of search terms accepted by the account."),
  }),
});

const companySchema = s.looseObject("A normalized CompanyEnrich company profile.", {
  id: s.nonEmptyString("The unique CompanyEnrich company identifier."),
  name: s.string("The company display name."),
  domain: s.string("The primary company domain."),
  website: s.string("The website URL returned by CompanyEnrich."),
  type: companyTypeSchema,
  industry: s.string("The primary company industry label."),
  industries: s.stringArray("The industries associated with the company."),
  categories: s.array("The ordered company categories returned by CompanyEnrich.", companyCategorySchema),
  employees: companyEmployeesSchema,
  revenue: companyRevenueSchema,
  description: s.string("The company description."),
  keywords: s.stringArray("The search keywords associated with the company."),
  technologies: s.stringArray("The technology names associated with the company."),
  subsidiaries: s.stringArray("The subsidiary company names returned by CompanyEnrich."),
  founded_year: s.integer("The year when the company was founded."),
  naics_codes: s.stringArray("The NAICS codes associated with the company."),
  location: looseObjectSchema,
  financial: looseObjectSchema,
  socials: looseObjectSchema,
  page_rank: s.number("The CompanyEnrich page-rank score."),
  workforce: looseObjectSchema,
  logo_url: s.string("The logo URL returned by CompanyEnrich."),
  seo_description: s.string("The SEO description returned by CompanyEnrich."),
  updated_at: s.string("The last-update timestamp returned by CompanyEnrich."),
});

const stringArray = (description: string): JsonSchema => s.stringArray(description, { minItems: 1 });
const integerArray = (description: string): JsonSchema =>
  s.array(description, s.integer("One integer filter value."), { minItems: 1 });
const enumArray = (description: string, itemSchema: JsonSchema): JsonSchema =>
  s.array(description, itemSchema, { minItems: 1 });

const commonSearchInputFields = {
  query: s.string("The search query applied to company names and domains.", { minLength: 1, maxLength: 250 }),
  semanticQuery: s.string("The semantic search query applied by CompanyEnrich.", { minLength: 1, maxLength: 500 }),
  semanticWeight: s.number("The semantic ranking weight between 0 and 1.", { minimum: 0, maximum: 1 }),
  lists: stringArray("The CompanyEnrich list identifiers used to filter results."),
  type: enumArray("The company types to include.", companyTypeSchema),
  category: enumArray("The company categories to include.", companyCategorySchema),
  employees: enumArray("The employee-count ranges to include.", companyEmployeesSchema),
  revenue: enumArray("The revenue ranges to include.", companyRevenueSchema),
  fundingRounds: enumArray("The funding rounds to include.", companyFundingRoundSchema),
  require: enumArray("The CompanyEnrich feature requirements that must exist.", featureRequirementSchema),
  regions: stringArray("The region identifiers to include."),
  countries: stringArray("The country codes to include."),
  states: integerArray("The state identifiers to include."),
  cities: integerArray("The city identifiers to include."),
  naicsCode: integerArray("The NAICS codes to include."),
  keywords: stringArray("The company keywords to include."),
  technologies: stringArray("The technologies to include."),
  categoryOperator: s.nonEmptyString("The official operator applied to category filters."),
  keywordsOperator: s.nonEmptyString("The official operator applied to keyword filters."),
  technologiesOperator: s.nonEmptyString("The official operator applied to technology filters."),
  exclude: looseObjectSchema,
  foundedYear: looseObjectSchema,
  fundingAmount: looseObjectSchema,
  fundingYear: looseObjectSchema,
  workforceGrowth: looseObjectSchema,
  workforceSize: s.array("The official workforce-size filters.", looseObjectSchema, { minItems: 1 }),
};
const commonSearchOptional = Object.keys(commonSearchInputFields);

const searchCompaniesInputSchema = s.object(
  "The input payload for a CompanyEnrich company search request.",
  {
    page: s.integer("The 1-indexed result page to request.", { minimum: 1 }),
    pageSize: s.integer("The number of results to request per page.", { minimum: 1, maximum: 100 }),
    expand: enumArray("The expandable response fields to request for each company.", expandFieldSchema),
    ...commonSearchInputFields,
  },
  { optional: ["page", "pageSize", "expand", ...commonSearchOptional] },
);

const countCompaniesInputSchema = s.object(
  "The input payload for counting CompanyEnrich search results.",
  commonSearchInputFields,
  { optional: commonSearchOptional },
);

const similarMetadataSchema = s.nullable(
  s.object("The similarity metadata returned by CompanyEnrich.", {
    scores: s.record(
      "The similarity score keyed by CompanyEnrich company identifier.",
      s.number("A similarity score."),
    ),
  }),
);

export const companyenrichActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the authenticated CompanyEnrich user summary and remaining capabilities.",
    inputSchema: s.object("The input payload for loading the current CompanyEnrich user.", {}),
    outputSchema: s.object("The normalized output payload for the current CompanyEnrich user.", {
      user: userSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "enrich_company_by_domain",
    description: "Enrich a company profile from its primary domain.",
    inputSchema: s.object(
      "The input payload for enriching a company by domain.",
      {
        domain: s.nonEmptyString("The company domain to enrich."),
        expand: enumArray("The expandable company fields to request.", expandFieldSchema),
      },
      { optional: ["expand"] },
    ),
    outputSchema: s.object("The normalized output payload for a CompanyEnrich domain enrichment.", {
      company: companySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "enrich_company_by_properties",
    description: "Enrich a company profile from identifying company properties.",
    inputSchema: s.object(
      "The input payload for enriching a company by identifying properties. Provide at least one identifying property.",
      {
        name: s.nonEmptyString("The company name used for enrichment."),
        linkedinUrl: s.nonEmptyString("The LinkedIn company URL used for enrichment."),
        linkedinId: s.nonEmptyString("The LinkedIn company identifier used for enrichment."),
        twitterUrl: s.nonEmptyString("The Twitter profile URL used for enrichment."),
        facebookUrl: s.nonEmptyString("The Facebook profile URL used for enrichment."),
        instagramUrl: s.nonEmptyString("The Instagram profile URL used for enrichment."),
        youTubeUrl: s.nonEmptyString("The YouTube profile URL used for enrichment."),
        expand: enumArray("The expandable company fields to request.", expandFieldSchema),
      },
      {
        optional: [
          "name",
          "linkedinUrl",
          "linkedinId",
          "twitterUrl",
          "facebookUrl",
          "instagramUrl",
          "youTubeUrl",
          "expand",
        ],
      },
    ),
    outputSchema: s.object("The normalized output payload for a CompanyEnrich property enrichment.", {
      company: companySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_companies",
    description: "Search CompanyEnrich companies with page-based filters and pagination.",
    inputSchema: searchCompaniesInputSchema,
    outputSchema: s.object("The normalized output payload for a CompanyEnrich company search.", {
      companies: s.array("The companies returned by the search.", companySchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "count_companies",
    description: "Count how many companies match the provided CompanyEnrich search filters.",
    inputSchema: countCompaniesInputSchema,
    outputSchema: s.object("The normalized output payload for a CompanyEnrich company count.", {
      count: s.integer("The number of matching companies."),
    }),
  }),
  defineProviderAction(service, {
    name: "find_similar_companies",
    description: "Find companies similar to one or more seed company domains.",
    inputSchema: s.object(
      "The input payload for finding similar companies in CompanyEnrich.",
      {
        domains: s.stringArray("The seed company domains used to find similar companies.", {
          minItems: 1,
          maxItems: 10,
        }),
        page: s.integer("The 1-indexed result page to request.", { minimum: 1 }),
        pageSize: s.integer("The number of similar companies to request per page.", { minimum: 1, maximum: 100 }),
        similarityWeight: s.number("The similarity weighting factor between -1 and 1.", { minimum: -1, maximum: 1 }),
        expand: enumArray("The expandable company fields to request.", expandFieldSchema),
        ...commonSearchInputFields,
      },
      { optional: ["page", "pageSize", "similarityWeight", "expand", ...commonSearchOptional] },
    ),
    outputSchema: s.object("The normalized output payload for a CompanyEnrich similar-company search.", {
      companies: s.array("The similar companies returned by CompanyEnrich.", companySchema),
      metadata: similarMetadataSchema,
      pagination: paginationSchema,
    }),
  }),
];
