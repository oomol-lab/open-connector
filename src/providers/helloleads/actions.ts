import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "helloleads";

const fieldValueSchema = s.anyOf("One submitted HelloLeads field value.", [
  s.string("One submitted HelloLeads string field value."),
  s.number("One submitted HelloLeads numeric field value."),
  s.boolean("One submitted HelloLeads boolean field value."),
  s.array(
    "Multiple submitted values for one HelloLeads multiselect field.",
    s.string("One selected multiselect option value."),
    { minItems: 1 },
  ),
]);

const webFormFieldSchema = s.requiredObject("One visible field exposed by a HelloLeads web form.", {
  name: s.string("The field identifier expected by HelloLeads."),
  label: s.string("The field label shown in HelloLeads."),
  type: s.stringEnum("The normalized HelloLeads field type.", [
    "text",
    "textarea",
    "dropdown",
    "multiselect",
    "date",
    "file",
    "unknown",
  ]),
  required: s.boolean("Whether HelloLeads marks the field as required."),
  placeholder: s.nullableString("The placeholder configured for the field when present."),
  acceptsMultiple: s.boolean("Whether the field accepts multiple submitted values."),
  allowsFileUpload: s.boolean("Whether the field requires or accepts file uploads."),
  custom: s.boolean("Whether HelloLeads marks the field as a custom field."),
  options: s.stringArray("The configured option values for dropdown-like fields."),
});

export const helloleadsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_web_form_definition",
    description:
      "Fetch the visible HelloLeads web form definition for the connected Web Form Key and report whether reCAPTCHA v2 is enabled.",
    inputSchema: s.actionInput(
      {},
      [],
      "No additional input is required for fetching the connected HelloLeads web form definition.",
    ),
    outputSchema: s.actionOutput(
      {
        organizationId: s.nullableString("The HelloLeads organization ID returned by the form definition API."),
        eventId: s.nullableString("The HelloLeads event ID returned by the form definition API."),
        country: s.nullableString("The default country returned by HelloLeads when present."),
        mobileCode: s.nullableString("The default mobile country code returned by HelloLeads when present."),
        requiresRecaptcha: s.boolean("Whether HelloLeads reports reCAPTCHA v2 for this web form."),
        fields: s.array("The visible HelloLeads fields that callers may fill.", webFormFieldSchema),
      },
      "The normalized HelloLeads web form definition.",
    ),
  }),
  defineProviderAction(service, {
    name: "submit_web_form",
    description:
      "Submit one HelloLeads web form lead with JSON field values, excluding reCAPTCHA and file-upload workflows.",
    inputSchema: s.actionInput(
      {
        countryCode: s.nonEmptyString(
          "Optional mobile country code such as +91. When provided with a mobile field, it is prepended unless the mobile value already starts with the same code.",
        ),
        values: s.record(
          "Field values keyed by the HelloLeads form field names returned by get_web_form_definition.",
          fieldValueSchema,
        ),
      },
      ["values"],
      "The input payload for submitting one HelloLeads web form lead.",
    ),
    outputSchema: s.actionOutput(
      {
        successful: s.boolean("Whether HelloLeads reported a successful form submission."),
        status: s.string("The raw HelloLeads status string."),
        message: s.string("The human-readable HelloLeads submission message."),
        submissionAction: s.nullableString("The HelloLeads submissionAction value when returned."),
        leadFullName: s.nullableString("The full lead name returned by HelloLeads when present."),
        visitorId: s.nullableString("The HelloLeads visitor ID returned after submission."),
        userId: s.nullableString("The HelloLeads user ID returned after submission."),
        eventId: s.nullableString("The HelloLeads event ID returned after submission."),
        raw: s.looseObject("The raw HelloLeads submission payload."),
      },
      "The normalized HelloLeads web form submission result.",
    ),
  }),
];
