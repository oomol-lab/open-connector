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
const enrichApolloPersonAction = defineProviderAction(service, {
  name: "enrich_apollo_person",
  operationType: "read",
  description: "Enrich one person from known identifiers using Apollo's global database.",
  requiredScopes: [],
  inputSchema: personIdentity,
  outputSchema: apolloOutput,
});
const enrichApolloPeopleAction = defineProviderAction(service, {
  name: "enrich_apollo_people",
  operationType: "read",
  description: "Enrich up to ten people from known identifiers in one Apollo request.",
  requiredScopes: [],
  inputSchema: s.object(
    "People to enrich from Apollo's global database.",
    {
      people: s.array("The people to enrich.", personIdentity, { minItems: 1, maxItems: 10 }),
    },
    { optional: [] },
  ),
  outputSchema: apolloOutput,
});
const enrichApolloOrganizationAction = defineProviderAction(service, {
  name: "enrich_apollo_organization",
  operationType: "read",
  description: "Enrich one organization from its domain using Apollo's global database.",
  requiredScopes: [],
  inputSchema: s.object(
    "A company domain for Apollo organization enrichment.",
    {
      domain: s.string("The company domain without www."),
    },
    { optional: [] },
  ),
  outputSchema: apolloOutput,
});
const enrichApolloOrganizationsAction = defineProviderAction(service, {
  name: "enrich_apollo_organizations",
  operationType: "read",
  description: "Enrich multiple organizations from their domains in one Apollo request.",
  requiredScopes: [],
  inputSchema: s.object(
    "Company domains for bulk Apollo organization enrichment.",
    {
      domains: s.array("The company domains to enrich.", s.string("A company domain without www."), {
        minItems: 1,
        maxItems: 10,
        uniqueItems: true,
      }),
    },
    { optional: [] },
  ),
  outputSchema: apolloOutput,
});
const searchApolloPeopleAction = defineProviderAction(service, {
  name: "search_apollo_people",
  operationType: "read",
  description: "Search Apollo's global people database by role, location, employer, and seniority.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    properties: {
      titles: {
        type: "array",
        items: {
          type: "string",
          description: "A job title.",
        },
        uniqueItems: true,
        description: "The current job titles to include.",
      },
      includeSimilarTitles: {
        type: "boolean",
        description: "Whether Apollo may include similar job titles.",
      },
      keywords: {
        type: "string",
        description: "Free-text keywords used to filter people.",
      },
      personLocations: {
        type: "array",
        items: {
          type: "string",
          description: "A location.",
        },
        uniqueItems: true,
        description: "The person locations to include.",
      },
      seniorities: {
        type: "array",
        items: {
          type: "string",
          description: "A seniority level.",
        },
        uniqueItems: true,
        description: "The seniority levels to include.",
      },
      organizationLocations: {
        type: "array",
        items: {
          type: "string",
          description: "An employer location.",
        },
        uniqueItems: true,
        description: "The employer locations to include.",
      },
      organizationDomains: {
        type: "array",
        items: {
          type: "string",
          description: "An employer domain.",
        },
        uniqueItems: true,
        description: "The employer domains to include.",
      },
      organizationIds: {
        type: "array",
        items: {
          type: "string",
          description: "An Apollo organization ID.",
        },
        uniqueItems: true,
        description: "The Apollo organization IDs to include.",
      },
      employeeRanges: {
        type: "array",
        items: {
          type: "string",
          description: "An Apollo headcount range.",
        },
        uniqueItems: true,
        description: "The employer headcount ranges to include.",
      },
      page: {
        type: "integer",
        minimum: 1,
        description: "The one-based result page.",
      },
      perPage: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        description: "The maximum results per page.",
      },
      contactEmailStatus: {
        items: {
          type: "string",
          description: "One value of the contact_email_status[] filter.",
        },
        type: "array",
        description:
          "The email statuses for the people you want to find. You can add multiple statuses to expand your search. The statuses you can search include: verified unverified likely to engage unavailable",
      },
      currentlyNotUsingAnyOfTechnologyUids: {
        items: {
          type: "string",
          description: "One value of the currently_not_using_any_of_technology_uids[] filter.",
        },
        type: "array",
        description:
          "Exclude people from your search based on any of the technologies their current employer uses. Apollo supports filtering by 1,500+ technologies. Apollo calculates technologies data from multiple sources. This data is updated regularly. Check out the full list of supported technologies by downloading this CSV file . Use underscores (_) to replace spaces and periods for the technologies listed in the CSV file. Examples: salesforce; google_analytics; wordpress_org",
      },
      currentlyUsingAllOfTechnologyUids: {
        items: {
          type: "string",
          description: "One value of the currently_using_all_of_technology_uids[] filter.",
        },
        type: "array",
        description:
          "Find people based on all of the technologies their current employer uses. Apollo supports filtering by 1,500+ technologies. Apollo calculates technologies data from multiple sources. This data is updated regularly. Check out the full list of supported technologies by downloading this CSV file . Use underscores (_) to replace spaces and periods for the technologies listed in the CSV file. Examples: salesforce; google_analytics; wordpress_org",
      },
      currentlyUsingAnyOfTechnologyUids: {
        items: {
          type: "string",
          description: "One value of the currently_using_any_of_technology_uids[] filter.",
        },
        type: "array",
        description:
          "Find people based on any of the technologies their current employer uses. Apollo supports filtering by 1,500+ technologies. Apollo calculates technologies data from multiple sources. This data is updated regularly. Check out the full list of supported technologies by downloading this CSV file . Use underscores (_) to replace spaces and periods for the technologies listed in the CSV file. Examples: salesforce; google_analytics; wordpress_org",
      },
      organizationJobLocations: {
        items: {
          type: "string",
          description: "One value of the organization_job_locations[] filter.",
        },
        type: "array",
        description:
          "The locations of the jobs being actively recruited by the person's employer. Examples: atlanta; japan",
      },
      organizationJobPostedAtRangeMax: {
        type: "string",
        description:
          "The latest date when jobs were posted by the person's current employer. Use this parameter in combination with organization_job_posted_at_range[min] to set a date range for when jobs posted. Example: 2025-09-25",
      },
      organizationJobPostedAtRangeMin: {
        type: "string",
        description:
          "The earliest date when jobs were posted by the person's current employer. Use this parameter in combination with organization_job_posted_at_range[max] to set a date range for when jobs posted. Example: 2025-07-25",
      },
      organizationNumJobsRangeMax: {
        type: "integer",
        description:
          "The maximum number of job postings active at the person's current employer. Use this parameter in combination with organization_num_jobs_range[min] to set a job postings range. Examples: 50; 500",
      },
      organizationNumJobsRangeMin: {
        type: "integer",
        description:
          "The minimum number of job postings active at the person's current employer. Use this parameter in combination with organization_num_jobs_range[max] to set a job postings range. Examples: 50; 500",
      },
      qOrganizationJobTitles: {
        items: {
          type: "string",
          description: "One value of the q_organization_job_titles[] filter.",
        },
        type: "array",
        description:
          "The job titles that are listed in active job postings at the person's current employer. Examples: sales manager; research analyst",
      },
      revenueRangeMax: {
        type: "integer",
        description:
          "The maximum revenue the person's current employer generates. Use this parameter in combination with revenue_range[min] to set a revenue range. Do not enter currency symbols, commas, or decimal points in the figure. Examples: 500000; 1500000",
      },
      revenueRangeMin: {
        type: "integer",
        description:
          "The minimum revenue the person's current employer generates. Use this parameter in combination with revenue_range[max] to set a revenue range. Do not enter currency symbols, commas, or decimal points in the figure. Examples: 500000; 1500000",
      },
    },
    additionalProperties: false,
    description: "Filters and pagination for searching Apollo's global people database.",
  },
  outputSchema: apolloOutput,
});
const searchApolloOrganizationsAction = defineProviderAction(service, {
  name: "search_apollo_organizations",
  operationType: "read",
  description: "Search Apollo's global organization database by domain, location, size, and name.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    properties: {
      domains: {
        type: "array",
        items: {
          type: "string",
          description: "A company domain.",
        },
        uniqueItems: true,
        description: "The company domains to include.",
      },
      employeeRanges: {
        type: "array",
        items: {
          type: "string",
          description: "An Apollo headcount range.",
        },
        uniqueItems: true,
        description: "The company headcount ranges to include.",
      },
      locations: {
        type: "array",
        items: {
          type: "string",
          description: "A location.",
        },
        uniqueItems: true,
        description: "The company locations to include.",
      },
      excludedLocations: {
        type: "array",
        items: {
          type: "string",
          description: "A location.",
        },
        uniqueItems: true,
        description: "The company locations to exclude.",
      },
      name: {
        type: "string",
        description: "Text to match against company names.",
      },
      organizationIds: {
        type: "array",
        items: {
          type: "string",
          description: "An Apollo organization ID.",
        },
        uniqueItems: true,
        description: "The Apollo organization IDs to include.",
      },
      page: {
        type: "integer",
        minimum: 1,
        description: "The one-based result page.",
      },
      perPage: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        description: "The maximum results per page.",
      },
      currentlyUsingAnyOfTechnologyUids: {
        items: {
          type: "string",
          description: "One value of the currently_using_any_of_technology_uids[] filter.",
        },
        type: "array",
        description:
          "Find organizations based on the technologies they currently use. Apollo supports filtering by 1,500+ technologies. Apollo calculates technologies data from multiple sources. This data is updated regularly. Check out the full list of supported technologies by downloading this CSV file . Use underscores (_) to replace spaces and periods for the technologies listed in the CSV file. Examples: salesforce; google_analytics; wordpress_org",
      },
      latestFundingAmountRangeMax: {
        type: "integer",
        description:
          "The maximium amount the company received with its most recent funding round. Use this parameter in combination with latest_funding_amount_range[min] to set a monetary range for the company's most recent funding round. Do not enter currency symbols, commas, or decimal points in the figure. Examples: 5000000; 15000000",
      },
      latestFundingAmountRangeMin: {
        type: "integer",
        description:
          "The minimum amount the company received with its most recent funding round. Use this parameter in combination with latest_funding_amount_range[max] to set a monetary range for the company's most recent funding round. Do not enter currency symbols, commas, or decimal points in the figure. Examples: 5000000; 15000000",
      },
      latestFundingDateRangeMax: {
        type: "string",
        description:
          "The latest date when the company received its most recent funding round. Use this parameter in combination with latest_funding_date_range[min] to set a date range for when the company received its most recent funding round. Example: 2025-09-25",
      },
      latestFundingDateRangeMin: {
        type: "string",
        description:
          "The earliest date when the company received its most recent funding round. Use this parameter in combination with latest_funding_date_range[max] to set a date range for when the company received its most recent funding round. Example: 2025-07-25",
      },
      organizationJobLocations: {
        items: {
          type: "string",
          description: "One value of the organization_job_locations[] filter.",
        },
        type: "array",
        description: "The locations of the jobs being actively recruited by the company. Examples: atlanta; japan",
      },
      organizationJobPostedAtRangeMax: {
        type: "string",
        description:
          "The latest date when jobs were posted by the company. Use this parameter in combination with organization_job_posted_at_range[min] to set a date range for when jobs posted. Example: 2025-09-25",
      },
      organizationJobPostedAtRangeMin: {
        type: "string",
        description:
          "The earliest date when jobs were posted by the company. Use this parameter in combination with organization_job_posted_at_range[max] to set a date range for when jobs posted. Example: 2025-07-25",
      },
      organizationNumJobsRangeMax: {
        type: "integer",
        description:
          "The maximum number of job postings active at the company. Use this parameter in combination with organization_num_jobs_range[min] to set a job postings range. Examples: 50; 500",
      },
      organizationNumJobsRangeMin: {
        type: "integer",
        description:
          "The minimum number of job postings active at the company. Use this parameter in combination with organization_num_jobs_range[max] to set a job postings range. Examples: 50; 500",
      },
      qOrganizationJobTitles: {
        items: {
          type: "string",
          description: "One value of the q_organization_job_titles[] filter.",
        },
        type: "array",
        description:
          "The job titles that are listed in active job postings at the company. Examples: sales manager; research analyst",
      },
      qOrganizationKeywordTags: {
        items: {
          type: "string",
          description: "One value of the q_organization_keyword_tags[] filter.",
        },
        type: "array",
        description:
          "Filter search results based on keywords associated with companies. For example, you can enter mining as a value to return only companies that have an association with the mining industry. Examples: mining; sales strategy; consulting",
      },
      revenueRangeMax: {
        type: "integer",
        description:
          "Search for organizations based on their revenue. Use this parameter to set the upper range of organization revenue. Use the revenue_range[min] parameter to set the lower range of revenue. Do not enter currency symbols, commas, or decimal points in the figure. Example: 50000000",
      },
      revenueRangeMin: {
        type: "integer",
        description:
          "Search for organizations based on their revenue. Use this parameter to set the lower range of organization revenue. Use the revenue_range[max] parameter to set the upper range of revenue. Do not enter currency symbols, commas, or decimal points in the figure. Example: 300000",
      },
      totalFundingRangeMax: {
        type: "integer",
        description:
          "The maximum amount the company received during all of its funding rounds combined. Use this parameter in combination with total_funding_range[min] to set a monetary range for all of the company's funding rounds. Do not enter currency symbols, commas, or decimal points in the figure. Examples: 50000000; 350000000",
      },
      totalFundingRangeMin: {
        type: "integer",
        description:
          "The minimum amount the company received during all of its funding rounds combined. Use this parameter in combination with total_funding_range[max] to set a monetary range for all of the company's funding rounds. Do not enter currency symbols, commas, or decimal points in the figure. Examples: 50000000; 350000000",
      },
    },
    additionalProperties: false,
    description: "Filters and pagination for searching Apollo's global organization database.",
  },
  outputSchema: apolloOutput,
});
const getApolloOrganizationAction = defineProviderAction(service, {
  name: "get_apollo_organization",
  operationType: "read",
  description: "Get one complete organization record from Apollo's global database.",
  requiredScopes: [],
  inputSchema: s.object(
    "An Apollo organization ID.",
    {
      organizationId: s.string("The Apollo organization ID to retrieve."),
    },
    { optional: [] },
  ),
  outputSchema: apolloOutput,
});
const getApolloJobPostingsAction = defineProviderAction(service, {
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
const searchApolloCompanyNewsAction = defineProviderAction(service, {
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

export const apolloActions: readonly ActionDefinition[] = [
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
