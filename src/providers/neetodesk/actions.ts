import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "neetodesk";
const paginationInput = {
  page_number: s.positiveInteger("The one-based page number to retrieve."),
  page_size: s.positiveInteger("The number of records to return per page."),
};
const paginationSchema = s.requiredObject("Pagination metadata returned by NeetoDesk.", {
  total_records: s.integer("The total number of matching records."),
  total_pages: s.integer("The total number of result pages."),
  current_page_number: s.integer("The current one-based page number."),
  page_size: s.integer("The number of records in one page."),
});
const personSchema = s.looseObject("A NeetoDesk person summary.", {
  id: s.string("The person's unique identifier."),
  name: s.string("The person's display name."),
  email: s.string("The person's email address."),
});
const ticketSchema = s.looseObject("A NeetoDesk ticket and any additional upstream fields.", {
  id: s.string("The ticket's unique identifier."),
  number: s.integer("The ticket's sequential workspace number."),
  subject: s.string("The ticket subject."),
  description: s.string("The ticket description as HTML content."),
  priority: s.string("The ticket priority."),
  status: s.string("The ticket status."),
  created_at: s.dateTime("The ticket creation timestamp."),
  updated_at: s.dateTime("The ticket update timestamp."),
  assignee: s.nullable(personSchema),
  customer: s.nullable(personSchema),
});
const createdTicketSchema = s.requiredObject("A newly created NeetoDesk ticket reference.", {
  id: s.string("The created ticket's unique identifier."),
  number: s.integer("The created ticket's sequential workspace number."),
  url: s.url("The NeetoDesk admin URL for the created ticket."),
});
const ticketWriteFields = {
  email: s.email("The customer email address."),
  subject: s.string("The ticket subject."),
  description: s.string("The ticket description."),
  status: s.string("A default or custom workspace ticket status."),
  priority: s.stringEnum("The ticket priority.", ["low", "medium", "high", "urgent"]),
  group: s.string("The name of an existing NeetoDesk group."),
  assignee_email: s.email("The email address of an existing team member."),
  category: s.string("The ticket category."),
  sub_category_one: s.string("The ticket's first-level sub-category."),
  sub_category_two: s.string("The ticket's second-level sub-category."),
  tags: s.stringArray("Tags to assign to the ticket.", { itemDescription: "A ticket tag." }),
  ticket_fields: s.record("Custom ticket fields keyed by field name.", s.string("A custom ticket field value.")),
};
const ticketWriteOptional = Object.keys(ticketWriteFields);
const commentSchema = s.looseRequiredObject(
  "A NeetoDesk ticket comment and any additional upstream fields.",
  {
    id: s.string("The comment's unique identifier."),
    created_at: s.dateTime("The comment creation timestamp."),
    comment_type: s.string("The comment type, such as reply or note."),
    content: s.string("The comment content."),
    author: personSchema,
  },
  { optional: ["author"] },
);

export const neetodeskActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tickets",
    operationType: "read",
    description: "List tickets in a NeetoDesk workspace with pagination and optional filters.",
    inputSchema: s.object(
      "Filters for listing NeetoDesk tickets.",
      {
        ...paginationInput,
        status: s.string("Comma-separated default or custom ticket statuses."),
        external_id: s.string("The external source identifier to match."),
        sort: s.stringEnum("The ticket field used for sorting.", ["created_at", "updated_at"]),
        order: s.stringEnum("The sort direction.", ["asc", "desc"]),
      },
      { optional: ["page_number", "page_size", "status", "external_id", "sort", "order"] },
    ),
    outputSchema: s.requiredObject("A page of NeetoDesk tickets.", {
      tickets: s.array("The returned tickets.", ticketSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_ticket",
    operationType: "read",
    description: "Retrieve one NeetoDesk ticket by UUID or sequential ticket number.",
    inputSchema: s.requiredObject("The NeetoDesk ticket to retrieve.", {
      ticket_id: s.nonEmptyString("The ticket UUID or sequential ticket number."),
    }),
    outputSchema: s.requiredObject("The requested NeetoDesk ticket.", { ticket: ticketSchema }),
  }),
  defineProviderAction(service, {
    name: "create_ticket",
    operationType: "write",
    description: "Create a ticket in a NeetoDesk workspace.",
    inputSchema: s.object("The NeetoDesk ticket to create.", ticketWriteFields, {
      required: ["email", "subject", "description"],
    }),
    outputSchema: s.requiredObject("The created NeetoDesk ticket reference.", { ticket: createdTicketSchema }),
  }),
  defineProviderAction(service, {
    name: "update_ticket",
    operationType: "write",
    description: "Update selected fields on an existing NeetoDesk ticket.",
    inputSchema: s.object(
      "The NeetoDesk ticket update.",
      { ticket_id: s.nonEmptyString("The ticket UUID or sequential ticket number."), ...ticketWriteFields },
      { required: ["ticket_id"], optional: ticketWriteOptional },
    ),
    outputSchema: s.requiredObject("The updated NeetoDesk ticket.", { ticket: ticketSchema }),
  }),
  defineProviderAction(service, {
    name: "list_comments",
    operationType: "read",
    description: "List comments for a NeetoDesk ticket.",
    inputSchema: s.object(
      "The ticket and page of comments to retrieve.",
      { ticket_id: s.nonEmptyString("The ticket UUID or sequential ticket number."), ...paginationInput },
      { required: ["ticket_id"], optional: ["page_number", "page_size"] },
    ),
    outputSchema: s.requiredObject("A page of NeetoDesk ticket comments.", {
      comments: s.array("The returned comments.", commentSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_comment",
    operationType: "write",
    description: "Create a reply or private note on a NeetoDesk ticket.",
    inputSchema: s.object(
      "The NeetoDesk ticket comment to create.",
      {
        ticket_id: s.nonEmptyString("The ticket UUID or sequential ticket number."),
        author_email: s.email("The email address attributed as the comment author."),
        content: s.nonEmptyString("The comment content."),
        author_type: s.stringEnum("The kind of author represented by author_email.", ["agent", "customer"]),
        comment_type: s.stringEnum("Whether to create a public reply or private note.", ["reply", "note"]),
        message_id: s.string("A caller-supplied idempotency identifier unique per ticket."),
      },
      { required: ["ticket_id", "author_email", "content"] },
    ),
    outputSchema: s.requiredObject("The created NeetoDesk comment.", { comment: commentSchema }),
  }),
  defineProviderAction(service, {
    name: "list_team_members",
    operationType: "read",
    description: "List team members in a NeetoDesk workspace.",
    inputSchema: s.object(
      "Filters for listing NeetoDesk team members.",
      { ...paginationInput, email: s.email("The exact team member email address to match.") },
      { optional: ["page_number", "page_size", "email"] },
    ),
    outputSchema: s.requiredObject("A page of NeetoDesk team members.", {
      team_members: s.array(
        "The returned team members.",
        s.looseRequiredObject("A NeetoDesk team member.", {
          id: s.string("The team member's unique identifier."),
          email: s.string("The team member's email address."),
          first_name: s.string("The team member's first name."),
          last_name: s.string("The team member's last name."),
          active: s.boolean("Whether the team member is active."),
        }),
      ),
      pagination: paginationSchema,
    }),
  }),
];
