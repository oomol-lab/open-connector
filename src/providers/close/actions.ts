import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "close";

const id = (description: string) => s.nonEmptyString(description);
const optionalFields = s.stringArray("Additional Close API fields to request through the _fields query parameter.", {
  minItems: 1,
  itemDescription: "A Close API field name.",
});
const opportunityValuePeriod = s.stringEnum("The Close opportunity value period.", ["one_time", "monthly", "annual"]);
const opportunityStatusType = s.stringEnum("The Close opportunity status type.", ["won", "lost", "active"]);

const leadSchema = s.looseObject("A Close lead object.");
const contactSchema = s.looseObject("A Close contact object.");
const taskSchema = s.looseObject("A Close task object.");
const opportunitySchema = s.looseObject("A Close opportunity object.");

const emailInputSchema = s.object(
  "An email object sent to Close.",
  {
    email: s.email("The email address to send to Close."),
    type: s.string("The Close email label."),
  },
  { optional: ["type"] },
);

const phoneInputSchema = s.object(
  "A phone object sent to Close.",
  {
    phone: id("The phone number to send to Close."),
    type: s.string("The Close phone label."),
  },
  { optional: ["type"] },
);

const urlInputSchema = s.object(
  "A URL object sent to Close.",
  {
    url: id("The URL to send to Close."),
    type: s.string("The Close URL label."),
  },
  { optional: ["type"] },
);

const addressInputSchema = s.object(
  "An address object sent to Close.",
  {
    label: s.string("The address label to send to Close."),
    address1: s.string("The first address line to send to Close."),
    address2: s.string("The second address line to send to Close."),
    city: s.string("The city to send to Close."),
    state: s.string("The state or region to send to Close."),
    zipcode: s.string("The postal code to send to Close."),
    country: s.string("The country code to send to Close."),
  },
  { optional: ["label", "address1", "address2", "city", "state", "zipcode", "country"] },
);

const nestedLeadContactInputSchema = s.object(
  "A nested contact object sent with create_lead.",
  {
    name: id("The nested contact name to send to Close."),
    title: s.string("The nested contact title to send to Close."),
    emails: s.array("Nested contact emails.", emailInputSchema, { minItems: 1 }),
    phones: s.array("Nested contact phones.", phoneInputSchema, { minItems: 1 }),
  },
  { optional: ["title", "emails", "phones"] },
);

const listInputBase = {
  limit: s.positiveInteger("Maximum number of Close records to return."),
  skip: s.nonNegativeInteger("Number of Close records to skip before this page."),
  includeFields: optionalFields,
};

const listLeadsInputSchema = s.object("The input payload for listing Close leads.", listInputBase, {
  optional: ["limit", "skip", "includeFields"],
});

const listLeadsOutputSchema = listOutput("The paginated Close lead list response.", "leads", leadSchema);

const getLeadInputSchema = s.object(
  "The input payload for fetching a Close lead.",
  {
    leadId: id("The Close lead ID."),
    includeFields: optionalFields,
  },
  { optional: ["includeFields"] },
);

const singleLeadOutputSchema = s.object("A single Close lead response.", {
  lead: leadSchema,
});

const createLeadInputSchema = s.object(
  "The input payload for creating a Close lead.",
  {
    name: id("The Close lead name."),
    description: s.string("The Close lead description."),
    statusId: s.string("The Close lead status ID."),
    url: s.string("The lead website URL."),
    addresses: s.array("Lead addresses.", addressInputSchema, { minItems: 1 }),
    contacts: s.array("Nested contacts created together with the lead.", nestedLeadContactInputSchema, { minItems: 1 }),
  },
  { optional: ["description", "statusId", "url", "addresses", "contacts"] },
);

const updateLeadInputSchema = withAnyOf(
  s.object(
    "The input payload for updating a Close lead.",
    {
      leadId: id("The Close lead ID."),
      name: s.string("The Close lead name."),
      description: s.string("The Close lead description."),
      statusId: s.string("The Close lead status ID."),
      url: s.string("The lead website URL."),
    },
    { optional: ["name", "description", "statusId", "url"] },
  ),
  [["name"], ["description"], ["statusId"], ["url"]],
);

const listContactsInputSchema = s.object(
  "The input payload for listing Close contacts.",
  {
    ...listInputBase,
    leadId: s.string("Only return contacts linked to this Close lead ID."),
  },
  { optional: ["limit", "skip", "leadId", "includeFields"] },
);

const listContactsOutputSchema = listOutput("The paginated Close contact list response.", "contacts", contactSchema);

const getContactInputSchema = s.object(
  "The input payload for fetching a Close contact.",
  {
    contactId: id("The Close contact ID."),
    includeFields: optionalFields,
  },
  { optional: ["includeFields"] },
);

const singleContactOutputSchema = s.object("A single Close contact response.", {
  contact: contactSchema,
});

const createContactInputSchema = s.object(
  "The input payload for creating a Close contact.",
  {
    leadId: id("The Close lead ID that owns the contact."),
    name: id("The Close contact name."),
    title: s.string("The Close contact title."),
    emails: s.array("Contact emails.", emailInputSchema, { minItems: 1 }),
    phones: s.array("Contact phones.", phoneInputSchema, { minItems: 1 }),
    urls: s.array("Contact URLs.", urlInputSchema, { minItems: 1 }),
  },
  { optional: ["title", "emails", "phones", "urls"] },
);

const updateContactInputSchema = withAnyOf(
  s.object(
    "The input payload for updating a Close contact.",
    {
      contactId: id("The Close contact ID."),
      name: s.string("The Close contact name."),
      title: s.string("The Close contact title."),
      emails: s.array("Contact emails.", emailInputSchema, { minItems: 1 }),
      phones: s.array("Contact phones.", phoneInputSchema, { minItems: 1 }),
      urls: s.array("Contact URLs.", urlInputSchema, { minItems: 1 }),
    },
    { optional: ["name", "title", "emails", "phones", "urls"] },
  ),
  [["name"], ["title"], ["emails"], ["phones"], ["urls"]],
);

const listTasksInputSchema = s.object(
  "The input payload for listing Close tasks.",
  {
    ...listInputBase,
    leadId: s.string("Only return tasks linked to this Close lead ID."),
    assignedTo: s.string("Only return tasks assigned to this Close user ID."),
    isComplete: s.boolean("Only return tasks with this completion state."),
    view: s.string("The Close task view filter such as inbox or archive."),
  },
  { optional: ["limit", "skip", "leadId", "assignedTo", "isComplete", "view", "includeFields"] },
);

const listTasksOutputSchema = listOutput("The paginated Close task list response.", "tasks", taskSchema);

const getTaskInputSchema = s.object(
  "The input payload for fetching a Close task.",
  {
    taskId: id("The Close task ID."),
    includeFields: optionalFields,
  },
  { optional: ["includeFields"] },
);

const singleTaskOutputSchema = s.object("A single Close task response.", {
  task: taskSchema,
});

const createTaskInputSchema = s.object(
  "The input payload for creating a Close task.",
  {
    leadId: id("The Close lead ID that owns the task."),
    text: id("The Close task text."),
    assignedTo: s.string("The Close user ID to assign the task to."),
    date: s.string("The task date to send to Close."),
    dueDate: s.string("The task due date to send to Close."),
    isComplete: s.boolean("Whether the task should start completed."),
    isDateless: s.boolean("Whether the task should be dateless."),
  },
  { optional: ["assignedTo", "date", "dueDate", "isComplete", "isDateless"] },
);

const updateTaskInputSchema = withAnyOf(
  s.object(
    "The input payload for updating a Close task.",
    {
      taskId: id("The Close task ID."),
      text: s.string("The Close task text."),
      assignedTo: s.string("The Close user ID to assign the task to."),
      date: s.string("The task date to send to Close."),
      dueDate: s.string("The task due date to send to Close."),
      isComplete: s.boolean("Whether the task is complete."),
      isDateless: s.boolean("Whether the task is dateless."),
    },
    { optional: ["text", "assignedTo", "date", "dueDate", "isComplete", "isDateless"] },
  ),
  [["text"], ["assignedTo"], ["date"], ["dueDate"], ["isComplete"], ["isDateless"]],
);

const listOpportunitiesInputSchema = s.object(
  "The input payload for listing Close opportunities.",
  {
    ...listInputBase,
    leadId: s.string("Only return opportunities linked to this Close lead ID."),
    userId: s.string("Only return opportunities owned by this Close user ID."),
    statusId: s.string("Only return opportunities in this Close status ID."),
    statusType: opportunityStatusType,
    valuePeriod: opportunityValuePeriod,
    isStalled: s.boolean("Only return opportunities with this stalled flag."),
    query: s.string("The Close search query applied to opportunities."),
    leadQuery: s.string("The Close lead search query applied before opportunity filtering."),
    orderBy: s.string("The Close _order_by value for sorting opportunities."),
  },
  {
    optional: [
      "limit",
      "skip",
      "leadId",
      "userId",
      "statusId",
      "statusType",
      "valuePeriod",
      "isStalled",
      "query",
      "leadQuery",
      "orderBy",
      "includeFields",
    ],
  },
);

const listOpportunitiesOutputSchema = listOutput(
  "The paginated Close opportunity list response.",
  "opportunities",
  opportunitySchema,
);

const getOpportunityInputSchema = s.object(
  "The input payload for fetching a Close opportunity.",
  {
    opportunityId: id("The Close opportunity ID."),
    includeFields: optionalFields,
  },
  { optional: ["includeFields"] },
);

const singleOpportunityOutputSchema = s.object("A single Close opportunity response.", {
  opportunity: opportunitySchema,
});

const createOpportunityInputSchema = s.object(
  "The input payload for creating a Close opportunity.",
  {
    leadId: id("The Close lead ID that owns the opportunity."),
    contactId: s.string("The Close contact ID linked to the opportunity."),
    userId: s.string("The Close user ID that owns the opportunity."),
    statusId: s.string("The Close opportunity status ID."),
    confidence: s.integer("The Close opportunity confidence percentage.", { minimum: 0, maximum: 100 }),
    note: s.string("The Close opportunity note."),
    value: s.integer("The Close opportunity value."),
    valuePeriod: opportunityValuePeriod,
    dateWon: s.string("The won date to send to Close."),
  },
  { optional: ["contactId", "userId", "statusId", "confidence", "note", "value", "valuePeriod", "dateWon"] },
);

const updateOpportunityInputSchema = withAnyOf(
  s.object(
    "The input payload for updating a Close opportunity.",
    {
      opportunityId: id("The Close opportunity ID."),
      contactId: s.string("The Close contact ID linked to the opportunity."),
      userId: s.string("The Close user ID that owns the opportunity."),
      statusId: s.string("The Close opportunity status ID."),
      confidence: s.integer("The Close opportunity confidence percentage.", { minimum: 0, maximum: 100 }),
      note: s.string("The Close opportunity note."),
      value: s.integer("The Close opportunity value."),
      valuePeriod: opportunityValuePeriod,
      dateWon: s.string("The won date to send to Close."),
    },
    { optional: ["contactId", "userId", "statusId", "confidence", "note", "value", "valuePeriod", "dateWon"] },
  ),
  [["contactId"], ["userId"], ["statusId"], ["confidence"], ["note"], ["value"], ["valuePeriod"], ["dateWon"]],
);

export const closeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_leads",
    description: "List Close leads with optional pagination and field selection.",
    inputSchema: listLeadsInputSchema,
    outputSchema: listLeadsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_lead",
    description: "Fetch a single Close lead by ID.",
    inputSchema: getLeadInputSchema,
    outputSchema: singleLeadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_lead",
    description: "Create a Close lead with optional nested contacts and addresses.",
    inputSchema: createLeadInputSchema,
    outputSchema: singleLeadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_lead",
    description: "Update writable fields on an existing Close lead.",
    inputSchema: updateLeadInputSchema,
    outputSchema: singleLeadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Close contacts with optional lead filtering and pagination.",
    inputSchema: listContactsInputSchema,
    outputSchema: listContactsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Fetch a single Close contact by ID.",
    inputSchema: getContactInputSchema,
    outputSchema: singleContactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a Close contact under a specific lead.",
    inputSchema: createContactInputSchema,
    outputSchema: singleContactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update writable fields on an existing Close contact.",
    inputSchema: updateContactInputSchema,
    outputSchema: singleContactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Close tasks with lead, assignee, completion, and view filters.",
    inputSchema: listTasksInputSchema,
    outputSchema: listTasksOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Fetch a single Close task by ID.",
    inputSchema: getTaskInputSchema,
    outputSchema: singleTaskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create a lead-scoped Close task.",
    inputSchema: createTaskInputSchema,
    outputSchema: singleTaskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update writable fields on an existing Close task.",
    inputSchema: updateTaskInputSchema,
    outputSchema: singleTaskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_opportunities",
    description: "List Close opportunities with stable workflow filters and pagination.",
    inputSchema: listOpportunitiesInputSchema,
    outputSchema: listOpportunitiesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_opportunity",
    description: "Fetch a single Close opportunity by ID.",
    inputSchema: getOpportunityInputSchema,
    outputSchema: singleOpportunityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_opportunity",
    description: "Create a Close opportunity for an existing lead.",
    inputSchema: createOpportunityInputSchema,
    outputSchema: singleOpportunityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_opportunity",
    description: "Update writable fields on an existing Close opportunity.",
    inputSchema: updateOpportunityInputSchema,
    outputSchema: singleOpportunityOutputSchema,
  }),
];

function listOutput(description: string, key: string, itemSchema: JsonSchema): JsonSchema {
  return s.object(description, {
    [key]: s.array(`The Close ${key} returned for the current page.`, itemSchema),
    hasMore: s.boolean({ description: "Whether Close has another page available.", default: false }),
  });
}

function withAnyOf(schema: JsonSchema, requiredSets: string[][]): JsonSchema {
  return {
    ...schema,
    anyOf: requiredSets.map((required) => ({ required })),
  };
}
