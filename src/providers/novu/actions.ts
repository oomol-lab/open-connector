import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "novu";

const rawObjectSchema = s.looseObject("Raw object returned by the official Novu API.");
const customDataSchema = s.looseObject("Custom data stored with the Novu resource.");

const subscriberSchema = s.looseObject("A Novu subscriber resource.", {
  _id: s.string("The internal Novu subscriber ID."),
  subscriberId: s.string("The subscriber identifier from your system."),
  firstName: s.nullable(s.string("The subscriber's first name.")),
  lastName: s.nullable(s.string("The subscriber's last name.")),
  email: s.nullable(s.email("The subscriber's email address.")),
  phone: s.nullable(s.string("The subscriber's phone number.")),
  avatar: s.nullable(s.string("The subscriber avatar URL or identifier.")),
  locale: s.nullable(s.string("The subscriber locale.")),
  timezone: s.nullable(s.string("The subscriber timezone.")),
  data: s.nullable(customDataSchema),
  isOnline: s.nullable(s.boolean("Whether Novu considers the subscriber online.")),
  lastOnlineAt: s.nullable(s.dateTime("When the subscriber was last online.")),
  deleted: s.boolean("Whether the subscriber is deleted."),
  createdAt: s.dateTime("When the subscriber was created."),
  updatedAt: s.dateTime("When the subscriber was last updated."),
});

const subscriberInputFields = {
  firstName: s.nonEmptyString("The subscriber's first name."),
  lastName: s.nonEmptyString("The subscriber's last name."),
  email: s.email("The subscriber's email address."),
  phone: s.nonEmptyString("The subscriber's phone number."),
  avatar: s.nonEmptyString("The subscriber avatar URL or identifier."),
  locale: s.nonEmptyString("The subscriber locale, such as en-US."),
  timezone: s.nonEmptyString("The subscriber timezone, such as America/New_York."),
  data: customDataSchema,
};

const idempotencyKeySchema = s.nonEmptyString("Optional idempotency key sent with the request.");

const triggerSubscriberSchema = s.looseObject("A Novu subscriber recipient or actor object.", {
  subscriberId: s.nonEmptyString("The subscriber identifier from your system."),
  firstName: s.nonEmptyString("The subscriber's first name."),
  lastName: s.nonEmptyString("The subscriber's last name."),
  email: s.email("The subscriber's email address."),
  phone: s.nonEmptyString("The subscriber's phone number."),
  avatar: s.nonEmptyString("The subscriber avatar URL or identifier."),
  locale: s.nonEmptyString("The subscriber locale, such as en-US."),
  timezone: s.nonEmptyString("The subscriber timezone, such as America/New_York."),
  data: customDataSchema,
});

const triggerTopicSchema = s.object(
  "A Novu topic recipient.",
  {
    type: s.literal("Topic", { description: "The recipient type for a topic trigger." }),
    topicKey: s.nonEmptyString("The topic key."),
    exclude: s.array(
      "Subscriber IDs to exclude from the topic trigger.",
      s.nonEmptyString("A subscriber ID to exclude."),
    ),
  },
  { optional: ["exclude"] },
);

const triggerRecipientSchema = s.anyOf("A subscriber ID, subscriber object, or topic recipient.", [
  s.nonEmptyString("A subscriber ID from your system."),
  triggerSubscriberSchema,
  triggerTopicSchema,
]);

const triggerContextValueSchema = s.anyOf("A Novu trigger context value.", [
  s.nonEmptyString("A simple context ID."),
  s.object(
    "A rich context object.",
    {
      id: s.nonEmptyString("The context ID."),
      data: customDataSchema,
    },
    { optional: ["data"] },
  ),
]);

const tenantSchema = s.anyOf("A tenant ID or rich tenant object.", [
  s.nonEmptyString("A tenant ID from your system."),
  s.object(
    "A rich tenant object.",
    {
      identifier: s.nonEmptyString("The tenant identifier."),
      name: s.nonEmptyString("The tenant display name."),
      data: customDataSchema,
    },
    { optional: ["name", "data"] },
  ),
]);

export const novuActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_subscribers",
    description: "Search Novu subscribers with filters and cursor pagination.",
    inputSchema: s.object(
      "Query parameters for searching Novu subscribers.",
      {
        after: s.nonEmptyString("Cursor after which to fetch results."),
        before: s.nonEmptyString("Cursor before which to fetch results."),
        limit: s.positiveInteger("Maximum number of subscribers to return."),
        orderDirection: s.stringEnum("Sort direction.", ["ASC", "DESC"]),
        orderBy: s.nonEmptyString("Field to order subscribers by."),
        includeCursor: s.boolean("Whether to include the cursor item in the response."),
        email: s.email("Email address to filter subscribers by."),
        name: s.nonEmptyString("Name to filter subscribers by."),
        phone: s.nonEmptyString("Phone number to filter subscribers by."),
        subscriberId: s.nonEmptyString("Subscriber identifier to filter subscribers by."),
      },
      {
        optional: [
          "after",
          "before",
          "limit",
          "orderDirection",
          "orderBy",
          "includeCursor",
          "email",
          "name",
          "phone",
          "subscriberId",
        ],
      },
    ),
    outputSchema: s.object("A page of Novu subscribers.", {
      subscribers: s.array("Subscribers returned by Novu.", subscriberSchema),
      next: s.nullable(s.string("Cursor for the next page.")),
      previous: s.nullable(s.string("Cursor for the previous page.")),
      totalCount: s.number("Total count reported by Novu."),
      totalCountCapped: s.boolean("Whether the total count was capped by Novu."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_subscriber",
    description: "Create or upsert a Novu subscriber.",
    inputSchema: s.object(
      "Input for creating or upserting a Novu subscriber.",
      {
        subscriberId: s.nonEmptyString("Unique subscriber identifier from your system."),
        ...subscriberInputFields,
        failIfExists: s.boolean("Whether Novu should fail if the subscriber already exists."),
        idempotencyKey: idempotencyKeySchema,
      },
      {
        optional: [
          "firstName",
          "lastName",
          "email",
          "phone",
          "avatar",
          "locale",
          "timezone",
          "data",
          "failIfExists",
          "idempotencyKey",
        ],
      },
    ),
    outputSchema: s.object("Subscriber returned by Novu after create or upsert.", {
      subscriber: subscriberSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_subscriber",
    description: "Retrieve a Novu subscriber by subscriber ID.",
    inputSchema: s.object("Input for retrieving a Novu subscriber.", {
      subscriberId: s.nonEmptyString("The subscriber identifier from your system."),
    }),
    outputSchema: s.object("Subscriber returned by Novu.", {
      subscriber: subscriberSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_subscriber",
    description: "Update a Novu subscriber by subscriber ID.",
    inputSchema: s.object(
      "Input for updating a Novu subscriber.",
      {
        subscriberId: s.nonEmptyString("The subscriber identifier from your system."),
        ...subscriberInputFields,
        idempotencyKey: idempotencyKeySchema,
      },
      {
        optional: ["firstName", "lastName", "email", "phone", "avatar", "locale", "timezone", "data", "idempotencyKey"],
      },
    ),
    outputSchema: s.object("Updated subscriber returned by Novu.", {
      subscriber: subscriberSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "trigger_event",
    description: "Trigger a Novu workflow event for subscribers or topics.",
    inputSchema: s.object(
      "Input for triggering a Novu workflow event.",
      {
        name: s.nonEmptyString("The workflow trigger identifier."),
        to: s.anyOf("One or more trigger recipients.", [
          triggerRecipientSchema,
          s.array("Multiple trigger recipients.", triggerRecipientSchema, {
            minItems: 1,
            maxItems: 100,
          }),
        ]),
        payload: customDataSchema,
        overrides: s.looseObject("Provider, channel, or step overrides for the trigger."),
        transactionId: s.nonEmptyString("Unique deduplication identifier for this trigger."),
        actor: s.anyOf("Actor subscriber ID or actor object.", [
          s.nonEmptyString("Actor subscriber ID from your system."),
          triggerSubscriberSchema,
        ]),
        tenant: tenantSchema,
        context: s.record("Context objects keyed by context name.", triggerContextValueSchema),
        idempotencyKey: idempotencyKeySchema,
      },
      {
        optional: ["payload", "overrides", "transactionId", "actor", "tenant", "context", "idempotencyKey"],
      },
    ),
    outputSchema: s.object(
      "Result returned by Novu after the workflow trigger is accepted or rejected.",
      {
        acknowledged: s.boolean("Whether Novu acknowledged the trigger."),
        status: s.stringEnum("Novu trigger status.", [
          "error",
          "trigger_not_active",
          "no_workflow_active_steps_defined",
          "no_workflow_steps_defined",
          "processed",
          "no_tenant_found",
          "invalid_recipients",
        ]),
        error: s.array("Errors returned by Novu for the trigger.", s.string("One error.")),
        transactionId: s.nullable(s.string("Transaction ID returned by Novu.")),
        activityFeedLink: s.nullable(s.string("Link to the Novu activity feed.")),
        jobData: s.nullable(rawObjectSchema),
        raw: rawObjectSchema,
      },
      { optional: ["error"] },
    ),
  }),
];

export type NovuActionName = (typeof novuActions)[number]["name"];
