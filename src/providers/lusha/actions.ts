import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lusha";

const revealContactFieldSchema = s.stringEnum("The contact data fields to reveal.", ["emails", "phones"]);
const revealCompanyFieldSchema = s.stringEnum("The company data fields to reveal.", [
  "employeesByDepartment",
  "employeesByLocation",
  "employeesBySeniority",
  "competitors",
  "intent",
]);

const searchOptionsSchema = s.object(
  "Additional options for Lusha search requests.",
  {
    includePartialProfiles: s.boolean("Whether to include partial profiles in the results."),
  },
  { optional: ["includePartialProfiles"] },
);

const contactSearchItemSchema: JsonSchema = s.object(
  "A contact identifier object accepted by Lusha Contacts Search.",
  {
    clientReferenceId: s.nonEmptyString("Caller-supplied reference ID echoed in the result item."),
    id: s.nonEmptyString("Lusha contact ID returned by a previous search."),
    linkedinUrl: s.url("Public LinkedIn profile URL for the contact."),
    email: s.email("Email address used to identify the contact."),
    firstName: s.nonEmptyString("Contact first name."),
    lastName: s.nonEmptyString("Contact last name."),
    companyName: s.nonEmptyString("Company name used with firstName and lastName to identify the contact."),
    companyDomain: s.nonEmptyString("Company domain used with firstName and lastName to identify the contact."),
  },
  {
    optional: [
      "clientReferenceId",
      "id",
      "linkedinUrl",
      "email",
      "firstName",
      "lastName",
      "companyName",
      "companyDomain",
    ],
  },
);
contactSearchItemSchema.anyOf = [
  { required: ["id"] },
  { required: ["linkedinUrl"] },
  { required: ["email"] },
  {
    required: ["firstName", "lastName"],
    anyOf: [{ required: ["companyName"] }, { required: ["companyDomain"] }],
  },
];

const companySearchItemSchema: JsonSchema = s.object(
  "A company identifier object accepted by Lusha Companies Search.",
  {
    clientReferenceId: s.nonEmptyString("Caller-supplied reference ID echoed in the result item."),
    id: s.nonEmptyString("Lusha company ID returned by a previous search."),
    name: s.nonEmptyString("Company name used to identify the company."),
    domain: s.nonEmptyString("Company domain used to identify the company."),
  },
  { optional: ["clientReferenceId", "id", "name", "domain"] },
);
companySearchItemSchema.anyOf = [{ required: ["id"] }, { required: ["name"] }, { required: ["domain"] }];

const searchContactsInputSchema = s.object(
  "The input payload for Lusha Contacts Search.",
  {
    contacts: s.array("Contacts to search for, with up to 100 entries.", contactSearchItemSchema, {
      minItems: 1,
      maxItems: 100,
    }),
    options: searchOptionsSchema,
  },
  { optional: ["options"] },
);

const enrichContactsInputSchema = s.object(
  "The input payload for Lusha Contacts Enrich.",
  {
    ids: s.array("Lusha contact IDs returned by Contacts Search.", s.nonEmptyString("A contact ID."), {
      minItems: 1,
      maxItems: 100,
    }),
    reveal: s.array(
      "Contact data fields to reveal. Omit this field to reveal both emails and phones.",
      revealContactFieldSchema,
      { minItems: 1 },
    ),
  },
  { optional: ["reveal"] },
);

const searchCompaniesInputSchema = s.object(
  "The input payload for Lusha Companies Search.",
  {
    companies: s.array("Companies to search for, with up to 100 entries.", companySearchItemSchema, {
      minItems: 1,
      maxItems: 100,
    }),
    options: searchOptionsSchema,
  },
  { optional: ["options"] },
);

const enrichCompaniesInputSchema = s.object(
  "The input payload for Lusha Companies Enrich.",
  {
    ids: s.array("Lusha company IDs returned by Companies Search.", s.nonEmptyString("A company ID."), {
      minItems: 1,
      maxItems: 100,
    }),
    reveal: s.array("Company data fields to reveal.", revealCompanyFieldSchema, { minItems: 1 }),
  },
  { optional: ["reveal"] },
);

const billingSchema = s.looseObject("Credit usage summary for a Lusha API request.", {
  creditsCharged: s.integer("Total credits charged for the request."),
  resultsReturned: s.integer("Number of successful results returned."),
});

const contactsSearchOutputSchema = s.looseObject("The Lusha Contacts Search response.", {
  requestId: s.string("Lusha request ID for tracing the search request."),
  results: s.array("Contact preview results returned by Lusha.", s.looseObject("A Lusha contact preview result.")),
  billing: billingSchema,
});

const contactsEnrichOutputSchema = s.looseObject("The Lusha Contacts Enrich response.", {
  requestId: s.string("Lusha request ID for tracing the enrich request."),
  results: s.array("Enriched contact results returned by Lusha.", s.looseObject("A Lusha enriched contact result.")),
  billing: billingSchema,
});

const companiesSearchOutputSchema = s.looseObject("The Lusha Companies Search response.", {
  requestId: s.string("Lusha request ID for tracing the search request."),
  results: s.array("Company preview results returned by Lusha.", s.looseObject("A Lusha company preview result.")),
  billing: billingSchema,
});

const companiesEnrichOutputSchema = s.looseObject("The Lusha Companies Enrich response.", {
  requestId: s.string("Lusha request ID for tracing the enrich request."),
  results: s.array("Enriched company results returned by Lusha.", s.looseObject("A Lusha enriched company result.")),
  billing: billingSchema,
});

const accountUsageOutputSchema = s.looseObject("The Lusha account usage response.", {
  credits: s.looseObject("Credit totals for the current billing cycle."),
  rateLimits: s.looseObject("Daily, hourly, and per-minute rate limit usage snapshots."),
  plan: s.looseObject("The current Lusha plan category and renewal window."),
  pricing: s.record("Credit pricing entries keyed by Lusha action type.", s.looseObject("A pricing entry.")),
});

export const lushaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_usage",
    description: "Retrieve Lusha account usage, credit balance, rate limits, plan details, and API action pricing.",
    inputSchema: s.object("This action does not require input.", {}),
    outputSchema: accountUsageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_contacts",
    description:
      "Search for Lusha contact previews by contact ID, LinkedIn URL, email, or name plus company identifier.",
    inputSchema: searchContactsInputSchema,
    outputSchema: contactsSearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "enrich_contacts",
    description: "Reveal email and phone data for contacts previously returned by Lusha Contacts Search.",
    inputSchema: enrichContactsInputSchema,
    outputSchema: contactsEnrichOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_companies",
    description: "Search for Lusha company previews by company ID, name, or domain.",
    inputSchema: searchCompaniesInputSchema,
    outputSchema: companiesSearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "enrich_companies",
    description:
      "Reveal firmographic, employee, competitor, and intent data for companies returned by Lusha Companies Search.",
    inputSchema: enrichCompaniesInputSchema,
    outputSchema: companiesEnrichOutputSchema,
  }),
];
