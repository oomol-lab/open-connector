import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "nyne_ai";

const statusSchema = s.string("The Nyne.ai request status.");
const rawObjectSchema = s.looseObject("The raw object returned by Nyne.ai.");
const rawArraySchema = s.array("Raw objects returned by Nyne.ai.", rawObjectSchema);
const requestIdSchema = s.string("The Nyne.ai asynchronous request identifier.", { minLength: 1 });
const nullableBooleanSchema = s.nullable(s.boolean("Whether Nyne.ai marked the request complete."));
const nullableIntegerSchema = s.nullable(s.integer("The integer value returned by Nyne.ai."));
const callbackUrlSchema = s.url(
  "The HTTP or HTTPS callback URL Nyne.ai should call when the asynchronous request completes.",
);

const submitOutputSchema = s.object("The normalized Nyne.ai asynchronous submit response.", {
  requestId: requestIdSchema,
  status: statusSchema,
  completed: nullableBooleanSchema,
  raw: rawObjectSchema,
});

const searchOutputSchema = s.object("The normalized Nyne.ai search status response.", {
  requestId: requestIdSchema,
  status: statusSchema,
  completed: nullableBooleanSchema,
  results: rawArraySchema,
  returnedCount: nullableIntegerSchema,
  totalResults: nullableIntegerSchema,
  hasMore: nullableBooleanSchema,
  nextCursor: s.nullable(s.string("The next cursor returned by Nyne.ai.")),
  nextOffset: nullableIntegerSchema,
  raw: rawObjectSchema,
});

const enrichmentOutputSchema = s.object("The normalized Nyne.ai enrichment status response.", {
  requestId: requestIdSchema,
  status: statusSchema,
  completed: nullableBooleanSchema,
  result: s.nullable(rawObjectSchema),
  raw: rawObjectSchema,
});

const personSearchInputSchema = withAnyOfRequired(
  s.object(
    "Input for submitting a Nyne.ai person search.",
    {
      query: s.string("The natural-language search query sent to Nyne.ai.", {
        minLength: 1,
      }),
      limit: s.integer("Results per page. Nyne.ai defaults to 10 and clamps values above 100.", {
        minimum: 1,
        maximum: 100,
      }),
      showEmails: s.boolean("Whether Nyne.ai should include verified email addresses."),
      showPhoneNumbers: s.boolean("Whether Nyne.ai should include phone numbers."),
      requireEmails: s.boolean("Whether Nyne.ai should only return people with emails."),
      requirePhoneNumbers: s.boolean("Whether Nyne.ai should only return people with phones."),
      requirePhonesOrEmails: s.boolean("Whether Nyne.ai should only return people with at least one contact method."),
      insights: s.boolean("Whether Nyne.ai should attach AI-generated match insights."),
      profileScoring: s.boolean("Whether Nyne.ai should return a query-fit score."),
      customFilters: s.looseObject("Structured Nyne.ai search filters."),
      cursor: s.string("Opaque pagination cursor from a previous Nyne.ai response.", {
        minLength: 1,
      }),
      offset: s.integer("Starting position for offset pagination.", { minimum: 0 }),
      requestId: requestIdSchema,
      callbackUrl: callbackUrlSchema,
    },
    {
      optional: [
        "query",
        "limit",
        "showEmails",
        "showPhoneNumbers",
        "requireEmails",
        "requirePhoneNumbers",
        "requirePhonesOrEmails",
        "insights",
        "profileScoring",
        "customFilters",
        "cursor",
        "offset",
        "requestId",
        "callbackUrl",
      ],
    },
  ),
  ["query", "customFilters", "cursor", "requestId"],
);

const personIdentifierInputSchema = withAnyOfRequired(
  s.object(
    "Identifiers and options for submitting a Nyne.ai person enrichment request.",
    {
      email: s.email("The person's email address."),
      phone: s.string("The person's phone number."),
      socialMediaUrl: s.url("The person's social profile URL."),
      name: s.string("The person's full name.", { minLength: 1 }),
      company: s.string("The person's employer name used to improve matching.", {
        minLength: 1,
      }),
      city: s.string("The city used to disambiguate name lookups.", {
        minLength: 1,
        maxLength: 100,
      }),
      callbackUrl: callbackUrlSchema,
      newsfeed: s.anyOf("Social sources to pull with enrichment.", [
        s.stringEnum("All supported Nyne.ai social sources.", ["all"]),
        s.array(
          "Specific social sources to pull with enrichment.",
          s.string("One Nyne.ai social source literal.", {
            minLength: 1,
          }),
          {
            minItems: 1,
          },
        ),
      ]),
      aiEnhancedSearch: s.boolean("Whether Nyne.ai should use AI-assisted search expansion."),
      strictEmailCheck: s.boolean("Whether Nyne.ai should require stricter email confirmation."),
      liteEnrich: s.boolean("Whether Nyne.ai should use the lower-cost lite enrichment mode."),
      probabilityScore: s.boolean("Whether Nyne.ai should return match probability when available."),
      forceOrganizationRefresh: s.boolean("Whether Nyne.ai should force a live organization data refresh."),
      requiredFields: s.array(
        "Field names the Nyne.ai result must contain to count as a match.",
        s.string("One required field name.", { minLength: 1 }),
        { minItems: 1 },
      ),
    },
    {
      optional: [
        "email",
        "phone",
        "socialMediaUrl",
        "name",
        "company",
        "city",
        "callbackUrl",
        "newsfeed",
        "aiEnhancedSearch",
        "strictEmailCheck",
        "liteEnrich",
        "probabilityScore",
        "forceOrganizationRefresh",
        "requiredFields",
      ],
    },
  ),
  ["email", "phone", "socialMediaUrl", "name"],
);

const companyIdentifierInputSchema = withAnyOfRequired(
  s.object(
    "Identifiers and options for submitting a Nyne.ai company enrichment request.",
    {
      domain: s.string("The company website domain.", { minLength: 1 }),
      email: s.email("A company email address."),
      phone: s.string("A company phone number.", { minLength: 1 }),
      socialMediaUrl: s.url("The company social profile URL."),
      callbackUrl: callbackUrlSchema,
    },
    {
      optional: ["domain", "email", "phone", "socialMediaUrl", "callbackUrl"],
    },
  ),
  ["domain", "email", "phone", "socialMediaUrl"],
);

export const nyneAiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_usage",
    description: "Get Nyne.ai credit usage, monthly allocation, remaining balance, and per-API breakdown.",
    inputSchema: s.object(
      "Optional month and year filters for Nyne.ai usage statistics.",
      {
        month: s.integer("Month to retrieve usage for, from 1 through 12.", {
          minimum: 1,
          maximum: 12,
        }),
        year: s.integer("Year to retrieve usage for, from 2020 through 2030.", {
          minimum: 2020,
          maximum: 2030,
        }),
      },
      { optional: ["month", "year"] },
    ),
    outputSchema: s.object("The normalized Nyne.ai usage response.", {
      month: nullableIntegerSchema,
      year: nullableIntegerSchema,
      period: s.nullable(s.string("The usage period returned by Nyne.ai.")),
      creditsUsed: s.looseObject("Credit consumption totals returned by Nyne.ai."),
      requestsCount: s.looseObject("Request-count totals returned by Nyne.ai."),
      limits: s.looseObject("Credit allocation and remaining balance returned by Nyne.ai."),
      breakdown: s.looseObject("Per-API usage breakdown returned by Nyne.ai."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "submit_person_search",
    description: "Submit an asynchronous Nyne.ai people search using a natural-language query or structured filters.",
    followUpActions: ["nyne_ai.get_person_search"],
    asyncLifecycle: {
      startActionId: "nyne_ai.submit_person_search",
      statusActionId: "nyne_ai.get_person_search",
    },
    inputSchema: personSearchInputSchema,
    outputSchema: submitOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_person_search",
    description: "Poll a Nyne.ai person search request and return its status plus completed result page.",
    asyncLifecycle: {
      startActionId: "nyne_ai.submit_person_search",
      statusActionId: "nyne_ai.get_person_search",
    },
    inputSchema: s.object(
      "Input for polling a Nyne.ai person search request.",
      {
        requestId: requestIdSchema,
      },
      { required: ["requestId"] },
    ),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "submit_person_enrichment",
    description: "Submit an asynchronous Nyne.ai person enrichment request from email, phone, social URL, or name.",
    followUpActions: ["nyne_ai.get_person_enrichment"],
    asyncLifecycle: {
      startActionId: "nyne_ai.submit_person_enrichment",
      statusActionId: "nyne_ai.get_person_enrichment",
    },
    inputSchema: personIdentifierInputSchema,
    outputSchema: submitOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_person_enrichment",
    description: "Poll a Nyne.ai person enrichment request and return its status plus completed profile result.",
    asyncLifecycle: {
      startActionId: "nyne_ai.submit_person_enrichment",
      statusActionId: "nyne_ai.get_person_enrichment",
    },
    inputSchema: s.object(
      "Input for polling a Nyne.ai person enrichment request.",
      {
        requestId: requestIdSchema,
      },
      { required: ["requestId"] },
    ),
    outputSchema: enrichmentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "submit_company_search",
    description: "Submit an asynchronous Nyne.ai company search using a natural-language query.",
    followUpActions: ["nyne_ai.get_company_search"],
    asyncLifecycle: {
      startActionId: "nyne_ai.submit_company_search",
      statusActionId: "nyne_ai.get_company_search",
    },
    inputSchema: s.object(
      "Input for submitting a Nyne.ai company search.",
      {
        query: s.string("The natural-language company search query.", {
          minLength: 1,
          maxLength: 700,
        }),
        limit: s.integer("Maximum companies to return. Nyne.ai supports 1 through 50.", {
          minimum: 1,
          maximum: 50,
        }),
        offset: s.integer("Starting position for offset pagination.", { minimum: 0 }),
        profileScoring: s.boolean("Whether Nyne.ai should return a query-fit score."),
        insights: s.boolean("Whether Nyne.ai should return query-fit evidence."),
        callbackUrl: callbackUrlSchema,
      },
      { optional: ["limit", "offset", "profileScoring", "insights", "callbackUrl"] },
    ),
    outputSchema: submitOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_company_search",
    description: "Poll a Nyne.ai company search request and return its status plus completed result page.",
    asyncLifecycle: {
      startActionId: "nyne_ai.submit_company_search",
      statusActionId: "nyne_ai.get_company_search",
    },
    inputSchema: s.object(
      "Input for polling a Nyne.ai company search request.",
      {
        requestId: requestIdSchema,
      },
      { required: ["requestId"] },
    ),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "submit_company_enrichment",
    description: "Submit an asynchronous Nyne.ai company enrichment request from domain, email, phone, or social URL.",
    followUpActions: ["nyne_ai.get_company_enrichment"],
    asyncLifecycle: {
      startActionId: "nyne_ai.submit_company_enrichment",
      statusActionId: "nyne_ai.get_company_enrichment",
    },
    inputSchema: companyIdentifierInputSchema,
    outputSchema: submitOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_company_enrichment",
    description: "Poll a Nyne.ai company enrichment request and return its status plus completed company result.",
    asyncLifecycle: {
      startActionId: "nyne_ai.submit_company_enrichment",
      statusActionId: "nyne_ai.get_company_enrichment",
    },
    inputSchema: s.object(
      "Input for polling a Nyne.ai company enrichment request.",
      {
        requestId: requestIdSchema,
      },
      { required: ["requestId"] },
    ),
    outputSchema: enrichmentOutputSchema,
  }),
];

function withAnyOfRequired(schema: JsonSchema, keys: string[]): JsonSchema {
  return {
    ...schema,
    anyOf: keys.map((key) => ({ required: [key] })),
  };
}
