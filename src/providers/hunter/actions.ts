import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hunter";

const emptyInputSchema = s.actionInput({}, [], "The input payload for this action.");
const hunterLooseObjectSchema = s.looseObject("An arbitrary JSON object returned by Hunter.");
const hunterIdSchema = s.positiveInteger("The Hunter resource ID.");

const customAttributesSchema = s.record(
  "Custom attribute values keyed by Hunter custom attribute slug.",
  s.string("A custom attribute value."),
);

const domainSearchInputSchema = s.object(
  "The input payload for the Hunter domain search request.",
  {
    domain: s.nonEmptyString("The domain name to search for. Required if company is not provided."),
    company: s.nonEmptyString("The company name to search for. Required if domain is not provided."),
    limit: s.integer("The maximum number of email addresses to return.", { minimum: 1, maximum: 100 }),
    offset: s.nonNegativeInteger("The number of results to skip for pagination."),
    type: s.stringEnum("The type of email addresses to return.", ["personal", "generic"]),
    seniority: s.array("The seniority filters to apply.", s.nonEmptyString("A seniority filter."), { minItems: 1 }),
    department: s.array("The department filters to apply.", s.nonEmptyString("A department filter."), { minItems: 1 }),
    required_field: s.array(
      "The fields that must be present on each returned result.",
      s.nonEmptyString("A required result field."),
      {
        minItems: 1,
      },
    ),
  },
  { optional: ["domain", "company", "limit", "offset", "type", "seniority", "department", "required_field"] },
);
domainSearchInputSchema.anyOf = [{ required: ["domain"] }, { required: ["company"] }];

const emailFinderInputSchema = s.object(
  "The input payload for the Hunter email finder request.",
  {
    domain: s.nonEmptyString("The company domain to search. Takes precedence over company when both are provided."),
    company: s.nonEmptyString("The company name to search when domain is not provided."),
    full_name: s.nonEmptyString("The person's full name. Required if first_name and last_name are not both provided."),
    first_name: s.nonEmptyString("The person's first name. Required with last_name when full_name is not provided."),
    last_name: s.nonEmptyString("The person's last name. Required with first_name when full_name is not provided."),
    max_duration: s.integer("The maximum duration in seconds for the finder request.", { minimum: 3, maximum: 20 }),
    linkedin_handle: s.nonEmptyString("The LinkedIn handle used to identify the target person."),
  },
  {
    optional: ["domain", "company", "full_name", "first_name", "last_name", "max_duration", "linkedin_handle"],
  },
);
emailFinderInputSchema.allOf = [
  { anyOf: [{ required: ["domain"] }, { required: ["company"] }, { required: ["linkedin_handle"] }] },
  {
    anyOf: [{ required: ["full_name"] }, { required: ["first_name", "last_name"] }, { required: ["linkedin_handle"] }],
  },
];

const emailCountInputSchema = s.object(
  "The input payload for the Hunter email count request.",
  {
    domain: s.nonEmptyString("The domain name to count email addresses for."),
    company: s.nonEmptyString("The company name to count email addresses for when domain is not provided."),
    type: s.stringEnum("The type of email addresses to count.", ["personal", "generic"]),
  },
  { optional: ["domain", "company", "type"] },
);
emailCountInputSchema.anyOf = [{ required: ["domain"] }, { required: ["company"] }];

const discoverCompaniesInputSchema = s.object(
  "The input payload for the Hunter discover companies request.",
  {
    query: s.nonEmptyString("The natural-language query used to discover matching companies."),
    limit: s.integer("The maximum number of companies to return.", { minimum: 1, maximum: 100 }),
    offset: s.nonNegativeInteger("The number of companies to skip for pagination."),
    filters: s.looseObject("The structured filters object supported by Hunter Discover."),
  },
  { optional: ["query", "limit", "offset", "filters"] },
);
discoverCompaniesInputSchema.anyOf = [{ required: ["query"] }, { required: ["filters"] }];

const emailOrLinkedinInputSchema = s.object(
  "The input payload for the Hunter enrichment request.",
  {
    email: s.email("The email address used to enrich the person."),
    linkedin_handle: s.nonEmptyString("The LinkedIn handle used to enrich the person."),
  },
  { optional: ["email", "linkedin_handle"] },
);
emailOrLinkedinInputSchema.anyOf = [{ required: ["email"] }, { required: ["linkedin_handle"] }];

const companyEnrichmentInputSchema = s.object("The input payload for the Hunter company enrichment request.", {
  domain: s.nonEmptyString("The bare company domain used to enrich the company."),
});

const leadFieldSchemas: Record<string, JsonSchema> = {
  email: s.email("The lead email address."),
  first_name: s.nonEmptyString("The lead first name."),
  last_name: s.nonEmptyString("The lead last name."),
  position: s.nonEmptyString("The lead job position."),
  company: s.nonEmptyString("The lead company name."),
  company_industry: s.nonEmptyString("The lead company industry."),
  company_size: s.nonEmptyString("The lead company size."),
  confidence_score: s.integer("The confidence score associated with the lead email.", { minimum: 0, maximum: 100 }),
  website: s.nonEmptyString("The lead company website."),
  country_code: s.string("The ISO 3166-1 alpha-2 country code.", { minLength: 2, maxLength: 2 }),
  linkedin_url: s.nonEmptyString("The lead LinkedIn URL."),
  phone_number: s.nonEmptyString("The lead phone number."),
  twitter: s.nonEmptyString("The lead Twitter handle."),
  notes: s.nonEmptyString("Free-form notes for the lead."),
  source: s.nonEmptyString("The source associated with the lead."),
  leads_list_id: hunterIdSchema,
  leads_list_ids: s.array("Lead list IDs to attach the lead to.", hunterIdSchema, { minItems: 1 }),
  custom_attributes: customAttributesSchema,
};

const optionalLeadFields = [
  "first_name",
  "last_name",
  "position",
  "company",
  "company_industry",
  "company_size",
  "confidence_score",
  "website",
  "country_code",
  "linkedin_url",
  "phone_number",
  "twitter",
  "notes",
  "source",
  "leads_list_id",
  "leads_list_ids",
  "custom_attributes",
];

const leadBodySchema = s.object("The request payload for creating or upserting a Hunter lead.", leadFieldSchemas, {
  optional: optionalLeadFields,
});

const leadUpdateInputSchema = s.object(
  "The request payload for updating a Hunter lead.",
  {
    id: hunterIdSchema,
    ...leadFieldSchemas,
  },
  { optional: ["email", ...optionalLeadFields] },
);
leadUpdateInputSchema.anyOf = Object.keys(leadFieldSchemas).map((field) => ({ required: [field] }));

const listLeadsInputSchema = s.object(
  "The query parameters for listing Hunter leads.",
  {
    leads_list_id: hunterIdSchema,
    email: s.nonEmptyString("Filter leads by email."),
    first_name: s.nonEmptyString("Filter leads by first name."),
    last_name: s.nonEmptyString("Filter leads by last name."),
    position: s.nonEmptyString("Filter leads by position."),
    company: s.nonEmptyString("Filter leads by company."),
    industry: s.nonEmptyString("Filter leads by industry."),
    website: s.nonEmptyString("Filter leads by website."),
    country_code: s.string("Filter leads by country code.", { minLength: 2, maxLength: 2 }),
    company_size: s.nonEmptyString("Filter leads by company size."),
    source: s.nonEmptyString("Filter leads by source."),
    twitter: s.nonEmptyString("Filter leads by Twitter handle."),
    linkedin_url: s.nonEmptyString("Filter leads by LinkedIn URL."),
    phone_number: s.nonEmptyString("Filter leads by phone number."),
    sync_status: s.stringEnum("Filter leads by synchronization status.", ["pending", "error", "success"]),
    sending_status: s.array(
      "Filter leads by sending statuses.",
      s.stringEnum("A lead sending status.", [
        "clicked",
        "opened",
        "sent",
        "pending",
        "error",
        "bounced",
        "unsubscribed",
        "replied",
        "~",
      ]),
      { minItems: 1 },
    ),
    verification_status: s.array(
      "Filter leads by verification statuses.",
      s.stringEnum("A lead verification status.", [
        "accept_all",
        "disposable",
        "invalid",
        "unknown",
        "valid",
        "webmail",
        "pending",
      ]),
      { minItems: 1 },
    ),
    last_activity_at: s.stringEnum("Filter by last activity presence.", ["*", "~"]),
    last_contacted_at: s.stringEnum("Filter by last contact presence.", ["*", "~"]),
    custom_attributes: s.record(
      "Custom attribute filters keyed by Hunter custom attribute slug.",
      s.string("A custom attribute filter value."),
    ),
    query: s.nonEmptyString("Search leads by first name, last name, or email."),
    limit: s.integer("The maximum number of leads to return.", { minimum: 1, maximum: 1000 }),
    offset: s.integer("The number of leads to skip for pagination.", { minimum: 0, maximum: 100000 }),
  },
  {
    optional: [
      "leads_list_id",
      "email",
      "first_name",
      "last_name",
      "position",
      "company",
      "industry",
      "website",
      "country_code",
      "company_size",
      "source",
      "twitter",
      "linkedin_url",
      "phone_number",
      "sync_status",
      "sending_status",
      "verification_status",
      "last_activity_at",
      "last_contacted_at",
      "custom_attributes",
      "query",
      "limit",
      "offset",
    ],
  },
);

const hunterIdInputSchema = s.object("The path parameters for a Hunter resource.", {
  id: hunterIdSchema,
});

const listLeadsListsInputSchema = s.object(
  "The query parameters for listing Hunter lead lists.",
  {
    limit: s.integer("The maximum number of lead lists to return.", { minimum: 1, maximum: 100 }),
    offset: s.nonNegativeInteger("The number of lead lists to skip for pagination."),
  },
  { optional: ["limit", "offset"] },
);

const createLeadsListInputSchema = s.object("The request payload for creating a Hunter leads list.", {
  name: s.nonEmptyString("The name of the Hunter leads list."),
});

export const hunterActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "account_information",
    description: "Retrieve information about the authenticated Hunter account.",
    inputSchema: emptyInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "combined_enrichment",
    description: "Retrieve combined person and company enrichment data from Hunter.",
    inputSchema: emailOrLinkedinInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "company_enrichment",
    description: "Retrieve company enrichment data for a domain from Hunter.",
    inputSchema: companyEnrichmentInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_lead",
    description: "Create a new lead in Hunter.",
    inputSchema: leadBodySchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "create_leads_list",
    description: "Create a new Hunter leads list.",
    inputSchema: createLeadsListInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "delete_lead",
    description: "Delete an existing Hunter lead.",
    inputSchema: hunterIdInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "discover_companies",
    description: "Discover companies in Hunter using a natural-language query or filters.",
    inputSchema: discoverCompaniesInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "domain_search",
    description: "Search public email addresses for a company domain in Hunter.",
    inputSchema: domainSearchInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "email_count",
    description: "Count email addresses available for a company domain in Hunter.",
    inputSchema: emailCountInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "email_finder",
    description: "Find the most likely professional email address for a person in Hunter.",
    inputSchema: emailFinderInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "email_verifier",
    description: "Verify the deliverability of an email address in Hunter.",
    inputSchema: s.object("The input payload for the Hunter email verifier request.", {
      email: s.email("The email address to verify."),
    }),
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "get_lead",
    description: "Retrieve a single Hunter lead.",
    inputSchema: hunterIdInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_custom_attributes",
    description: "List custom lead attributes configured in Hunter.",
    inputSchema: emptyInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_leads",
    description: "List leads saved in the authenticated Hunter account.",
    inputSchema: listLeadsInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "list_leads_lists",
    description: "List Hunter leads lists.",
    inputSchema: listLeadsListsInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "people_enrichment",
    description: "Retrieve person enrichment data from Hunter by email address or LinkedIn handle.",
    inputSchema: emailOrLinkedinInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "update_lead",
    description: "Update an existing Hunter lead.",
    inputSchema: leadUpdateInputSchema,
    outputSchema: hunterLooseObjectSchema,
  }),
  defineProviderAction(service, {
    name: "upsert_lead",
    description: "Create or update a Hunter lead by email address.",
    inputSchema: leadBodySchema,
    outputSchema: hunterLooseObjectSchema,
  }),
];
