import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "customerio";

const nonEmptyString = (description: string) => s.string({ description, minLength: 1, pattern: "\\S" });
const identifierSchema = nonEmptyString(
  "The Customer.io person identifier in the path. Use the person's id, email address, or cio_id value with the cio_ prefix.",
);

const attributesSchema = s.object(
  {
    id: s.string("The Customer.io id attribute to assign to the person."),
    email: s.email("The Customer.io email attribute to assign to the person."),
    anonymous_id: s.string("The anonymous identifier to associate with the person."),
    created_at: s.integer("The Unix timestamp when the person was created."),
    _timestamp: s.integer("The Unix timestamp for when this attribute update occurred."),
    _update: s.boolean("Whether Customer.io should only update an existing person instead of creating a new one."),
    unsubscribed: s.boolean("Whether the person is unsubscribed from all messages."),
  },
  {
    optional: ["id", "email", "anonymous_id", "created_at", "_timestamp", "_update", "unsubscribed"],
    additionalProperties: true,
    description: "The Customer.io profile attributes to assign to the person.",
  },
);

const eventTypeSchema = s.stringEnum(
  "The Customer.io event type. Use event for standard events, page for page views, or screen for mobile screen views.",
  ["event", "page", "screen"],
);

const eventDataSchema = s.object(
  {
    recipient: s.string("The recipient value used by Customer.io message trigger overrides."),
    from_address: s.string("The from_address value used by Customer.io message trigger overrides."),
    reply_to: s.string("The reply_to value used by Customer.io message trigger overrides."),
  },
  {
    optional: ["recipient", "from_address", "reply_to"],
    additionalProperties: true,
    description: "Additional Customer.io event data for Liquid merge fields, campaign triggers, or attributes.",
  },
);

const personReferenceSchema = s.object(
  {
    id: nonEmptyString("The Customer.io person id."),
    email: s.email("The Customer.io person email address."),
    cio_id: nonEmptyString("The Customer.io cio_id value with the cio_ prefix."),
  },
  {
    optional: ["id", "email", "cio_id"],
    description: "A Customer.io person reference identified by exactly one of id, email, or cio_id.",
  },
);

const successOutputSchema = s.object(
  {
    ok: s.boolean("Whether Customer.io accepted the request."),
  },
  { required: ["ok"], description: "The Customer.io Track API acknowledgement." },
);

export const customerioActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "identify_customer",
    description: "Add or update a Customer.io person through the Track API.",
    inputSchema: s.object(
      {
        identifier: identifierSchema,
        attributes: attributesSchema,
      },
      {
        required: ["identifier", "attributes"],
        description: "The input payload for identifying a Customer.io person.",
      },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "track_customer_event",
    description: "Track an event associated with an identified Customer.io person.",
    inputSchema: s.object(
      {
        identifier: identifierSchema,
        anonymousId: nonEmptyString("The Customer.io anonymous_id value required by Customer.io for screen events."),
        name: nonEmptyString("The Customer.io event name."),
        type: eventTypeSchema,
        eventId: nonEmptyString("The optional Customer.io dedupe id for the event."),
        timestamp: s.integer("The Unix timestamp when the event occurred."),
        data: eventDataSchema,
      },
      {
        required: ["identifier", "name"],
        optional: ["anonymousId", "type", "eventId", "timestamp", "data"],
        description: "The input payload for tracking an event for a Customer.io person.",
      },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "track_anonymous_event",
    description: "Track an event for an anonymous person in Customer.io.",
    inputSchema: s.object(
      {
        anonymousId: nonEmptyString("The Customer.io anonymous_id value for the event."),
        name: nonEmptyString("The Customer.io event name."),
        type: eventTypeSchema,
        eventId: nonEmptyString("The optional Customer.io dedupe id for the event."),
        timestamp: s.integer("The Unix timestamp when the event occurred."),
        data: eventDataSchema,
      },
      {
        required: ["anonymousId", "name"],
        optional: ["type", "eventId", "timestamp", "data"],
        description: "The input payload for tracking an anonymous Customer.io event.",
      },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_customer",
    description: "Delete a Customer.io person and their information through the Track API.",
    inputSchema: s.object(
      { identifier: identifierSchema },
      { required: ["identifier"], description: "The input payload for deleting a Customer.io person." },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "suppress_customer",
    description: "Delete and suppress a Customer.io person identifier so it cannot be re-added until unsuppressed.",
    inputSchema: s.object(
      { identifier: identifierSchema },
      { required: ["identifier"], description: "The input payload for suppressing a Customer.io person." },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "unsuppress_customer",
    description: "Unsuppress a Customer.io person identifier so a new profile can be created later.",
    inputSchema: s.object(
      { identifier: identifierSchema },
      { required: ["identifier"], description: "The input payload for unsuppressing a Customer.io person." },
    ),
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "merge_customers",
    description: "Merge two Customer.io people, keeping the primary profile and deleting the secondary profile.",
    inputSchema: s.object(
      {
        primary: personReferenceSchema,
        secondary: personReferenceSchema,
      },
      { required: ["primary", "secondary"], description: "The input payload for merging two Customer.io people." },
    ),
    outputSchema: successOutputSchema,
  }),
];
