import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "supportbee" as const;

const positiveIdSchema = s.positiveInteger("A positive SupportBee numeric identifier.");
const perPageSchema = s.integer("The number of records to retrieve. SupportBee requires this to be less than 100.", {
  minimum: 1,
  maximum: 99,
});
const pageSchema = s.positiveInteger("The one-based SupportBee page number to retrieve.");
const emailArraySchema = s.array("Email addresses sent to SupportBee.", s.email("One email address."), {
  minItems: 1,
});
const attachmentIdsSchema = s.array(
  "SupportBee attachment IDs that were already uploaded through the SupportBee attachment API.",
  positiveIdSchema,
  { minItems: 1 },
);
const supportbeeRoleSchema = s.stringEnum("A SupportBee user role.", ["admin", "agent", "collaborator", "customer"]);
const maxTicketsSchema = s.anyOf(
  "The maximum number of tickets SupportBee should include for the user, or false to request all tickets.",
  [
    s.nonNegativeInteger("The maximum number of tickets SupportBee should include for the user."),
    s.literal(false, { description: "Request all tickets for the user." }),
  ],
);
const upstreamRawObjectSchema = s.looseObject("The raw object returned by SupportBee.");

const supportbeeContentOutputSchema = s.nullable(
  s.looseObject("The ticket, reply, or comment content object returned by SupportBee."),
);

const supportbeeActorOutputSchema = s.nullable(
  s.looseObject("The user, requester, agent, commenter, or replier object returned by SupportBee."),
);

const supportbeeTicketSchema = s.object("A normalized SupportBee ticket.", {
  id: s.nullable(s.integer("The SupportBee ticket ID.")),
  subject: s.nullable(s.string("The ticket subject.")),
  replies_count: s.nullable(s.integer("The number of replies on the ticket.")),
  comments_count: s.nullable(s.integer("The number of comments on the ticket.")),
  created_at: s.nullable(s.string("The ticket creation time returned by SupportBee.")),
  last_activity_at: s.nullable(s.string("The ticket last-activity time returned by SupportBee.")),
  unanswered: s.nullable(s.boolean("Whether the ticket is currently unanswered.")),
  archived: s.nullable(s.boolean("Whether the ticket is archived.")),
  spam: s.nullable(s.boolean("Whether the ticket is marked as spam.")),
  labels: s.array("The label names returned with the ticket.", s.string("A label name.")),
  requester: supportbeeActorOutputSchema,
  content: supportbeeContentOutputSchema,
  raw: upstreamRawObjectSchema,
});

const supportbeeReplySchema = s.object("A normalized SupportBee ticket reply.", {
  id: s.nullable(s.integer("The SupportBee reply ID.")),
  created_at: s.nullable(s.string("The reply creation time returned by SupportBee.")),
  summary: s.nullable(s.string("The reply summary returned by SupportBee.")),
  cc: s.array("The CC email addresses returned with the reply.", s.string("A CC email address.")),
  bcc: s.array("The BCC email addresses returned with the reply.", s.string("A BCC email address.")),
  replier: supportbeeActorOutputSchema,
  content: supportbeeContentOutputSchema,
  raw: upstreamRawObjectSchema,
});

const supportbeeCommentSchema = s.object("A normalized SupportBee ticket comment.", {
  id: s.nullable(s.integer("The SupportBee comment ID.")),
  created_at: s.nullable(s.string("The comment creation time returned by SupportBee.")),
  commenter: supportbeeActorOutputSchema,
  content: supportbeeContentOutputSchema,
  raw: upstreamRawObjectSchema,
});

const supportbeeUserSchema = s.object("A normalized SupportBee user or customer group.", {
  id: s.nullable(s.integer("The SupportBee user or customer group ID.")),
  type: s.nullable(s.string("The SupportBee user type when returned.")),
  email: s.nullable(s.string("The user email address when returned.")),
  name: s.nullable(s.string("The user or customer group display name.")),
  role: s.nullable(s.string("The SupportBee role string when returned.")),
  agent: s.nullable(s.boolean("Whether SupportBee marks the user as an agent.")),
  teams: s.array("The teams returned with the user.", s.looseObject("A SupportBee team object.")),
  raw: upstreamRawObjectSchema,
});

const supportbeeTeamSchema = s.object("A normalized SupportBee team.", {
  id: s.nullable(s.integer("The SupportBee team ID.")),
  name: s.nullable(s.string("The SupportBee team name.")),
  users: s.array("The users returned with the team when requested.", upstreamRawObjectSchema),
  raw: upstreamRawObjectSchema,
});

const supportbeeLabelSchema = s.object("A SupportBee label.", {
  id: s.nullable(s.integer("The SupportBee label ID.")),
  label: s.nullable(s.string("The SupportBee label name.")),
  ticket: s.nullable(s.integer("The SupportBee ticket ID associated with the label.")),
  raw: upstreamRawObjectSchema,
});

const ticketFiltersSchema = {
  per_page: perPageSchema,
  page: pageSchema,
  archived: s.stringEnum("How SupportBee should include archived tickets: true, false, or any.", [
    "true",
    "false",
    "any",
  ]),
  spam: s.boolean("Whether SupportBee should include tickets marked as spam."),
  trash: s.boolean("Whether SupportBee should include trashed tickets."),
  replies: s.boolean("Whether SupportBee should return only tickets with replies or only tickets without replies."),
  max_replies: s.nonNegativeInteger("The exact number of replies a ticket must have."),
  assigned_user: s.string("SupportBee assigned_user filter such as me, any, none, or an agent ID.", { minLength: 1 }),
  assigned_team: s.string("SupportBee assigned_team filter such as mine, none, or a team ID.", { minLength: 1 }),
  label: s.string("The SupportBee label name used to filter tickets.", { minLength: 1 }),
  since: s.string("A SupportBee date, date-time, or timestamp lower bound for ticket activity.", { minLength: 1 }),
  until: s.string("A SupportBee date, date-time, or timestamp upper bound for ticket activity.", { minLength: 1 }),
  sort_by: s.stringEnum("The SupportBee ticket sort mode.", ["last_activity", "creation_time"]),
  requester_emails: emailArraySchema,
  total_only: s.boolean("Whether SupportBee should return only the total ticket count."),
};
const ticketFilterOptionalKeys = [
  "per_page",
  "page",
  "archived",
  "spam",
  "trash",
  "replies",
  "max_replies",
  "assigned_user",
  "assigned_team",
  "label",
  "since",
  "until",
  "sort_by",
  "requester_emails",
  "total_only",
] as const;

const ticketListOutputSchema = s.object("The response returned when listing SupportBee tickets.", {
  tickets: s.array("The tickets returned by SupportBee.", supportbeeTicketSchema),
  current_page: s.nullable(s.integer("The current SupportBee page number when returned.")),
  per_page: s.nullable(s.integer("The SupportBee page size when returned.")),
  total_pages: s.nullable(s.integer("The total number of SupportBee pages when returned.")),
  total: s.nullable(s.integer("The total number of SupportBee tickets when returned.")),
  raw: upstreamRawObjectSchema,
});

const createTicketInputSchema = s.object(
  "Input for creating a SupportBee ticket.",
  {
    subject: s.string("The subject of the ticket.", { minLength: 1 }),
    requester_name: s.string("The name of the ticket requester.", { minLength: 1 }),
    requester_email: s.email("The email address of the ticket requester."),
    cc: emailArraySchema,
    bcc: emailArraySchema,
    notify_requester: s.boolean(
      "Whether SupportBee should email a copy of the ticket to the requester, CC, and BCC recipients.",
    ),
    text: s.string("The plain-text ticket body. Either text or html must be provided.", { minLength: 1 }),
    html: s.string("The HTML ticket body. Either text or html must be provided.", { minLength: 1 }),
    attachment_ids: attachmentIdsSchema,
    forwarding_address_id: s.string(
      "The SupportBee forwarding address ID used as the sender for ticket copies or auto-responses.",
      { minLength: 1 },
    ),
  },
  {
    optional: [
      "subject",
      "requester_name",
      "requester_email",
      "cc",
      "bcc",
      "notify_requester",
      "text",
      "html",
      "attachment_ids",
      "forwarding_address_id",
    ],
  },
);

const replyContentInputSchema = s.object(
  "Input fields for creating a SupportBee ticket reply.",
  {
    ticket_id: positiveIdSchema,
    text: s.string("The plain-text reply body. Either text or html must be provided.", { minLength: 1 }),
    html: s.string("The HTML reply body. Either text or html must be provided.", { minLength: 1 }),
    cc: emailArraySchema,
    bcc: emailArraySchema,
    attachment_ids: attachmentIdsSchema,
    on_behalf_of: s.object(
      "The SupportBee agent to reply on behalf of. Admin rights are required upstream.",
      {
        id: positiveIdSchema,
        email: s.email("The email address of the agent to reply on behalf of."),
      },
      { optional: ["id", "email"] },
    ),
  },
  { optional: ["text", "html", "cc", "bcc", "attachment_ids", "on_behalf_of"] },
);

const commentContentInputSchema = s.object(
  "Input fields for creating a SupportBee ticket comment.",
  {
    ticket_id: positiveIdSchema,
    text: s.string("The plain-text comment body. Either text or html must be provided.", { minLength: 1 }),
    html: s.string("The HTML comment body. Either text or html must be provided.", { minLength: 1 }),
  },
  { optional: ["text", "html"] },
);

const userInputSchema = s.object(
  "Input fields for creating or updating a SupportBee user or customer group.",
  {
    email: s.email("The user email address. Required when type is user or omitted."),
    name: s.string("The user or customer group name.", { minLength: 1 }),
    role: s.integer("The SupportBee role value: 9 for Collaborator, 10 for Agent, or 20 for Admin."),
    team_ids: s.array("SupportBee team IDs to associate with the user.", positiveIdSchema, { minItems: 1 }),
    type: s.stringEnum("Whether to create or update a user or customer group.", ["user", "customer_group"]),
    can_members_access_group_tickets: s.nullable(
      s.boolean("Whether customer group members can access group tickets from the portal."),
    ),
    email_domains: s.array(
      "Email domains whose users should automatically join the customer group.",
      s.string("An email domain.", { minLength: 1 }),
      { minItems: 1 },
    ),
  },
  {
    optional: ["email", "role", "team_ids", "type", "can_members_access_group_tickets", "email_domains"],
  },
);

export const supportbeeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tickets",
    description: "List SupportBee tickets with optional official ticket filters.",
    inputSchema: s.object("Input filters for listing SupportBee tickets.", ticketFiltersSchema, {
      optional: ticketFilterOptionalKeys,
    }),
    outputSchema: ticketListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_tickets",
    description: "Search SupportBee tickets by query text with optional pagination filters.",
    inputSchema: s.object(
      "Input parameters for searching SupportBee tickets.",
      {
        query: s.string("The SupportBee ticket search query.", { minLength: 1 }),
        per_page: perPageSchema,
        page: pageSchema,
        spam: s.boolean("Whether SupportBee should include tickets marked as spam."),
        trash: s.boolean("Whether SupportBee should include trashed tickets."),
      },
      { optional: ["per_page", "page", "spam", "trash"] },
    ),
    outputSchema: ticketListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_ticket",
    description: "Retrieve a SupportBee ticket by ID.",
    inputSchema: s.object(
      "Input parameters for retrieving a SupportBee ticket.",
      { id: positiveIdSchema },
      { required: ["id"] },
    ),
    outputSchema: s.object("The response returned when retrieving a SupportBee ticket.", {
      ticket: supportbeeTicketSchema,
      raw: upstreamRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_ticket",
    description: "Create a SupportBee ticket with JSON body content and optional email recipients.",
    inputSchema: createTicketInputSchema,
    outputSchema: s.object("The response returned when creating a SupportBee ticket.", {
      ticket: supportbeeTicketSchema,
      raw: upstreamRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_ticket_replies",
    description: "List replies for a SupportBee ticket.",
    inputSchema: s.object(
      "Input parameters for listing SupportBee ticket replies.",
      { ticket_id: positiveIdSchema },
      { required: ["ticket_id"] },
    ),
    outputSchema: s.object("The response returned when listing SupportBee ticket replies.", {
      replies: s.array("The replies returned by SupportBee.", supportbeeReplySchema),
      raw: upstreamRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_ticket_reply",
    description: "Retrieve one SupportBee ticket reply by ticket ID and reply ID.",
    inputSchema: s.object(
      "Input parameters for retrieving a SupportBee ticket reply.",
      {
        ticket_id: positiveIdSchema,
        reply_id: positiveIdSchema,
      },
      { required: ["ticket_id", "reply_id"] },
    ),
    outputSchema: s.object("The response returned when retrieving a SupportBee ticket reply.", {
      reply: supportbeeReplySchema,
      raw: upstreamRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_ticket_reply",
    description: "Create a SupportBee ticket reply with JSON body content.",
    inputSchema: replyContentInputSchema,
    outputSchema: s.object("The response returned when creating a SupportBee ticket reply.", {
      reply: supportbeeReplySchema,
      raw: upstreamRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_ticket_comments",
    description: "List comments for a SupportBee ticket.",
    inputSchema: s.object(
      "Input parameters for listing SupportBee ticket comments.",
      { ticket_id: positiveIdSchema },
      { required: ["ticket_id"] },
    ),
    outputSchema: s.object("The response returned when listing SupportBee ticket comments.", {
      comments: s.array("The comments returned by SupportBee.", supportbeeCommentSchema),
      raw: upstreamRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_ticket_comment",
    description: "Create a SupportBee ticket comment with JSON body content.",
    inputSchema: commentContentInputSchema,
    outputSchema: s.object("The response returned when creating a SupportBee ticket comment.", {
      comment: supportbeeCommentSchema,
      raw: upstreamRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_labels",
    description: "List custom SupportBee labels for the connected desk.",
    inputSchema: s.object("Input parameters for listing SupportBee labels.", {}),
    outputSchema: s.object("The response returned when listing SupportBee labels.", {
      labels: s.array("The labels returned by SupportBee.", supportbeeLabelSchema),
      raw: upstreamRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "add_label_to_ticket",
    description: "Add an existing SupportBee label to a ticket.",
    inputSchema: s.object(
      "Input parameters for adding a SupportBee label to a ticket.",
      {
        ticket_id: positiveIdSchema,
        label_name: s.string("The existing SupportBee label name to add.", { minLength: 1 }),
      },
      { required: ["ticket_id", "label_name"] },
    ),
    outputSchema: s.object("The response returned when adding a SupportBee label.", {
      label: supportbeeLabelSchema,
      raw: upstreamRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "remove_label_from_ticket",
    description: "Remove a SupportBee label from a ticket.",
    inputSchema: s.object(
      "Input parameters for removing a SupportBee label from a ticket.",
      {
        ticket_id: positiveIdSchema,
        label_name: s.string("The SupportBee label name to remove.", { minLength: 1 }),
      },
      { required: ["ticket_id", "label_name"] },
    ),
    outputSchema: s.object("The response returned when removing a SupportBee label.", {
      ok: s.boolean("Whether the label operation completed successfully."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List SupportBee users and customer groups.",
    inputSchema: s.object(
      "Input filters for listing SupportBee users and customer groups.",
      {
        with_invited: s.boolean("Whether SupportBee should include invited users."),
        with_roles: s.array(
          "Role names SupportBee should include, sent as a comma-separated with_roles query value.",
          supportbeeRoleSchema,
          { minItems: 1 },
        ),
        type: s.stringEnum("The SupportBee user type filter.", ["user", "customer_group"]),
      },
      { optional: ["with_invited", "with_roles", "type"] },
    ),
    outputSchema: s.object("The response returned when listing SupportBee users.", {
      users: s.array("The users and customer groups returned by SupportBee.", supportbeeUserSchema),
      raw: upstreamRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Retrieve one SupportBee user or customer group by ID.",
    inputSchema: s.object(
      "Input parameters for retrieving a SupportBee user or customer group.",
      {
        id: positiveIdSchema,
        max_tickets: maxTicketsSchema,
      },
      { optional: ["max_tickets"] },
    ),
    outputSchema: s.object("The response returned when retrieving a SupportBee user.", {
      user: supportbeeUserSchema,
      raw: upstreamRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_user",
    description: "Create a SupportBee user or customer group.",
    inputSchema: userInputSchema,
    outputSchema: s.object("The response returned when creating a SupportBee user.", {
      user: supportbeeUserSchema,
      raw: upstreamRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_user",
    description: "Update a SupportBee user or customer group by ID.",
    inputSchema: s.object(
      "Input parameters for updating a SupportBee user or customer group.",
      {
        id: positiveIdSchema,
        email: s.email("The user email address. Required when type is user or omitted."),
        name: s.string("The user or customer group name.", { minLength: 1 }),
        role: s.integer("The SupportBee role value: 9 for Collaborator, 10 for Agent, or 20 for Admin."),
        team_ids: s.array("SupportBee team IDs to associate with the user.", positiveIdSchema, { minItems: 1 }),
        type: s.stringEnum("Whether to update a user or customer group.", ["user", "customer_group"]),
        can_members_access_group_tickets: s.nullable(
          s.boolean("Whether customer group members can access group tickets from the portal."),
        ),
        email_domains: s.array(
          "Email domains whose users should automatically join the customer group.",
          s.string("An email domain.", { minLength: 1 }),
          { minItems: 1 },
        ),
      },
      { optional: ["email", "role", "team_ids", "type", "can_members_access_group_tickets", "email_domains"] },
    ),
    outputSchema: s.object("The response returned when updating a SupportBee user.", {
      user: supportbeeUserSchema,
      raw: upstreamRawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_teams",
    description: "List SupportBee teams with optional user expansion filters.",
    inputSchema: s.object(
      "Input filters for listing SupportBee teams.",
      {
        with_users: s.boolean("Whether SupportBee should include users in each team."),
        user: s.stringEnum("The SupportBee user filter. Official docs currently support me.", ["me"]),
      },
      { optional: ["with_users", "user"] },
    ),
    outputSchema: s.object("The response returned when listing SupportBee teams.", {
      teams: s.array("The teams returned by SupportBee.", supportbeeTeamSchema),
      raw: upstreamRawObjectSchema,
    }),
  }),
];
