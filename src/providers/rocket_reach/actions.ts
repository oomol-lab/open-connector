import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "rocket_reach";

const lookupTypeValues = ["standard", "premium", "premium (feeds disabled)", "bulk", "phone", "enrich"];
const emptyInputSchema = s.object("The input payload for this action.", {});
const looseObjectSchema = s.looseObject("An arbitrary JSON object returned by RocketReach.");
const looseObjectArraySchema = s.array("A list of arbitrary JSON objects returned by RocketReach.", looseObjectSchema);
const pageField = s.integer("The 1-based page number to request.", { minimum: 1 });
const limitField = s.integer("How many results to request per page.", { minimum: 1, maximum: 100 });
const idField = s.positiveInteger("The RocketReach numeric identifier.");
const companyIdField = s.anyOf("The RocketReach company identifier.", [
  s.nonEmptyString("The RocketReach company identifier or company domain."),
  s.positiveInteger("The RocketReach company numeric identifier."),
]);
const companyNameField = s.nonEmptyString("The company name to look up.");
const companyDomainField = s.nonEmptyString("The bare company domain to look up.");

const companySchema = s.object("A normalized RocketReach company profile.", {
  companyId: s.nullableInteger("The RocketReach company identifier, or null when it is not available."),
  name: s.nullableString("The company display name, or null when it is not available."),
  domain: s.nullableString("The primary company domain, or null when it is not available."),
  emailDomain: s.nullableString("The company email domain, or null when it is not available."),
  websiteDomain: s.nullableString("The company website domain, or null when it is not available."),
  rrProfileUrl: s.nullableString("The RocketReach web profile URL, or null when it is not available."),
  yearFounded: s.nullableString("The company founded date string returned by RocketReach, or null."),
  numEmployees: s.nullableInteger("The employee count returned by RocketReach, or null when it is not available."),
  revenue: s.nullableNumber("The revenue value returned by RocketReach, or null."),
  industry: s.nullableString("The primary industry returned by RocketReach, or null when it is not available."),
  industryKeywords: s.array(
    "The industry keywords returned by RocketReach.",
    s.string("An industry keyword associated with the company."),
  ),
  description: s.nullableString("The company description returned by RocketReach, or null when it is not available."),
  links: s.nullable(looseObjectSchema),
  address: s.nullable(looseObjectSchema),
  raw: looseObjectSchema,
});

const companyLookupInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for a RocketReach company lookup request.",
    {
      id: idField,
      company_id: companyIdField,
      name: companyNameField,
      domain: companyDomainField,
    },
    { optional: ["id", "company_id", "name", "domain"] },
  ),
  anyOf: [{ required: ["id"] }, { required: ["company_id"] }, { required: ["name"] }, { required: ["domain"] }],
};

const searchPeopleInputSchema: JsonSchema = s.object(
  "The input payload for a RocketReach people search request.",
  {
    query: s.looseObject(
      "The official RocketReach people-search facet object, such as { name: ['Ada Lovelace'] } or { current_employer: ['OpenAI'] }.",
    ),
    page: pageField,
    limit: limitField,
    options: s.looseObject("Additional RocketReach search options merged into the top-level request body."),
  },
  { optional: ["page", "limit", "options"] },
);

const lookupPersonInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for a RocketReach person lookup request.",
    {
      id: idField,
      email: s.email("The email address of the person to look up."),
      name: s.nonEmptyString("The name of the person to look up."),
      linkedin_url: s.nonEmptyString("The LinkedIn profile URL of the person to look up."),
      current_employer: s.nonEmptyString("The current employer to pair with a person-name lookup."),
      lookup_type: s.stringEnum("The RocketReach lookup type to request.", lookupTypeValues),
      webhook_id: s.positiveInteger("The RocketReach webhook identifier to associate with the request."),
      block: s.boolean("Whether RocketReach should block until the lookup completes when supported."),
    },
    { optional: ["id", "email", "name", "linkedin_url", "current_employer", "lookup_type", "webhook_id", "block"] },
  ),
  anyOf: [{ required: ["id"] }, { required: ["email"] }, { required: ["name"] }, { required: ["linkedin_url"] }],
};

const lookupPersonAndCompanyInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for a RocketReach person-and-company lookup request.",
    {
      id: idField,
      email: s.email("The email address of the person to look up."),
      name: s.nonEmptyString("The name of the person to look up."),
      title: s.nonEmptyString("The job title to pair with the person lookup."),
      npi_number: s.positiveInteger("The NPI number to use for a healthcare-focused lookup."),
      lookup_type: s.stringEnum("The RocketReach lookup type to request.", lookupTypeValues),
      linkedin_url: s.nonEmptyString("The LinkedIn profile URL of the person to look up."),
      current_employer: s.nonEmptyString("The current employer to pair with the person lookup."),
      webhook_id: s.positiveInteger("The RocketReach webhook identifier to associate with the request."),
      return_cached_emails: s.boolean("Whether RocketReach should return cached emails when they are available."),
      block: s.boolean("Whether RocketReach should block until the lookup completes when supported."),
    },
    {
      optional: [
        "id",
        "email",
        "name",
        "title",
        "npi_number",
        "lookup_type",
        "linkedin_url",
        "current_employer",
        "webhook_id",
        "return_cached_emails",
        "block",
      ],
    },
  ),
  anyOf: [
    { required: ["id"] },
    { required: ["email"] },
    { required: ["name"] },
    { required: ["linkedin_url"] },
    { required: ["npi_number"] },
  ],
};

const checkPersonStatusInputSchema = s.object("The input payload for a RocketReach person status request.", {
  ids: s.array(
    "The person identifiers to check.",
    s.anyOf("A RocketReach person identifier.", [
      s.nonEmptyString("A RocketReach person identifier."),
      s.positiveInteger("A RocketReach person numeric identifier."),
    ]),
    { minItems: 1 },
  ),
});

const searchCompaniesInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for the RocketReach company search compatibility helper.",
    {
      query: s.nonEmptyString("The exact company name to look up for compatibility."),
      name: companyNameField,
      domain: companyDomainField,
      id: idField,
      page: pageField,
      limit: limitField,
    },
    { optional: ["query", "name", "domain", "id", "page", "limit"] },
  ),
  anyOf: [{ required: ["query"] }, { required: ["name"] }, { required: ["domain"] }, { required: ["id"] }],
};

export const rocketReachActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve the authenticated RocketReach account profile.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      account: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_people",
    description: "Search RocketReach people with the official structured query object and pagination controls.",
    inputSchema: searchPeopleInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      profiles: looseObjectArraySchema,
      pagination: s.nullable(looseObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "lookup_person",
    description:
      "Look up a RocketReach person profile by id, email, name, or LinkedIn URL through the official lookup endpoint.",
    inputSchema: lookupPersonInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      person: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "lookup_person_and_company",
    description:
      "Look up a RocketReach person profile and return any company profile embedded in the official lookup response.",
    inputSchema: lookupPersonAndCompanyInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      person: looseObjectSchema,
      company: s.nullable(companySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "check_person_status",
    description: "Check the current status of one or more RocketReach person lookups.",
    inputSchema: checkPersonStatusInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      people: looseObjectArraySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_companies",
    description:
      "Look up a company by exact name, domain, or id and return it as a single-item company list for search-style compatibility.",
    inputSchema: searchCompaniesInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      companies: s.array("The exact-match company results.", companySchema),
      exactMatchOnly: s.boolean("Whether this helper is limited to exact-match company lookups."),
    }),
  }),
  defineProviderAction(service, {
    name: "lookup_company",
    description: "Look up a RocketReach company profile by id, name, or domain.",
    inputSchema: companyLookupInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      company: companySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_size",
    description:
      "Retrieve the employee-count data exposed on a RocketReach company profile by looking up the target company first.",
    inputSchema: companyLookupInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      company: companySchema,
      numEmployees: s.nullableInteger("The employee count returned by RocketReach, or null when it is not available."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_funding",
    description:
      "Retrieve the revenue and funding-investor data exposed on a RocketReach company profile by looking up the target company first.",
    inputSchema: companyLookupInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      company: companySchema,
      revenue: s.nullableNumber("The revenue value returned by RocketReach, or null."),
      fundingInvestors: s.array(
        "The funding investors returned by RocketReach.",
        s.unknown("A funding investor item returned by RocketReach."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "get_company_industries",
    description:
      "Retrieve the industry and industry-keyword data exposed on a RocketReach company profile by looking up the target company first.",
    inputSchema: companyLookupInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      company: companySchema,
      primaryIndustry: s.nullableString(
        "The primary industry returned by RocketReach, or null when it is not available.",
      ),
      industryKeywords: s.array(
        "The industry keywords returned by RocketReach.",
        s.string("An industry keyword associated with the company."),
      ),
    }),
  }),
];
