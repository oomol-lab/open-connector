import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "amplemarket";

const pageSizeField = s.integer("Number of records to return in the page.", {
  minimum: 1,
  maximum: 100,
});
const cursorField = s.nonEmptyString("Cursor value from an Amplemarket pagination link.");
const emptyInputSchema = s.object("This action does not require any input fields.", {});

const linkSchema = s.object("Amplemarket pagination or resource link.", {
  href: s.string("Relative URL for the related resource or page."),
});
const linksSchema = s.looseObject(
  {
    self: linkSchema,
    prev: linkSchema,
    next: linkSchema,
  },
  { description: "HAL-style links returned by Amplemarket." },
);
const accountDetailsSchema = s.object("Amplemarket account details.", {
  id: s.string("Amplemarket account ID."),
  name: s.string("Amplemarket account name."),
});
const phoneNumberSchema = s.looseObject(
  {
    object: s.string("Object type returned by Amplemarket."),
    id: s.string("Phone number ID."),
    number: s.string("Phone number value."),
    type: s.string("Phone number type."),
    source: s.string("Source of the phone number."),
    is_wrong_number: s.boolean("Whether the number is marked as wrong."),
    is_dnc_listed: s.boolean("Whether the number is on a DNC list when available."),
  },
  { description: "Phone number attached to an Amplemarket contact." },
);
const contactActivitySchema = s.looseObject(
  {
    event_at: s.string("Activity timestamp in ISO 8601 format."),
    event_type: s.string("Activity event type."),
    sequence_id: s.nullable(s.string("Related sequence ID when available.")),
    sequence_name: s.nullable(s.string("Related sequence name when available.")),
    sequence_type: s.nullable(s.string("Related sequence type when available.")),
    description: s.nullable(s.string("Activity description when available.")),
    notes: s.nullable(s.string("Activity notes when available.")),
  },
  { description: "Recent activity returned for an Amplemarket contact." },
);
const contactSchema = s.looseObject(
  {
    id: s.string("Amplemarket contact ID."),
    name: s.nullable(s.string("Full name of the contact.")),
    first_name: s.nullable(s.string("First name of the contact.")),
    last_name: s.nullable(s.string("Last name of the contact.")),
    email: s.nullable(s.string("Email address of the contact.")),
    linkedin_url: s.nullable(s.url("LinkedIn profile URL of the contact.")),
    title: s.nullable(s.string("Job title of the contact.")),
    location: s.nullable(s.string("Location of the contact.")),
    time_zone: s.nullable(s.string("Time zone of the contact.")),
    company_name: s.nullable(s.string("Company name of the contact.")),
    company_domain: s.nullable(s.string("Company domain of the contact.")),
    owner: s.nullable(s.string("Owner email or identifier for the contact.")),
    last_contacted_at: s.nullable(s.string("Last contacted timestamp in ISO 8601 format.")),
    phone_numbers: s.array("Phone numbers attached to the contact.", phoneNumberSchema),
    recent_activity: s.array("Recent activity for the contact.", contactActivitySchema),
  },
  { description: "Amplemarket contact record." },
);
const leadListSchema = s.looseObject(
  {
    id: s.string("Amplemarket lead list ID."),
    name: s.string("Lead list name."),
    status: s.string("Lead list status."),
    url: s.string("Dashboard URL for the lead list."),
    shared: s.boolean("Whether the lead list is shared."),
    visible: s.boolean("Whether the lead list is visible."),
    owner: s.string("Lead list owner email."),
    type: s.string("Lead list type."),
    created_at: s.string("Lead list creation timestamp in ISO 8601 format."),
    updated_at: s.string("Lead list update timestamp in ISO 8601 format."),
  },
  { description: "Amplemarket lead list record." },
);
const taskSchema = s.looseObject(
  {
    id: s.string("Amplemarket task ID."),
    type: s.string("Task type."),
    status: s.string("Task status."),
    due_at: s.nullable(s.string("Task due timestamp in ISO 8601 format.")),
    completed_at: s.nullable(s.string("Task completion timestamp when available.")),
    skipped_at: s.nullable(s.string("Task skipped timestamp when available.")),
    contact: contactSchema,
    lead: s.unknownObject("Lead or prospect object attached to the task."),
    sequence: s.unknownObject("Sequence object attached to the task."),
  },
  { description: "Amplemarket task record." },
);

const contactIdInputSchema = s.object("Path parameters for retrieving an Amplemarket contact.", {
  id: s.nonEmptyString("Amplemarket contact ID."),
});
const contactEmailInputSchema = s.object("Path parameters for retrieving an Amplemarket contact.", {
  email: s.email("Email address of the Amplemarket contact."),
});
const listContactsInputSchema = s.object("Query parameters for retrieving Amplemarket contacts by ID.", {
  ids: s.array("Amplemarket contact IDs to retrieve.", s.nonEmptyString("Amplemarket contact ID."), {
    minItems: 1,
  }),
});
const listLeadListsInputSchema = s.object(
  "Query parameters for listing Amplemarket lead lists.",
  {
    page_size: pageSizeField,
    page_after: cursorField,
    page_before: cursorField,
    status: s.nonEmptyString("Lead list status to filter by."),
    owner_id: s.nonEmptyString("Lead list owner ID to filter by."),
    owner_email: s.email("Lead list owner email to filter by."),
  },
  { optional: ["page_size", "page_after", "page_before", "status", "owner_id", "owner_email"] },
);
const leadListIdInputSchema = s.object("Path parameters for retrieving an Amplemarket lead list.", {
  id: s.nonEmptyString("Amplemarket lead list ID."),
});
const listTasksInputSchema = s.object(
  "Query parameters for listing Amplemarket tasks.",
  {
    page_size: pageSizeField,
    page_after: cursorField,
    page_before: cursorField,
    status: s.nonEmptyString("Task status to filter by."),
    type: s.nonEmptyString("Task type to filter by."),
    user_id: s.nonEmptyString("User ID to filter tasks by."),
    user_email: s.email("User email to filter tasks by."),
  },
  {
    optional: ["page_size", "page_after", "page_before", "status", "type", "user_id", "user_email"],
  },
);
const taskIdInputSchema = s.object("Path parameters for updating an Amplemarket task.", {
  id: s.nonEmptyString("Amplemarket task ID."),
});

export const amplemarketActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_details",
    description: "Get account details for the authenticated Amplemarket API key.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Amplemarket account details response.", {
      account: accountDetailsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Retrieve an Amplemarket contact by contact ID.",
    requiredScopes: [],
    inputSchema: contactIdInputSchema,
    outputSchema: contactOutputSchema(),
  }),
  defineProviderAction(service, {
    name: "get_contact_by_email",
    description: "Retrieve an Amplemarket contact by email address.",
    requiredScopes: [],
    inputSchema: contactEmailInputSchema,
    outputSchema: contactOutputSchema(),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "Retrieve Amplemarket contacts by one or more contact IDs.",
    requiredScopes: [],
    inputSchema: listContactsInputSchema,
    outputSchema: s.object("Amplemarket contacts response.", {
      contacts: s.array("Contacts returned by Amplemarket.", contactSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_lead_lists",
    description: "List Amplemarket lead lists with cursor pagination and owner filters.",
    requiredScopes: [],
    inputSchema: listLeadListsInputSchema,
    outputSchema: paginatedOutputSchema("Paginated Amplemarket lead lists response.", "lead_lists", leadListSchema),
  }),
  defineProviderAction(service, {
    name: "get_lead_list",
    description: "Retrieve an Amplemarket lead list by ID.",
    requiredScopes: [],
    inputSchema: leadListIdInputSchema,
    outputSchema: s.object("Amplemarket lead list response.", {
      lead_list: leadListSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Amplemarket tasks with cursor pagination and status, type, or user filters.",
    requiredScopes: [],
    inputSchema: listTasksInputSchema,
    outputSchema: paginatedOutputSchema("Paginated Amplemarket tasks response.", "tasks", taskSchema),
  }),
  defineProviderAction(service, {
    name: "complete_task",
    description: "Mark an Amplemarket task as completed.",
    requiredScopes: [],
    inputSchema: taskIdInputSchema,
    outputSchema: taskMutationOutputSchema(),
  }),
  defineProviderAction(service, {
    name: "skip_task",
    description: "Skip an Amplemarket task.",
    requiredScopes: [],
    inputSchema: taskIdInputSchema,
    outputSchema: taskMutationOutputSchema(),
  }),
  defineProviderAction(service, {
    name: "list_task_statuses",
    description: "List task statuses supported by Amplemarket.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Amplemarket task statuses response.", {
      statuses: s.array("Task statuses returned by Amplemarket.", s.string("Task status value.")),
    }),
  }),
  defineProviderAction(service, {
    name: "list_task_types",
    description: "List task types supported by Amplemarket.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Amplemarket task types response.", {
      types: s.array("Task types returned by Amplemarket.", s.string("Task type value.")),
    }),
  }),
];

function contactOutputSchema(): ActionDefinition["outputSchema"] {
  return s.object("Amplemarket contact response.", {
    contact: contactSchema,
  });
}

function paginatedOutputSchema(
  description: string,
  collectionKey: "lead_lists" | "tasks",
  itemSchema: ActionDefinition["outputSchema"],
): ActionDefinition["outputSchema"] {
  return s.object(description, {
    [collectionKey]: s.array(`Items returned in the ${collectionKey} page.`, itemSchema),
    _links: linksSchema,
    nextCursor: s.nullable(s.string("Cursor to pass as page_after for the next page.")),
    previousCursor: s.nullable(s.string("Cursor to pass as page_before for the previous page.")),
  });
}

function taskMutationOutputSchema(): ActionDefinition["outputSchema"] {
  return s.object("Amplemarket task mutation response.", {
    task: taskSchema,
  });
}
