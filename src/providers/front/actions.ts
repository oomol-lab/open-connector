import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "front";

const contactHandleSourceSchema = s.stringEnum("The Front contact handle source.", [
  "twitter",
  "email",
  "phone",
  "facebook",
  "intercom",
  "front_chat",
  "custom",
]);

const contactHandleSchema = s.requiredObject("A handle with which a Front contact can be reached.", {
  handle: s.nonEmptyString("The handle value, such as an email address or phone number."),
  source: contactHandleSourceSchema,
});

const contactListSchema = s.requiredObject("A Front contact list summary.", {
  id: s.string("Unique identifier of the contact list."),
  name: s.string("Name of the contact list."),
  isPrivate: s.boolean("Whether the contact list is private."),
});

const customFieldsSchema = s.looseObject("Custom fields keyed by the custom field name configured in Front.");

const contactSchema = s.object(
  "A normalized Front contact.",
  {
    id: s.string("Unique identifier of the contact."),
    name: s.nullable(s.string("Contact name.")),
    description: s.nullable(s.string("Contact description.")),
    avatarUrl: s.nullable(s.string("URL of the contact avatar when Front returns one.")),
    links: s.array("Links associated with the contact.", s.string("A contact link URL.")),
    lists: s.array("Contact lists that contain the contact.", contactListSchema),
    handles: s.array("Handles with which the contact is reachable.", contactHandleSchema),
    customFields: customFieldsSchema,
    isPrivate: s.boolean("Whether the contact is private."),
  },
  { optional: ["customFields"] },
);

const teammateSchema = s.object(
  "A normalized Front teammate.",
  {
    id: s.string("Unique identifier of the teammate."),
    email: s.string("Email address of the teammate."),
    username: s.string("Username of the teammate."),
    firstName: s.string("First name of the teammate."),
    lastName: s.string("Last name of the teammate."),
    isAdmin: s.boolean("Whether the teammate is a company admin."),
    isAvailable: s.boolean("Whether the teammate is available."),
    isBlocked: s.boolean("Whether the teammate account has been blocked."),
    type: s.string("Type of teammate returned by Front."),
    customFields: customFieldsSchema,
  },
  { optional: ["customFields"] },
);

const paginationSchema = s.requiredObject("Front cursor pagination metadata.", {
  next: s.nullable(s.string("Link to the next page of results when Front returns one.")),
  nextPageToken: s.nullable(s.string("Token extracted from the next page link for the next connector call.")),
});

const contactBodySchema = s.object(
  "JSON fields accepted by Front for contact create and update requests.",
  {
    name: s.nonEmptyString("Contact name."),
    description: s.nonEmptyString("Contact description."),
    links: s.array("Links associated with the contact.", s.nonEmptyString("A contact link URL.")),
    listNames: s.array(
      "Contact list names the contact belongs to. Front creates missing lists automatically.",
      s.nonEmptyString("A contact list name."),
    ),
    customFields: customFieldsSchema,
  },
  { optional: ["name", "description", "links", "listNames", "customFields"] },
);

export const frontActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Front company contacts with optional cursor pagination and sorting.",
    requiredScopes: [],
    providerPermissions: ["contacts:read"],
    inputSchema: s.object(
      "Input for listing Front contacts.",
      {
        query: s.nonEmptyString(
          "Optional Front contact query object string for updated_after and updated_before filters.",
        ),
        limit: s.integer("Maximum number of contacts per page.", { minimum: 1, maximum: 100 }),
        pageToken: s.nonEmptyString("Front page token returned by a previous list_contacts call."),
        sortBy: s.stringEnum("Field used to sort contacts.", ["created_at", "updated_at"]),
        sortOrder: s.stringEnum("Order by which contacts should be sorted.", ["asc", "desc"]),
      },
      { optional: ["query", "limit", "pageToken", "sortBy", "sortOrder"] },
    ),
    outputSchema: s.requiredObject("The Front contacts page.", {
      contacts: s.array("Contacts returned by Front.", contactSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Fetch one Front contact by contact ID or documented resource alias.",
    requiredScopes: [],
    providerPermissions: ["contacts:read"],
    inputSchema: s.requiredObject("Input for fetching one Front contact.", {
      contactId: s.nonEmptyString("The Front contact ID, or a documented resource alias such as source:handle."),
    }),
    outputSchema: s.requiredObject("The Front contact response.", {
      contact: contactSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a Front company contact with JSON fields and one or more reachable handles.",
    requiredScopes: [],
    providerPermissions: ["contacts:write"],
    inputSchema: s.requiredObject("Input for creating a Front company contact.", {
      handles: s.array("Handles with which the contact is reachable.", contactHandleSchema, { minItems: 1 }),
      contact: contactBodySchema,
    }),
    outputSchema: s.requiredObject("The Front contact created by the API.", {
      contact: contactSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update JSON fields on a Front contact. Avatar uploads are intentionally not exposed.",
    requiredScopes: [],
    providerPermissions: ["contacts:write"],
    inputSchema: s.requiredObject("Input for updating a Front contact.", {
      contactId: s.nonEmptyString("The Front contact ID, or a documented resource alias such as source:handle."),
      contact: contactBodySchema,
    }),
    outputSchema: s.requiredObject("The result of updating a Front contact.", {
      success: s.boolean("Whether Front accepted the update request."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_teammates",
    description: "List Front teammates in the company.",
    requiredScopes: [],
    providerPermissions: ["teammates:read"],
    inputSchema: s.object("Input for listing Front teammates.", {}),
    outputSchema: s.requiredObject("The Front teammates response.", {
      teammates: s.array("Teammates returned by Front.", teammateSchema),
    }),
  }),
];

export type FrontActionName = "list_contacts" | "get_contact" | "create_contact" | "update_contact" | "list_teammates";
