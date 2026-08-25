import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "leadiq" as const;

const trimmedString = (description: string) => s.nonEmptyString(description);

const planSchema = s.looseRequiredObject("A LeadIQ subscription plan.", {
  name: s.string("The plan name."),
  product: s.string("The LeadIQ product covered by the plan."),
  status: s.string("The current plan status."),
  nextBillingPeriod: s.nullable(s.string("The next billing period date or timestamp.")),
});

const creditPlanSchema = s.looseRequiredObject("A LeadIQ credit-bearing plan.", {
  name: s.string("The plan name."),
  product: s.string("The LeadIQ product covered by the plan."),
  status: s.string("The current plan status."),
  nextBillingPeriod: s.nullable(s.string("The next billing period date or timestamp.")),
  available: s.number("The number of credits currently available."),
  used: s.number("The number of credits used in the current billing period."),
});

const companyIdentifierSchema = s.object(
  "Company information used to identify a person.",
  {
    name: trimmedString("The company name."),
    domain: trimmedString("The company domain, such as example.com."),
  },
  { optional: ["name", "domain"] },
);

const personSchema = s.looseRequiredObject("A person returned by LeadIQ.", {
  id: s.string("The LeadIQ person ID."),
  name: s.looseRequiredObject("The person's name.", {
    fullName: s.nullable(s.string("The person's full name.")),
    first: s.nullable(s.string("The person's first name.")),
    last: s.nullable(s.string("The person's last name.")),
  }),
  currentPositions: s.array(
    "The person's current positions.",
    s.looseRequiredObject("A current position.", {
      title: s.nullable(s.string("The current job title.")),
      seniority: s.nullable(s.string("The current job seniority.")),
      function: s.nullable(s.string("The current job function.")),
      companyInfo: s.nullable(
        s.looseRequiredObject("The company associated with this position.", {
          id: s.string("The LeadIQ company ID."),
          name: s.string("The company name."),
          domain: s.string("The company domain."),
        }),
      ),
      emails: s.array(
        "Work email addresses associated with this position.",
        s.looseRequiredObject("A work email address.", {
          value: s.string("The email address."),
          status: s.string("The email verification status."),
          type: s.string("The email type."),
        }),
      ),
      phones: s.array(
        "Work phone numbers associated with this position.",
        s.looseRequiredObject("A work phone number.", {
          value: s.string("The phone number."),
          type: s.string("The phone type."),
          verificationStatus: s.string("The phone verification status."),
        }),
      ),
    }),
  ),
  linkedin: s.nullable(
    s.looseRequiredObject("The person's LinkedIn profile.", {
      linkedinUrl: s.string("The LinkedIn profile URL."),
    }),
  ),
});

const companySchema = s.looseRequiredObject("A company returned by LeadIQ.", {
  id: s.string("The LeadIQ company ID."),
  name: s.string("The company name."),
  domain: s.string("The company domain."),
  industry: s.string("The company's industry."),
  numberOfEmployees: s.integer("The company's employee count."),
  locationInfo: s.looseRequiredObject("The company's location.", {
    city: s.string("The city."),
    areaLevel1: s.string("The state, province, or first-level administrative area."),
    country: s.string("The country."),
  }),
  fundingInfo: s.looseRequiredObject("The company's funding information.", {
    fundingTotalUsd: s.number("The company's total funding in US dollars."),
    lastFundingType: s.string("The most recent funding type."),
  }),
  technologies: s.array(
    "Technologies used by the company.",
    s.looseRequiredObject("A technology used by the company.", {
      name: s.string("The technology name."),
      category: s.string("The technology category."),
    }),
  ),
});

const locationFilterSchema = s.object(
  "A geographic filter for advanced people search.",
  {
    city: trimmedString("The city name."),
    areaLevel1: trimmedString("The state, province, or first-level administrative area."),
    country: trimmedString("The country name."),
  },
  { optional: ["city", "areaLevel1", "country"] },
);

const advancedSearchInputSchema = s.object(
  "Documented filters and pagination for LeadIQ advanced people search.",
  {
    roles: s.array("Professional roles to include.", trimmedString("A professional role."), {
      minItems: 1,
    }),
    seniorities: s.array(
      "Professional seniority levels to include.",
      trimmedString("A professional seniority level."),
      { minItems: 1 },
    ),
    locations: s.array("Geographic locations to include.", locationFilterSchema, { minItems: 1 }),
    limit: s.integer("The maximum number of results to return.", {
      minimum: 1,
      maximum: 100,
    }),
    skip: s.integer("The number of results to skip for pagination.", { minimum: 0 }),
  },
  { optional: ["roles", "seniorities", "locations", "limit", "skip"] },
);

const searchPeopleInputSchema = s.object(
  "Identifiers and pagination for finding people in LeadIQ.",
  {
    id: trimmedString("A LeadIQ person ID."),
    linkedinUrl: s.url("A LinkedIn profile URL."),
    email: s.email("A known email address."),
    firstName: trimmedString("The person's first name."),
    lastName: trimmedString("The person's last name."),
    company: companyIdentifierSchema,
    limit: s.integer("The maximum number of results to return.", {
      minimum: 1,
      maximum: 100,
    }),
    skip: s.integer("The number of results to skip for pagination.", { minimum: 0 }),
  },
  {
    optional: ["id", "linkedinUrl", "email", "firstName", "lastName", "company", "limit", "skip"],
  },
);

const searchCompanyInputSchema = s.object(
  "Identifiers for finding companies in LeadIQ.",
  {
    id: trimmedString("A LeadIQ company ID."),
    name: trimmedString("The company name."),
    domain: trimmedString("The company domain."),
    linkedinId: trimmedString("The LinkedIn company ID."),
  },
  { optional: ["id", "name", "domain", "linkedinId"] },
);

export const leadiqActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve LeadIQ subscription plans and current Data Hub and Universal credit balances.",
    inputSchema: s.requiredObject("No input parameters are required.", {}),
    outputSchema: s.object(
      "The connected LeadIQ account plans and credit balances.",
      {
        plans: s.array("The account's subscription plans.", planSchema),
        dataHubPlan: s.nullable(creditPlanSchema),
        universalPlan: s.nullable(creditPlanSchema),
      },
      { optional: ["dataHubPlan", "universalPlan"] },
    ),
  }),
  defineProviderAction(service, {
    name: "search_people",
    description: "Find and enrich people in LeadIQ by person ID, LinkedIn URL, email, or name and company.",
    inputSchema: searchPeopleInputSchema,
    outputSchema: s.requiredObject("The LeadIQ people search result.", {
      totalResults: s.integer("The total number of matching people."),
      hasMore: s.boolean("Whether more results are available."),
      results: s.array("The matching people.", personSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_company",
    description: "Find companies in LeadIQ by company ID, name, domain, or LinkedIn ID.",
    inputSchema: searchCompanyInputSchema,
    outputSchema: s.requiredObject("The LeadIQ company search result.", {
      totalResults: s.integer("The total number of matching companies."),
      results: s.array("The matching companies.", companySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "flat_advanced_search",
    description: "Search for people using documented role, seniority, and location filters and return a flat list.",
    inputSchema: advancedSearchInputSchema,
    outputSchema: s.requiredObject("The flat LeadIQ advanced search result.", {
      totalPeople: s.integer("The total number of matching people."),
      people: s.array(
        "The matching people.",
        s.looseRequiredObject("A person in flat advanced search.", {
          id: s.string("The LeadIQ person ID."),
        }),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "grouped_advanced_search",
    description: "Search for people using documented filters and return matches grouped by company.",
    inputSchema: advancedSearchInputSchema,
    outputSchema: s.requiredObject("The company-grouped LeadIQ advanced search result.", {
      totalCompanies: s.integer("The total number of matching companies."),
      companies: s.array(
        "Companies with their matching people.",
        s.looseRequiredObject("A company and its matching people.", {
          totalContactsInCompany: s.integer("The number of matching contacts at the company."),
          company: companySchema,
          people: s.array(
            "The people matching at this company.",
            s.looseRequiredObject("A person in grouped advanced search.", {
              id: s.string("The LeadIQ person ID."),
              name: s.string("The person's full name."),
              title: s.string("The person's job title."),
              seniority: s.string("The person's seniority."),
              linkedinUrl: s.string("The person's LinkedIn profile URL."),
            }),
          ),
        }),
      ),
    }),
  }),
];
