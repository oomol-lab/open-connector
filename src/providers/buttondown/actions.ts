import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "buttondown";

const metadataSchema = s.looseObject("A structured key-value blob stored on the Buttondown object.");
const rawObjectSchema = s.looseObject("The raw Buttondown API object for advanced fields.");
const nullableString = (description: string) => s.nullableString(description);
const nullableDateTime = (description: string) => s.nullable(s.dateTime(description));
const nullableInteger = (description: string) => s.nullableInteger(description);
const nullableNumber = (description: string) => s.nullableNumber(description);

const subscriberTypeSchema = s.stringEnum("The subscriber lifecycle state returned by Buttondown.", [
  "regular",
  "premium",
  "unactivated",
  "unsubscribed",
  "removed",
]);
const collisionBehaviorSchema = s.stringEnum("Behavior to apply when a record with the same value exists.", [
  "add",
  "overwrite",
]);

const emptyInputSchema = s.actionInput({}, [], "The empty input payload for this Buttondown action.");

const paginationInputSchema = s.object(
  "Pagination controls for a Buttondown list request.",
  {
    page: s.positiveInteger("The 1-based page number of the paginated response."),
    page_size: s.integer("The number of results per page.", { minimum: 1, maximum: 1000 }),
  },
  { optional: ["page", "page_size"] },
);

const accountSchema = s.actionOutput(
  {
    username: s.string("The username associated with the account."),
    email_address: s.email("The email address associated with the account."),
  },
  "The connected Buttondown account.",
);

const pageInfoSchema = s.object(
  "Pagination metadata returned by Buttondown.",
  {
    count: s.integer("The total number of results across all pages."),
    next: nullableString("The URL to the next page of results, or null when there is no next page."),
    previous: nullableString("The URL to the previous page of results, or null when there is no previous page."),
  },
  { required: ["count"], optional: ["next", "previous"] },
);

const newsletterSchema = s.looseRequiredObject("A Buttondown newsletter.", {
  id: s.string("A unique TypeID associated with the newsletter."),
  creation_date: s.dateTime("The date and time at which the newsletter was first created."),
  username: s.string("The newsletter username, when returned by Buttondown."),
  name: s.string("The newsletter name, when returned by Buttondown."),
  description: nullableString("The newsletter description, when returned by Buttondown."),
  raw: rawObjectSchema,
});

const subscriberSchema = s.looseObject("A Buttondown subscriber.", {
  id: s.string("A unique TypeID associated with the subscriber."),
  creation_date: s.dateTime("The date and time at which the subscriber was first created."),
  email_address: s.email("The email address of the subscriber."),
  type: s.nullable(subscriberTypeSchema),
  notes: nullableString("Private notes attached to the subscriber."),
  metadata: metadataSchema,
  tags: s.stringArray("Tag names applied to the subscriber."),
  avatar_url: nullableString("URL of the subscriber's avatar image, if available."),
  bounce_date: nullableDateTime("The date of the subscriber's most recent bounce event."),
  churn_date: nullableDateTime("When the subscriber cancelled their paid subscription, if applicable."),
  country: nullableString("The ISO 3166-1 alpha-2 country code inferred at signup, if available."),
  delivered_count: nullableInteger("The number of distinct emails delivered to this subscriber."),
  open_count: nullableInteger("The subscriber's open count."),
  clicked_count: nullableInteger("The subscriber's clicked count."),
  open_rate: nullableNumber("The subscriber's open rate, or null when unavailable."),
  click_rate: nullableNumber("The subscriber's click rate, or null when unavailable."),
  raw: rawObjectSchema,
});

const tagSchema = s.looseObject("A Buttondown tag.", {
  id: s.string("A unique TypeID associated with the tag."),
  creation_date: s.dateTime("The date and time at which the tag was first created."),
  name: s.string("The name of the tag."),
  color: s.string("The hex color code associated with the tag."),
  description: nullableString("An internal description of the tag."),
  public_description: nullableString("A public-facing description of the tag."),
  subscriber_editable: s.boolean("Whether subscribers can manage this tag from their own profile."),
  secondary_id: s.integer("The secondary human-readable numeric identifier for the tag."),
  raw: rawObjectSchema,
});

const listSubscribersInputSchema = s.object(
  "Filters and pagination controls for listing Buttondown subscribers.",
  {
    page: s.positiveInteger("The 1-based page number of the paginated response."),
    email_address: s.string({ minLength: 1, description: "Only return subscribers matching this email fragment." }),
    type: subscriberTypeSchema,
    tag: s.array("Only return subscribers matching the given tag names.", s.string({ minLength: 1 }), {
      minItems: 1,
    }),
    date__start: s.date("Only return subscribers created on or after the given date."),
    date__end: s.date("Only return subscribers created before the given date."),
  },
  { optional: ["page", "email_address", "type", "tag", "date__start", "date__end"] },
);

const getSubscriberInputSchema = s.actionInput(
  {
    id_or_email: s.string({ minLength: 1, description: "The Buttondown subscriber ID or email address." }),
  },
  ["id_or_email"],
  "The subscriber lookup input.",
);

const createSubscriberInputSchema = s.actionInput(
  {
    email_address: s.string({ format: "email", maxLength: 254, description: "The email address of the subscriber." }),
    notes: s.string("Any private notes to attach to the subscriber."),
    metadata: metadataSchema,
    tags: s.array(
      "Tag names to apply to the subscriber. Tags that do not already exist will be created.",
      s.string({ minLength: 1, description: "A tag name." }),
    ),
    referrer_url: s.string("The URL the subscriber was referred from."),
    utm_campaign: s.string({ maxLength: 300, description: "The UTM campaign attributed to the subscriber." }),
    utm_medium: s.string({ maxLength: 300, description: "The UTM medium attributed to the subscriber." }),
    utm_source: s.string({ maxLength: 300, description: "The UTM source attributed to the subscriber." }),
    type: s.nullable(subscriberTypeSchema),
    ip_address: nullableString("The IP address of the subscriber."),
    collision_behavior: collisionBehaviorSchema,
    bypass_firewall: s.boolean("Whether to bypass Buttondown's firewall for this subscriber creation."),
  },
  ["email_address"],
  "The request payload for creating a Buttondown subscriber.",
);

const updateSubscriberInputSchema = s.object(
  "The request payload for updating a Buttondown subscriber.",
  {
    id_or_email: s.string({ minLength: 1, description: "The Buttondown subscriber ID or email address." }),
    commenting_disabled: s.nullableBoolean("Whether this subscriber is prevented from commenting."),
    email_address: s.nullable(s.email("The updated email address of the subscriber.")),
    notes: nullableString("Updated private notes to attach to the subscriber."),
    metadata: s.nullable(metadataSchema),
    tags: s.nullable(
      s.array("Tag names to apply to the subscriber.", s.string({ minLength: 1, description: "A tag name." })),
    ),
    referrer_url: nullableString("The URL the subscriber was referred from."),
    type: s.nullable(subscriberTypeSchema),
    unsubscription_reason: nullableString("Free-text reason the subscriber unsubscribed."),
  },
  {
    required: ["id_or_email"],
    optional: [
      "commenting_disabled",
      "email_address",
      "notes",
      "metadata",
      "tags",
      "referrer_url",
      "type",
      "unsubscription_reason",
    ],
  },
);

const listTagsInputSchema = paginationInputSchema;

const getTagInputSchema = s.actionInput(
  {
    id: s.string({ minLength: 1, description: "The Buttondown tag ID." }),
  },
  ["id"],
  "The tag lookup input.",
);

const createTagInputSchema = s.actionInput(
  {
    name: s.string({ minLength: 1, maxLength: 100, description: "The name of the tag." }),
    color: s.string({
      minLength: 4,
      maxLength: 7,
      pattern: "^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$",
      description: "The hex color code associated with the tag.",
    }),
    description: nullableString("An internal description of the tag."),
    public_description: nullableString("A public-facing description of the tag."),
    subscriber_editable: s.boolean("Whether subscribers can add or remove this tag from their own profile."),
    collision_behavior: s.stringEnum("Whether to overwrite an existing tag with the same name.", ["overwrite"]),
  },
  ["name", "color"],
  "The request payload for creating a Buttondown tag.",
);

const updateTagInputSchema = s.object(
  "The request payload for updating a Buttondown tag.",
  {
    id: s.string({ minLength: 1, description: "The Buttondown tag ID." }),
    name: nullableString("The updated name of the tag."),
    color: nullableString("The updated hex color code associated with the tag."),
    description: nullableString("The updated internal description of the tag."),
    public_description: nullableString("The updated public-facing description of the tag."),
    secondary_id: nullableInteger("The updated secondary human-readable numeric identifier."),
    subscriber_editable: s.nullableBoolean("Whether subscribers can add or remove this tag from their own profile."),
  },
  {
    required: ["id"],
    optional: ["name", "color", "description", "public_description", "secondary_id", "subscriber_editable"],
  },
);

const subscriberOutputSchema = s.actionOutput({ subscriber: subscriberSchema }, "A Buttondown subscriber result.");
const tagOutputSchema = s.actionOutput({ tag: tagSchema }, "A Buttondown tag result.");

export const buttondownActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Get the account associated with the Buttondown API key.",
    inputSchema: emptyInputSchema,
    outputSchema: accountSchema,
  }),
  defineProviderAction(service, {
    name: "list_newsletters",
    description: "List newsletters available to the Buttondown API key.",
    inputSchema: paginationInputSchema,
    outputSchema: s.actionOutput(
      {
        newsletters: s.array("The newsletters returned for this page.", newsletterSchema),
        page: pageInfoSchema,
      },
      "A paginated Buttondown newsletter list.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_subscribers",
    description: "List Buttondown subscribers with common filters.",
    inputSchema: listSubscribersInputSchema,
    outputSchema: s.actionOutput(
      {
        subscribers: s.array("The subscribers returned for this page.", subscriberSchema),
        page: pageInfoSchema,
      },
      "A paginated Buttondown subscriber list.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_subscriber",
    description: "Retrieve one Buttondown subscriber by ID or email address.",
    inputSchema: getSubscriberInputSchema,
    outputSchema: subscriberOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_subscriber",
    description: "Create a Buttondown subscriber.",
    inputSchema: createSubscriberInputSchema,
    outputSchema: subscriberOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_subscriber",
    description: "Update a Buttondown subscriber by ID or email address.",
    inputSchema: updateSubscriberInputSchema,
    outputSchema: subscriberOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_subscriber",
    description: "Delete a Buttondown subscriber by ID or email address.",
    inputSchema: getSubscriberInputSchema,
    outputSchema: s.actionOutput(
      {
        id_or_email: s.string("The Buttondown subscriber ID or email address that was deleted."),
        deleted: s.boolean("Whether the connector completed the delete request."),
      },
      "The Buttondown subscriber delete result.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List Buttondown tags.",
    inputSchema: listTagsInputSchema,
    outputSchema: s.actionOutput(
      {
        tags: s.array("The tags returned for this page.", tagSchema),
        page: pageInfoSchema,
      },
      "A paginated Buttondown tag list.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_tag",
    description: "Create a Buttondown tag.",
    inputSchema: createTagInputSchema,
    outputSchema: tagOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_tag",
    description: "Retrieve one Buttondown tag by ID.",
    inputSchema: getTagInputSchema,
    outputSchema: tagOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_tag",
    description: "Update a Buttondown tag by ID.",
    inputSchema: updateTagInputSchema,
    outputSchema: tagOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_tag",
    description: "Delete a Buttondown tag by ID.",
    inputSchema: getTagInputSchema,
    outputSchema: s.actionOutput(
      {
        id: s.string("The Buttondown tag ID that was deleted."),
        deleted: s.boolean("Whether the connector completed the delete request."),
      },
      "The Buttondown tag delete result.",
    ),
  }),
];
