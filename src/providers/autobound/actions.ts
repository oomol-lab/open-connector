import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "autobound";

const signalTypeSlugSchema = s.nonEmptyString("The canonical Autobound signal type slug or an accepted legacy alias.");
const associationSchema = s.stringEnum("The Autobound signal association for filtering or classification.", [
  "company",
  "contact",
]);
const refreshCadenceSchema = s.stringEnum("The refresh cadence reported by Autobound.", [
  "twice_daily",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
]);
const rawObjectSchema = s.looseObject("The raw JSON object returned by Autobound.");

const companySchema = s.looseObject("A normalized company object returned by Autobound.", {
  name: s.nonEmptyString("The company name returned by Autobound."),
  domain: s.nonEmptyString("The company domain returned by Autobound."),
  linkedinUrl: s.nonEmptyString("The company LinkedIn URL returned by Autobound."),
  raw: rawObjectSchema,
});

const contactSchema = s.looseObject("A normalized contact object returned by Autobound.", {
  email: s.email("The contact email returned by Autobound."),
  linkedinUrl: s.nonEmptyString("The contact LinkedIn URL returned by Autobound."),
  name: s.nonEmptyString("The contact name returned by Autobound."),
  title: s.nonEmptyString("The contact title returned by Autobound."),
  company: companySchema,
  raw: rawObjectSchema,
});

const signalSchema = s.looseObject("A normalized signal record returned by Autobound.", {
  signalId: s.nonEmptyString("The Autobound signal identifier."),
  signalType: signalTypeSlugSchema,
  signalSubtype: s.nonEmptyString("The Autobound signal subtype."),
  signalName: s.string("The human-readable Autobound signal title."),
  detectedAt: s.dateTime("When Autobound detected the signal."),
  association: associationSchema,
  company: s.nullable(companySchema),
  contact: s.nullable(contactSchema),
  data: rawObjectSchema,
  raw: rawObjectSchema,
});

const signalSummarySchema = s.looseObject("Summary counts for the returned Autobound signals.", {
  total: s.integer("The total number of signals returned in this response.", { minimum: 0 }),
  byType: s.record(
    "The count of returned signals grouped by signal type.",
    s.integer("The number of returned signals for one signal type.", { minimum: 0 }),
  ),
});

const signalTypeEntrySchema = s.object(
  "A normalized Autobound signal type entry.",
  {
    type: signalTypeSlugSchema,
    association: associationSchema,
    description: s.string("The description for this Autobound signal type."),
    count: s.integer("The number of available signals for this type.", { minimum: 0 }),
    refreshCadence: refreshCadenceSchema,
    refreshHours: s.integer("The nominal refresh period in hours.", { minimum: 0 }),
  },
  { optional: ["association", "description", "count", "refreshCadence", "refreshHours"] },
);

const accountSchema = s.looseObject("The normalized Autobound account details.", {
  customerId: s.nonEmptyString("The Autobound customer identifier."),
  customerName: s.nonEmptyString("The Autobound customer name."),
  rateLimit: s.integer("The Autobound requests-per-minute rate limit.", { minimum: 0 }),
  creditBalance: s.integer("The remaining Autobound signal credits.", { minimum: 0 }),
  raw: rawObjectSchema,
});

const companyEnrichInputSchema = s.object(
  "The input payload for enriching one company with Autobound signals.",
  {
    domain: s.nonEmptyString("The company domain to enrich, for example stripe.com."),
    companyName: s.nonEmptyString("The company name to enrich when the domain is unavailable."),
    linkedinUrl: s.url("The company LinkedIn URL to enrich when other identifiers are unavailable."),
    signalTypes: s.array(
      "The signal types Autobound should include in the enrichment response.",
      signalTypeSlugSchema,
      {
        minItems: 1,
      },
    ),
    detectedAfter: s.dateTime("Only return signals detected on or after this timestamp."),
    limit: s.integer("The maximum number of signals to return.", { minimum: 1, maximum: 500 }),
  },
  { optional: ["domain", "companyName", "linkedinUrl", "signalTypes", "detectedAfter", "limit"] },
);
companyEnrichInputSchema.anyOf = [
  { required: ["domain"] },
  { required: ["companyName"] },
  { required: ["linkedinUrl"] },
];

const companySearchInputSchema = s.object(
  "The input payload for searching companies by Autobound signal filters.",
  {
    signalTypes: s.array("The Autobound signal types that companies must match.", signalTypeSlugSchema, {
      minItems: 1,
    }),
    signalSubtype: s.nonEmptyString("The Autobound signal subtype filter."),
    detectedAfter: s.dateTime("Only include companies with matching signals detected on or after this timestamp."),
    detectedBefore: s.dateTime("Only include companies with matching signals detected before this timestamp."),
    limit: s.integer("The maximum number of companies to return.", { minimum: 1, maximum: 100 }),
    offset: s.integer("The zero-based result offset.", { minimum: 0, maximum: 10000 }),
    signalsPerEntity: s.integer("How many of each company's most recent signals to attach.", {
      minimum: 1,
      maximum: 100,
    }),
  },
  {
    optional: ["signalSubtype", "detectedAfter", "detectedBefore", "limit", "offset", "signalsPerEntity"],
  },
);

const contactEnrichInputSchema = s.object(
  "The input payload for enriching one contact with Autobound signals.",
  {
    contactEmail: s.email("The contact email address to enrich."),
    contactLinkedinUrl: s.url("The contact LinkedIn URL to enrich when the email is unavailable."),
    signalTypes: s.array(
      "The signal types Autobound should include in the enrichment response.",
      signalTypeSlugSchema,
      {
        minItems: 1,
      },
    ),
    detectedAfter: s.dateTime("Only return signals detected on or after this timestamp."),
    limit: s.integer("The maximum number of signals to return.", { minimum: 1, maximum: 500 }),
  },
  { optional: ["contactEmail", "contactLinkedinUrl", "signalTypes", "detectedAfter", "limit"] },
);
contactEnrichInputSchema.anyOf = [{ required: ["contactEmail"] }, { required: ["contactLinkedinUrl"] }];

const contactSearchInputSchema = s.object(
  "The input payload for searching contacts by Autobound signal filters.",
  {
    signalTypes: s.array("The Autobound signal types that contacts must match.", signalTypeSlugSchema, {
      minItems: 1,
    }),
    signalSubtype: s.nonEmptyString("The Autobound signal subtype filter."),
    detectedAfter: s.dateTime("Only include contacts with matching signals detected on or after this timestamp."),
    detectedBefore: s.dateTime("Only include contacts with matching signals detected before this timestamp."),
    limit: s.integer("The maximum number of contacts to return.", { minimum: 1, maximum: 100 }),
    offset: s.integer("The zero-based result offset.", { minimum: 0, maximum: 10000 }),
    signalsPerEntity: s.integer("How many of each contact's most recent signals to attach.", {
      minimum: 1,
      maximum: 100,
    }),
  },
  {
    optional: ["signalSubtype", "detectedAfter", "detectedBefore", "limit", "offset", "signalsPerEntity"],
  },
);

const listSignalTypesInputSchema = s.object(
  "The input payload for listing Autobound signal types.",
  {
    includeCounts: s.boolean("Whether Autobound should include per-type counts and cadence metadata."),
    association: associationSchema,
    since: s.dateTime("Only include type counts for signals detected on or after this timestamp."),
  },
  { optional: ["includeCounts", "association", "since"] },
);

const companySearchResultSchema = s.looseObject("One company result returned by Autobound company search.", {
  name: s.nonEmptyString("The company name returned by Autobound."),
  domain: s.nonEmptyString("The company domain returned by Autobound."),
  linkedinUrl: s.nonEmptyString("The company LinkedIn URL returned by Autobound."),
  signalCount: s.integer("The number of matching signals for this company.", { minimum: 0 }),
  mostRecentSignalAt: s.dateTime("When the most recent matching signal was detected for this company."),
  signals: s.array("The attached most recent signals for this company.", signalSchema),
  raw: rawObjectSchema,
});

const contactSearchResultSchema = s.looseObject("One contact result returned by Autobound contact search.", {
  email: s.email("The contact email returned by Autobound."),
  linkedinUrl: s.nonEmptyString("The contact LinkedIn URL returned by Autobound."),
  name: s.nonEmptyString("The contact name returned by Autobound."),
  title: s.nonEmptyString("The contact title returned by Autobound."),
  company: companySchema,
  signalCount: s.integer("The number of matching signals for this contact.", { minimum: 0 }),
  mostRecentSignalAt: s.dateTime("When the most recent matching signal was detected for this contact."),
  signals: s.array("The attached most recent signals for this contact.", signalSchema),
  raw: rawObjectSchema,
});

export const autoboundActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description: "Get the authenticated Autobound Signals account details and current credit balance.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for loading the current Autobound account.", {}),
    outputSchema: s.object("The output payload for Autobound account details.", {
      account: accountSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_signal_types",
    operationType: "read",
    description: "List Autobound signal types and optionally include live counts and refresh cadence metadata.",
    requiredScopes: [],
    inputSchema: listSignalTypesInputSchema,
    outputSchema: s.object(
      "The output payload for Autobound signal type listing.",
      {
        signalTypes: s.array("The normalized Autobound signal type entries.", signalTypeEntrySchema),
        totalSignals: s.integer("The total live signal count across returned types.", { minimum: 0 }),
        countedAt: s.dateTime("When Autobound counted the live signal totals."),
      },
      { optional: ["totalSignals", "countedAt"] },
    ),
  }),
  defineProviderAction(service, {
    name: "enrich_company",
    operationType: "read",
    description: "Enrich one company with Autobound company-level signals.",
    requiredScopes: [],
    inputSchema: companyEnrichInputSchema,
    outputSchema: s.object("The output payload for Autobound company enrichment.", {
      company: companySchema,
      signals: s.array("The normalized signals returned for the company.", signalSchema),
      signalSummary: s.nullable(signalSummarySchema),
      coverage: s.nullable(s.looseObject("The Autobound coverage metadata for this enrichment.")),
    }),
  }),
  defineProviderAction(service, {
    name: "search_companies",
    operationType: "read",
    description: "Search companies that match Autobound company-level signal filters.",
    requiredScopes: [],
    inputSchema: companySearchInputSchema,
    outputSchema: s.object("The output payload for Autobound company search.", {
      companies: s.array("The companies returned by Autobound search.", companySearchResultSchema),
      offset: s.integer("The result offset returned by Autobound.", { minimum: 0 }),
      limit: s.integer("The result limit returned by Autobound.", { minimum: 0 }),
      hasMore: s.boolean("Whether Autobound has another page of company results."),
    }),
  }),
  defineProviderAction(service, {
    name: "enrich_contact",
    operationType: "read",
    description: "Enrich one contact with Autobound contact-level signals and employer context.",
    requiredScopes: [],
    inputSchema: contactEnrichInputSchema,
    outputSchema: s.object("The output payload for Autobound contact enrichment.", {
      contact: s.nullable(contactSchema),
      company: s.nullable(companySchema),
      contactSignals: s.array("The normalized signals returned for the contact.", signalSchema),
      signalSummary: s.nullable(signalSummarySchema),
      total: s.nullable(s.integer("The total number of returned contact-level signals.", { minimum: 0 })),
      coverage: s.nullable(s.looseObject("The Autobound coverage metadata for this enrichment.")),
    }),
  }),
  defineProviderAction(service, {
    name: "search_contacts",
    operationType: "read",
    description: "Search contacts that match Autobound contact-level signal filters.",
    requiredScopes: [],
    inputSchema: contactSearchInputSchema,
    outputSchema: s.object("The output payload for Autobound contact search.", {
      contacts: s.array("The contacts returned by Autobound search.", contactSearchResultSchema),
      offset: s.integer("The result offset returned by Autobound.", { minimum: 0 }),
      limit: s.integer("The result limit returned by Autobound.", { minimum: 0 }),
      hasMore: s.boolean("Whether Autobound has another page of contact results."),
    }),
  }),
];
