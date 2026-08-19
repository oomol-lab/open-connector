import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "segment";

const jsonValueSchema = s.unknown("A JSON-compatible Segment field value.");
const userIdSchema = s.nonEmptyString("Unique identifier for the user in your database.");
const anonymousIdSchema = s.nonEmptyString("Pseudo-unique anonymous identifier for the user.");
const contextSchema = s.record("Segment context object with extra information about the event.", jsonValueSchema);
const integrationsSchema = s.record("Segment destination flags keyed by destination name.", jsonValueSchema);
const timestampSchema = s.dateTime("Timestamp when the message took place, in ISO 8601 format.");
const sentAtSchema = s.dateTime("Timestamp when the message was sent to Segment, in ISO 8601 format.");
const messageIdSchema = s.string({
  description: "Unique message identifier used by Segment for deduplication.",
  minLength: 1,
  maxLength: 100,
});
const acceptedOutputSchema = s.actionOutput(
  {
    accepted: s.boolean("Whether Segment accepted the HTTP request."),
    status: s.integer("HTTP status returned by Segment."),
    raw: s.unknown("Raw response payload returned by Segment, or null when the body is empty."),
  },
  "Normalized Segment HTTP API acceptance response.",
);

const commonMessageFields = {
  userId: userIdSchema,
  anonymousId: anonymousIdSchema,
  context: contextSchema,
  integrations: integrationsSchema,
  timestamp: timestampSchema,
  sentAt: sentAtSchema,
  messageId: messageIdSchema,
};

const commonOptionalFields = ["userId", "anonymousId", "context", "integrations", "timestamp", "sentAt", "messageId"];

function requireUserIdOrAnonymousId(schema: JsonSchema): JsonSchema {
  return {
    ...schema,
    anyOf: [{ required: ["userId"] }, { required: ["anonymousId"] }],
  };
}

const identifyAction: ActionDefinition = defineProviderAction(service, {
  name: "identify",
  description: "Send a Segment Identify call to record user traits.",
  inputSchema: requireUserIdOrAnonymousId(
    s.object(
      "The input payload for a Segment Identify call.",
      {
        ...commonMessageFields,
        traits: s.record("Free-form traits associated with the user.", jsonValueSchema),
      },
      { optional: [...commonOptionalFields, "traits"] },
    ),
  ),
  outputSchema: acceptedOutputSchema,
});

const trackAction: ActionDefinition = defineProviderAction(service, {
  name: "track",
  description: "Send a Segment Track call to record one user event.",
  inputSchema: requireUserIdOrAnonymousId(
    s.object(
      "The input payload for a Segment Track call.",
      {
        ...commonMessageFields,
        event: s.nonEmptyString("Name of the action the user performed."),
        properties: s.record("Free-form properties associated with the event.", jsonValueSchema),
      },
      { optional: [...commonOptionalFields, "properties"] },
    ),
  ),
  outputSchema: acceptedOutputSchema,
});

const pageAction: ActionDefinition = defineProviderAction(service, {
  name: "page",
  description: "Send a Segment Page call to record a website page view.",
  inputSchema: requireUserIdOrAnonymousId(
    s.object(
      "The input payload for a Segment Page call.",
      {
        ...commonMessageFields,
        name: s.nonEmptyString("Optional page name."),
        properties: s.record("Free-form properties associated with the page.", jsonValueSchema),
      },
      { optional: [...commonOptionalFields, "name", "properties"] },
    ),
  ),
  outputSchema: acceptedOutputSchema,
});

const screenAction: ActionDefinition = defineProviderAction(service, {
  name: "screen",
  description: "Send a Segment Screen call to record a mobile app screen view.",
  inputSchema: requireUserIdOrAnonymousId(
    s.object(
      "The input payload for a Segment Screen call.",
      {
        ...commonMessageFields,
        name: s.nonEmptyString("Optional screen name."),
        properties: s.record("Free-form properties associated with the screen.", jsonValueSchema),
      },
      { optional: [...commonOptionalFields, "name", "properties"] },
    ),
  ),
  outputSchema: acceptedOutputSchema,
});

const groupAction: ActionDefinition = defineProviderAction(service, {
  name: "group",
  description: "Send a Segment Group call to associate a user with a group.",
  inputSchema: requireUserIdOrAnonymousId(
    s.object(
      "The input payload for a Segment Group call.",
      {
        ...commonMessageFields,
        groupId: s.nonEmptyString("Unique identifier for the group in your database."),
        traits: s.record("Free-form traits associated with the group.", jsonValueSchema),
      },
      { optional: [...commonOptionalFields, "traits"] },
    ),
  ),
  outputSchema: acceptedOutputSchema,
});

const aliasAction: ActionDefinition = defineProviderAction(service, {
  name: "alias",
  description: "Send a Segment Alias call to associate one user identity with another.",
  inputSchema: s.object(
    "The input payload for a Segment Alias call.",
    {
      userId: userIdSchema,
      previousId: s.nonEmptyString("Previous unique identifier for the user."),
      context: contextSchema,
      integrations: integrationsSchema,
      timestamp: timestampSchema,
      sentAt: sentAtSchema,
      messageId: messageIdSchema,
    },
    { optional: ["context", "integrations", "timestamp", "sentAt", "messageId"] },
  ),
  outputSchema: acceptedOutputSchema,
});

const batchEventSchema = s.looseRequiredObject("One Segment batch event.", {
  type: s.stringEnum("Segment event type for this batch item.", ["identify", "track", "page", "screen", "group"]),
});

const batchAction: ActionDefinition = defineProviderAction(service, {
  name: "batch",
  description: "Send a Segment Batch call containing Identify, Group, Track, Page, or Screen items.",
  inputSchema: s.object(
    "The input payload for a Segment Batch call.",
    {
      batch: s.array("Segment event items to send in this batch.", batchEventSchema, {
        minItems: 1,
        maxItems: 2500,
      }),
      context: contextSchema,
      integrations: integrationsSchema,
    },
    { optional: ["context", "integrations"] },
  ),
  outputSchema: acceptedOutputSchema,
});

export const segmentActions: ActionDefinition[] = [
  identifyAction,
  trackAction,
  pageAction,
  screenAction,
  groupAction,
  aliasAction,
  batchAction,
];
