import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "plunk";

const rawObjectSchema = s.looseObject("Raw object returned by the official Plunk API.");
const contactDataSchema = s.looseObject("Custom contact data or template variables accepted by Plunk.");

const namedEmailSchema = s.object(
  "An email address with an optional display name.",
  {
    email: s.email("The email address."),
    name: s.string("The display name.", { minLength: 1 }),
  },
  { optional: ["name"] },
);

const recipientSchema = s.anyOf("A Plunk recipient as an email string or object.", [
  s.email("A recipient email address."),
  namedEmailSchema,
]);

const recipientsSchema = s.anyOf("One or more Plunk recipients.", [
  s.email("A single recipient email address."),
  namedEmailSchema,
  s.array("Multiple recipients processed by Plunk sequentially.", recipientSchema, {
    minItems: 1,
  }),
]);

const senderSchema = s.anyOf("A Plunk sender as an email string or object.", [
  s.email("A sender email address from a verified domain."),
  namedEmailSchema,
]);

const emailRecordSchema = s.object("One email queued by Plunk.", {
  contact: s.object("The recipient contact linked to the queued email.", {
    id: s.string("The Plunk contact ID."),
    email: s.email("The recipient email address."),
  }),
  email: s.string("The Plunk email record ID."),
});

const contactSchema = s.looseObject("A Plunk contact resource.", {
  id: s.string("The Plunk contact ID."),
  email: s.email("The contact email address."),
  subscribed: s.boolean("Whether the contact is subscribed."),
  data: s.nullable(contactDataSchema),
  createdAt: s.dateTime("When the contact was created."),
  updatedAt: s.dateTime("When the contact was last updated."),
});

const contactWithMetaSchema = s.looseObject("A Plunk contact resource with upsert metadata.", {
  id: s.string("The Plunk contact ID."),
  email: s.email("The contact email address."),
  subscribed: s.boolean("Whether the contact is subscribed."),
  data: s.nullable(contactDataSchema),
  createdAt: s.dateTime("When the contact was created."),
  updatedAt: s.dateTime("When the contact was last updated."),
  _meta: s.looseObject("Metadata describing whether Plunk created or updated the contact.", {
    isNew: s.boolean("Whether Plunk created a new contact."),
    isUpdate: s.boolean("Whether Plunk updated an existing contact."),
  }),
});

export const plunkActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "send_email",
    operationType: "write",
    description: "Send a transactional email through Plunk.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for sending a Plunk transactional email.",
      {
        to: recipientsSchema,
        subject: s.string("The email subject. Required when template is omitted.", {
          minLength: 1,
          maxLength: 998,
        }),
        body: s.string("The HTML email body. Required when template is omitted.", {
          minLength: 1,
        }),
        template: s.string("The Plunk template ID to use for this email.", {
          minLength: 1,
        }),
        from: senderSchema,
        subscribed: s.boolean("Subscription state to apply to the recipient contact."),
        data: contactDataSchema,
        headers: s.record("Custom email headers keyed by header name.", s.string("Header value.")),
        reply: s.email("The reply-to email address."),
      },
      {
        optional: ["subject", "body", "template", "from", "subscribed", "data", "headers", "reply"],
      },
    ),
    outputSchema: s.object("Result returned after Plunk queues the email.", {
      emails: s.array("Email records queued by Plunk.", emailRecordSchema),
      timestamp: s.dateTime("Timestamp returned by Plunk for the queued send."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "track_event",
    operationType: "write",
    description: "Track an event for a Plunk contact.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for tracking a Plunk event.",
      {
        email: s.email("The contact email address. Plunk creates the contact if needed."),
        event: s.string("The event name to track.", { minLength: 1 }),
        subscribed: s.boolean("Subscription state to apply to the contact."),
        data: contactDataSchema,
      },
      { optional: ["subscribed", "data"] },
    ),
    outputSchema: s.object("Result returned after Plunk records the event.", {
      contact: s.string("The Plunk contact ID."),
      event: s.string("The Plunk event ID."),
      timestamp: s.dateTime("Timestamp returned by Plunk for the tracked event."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "verify_email",
    operationType: "read",
    description: "Verify an email address with Plunk.",
    requiredScopes: [],
    inputSchema: s.object("Input for verifying an email address.", {
      email: s.email("The email address to verify."),
    }),
    outputSchema: s.object("Email verification result returned by Plunk.", {
      email: s.email("The email address that was verified."),
      valid: s.boolean("Whether the email appears valid overall."),
      isDisposable: s.boolean("Whether the email uses a disposable domain."),
      isAlias: s.boolean("Whether the email uses an alias or forwarding service."),
      isTypo: s.boolean("Whether Plunk detected a likely typo."),
      isPlusAddressed: s.boolean("Whether the email uses plus addressing."),
      isPersonalEmail: s.boolean("Whether the email uses a personal email provider."),
      domainExists: s.boolean("Whether DNS indicates that the domain exists."),
      hasWebsite: s.boolean("Whether the domain has a website DNS record."),
      hasMxRecords: s.boolean("Whether the domain has MX records."),
      suggestedEmail: s.nullable(s.email("Suggested correction when Plunk detects a typo.")),
      reasons: s.array("Human-readable verification reasons.", s.string("One reason.")),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    operationType: "write",
    description: "Create or update a Plunk contact by email.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for creating or updating a Plunk contact.",
      {
        email: s.email("The contact email address."),
        subscribed: s.boolean("Whether the contact is subscribed."),
        data: contactDataSchema,
      },
      { optional: ["subscribed", "data"] },
    ),
    outputSchema: s.object("Contact returned by Plunk after the upsert.", {
      contact: contactWithMetaSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List Plunk contacts with cursor pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Query parameters for listing Plunk contacts.",
      {
        limit: s.integer("Maximum number of contacts to return.", {
          minimum: 1,
          maximum: 100,
        }),
        cursor: s.string("Pagination cursor returned by a previous list request.", {
          minLength: 1,
        }),
        search: s.string("Case-insensitive substring search on contact email.", {
          minLength: 1,
        }),
      },
      { optional: ["limit", "cursor", "search"] },
    ),
    outputSchema: s.object("A page of Plunk contacts.", {
      items: s.array("Contacts returned by Plunk.", contactSchema),
      cursor: s.nullable(s.string("Cursor for the next page.")),
      hasMore: s.boolean("Whether another page is available."),
      total: s.integer("Total count on the first page; later pages may return zero."),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Get a single Plunk contact by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving a Plunk contact.", {
      contactId: s.string("The Plunk contact ID.", { minLength: 1 }),
    }),
    outputSchema: s.object("Contact returned by Plunk.", {
      contact: contactSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    operationType: "write",
    description: "Update a Plunk contact by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for updating a Plunk contact.",
      {
        contactId: s.string("The Plunk contact ID.", { minLength: 1 }),
        email: s.email("Updated contact email address."),
        subscribed: s.boolean("Updated subscription state."),
        data: contactDataSchema,
      },
      { optional: ["email", "subscribed", "data"] },
    ),
    outputSchema: s.object("Updated contact returned by Plunk.", {
      contact: contactSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    operationType: "destructive",
    description: "Delete a Plunk contact by ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for deleting a Plunk contact.", {
      contactId: s.string("The Plunk contact ID.", { minLength: 1 }),
    }),
    outputSchema: s.object("Deletion result returned by the connector.", {
      deleted: s.boolean("Whether the contact deletion request completed successfully."),
    }),
  }),
];
