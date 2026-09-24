import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aisa";
const apolloOutput = s.looseObject("The Apollo global-database result returned by AIsa.");

const personIdentity = s.requireAnyProperty(
  s.object(
    "Known identifiers used to match one person in Apollo's global database.",
    {
      firstName: s.string("The person's first name, used with lastName."),
      lastName: s.string("The person's last name, used with firstName."),
      name: s.string("The person's full name."),
      email: s.string("The person's known email address.", { format: "email" }),
      hashedEmail: s.string("An MD5 or SHA-256 hash of the person's email address."),
      organizationName: s.string("The name of the person's employer."),
      domain: s.string("The employer's domain without www."),
      personId: s.string("A known Apollo person ID."),
      linkedinUrl: s.string("The person's LinkedIn profile URL.", { format: "uri" }),
    },
    {
      optional: [
        "firstName",
        "lastName",
        "name",
        "email",
        "hashedEmail",
        "organizationName",
        "domain",
        "personId",
        "linkedinUrl",
      ],
    },
  ),
  ["firstName", "lastName", "name", "email", "hashedEmail", "organizationName", "domain", "personId", "linkedinUrl"],
);

export const enrichApolloPersonAction: ActionDefinition = defineProviderAction(service, {
  name: "enrich_apollo_person",
  operationType: "read",
  description: "Enrich one person from known identifiers using Apollo's global database.",
  requiredScopes: [],
  inputSchema: personIdentity,
  outputSchema: apolloOutput,
});

export const enrichApolloPeopleAction: ActionDefinition = defineProviderAction(service, {
  name: "enrich_apollo_people",
  operationType: "read",
  description: "Enrich up to ten people from known identifiers in one Apollo request.",
  requiredScopes: [],
  inputSchema: s.requiredObject("People to enrich from Apollo's global database.", {
    people: s.array("The people to enrich.", personIdentity, { minItems: 1, maxItems: 10 }),
  }),
  outputSchema: apolloOutput,
});

export const enrichApolloOrganizationAction: ActionDefinition = defineProviderAction(service, {
  name: "enrich_apollo_organization",
  operationType: "read",
  description: "Enrich one organization from its domain using Apollo's global database.",
  requiredScopes: [],
  inputSchema: s.requiredObject("A company domain for Apollo organization enrichment.", {
    domain: s.string("The company domain without www."),
  }),
  outputSchema: apolloOutput,
});

export const enrichApolloOrganizationsAction: ActionDefinition = defineProviderAction(service, {
  name: "enrich_apollo_organizations",
  operationType: "read",
  description: "Enrich multiple organizations from their domains in one Apollo request.",
  requiredScopes: [],
  inputSchema: s.requiredObject("Company domains for bulk Apollo organization enrichment.", {
    domains: s.array("The company domains to enrich.", s.string("A company domain without www."), {
      minItems: 1,
      maxItems: 10,
      uniqueItems: true,
    }),
  }),
  outputSchema: apolloOutput,
});

export const searchApolloPeopleAction: ActionDefinition = defineProviderAction(service, {
  name: "search_apollo_people",
  operationType: "read",
  description: "Search Apollo's global people database by role, location, employer, and seniority.",
  requiredScopes: [],
  inputSchema: s.object(
    "Filters and pagination for searching Apollo's global people database.",
    {
      titles: s.array("The current job titles to include.", s.string("A job title."), {
        uniqueItems: true,
      }),
      includeSimilarTitles: s.boolean("Whether Apollo may include similar job titles."),
      keywords: s.string("Free-text keywords used to filter people."),
      personLocations: s.array("The person locations to include.", s.string("A location."), {
        uniqueItems: true,
      }),
      seniorities: s.array("The seniority levels to include.", s.string("A seniority level."), {
        uniqueItems: true,
      }),
      organizationLocations: s.array("The employer locations to include.", s.string("An employer location."), {
        uniqueItems: true,
      }),
      organizationDomains: s.array("The employer domains to include.", s.string("An employer domain."), {
        uniqueItems: true,
      }),
      organizationIds: s.array("The Apollo organization IDs to include.", s.string("An Apollo organization ID."), {
        uniqueItems: true,
      }),
      employeeRanges: s.array("The employer headcount ranges to include.", s.string("An Apollo headcount range."), {
        uniqueItems: true,
      }),
      page: s.integer("The one-based result page.", { minimum: 1 }),
      perPage: s.integer("The maximum results per page.", { minimum: 1, maximum: 100 }),
    },
    {
      optional: [
        "titles",
        "includeSimilarTitles",
        "keywords",
        "personLocations",
        "seniorities",
        "organizationLocations",
        "organizationDomains",
        "organizationIds",
        "employeeRanges",
        "page",
        "perPage",
      ],
    },
  ),
  outputSchema: apolloOutput,
});

export const searchApolloOrganizationsAction: ActionDefinition = defineProviderAction(service, {
  name: "search_apollo_organizations",
  operationType: "read",
  description: "Search Apollo's global organization database by domain, location, size, and name.",
  requiredScopes: [],
  inputSchema: s.object(
    "Filters and pagination for searching Apollo's global organization database.",
    {
      domains: s.array("The company domains to include.", s.string("A company domain."), {
        uniqueItems: true,
      }),
      employeeRanges: s.array("The company headcount ranges to include.", s.string("An Apollo headcount range."), {
        uniqueItems: true,
      }),
      locations: s.array("The company locations to include.", s.string("A location."), {
        uniqueItems: true,
      }),
      excludedLocations: s.array("The company locations to exclude.", s.string("A location."), {
        uniqueItems: true,
      }),
      name: s.string("Text to match against company names."),
      organizationIds: s.array("The Apollo organization IDs to include.", s.string("An Apollo organization ID."), {
        uniqueItems: true,
      }),
      page: s.integer("The one-based result page.", { minimum: 1 }),
      perPage: s.integer("The maximum results per page.", { minimum: 1, maximum: 100 }),
    },
    {
      optional: [
        "domains",
        "employeeRanges",
        "locations",
        "excludedLocations",
        "name",
        "organizationIds",
        "page",
        "perPage",
      ],
    },
  ),
  outputSchema: apolloOutput,
});

export const getApolloOrganizationAction: ActionDefinition = defineProviderAction(service, {
  name: "get_apollo_organization",
  operationType: "read",
  description: "Get one complete organization record from Apollo's global database.",
  requiredScopes: [],
  inputSchema: s.requiredObject("An Apollo organization ID.", {
    organizationId: s.string("The Apollo organization ID to retrieve."),
  }),
  outputSchema: apolloOutput,
});

export const getApolloJobPostingsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_apollo_job_postings",
  operationType: "read",
  description: "List live job postings for an Apollo organization.",
  requiredScopes: [],
  inputSchema: s.object(
    "An Apollo organization ID and pagination for live job postings.",
    {
      organizationId: s.string("The Apollo organization ID whose jobs should be returned."),
      page: s.integer("The one-based result page.", { minimum: 1 }),
      perPage: s.integer("The maximum job postings per page.", { minimum: 1, maximum: 100 }),
    },
    { optional: ["page", "perPage"] },
  ),
  outputSchema: apolloOutput,
});

export const searchApolloCompanyNewsAction: ActionDefinition = defineProviderAction(service, {
  name: "search_apollo_company_news",
  operationType: "read",
  description: "Search Apollo news articles for known organizations and event categories.",
  requiredScopes: [],
  inputSchema: s.object(
    "Organization IDs, news categories, date range, and pagination.",
    {
      organizationIds: s.array(
        "The Apollo organization IDs whose news should be searched.",
        s.string("An Apollo organization ID."),
        { minItems: 1, uniqueItems: true },
      ),
      categories: s.array("The Apollo news categories to include.", s.string("A news category."), {
        uniqueItems: true,
      }),
      publishedFrom: s.string("Return articles published on or after this date.", {
        format: "date",
      }),
      publishedTo: s.string("Return articles published on or before this date.", {
        format: "date",
      }),
      page: s.integer("The one-based result page.", { minimum: 1 }),
      perPage: s.integer("The maximum articles per page.", { minimum: 1, maximum: 100 }),
    },
    { optional: ["categories", "publishedFrom", "publishedTo", "page", "perPage"] },
  ),
  outputSchema: apolloOutput,
});

export const apolloActions: ActionDefinition[] = [
  enrichApolloPersonAction,
  enrichApolloPeopleAction,
  enrichApolloOrganizationAction,
  enrichApolloOrganizationsAction,
  searchApolloPeopleAction,
  searchApolloOrganizationsAction,
  getApolloOrganizationAction,
  getApolloJobPostingsAction,
  searchApolloCompanyNewsAction,
];
