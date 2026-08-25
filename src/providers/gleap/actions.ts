import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gleap";

const emptyInputSchema = s.actionInput({}, [], "No input is required for this Gleap action.");
const rawPayloadSchema = s.unknown("Raw payload returned by the official Gleap API.");
const customDataSchema = s.looseObject("Custom data object accepted by Gleap.");
const formDataSchema = s.looseObject("Form data object accepted by Gleap.");
const attributesSchema = s.looseObject("Ticket attributes object accepted by Gleap.");
const filterValueSchema = s.anyOf("A scalar Gleap query filter value.", [
  s.string("String filter value."),
  s.number("Numeric filter value."),
  s.boolean("Boolean filter value."),
]);
const objectIdSchema = s.anyOf("Gleap document ID as a string or ObjectId-like object.", [
  s.string("Gleap document ID string."),
  s.looseObject("ObjectId-like value returned by Gleap."),
]);
const attachmentSchema = s.object(
  "Attachment object accepted by Gleap.",
  {
    name: s.nonEmptyString("Attachment display name."),
    url: s.url("Publicly reachable attachment URL for Gleap to reference."),
    type: s.nonEmptyString("Attachment MIME type or type label."),
  },
  { optional: ["type"] },
);
const tagInputArraySchema = s.array("Tags associated with the Gleap resource.", s.string("Tag name."), {
  minItems: 1,
});
const tagOutputArraySchema = s.array("Tags associated with the Gleap resource.", s.string("Tag name."));

const gleapUserSchema = s.looseObject("Current Gleap user returned by the API.", {
  _id: objectIdSchema,
  id: s.string("Gleap user ID."),
  email: s.string("Gleap user email address."),
  firstName: s.string("Gleap user first name."),
  lastName: s.string("Gleap user last name."),
  userType: s.string("Gleap user type."),
  profileImageUrl: s.string("Gleap user profile image URL."),
  createdAt: s.string("Timestamp when the user was created."),
  updatedAt: s.string("Timestamp when the user was last updated."),
});

const gleapContactSchema = s.looseObject("Gleap contact session returned by the API.", {
  _id: objectIdSchema,
  id: s.string("Gleap session ID."),
  userId: s.string("External user ID associated with the contact."),
  email: s.string("Contact email address."),
  name: s.string("Contact display name."),
  phone: s.string("Contact phone number."),
  avatar: s.string("Contact avatar URL."),
  companyId: s.string("Company ID associated with the contact."),
  companyName: s.string("Company name associated with the contact."),
  customData: customDataSchema,
  tags: tagOutputArraySchema,
  blocked: s.boolean("Whether the contact is blocked."),
  unsubscribed: s.boolean("Whether the contact is unsubscribed."),
  createdAt: s.string("Timestamp when the contact was created."),
  updatedAt: s.string("Timestamp when the contact was last updated."),
  lastActivity: s.string("Timestamp of the contact's latest activity."),
});

const gleapTicketSchema = s.looseObject("Gleap ticket returned by the API.", {
  _id: objectIdSchema,
  id: s.string("Gleap ticket ID."),
  title: s.string("Ticket title."),
  type: s.string("Ticket type."),
  status: s.string("Ticket status."),
  priority: s.string("Ticket priority."),
  description: s.string("Ticket description."),
  formData: formDataSchema,
  customData: customDataSchema,
  session: s.unknown("Contact session linked to the ticket."),
  processingUser: s.unknown("Gleap user assigned to the ticket."),
  processingTeam: s.unknown("Gleap team assigned to the ticket."),
  tags: tagOutputArraySchema,
  archived: s.boolean("Whether the ticket is archived."),
  isSpam: s.boolean("Whether the ticket is marked as spam."),
  createdAt: s.string("Timestamp when the ticket was created."),
  updatedAt: s.string("Timestamp when the ticket was last updated."),
  latestComment: s.unknown("Latest ticket comment payload returned by Gleap."),
});

const ticketPrioritySchema = s.stringEnum("Ticket priority accepted by Gleap.", ["LOW", "MEDIUM", "HIGH"]);

const createContactInputSchema = s.object(
  "Input for creating a Gleap contact session. Either userId or email is required.",
  {
    userId: s.nonEmptyString("External user ID for the contact."),
    email: s.email("Contact email address."),
    name: s.nonEmptyString("Contact display name."),
    phone: s.nonEmptyString("Contact phone number."),
    avatar: s.url("Contact avatar URL."),
    companyId: s.nonEmptyString("Company ID associated with the contact."),
    companyName: s.nonEmptyString("Company name associated with the contact."),
    plan: s.nonEmptyString("Plan name associated with the contact."),
    value: s.number("Numeric customer value associated with the contact."),
    tags: tagInputArraySchema,
    blocked: s.boolean("Whether the contact is blocked."),
    unsubscribed: s.boolean("Whether the contact is unsubscribed."),
    customData: customDataSchema,
    eventData: customDataSchema,
  },
  {
    optional: [
      "userId",
      "email",
      "name",
      "phone",
      "avatar",
      "companyId",
      "companyName",
      "plan",
      "value",
      "tags",
      "blocked",
      "unsubscribed",
      "customData",
      "eventData",
    ],
  },
);
createContactInputSchema.anyOf = [{ required: ["userId"] }, { required: ["email"] }];

const updateContactFields: Record<string, JsonSchema> = {
  userId: s.nonEmptyString("Updated external user ID."),
  email: s.email("Updated contact email address."),
  name: s.nonEmptyString("Updated contact display name."),
  phone: s.nonEmptyString("Updated contact phone number."),
  avatar: s.url("Updated contact avatar URL."),
  companyId: s.nonEmptyString("Updated company ID."),
  companyName: s.nonEmptyString("Updated company name."),
  plan: s.nonEmptyString("Updated plan name."),
  value: s.number("Updated numeric customer value."),
  tags: tagInputArraySchema,
  blocked: s.boolean("Updated blocked state."),
  unsubscribed: s.boolean("Updated unsubscribe state."),
  customData: customDataSchema,
  eventData: customDataSchema,
};
const updateContactInputSchema = s.object(
  "Input for updating a Gleap contact session. At least one contact field is required.",
  {
    sessionId: s.nonEmptyString("Gleap session ID to update."),
    ...updateContactFields,
  },
  { optional: Object.keys(updateContactFields) },
);
updateContactInputSchema.anyOf = Object.keys(updateContactFields).map((field) => ({ required: [field] }));

const ticketFields: Record<string, JsonSchema> = {
  title: s.nonEmptyString("Ticket title."),
  type: s.nonEmptyString("Ticket type accepted by Gleap."),
  status: s.nonEmptyString("Ticket status accepted by Gleap."),
  priority: ticketPrioritySchema,
  description: s.nonEmptyString("Ticket description."),
  plainContent: s.nonEmptyString("Plain text ticket content."),
  session: s.nonEmptyString("Gleap session ID linked to the ticket."),
  processingUser: s.nonEmptyString("Gleap user ID assigned to the ticket."),
  processingTeam: s.nonEmptyString("Gleap team ID assigned to the ticket."),
  tags: tagInputArraySchema,
  formData: formDataSchema,
  customData: customDataSchema,
  attributes: attributesSchema,
  attachments: s.array("Ticket attachments accepted by Gleap.", attachmentSchema, { minItems: 1 }),
  archived: s.boolean("Whether the ticket is archived."),
  isSpam: s.boolean("Whether the ticket is marked as spam."),
  preventAutoReply: s.boolean("Whether Gleap should prevent automatic replies."),
};

const createTicketInputSchema = s.object("Input for creating a Gleap ticket.", ticketFields, {
  optional: [
    "type",
    "status",
    "priority",
    "description",
    "plainContent",
    "session",
    "processingUser",
    "processingTeam",
    "tags",
    "formData",
    "customData",
    "attributes",
    "attachments",
    "archived",
    "isSpam",
    "preventAutoReply",
  ],
});

const createTicketWithMessageInputSchema = s.object(
  "Input for creating a Gleap ticket with an optional initial message.",
  {
    type: s.nonEmptyString("Ticket type accepted by Gleap."),
    title: s.nonEmptyString("Ticket title."),
    message: s.nonEmptyString("Initial ticket message."),
    priority: s.nonEmptyString("Ticket priority accepted by Gleap."),
    status: s.nonEmptyString("Ticket status accepted by Gleap."),
    processingUser: s.nonEmptyString("Gleap user ID assigned to the ticket."),
    processingTeam: s.nonEmptyString("Gleap team ID assigned to the ticket."),
    tags: tagInputArraySchema,
    session: s.nonEmptyString("Gleap session ID linked to the ticket."),
    email: s.email("Email address used when composing the ticket."),
    formData: formDataSchema,
    preventAutoReply: s.boolean("Whether Gleap should prevent automatic replies."),
  },
  {
    optional: [
      "message",
      "priority",
      "status",
      "processingUser",
      "processingTeam",
      "tags",
      "session",
      "email",
      "formData",
      "preventAutoReply",
    ],
  },
);

const updateTicketFields: Record<string, JsonSchema> = {
  ...ticketFields,
  forceCloseOverride: s.boolean("Whether Gleap should force close behavior overrides."),
};
const updateTicketInputSchema = s.object(
  "Input for updating a Gleap ticket. At least one ticket field is required.",
  {
    ticketId: s.nonEmptyString("Gleap ticket ID to update."),
    ...updateTicketFields,
  },
  { optional: Object.keys(updateTicketFields) },
);
updateTicketInputSchema.anyOf = Object.keys(updateTicketFields).map((field) => ({ required: [field] }));

export const gleapActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current Gleap user for the connected API key.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        user: gleapUserSchema,
        raw: rawPayloadSchema,
      },
      "Current Gleap user response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Gleap contact sessions for the connected project.",
    inputSchema: emptyInputSchema,
    outputSchema: s.actionOutput(
      {
        contacts: s.array("Contact sessions returned by Gleap.", gleapContactSchema),
        raw: rawPayloadSchema,
      },
      "Gleap contact session list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_contact_by_user_id",
    description: "Get a Gleap contact session by external user ID.",
    inputSchema: s.actionInput(
      {
        userId: s.nonEmptyString("External user ID associated with the contact."),
      },
      ["userId"],
      "Input for retrieving a Gleap contact by user ID.",
    ),
    outputSchema: s.actionOutput(
      {
        contact: gleapContactSchema,
        raw: rawPayloadSchema,
      },
      "Gleap contact session response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a Gleap contact session in the connected project.",
    inputSchema: createContactInputSchema,
    outputSchema: s.actionOutput(
      {
        contact: gleapContactSchema,
        raw: rawPayloadSchema,
      },
      "Created Gleap contact session response.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a Gleap contact session by session ID.",
    inputSchema: updateContactInputSchema,
    outputSchema: s.actionOutput(
      {
        contact: gleapContactSchema,
        raw: rawPayloadSchema,
      },
      "Updated Gleap contact session response.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_tickets",
    description: "List Gleap tickets with documented filters, sorting, and pagination.",
    inputSchema: s.object(
      "Query parameters for listing Gleap tickets.",
      {
        type: s.nonEmptyString("Ticket type filter, such as BUG or comma-separated types."),
        status: s.nonEmptyString("Ticket status filter, such as OPEN."),
        priority: s.nonEmptyString("Ticket priority filter, such as HIGH or comma-separated priorities."),
        archived: s.boolean("Whether to include only archived or non-archived tickets."),
        ignoreArchived: s.boolean("Whether Gleap should ignore archived tickets."),
        isSpam: s.boolean("Whether to include only spam or non-spam tickets."),
        sort: s.stringEnum("Sort order accepted by Gleap.", [
          "createdAt",
          "-createdAt",
          "priority",
          "-priority",
          "-updatedAt",
        ]),
        limit: s.integer("Maximum number of tickets to return.", { minimum: 1, maximum: 1000 }),
        skip: s.nonNegativeInteger("Number of tickets to skip for offset pagination."),
        filters: s.record("Additional Gleap document filters forwarded as query parameters.", filterValueSchema),
      },
      {
        optional: [
          "type",
          "status",
          "priority",
          "archived",
          "ignoreArchived",
          "isSpam",
          "sort",
          "limit",
          "skip",
          "filters",
        ],
      },
    ),
    outputSchema: s.actionOutput(
      {
        tickets: s.array("Tickets returned by Gleap.", gleapTicketSchema),
        count: s.nullable(s.integer("Number of tickets returned in this response.")),
        totalCount: s.nullable(s.integer("Total matching ticket count returned by Gleap.")),
        raw: rawPayloadSchema,
      },
      "Gleap ticket list response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_ticket",
    description: "Get a Gleap ticket by ID.",
    inputSchema: s.actionInput(
      {
        ticketId: s.nonEmptyString("Gleap ticket ID."),
      },
      ["ticketId"],
      "Input for retrieving a Gleap ticket.",
    ),
    outputSchema: s.actionOutput(
      {
        ticket: gleapTicketSchema,
        raw: rawPayloadSchema,
      },
      "Gleap ticket response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_ticket",
    description: "Create a Gleap ticket with native ticket fields.",
    inputSchema: createTicketInputSchema,
    outputSchema: s.actionOutput(
      {
        ticket: gleapTicketSchema,
        raw: rawPayloadSchema,
      },
      "Created Gleap ticket response.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_ticket_with_message",
    description: "Create a Gleap ticket with an optional initial message.",
    inputSchema: createTicketWithMessageInputSchema,
    outputSchema: s.actionOutput(
      {
        ticket: gleapTicketSchema,
        raw: rawPayloadSchema,
      },
      "Created Gleap ticket response.",
    ),
  }),
  defineProviderAction(service, {
    name: "update_ticket",
    description: "Update a Gleap ticket by ID.",
    inputSchema: updateTicketInputSchema,
    outputSchema: s.actionOutput(
      {
        ticket: gleapTicketSchema,
        raw: rawPayloadSchema,
      },
      "Updated Gleap ticket response.",
    ),
  }),
  defineProviderAction(service, {
    name: "delete_ticket",
    description: "Delete a Gleap ticket by ID.",
    inputSchema: s.actionInput(
      {
        ticketId: s.nonEmptyString("Gleap ticket ID."),
      },
      ["ticketId"],
      "Input for deleting a Gleap ticket.",
    ),
    outputSchema: s.actionOutput(
      {
        deleted: s.boolean("Whether the ticket deletion request completed successfully."),
        raw: rawPayloadSchema,
      },
      "Gleap ticket deletion response.",
    ),
  }),
];
