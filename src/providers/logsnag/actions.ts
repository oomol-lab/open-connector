import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "logsnag";

const valueSchema = s.anyOf("A string, number, or boolean value accepted by LogSnag.", [
  s.string("A string value."),
  s.number("A numeric value."),
  s.boolean("A boolean value."),
]);
const keyValueSchema = s.record("A LogSnag key-value object.", valueSchema);
const successOutputSchema = s.object(
  "The result returned after LogSnag accepts the request.",
  {
    ok: s.boolean("Whether LogSnag accepted the request."),
    status: s.integer("The upstream HTTP status code returned by LogSnag."),
    payload: s.unknown("The parsed JSON response body returned by LogSnag, when present."),
  },
  { optional: ["payload"] },
);

const publishEventInputSchema = s.object(
  "The payload for publishing a LogSnag event.",
  {
    project: s.nonEmptyString("The LogSnag project name."),
    channel: s.nonEmptyString("The LogSnag channel name."),
    event: s.nonEmptyString("The event name."),
    description: s.string("The optional event description."),
    icon: s.string("The optional emoji or emoji shortcode shown with the event."),
    notify: s.boolean("Whether LogSnag should send a push notification."),
    tags: keyValueSchema,
    parser: s.stringEnum("The parser LogSnag should apply to the description.", ["markdown", "text"]),
    user_id: s.string("The optional user identifier associated with the event."),
    timestamp: s.number("The optional Unix timestamp in seconds for historical events."),
  },
  { optional: ["description", "icon", "notify", "tags", "parser", "user_id", "timestamp"] },
);

const identifyUserInputSchema = s.object(
  "The payload for updating a LogSnag user profile.",
  {
    project: s.nonEmptyString("The LogSnag project name."),
    user_id: s.nonEmptyString("The user identifier to update."),
    properties: keyValueSchema,
  },
  { required: ["project", "user_id", "properties"] },
);

const publishInsightInputSchema = s.object(
  "The payload for publishing a LogSnag insight value.",
  {
    project: s.nonEmptyString("The LogSnag project name."),
    title: s.nonEmptyString("The insight title."),
    value: s.anyOf("The insight value.", [s.string("A string insight value."), s.number("A numeric insight value.")]),
    icon: s.string("The optional emoji or emoji shortcode shown with the insight."),
  },
  { optional: ["icon"] },
);

const mutateInsightInputSchema = s.object(
  "The payload for mutating a numeric LogSnag insight.",
  {
    project: s.nonEmptyString("The LogSnag project name."),
    title: s.nonEmptyString("The insight title."),
    value: s.object(
      "The LogSnag mutation object.",
      {
        $inc: s.number("The numeric amount to increment or decrement the insight value by."),
      },
      { required: ["$inc"] },
    ),
    icon: s.string("The optional emoji or emoji shortcode shown with the insight."),
  },
  { optional: ["icon"] },
);

export const logsnagActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "publish_event",
    description: "Publish an event to a LogSnag project channel.",
    requiredScopes: [],
    inputSchema: publishEventInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "identify_user",
    description: "Add or update key-value properties on a LogSnag user profile.",
    requiredScopes: [],
    inputSchema: identifyUserInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "publish_insight",
    description: "Publish the latest value for a LogSnag real-time insight.",
    requiredScopes: [],
    inputSchema: publishInsightInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "mutate_insight",
    description: "Increment or decrement an existing numeric LogSnag insight.",
    requiredScopes: [],
    inputSchema: mutateInsightInputSchema,
    outputSchema: successOutputSchema,
  }),
];
