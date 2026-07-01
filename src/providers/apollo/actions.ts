import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "apollo";

const emptyInputSchema = s.object("The input payload for this action.", {});
const looseObjectSchema = s.looseObject("An arbitrary JSON object returned by Apollo.");
const looseObjectArraySchema = s.array("A list of arbitrary JSON objects returned by Apollo.", looseObjectSchema);

const pageField = s.integer("The 1-based page number to request.", { minimum: 1, maximum: 500 });
const perPageField = s.integer("The number of records to request per page.", { minimum: 1, maximum: 100 });
const stringListField = (description: string) =>
  s.stringArray(description, {
    minItems: 1,
    itemDescription: "A filter value.",
  });
const revenueField = (description: string) => s.nonNegativeInteger(description);

const usageOutputSchema = s.object("The output payload for the Apollo usage stats request.", {
  usage: s.object(
    "The normalized Apollo usage stats payload.",
    {
      teamId: s.string("The Apollo team identifier."),
      credits: s.object(
        "The normalized Apollo credit usage summary.",
        {
          used: s.number("The number of credits already used."),
          limit: s.number("The credit limit for the current usage period."),
          remaining: s.number("The number of credits remaining in the current usage period."),
        },
        { optional: ["used", "limit", "remaining"] },
      ),
      endpoints: looseObjectArraySchema,
      usagePeriodStart: s.string("The start timestamp of the current usage period."),
      usagePeriodEnd: s.string("The end timestamp of the current usage period."),
      raw: looseObjectSchema,
    },
    { optional: ["teamId", "usagePeriodStart", "usagePeriodEnd"] },
  ),
});

const searchOrganizationsInputSchema = s.object(
  "The input payload for the Apollo organization search request.",
  {
    page: pageField,
    perPage: perPageField,
    organizationIds: stringListField("Apollo organization IDs used to scope the search."),
    organizationName: s.nonEmptyString("The organization name query used for partial company-name matching."),
    organizationLocations: stringListField("The organization headquarters locations to include in the search."),
    excludedOrganizationLocations: stringListField(
      "The organization headquarters locations to exclude from the search.",
    ),
    organizationDomains: stringListField("The bare company domains used to restrict the organization search."),
    organizationKeywordTags: stringListField(
      "The organization industry or specialization keywords used to refine the search.",
    ),
    organizationEmployeeRanges: stringListField(
      "The employee-count ranges expressed as Apollo 'min,max' strings.",
    ),
    organizationRevenueMin: revenueField(
      "The minimum annual revenue, in US dollars, used to refine the organization search.",
    ),
    organizationRevenueMax: revenueField(
      "The maximum annual revenue, in US dollars, used to refine the organization search.",
    ),
  },
  {
    optional: [
      "page",
      "perPage",
      "organizationIds",
      "organizationName",
      "organizationLocations",
      "excludedOrganizationLocations",
      "organizationDomains",
      "organizationKeywordTags",
      "organizationEmployeeRanges",
      "organizationRevenueMin",
      "organizationRevenueMax",
    ],
  },
);

const searchPeopleInputSchema = s.object(
  "The input payload for the Apollo people search request.",
  {
    page: pageField,
    perPage: perPageField,
    keywords: s.nonEmptyString("The Apollo keywords string used to refine the people search."),
    personTitles: stringListField("The current job titles to include in the people search."),
    includeSimilarTitles: s.boolean("Whether Apollo should include titles similar to the supplied person titles."),
    organizationIds: stringListField("The Apollo organization IDs used to scope the people search."),
    personLocations: stringListField("The person locations to include in the search."),
    personSeniorities: stringListField("The person seniority values to include in the search."),
    contactEmailStatus: stringListField("The Apollo contact-email-status values to include."),
    organizationLocations: stringListField("The organization headquarters locations used to refine the people search."),
    organizationDomains: stringListField("The organization domains used to refine the people search."),
    organizationEmployeeRanges: stringListField(
      "The employee-count ranges expressed as Apollo 'min,max' strings.",
    ),
    organizationRevenueMin: revenueField(
      "The minimum annual revenue, in US dollars, used to refine the people search.",
    ),
    organizationRevenueMax: revenueField(
      "The maximum annual revenue, in US dollars, used to refine the people search.",
    ),
  },
  {
    optional: [
      "page",
      "perPage",
      "keywords",
      "personTitles",
      "includeSimilarTitles",
      "organizationIds",
      "personLocations",
      "personSeniorities",
      "contactEmailStatus",
      "organizationLocations",
      "organizationDomains",
      "organizationEmployeeRanges",
      "organizationRevenueMin",
      "organizationRevenueMax",
    ],
  },
);

const enrichPersonInputSchema = s.object(
  "The input payload for the Apollo person enrichment request.",
  {
    id: s.nonEmptyString("The Apollo person identifier."),
    email: s.email("The person's email address."),
    hashedEmail: s.nonEmptyString("The hashed email used for Apollo person matching."),
    linkedinUrl: s.nonEmptyString("The LinkedIn profile URL used for Apollo person matching."),
    name: s.nonEmptyString("The full name used for Apollo person matching."),
    firstName: s.nonEmptyString("The first name used for Apollo person matching."),
    lastName: s.nonEmptyString("The last name used for Apollo person matching."),
    organizationName: s.nonEmptyString("The organization name paired with name-based person matching."),
    domain: s.nonEmptyString("The bare organization domain paired with person matching."),
    revealPersonalEmails: s.boolean("Whether Apollo should reveal personal-email data when available."),
  },
  {
    optional: [
      "id",
      "email",
      "hashedEmail",
      "linkedinUrl",
      "name",
      "firstName",
      "lastName",
      "organizationName",
      "domain",
      "revealPersonalEmails",
    ],
  },
);
enrichPersonInputSchema.anyOf = [
  { required: ["id"] },
  { required: ["email"] },
  { required: ["hashedEmail"] },
  { required: ["linkedinUrl"] },
  { required: ["name"] },
  { required: ["firstName", "lastName"] },
];

export const apolloActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_api_usage_stats",
    description: "Retrieve Apollo API usage statistics for the current team and key.",
    inputSchema: emptyInputSchema,
    outputSchema: usageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_organizations",
    description: "Search Apollo organizations with the first-pass organization filters.",
    inputSchema: searchOrganizationsInputSchema,
    outputSchema: s.object(
      "The output payload for the Apollo organization search request.",
      {
        organizations: s.array("The matched Apollo organizations.", looseObjectSchema),
        pagination: looseObjectSchema,
        breadcrumbs: looseObjectArraySchema,
      },
      { optional: ["pagination", "breadcrumbs"] },
    ),
  }),
  defineProviderAction(service, {
    name: "search_people",
    description: "Search Apollo people with the first-pass prospecting filters.",
    inputSchema: searchPeopleInputSchema,
    outputSchema: s.object(
      "The output payload for the Apollo people search request.",
      {
        people: s.array("The matched Apollo people search results.", looseObjectSchema),
        pagination: looseObjectSchema,
      },
      { optional: ["pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "enrich_organization",
    description: "Enrich an Apollo organization by domain.",
    inputSchema: s.object("The input payload for the Apollo organization enrichment request.", {
      domain: s.nonEmptyString("The bare company domain used to enrich an Apollo organization."),
    }),
    outputSchema: s.object("The output payload for the Apollo organization enrichment request.", {
      organization: looseObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "enrich_person",
    description: "Enrich an Apollo person with the first-pass matching inputs.",
    inputSchema: enrichPersonInputSchema,
    outputSchema: s.object("The output payload for the Apollo person enrichment request.", {
      person: looseObjectSchema,
    }),
  }),
];

export type ApolloActionName = (typeof apolloActions)[number]["name"];
