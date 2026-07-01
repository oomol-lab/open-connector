import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "agiled";

const idSchema = s.integer("Agiled resource ID.", { exclusiveMinimum: 0 });

const addressSchema = s.looseObject(
  {
    type: s.nullableString("Address type."),
    country: s.nullableString("Address country."),
    state: s.nullableString("Address state."),
    city: s.nullableString("Address city."),
    postal_code: s.nullableString("Address postal code."),
    address1: s.nullableString("First address line."),
    address2: s.nullableString("Second address line."),
  },
  { description: "Agiled CRM address object." },
);

const customFieldSchema = s.looseObject(
  {
    key: s.string("Custom field key.", { minLength: 1 }),
    value: s.unknown("Custom field value."),
  },
  { description: "Agiled custom field key-value object." },
);

const contactSchema = s.looseObject(
  {
    id: s.nullable(s.integer("Agiled contact ID.")),
    first_name: s.nullableString("Contact first name."),
    last_name: s.nullableString("Contact last name."),
    email: s.nullableString("Contact email address."),
    phone: s.nullableString("Contact phone number."),
    job_title: s.nullableString("Contact job title."),
    role: s.nullableString("Contact role such as Client, Lead, or Prospect."),
    account_id: s.nullableString("Related Agiled account ID."),
    owner_id: s.nullable(s.integer("Sales agent or owner ID.")),
    source_id: s.nullable(s.integer("CRM source ID.")),
    status_id: s.nullable(s.integer("CRM status ID.")),
    created_at: s.nullableString("Contact creation timestamp."),
    updated_at: s.nullableString("Contact update timestamp."),
  },
  { description: "Agiled CRM contact object." },
);

const projectSchema = s.looseObject(
  {
    id: s.nullable(s.integer("Agiled project ID.")),
    project_name: s.nullableString("Project name."),
    project_summary: s.nullableString("Project summary."),
    start_date: s.nullableString("Project start date."),
    deadline: s.nullableString("Project deadline."),
    status: s.nullableString("Project status."),
    completion_percent: s.nullable(s.integer("Project completion percentage.")),
    project_budget: s.nullable(s.number("Project budget.")),
    client_id: s.nullable(s.integer("Related client ID.")),
    category_id: s.nullable(s.integer("Project category ID.")),
    created_at: s.nullableString("Project creation timestamp."),
    updated_at: s.nullableString("Project update timestamp."),
  },
  { description: "Agiled project object." },
);

const taskSchema = s.looseObject(
  {
    id: s.nullable(s.integer("Agiled task ID.")),
    heading: s.nullableString("Task heading."),
    description: s.nullableString("Task description."),
    start_date: s.nullableString("Task start date."),
    due_date: s.nullableString("Task due date."),
    user_id: s.nullable(s.integer("Assigned user ID.")),
    project_id: s.nullable(s.integer("Related project ID.")),
    category_id: s.nullable(s.integer("Task category ID.")),
    priority: s.nullableString("Task priority."),
    completed_on: s.nullableString("Task completion date."),
    milestone_id: s.nullable(s.integer("Milestone ID.")),
    billable: s.nullable(s.integer("Whether the task is billable, usually 1 or 0.")),
    created_at: s.nullableString("Task creation timestamp."),
    updated_at: s.nullableString("Task update timestamp."),
  },
  { description: "Agiled task object." },
);

const deleteOutputSchema = s.object("Agiled delete result.", {
  deleted: s.boolean("Whether Agiled accepted the delete request."),
});

const listContactsOutputSchema = s.object("Agiled contacts list response.", {
  contacts: s.array("Contacts returned by Agiled.", contactSchema),
  raw: s.unknown("Raw Agiled response payload."),
});

const contactOutputSchema = s.object("Agiled contact response.", {
  contact: contactSchema,
  raw: s.unknown("Raw Agiled response payload."),
});

const listProjectsOutputSchema = s.object("Agiled projects list response.", {
  projects: s.array("Projects returned by Agiled.", projectSchema),
  raw: s.unknown("Raw Agiled response payload."),
});

const projectOutputSchema = s.object("Agiled project response.", {
  project: projectSchema,
  raw: s.unknown("Raw Agiled response payload."),
});

const listTasksOutputSchema = s.object("Agiled tasks list response.", {
  tasks: s.array("Tasks returned by Agiled.", taskSchema),
  raw: s.unknown("Raw Agiled response payload."),
});

const taskOutputSchema = s.object("Agiled task response.", {
  task: taskSchema,
  raw: s.unknown("Raw Agiled response payload."),
});

const emptyInputSchema = s.object("No input is required for this Agiled action.", {});
const idInputSchema = s.object("Path parameters for an Agiled resource endpoint.", {
  id: idSchema,
});

const contactWriteInputSchema = s.object(
  "Request body for creating or updating an Agiled CRM contact.",
  {
    first_name: s.string("Contact first name.", { minLength: 1 }),
    last_name: s.string("Contact last name.", { minLength: 1 }),
    email: s.string("Contact email address.", { minLength: 1 }),
    role: s.string("Contact role, such as Client, Lead, or Prospect.", { minLength: 1 }),
    phone: s.string("Contact phone number.", { minLength: 1 }),
    job_title: s.string("Contact job title.", { minLength: 1 }),
    facebook: s.string("Contact Facebook profile URL.", { minLength: 1 }),
    linkedin: s.string("Contact LinkedIn profile URL.", { minLength: 1 }),
    twitter: s.string("Contact Twitter profile URL.", { minLength: 1 }),
    skype: s.string("Contact Skype username.", { minLength: 1 }),
    note: s.string("Contact note.", { minLength: 1 }),
    tags: s.string("Comma-separated contact tags.", { minLength: 1 }),
    account_id: s.string("Related Agiled account ID.", { minLength: 1 }),
    owner_id: s.integer("Sales agent or owner ID.", { exclusiveMinimum: 0 }),
    source_id: s.integer("CRM source ID.", { exclusiveMinimum: 0 }),
    status_id: s.integer("CRM status ID.", { exclusiveMinimum: 0 }),
    next_follow_up: s.string("Whether the contact needs a next follow-up.", { minLength: 1 }),
    last_contacted: s.string("Date the contact was last contacted.", { minLength: 1 }),
    addresses: s.array("Contact addresses.", addressSchema),
    custom_fields: s.array("Contact custom field values.", customFieldSchema),
  },
  {
    optional: [
      "last_name",
      "email",
      "role",
      "phone",
      "job_title",
      "facebook",
      "linkedin",
      "twitter",
      "skype",
      "note",
      "tags",
      "account_id",
      "owner_id",
      "source_id",
      "status_id",
      "next_follow_up",
      "last_contacted",
      "addresses",
      "custom_fields",
    ],
  },
);

const contactUpdateInputSchema = s.object(
  "Path parameters and request body for updating an Agiled CRM contact.",
  {
    id: idSchema,
    first_name: s.string("Contact first name.", { minLength: 1 }),
    last_name: s.string("Contact last name.", { minLength: 1 }),
    email: s.string("Contact email address.", { minLength: 1 }),
    role: s.string("Contact role, such as Client, Lead, or Prospect.", { minLength: 1 }),
    phone: s.string("Contact phone number.", { minLength: 1 }),
    job_title: s.string("Contact job title.", { minLength: 1 }),
    facebook: s.string("Contact Facebook profile URL.", { minLength: 1 }),
    linkedin: s.string("Contact LinkedIn profile URL.", { minLength: 1 }),
    twitter: s.string("Contact Twitter profile URL.", { minLength: 1 }),
    skype: s.string("Contact Skype username.", { minLength: 1 }),
    note: s.string("Contact note.", { minLength: 1 }),
    tags: s.string("Comma-separated contact tags.", { minLength: 1 }),
    account_id: s.string("Related Agiled account ID.", { minLength: 1 }),
    owner_id: s.integer("Sales agent or owner ID.", { exclusiveMinimum: 0 }),
    source_id: s.integer("CRM source ID.", { exclusiveMinimum: 0 }),
    status_id: s.integer("CRM status ID.", { exclusiveMinimum: 0 }),
    next_follow_up: s.string("Whether the contact needs a next follow-up.", { minLength: 1 }),
    last_contacted: s.string("Date the contact was last contacted.", { minLength: 1 }),
    addresses: s.array("Contact addresses.", addressSchema),
    custom_fields: s.array("Contact custom field values.", customFieldSchema),
  },
  {
    optional: [
      "last_name",
      "email",
      "role",
      "phone",
      "job_title",
      "facebook",
      "linkedin",
      "twitter",
      "skype",
      "note",
      "tags",
      "account_id",
      "owner_id",
      "source_id",
      "status_id",
      "next_follow_up",
      "last_contacted",
      "addresses",
      "custom_fields",
    ],
  },
);

const projectWriteFields = {
  project_name: s.string("Project name.", { minLength: 1 }),
  project_summary: s.string("Project summary.", { minLength: 1 }),
  start_date: s.string("Project start date using the company's configured date format.", {
    minLength: 1,
  }),
  deadline: s.string("Project deadline using the company's configured date format.", {
    minLength: 1,
  }),
  notes: s.string("Project notes.", { minLength: 1 }),
  category_id: s.integer("Project category ID.", { exclusiveMinimum: 0 }),
  feedback: s.string("Project feedback.", { minLength: 1 }),
  manual_time_log: s.integer("Whether manual time logging is enabled, usually 1 or 0."),
  client_view_task: s.integer("Whether the client can view tasks, usually 1 or 0."),
  allow_client_notification: s.integer("Whether client notifications are allowed, usually 1 or 0."),
  completion_percent: s.integer("Project completion percentage."),
  project_budget: s.number("Project budget."),
  currency_id: s.integer("Currency ID.", { exclusiveMinimum: 0 }),
  client_id: s.integer("Related client ID.", { exclusiveMinimum: 0 }),
  hours_allocated: s.integer("Hours allocated to the project."),
  status: s.string("Project status.", { minLength: 1 }),
};

const projectWriteOptionalFields = [
  "project_summary",
  "deadline",
  "notes",
  "category_id",
  "feedback",
  "manual_time_log",
  "client_view_task",
  "allow_client_notification",
  "completion_percent",
  "project_budget",
  "currency_id",
  "client_id",
  "hours_allocated",
];

const createProjectInputSchema = s.object("Request body for creating an Agiled project.", projectWriteFields, {
  optional: projectWriteOptionalFields,
});

const updateProjectInputSchema = s.object(
  "Path parameters and request body for updating an Agiled project.",
  {
    id: idSchema,
    ...projectWriteFields,
  },
  { optional: [...projectWriteOptionalFields, "status"] },
);

const taskWriteFields = {
  heading: s.string("Task heading.", { minLength: 1 }),
  description: s.string("Task description.", { minLength: 1 }),
  start_date: s.string("Task start date using the company's configured date format.", {
    minLength: 1,
  }),
  due_date: s.string("Task due date using the company's configured date format.", {
    minLength: 1,
  }),
  user_id: s.integer("Assigned user ID.", { exclusiveMinimum: 0 }),
  project_id: s.integer("Related project ID.", { exclusiveMinimum: 0 }),
  category_id: s.integer("Task category ID.", { exclusiveMinimum: 0 }),
  priority: s.string("Task priority.", { minLength: 1 }),
  completed_on: s.string("Task completion date using the company's configured date format.", {
    minLength: 1,
  }),
  milestone_id: s.integer("Milestone ID.", { exclusiveMinimum: 0 }),
  billable: s.integer("Whether the task is billable, usually 1 or 0."),
};

const taskWriteOptionalFields = [
  "description",
  "project_id",
  "category_id",
  "completed_on",
  "milestone_id",
  "billable",
];

const taskWriteInputSchema = s.object("Request body for creating an Agiled task.", taskWriteFields, {
  optional: taskWriteOptionalFields,
});

const taskUpdateInputSchema = s.object(
  "Path parameters and request body for updating an Agiled task.",
  {
    id: idSchema,
    ...taskWriteFields,
  },
  { optional: taskWriteOptionalFields },
);

export const agiledActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Agiled CRM contacts.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: listContactsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get one Agiled CRM contact by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create an Agiled CRM contact.",
    requiredScopes: [],
    inputSchema: contactWriteInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update an Agiled CRM contact.",
    requiredScopes: [],
    inputSchema: contactUpdateInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_contact",
    description: "Delete an Agiled CRM contact.",
    requiredScopes: [],
    inputSchema: idInputSchema,
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Agiled projects.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: listProjectsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get one Agiled project by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema,
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create an Agiled project.",
    requiredScopes: [],
    inputSchema: createProjectInputSchema,
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_project",
    description: "Update an Agiled project.",
    requiredScopes: [],
    inputSchema: updateProjectInputSchema,
    outputSchema: projectOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_project",
    description: "Delete an Agiled project.",
    requiredScopes: [],
    inputSchema: idInputSchema,
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Agiled tasks.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: listTasksOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Get one Agiled task by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema,
    outputSchema: taskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create an Agiled task.",
    requiredScopes: [],
    inputSchema: taskWriteInputSchema,
    outputSchema: taskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update an Agiled task.",
    requiredScopes: [],
    inputSchema: taskUpdateInputSchema,
    outputSchema: taskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_task",
    description: "Delete an Agiled task.",
    requiredScopes: [],
    inputSchema: idInputSchema,
    outputSchema: deleteOutputSchema,
  }),
];

export type AgiledActionName =
  | "list_contacts"
  | "get_contact"
  | "create_contact"
  | "update_contact"
  | "delete_contact"
  | "list_projects"
  | "get_project"
  | "create_project"
  | "update_project"
  | "delete_project"
  | "list_tasks"
  | "get_task"
  | "create_task"
  | "update_task"
  | "delete_task";
