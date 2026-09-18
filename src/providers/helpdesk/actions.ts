import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "helpdesk" as const;

const trimmedString = (description: string) => s.nonEmptyString(description);

const ticketIdSchema = s.uuid("The HelpDesk ticket UUID.");
const agentIdSchema = s.uuid("The HelpDesk agent UUID.");
const teamIdSchema = s.uuid("The HelpDesk team UUID.");
const tagIdSchema = s.uuid("The HelpDesk tag UUID.");

const ticketStatusSchema = s.stringEnum("The HelpDesk ticket status.", [
  "open",
  "pending",
  "onhold",
  "solved",
  "closed",
] as const);

const ticketSiloSchema = s.stringEnum("The HelpDesk ticket silo.", ["tickets", "archive", "trash", "spam"] as const);

const ticketPrioritySchema = s.anyOf("The HelpDesk ticket priority.", [
  s.literal(-10, { description: "Low priority." }),
  s.literal(0, { description: "Medium priority." }),
  s.literal(10, { description: "High priority." }),
  s.literal(20, { description: "Urgent priority." }),
]);

const requesterInputSchema = s.object(
  "The person requesting support.",
  {
    email: s.email("The requester email address."),
    name: trimmedString("The requester display name."),
  },
  { optional: ["name"] },
);

const messageTextSchema = s.string("The plain-text message content.", { minLength: 1 });

const messageInputSchema = s.requiredObject("A plain-text ticket message.", {
  text: messageTextSchema,
});

const copiedPersonInputSchema = s.object(
  "A person copied on ticket messages.",
  {
    email: s.email("The copied person's email address."),
    name: trimmedString("The copied person's display name."),
  },
  { optional: ["name"] },
);

const assignmentInputSchema = s.object(
  "A ticket assignment to a HelpDesk team, agent, or both.",
  {
    teamId: teamIdSchema,
    agentId: agentIdSchema,
  },
  { optional: ["teamId", "agentId"] },
);

const customFieldsInputSchema = s.record(
  "Custom field values keyed by the HelpDesk custom field API key.",
  s.unknown("A value accepted by the configured HelpDesk custom field."),
);

const ticketCursorSchema = s.requiredObject("A HelpDesk ticket pagination cursor.", {
  value: s.dateTime("The timestamp value of the selected sort field."),
  ID: ticketIdSchema,
});

const requesterOutputSchema = s.looseRequiredObject("The requester returned with a HelpDesk ticket.", {
  email: s.string("The requester email address."),
  name: s.string("The requester display name."),
});

const ticketOutputSchema = s.looseRequiredObject("A HelpDesk ticket returned by the API.", {
  ID: s.uuid("The unique ticket identifier."),
  licenseID: s.integer("The HelpDesk account identifier."),
  createdAt: s.dateTime("The time the ticket was created."),
  createdBy: s.uuid("The identifier that created the ticket."),
  createdByType: s.string("The type of actor that created the ticket."),
  updatedAt: s.dateTime("The time the ticket was last updated."),
  updatedBy: s.uuid("The identifier that last updated the ticket."),
  shortID: s.string("The human-readable short ticket identifier."),
  lastMessageAt: s.dateTime("The time of the last public message."),
  status: ticketStatusSchema,
  priority: ticketPrioritySchema,
  subject: s.string("The ticket subject."),
  teamIDs: s.array("The teams that can access the ticket.", teamIdSchema),
  requester: requesterOutputSchema,
  cc: s.array("The people copied on ticket messages.", requesterOutputSchema),
  tagIDs: s.array("The tags attached to the ticket.", tagIdSchema),
  followers: s.array("The agents following the ticket.", agentIdSchema),
  assignment: s.looseObject("The current team and agent assignment."),
  customFields: s.looseObject("The ticket custom field values."),
  silo: ticketSiloSchema,
  source: s.looseObject("The source from which the ticket originated."),
  events: s.array("The ticket event history returned by HelpDesk.", s.looseObject("A HelpDesk ticket event.")),
});

const agentOutputSchema = s.looseRequiredObject("A HelpDesk agent returned by the API.", {
  ID: agentIdSchema,
  licenseID: s.integer("The HelpDesk account identifier."),
  createdAt: s.dateTime("The time the agent was created."),
  updatedAt: s.dateTime("The time the agent was last updated."),
  email: s.string("The agent email address."),
  name: s.string("The agent full name."),
  roles: s.array("The roles assigned to the agent.", s.string("A HelpDesk agent role.")),
  teamIDs: s.array("The teams to which the agent belongs.", teamIdSchema),
  status: s.string("The agent account status."),
  avatar: s.nullable(s.string("The agent avatar URL.")),
  jobTitle: s.nullable(s.string("The agent job title.")),
  autoassignment: s.boolean("Whether auto-assignment is enabled for the agent."),
});

const teamOutputSchema = s.looseRequiredObject("A HelpDesk team returned by the API.", {
  ID: teamIdSchema,
  licenseID: s.integer("The HelpDesk account identifier."),
  createdAt: s.dateTime("The time the team was created."),
  updatedAt: s.dateTime("The time the team was last updated."),
  name: s.string("The team name."),
  replyAddressID: s.nullable(s.uuid("The reply address used by the team.")),
  replyName: s.nullable(s.string("The sender name used for team replies.")),
  templateID: s.nullable(s.uuid("The email template used by the team.")),
  settings: s.looseObject("The team notification and routing settings."),
  integrations: s.looseObject("The team's external integration settings."),
});

const ticketMutationFields = {
  status: ticketStatusSchema,
  priority: ticketPrioritySchema,
  subject: trimmedString("The ticket subject."),
  teamIds: s.array("The teams that can access the ticket.", teamIdSchema),
  requester: requesterInputSchema,
  cc: s.array("The people copied on ticket messages.", copiedPersonInputSchema),
  tagIds: s.array("The tags to attach to the ticket.", tagIdSchema),
  followerIds: s.array("The agents that should follow the ticket.", agentIdSchema),
  assignment: assignmentInputSchema,
  message: messageInputSchema,
  isPrivate: s.boolean("Whether the new message is private to agents."),
  customFields: customFieldsInputSchema,
  authorType: s.stringEnum("The actor type attributed to this change.", ["agent", "client"] as const),
};

const listTicketsInputSchema = s.object(
  "Input for listing and searching HelpDesk tickets.",
  {
    status: ticketStatusSchema,
    silo: ticketSiloSchema,
    spam: s.boolean("Whether to include tickets marked as spam."),
    subject: trimmedString("A ticket subject filter."),
    query: trimmedString("A full-text ticket search query."),
    shortId: trimmedString("A human-readable HelpDesk short ticket identifier."),
    teamIds: s.array("The teams whose visible tickets should be returned.", teamIdSchema, {
      minItems: 1,
    }),
    tagIds: s.array("The tags that returned tickets must have.", tagIdSchema, {
      minItems: 1,
    }),
    hasAssignee: s.boolean("Whether returned tickets must have an assigned agent."),
    priority: ticketPrioritySchema,
    createdDateFrom: trimmedString(
      "The inclusive creation-time lower bound as an ISO timestamp or HelpDesk relative date.",
    ),
    createdDateTo: trimmedString(
      "The inclusive creation-time upper bound as an ISO timestamp or HelpDesk relative date.",
    ),
    updatedDateFrom: trimmedString(
      "The inclusive update-time lower bound as an ISO timestamp or HelpDesk relative date.",
    ),
    updatedDateTo: trimmedString(
      "The inclusive update-time upper bound as an ISO timestamp or HelpDesk relative date.",
    ),
    pageSize: s.integer("The maximum number of tickets to return.", {
      minimum: 1,
      maximum: 100,
    }),
    order: s.stringEnum("The ticket sort direction.", ["asc", "desc"] as const),
    sortBy: s.stringEnum("The ticket field used for cursor sorting.", [
      "createdAt",
      "updatedAt",
      "lastMessageAt",
    ] as const),
    next: ticketCursorSchema,
    prev: ticketCursorSchema,
  },
  {
    optional: [
      "status",
      "silo",
      "spam",
      "subject",
      "query",
      "shortId",
      "teamIds",
      "tagIds",
      "hasAssignee",
      "priority",
      "createdDateFrom",
      "createdDateTo",
      "updatedDateFrom",
      "updatedDateTo",
      "pageSize",
      "order",
      "sortBy",
      "next",
      "prev",
    ],
  },
);

const createTicketInputSchema = s.object(
  "Input for creating a HelpDesk ticket with a plain-text first message.",
  ticketMutationFields,
  {
    required: ["requester", "message"],
  },
);

const updateTicketInputSchema = s.object(
  "Input for partially updating a HelpDesk ticket.",
  {
    ticketId: ticketIdSchema,
    ...ticketMutationFields,
  },
  {
    optional: Object.keys(ticketMutationFields),
  },
);

const listTicketsAction = defineProviderAction(service, {
  name: "list_tickets",
  operationType: "read",
  description: "List and search HelpDesk tickets with documented filters and composite cursor pagination.",
  inputSchema: listTicketsInputSchema,
  outputSchema: s.requiredObject("A page of HelpDesk tickets and cursor metadata.", {
    tickets: s.array("The tickets returned by HelpDesk.", ticketOutputSchema),
    totalPages: s.nullable(s.integer("The total number of pages reported by HelpDesk.")),
    totalResults: s.nullable(s.integer("The total number of matching tickets.")),
    nextCursor: s.nullable(ticketCursorSchema),
    prevCursor: s.nullable(ticketCursorSchema),
  }),
});

const getTicketAction = defineProviderAction(service, {
  name: "get_ticket",
  operationType: "read",
  description: "Get one HelpDesk ticket by UUID.",
  inputSchema: s.requiredObject("Input for selecting one HelpDesk ticket.", {
    ticketId: ticketIdSchema,
  }),
  outputSchema: s.requiredObject("The HelpDesk ticket response.", {
    ticket: ticketOutputSchema,
  }),
});

const createTicketAction = defineProviderAction(service, {
  name: "create_ticket",
  operationType: "write",
  description:
    "Create a HelpDesk ticket with a requester and plain-text first message; attachment transactions are intentionally excluded.",
  inputSchema: createTicketInputSchema,
  outputSchema: s.requiredObject("The ticket created by HelpDesk.", {
    ticket: ticketOutputSchema,
  }),
});

const updateTicketAction = defineProviderAction(service, {
  name: "update_ticket",
  operationType: "write",
  description: "Partially update a HelpDesk ticket and optionally add one plain-text public or private message.",
  inputSchema: updateTicketInputSchema,
  outputSchema: s.requiredObject("The ticket updated by HelpDesk.", {
    ticket: ticketOutputSchema,
  }),
});

const deleteTicketAction = defineProviderAction(service, {
  name: "delete_ticket",
  operationType: "destructive",
  description: "Delete a HelpDesk ticket by UUID.",
  inputSchema: s.requiredObject("Input for deleting one HelpDesk ticket.", {
    ticketId: ticketIdSchema,
  }),
  outputSchema: s.requiredObject("The HelpDesk delete acknowledgement.", {
    ok: s.boolean("Whether HelpDesk returned its documented OK acknowledgement."),
  }),
});

const moveTicketToSiloAction = defineProviderAction(service, {
  name: "move_ticket_to_silo",
  operationType: "destructive",
  description: "Move a HelpDesk ticket between the active, archive, trash, or spam silos.",
  inputSchema: s.requiredObject("Input for moving one HelpDesk ticket.", {
    ticketId: ticketIdSchema,
    silo: ticketSiloSchema,
  }),
  outputSchema: s.requiredObject("The HelpDesk silo-move acknowledgement.", {
    ok: s.boolean("Whether HelpDesk returned its documented OK acknowledgement."),
  }),
});

const listAgentsAction = defineProviderAction(service, {
  name: "list_agents",
  operationType: "read",
  description: "List HelpDesk agents available for ticket assignment and following.",
  inputSchema: s.requiredObject("Input for listing HelpDesk agents.", {}),
  outputSchema: s.requiredObject("The HelpDesk agent list.", {
    agents: s.array("The agents returned by HelpDesk.", agentOutputSchema),
  }),
});

const listTeamsAction = defineProviderAction(service, {
  name: "list_teams",
  operationType: "read",
  description: "List HelpDesk teams available for ticket assignment and visibility.",
  inputSchema: s.requiredObject("Input for listing HelpDesk teams.", {}),
  outputSchema: s.requiredObject("The HelpDesk team list.", {
    teams: s.array("The teams returned by HelpDesk.", teamOutputSchema),
  }),
});

export const helpdeskActions: ActionDefinition[] = [
  listTicketsAction,
  getTicketAction,
  createTicketAction,
  updateTicketAction,
  deleteTicketAction,
  moveTicketToSiloAction,
  listAgentsAction,
  listTeamsAction,
];

export type HelpdeskActionName =
  | "list_tickets"
  | "get_ticket"
  | "create_ticket"
  | "update_ticket"
  | "delete_ticket"
  | "move_ticket_to_silo"
  | "list_agents"
  | "list_teams";
