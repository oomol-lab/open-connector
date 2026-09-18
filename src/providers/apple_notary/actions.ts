import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "apple_notary";
const submissionId = s.uuid("The submission identifier returned by Apple.");
const submission = s.looseRequiredObject(
  "One Apple notarization submission.",
  {
    id: s.string("The submission identifier."),
    name: s.nullableString("The submitted file name."),
    status: s.nullable(
      s.stringEnum("The current notarization status.", ["Accepted", "In Progress", "Invalid", "Rejected"]),
    ),
    createdDate: s.nullableString("The submission creation timestamp."),
  },
  { optional: ["name", "status", "createdDate"] },
);

export const appleNotaryActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "submit_software",
    operationType: "write",
    description: "Create a notarization submission and return temporary Amazon S3 upload credentials.",
    asyncLifecycle: {
      startActionId: "apple_notary.submit_software",
      statusActionId: "apple_notary.get_submission_status",
    },
    inputSchema: s.object("The software to submit for notarization.", {
      submissionName: s.nonWhitespaceString("The file name, including its .zip, .dmg, or .pkg extension."),
      sha256: s.string("The 64-character hexadecimal SHA-256 digest of the uploaded file.", {
        minLength: 64,
        maxLength: 64,
        pattern: "^[0-9a-fA-F]+$",
      }),
      notificationWebhookUrls: s.optional(
        s.array(
          "Webhook URLs Apple should notify when notarization finishes.",
          s.url("A publicly reachable webhook URL."),
          { minItems: 1, uniqueItems: true },
        ),
      ),
    }),
    outputSchema: s.object("The submission and temporary upload credentials.", {
      submissionId: s.string("The new submission identifier."),
      upload: s.object("Temporary Amazon S3 upload credentials.", {
        bucket: s.string("The S3 bucket."),
        object: s.string("The S3 object key."),
        awsAccessKeyId: s.string("The temporary access key ID."),
        awsSecretAccessKey: s.string("The temporary secret access key."),
        awsSessionToken: s.string("The temporary session token."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_submission_status",
    operationType: "read",
    description: "Read the state of one notarization submission.",
    asyncLifecycle: {
      startActionId: "apple_notary.submit_software",
      statusActionId: "apple_notary.get_submission_status",
    },
    inputSchema: s.object("The submission to read.", { submissionId }),
    outputSchema: s.object("The requested submission.", { submissionId, submission }),
  }),
  defineProviderAction(service, {
    name: "list_submissions",
    operationType: "read",
    description: "List up to the 100 most recent notarization submissions for the connected team.",
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The recent submissions.", {
      submissions: s.array("The submissions Apple returned.", submission),
    }),
  }),
  defineProviderAction(service, {
    name: "get_submission_log",
    operationType: "read",
    description: "Get a temporary download URL for a notarization submission log.",
    inputSchema: s.object("The submission whose log should be read.", { submissionId }),
    outputSchema: s.object("The temporary log location.", {
      submissionId,
      developerLogUrl: s.url("The temporary notarization log URL."),
    }),
  }),
];
