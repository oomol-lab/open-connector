import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dropcontact";
const lifecycle = {
  startActionId: "dropcontact.submit_enrichment",
  statusActionId: "dropcontact.get_enrichment_result",
};

const rawObjectSchema = s.looseObject("A raw object returned by Dropcontact.");
const nullableIntegerSchema = s.nullableInteger("The integer value returned by Dropcontact when present.");
const nullableTextSchema = s.nullableString("The text returned by Dropcontact when present.");

const enrichmentContactSchema = s.actionInput(
  {
    email: s.nonEmptyString("The email address to verify or enrich."),
    first_name: s.nonEmptyString("The contact's first name."),
    last_name: s.nonEmptyString("The contact's last name."),
    full_name: s.nonEmptyString("The contact's full name."),
    phone: s.nonEmptyString("The contact's phone number."),
    company: s.nonEmptyString("The contact's company name."),
    website: s.nonEmptyString("The company website or domain."),
    num_siren: s.nonEmptyString("The French company SIREN number."),
    linkedin: s.nonEmptyString("The contact's LinkedIn URL or identifier."),
    siret: s.nonEmptyString("The French company SIRET number."),
    country: s.nonEmptyString("The country code used to guide enrichment."),
    job: s.nonEmptyString("The contact's job title."),
    company_linkedin: s.nonEmptyString("The company's LinkedIn URL or identifier."),
    custom_fields: s.record(
      "Custom string fields that Dropcontact returns unchanged.",
      s.string("One custom field value."),
    ),
  },
  [],
  "One contact or organization record for Dropcontact to enrich.",
);

export const dropcontactActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "submit_enrichment",
    operationType: "write",
    description: "Submit up to 250 contacts to Dropcontact for asynchronous email verification and enrichment.",
    asyncLifecycle: lifecycle,
    followUpActions: ["dropcontact.get_enrichment_result"],
    inputSchema: s.actionInput(
      {
        data: s.array("Contacts to enrich in one Dropcontact batch.", enrichmentContactSchema, {
          minItems: 1,
          maxItems: 250,
        }),
        siren: s.boolean(
          "Whether to request French company identifiers, address data, and company-leader information.",
        ),
        language: s.stringEnum("The language for enriched data. Dropcontact documents English.", ["en"]),
      },
      ["data"],
      "Input for submitting a Dropcontact enrichment batch.",
    ),
    outputSchema: s.actionOutput(
      {
        error: s.boolean("Whether Dropcontact reported an error for the submission."),
        request_id: nullableTextSchema,
        success: s.boolean("Whether Dropcontact accepted the enrichment batch."),
        credits_left: nullableIntegerSchema,
        raw: rawObjectSchema,
      },
      "The Dropcontact enrichment submission response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_enrichment_result",
    operationType: "read",
    description: "Retrieve the pending or completed contacts for a Dropcontact enrichment request.",
    asyncLifecycle: lifecycle,
    inputSchema: s.actionInput(
      {
        request_id: s.nonEmptyString("The request ID returned by submit_enrichment."),
        forceResults: s.boolean(
          "Whether to return processed records immediately while unprocessed records remain unchanged.",
        ),
      },
      ["request_id"],
      "Input for retrieving a Dropcontact enrichment request.",
    ),
    outputSchema: s.actionOutput(
      {
        error: s.boolean("Whether Dropcontact reported an error for the result request."),
        success: s.boolean("Whether Dropcontact has completed the enrichment request."),
        status: s.stringEnum("The connector lifecycle state derived from the Dropcontact response.", [
          "running",
          "succeeded",
          "failed",
        ]),
        reason: nullableTextSchema,
        credits_left: nullableIntegerSchema,
        data: s.array("Contacts returned by Dropcontact.", rawObjectSchema),
        raw: rawObjectSchema,
      },
      "The Dropcontact enrichment result response.",
    ),
  }),
];
