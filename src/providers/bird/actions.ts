import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bird";

const workspaceIdSchema = s.uuid("The Bird workspace ID.");
const channelIdSchema = s.uuid("The Bird channel ID.");
const messageIdSchema = s.uuid("The Bird channel message ID.");
const contactIdSchema = s.uuid("The Bird contact ID.");
const rawObjectSchema = s.looseObject("The raw object returned by Bird.");
const platformStatusSchema = s.stringEnum("Filter channels by platform release status.", ["preview", "GA"]);
const useCaseTypeSchema = s.stringEnum("Filter channels by the Bird use case type.", [
  "otp",
  "transactional",
  "marketing",
  "conversation",
]);
const suiteSchema = s.stringEnum("Filter channels by the Bird suite.", [
  "marketing",
  "service",
  "payments",
  "automations",
  "developer",
]);
const contactAttributesSchema = s.record(
  "Bird contact attributes keyed by attribute name.",
  s.unknown("A Bird contact attribute value."),
);
const contactIdentifierSchema = s.object("A Bird contact identifier.", {
  key: s.nonWhitespaceString("The Bird contact identifier key, such as emailaddress or phonenumber."),
  value: s.nonWhitespaceString("The Bird contact identifier value."),
});
const contactListIdsSchema = s.array("Bird contact list IDs.", s.uuid("A Bird contact list ID."), {
  minItems: 1,
});
const messageBodySchema = s.looseObject(
  "The Bird message body object, such as a text, image, file, gif, location, carousel, list, section, or template-compatible body.",
);
const receiverSchema = s.looseObject("The Bird receiver object for the channel message.");
const senderSchema = s.looseObject("The optional Bird sender object for the channel message.");
const templateSchema = s.looseObject("The optional Bird template object for the channel message.");
const metadataSchema = s.looseObject("The optional Bird metadata object for the channel message.");
const createMessageSchema = s.object(
  "A Bird channel message request. Provide either body or template.",
  {
    receiver: receiverSchema,
    body: messageBodySchema,
    template: templateSchema,
    sender: senderSchema,
    reference: s.nonWhitespaceString("A caller-defined message reference."),
    meta: metadataSchema,
    replyTo: rawObjectSchema,
    notification: rawObjectSchema,
    capFrequency: s.boolean("Whether to apply Bird frequency capping rules."),
    enableLinkTracking: s.boolean("Whether Bird should append UTM parameters to links."),
    ignoreQuietHours: s.boolean("Whether to ignore quiet hours settings."),
    ignoreGlobalHoldout: s.boolean("Whether to skip global holdout checks."),
    tags: s.array("Tags to associate with the message.", s.nonWhitespaceString("A Bird message tag."), {
      minItems: 1,
      maxItems: 10,
    }),
    shortLinks: rawObjectSchema,
    scheduledFor: s.dateTime("The RFC3339 time when Bird should send the message."),
    validity: s.integer("The number of seconds for which the message remains valid.", {
      minimum: 0,
    }),
  },
  {
    optional: [
      "body",
      "template",
      "sender",
      "reference",
      "meta",
      "replyTo",
      "notification",
      "capFrequency",
      "enableLinkTracking",
      "ignoreQuietHours",
      "ignoreGlobalHoldout",
      "tags",
      "shortLinks",
      "scheduledFor",
      "validity",
    ],
  },
);

export const birdActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_channels",
    description: "List channels configured for a Bird workspace with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Bird workspace channels.",
      {
        workspaceId: workspaceIdSchema,
        limit: s.integer("The maximum number of channels to return.", {
          minimum: 1,
          maximum: 1000,
        }),
        pageToken: s.nonWhitespaceString("The pagination token returned by a previous request."),
        reverse: s.boolean("Whether to reverse the order in which channels are returned."),
        platform: s.nonWhitespaceString("Filter channels by platform name."),
        conferencial: s.boolean("Filter channels by Bird's conferencial flag."),
        onlyMyChannels: s.boolean("Only return channels the authenticated principal can access."),
        useCaseType: useCaseTypeSchema,
        channelIds: s.array("Filter channels by channel IDs.", channelIdSchema, { minItems: 1 }),
        resourceOwnerIds: s.array("Filter channels by resource owner IDs.", s.uuid("A Bird resource owner ID."), {
          minItems: 1,
        }),
        resourceOwnerIdentifiers: s.array(
          "Filter channels by resource owner identifiers.",
          s.nonWhitespaceString("A Bird resource owner identifier."),
          { minItems: 1 },
        ),
        suite: suiteSchema,
        platformStatus: platformStatusSchema,
      },
      {
        optional: [
          "limit",
          "pageToken",
          "reverse",
          "platform",
          "conferencial",
          "onlyMyChannels",
          "useCaseType",
          "channelIds",
          "resourceOwnerIds",
          "resourceOwnerIdentifiers",
          "suite",
          "platformStatus",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      {
        channels: s.array("The channel records returned by Bird.", rawObjectSchema),
        nextPageToken: s.nullable(s.string("The token that can be passed as pageToken to fetch the next page.")),
        raw: rawObjectSchema,
      },
      "The response returned when listing Bird channels.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_channel",
    description: "Retrieve a specific Bird workspace channel by ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving a Bird channel.", {
      workspaceId: workspaceIdSchema,
      channelId: channelIdSchema,
    }),
    outputSchema: s.actionOutput(
      {
        channel: rawObjectSchema,
      },
      "The response returned when retrieving a Bird channel.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_message",
    description: "Retrieve a Bird channel message by ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving a Bird channel message.", {
      workspaceId: workspaceIdSchema,
      channelId: channelIdSchema,
      messageId: messageIdSchema,
    }),
    outputSchema: s.actionOutput(
      {
        message: rawObjectSchema,
      },
      "The response returned when retrieving a Bird channel message.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_message_interactions",
    description: "List interactions recorded for a Bird channel message.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Bird message interactions.", {
      workspaceId: workspaceIdSchema,
      channelId: channelIdSchema,
      messageId: messageIdSchema,
    }),
    outputSchema: s.actionOutput(
      {
        interactions: s.array("The message interactions returned by Bird.", rawObjectSchema),
        raw: rawObjectSchema,
      },
      "The response returned when listing Bird message interactions.",
    ),
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send one message through a Bird workspace channel.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for sending a Bird channel message.", {
      workspaceId: workspaceIdSchema,
      channelId: channelIdSchema,
      message: createMessageSchema,
    }),
    outputSchema: s.actionOutput(
      {
        messageId: s.nullable(messageIdSchema),
        message: rawObjectSchema,
      },
      "The response returned when sending a Bird channel message.",
    ),
  }),
  defineProviderAction(service, {
    name: "send_batch_messages",
    description:
      "Send a batch of up to 100 messages through a Bird workspace channel and return the accepted batch IDs.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for sending Bird channel messages in a batch.", {
      workspaceId: workspaceIdSchema,
      channelId: channelIdSchema,
      messages: s.array("The Bird channel messages to send.", createMessageSchema, {
        minItems: 1,
        maxItems: 100,
      }),
    }),
    outputSchema: s.actionOutput(
      {
        batchId: s.nullable(s.uuid("The Bird batch ID.")),
        messageIds: s.array("The Bird message IDs accepted in the batch.", messageIdSchema),
        raw: rawObjectSchema,
      },
      "The response returned when sending Bird channel messages in a batch.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List contacts in a Bird workspace.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Bird contacts.", {
      workspaceId: workspaceIdSchema,
    }),
    outputSchema: s.actionOutput(
      {
        contacts: s.array("The contact records returned by Bird.", rawObjectSchema),
        raw: rawObjectSchema,
      },
      "The response returned when listing Bird contacts.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Retrieve a Bird contact by ID, optionally requesting specific attributes.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for retrieving a Bird contact.",
      {
        workspaceId: workspaceIdSchema,
        contactId: contactIdSchema,
        attribute: s.nonWhitespaceString("A contact attribute name to include in the response."),
      },
      { optional: ["attribute"] },
    ),
    outputSchema: s.actionOutput(
      {
        contact: rawObjectSchema,
      },
      "The response returned when retrieving a Bird contact.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_contact_by_identifier",
    description: "Search Bird contacts by an identifier key and value.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for searching Bird contacts by identifier.", {
      workspaceId: workspaceIdSchema,
      identifier: contactIdentifierSchema,
    }),
    outputSchema: s.actionOutput(
      {
        contacts: s.array("The matching contact records returned by Bird.", rawObjectSchema),
        raw: rawObjectSchema,
      },
      "The response returned when searching Bird contacts by identifier.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a Bird contact with identifiers, attributes, display name, or list IDs.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for creating a Bird contact.", {
      workspaceId: workspaceIdSchema,
      contact: s.object(
        "The Bird contact fields to create.",
        {
          displayName: s.nonWhitespaceString("The display name for the Bird contact."),
          identifiers: s.array("Identifiers to attach to the contact.", contactIdentifierSchema, {
            minItems: 1,
          }),
          attributes: contactAttributesSchema,
          listIds: contactListIdsSchema,
        },
        { optional: ["displayName", "identifiers", "attributes", "listIds"] },
      ),
    }),
    outputSchema: s.actionOutput(
      {
        contact: rawObjectSchema,
      },
      "The response returned when creating a Bird contact.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a Bird contact's identifiers, attributes, or list memberships.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for updating a Bird contact.", {
      workspaceId: workspaceIdSchema,
      contactId: contactIdSchema,
      patch: s.object(
        "The Bird contact update fields.",
        {
          addIdentifiers: s.array("Identifiers to add to the contact.", contactIdentifierSchema, {
            minItems: 1,
          }),
          attributes: contactAttributesSchema,
          addToLists: contactListIdsSchema,
        },
        { optional: ["addIdentifiers", "attributes", "addToLists"] },
      ),
    }),
    outputSchema: s.actionOutput(
      {
        contact: rawObjectSchema,
      },
      "The response returned when updating a Bird contact.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete a Bird contact by ID.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for deleting a Bird contact.", {
      workspaceId: workspaceIdSchema,
      contactId: contactIdSchema,
    }),
    outputSchema: s.actionOutput(
      {
        contactId: contactIdSchema,
        deleted: s.boolean("Whether the contact was deleted."),
      },
      "The response returned when deleting a Bird contact.",
    ),
  }),
];
