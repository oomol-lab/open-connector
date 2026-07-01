import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "getprospect";

const isoDateSchema = s.string("The ISO 8601 date or date-time string returned by GetProspect.");
const looseObjectSchema = s.looseObject("An arbitrary JSON object returned by GetProspect.");
const looseArraySchema = s.array("A list of arbitrary JSON objects returned by GetProspect.", looseObjectSchema);

const findEmailInputSchema = s.object(
  "The input payload for the GetProspect email finder request.",
  {
    full_name: s.nonEmptyString("The contact's full name. Use instead of first_name plus last_name when available."),
    first_name: s.nonEmptyString("The contact's first name. Required with last_name when full_name is not provided."),
    last_name: s.nonEmptyString("The contact's last name. Required with first_name when full_name is not provided."),
    domain: s.nonEmptyString("The company domain. GetProspect recommends this instead of company for better results."),
    company: s.nonEmptyString("The company name. Use as a fallback when the company domain is not available."),
  },
  { optional: ["full_name", "first_name", "last_name", "domain", "company"] },
);

const verifyEmailInputSchema = s.object("The input payload for the GetProspect email verifier.", {
  email: s.email("The email address you want to verify."),
});

const lookupEmailInputSchema = s.object("The input payload for the GetProspect email lookup.", {
  email: s.email("The email address you want to look up."),
});

const pageSizeSchema = s.integer("How many records to return per page.", {
  minimum: 1,
  maximum: 500,
});
const pageNumberSchema = s.positiveInteger("The 1-based page number used to paginate through the results.");
const searchOrderSchema = s.stringEnum("The sort order to apply to the search results.", ["ASC", "DESC"]);

const searchTextFilterSchema = s.object(
  "A text filter object accepted by GetProspect search endpoints.",
  {
    contains: s.nonEmptyString("Match values containing this text."),
    equals: s.nonEmptyString("Match values exactly equal to this text."),
    startsWith: s.nonEmptyString("Match values starting with this text."),
    in: s.array("Match any of these text values.", s.nonEmptyString("A text value."), {
      minItems: 1,
    }),
  },
  { optional: ["contains", "equals", "startsWith", "in"] },
);

const searchIndustryFilterSchema = s.object(
  "An industry filter object accepted by GetProspect search endpoints.",
  {
    equals: s.nonEmptyString("Match the exact industry name."),
    in: s.array("Match any of these industries.", s.nonEmptyString("An industry name."), {
      minItems: 1,
    }),
  },
  { optional: ["equals", "in"] },
);

const searchCountFilterSchema = s.object(
  "A count-range filter object accepted by GetProspect search endpoints.",
  {
    equals: s.nonEmptyString("Match the exact predefined employee-count bucket."),
    in: s.array(
      "Match any of these predefined employee-count buckets.",
      s.nonEmptyString("An employee-count bucket."),
      { minItems: 1 },
    ),
  },
  { optional: ["equals", "in"] },
);

const searchLeadsBodySchema = s.object(
  "The body payload for the GetProspect lead search endpoint.",
  {
    contactName: searchTextFilterSchema,
    companyName: searchTextFilterSchema,
    jobTitle: searchTextFilterSchema,
    seniority: searchTextFilterSchema,
    domain: searchTextFilterSchema,
    industry: searchIndustryFilterSchema,
    location: searchTextFilterSchema,
    keywords: searchTextFilterSchema,
    headquarters: searchTextFilterSchema,
    employees: searchCountFilterSchema,
    lastUpdated: s.date("Filter results updated on the given full-date value."),
    email: s.stringEnum("Limit results to records with email coverage.", ["all", "all_contacts"]),
  },
  {
    optional: [
      "contactName",
      "companyName",
      "jobTitle",
      "seniority",
      "domain",
      "industry",
      "location",
      "keywords",
      "headquarters",
      "employees",
      "lastUpdated",
      "email",
    ],
  },
);

const searchCompaniesBodySchema = s.object(
  "The body payload for the GetProspect company search endpoint.",
  {
    name: searchTextFilterSchema,
    domain: searchTextFilterSchema,
    industry: searchIndustryFilterSchema,
    location: searchTextFilterSchema,
    keywords: searchTextFilterSchema,
    lastUpdated: s.date("Filter results updated on the given full-date value."),
    employees: searchCountFilterSchema,
  },
  {
    optional: ["name", "domain", "industry", "location", "keywords", "lastUpdated", "employees"],
  },
);

const searchLeadsInputSchema = s.object(
  "The input payload for the GetProspect lead search request.",
  {
    pageSize: pageSizeSchema,
    pageNumber: pageNumberSchema,
    sort: s.stringEnum("The field used to sort lead search results.", [
      "id",
      "firstName",
      "lastName",
      "contactInfo",
      "summary",
      "geolocation.region",
      "geolocation.timezone",
      "geolocation.location",
      "geolocation.countryCode",
    ]),
    order: searchOrderSchema,
    filters: searchLeadsBodySchema,
  },
  { optional: ["pageSize", "pageNumber", "sort", "order", "filters"] },
);

const searchCompaniesInputSchema = s.object(
  "The input payload for the GetProspect company search request.",
  {
    pageSize: pageSizeSchema,
    pageNumber: pageNumberSchema,
    sort: s.stringEnum("The field used to sort company search results.", [
      "id",
      "name",
      "domain",
      "size",
      "headquarters",
      "description",
      "postalCode",
      "location.region",
      "location.timezone",
      "location.location",
      "location.countryCode",
    ]),
    order: searchOrderSchema,
    filters: searchCompaniesBodySchema,
  },
  { optional: ["pageSize", "pageNumber", "sort", "order", "filters"] },
);

const findEmailOutputSchema = s.object(
  "The GetProspect email finder result.",
  {
    email: s.nonEmptyString("The business email address found by GetProspect."),
    status: s.nonEmptyString("The upstream GetProspect status for this match."),
    account: s.nullable(s.string("The local-part of the email address, when available.")),
    domain: s.nullable(s.string("The company domain associated with the match, when available.")),
    full_name: s.nullable(s.string("The contact full name returned by GetProspect, when available.")),
    first_name: s.nullable(s.string("The contact first name returned by GetProspect, when available.")),
    last_name: s.nullable(s.string("The contact last name returned by GetProspect, when available.")),
    linkedin_url: s.nullable(s.string("The LinkedIn profile URL returned by GetProspect, when available.")),
    raw: looseObjectSchema,
  },
  {
    optional: ["account", "domain", "full_name", "first_name", "last_name", "linkedin_url"],
  },
);

const verifyEmailOutputSchema = s.object(
  "The GetProspect email verification result.",
  {
    email: s.email("The verified email address."),
    status: s.nonEmptyString("The deliverability status returned by GetProspect."),
    account: s.nonEmptyString("The account part of the verified email address."),
    domain: s.nonEmptyString("The domain part of the verified email address."),
    domain_status: s.nonEmptyString("The domain-level verification status."),
    smtp_provider: s.nonEmptyString("The SMTP provider detected by GetProspect."),
    free_email: s.nullable(s.boolean("Whether GetProspect considers the address a free email.")),
    raw: looseObjectSchema,
  },
  { optional: ["free_email"] },
);

const lookupEmailOutputSchema = s.object(
  "The GetProspect email lookup result.",
  {
    email: s.email("The queried email address."),
    status: s.nonEmptyString("The email status returned by GetProspect."),
    free_email: s.nullable(s.boolean("Whether GetProspect considers the address a free email.")),
    full_name: s.nullable(s.string("The contact full name returned by GetProspect, when available.")),
    first_name: s.nullable(s.string("The contact first name returned by GetProspect, when available.")),
    last_name: s.nullable(s.string("The contact last name returned by GetProspect, when available.")),
    linkedin: looseArraySchema,
    companies: looseArraySchema,
    raw: looseObjectSchema,
  },
  {
    optional: ["free_email", "full_name", "first_name", "last_name", "linkedin", "companies"],
  },
);

const paginatedMetaSchema = s.object("The pagination metadata returned by GetProspect search endpoints.", {
  totalPages: s.integer("The total number of result pages."),
  totalItems: s.integer("The total number of matching items."),
  savedItems: s.integer("The number of saved items reported by GetProspect."),
  pageSize: s.integer("The number of items returned per page."),
  page: s.integer("The current result page number."),
  sort: s.object("The sort configuration applied by GetProspect.", {
    column: s.nonEmptyString("The column name used for sorting."),
    order: searchOrderSchema,
  }),
  additionalInfo: looseObjectSchema,
});

const searchLeadItemSchema = s.object(
  "A normalized GetProspect lead search result.",
  {
    getProspectId: s.nonEmptyString("The GetProspect identifier for the contact."),
    firstName: s.nullable(s.string("The contact first name, when available.")),
    lastName: s.nullable(s.string("The contact last name, when available.")),
    contactInfo: s.nullable(s.string("The contact info summary returned by GetProspect.")),
    summary: s.nullable(s.string("The contact summary returned by GetProspect.")),
    companies: looseArraySchema,
    lastUpdatedAt: isoDateSchema,
    linkedin: looseArraySchema,
    geolocation: looseObjectSchema,
    raw: looseObjectSchema,
  },
  { optional: ["firstName", "lastName", "contactInfo", "summary"] },
);

const searchCompanyItemSchema = s.object(
  "A normalized GetProspect company search result.",
  {
    getProspectId: s.nonEmptyString("The GetProspect identifier for the company."),
    name: s.nonEmptyString("The company name."),
    domain: s.nonEmptyString("The company domain."),
    description: s.nullable(s.string("The company description, when available.")),
    headquarters: s.nullable(s.string("The company headquarters, when available.")),
    industry: s.nullable(s.string("The company industry, when available.")),
    postalCode: s.nullable(s.string("The company postal code, when available.")),
    size: s.nullable(s.number("The company size value returned by GetProspect.")),
    linkedin: looseArraySchema,
    location: looseObjectSchema,
    technologies: looseArraySchema,
    raw: looseObjectSchema,
  },
  { optional: ["description", "headquarters", "industry", "postalCode", "size"] },
);

const searchLeadsOutputSchema = s.object("The GetProspect lead search response.", {
  data: s.array("The matched lead search results.", searchLeadItemSchema),
  meta: paginatedMetaSchema,
});

const searchCompaniesOutputSchema = s.object("The GetProspect company search response.", {
  data: s.array("The matched company search results.", searchCompanyItemSchema),
  meta: paginatedMetaSchema,
});

export const getprospectActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "find_email",
    description: "Find a prospect's business email address from a person name and a company domain or company name.",
    requiredScopes: [],
    inputSchema: findEmailInputSchema,
    outputSchema: findEmailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "verify_email",
    description: "Verify a single email address and return its deliverability status from GetProspect.",
    requiredScopes: [],
    inputSchema: verifyEmailInputSchema,
    outputSchema: verifyEmailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "lookup_email",
    description:
      "Look up a saved GetProspect contact profile by email address and return the normalized contact details.",
    requiredScopes: [],
    inputSchema: lookupEmailInputSchema,
    outputSchema: lookupEmailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_leads",
    description: "Search GetProspect's B2B lead database with structured lead filters and paginated results.",
    requiredScopes: [],
    inputSchema: searchLeadsInputSchema,
    outputSchema: searchLeadsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_companies",
    description: "Search GetProspect's company database with structured company filters and paginated results.",
    requiredScopes: [],
    inputSchema: searchCompaniesInputSchema,
    outputSchema: searchCompaniesOutputSchema,
  }),
];

export type GetProspectActionName =
  | "find_email"
  | "verify_email"
  | "lookup_email"
  | "search_leads"
  | "search_companies";
