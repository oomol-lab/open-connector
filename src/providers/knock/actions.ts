import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "knock";

const userIdSchema = s.nonEmptyString("The Knock user ID.");
const cursorSchema = s.nonEmptyString("A Knock pagination cursor.");
const includeSchema = s.stringArray("Associated resources to include in the Knock response.", {
  minItems: 1,
  itemDescription: "One Knock include value.",
});
const customPropertiesSchema = s.looseObject(
  "Additional user properties to send to Knock as top-level identify fields.",
);
const channelDataSchema = s.looseObject("Knock channel data keyed by channel ID.");
const preferencesSchema = s.looseObject("Knock user preference data.");
const workflowDataSchema = s.looseObject("Workflow data payload passed to Knock.");
const workflowSettingsSchema = s.looseObject("Workflow trigger settings passed to Knock.");
const inlineObjectSchema = s.looseObject("Inline Knock identification object.");
const workflowReferenceSchema = s.anyOf("A Knock ID string or inline identification object.", [
  s.nonEmptyString("A Knock ID string."),
  inlineObjectSchema,
]);

const userSchema = s.looseObject("A normalized Knock user.", {
  id: s.string("The Knock user ID."),
  email: s.nullableString("The user's email address when present."),
  name: s.nullableString("The user's display name when present."),
  createdAt: s.nullableString("When the Knock user was created."),
  updatedAt: s.nullableString("When the Knock user was last updated."),
  raw: s.looseObject("The raw Knock user payload."),
});

const pageInfoSchema = s.looseObject("Knock pagination information.", {
  after: s.nullableString("The next-page cursor when present."),
  before: s.nullableString("The previous-page cursor when present."),
  pageSize: s.nullableInteger("The page size returned by Knock."),
  raw: s.looseObject("The raw Knock page_info payload."),
});

const listUsersInputSchema = s.object(
  "Parameters for listing Knock users.",
  {
    include: includeSchema,
    after: cursorSchema,
    before: cursorSchema,
    pageSize: s.positiveInteger("The number of users to return. Knock defaults to 50.", { maximum: 50 }),
  },
  { optional: ["include", "after", "before", "pageSize"] },
);

const getUserInputSchema = s.actionInput(
  {
    userId: userIdSchema,
  },
  ["userId"],
  "Identifier for retrieving a Knock user.",
);

const identifyUserInputSchema = s.object(
  "Parameters for creating or updating a Knock user.",
  {
    userId: userIdSchema,
    email: s.nonEmptyString("The user's email address."),
    name: s.nonEmptyString("The user's display name."),
    timezone: s.nonEmptyString("The user's IANA timezone."),
    avatar: s.nonEmptyString("The user's avatar URL."),
    phoneNumber: s.nonEmptyString("The user's phone number."),
    channelData: channelDataSchema,
    preferences: preferencesSchema,
    properties: customPropertiesSchema,
  },
  {
    optional: ["email", "name", "timezone", "avatar", "phoneNumber", "channelData", "preferences", "properties"],
  },
);

const deleteUserInputSchema = s.actionInput(
  {
    userId: userIdSchema,
  },
  ["userId"],
  "Identifier for deleting a Knock user.",
);

const triggerWorkflowInputSchema = s.object(
  "Parameters for triggering a Knock workflow.",
  {
    key: s.nonEmptyString("The Knock workflow key to trigger."),
    recipients: s.array("Workflow recipients as Knock IDs or inline identification objects.", workflowReferenceSchema, {
      minItems: 1,
    }),
    data: workflowDataSchema,
    actor: workflowReferenceSchema,
    tenant: workflowReferenceSchema,
    cancellationKey: s.nonEmptyString("A cancellation key for the workflow run."),
    settings: workflowSettingsSchema,
    idempotencyKey: s.nonEmptyString("An optional Idempotency-Key header value for safe retries."),
  },
  {
    optional: ["data", "actor", "tenant", "cancellationKey", "settings", "idempotencyKey"],
  },
);

export const knockActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    description: "List Knock users with cursor pagination.",
    inputSchema: listUsersInputSchema,
    outputSchema: s.actionOutput(
      {
        users: s.array("Users returned by Knock.", userSchema),
        pageInfo: pageInfoSchema,
      },
      "Knock users list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Retrieve a Knock user by user ID.",
    inputSchema: getUserInputSchema,
    outputSchema: s.actionOutput(
      {
        user: userSchema,
      },
      "Knock user retrieval response.",
    ),
  }),
  defineProviderAction(service, {
    name: "identify_user",
    description: "Create or update a Knock user with identification data.",
    inputSchema: identifyUserInputSchema,
    outputSchema: s.actionOutput(
      {
        user: userSchema,
      },
      "Knock user identify response.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_user",
    description: "Permanently delete a Knock user and associated data.",
    inputSchema: deleteUserInputSchema,
    outputSchema: s.actionOutput(
      {
        success: s.boolean("Whether the delete request completed successfully."),
        userId: userIdSchema,
      },
      "Knock user deletion response.",
    ),
  }),
  defineProviderAction(service, {
    name: "trigger_workflow",
    description: "Trigger a Knock workflow for one or more recipients and return the workflow run request ID.",
    inputSchema: triggerWorkflowInputSchema,
    outputSchema: s.actionOutput(
      {
        workflowRunId: s.string("The workflow_run_id returned by Knock."),
        raw: s.looseObject("The raw Knock workflow trigger payload."),
      },
      "Knock workflow trigger response.",
    ),
  }),
];

export type KnockActionName = (typeof knockActions)[number]["name"];
