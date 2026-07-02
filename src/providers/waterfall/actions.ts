import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "waterfall";

const rawObjectSchema = s.looseObject("The raw object returned by Waterfall.");
const usageSchema = s.looseObject("Usage counters returned by Waterfall.", {
  prospector_requests: s.integer("Number of Prospector Launcher jobs submitted."),
  prospector_persons: s.integer("Number of contacts returned by Prospector."),
  prospector_persons_phones: s.integer("Phone numbers returned via Prospector."),
  enrichment_contact_requests: s.integer("Number of Contact Enrichment jobs submitted."),
  enrichment_contact_persons: s.integer("Contacts successfully enriched."),
  enrichment_contact_persons_phones: s.integer("Phone numbers returned via Contact Enrichment."),
  enrichment_phone_requests: s.integer("Number of Phone Enrichment jobs submitted."),
  enrichment_phone_phones: s.integer("Phone numbers successfully returned."),
  enrichment_company_requests: s.integer("Number of Company Enrichment jobs submitted."),
  enrichment_company_companies: s.integer("Companies successfully enriched."),
  search_contact_requests: s.integer("Number of Search Contact jobs submitted."),
  search_contact_found: s.integer("Contacts returned by Search Contact."),
  verify_email_requests: s.integer("Number of Email Verifier calls made."),
  verify_email_verified: s.integer("Emails that returned a definitive verification status."),
  balance_remaining_usd: s.number("Remaining account balance in USD."),
});
const customFieldsSchema = s.record(
  "Custom metadata to echo back in Waterfall finder responses.",
  s.anyOf("A custom metadata value.", [
    s.string("A custom metadata string."),
    s.number("A custom metadata number."),
    s.boolean("A custom metadata boolean."),
  ]),
);
const jobEnvelopeSchema = s.looseRequiredObject(
  "Waterfall job envelope.",
  {
    job_id: s.nonEmptyString("The Waterfall job ID."),
    status: s.nonEmptyString("The current Waterfall job status."),
    input: rawObjectSchema,
    output: rawObjectSchema,
    raw: rawObjectSchema,
  },
  { optional: ["input", "output"] },
);
const jobIdInputSchema = s.actionInput(
  {
    job_id: s.nonEmptyString("The Waterfall job ID returned by a launcher action."),
  },
  ["job_id"],
  "The input payload for retrieving a Waterfall job.",
);

const contactEnrichmentInputSchema = requireAtLeastOneFieldSet(
  s.object(
    "The input payload for launching Waterfall contact enrichment.",
    {
      email: s.email("Professional or personal email address to enrich."),
      linkedin: s.nonEmptyString("LinkedIn profile URL or slug for the contact."),
      full_name: s.nonEmptyString("Full name of the contact."),
      first_name: s.nonEmptyString("First name of the contact."),
      last_name: s.nonEmptyString("Last name of the contact."),
      domain: s.nonEmptyString("Company domain used with the contact name."),
      include_phones: s.boolean("Whether Waterfall should also run phone enrichment."),
      webhook_url: s.url("Webhook URL that Waterfall should call when the job completes."),
      custom_fields: customFieldsSchema,
    },
    {
      optional: [
        "email",
        "linkedin",
        "full_name",
        "first_name",
        "last_name",
        "domain",
        "include_phones",
        "webhook_url",
        "custom_fields",
      ],
    },
  ),
  [["email"], ["linkedin"], ["full_name", "domain"], ["first_name", "last_name", "domain"]],
  "At least one official contact enrichment identifier strategy is required.",
);

const companyEnrichmentInputSchema = requireAtLeastOneFieldSet(
  s.object(
    "The input payload for launching Waterfall company enrichment.",
    {
      domain: s.nonEmptyString("Company domain or full URL to enrich."),
      linkedin: s.nonEmptyString("Company LinkedIn URL or slug to enrich."),
      name: s.nonEmptyString("Company name to enrich when domain or LinkedIn is not available."),
      webhook_url: s.url("Webhook URL that Waterfall should call when the job completes."),
      custom_fields: customFieldsSchema,
    },
    { optional: ["domain", "linkedin", "name", "webhook_url", "custom_fields"] },
  ),
  [["domain"], ["linkedin"], ["name"]],
  "At least one official company enrichment identifier is required.",
);

const jobChangeInputSchema = requireAtLeastOneFieldSet(
  s.object(
    "The input payload for checking whether a contact changed jobs.",
    {
      company_domain: s.nonEmptyString("Previous company domain for the contact."),
      company_linkedin: s.nonEmptyString("Previous company LinkedIn URL or slug."),
      contact_linkedin: s.nonEmptyString("Contact LinkedIn URL or slug."),
      professional_email: s.email("Contact professional email address."),
      personal_email: s.email("Contact personal email address."),
      contact_full_name: s.nonEmptyString("Full name of the contact."),
      custom_fields: customFieldsSchema,
    },
    {
      optional: [
        "company_domain",
        "company_linkedin",
        "contact_linkedin",
        "professional_email",
        "personal_email",
        "contact_full_name",
        "custom_fields",
      ],
    },
  ),
  [
    ["company_domain", "contact_linkedin"],
    ["company_domain", "professional_email"],
    ["company_domain", "personal_email"],
    ["company_domain", "contact_full_name"],
    ["company_linkedin", "contact_linkedin"],
    ["company_linkedin", "professional_email"],
    ["company_linkedin", "personal_email"],
    ["professional_email", "contact_full_name"],
    ["professional_email"],
  ],
  "At least one official job change identifier strategy is required.",
);

export const waterfallActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "verify_email",
    description: "Verify one email address with Waterfall and return deliverability status.",
    inputSchema: s.actionInput(
      {
        email: s.email("Email address to verify."),
      },
      ["email"],
      "The input payload for Waterfall email verification.",
    ),
    outputSchema: s.actionOutput(
      {
        status: s.stringEnum("The Waterfall email deliverability status.", ["valid", "risky", "invalid", "unknown"]),
        email: s.string("The email address that Waterfall verified."),
        reason: s.string("Optional Waterfall reason for the verification status."),
        usage: s.nullable(usageSchema),
        raw: rawObjectSchema,
      },
      "The response returned by Waterfall email verification.",
    ),
  }),
  defineProviderAction(service, {
    name: "launch_contact_enrichment",
    description: "Launch a Waterfall contact enrichment job and return the job envelope.",
    inputSchema: contactEnrichmentInputSchema,
    outputSchema: jobEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact_enrichment",
    description: "Retrieve Waterfall contact enrichment job state and output by job ID.",
    inputSchema: jobIdInputSchema,
    outputSchema: jobEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "launch_company_enrichment",
    description: "Launch a Waterfall company enrichment job and return the job envelope.",
    inputSchema: companyEnrichmentInputSchema,
    outputSchema: jobEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_company_enrichment",
    description: "Retrieve Waterfall company enrichment job state and output by job ID.",
    inputSchema: jobIdInputSchema,
    outputSchema: jobEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "check_job_change",
    description: "Check whether a contact changed jobs using Waterfall job change detection.",
    inputSchema: jobChangeInputSchema,
    outputSchema: jobEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_account_usage",
    description: "Get Waterfall usage metrics for the authenticated API key and full account.",
    inputSchema: s.actionInput(
      {
        month: s.string({
          minLength: 7,
          maxLength: 7,
          description: "Optional month in YYYY-MM format used to scope usage counters.",
        }),
      },
      [],
      "The input payload for Waterfall account usage reporting.",
    ),
    outputSchema: s.actionOutput(
      {
        key_usage: usageSchema,
        account_usage: usageSchema,
        balance_remaining_usd: s.number("Remaining account balance in USD."),
        raw: rawObjectSchema,
      },
      "The Waterfall account usage response.",
    ),
  }),
];

export type WaterfallActionName = (typeof waterfallActions)[number]["name"];

function requireAtLeastOneFieldSet(
  schema: JsonSchema,
  fieldSets: readonly (readonly string[])[],
  description: string,
): JsonSchema {
  return {
    ...schema,
    anyOf: fieldSets.map((fieldSet) => ({
      type: "object",
      required: [...fieldSet],
      additionalProperties: true,
      description,
    })),
  };
}
