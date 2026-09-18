import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "livespace";

const emptyInputSchema = s.object("No input parameters are required.", {});

const idInputSchema = s.requiredObject("Input parameters for retrieving a Livespace object by ID.", {
  id: s.nonEmptyString("Livespace object ID."),
});

const listInputSchema = s.object(
  "Input parameters for listing Livespace objects with simple pagination.",
  {
    limit: s.positiveInteger("Maximum number of objects to return."),
    offset: s.nonNegativeInteger("Zero-based offset of the first object to return."),
  },
  { optional: ["limit", "offset"] },
);

const searchInputSchema = s.object(
  "Input parameters for searching Livespace objects.",
  {
    query: s.nonEmptyString("Search phrase to match against Livespace objects."),
    type: s.string("Livespace search type filter accepted by the Search module."),
    condition: s.string("Livespace search condition accepted by the Search module."),
    limit: s.positiveInteger("Maximum number of search results to return."),
    offset: s.nonNegativeInteger("Zero-based offset of the first search result to return."),
  },
  { optional: ["type", "condition", "limit", "offset"] },
);

const rawContactSchema = s.looseObject(
  "Raw Livespace contact payload accepted by Contact/addContact or Contact/editContact.",
);

const rawCompanySchema = s.looseObject(
  "Raw Livespace company payload accepted by Contact/addCompany or Contact/editCompany.",
);

const rawDealSchema = s.looseObject("Raw Livespace deal payload accepted by Deal/addDeal or Deal/editDeal.");

const rawTaskSchema = s.looseObject("Raw Livespace todo payload accepted by Todo/addTodo or Todo/editTodo.");

const createPersonInputSchema = s.requiredObject("Input parameters for creating a Livespace person.", {
  contact: rawContactSchema,
});

const updatePersonInputSchema = s.requiredObject("Input parameters for updating a Livespace person.", {
  id: s.nonEmptyString("Livespace person ID."),
  contact: rawContactSchema,
});

const createCompanyInputSchema = s.requiredObject("Input parameters for creating a Livespace company.", {
  company: rawCompanySchema,
});

const updateCompanyInputSchema = s.requiredObject("Input parameters for updating a Livespace company.", {
  id: s.nonEmptyString("Livespace company ID."),
  company: rawCompanySchema,
});

const listDealsInputSchema = s.object(
  "Input parameters for listing Livespace deals with optional API filters.",
  {
    filters: s.looseObject("Raw Livespace Deal/getAll filters."),
  },
  { optional: ["filters"] },
);

const createDealInputSchema = s.requiredObject("Input parameters for creating a Livespace deal.", {
  deal: rawDealSchema,
});

const updateDealInputSchema = s.requiredObject("Input parameters for updating a Livespace deal.", {
  id: s.nonEmptyString("Livespace deal ID."),
  deal: rawDealSchema,
});

const listTasksInputSchema = s.object(
  "Input parameters for listing Livespace todos with optional API filters.",
  {
    filters: s.looseObject("Raw Livespace Todo/getTodoObjects filters."),
  },
  { optional: ["filters"] },
);

const tasksForObjectInputSchema = s.requiredObject(
  "Input parameters for retrieving Livespace todos assigned to an object.",
  {
    type: s.nonEmptyString("Livespace object type, such as contact, company, or deal."),
    id: s.nonEmptyString("Livespace object ID."),
  },
);

const createTaskInputSchema = s.requiredObject("Input parameters for creating a Livespace todo.", {
  todo: rawTaskSchema,
});

const updateTaskInputSchema = s.requiredObject("Input parameters for updating a Livespace todo.", {
  id: s.nonEmptyString("Livespace todo ID."),
  todo: rawTaskSchema,
});

const deleteInputSchema = idInputSchema;

const responseOutputSchema = s.looseObject("Livespace API response envelope.", {
  status: s.boolean("Whether Livespace reported the request as successful."),
  result: s.integer("Livespace numeric result code."),
  data: s.unknown("Raw Livespace data payload."),
  error: s.unknown("Raw Livespace error payload."),
});

export const livespaceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Get information about the current Livespace API user.",
    inputSchema: emptyInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List Livespace users visible to the API credential.",
    inputSchema: emptyInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_person",
    operationType: "read",
    description: "Get a Livespace person by ID.",
    inputSchema: idInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_people",
    operationType: "read",
    description: "List Livespace people with simple pagination.",
    inputSchema: listInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_people",
    operationType: "read",
    description: "Search Livespace people.",
    inputSchema: searchInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_person",
    operationType: "write",
    description: "Create a Livespace person.",
    inputSchema: createPersonInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_person",
    operationType: "write",
    description: "Update a Livespace person.",
    inputSchema: updatePersonInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_person",
    operationType: "destructive",
    description: "Delete a Livespace person.",
    inputSchema: deleteInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_company",
    operationType: "read",
    description: "Get a Livespace company by ID.",
    inputSchema: idInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_companies",
    operationType: "read",
    description: "List Livespace companies with simple pagination.",
    inputSchema: listInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_companies",
    operationType: "read",
    description: "Search Livespace companies.",
    inputSchema: searchInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_company",
    operationType: "write",
    description: "Create a Livespace company.",
    inputSchema: createCompanyInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_company",
    operationType: "write",
    description: "Update a Livespace company.",
    inputSchema: updateCompanyInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_company",
    operationType: "destructive",
    description: "Delete a Livespace company.",
    inputSchema: deleteInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_deal",
    operationType: "read",
    description: "Get a Livespace deal by ID.",
    inputSchema: idInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_deals",
    operationType: "read",
    description: "List Livespace deals using optional Livespace filters.",
    inputSchema: listDealsInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_deals",
    operationType: "read",
    description: "Search Livespace deals.",
    inputSchema: searchInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_deal",
    operationType: "write",
    description: "Create a Livespace deal.",
    inputSchema: createDealInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_deal",
    operationType: "write",
    description: "Update a Livespace deal.",
    inputSchema: updateDealInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_deal",
    operationType: "destructive",
    description: "Delete a Livespace deal.",
    inputSchema: deleteInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_task",
    operationType: "read",
    description: "Get a Livespace todo by ID.",
    inputSchema: idInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    operationType: "read",
    description: "List Livespace todos using optional Livespace filters.",
    inputSchema: listTasksInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_tasks_for_object",
    operationType: "read",
    description: "List Livespace todos assigned to an object.",
    inputSchema: tasksForObjectInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_task",
    operationType: "write",
    description: "Create a Livespace todo.",
    inputSchema: createTaskInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_task",
    operationType: "write",
    description: "Update a Livespace todo.",
    inputSchema: updateTaskInputSchema,
    outputSchema: responseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_task",
    operationType: "destructive",
    description: "Delete a Livespace todo.",
    inputSchema: deleteInputSchema,
    outputSchema: responseOutputSchema,
  }),
];
