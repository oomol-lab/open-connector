import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "avochato";

const contactSchema = s.looseObject("An Avochato contact.", {
  id: s.string("Unique Avochato contact identifier."),
  name: s.nullable(s.string("Contact name.")),
  phone: s.string("Contact phone number."),
  email: s.nullable(s.string("Contact email address.")),
  company: s.nullable(s.string("Contact company name.")),
  created_at: s.number("Unix timestamp when the contact was created."),
  tags: s.array("Tags assigned to the contact.", s.string("Contact tag.")),
  opted_out: s.boolean("Whether the contact opted out of messaging."),
});

const messageSchema = s.looseObject("An Avochato message.", {
  uuid: s.string("Message UUID."),
  event_id: s.string("Event identifier used by the get-message endpoint."),
  contact_id: s.nullable(s.string("Related contact identifier.")),
  to: s.string("Message recipient."),
  from: s.string("Message sender."),
  direction: s.string("Message direction."),
  message: s.string("Message text."),
  status: s.string("Current delivery status."),
  created_at: s.number("Unix timestamp when the message was created."),
});

const pageSchema = s.nullable(s.integer("Current page number when returned by Avochato."));

export const avochatoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_identity",
    description: "Retrieve the account and user associated with the configured Avochato API tokens.",
    requiredScopes: [],
    inputSchema: s.object("No input is required.", {}),
    outputSchema: s.object("The current Avochato credential identity.", {
      account: s.looseObject("The inbox account associated with the credentials."),
      user: s.looseObject("The user associated with the credentials."),
      origin: s.nullable(s.string("Credential origin reported by Avochato.")),
      createdAt: s.nullable(s.string("Credential creation time reported by Avochato.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List contacts in the Avochato inbox with cursor-style pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination parameters for listing Avochato contacts.",
      {
        afterPage: s.nonEmptyString("Opaque nextPage value returned by a previous list_contacts call."),
        limit: s.integer("Number of contacts to return, from 1 through 100.", {
          minimum: 1,
          maximum: 100,
        }),
      },
      { optional: ["afterPage", "limit"] },
    ),
    outputSchema: s.object("A page of Avochato contacts.", {
      contacts: s.array("Contacts returned for this page.", contactSchema),
      nextPage: s.nullable(s.string("Cursor for the next page when available.")),
      size: s.nullable(s.integer("Number of contacts returned by Avochato.")),
    }),
    followUpActions: ["avochato.get_contacts"],
  }),
  defineProviderAction(service, {
    name: "get_contacts",
    description: "Retrieve one or more Avochato contacts by their identifiers.",
    requiredScopes: [],
    inputSchema: s.object(
      "Contact identifiers and optional page number.",
      {
        ids: s.array("One or more Avochato contact identifiers.", s.nonEmptyString("Contact ID."), {
          minItems: 1,
        }),
        page: s.integer("Page number to request.", { minimum: 1 }),
      },
      { optional: ["page"] },
    ),
    outputSchema: s.object("Avochato contacts matching the identifiers.", {
      contacts: s.array("Matching contacts.", contactSchema),
      page: pageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "upsert_contact",
    description: "Create or update an Avochato contact, matched by phone number.",
    requiredScopes: [],
    inputSchema: s.object(
      "Contact fields to create or update.",
      {
        phone: s.nonEmptyString("Contact phone number, preferably in E.164 format."),
        name: s.string("Contact name."),
        email: s.string("Contact email address."),
        otherPhone: s.string("Additional contact phone number."),
        company: s.string("Contact company name."),
        street: s.string("Contact street address."),
        city: s.string("Contact city."),
        state: s.string("Contact state or region."),
        zip: s.string("Contact postal code."),
        country: s.string("Contact country."),
        optedOut: s.boolean("Whether the contact has opted out of messaging."),
        doubleOptedIn: s.boolean("Whether the contact has double opted in."),
        muted: s.boolean("Whether calls and notifications from the contact are muted."),
        blocked: s.boolean("Whether calls and texts to and from the contact are blocked."),
        priority: s.integer("Contact priority from 0 through 5.", { minimum: 0, maximum: 5 }),
        visible: s.boolean("Whether the contact remains visible."),
        landline: s.boolean("Whether the contact number is a landline."),
        tags: s.string("Comma-separated tags to apply to the contact."),
        userId: s.string("Responsible Avochato user ID or email address."),
        stuckNumber: s.string("Avochato E.164 number to use for future outbound messages."),
        allowEmptyFields: s.boolean("Whether empty or null custom fields may overwrite values."),
      },
      {
        optional: [
          "name",
          "email",
          "otherPhone",
          "company",
          "street",
          "city",
          "state",
          "zip",
          "country",
          "optedOut",
          "doubleOptedIn",
          "muted",
          "blocked",
          "priority",
          "visible",
          "landline",
          "tags",
          "userId",
          "stuckNumber",
          "allowEmptyFields",
        ],
      },
    ),
    outputSchema: s.object("The created or updated Avochato contact.", {
      contact: contactSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_messages",
    description: "List or search messages in the Avochato inbox.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for Avochato messages.",
      {
        query: s.string("Free-text message search query."),
        page: s.integer("Page number to request.", { minimum: 1 }),
        direction: s.stringEnum("Message direction to return.", ["in", "out"]),
        status: s.string("Delivery status to return."),
        from: s.string("Sender phone number filter."),
        to: s.string("Recipient phone number filter."),
        createdFrom: s.number("Minimum message creation Unix timestamp."),
        createdTo: s.number("Maximum message creation Unix timestamp."),
      },
      {
        optional: ["query", "page", "direction", "status", "from", "to", "createdFrom", "createdTo"],
      },
    ),
    outputSchema: s.object("A page of Avochato messages.", {
      messages: s.array("Messages returned for this page.", messageSchema),
      page: pageSchema,
    }),
    followUpActions: ["avochato.get_message"],
  }),
  defineProviderAction(service, {
    name: "get_message",
    description: "Retrieve one Avochato message by its Event ID.",
    requiredScopes: [],
    inputSchema: s.object("Event identifier of the message to retrieve.", {
      eventId: s.nonEmptyString("Message Event ID returned as event_id by Avochato."),
    }),
    outputSchema: s.object("The matching Avochato message.", { message: messageSchema }),
  }),
  defineProviderAction(service, {
    name: "send_message",
    description: "Send a text message to an Avochato contact phone number.",
    requiredScopes: [],
    inputSchema: s.object(
      "Message content and optional routing fields.",
      {
        phone: s.nonEmptyString("Recipient phone number."),
        message: s.nonEmptyString("Text to send to the recipient."),
        from: s.string("Avochato E.164 number to send from."),
        markAddressed: s.boolean("Whether to mark the conversation as addressed."),
        tags: s.string("Comma-separated tags to apply to the contact."),
        statusCallback: s.url("URL that receives delivery status updates."),
        sendAsUserId: s.string("Avochato user ID to send on behalf of."),
        sendAsUserEmail: s.string("Avochato user email to send on behalf of."),
      },
      {
        optional: ["from", "markAddressed", "tags", "statusCallback", "sendAsUserId", "sendAsUserEmail"],
      },
    ),
    outputSchema: s.object("The queued Avochato message.", { message: messageSchema }),
  }),
];
