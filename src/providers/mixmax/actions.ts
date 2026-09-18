import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mixmax";

const sequenceIdSchema = s.nonEmptyString("The Mixmax sequence identifier.");
const cursorSchema = s.nonEmptyString("An opaque Mixmax pagination cursor.");
const sequenceLimitSchema = s.integer("Maximum number of sequences to return.", {
  minimum: 1,
  maximum: 300,
});
const recipientLimitSchema = s.integer("Maximum number of sequence recipients to return.", {
  minimum: 1,
  maximum: 50,
});
const recipientOffsetSchema = s.integer("Number of sequence recipients to skip.", {
  minimum: 0,
  maximum: 9_999,
});
const searchRecipientLimitSchema = s.integer("Maximum number of matching sequence recipients to return.");
const searchRecipientOffsetSchema = s.integer("Number of matching sequence recipients to skip.");

const scheduledAtSchema = s.anyOf(
  "A Unix timestamp in milliseconds for activation, or false to keep the recipient in draft.",
  [
    s.nonNegativeInteger("A Unix timestamp in milliseconds for sequence activation."),
    { const: false, description: "Keep the sequence recipient in draft." },
  ],
);

const sequenceStageSchema = s.anyOf("A sequence stage ID or an expanded stage object.", [
  s.nonEmptyString("A Mixmax sequence stage identifier."),
  s.looseObject("An expanded Mixmax sequence stage."),
]);

const sequenceSchema = s.looseRequiredObject(
  "A Mixmax sequence returned by the API.",
  {
    _id: sequenceIdSchema,
    userId: s.nonEmptyString("The Mixmax user ID that owns the sequence."),
    createdAt: s.nonEmptyString("When the sequence was created."),
    updatedAt: s.nonEmptyString("When the sequence was last updated."),
    name: s.nonEmptyString("The user-configured sequence name."),
    stages: s.array("The sequence stage IDs or expanded stage objects.", sequenceStageSchema),
    variables: s.array("The variable names used by the sequence.", s.nonEmptyString("A sequence variable name.")),
  },
  { optional: ["userId", "createdAt", "updatedAt", "stages", "variables"] },
);

const recipientVariablesSchema = s.looseObject(
  "Sequence variables for one recipient; either email or Email must equal the recipient email.",
  {
    email: s.email("The recipient email stored in the lowercase email variable."),
    Email: s.email("The recipient email stored in the uppercase Email variable."),
  },
);

const addRecipientSchema = s.object(
  "One recipient to add to a Mixmax sequence.",
  {
    email: s.email("The recipient email address."),
    variables: recipientVariablesSchema,
    scheduledAt: scheduledAtSchema,
  },
  { optional: ["variables", "scheduledAt"] },
);

const sequenceRecipientStateSchema = s.stringEnum("The current sequence recipient state.", [
  "active",
  "failed",
  "completed",
]);

const sequenceRecipientSchema = s.looseRequiredObject(
  "An activated Mixmax sequence recipient.",
  {
    _id: s.nonEmptyString("The Mixmax sequence recipient identifier."),
    userId: s.nonEmptyString("The Mixmax user ID that created the recipient."),
    createdAt: s.nonEmptyString("When the sequence recipient was created."),
    updatedAt: s.nonEmptyString("When the sequence recipient was last updated."),
    sequenceId: sequenceIdSchema,
    email: s.email("The sequence recipient email address."),
    state: sequenceRecipientStateSchema,
    variables: s.looseObject("The optional variables assigned to the sequence recipient."),
  },
  { optional: ["userId", "createdAt", "updatedAt", "variables"] },
);

const processedRecipientSchema = s.looseRequiredObject(
  "The result of adding one recipient to a Mixmax sequence.",
  {
    email: s.nonEmptyString(
      "The processed recipient value reported by Mixmax, including invalid values returned with an error status.",
    ),
    status: s.stringEnum("The result of processing the recipient.", ["success", "error", "duplicated", "unsubscribed"]),
    errors: s.array(
      "The errors reported when the recipient could not be added.",
      s.nonEmptyString("One recipient processing error."),
    ),
  },
  { optional: ["errors"] },
);

const searchResultSchema = s.looseRequiredObject(
  "A Mixmax sequence recipient search result with provider-defined analytics details.",
  {
    _id: s.nonEmptyString("The Mixmax sequence recipient identifier."),
    userId: s.nonEmptyString("The Mixmax user ID that owns the sequence recipient."),
    sequenceId: sequenceIdSchema,
    email: s.email("The sequence recipient email address."),
    state: s.nonEmptyString("The sequence recipient state."),
    name: s.nonEmptyString("The sequence recipient name."),
    stages: s.array(
      "The provider-defined stage analytics for the sequence recipient.",
      s.looseObject("One provider-defined stage analytics object."),
    ),
  },
  { optional: ["userId", "state", "name", "stages"] },
);

const listSequencesInputSchema = s.object(
  "The input payload for listing Mixmax sequences.",
  {
    name: s.nonEmptyString("Return sequences whose name matches this value."),
    expand: s.stringEnum("The sequence field to expand.", ["stages"]),
    folder: s.nonEmptyString("Filter by personal, shared, or a Mixmax sequence folder identifier."),
    limit: sequenceLimitSchema,
    next: cursorSchema,
    previous: cursorSchema,
    fields: s.nonEmptyString("Comma-separated response fields to include."),
  },
  { optional: ["name", "expand", "folder", "limit", "next", "previous", "fields"] },
);

const listSequenceRecipientsInputSchema = s.object(
  "The input payload for listing recipients activated in one Mixmax sequence.",
  {
    sequenceId: sequenceIdSchema,
    analyticsFrom: s.nonEmptyString("Analytics source: myself, a Mixmax team ID, or omit for everyone."),
    limit: recipientLimitSchema,
    offset: recipientOffsetSchema,
    sortBy: s.stringEnum("The recipient field used for sorting.", [
      "email",
      "lastStage",
      "lastMessageCreated",
      "nextStageScheduledAt",
      "opens",
      "clicks",
      "replied",
      "downloads",
      "accepted",
    ]),
    sortDesc: s.boolean("Whether to sort sequence recipients in descending order."),
    includeVariables: s.boolean("Whether to include recipient variables in the response."),
  },
  { optional: ["analyticsFrom", "limit", "offset", "sortBy", "sortDesc", "includeVariables"] },
);

const searchSequenceRecipientsInputSchema = s.object(
  "The input payload for searching Mixmax sequence recipients.",
  {
    query: s.nonEmptyString("A case-insensitive recipient email search string, such as from:mixmax.com."),
    recipients: s.array("Exact recipient email addresses to search for.", s.email("One recipient email address."), {
      minItems: 1,
    }),
    sequenceId: sequenceIdSchema,
    offset: searchRecipientOffsetSchema,
    limit: searchRecipientLimitSchema,
  },
  { optional: ["query", "recipients", "sequenceId", "offset", "limit"] },
);

const listSequencesAction = defineProviderAction(service, {
  name: "list_sequences",
  operationType: "read",
  description: "List Mixmax sequences with optional name, folder, expansion, and cursor filters.",
  inputSchema: listSequencesInputSchema,
  outputSchema: s.looseRequiredObject(
    "The response returned when listing Mixmax sequences.",
    {
      results: s.array("The Mixmax sequences available to the current user.", sequenceSchema),
      next: s.nullable(s.string("The cursor for the next page.")),
      hasNext: s.boolean("Whether another sequence page is available."),
      previous: s.nullable(s.string("The cursor for the previous page.")),
      hasPrevious: s.boolean("Whether a previous sequence page is available."),
    },
    { optional: ["next", "hasNext", "previous", "hasPrevious"] },
  ),
});

const listSequenceRecipientsAction = defineProviderAction(service, {
  name: "list_sequence_recipients",
  operationType: "read",
  description: "List activated recipients for one Mixmax sequence with offset pagination.",
  inputSchema: listSequenceRecipientsInputSchema,
  outputSchema: s.array("The activated Mixmax sequence recipients returned by the API.", sequenceRecipientSchema),
});

const addSequenceRecipientsAction = defineProviderAction(service, {
  name: "add_sequence_recipients",
  operationType: "write",
  description: "Add recipients to a Mixmax sequence and optionally schedule them or keep them in draft.",
  inputSchema: s.object(
    "The input payload for adding recipients to a Mixmax sequence.",
    {
      sequenceId: sequenceIdSchema,
      recipients: s.array("The recipients to add to the sequence.", addRecipientSchema, {
        minItems: 1,
      }),
      scheduledAt: scheduledAtSchema,
      enrich: s.boolean("Whether Mixmax should enrich recipients from stored contact data."),
      allowMissingVariables: s.boolean(
        "Whether Mixmax should accept recipients missing variables used by the sequence.",
      ),
    },
    { optional: ["scheduledAt", "enrich", "allowMissingVariables"] },
  ),
  outputSchema: s.array("The per-recipient processing results returned by Mixmax.", processedRecipientSchema),
});

const searchSequenceRecipientsAction = defineProviderAction(service, {
  name: "search_sequence_recipients",
  operationType: "read",
  description:
    "Search Mixmax sequence recipients by query text or exact email addresses, optionally within one sequence.",
  inputSchema: searchSequenceRecipientsInputSchema,
  outputSchema: s.object(
    "The response returned when searching Mixmax sequence recipients.",
    {
      total: s.nonNegativeInteger("The total number of matching sequence recipients."),
      results: s.array("The matching Mixmax sequence recipients.", searchResultSchema),
    },
    { required: ["total", "results"], additionalProperties: true },
  ),
});

export const mixmaxActions: ActionDefinition[] = [
  listSequencesAction,
  listSequenceRecipientsAction,
  addSequenceRecipientsAction,
  searchSequenceRecipientsAction,
];
