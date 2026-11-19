import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
import { bucketNameSchema, jurisdictionSchema, readPermissions, writePermissions } from "./schemas.ts";

const queuesReadPermissions = ["Queues Read"];

const queuesWritePermissions = ["Queues Write"];

const eventActionSchema = s.stringEnum("An R2 object action that triggers a notification.", [
  "PutObject",
  "CopyObject",
  "DeleteObject",
  "CompleteMultipartUpload",
  "LifecycleDeletion",
]);

const queueIdSchema = s.nonEmptyString("The Cloudflare Queue ID.");

const eventNotificationRuleSchema = s.object(
  "An event notification rule bound to a queue.",
  {
    ruleId: s.optional(s.string("The rule ID.")),
    createdAt: s.optional(s.string("When the rule was created.")),
    description: s.optional(s.string("A description that identifies the rule.")),
    actions: s.array("The object actions that trigger notifications.", eventActionSchema),
    prefix: s.optional(s.string("Notifications are only sent for objects with this key prefix.")),
    suffix: s.optional(s.string("Notifications are only sent for objects with this key suffix.")),
  },
  { optional: ["ruleId", "createdAt", "description", "prefix", "suffix"] },
);

const queueNotificationConfigSchema = s.object(
  "The notification rules bound to one queue.",
  {
    queueId: s.string("The queue ID."),
    queueName: s.optional(s.string("The queue name.")),
    rules: s.array("The rules bound to the queue.", eventNotificationRuleSchema),
  },
  { optional: ["queueName"] },
);

export const actions: ActionDefinition[] = [
  defineProviderAction("cloudflare", {
    name: "list_event_notification_rules",
    operationType: "read",
    description: "List every event notification rule of an R2 bucket grouped by target queue.",
    requiredScopes: [],
    providerPermissions: [...readPermissions, ...queuesReadPermissions],
    inputSchema: s.object(
      "Input for listing event notification rules.",
      {
        accountId: s.optional(s.string("The Cloudflare account ID. Defaults to the connection account.")),
        bucketName: bucketNameSchema,
        jurisdiction: s.optional(jurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The event notification configuration of the bucket.", {
      bucketName: s.string("The bucket name."),
      queues: s.array("The queues receiving notifications and their rules.", queueNotificationConfigSchema),
    }),
  }),
  defineProviderAction("cloudflare", {
    name: "get_event_notification_rules",
    operationType: "read",
    description: "Get the event notification rules that send R2 bucket events to one queue.",
    requiredScopes: [],
    providerPermissions: [...readPermissions, ...queuesReadPermissions],
    inputSchema: s.object(
      "Input for reading the rules bound to one queue.",
      {
        accountId: s.optional(s.string("The Cloudflare account ID. Defaults to the connection account.")),
        bucketName: bucketNameSchema,
        queueId: queueIdSchema,
        jurisdiction: s.optional(jurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: queueNotificationConfigSchema,
  }),
  defineProviderAction("cloudflare", {
    name: "create_event_notification_rules",
    operationType: "write",
    description: "Add event notification rules that send R2 bucket events to a Cloudflare Queue.",
    requiredScopes: [],
    providerPermissions: [...writePermissions, ...queuesWritePermissions],
    inputSchema: s.object(
      "Input for creating event notification rules.",
      {
        accountId: s.optional(s.string("The Cloudflare account ID. Defaults to the connection account.")),
        bucketName: bucketNameSchema,
        queueId: queueIdSchema,
        rules: s.array(
          "The rules to add.",
          s.object(
            "An event notification rule to create.",
            {
              actions: s.array("The object actions that trigger notifications.", eventActionSchema, {
                minItems: 1,
              }),
              description: s.optional(s.string("A description that identifies the rule.")),
              prefix: s.optional(s.string("Only send notifications for objects with this key prefix.")),
              suffix: s.optional(s.string("Only send notifications for objects with this key suffix.")),
            },
            { optional: ["description", "prefix", "suffix"] },
          ),
          { minItems: 1 },
        ),
        jurisdiction: s.optional(jurisdictionSchema),
      },
      { optional: ["jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The rule creation result.", {
      bucketName: s.string("The bucket the rules were added to."),
      queueId: s.string("The queue the rules send events to."),
      created: s.boolean("Whether the create request succeeded."),
    }),
  }),
  defineProviderAction("cloudflare", {
    name: "delete_event_notification_rules",
    operationType: "destructive",
    description:
      "Delete event notification rules bound to one queue. Deletes every rule for the queue when ruleIds is omitted.",
    requiredScopes: [],
    providerPermissions: [...writePermissions, ...queuesWritePermissions],
    inputSchema: s.object(
      "Input for deleting event notification rules.",
      {
        accountId: s.optional(s.string("The Cloudflare account ID. Defaults to the connection account.")),
        bucketName: bucketNameSchema,
        queueId: queueIdSchema,
        ruleIds: s.optional(
          s.array("The rule IDs to delete. Omit to delete every rule for the queue.", s.string("A rule ID."), {
            minItems: 1,
          }),
        ),
        jurisdiction: s.optional(jurisdictionSchema),
      },
      { optional: ["ruleIds", "jurisdiction"] },
    ),
    outputSchema: s.requiredObject("The rule deletion result.", {
      bucketName: s.string("The bucket the rules were removed from."),
      queueId: s.string("The queue whose rules were removed."),
      deleted: s.boolean("Whether the delete request succeeded."),
    }),
  }),
];
