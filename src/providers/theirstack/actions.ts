import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "theirstack" as const;

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const nonEmptyStringArray = (description: string) =>
  s.array(description, nonEmptyString("One non-empty string filter value."));
const nonNegativeInteger = (description: string) => s.integer(description, { minimum: 0 });
const positiveInteger = (description: string) => s.integer(description, { minimum: 1 });

const pageSchema = nonNegativeInteger("Page number for page-based pagination. TheirStack pages start at 0.");
const offsetSchema = nonNegativeInteger("Number of results to skip for offset-based pagination.");
const limitSchema = positiveInteger("Number of results per page.");
const includeTotalResultsSchema = s.boolean(
  "When true, TheirStack calculates total result counts. This can slow down large searches.",
);

const metadataSchema = s.looseObject("Pagination and count metadata returned by TheirStack.", {
  total_results: s.nullable(s.integer("Total number of results when requested.")),
  total_companies: s.nullable(s.integer("Total number of companies when requested.")),
  truncated_results: s.nullable(s.integer("Number of results omitted because the account lacked enough credits.")),
  truncated_companies: s.nullable(s.integer("Number of companies omitted because the account lacked enough credits.")),
});

const upstreamRecordSchema = s.looseObject(
  "A TheirStack record. The object keeps the upstream fields returned by the API.",
);

const sortDirectionSchema = s.boolean("Whether to sort the field in descending order.");

const jobSortSchema = s.object(
  "Sort option for TheirStack job search results.",
  {
    field: s.stringEnum("Field to sort job search results by.", [
      "date_posted",
      "discovered_at",
      "salary",
      "job_title",
      "company",
      "num_jobs",
    ]),
    desc: sortDirectionSchema,
  },
  { optional: ["desc"] },
);

const companySortSchema = s.object(
  "Sort option for TheirStack company search results.",
  {
    field: s.stringEnum("Field to sort company search results by.", [
      "relevance",
      "name",
      "num_jobs",
      "num_jobs_last_30_days",
      "num_jobs_found",
      "employee_count",
      "alexa_ranking",
      "founded_year",
      "annual_revenue_usd",
      "total_funding_usd",
      "last_funding_round_date",
      "confidence",
      "jobs",
      "first_date_found",
    ]),
    desc: sortDirectionSchema,
  },
  { optional: ["desc"] },
);

const technographicSortSchema = s.object(
  "Sort option for TheirStack technographic results.",
  {
    field: s.stringEnum("Field to sort technographic results by.", [
      "jobs",
      "jobs_last_7_days",
      "jobs_last_30_days",
      "jobs_last_180_days",
      "last_date_found",
      "first_date_found",
      "relative_occurrence_within_category",
      "theirstack_score",
      "confidence",
    ]),
    desc: sortDirectionSchema,
  },
  { optional: ["desc"] },
);

const jobSearchInputSchema = s.object(
  "Search TheirStack job postings by company, title, keyword, location, and posting date filters.",
  {
    company_domain_or: nonEmptyStringArray(
      "Only return jobs from companies matching any of these domains, URLs, or email domains.",
    ),
    company_linkedin_url_or: nonEmptyStringArray(
      "Only return jobs from companies whose LinkedIn URL matches any of these values.",
    ),
    company_name_or: nonEmptyStringArray(
      "Only return jobs from companies whose name exactly matches any of these case-sensitive values.",
    ),
    job_title_or: nonEmptyStringArray("Keyword-based patterns to match job titles, case-insensitively."),
    job_description_contains_or: nonEmptyStringArray(
      "Whole words to search for in job descriptions. Matching is case-insensitive unless the word is uppercase.",
    ),
    job_country_code_or: nonEmptyStringArray("Two-letter ISO country codes for job locations."),
    posted_at_max_age_days: s.integer("Maximum age in days for job posting dates. Use 0 for jobs posted today.", {
      minimum: 0,
    }),
    posted_at_gte: s.date("Only return jobs published on or after this YYYY-MM-DD date."),
    posted_at_lte: s.date("Only return jobs published on or before this YYYY-MM-DD date."),
    remote: s.boolean("When true, only show remote jobs. When false, only show non-remote jobs."),
    limit: limitSchema,
    page: pageSchema,
    offset: offsetSchema,
    include_total_results: includeTotalResultsSchema,
    order_by: s.array("Sort options for job search results.", jobSortSchema),
  },
  {
    optional: [
      "company_domain_or",
      "company_linkedin_url_or",
      "company_name_or",
      "job_title_or",
      "job_description_contains_or",
      "job_country_code_or",
      "posted_at_max_age_days",
      "posted_at_gte",
      "posted_at_lte",
      "remote",
      "limit",
      "page",
      "offset",
      "include_total_results",
      "order_by",
    ],
  },
);

const companySearchInputSchema = s.object(
  "Search TheirStack companies by firmographic, hiring, and technographic filters.",
  {
    company_domain_or: nonEmptyStringArray(
      "Only return companies matching any of these domains, URLs, or email domains.",
    ),
    company_linkedin_url_or: nonEmptyStringArray(
      "Only return companies whose LinkedIn URL matches any of these values.",
    ),
    company_name_or: nonEmptyStringArray(
      "Only return companies whose name exactly matches any of these case-sensitive values.",
    ),
    company_name_partial_match_or: nonEmptyStringArray(
      "Return companies whose name contains any of these substrings, case-insensitively.",
    ),
    company_country_code_or: nonEmptyStringArray(
      "Only return companies headquartered in any of these ISO2 country codes.",
    ),
    industry_or: nonEmptyStringArray("Industry names to match case-insensitively."),
    company_keyword_slug_or: nonEmptyStringArray(
      "Keyword or buying-intent slugs mentioned by matching companies in their jobs.",
    ),
    company_technology_slug_or: nonEmptyStringArray("Technology slugs mentioned by matching companies in their jobs."),
    limit: limitSchema,
    page: pageSchema,
    offset: offsetSchema,
    include_total_results: includeTotalResultsSchema,
    order_by: s.array("Sort options for company search results.", companySortSchema),
  },
  {
    optional: [
      "company_domain_or",
      "company_linkedin_url_or",
      "company_name_or",
      "company_name_partial_match_or",
      "company_country_code_or",
      "industry_or",
      "company_keyword_slug_or",
      "company_technology_slug_or",
      "limit",
      "page",
      "offset",
      "include_total_results",
      "order_by",
    ],
  },
);

const technographicsInputSchema = s.object(
  "List technologies and buying-intent keywords TheirStack detected for a company.",
  {
    company_domain: nonEmptyString("Company domain, URL, or email domain to identify the company."),
    company_name: nonEmptyString("Exact case-sensitive company name to identify the company."),
    company_linkedin_url: nonEmptyString("LinkedIn company URL to identify the company."),
    keyword_slug_or: nonEmptyStringArray(
      "Only return technologies or buying-intent topics matching any of these keyword slugs.",
    ),
    keyword_category_slug_or: nonEmptyStringArray("Only return keywords from any of these keyword category slugs."),
    confidence_or: s.array(
      "Only return technologies with any of these confidence levels.",
      s.stringEnum("TheirStack confidence level.", ["low", "medium", "high"]),
    ),
    min_jobs: nonNegativeInteger("Minimum number of jobs found for each technology or keyword."),
    max_jobs: nonNegativeInteger("Maximum number of jobs found for each technology or keyword."),
    first_date_found_gte: s.date("Only return technologies first found on or after this YYYY-MM-DD date."),
    first_date_found_lte: s.date("Only return technologies first found on or before this YYYY-MM-DD date."),
    last_date_found_gte: s.date("Only return technologies last found on or after this YYYY-MM-DD date."),
    last_date_found_lte: s.date("Only return technologies last found on or before this YYYY-MM-DD date."),
    limit: limitSchema,
    page: pageSchema,
    offset: offsetSchema,
    include_total_results: includeTotalResultsSchema,
    order_by: s.array("Sort options for technographic results.", technographicSortSchema),
  },
  {
    optional: [
      "company_domain",
      "company_name",
      "company_linkedin_url",
      "keyword_slug_or",
      "keyword_category_slug_or",
      "confidence_or",
      "min_jobs",
      "max_jobs",
      "first_date_found_gte",
      "first_date_found_lte",
      "last_date_found_gte",
      "last_date_found_lte",
      "limit",
      "page",
      "offset",
      "include_total_results",
      "order_by",
    ],
  },
);

const searchJobsOutputSchema = s.object("TheirStack job search response.", {
  jobs: s.array("Job records returned by TheirStack.", upstreamRecordSchema),
  metadata: metadataSchema,
});

const searchCompaniesOutputSchema = s.object("TheirStack company search response.", {
  companies: s.array("Company records returned by TheirStack.", upstreamRecordSchema),
  metadata: metadataSchema,
});

const listTechnographicsOutputSchema = s.object("TheirStack technographic lookup response.", {
  technologies: s.array("Technology and buying-intent records returned by TheirStack.", upstreamRecordSchema),
  metadata: metadataSchema,
});

const getCreditBalanceInputSchema = s.object("No input is required to retrieve TheirStack credit balance.", {});

const getCreditBalanceOutputSchema = s.object(
  "TheirStack credit balance for the authenticated team.",
  {
    ui_credits: nonNegativeInteger("Number of UI credits available to the team."),
    used_ui_credits: nonNegativeInteger("Number of UI credits used in the current billing cycle."),
    api_credits: nonNegativeInteger("Number of API credits available to the team."),
    used_api_credits: nonNegativeInteger("Number of API credits used in the current billing cycle."),
    earliest_expiration: s.nullable(s.dateTime("Earliest expiration timestamp among invoices with remaining credits.")),
  },
  { optional: ["earliest_expiration"] },
);

export const theirstackActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_jobs",
    description: "Search TheirStack job postings with company, title, keyword, location, and posting date filters.",
    requiredScopes: [],
    inputSchema: jobSearchInputSchema,
    outputSchema: searchJobsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_companies",
    description: "Search TheirStack companies by firmographic, hiring, and technographic filters.",
    requiredScopes: [],
    inputSchema: companySearchInputSchema,
    outputSchema: searchCompaniesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_technographics",
    description: "List technologies and buying-intent keywords detected by TheirStack for a company.",
    requiredScopes: [],
    inputSchema: technographicsInputSchema,
    outputSchema: listTechnographicsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_credit_balance",
    description: "Retrieve the authenticated TheirStack team's current credit balance.",
    requiredScopes: [],
    inputSchema: getCreditBalanceInputSchema,
    outputSchema: getCreditBalanceOutputSchema,
  }),
];
