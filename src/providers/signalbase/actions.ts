import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "signalbase";

const datePresetValues = [
  "today",
  "yesterday",
  "last_7d",
  "last_14d",
  "last_30d",
  "last_60d",
  "last_90d",
  "last_6m",
  "last_1y",
  "last_2y",
  "this_week",
  "this_month",
  "this_quarter",
  "this_year",
  "last_week",
  "last_month",
  "last_quarter",
  "last_year",
];

const sortOrderValues = ["asc", "desc"];
const verificationStatusValues = ["verified", "unverified", "pending"];
const investorTypeValues = [
  "vc",
  "angel",
  "pe",
  "corporate",
  "government",
  "accelerator",
  "family_office",
  "hedge_fund",
  "crowdfunding",
];

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const csvString = (description: string) => nonEmptyString(description);

const paginationInputFields = {
  page: s.integer("Page number for pagination. Signalbase defaults to 1.", { minimum: 1 }),
  limit: s.integer("Number of results per page. Signalbase documents a maximum of 100.", {
    minimum: 1,
    maximum: 100,
  }),
};

const dateFilterFields = {
  dateFrom: s.date("Filter signals from this date in YYYY-MM-DD format."),
  dateTo: s.date("Filter signals up to this date in YYYY-MM-DD format."),
  date_preset: s.stringEnum(
    "Relative date shorthand. Signalbase applies it before dateFrom and dateTo when provided.",
    datePresetValues,
  ),
};

const commonCompanyFilterFields = {
  countries: csvString("Comma-separated country codes to filter by, such as US,GB,DE."),
  categories: csvString("Pipe-separated company categories or industries to filter by."),
  subcategories: csvString("Comma-separated Signalbase subcategory IDs to filter by."),
  search: nonEmptyString("Free-text search across documented fields for this endpoint."),
  industry: csvString("Comma-separated exact industry names to filter by."),
  company_name: nonEmptyString("Partial company-name search string."),
};

const companyRangeFields = {
  employee_count_min: s.integer("Minimum company employee count."),
  employee_count_max: s.integer("Maximum company employee count."),
  founded_year_min: s.integer("Minimum company founded year."),
  founded_year_max: s.integer("Maximum company founded year."),
};

const moneyRangeFields = {
  amount_min: s.integer("Minimum transaction amount in USD cents."),
  amount_max: s.integer("Maximum transaction amount in USD cents."),
};

const countField = {
  count: s.stringEnum(
    'Set to "true" to return only pagination metadata with an empty data array. Signalbase documents this mode as zero-credit.',
    ["true"],
  ),
};

const companyQueryInputSchema = s.object(
  "Query parameters for browsing and searching Signalbase companies.",
  {
    ...paginationInputFields,
    search: commonCompanyFilterFields.search,
    countries: commonCompanyFilterFields.countries,
    industry: commonCompanyFilterFields.industry,
    ...companyRangeFields,
    sort_by: s.stringEnum("Field used to sort company results.", [
      "name",
      "employee_count",
      "founded_year",
      "created_at",
    ]),
    sort_order: s.stringEnum("Sort direction for company results.", sortOrderValues),
    ...countField,
  },
  {
    optional: [
      "page",
      "limit",
      "search",
      "countries",
      "industry",
      "employee_count_min",
      "employee_count_max",
      "founded_year_min",
      "founded_year_max",
      "sort_by",
      "sort_order",
      "count",
    ],
  },
);

const fundingQueryInputSchema = s.object(
  "Query parameters for Signalbase funding signals.",
  {
    ...paginationInputFields,
    ...dateFilterFields,
    ...commonCompanyFilterFields,
    round: csvString("Comma-separated funding round types to filter by."),
    round_flavor: s.stringEnum("Funding round flavor to filter by.", ["bridge", "extension", "secondary"]),
    ...moneyRangeFields,
    currency: nonEmptyString("Currency symbol filter, such as $, EUR, or GBP."),
    verification_status: s.stringEnum("Verification status to filter by.", verificationStatusValues),
    investor_name: nonEmptyString("Partial investor-name search string."),
    ...companyRangeFields,
    sort_by: s.stringEnum("Field used to sort funding signal results.", [
      "occurred_at",
      "discovered_at",
      "amount",
      "employee_count",
      "founded_year",
    ]),
    sort_order: s.stringEnum("Sort direction for funding signal results.", sortOrderValues),
    ...countField,
  },
  {
    optional: [
      "page",
      "limit",
      "dateFrom",
      "dateTo",
      "date_preset",
      "countries",
      "categories",
      "subcategories",
      "search",
      "industry",
      "company_name",
      "round",
      "round_flavor",
      "amount_min",
      "amount_max",
      "currency",
      "verification_status",
      "investor_name",
      "employee_count_min",
      "employee_count_max",
      "founded_year_min",
      "founded_year_max",
      "sort_by",
      "sort_order",
      "count",
    ],
  },
);

const acquisitionQueryInputSchema = s.object(
  "Query parameters for Signalbase acquisition signals.",
  {
    ...paginationInputFields,
    ...dateFilterFields,
    ...commonCompanyFilterFields,
    acquiring_company: nonEmptyString("Partial acquiring-company search string."),
    ...moneyRangeFields,
    currency: nonEmptyString("Currency symbol filter, such as $, EUR, or GBP."),
    verification_status: s.stringEnum("Verification status to filter by.", verificationStatusValues),
    ...companyRangeFields,
    sort_by: s.stringEnum("Field used to sort acquisition signal results.", [
      "occurred_at",
      "discovered_at",
      "amount",
      "employee_count",
    ]),
    sort_order: s.stringEnum("Sort direction for acquisition signal results.", sortOrderValues),
    ...countField,
  },
  {
    optional: [
      "page",
      "limit",
      "dateFrom",
      "dateTo",
      "date_preset",
      "countries",
      "categories",
      "subcategories",
      "search",
      "industry",
      "company_name",
      "acquiring_company",
      "amount_min",
      "amount_max",
      "currency",
      "verification_status",
      "employee_count_min",
      "employee_count_max",
      "founded_year_min",
      "founded_year_max",
      "sort_by",
      "sort_order",
      "count",
    ],
  },
);

const hiringQueryInputSchema = s.object(
  "Query parameters for Signalbase hiring signals.",
  {
    ...paginationInputFields,
    ...dateFilterFields,
    search: commonCompanyFilterFields.search,
    countries: commonCompanyFilterFields.countries,
    states: csvString("Comma-separated US state codes to filter by."),
    city: nonEmptyString("Free-text search on hiring signal city, location, and region."),
    categories: commonCompanyFilterFields.categories,
    subcategories: commonCompanyFilterFields.subcategories,
    positions: csvString("Comma-separated role or position filters."),
    departments: csvString("Comma-separated department filters."),
    seniorities: csvString("Comma-separated seniority filters."),
    team_size: csvString("Comma-separated team size ranges to filter by."),
    applicants: csvString("Comma-separated applicant count ranges to filter by."),
    sort_by: s.stringEnum("Field used to sort hiring signal results.", [
      "date_posted",
      "created_at",
      "title",
      "company_name",
      "location",
    ]),
    sort_order: s.stringEnum("Sort direction for hiring signal results.", sortOrderValues),
    ...countField,
  },
  {
    optional: [
      "page",
      "limit",
      "dateFrom",
      "dateTo",
      "date_preset",
      "search",
      "countries",
      "states",
      "city",
      "categories",
      "subcategories",
      "positions",
      "departments",
      "seniorities",
      "team_size",
      "applicants",
      "sort_by",
      "sort_order",
      "count",
    ],
  },
);

const jobChangeQueryInputSchema = s.object(
  "Query parameters for Signalbase job-change signals.",
  {
    ...paginationInputFields,
    ...dateFilterFields,
    search: commonCompanyFilterFields.search,
    countries: commonCompanyFilterFields.countries,
    city: nonEmptyString("Free-text search on person city and person location."),
    personLinkedinUrl: s.url("Exact LinkedIn profile URL of the person."),
    companyLinkedinUrl: s.url("Exact LinkedIn company page URL."),
    person_name: nonEmptyString("Partial person-name search string."),
    company_name: commonCompanyFilterFields.company_name,
    new_role: nonEmptyString("Partial new-role or job-title search string."),
    source: s.stringEnum("Exact job-change signal source.", ["linkedin", "press_release", "other"]),
    keyword: nonEmptyString("Partial keyword tag search string."),
    positions: csvString("Comma-separated role or position filters."),
    departments: csvString("Comma-separated department filters."),
    seniorities: csvString("Comma-separated seniority filters."),
    sort_by: s.stringEnum("Field used to sort job-change signal results.", [
      "occurred_at",
      "discovered_at",
      "person_name",
      "company_name",
    ]),
    sort_order: s.stringEnum("Sort direction for job-change signal results.", sortOrderValues),
    ...countField,
  },
  {
    optional: [
      "page",
      "limit",
      "dateFrom",
      "dateTo",
      "date_preset",
      "search",
      "countries",
      "city",
      "personLinkedinUrl",
      "companyLinkedinUrl",
      "person_name",
      "company_name",
      "new_role",
      "source",
      "keyword",
      "positions",
      "departments",
      "seniorities",
      "sort_by",
      "sort_order",
      "count",
    ],
  },
);

const investorQueryInputSchema = s.object(
  "Query parameters for Signalbase investor data.",
  {
    ...paginationInputFields,
    ...dateFilterFields,
    search: nonEmptyString("Free-text search across investor name and type."),
    countries: commonCompanyFilterFields.countries,
    type: s.stringEnum("Investor type to filter by.", investorTypeValues),
    categories: csvString("Legacy pipe-separated investor type filter."),
    headquarters: nonEmptyString("Partial headquarters location search string."),
    ticket_size_min: s.integer("Minimum ticket size in USD."),
    ticket_size_max: s.integer("Maximum ticket size in USD."),
    sort_by: s.stringEnum("Field used to sort investor results.", [
      "name",
      "created_at",
      "ticket_size_min",
      "ticket_size_max",
    ]),
    sort_order: s.stringEnum("Sort direction for investor results.", sortOrderValues),
    ...countField,
  },
  {
    optional: [
      "page",
      "limit",
      "dateFrom",
      "dateTo",
      "date_preset",
      "search",
      "countries",
      "type",
      "categories",
      "headquarters",
      "ticket_size_min",
      "ticket_size_max",
      "sort_by",
      "sort_order",
      "count",
    ],
  },
);

const paginationOutputSchema = s.object("Pagination metadata returned by Signalbase.", {
  currentPage: s.integer("Current page number.", { minimum: 1 }),
  totalPages: s.integer("Total number of available pages.", { minimum: 0 }),
  totalCount: s.integer("Total number of records matching the query.", { minimum: 0 }),
  hasNextPage: s.boolean("Whether a next page is available."),
  hasPreviousPage: s.boolean("Whether a previous page is available."),
});

const metaOutputSchema = s.looseRequiredObject(
  "Usage metadata returned by Signalbase.",
  {
    endpoint: s.string("Signalbase endpoint identifier."),
    creditsUsed: s.number("Number of Signalbase API credits consumed by this request.", {
      minimum: 0,
    }),
    creditsRemaining: s.number("Number of Signalbase API credits remaining after this request.", {
      minimum: 0,
    }),
  },
  { optional: ["creditsRemaining"] },
);

const listOutputSchema = (description: string, itemDescription: string) =>
  s.looseRequiredObject(description, {
    success: s.boolean("Whether Signalbase reported the request as successful."),
    data: s.array(itemDescription, s.looseObject("One Signalbase result record.")),
    pagination: paginationOutputSchema,
    meta: metaOutputSchema,
  });

export const signalbaseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_companies",
    operationType: "read",
    description: "Browse and search Signalbase company profiles with pagination, filters, and sorting.",
    requiredScopes: [],
    inputSchema: companyQueryInputSchema,
    outputSchema: listOutputSchema("Signalbase companies list response.", "Company records returned by Signalbase."),
  }),
  defineProviderAction(service, {
    name: "list_funding_signals",
    operationType: "read",
    description: "Fetch Signalbase funding signals with date, company, investor, amount, and sorting filters.",
    requiredScopes: [],
    inputSchema: fundingQueryInputSchema,
    outputSchema: listOutputSchema(
      "Signalbase funding signals response.",
      "Funding signal records returned by Signalbase.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_acquisition_signals",
    operationType: "read",
    description: "Fetch Signalbase acquisition signals with date, company, acquirer, amount, and sorting filters.",
    requiredScopes: [],
    inputSchema: acquisitionQueryInputSchema,
    outputSchema: listOutputSchema(
      "Signalbase acquisition signals response.",
      "Acquisition signal records returned by Signalbase.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_hiring_signals",
    operationType: "read",
    description: "Fetch Signalbase hiring signals with role, department, seniority, location, and sorting filters.",
    requiredScopes: [],
    inputSchema: hiringQueryInputSchema,
    outputSchema: listOutputSchema(
      "Signalbase hiring signals response.",
      "Hiring signal records returned by Signalbase.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_job_change_signals",
    operationType: "read",
    description: "Fetch Signalbase job-change signals with person, role, company, LinkedIn, and sorting filters.",
    requiredScopes: [],
    inputSchema: jobChangeQueryInputSchema,
    outputSchema: listOutputSchema(
      "Signalbase job-change signals response.",
      "Job-change signal records returned by Signalbase.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_investors",
    operationType: "read",
    description: "Fetch Signalbase investor data with type, location, ticket-size, and sorting filters.",
    requiredScopes: [],
    inputSchema: investorQueryInputSchema,
    outputSchema: listOutputSchema("Signalbase investors response.", "Investor records returned by Signalbase."),
  }),
];

export type SignalbaseActionName =
  | "list_companies"
  | "list_funding_signals"
  | "list_acquisition_signals"
  | "list_hiring_signals"
  | "list_job_change_signals"
  | "list_investors";
