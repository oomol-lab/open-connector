import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "webvizio";

const webhookEventSchema = s.stringEnum("The Webvizio event type to subscribe to.", [
  "project.created",
  "project.updated",
  "project.deleted",
  "task.created",
  "task.updated",
  "task.deleted",
  "comment.created",
  "comment.deleted",
]);
const webhookIdSchema = s.positiveInteger("The Webvizio webhook subscription ID.");

export const webvizioActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_rest_hook_subscription",
    description:
      "Subscribe a callback URL to one Webvizio REST Hook event so Webvizio can send outbound event notifications to your service.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        url: s.url("The callback URL that Webvizio should call when the event fires."),
        event: webhookEventSchema,
      },
      ["url", "event"],
      "The input payload for creating one Webvizio REST Hook subscription.",
    ),
    outputSchema: s.actionOutput(
      {
        id: webhookIdSchema,
        event: webhookEventSchema,
        url: s.url("The callback URL that was subscribed."),
      },
      "The response returned after creating a Webvizio REST Hook subscription.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_rest_hook_subscription",
    description: "Unsubscribe one Webvizio REST Hook event subscription by its Webvizio webhook ID.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      { id: webhookIdSchema },
      ["id"],
      "The input payload for deleting one Webvizio REST Hook subscription.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the Webvizio REST Hook subscription was deleted."),
        id: webhookIdSchema,
      },
      "The response returned after deleting a Webvizio REST Hook subscription.",
    ),
  }),
];

export type WebvizioActionName = "create_rest_hook_subscription" | "delete_rest_hook_subscription";
