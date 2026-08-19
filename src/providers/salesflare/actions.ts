import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "salesflare";

const trimmedString = (description: string, options: { minLength?: number; maxLength?: number } = {}) =>
  s.string(description, { minLength: options.minLength, maxLength: options.maxLength });
const idSchema = (description: string) => s.positiveInteger(description);
const nullableString = (description: string) => s.nullableString(description);
const customFieldsSchema = s.record(
  "Salesflare custom field values keyed by API field name.",
  s.unknown("A Salesflare custom field value."),
);
const rawPatchSchema = s.looseObject("Additional official Salesflare fields to merge into the request body.");
const itemSchema = s.looseObject("A Salesflare API object.");

const listQuerySchema = {
  search: trimmedString("Search text forwarded to Salesflare.", { minLength: 1 }),
  limit: s.integer("The number of Salesflare records to return.", { minimum: 1 }),
  offset: s.nonNegativeInteger("The zero-based Salesflare result offset."),
  order_by: s.array(
    "Salesflare sort instructions, such as name or creation_date desc.",
    trimmedString("One Salesflare sort instruction.", { minLength: 1 }),
    { minItems: 1 },
  ),
  custom: s.string("Salesflare custom filter expression."),
};

const accountBodyFields = {
  owner: idSchema("The ID of the user who owns the account."),
  name: trimmedString("The account name.", { minLength: 1 }),
  domain: trimmedString("The account domain.", { minLength: 1 }),
  picture: s.url("The account logo URL."),
  size: s.number("The account employee count."),
  website: s.url("The account website URL."),
  description: nullableString("The account description."),
  address: s.looseObject("The primary address of the account."),
  addresses: s.array("Addresses associated with the account.", s.looseObject("One Salesflare address.")),
  social_profiles: s.array(
    "Social profiles associated with the account.",
    s.looseObject("One Salesflare social profile."),
  ),
  phone_number: nullableString("The account phone number."),
  email: s.email("The account email address."),
  tags: s.array("Salesflare tag IDs or tag objects for the account.", s.unknown("One Salesflare tag value.")),
  custom: customFieldsSchema,
  raw: rawPatchSchema,
};

const contactBodyFields = {
  owner: idSchema("The ID of the user who owns the contact."),
  domain: trimmedString("The contact domain.", { minLength: 1 }),
  email: s.email("The contact email address."),
  prefix: trimmedString("The contact name prefix.", { minLength: 1 }),
  firstname: trimmedString("The contact first name.", { minLength: 1 }),
  middle: trimmedString("The contact middle name.", { minLength: 1 }),
  lastname: trimmedString("The contact last name.", { minLength: 1 }),
  suffix: trimmedString("The contact name suffix.", { minLength: 1 }),
  name: trimmedString("The full name of the contact.", { minLength: 1 }),
  picture: s.url("The contact profile picture URL."),
  birth_date: s.date("The contact birth date."),
  phone_number: nullableString("The contact phone number."),
  home_phone_number: nullableString("The contact home phone number."),
  work_phone_number: nullableString("The contact work phone number."),
  mobile_phone_number: nullableString("The contact mobile phone number."),
  description: nullableString("The contact description."),
  account: idSchema("The ID of the Salesflare account linked to the contact."),
  address: s.looseObject("The primary address of the contact."),
  social_profiles: s.array(
    "Social profiles associated with the contact.",
    s.looseObject("One Salesflare social profile."),
  ),
  position: s.looseObject("The contact position details."),
  tags: s.array("Salesflare tag IDs or tag objects for the contact.", s.unknown("One Salesflare tag value.")),
  custom: customFieldsSchema,
  raw: rawPatchSchema,
};

const opportunityBodyFields = {
  owner: idSchema("The ID of the user who owns the opportunity."),
  account: idSchema("The ID of the Salesflare account linked to the opportunity."),
  stage: idSchema("The Salesflare stage ID."),
  name: trimmedString("The opportunity name.", { minLength: 1 }),
  value: s.number("The opportunity value."),
  close_date: s.date("The expected opportunity close date."),
  probability: s.number("The opportunity probability."),
  description: nullableString("The opportunity description."),
  status: trimmedString("The Salesflare opportunity status.", { minLength: 1 }),
  tags: s.array("Salesflare tag IDs or tag objects for the opportunity.", s.unknown("One Salesflare tag value.")),
  custom: customFieldsSchema,
  raw: rawPatchSchema,
};

const taskBodyFields = {
  account: idSchema("The ID of the account linked to the task."),
  description: trimmedString("The task description.", { minLength: 1 }),
  reminder_date: s.date("The task due date."),
  assignees: s.array("User IDs assigned to the task.", idSchema("One Salesflare user ID."), { minItems: 1 }),
  completed: s.boolean("Whether the task is completed."),
  raw: rawPatchSchema,
};

const accountBodyFieldNames = Object.keys(accountBodyFields);
const contactBodyFieldNames = Object.keys(contactBodyFields);
const opportunityBodyFieldNames = Object.keys(opportunityBodyFields);
const taskBodyFieldNames = Object.keys(taskBodyFields);

const accountListInputSchema = s.object(
  "Query parameters for listing Salesflare accounts.",
  {
    ...listQuerySchema,
    details: s.boolean("Whether Salesflare should include detailed account data."),
    name: trimmedString("Filter accounts by name.", { minLength: 1 }),
    domain: s.array("Account domains to filter by.", trimmedString("One account domain.", { minLength: 1 }), {
      minItems: 1,
    }),
    hotness: s.integer("Salesflare hotness level: 1 room temp, 2 hot, or 3 on fire.", { minimum: 1, maximum: 3 }),
  },
  { optional: ["search", "limit", "offset", "order_by", "custom", "details", "name", "domain", "hotness"] },
);

const contactListInputSchema = s.object(
  "Query parameters for listing Salesflare contacts.",
  {
    ...listQuerySchema,
    id: idSchema("Filter contacts by Salesflare contact ID."),
    name: trimmedString("Filter contacts by name.", { minLength: 1 }),
    email: s.email("Filter contacts by email address."),
    phone_number: trimmedString("Filter contacts by phone number.", { minLength: 1 }),
    domain: trimmedString("Filter contacts by domain.", { minLength: 1 }),
    account: idSchema("Filter contacts by Salesflare account ID."),
    includeArchived: s.boolean("Whether archived contacts should be included."),
    type: trimmedString("Filter contacts by Salesflare contact type.", { minLength: 1 }),
  },
  {
    optional: [
      "search",
      "limit",
      "offset",
      "order_by",
      "custom",
      "id",
      "name",
      "email",
      "phone_number",
      "domain",
      "account",
      "includeArchived",
      "type",
    ],
  },
);

const opportunityListInputSchema = s.object(
  "Query parameters for listing Salesflare opportunities.",
  {
    ...listQuerySchema,
    id: idSchema("Filter opportunities by Salesflare opportunity ID."),
    name: trimmedString("Filter opportunities by name.", { minLength: 1 }),
    status: trimmedString("Filter opportunities by Salesflare status.", { minLength: 1 }),
    stage: idSchema("Filter opportunities by Salesflare stage ID."),
    owner: idSchema("Filter opportunities by owner user ID."),
    account: idSchema("Filter opportunities by account ID."),
    min_value: s.number("Minimum opportunity value."),
    max_value: s.number("Maximum opportunity value."),
    closed: s.boolean("Whether to return closed opportunities."),
    done: s.boolean("Whether to return done opportunities."),
    hotness: s.integer("Salesflare hotness level: 1 room temp, 2 hot, or 3 on fire.", { minimum: 1, maximum: 3 }),
    details: s.boolean("Whether Salesflare should include detailed opportunity data."),
  },
  {
    optional: [
      "search",
      "limit",
      "offset",
      "order_by",
      "custom",
      "id",
      "name",
      "status",
      "stage",
      "owner",
      "account",
      "min_value",
      "max_value",
      "closed",
      "done",
      "hotness",
      "details",
    ],
  },
);

const taskListInputSchema = s.object(
  "Query parameters for listing Salesflare tasks.",
  {
    ...listQuerySchema,
    id: idSchema("Filter tasks by Salesflare task ID."),
    assignees: s.array("User IDs assigned to the task.", idSchema("One Salesflare user ID."), { minItems: 1 }),
    type: trimmedString("Filter tasks by Salesflare task type.", { minLength: 1 }),
    account: idSchema("Filter tasks by account ID."),
  },
  { optional: ["search", "limit", "offset", "order_by", "custom", "id", "assignees", "type", "account"] },
);

const accountCreateInputSchema: JsonSchema = withAnyRequired(
  s.object("Input parameters for creating a Salesflare account.", accountBodyFields, {
    optional: accountBodyFieldNames,
  }),
  ["name", "domain", "website"],
);
const accountUpdateInputSchema: JsonSchema = withAnyRequired(
  s.object(
    "Input parameters for updating a Salesflare account.",
    { account_id: idSchema("The Salesflare account ID."), ...accountBodyFields },
    { optional: accountBodyFieldNames },
  ),
  accountBodyFieldNames,
);
const contactCreateInputSchema: JsonSchema = withAnyRequired(
  s.object("Input parameters for creating a Salesflare contact.", contactBodyFields, {
    optional: contactBodyFieldNames,
  }),
  ["email", "name"],
);
const contactUpdateInputSchema: JsonSchema = withAnyRequired(
  s.object(
    "Input parameters for updating a Salesflare contact.",
    { contact_id: idSchema("The Salesflare contact ID."), ...contactBodyFields },
    { optional: contactBodyFieldNames },
  ),
  contactBodyFieldNames,
);
const opportunityCreateInputSchema: JsonSchema = withAnyRequired(
  s.object("Input parameters for creating a Salesflare opportunity.", opportunityBodyFields, {
    optional: opportunityBodyFieldNames,
  }),
  ["account", "name"],
);
const opportunityUpdateInputSchema: JsonSchema = withAnyRequired(
  s.object(
    "Input parameters for updating a Salesflare opportunity.",
    { id: idSchema("The Salesflare opportunity ID."), ...opportunityBodyFields },
    { optional: opportunityBodyFieldNames },
  ),
  opportunityBodyFieldNames,
);
const taskCreateInputSchema: JsonSchema = withAnyRequired(
  s.object("Input parameters for creating a Salesflare task.", taskBodyFields, { optional: taskBodyFieldNames }),
  ["description"],
);
const taskUpdateInputSchema: JsonSchema = withAnyRequired(
  s.object(
    "Input parameters for updating a Salesflare task.",
    { id: idSchema("The Salesflare task ID."), ...taskBodyFields },
    { optional: taskBodyFieldNames },
  ),
  taskBodyFieldNames,
);

const getByIdInputSchema = (description: string, fieldDescription: string) =>
  s.object(description, { id: idSchema(fieldDescription) });

const userOutputSchema = s.object("The normalized Salesflare current user output.", { user: itemSchema });
const accountOutputSchema = s.object("The normalized Salesflare account output.", { account: itemSchema });
const accountsOutputSchema = s.object("The normalized Salesflare account list output.", {
  accounts: s.array("Salesflare accounts returned by the API.", itemSchema),
});
const contactOutputSchema = s.object("The normalized Salesflare contact output.", { contact: itemSchema });
const contactsOutputSchema = s.object("The normalized Salesflare contact list output.", {
  contacts: s.array("Salesflare contacts returned by the API.", itemSchema),
});
const opportunityOutputSchema = s.object("The normalized Salesflare opportunity output.", { opportunity: itemSchema });
const opportunitiesOutputSchema = s.object("The normalized Salesflare opportunity list output.", {
  opportunities: s.array("Salesflare opportunities returned by the API.", itemSchema),
});
const tasksOutputSchema = s.object("The normalized Salesflare task list output.", {
  tasks: s.array("Salesflare tasks returned by the API.", itemSchema),
});
const successOutputSchema = s.object("A Salesflare success response.", {
  success: s.boolean("Whether the Salesflare operation succeeded."),
});

export const salesflareActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Retrieve the current Salesflare API user.",
    inputSchema: s.object("No input is required to retrieve the current Salesflare user.", {}),
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List Salesflare accounts with optional search, pagination, and filters.",
    inputSchema: accountListInputSchema,
    outputSchema: accountsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_account",
    description: "Create a Salesflare account.",
    inputSchema: accountCreateInputSchema,
    outputSchema: accountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_account",
    description: "Retrieve one Salesflare account by ID.",
    inputSchema: getByIdInputSchema(
      "Input parameters for retrieving a Salesflare account.",
      "The Salesflare account ID.",
    ),
    outputSchema: accountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_account",
    description: "Update a Salesflare account by ID.",
    inputSchema: accountUpdateInputSchema,
    outputSchema: accountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List Salesflare contacts with optional search, pagination, and filters.",
    inputSchema: contactListInputSchema,
    outputSchema: contactsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_contact",
    description: "Create a Salesflare contact.",
    inputSchema: contactCreateInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Retrieve one Salesflare contact by ID.",
    inputSchema: getByIdInputSchema(
      "Input parameters for retrieving a Salesflare contact.",
      "The Salesflare contact ID.",
    ),
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_contact",
    description: "Update a Salesflare contact by ID.",
    inputSchema: contactUpdateInputSchema,
    outputSchema: contactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_opportunities",
    description: "List Salesflare opportunities with optional search, pagination, and filters.",
    inputSchema: opportunityListInputSchema,
    outputSchema: opportunitiesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_opportunity",
    description: "Retrieve one Salesflare opportunity by ID.",
    inputSchema: getByIdInputSchema(
      "Input parameters for retrieving a Salesflare opportunity.",
      "The Salesflare opportunity ID.",
    ),
    outputSchema: opportunityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_opportunity",
    description: "Create a Salesflare opportunity.",
    inputSchema: opportunityCreateInputSchema,
    outputSchema: opportunityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_opportunity",
    description: "Update a Salesflare opportunity by ID.",
    inputSchema: opportunityUpdateInputSchema,
    outputSchema: opportunityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Salesflare tasks with optional search, pagination, and filters.",
    inputSchema: taskListInputSchema,
    outputSchema: tasksOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create a Salesflare task.",
    inputSchema: taskCreateInputSchema,
    outputSchema: successOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update a Salesflare task by ID.",
    inputSchema: taskUpdateInputSchema,
    outputSchema: successOutputSchema,
  }),
];

function withAnyRequired(schema: JsonSchema, keys: string[]): JsonSchema {
  return {
    ...schema,
    anyOf: keys.map((key) => ({ required: [key] })),
  };
}
