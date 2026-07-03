import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bettercontact";

const rawObjectSchema = s.looseObject("The raw BetterContact payload.");
const enrichmentLeadSchema: JsonSchema = {
  ...s.object(
    "One lead submitted to BetterContact for enrichment.",
    {
      firstName: s.nonEmptyString("The contact first name."),
      lastName: s.nonEmptyString("The contact last name."),
      company: s.nonEmptyString("The contact company name when known."),
      companyDomain: s.nonEmptyString("The contact company domain when known."),
      linkedinUrl: s.url("The public LinkedIn profile URL for the contact."),
      customFields: s.looseObject("Arbitrary custom fields BetterContact should echo back in the enrichment result."),
    },
    { required: ["firstName", "lastName"], optional: ["company", "companyDomain", "linkedinUrl", "customFields"] },
  ),
  anyOf: [{ required: ["company"] }, { required: ["companyDomain"] }],
};
const enrichmentSummarySchema = s.object(
  "Summary counters returned by BetterContact enrichment results when available.",
  {
    total: s.nullableInteger("The total number of submitted leads."),
    valid: s.nullableInteger("The number of leads with a valid contact result."),
    catchAll: s.nullableInteger("The number of catch-all email results."),
    catchAllSafe: s.nullableInteger("The number of safe catch-all email results."),
    catchAllNotSafe: s.nullableInteger("The number of unsafe catch-all email results."),
    undeliverable: s.nullableInteger("The number of undeliverable email results."),
    notFound: s.nullableInteger("The number of leads for which no contact data was found."),
  },
);
const enrichmentResultEntrySchema = s.object("One normalized BetterContact enrichment result record.", {
  enriched: s.nullableBoolean("Whether BetterContact enriched this lead."),
  emailProvider: s.nullableString("The BetterContact email provider label returned for this lead when available."),
  contactFirstName: s.nullableString("The enriched contact first name when available."),
  contactLastName: s.nullableString("The enriched contact last name when available."),
  contactEmailAddress: s.nullableString("The enriched work email address when available."),
  contactEmailAddressStatus: s.nullableString("The BetterContact email status string when available."),
  contactGender: s.nullableString("The enriched contact gender when available."),
  contactJobTitle: s.nullableString("The enriched contact job title when available."),
  raw: rawObjectSchema,
});
const submitEnrichmentInputSchema: JsonSchema = {
  ...s.actionInput(
    {
      leads: s.array("The leads to enrich. BetterContact supports up to 100 leads per request.", enrichmentLeadSchema, {
        minItems: 1,
        maxItems: 100,
      }),
      enrichEmailAddress: s.boolean(
        "Whether BetterContact should enrich work email addresses for the submitted leads.",
      ),
      enrichPhoneNumber: s.boolean("Whether BetterContact should enrich direct phone numbers for the submitted leads."),
      webhookUrl: s.url("Optional webhook URL where BetterContact should push the enrichment result."),
      processFlowId: s.nonEmptyString(
        "Optional BetterContact process flow ID when your account uses the process flow add-on.",
      ),
    },
    ["leads", "enrichEmailAddress", "enrichPhoneNumber"],
    "Input for submitting BetterContact enrichment.",
  ),
  anyOf: [
    { properties: { enrichEmailAddress: { const: true } }, required: ["enrichEmailAddress"] },
    { properties: { enrichPhoneNumber: { const: true } }, required: ["enrichPhoneNumber"] },
  ],
};

export type BettercontactActionName = "get_account_balance" | "submit_enrichment" | "get_enrichment_result";

export const bettercontactActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_balance",
    description: "Get BetterContact credits for the connected account email or an optional email override.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        email: s.email("Optional BetterContact account email to query instead of the email stored during connection."),
      },
      [],
      "Optional BetterContact account email override.",
    ),
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether BetterContact reported success for the account request."),
        creditsLeft: s.integer("The remaining BetterContact credits for the queried account."),
        email: s.email("The BetterContact account email returned by the credits endpoint."),
        raw: rawObjectSchema,
      },
      "The BetterContact account balance response.",
    ),
  }),
  defineProviderAction(service, {
    name: "submit_enrichment",
    description: "Submit one or more leads to BetterContact waterfall enrichment and return the request handle.",
    requiredScopes: [],
    inputSchema: submitEnrichmentInputSchema,
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether BetterContact accepted the enrichment request."),
        requestId: s.nonEmptyString("The BetterContact request ID used to fetch enrichment results."),
        message: s.nonEmptyString("The BetterContact acceptance message."),
      },
      "The BetterContact enrichment submission response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_enrichment_result",
    description: "Get the current BetterContact enrichment result for a submitted request ID.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        requestId: s.nonEmptyString("The BetterContact request ID returned by submit_enrichment."),
      },
      ["requestId"],
      "Input for getting BetterContact enrichment results.",
    ),
    outputSchema: s.actionOutput(
      {
        requestId: s.nonEmptyString("The BetterContact request ID."),
        status: s.nonEmptyString("The BetterContact request status string."),
        creditsConsumed: s.nullableInteger(
          "The BetterContact credits consumed by this enrichment request when available.",
        ),
        creditsLeft: s.nullableInteger(
          "The BetterContact credits remaining after this enrichment request when available.",
        ),
        summary: s.nullable(enrichmentSummarySchema),
        results: s.array("The normalized BetterContact enrichment result records.", enrichmentResultEntrySchema),
        raw: rawObjectSchema,
      },
      "The normalized BetterContact enrichment result.",
    ),
  }),
];
