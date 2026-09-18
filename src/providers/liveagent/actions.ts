import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "liveagent";

const sortDirectionSchema = s.stringEnum("Sort direction accepted by LiveAgent.", ["ASC", "DESC"]);
const ticketStatusSchema = s.stringEnum("LiveAgent ticket status code.", [
  "I",
  "N",
  "T",
  "P",
  "R",
  "X",
  "B",
  "A",
  "C",
  "W",
  "L",
]);
const contactGenderSchema = s.stringEnum("LiveAgent contact gender code.", ["M", "F", "O", "X"]);

const looseRawSchema = s.looseObject("Raw object returned by LiveAgent.");
const stringListSchema = s.array("String values returned by LiveAgent.", s.string("A string value."));
const customFieldListSchema = s.array(
  "LiveAgent custom fields. The nested shape is provider-defined.",
  s.looseObject("A LiveAgent custom field object."),
);

const paginationInputSchema = {
  page: s.integer("Page to send as the LiveAgent _page query parameter.", { minimum: 1 }),
  perPage: s.integer("Number of results to send as the LiveAgent _perPage query parameter.", {
    minimum: 1,
    maximum: 1000,
  }),
  from: s.integer("Result-set start offset to send as the LiveAgent _from query parameter.", {
    minimum: 0,
  }),
  to: s.integer("Result-set end offset to send as the LiveAgent _to query parameter.", {
    minimum: 0,
  }),
  sortDir: sortDirectionSchema,
  sortField: s.nonEmptyString("LiveAgent field name to send as the _sortField query parameter."),
  filters: s.nonEmptyString("LiveAgent filters encoded as the JSON string documented by the API and sent as _filters."),
};

const ticketInputSchema = {
  useridentifier: s.nonEmptyString("Contact identifier, usually the visitor email address."),
  subject: s.nonEmptyString("Ticket subject."),
  departmentid: s.nonEmptyString("LiveAgent department ID for the ticket."),
  recipient: s.nonEmptyString("Recipient email address used by LiveAgent."),
  message: s.nonEmptyString("Initial ticket message body."),
  recipient_name: s.string("Recipient display name."),
  carbon_copies: s.string("Comma-separated CC recipients accepted by LiveAgent."),
  blind_carbon_copies: s.string("Comma-separated BCC recipients accepted by LiveAgent."),
  status: ticketStatusSchema,
  mail_message_id: s.string("External mail message ID to associate with the ticket."),
  do_not_send_mail: s.stringEnum("Whether LiveAgent should skip sending mail.", ["Y", "N"]),
  use_template: s.stringEnum("Whether LiveAgent should use the configured mail template.", ["Y", "N"]),
  is_html_message: s.stringEnum("Whether the message body is HTML.", ["Y", "N"]),
  tags: s.array("LiveAgent tag IDs to attach to the ticket.", s.string("A LiveAgent tag ID.")),
  custom_fields: customFieldListSchema,
};

const ticketUpdateInputSchema = {
  owner_contactid: s.string("LiveAgent owner contact ID."),
  departmentid: s.string("LiveAgent department ID."),
  agentid: s.string("LiveAgent agent ID."),
  status: ticketStatusSchema,
  subject: s.nonEmptyString("Ticket subject."),
  tags: s.array("LiveAgent tag IDs to set on the ticket.", s.string("A LiveAgent tag ID.")),
  custom_fields: customFieldListSchema,
};

const contactInputSchema = {
  id: s.string("Optional contact ID supplied to LiveAgent."),
  company_id: s.string("LiveAgent company ID for the contact."),
  firstname: s.string("Contact first name."),
  lastname: s.string("Contact last name."),
  system_name: s.string("System name stored by LiveAgent."),
  description: s.string("Contact description."),
  avatar_url: s.url("Contact avatar URL."),
  gender: contactGenderSchema,
  language: s.string("Contact language code."),
  city: s.string("Contact city."),
  countrycode: s.string("Contact country code."),
  ip: s.string("Contact IP address."),
  emails: s.array("Contact email addresses.", s.email("A contact email address.")),
  phones: s.array("Contact phone numbers.", s.string("A contact phone number.")),
  groups: s.array("LiveAgent contact group IDs.", s.string("A LiveAgent group ID.")),
  job_position: s.string("Contact job position."),
  note: s.string("Contact note."),
  useragent: s.string("Contact browser user-agent string."),
  screen: s.string("Contact screen information."),
  time_offset: s.number("Contact timezone offset."),
  latitude: s.number("Contact latitude."),
  longitude: s.number("Contact longitude."),
  custom_fields: customFieldListSchema,
};

const ticketSchema = s.looseObject("A normalized LiveAgent ticket.", {
  id: s.nullable(s.string("LiveAgent ticket ID.")),
  code: s.nullable(s.string("LiveAgent ticket code.")),
  subject: s.nullable(s.string("Ticket subject.")),
  status: s.nullable(s.string("LiveAgent ticket status code.")),
  departmentid: s.nullable(s.string("LiveAgent department ID.")),
  agentid: s.nullable(s.string("LiveAgent agent ID.")),
  owner_contactid: s.nullable(s.string("LiveAgent owner contact ID.")),
  owner_email: s.nullable(s.string("Owner email address.")),
  owner_name: s.nullable(s.string("Owner display name.")),
  tags: s.nullable(stringListSchema),
  raw: looseRawSchema,
});

const ticketListItemSchema = s.looseObject("A normalized LiveAgent ticket list item.", {
  conversationid: s.nullable(s.string("LiveAgent conversation ID.")),
  code: s.nullable(s.string("LiveAgent ticket code.")),
  subject: s.nullable(s.string("Ticket subject.")),
  status: s.nullable(s.string("LiveAgent ticket status code.")),
  departmentid: s.nullable(s.string("LiveAgent department ID.")),
  agentid: s.nullable(s.string("LiveAgent agent ID.")),
  contactid: s.nullable(s.string("LiveAgent contact ID.")),
  ownerEmail: s.nullable(s.string("Primary owner or contact email address.")),
  ownerName: s.nullable(s.string("Primary owner or contact display name.")),
  datecreated: s.nullable(s.integer("Unix timestamp when the ticket was created.")),
  datechanged: s.nullable(s.integer("Unix timestamp when the ticket was last changed.")),
  tags: s.nullable(stringListSchema),
  raw: looseRawSchema,
});

const contactSchema = s.looseObject("A normalized LiveAgent contact.", {
  id: s.nullable(s.string("LiveAgent contact ID.")),
  firstname: s.nullable(s.string("Contact first name.")),
  lastname: s.nullable(s.string("Contact last name.")),
  system_name: s.nullable(s.string("Contact system name.")),
  type: s.nullable(s.string("LiveAgent contact type code.")),
  registration_email: s.nullable(s.string("Registered contact email address.")),
  emails: s.nullable(stringListSchema),
  phones: s.nullable(stringListSchema),
  groups: s.nullable(stringListSchema),
  raw: looseRawSchema,
});

const groupSchema = s.looseObject("A normalized LiveAgent contact group.", {
  id: s.nullable(s.string("LiveAgent group ID.")),
  name: s.nullable(s.string("Group name.")),
  color: s.nullable(s.string("Group foreground color.")),
  background_color: s.nullable(s.string("Group background color.")),
  raw: looseRawSchema,
});

const departmentSchema = s.looseObject("A normalized LiveAgent department.", {
  department_id: s.nullable(s.string("LiveAgent department ID.")),
  name: s.nullable(s.string("Department name.")),
  online_status: s.nullable(s.string("Department online status.")),
  agent_count: s.nullable(s.number("Number of agents in the department.")),
  agent_ids: s.nullable(stringListSchema),
  mailaccount_id: s.nullable(s.string("Associated LiveAgent mail account ID.")),
  raw: looseRawSchema,
});

export const liveagentActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tickets",
    operationType: "read",
    description: "List LiveAgent tickets with page pagination, sorting, and optional filters.",
    inputSchema: s.object("Query parameters for listing LiveAgent tickets.", paginationInputSchema, {
      optional: ["page", "perPage", "from", "to", "sortDir", "sortField", "filters"],
    }),
    outputSchema: s.requiredObject("LiveAgent ticket list response.", {
      tickets: s.array("Ticket rows returned by LiveAgent.", ticketListItemSchema),
      raw: looseRawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_ticket",
    operationType: "read",
    description: "Get a LiveAgent ticket by ID.",
    inputSchema: s.requiredObject("Input for fetching one LiveAgent ticket.", {
      ticketId: s.nonEmptyString("LiveAgent ticket ID."),
    }),
    outputSchema: s.requiredObject("LiveAgent ticket response.", {
      ticket: ticketSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_ticket",
    operationType: "write",
    description: "Create a LiveAgent ticket with an initial message.",
    inputSchema: s.object("LiveAgent ticket creation payload.", ticketInputSchema, {
      optional: [
        "recipient_name",
        "carbon_copies",
        "blind_carbon_copies",
        "status",
        "mail_message_id",
        "do_not_send_mail",
        "use_template",
        "is_html_message",
        "tags",
        "custom_fields",
      ],
    }),
    outputSchema: s.requiredObject("Created LiveAgent ticket response.", {
      ticket: ticketSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_ticket",
    operationType: "write",
    description: "Update mutable fields on a LiveAgent ticket.",
    inputSchema: s.object(
      "LiveAgent ticket update payload.",
      {
        ticketId: s.nonEmptyString("LiveAgent ticket ID."),
        ...ticketUpdateInputSchema,
      },
      {
        optional: ["owner_contactid", "departmentid", "agentid", "status", "subject", "tags", "custom_fields"],
      },
    ),
    outputSchema: s.requiredObject("Updated LiveAgent ticket response.", {
      ticket: ticketSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List LiveAgent contacts with pagination, sorting, and filters.",
    inputSchema: s.object("Query parameters for listing LiveAgent contacts.", paginationInputSchema, {
      optional: ["page", "perPage", "from", "to", "sortDir", "sortField", "filters"],
    }),
    outputSchema: s.requiredObject("LiveAgent contact list response.", {
      contacts: s.array("Contacts returned by LiveAgent.", contactSchema),
      raw: s.unknown("Raw LiveAgent list response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Get a LiveAgent contact by ID.",
    inputSchema: s.requiredObject("Input for fetching one LiveAgent contact.", {
      contactId: s.nonEmptyString("LiveAgent contact ID."),
    }),
    outputSchema: s.requiredObject("LiveAgent contact response.", {
      contact: contactSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_contact",
    operationType: "write",
    description: "Create a LiveAgent contact.",
    inputSchema: s.object("LiveAgent contact creation payload.", contactInputSchema, {
      optional: [
        "id",
        "company_id",
        "firstname",
        "lastname",
        "system_name",
        "description",
        "avatar_url",
        "gender",
        "language",
        "city",
        "countrycode",
        "ip",
        "emails",
        "phones",
        "groups",
        "job_position",
        "note",
        "useragent",
        "screen",
        "time_offset",
        "latitude",
        "longitude",
        "custom_fields",
      ],
    }),
    outputSchema: s.requiredObject("Created LiveAgent contact response.", {
      contact: contactSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "update_contact",
    operationType: "write",
    description: "Update mutable fields on a LiveAgent contact.",
    inputSchema: s.object(
      "LiveAgent contact update payload.",
      {
        contactId: s.nonEmptyString("LiveAgent contact ID."),
        ...contactInputSchema,
      },
      {
        optional: [
          "id",
          "company_id",
          "firstname",
          "lastname",
          "system_name",
          "description",
          "avatar_url",
          "gender",
          "language",
          "city",
          "countrycode",
          "ip",
          "emails",
          "phones",
          "groups",
          "job_position",
          "note",
          "useragent",
          "screen",
          "time_offset",
          "latitude",
          "longitude",
          "custom_fields",
        ],
      },
    ),
    outputSchema: s.requiredObject("Updated LiveAgent contact response.", {
      contact: contactSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    operationType: "read",
    description: "List LiveAgent contact groups.",
    inputSchema: s.object("Input for listing LiveAgent contact groups.", {}),
    outputSchema: s.requiredObject("LiveAgent contact group list response.", {
      groups: s.array("Contact groups returned by LiveAgent.", groupSchema),
      raw: s.unknown("Raw LiveAgent list response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_group",
    operationType: "read",
    description: "Get a LiveAgent contact group by ID.",
    inputSchema: s.requiredObject("Input for fetching one LiveAgent contact group.", {
      groupId: s.nonEmptyString("LiveAgent group ID."),
    }),
    outputSchema: s.requiredObject("LiveAgent contact group response.", {
      group: groupSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_departments",
    operationType: "read",
    description: "List LiveAgent departments with pagination, sorting, and filters.",
    inputSchema: s.object("Query parameters for listing LiveAgent departments.", paginationInputSchema, {
      optional: ["page", "perPage", "from", "to", "sortDir", "sortField", "filters"],
    }),
    outputSchema: s.requiredObject("LiveAgent department list response.", {
      departments: s.array("Departments returned by LiveAgent.", departmentSchema),
      raw: s.unknown("Raw LiveAgent list response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_department",
    operationType: "read",
    description: "Get a LiveAgent department by ID.",
    inputSchema: s.requiredObject("Input for fetching one LiveAgent department.", {
      departmentId: s.nonEmptyString("LiveAgent department ID."),
    }),
    outputSchema: s.requiredObject("LiveAgent department response.", {
      department: departmentSchema,
    }),
  }),
];
