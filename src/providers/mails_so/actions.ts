import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mails_so" as const;

const validationResultType = s.stringEnum("The overall Mails validation result.", [
  "deliverable",
  "undeliverable",
  "risky",
  "unknown",
]);
const validationReason = s.stringEnum("The detailed reason returned by Mails for the validation result.", [
  "accepted_email",
  "invalid_format",
  "invalid_domain",
  "invalid_smtp",
  "rejected_email",
  "catch_all",
  "disposable",
  "no_connect",
  "timeout",
  "other",
]);

const validationResultSchema = s.object("One normalized Mails validation result.", {
  id: s.uuid("The validation result identifier."),
  email: s.email("The email address that was validated."),
  username: s.nullableString("The email username, or null when Mails did not return one."),
  domain: s.nullableString("The email domain, or null when Mails did not return one."),
  mxRecord: s.nullableString("The MX record, or null when Mails did not return one."),
  score: s.integer("The validation score from 0 to 100 returned by Mails.", { minimum: 0, maximum: 100 }),
  isValidFormat: s.boolean("Whether the email format is valid."),
  isValidDomain: s.boolean("Whether the email domain is valid."),
  isValidMx: s.nullableBoolean("Whether the MX record is valid, or null when Mails did not complete MX validation."),
  hasNoBlocklist: s.boolean("Whether the email was not found on a provider blocklist."),
  hasNoCatchall: s.boolean("Whether the email domain is not configured as catch-all."),
  hasNoGeneric: s.boolean("Whether the email is not a generic role inbox."),
  isFree: s.boolean("Whether the email uses a free mailbox provider."),
  result: validationResultType,
  reason: validationReason,
});

const batchMetadataSchema = {
  id: s.uuid("The batch job identifier."),
  name: s.nullableString("The batch job name, or null when Mails did not return one."),
  createdAt: s.dateTime("The ISO 8601 timestamp when the batch job was created."),
  updatedAt: s.dateTime("The ISO 8601 timestamp when the batch job was last updated."),
  deletedAt: s.nullable(
    s.dateTime("The batch job deletion timestamp, or null when the batch job has not been deleted."),
  ),
  finishedAt: s.nullable(
    s.dateTime("The batch job completion timestamp, or null when the batch job is still running."),
  ),
  userId: s.uuid("The Mails user identifier that owns the batch job."),
  size: s.nonNegativeInteger("The number of emails in the batch job."),
};

export const mailsSoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "validate_email",
    description: "Validate one email address with the Mails single validation endpoint.",
    inputSchema: s.object("The input payload for validating one email address.", {
      email: s.email("The email address to validate."),
    }),
    outputSchema: validationResultSchema,
  }),
  defineProviderAction(service, {
    name: "create_validation_batch",
    description: "Create one Mails batch validation job for a list of email addresses.",
    inputSchema: s.object("The input payload for creating one batch validation job.", {
      emails: s.array(
        "The list of email addresses to validate in one batch job.",
        s.email("One email address to include in the batch job."),
        {
          minItems: 1,
        },
      ),
    }),
    outputSchema: s.object(
      "The normalized batch job metadata returned after Mails accepts the batch request.",
      batchMetadataSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_validation_batch",
    description: "Fetch one Mails batch validation job together with its email results.",
    inputSchema: s.object("The input payload for fetching one batch validation job.", {
      batchId: s.uuid("The batch job identifier returned by Mails."),
    }),
    outputSchema: s.object("The normalized batch job detail returned by the Mails batch retrieval endpoint.", {
      ...batchMetadataSchema,
      emails: s.array("The normalized validation results returned for this batch job.", validationResultSchema),
    }),
  }),
];
