import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "kommo";

const idSchema = s.positiveInteger("The Kommo numeric identifier.");
const pageSchema = s.positiveInteger("The 1-based Kommo result page to fetch.");
const limitSchema = s.positiveInteger("The number of Kommo records to fetch per request.", {
  maximum: 250,
});
const withSchema = s.nonEmptyString("Comma-separated Kommo with parameters to include.");
const querySchema = s.nonEmptyString("Search text forwarded to Kommo.");
const sortDirectionSchema = s.stringEnum("The Kommo sort direction.", ["asc", "desc"]);
const timestampSchema = s.nonNegativeInteger("A Unix timestamp in seconds.");
const idArraySchema = s.array("One or more Kommo numeric identifiers.", idSchema, { minItems: 1 });
const nameArraySchema = s.array("One or more Kommo names to filter by.", s.nonEmptyString("One Kommo name."), {
  minItems: 1,
});

const rawObjectSchema = s.looseObject("The raw object returned by Kommo.");
const rawLinksSchema = s.nullable(s.looseObject("HAL links returned by Kommo."));

const accountSchema = s.looseRequiredObject(
  "A Kommo account.",
  {
    raw: rawObjectSchema,
    id: s.nullable(s.integer("The Kommo account identifier.")),
    name: s.nullable(s.string("The Kommo account name.")),
    subdomain: s.nullable(s.string("The Kommo account subdomain.")),
    current_user_id: s.nullable(s.integer("The current Kommo user identifier.")),
    language: s.nullable(s.string("The account language.")),
    country: s.nullable(s.string("The account country.")),
    currency: s.nullable(s.string("The account currency code.")),
    currency_symbol: s.nullable(s.string("The account currency symbol.")),
  },
  {
    optional: ["id", "name", "subdomain", "current_user_id", "language", "country", "currency", "currency_symbol"],
  },
);

const leadSchema = s.looseRequiredObject(
  "A Kommo lead.",
  {
    raw: rawObjectSchema,
    id: s.nullable(s.integer("The Kommo lead identifier.")),
    name: s.nullable(s.string("The lead name.")),
    price: s.nullable(s.integer("The lead sale value.")),
    responsible_user_id: s.nullable(s.integer("The responsible Kommo user identifier.")),
    group_id: s.nullable(s.integer("The responsible user group identifier.")),
    status_id: s.nullable(s.integer("The lead stage identifier.")),
    pipeline_id: s.nullable(s.integer("The lead pipeline identifier.")),
    loss_reason_id: s.nullable(s.integer("The lead loss reason identifier.")),
    created_by: s.nullable(s.integer("The user identifier that created the lead.")),
    updated_by: s.nullable(s.integer("The user identifier that last updated the lead.")),
    created_at: s.nullable(s.integer("The lead creation Unix timestamp.")),
    updated_at: s.nullable(s.integer("The lead update Unix timestamp.")),
    closed_at: s.nullable(s.integer("The lead close Unix timestamp.")),
    closest_task_at: s.nullable(s.integer("The closest task Unix timestamp.")),
  },
  {
    optional: [
      "id",
      "name",
      "price",
      "responsible_user_id",
      "group_id",
      "status_id",
      "pipeline_id",
      "loss_reason_id",
      "created_by",
      "updated_by",
      "created_at",
      "updated_at",
      "closed_at",
      "closest_task_at",
    ],
  },
);

const contactSchema = s.looseRequiredObject(
  "A Kommo contact.",
  {
    raw: rawObjectSchema,
    id: s.nullable(s.integer("The Kommo contact identifier.")),
    name: s.nullable(s.string("The contact display name.")),
    first_name: s.nullable(s.string("The contact first name.")),
    last_name: s.nullable(s.string("The contact last name.")),
    responsible_user_id: s.nullable(s.integer("The responsible Kommo user identifier.")),
    group_id: s.nullable(s.integer("The responsible user group identifier.")),
    created_by: s.nullable(s.integer("The user identifier that created the contact.")),
    updated_by: s.nullable(s.integer("The user identifier that last updated the contact.")),
    created_at: s.nullable(s.integer("The contact creation Unix timestamp.")),
    updated_at: s.nullable(s.integer("The contact update Unix timestamp.")),
    closest_task_at: s.nullable(s.integer("The closest task Unix timestamp.")),
  },
  {
    optional: [
      "id",
      "name",
      "first_name",
      "last_name",
      "responsible_user_id",
      "group_id",
      "created_by",
      "updated_by",
      "created_at",
      "updated_at",
      "closest_task_at",
    ],
  },
);

const companySchema = s.looseRequiredObject(
  "A Kommo company.",
  {
    raw: rawObjectSchema,
    id: s.nullable(s.integer("The Kommo company identifier.")),
    name: s.nullable(s.string("The company name.")),
    responsible_user_id: s.nullable(s.integer("The responsible Kommo user identifier.")),
    group_id: s.nullable(s.integer("The responsible user group identifier.")),
    created_by: s.nullable(s.integer("The user identifier that created the company.")),
    updated_by: s.nullable(s.integer("The user identifier that last updated the company.")),
    created_at: s.nullable(s.integer("The company creation Unix timestamp.")),
    updated_at: s.nullable(s.integer("The company update Unix timestamp.")),
    closest_task_at: s.nullable(s.integer("The closest task Unix timestamp.")),
  },
  {
    optional: [
      "id",
      "name",
      "responsible_user_id",
      "group_id",
      "created_by",
      "updated_by",
      "created_at",
      "updated_at",
      "closest_task_at",
    ],
  },
);

const taskSchema = s.looseRequiredObject(
  "A Kommo task.",
  {
    raw: rawObjectSchema,
    id: s.nullable(s.integer("The Kommo task identifier.")),
    text: s.nullable(s.string("The task text.")),
    is_completed: s.nullable(s.boolean("Whether the task is completed.")),
    task_type_id: s.nullable(s.integer("The Kommo task type identifier.")),
    entity_id: s.nullable(s.integer("The linked entity identifier.")),
    entity_type: s.nullable(s.string("The linked entity type.")),
    responsible_user_id: s.nullable(s.integer("The responsible Kommo user identifier.")),
    created_by: s.nullable(s.integer("The user identifier that created the task.")),
    updated_by: s.nullable(s.integer("The user identifier that last updated the task.")),
    created_at: s.nullable(s.integer("The task creation Unix timestamp.")),
    updated_at: s.nullable(s.integer("The task update Unix timestamp.")),
    complete_till: s.nullable(s.integer("The task due Unix timestamp.")),
    result: s.nullable(s.looseObject("The task result object.")),
  },
  {
    optional: [
      "id",
      "text",
      "is_completed",
      "task_type_id",
      "entity_id",
      "entity_type",
      "responsible_user_id",
      "created_by",
      "updated_by",
      "created_at",
      "updated_at",
      "complete_till",
      "result",
    ],
  },
);

const userSchema = s.looseRequiredObject(
  "A Kommo user.",
  {
    raw: rawObjectSchema,
    id: s.nullable(s.integer("The Kommo user identifier.")),
    name: s.nullable(s.string("The user display name.")),
    email: s.nullable(s.string("The user email address.")),
    lang: s.nullable(s.string("The user language.")),
    is_active: s.nullable(s.boolean("Whether the user is active.")),
    is_admin: s.nullable(s.boolean("Whether the user is an administrator.")),
  },
  { optional: ["id", "name", "email", "lang", "is_active", "is_admin"] },
);

const pipelineSchema = s.looseRequiredObject(
  "A Kommo leads pipeline.",
  {
    raw: rawObjectSchema,
    id: s.nullable(s.integer("The Kommo pipeline identifier.")),
    name: s.nullable(s.string("The pipeline name.")),
    sort: s.nullable(s.integer("The pipeline sort order.")),
    is_main: s.nullable(s.boolean("Whether this is the main pipeline.")),
    is_unsorted_on: s.nullable(s.boolean("Whether unsorted leads are enabled.")),
    is_archive: s.nullable(s.boolean("Whether the pipeline is archived.")),
    statuses: s.nullable(s.array("Pipeline statuses returned by Kommo.", s.looseObject("One Kommo pipeline status."))),
  },
  { optional: ["id", "name", "sort", "is_main", "is_unsorted_on", "is_archive", "statuses"] },
);

const listMetadataOutputSchema = {
  page: s.nullable(s.integer("The current Kommo response page.")),
  pageCount: s.nullable(s.integer("The total number of Kommo response pages.")),
  totalItems: s.nullable(s.integer("The total number of Kommo items in the response.")),
  links: rawLinksSchema,
  raw: rawObjectSchema,
};

const baseListInputSchema = {
  page: pageSchema,
  limit: limitSchema,
  query: querySchema,
  with: withSchema,
  orderUpdatedAt: sortDirectionSchema,
  orderId: sortDirectionSchema,
  ids: idArraySchema,
  names: nameArraySchema,
  createdByIds: idArraySchema,
  updatedByIds: idArraySchema,
  responsibleUserIds: idArraySchema,
  updatedAtFrom: timestampSchema,
  updatedAtTo: timestampSchema,
  closestTaskAtFrom: timestampSchema,
  closestTaskAtTo: timestampSchema,
};

const baseListInputOptionalKeys = [
  "page",
  "limit",
  "query",
  "with",
  "orderUpdatedAt",
  "orderId",
  "ids",
  "names",
  "createdByIds",
  "updatedByIds",
  "responsibleUserIds",
  "updatedAtFrom",
  "updatedAtTo",
  "closestTaskAtFrom",
  "closestTaskAtTo",
];

const leadListInputSchema = s.object(
  "The input payload for listing Kommo leads.",
  {
    ...baseListInputSchema,
    orderCreatedAt: sortDirectionSchema,
    price: s.integer("The exact lead sale value to filter by."),
    createdAtFrom: timestampSchema,
    createdAtTo: timestampSchema,
    closedAtFrom: timestampSchema,
    closedAtTo: timestampSchema,
    pipelineIds: idArraySchema,
    statusPipelineId: idSchema,
    statusId: idSchema,
  },
  {
    optional: [
      ...baseListInputOptionalKeys,
      "orderCreatedAt",
      "price",
      "createdAtFrom",
      "createdAtTo",
      "closedAtFrom",
      "closedAtTo",
      "pipelineIds",
      "statusPipelineId",
      "statusId",
    ],
  },
);

const contactListInputSchema = s.object(
  "The input payload for listing Kommo contacts.",
  {
    ...baseListInputSchema,
  },
  { optional: baseListInputOptionalKeys },
);

const companyListInputSchema = s.object(
  "The input payload for listing Kommo companies.",
  {
    ...baseListInputSchema,
    createdAtFrom: timestampSchema,
    createdAtTo: timestampSchema,
  },
  { optional: [...baseListInputOptionalKeys, "createdAtFrom", "createdAtTo"] },
);

const taskListInputSchema = s.object(
  "The input payload for listing Kommo tasks.",
  {
    page: pageSchema,
    limit: limitSchema,
    responsibleUserIds: idArraySchema,
    isCompleted: s.boolean("Whether to filter completed tasks."),
    taskTypeIds: idArraySchema,
    entityType: s.stringEnum("The linked entity type to filter by.", ["leads", "contacts", "companies"]),
    entityIds: idArraySchema,
    ids: idArraySchema,
    updatedAt: timestampSchema,
    updatedAtFrom: timestampSchema,
    updatedAtTo: timestampSchema,
    orderCompleteTill: sortDirectionSchema,
    orderCreatedAt: sortDirectionSchema,
    orderId: sortDirectionSchema,
  },
  {
    optional: [
      "page",
      "limit",
      "responsibleUserIds",
      "isCompleted",
      "taskTypeIds",
      "entityType",
      "entityIds",
      "ids",
      "updatedAt",
      "updatedAtFrom",
      "updatedAtTo",
      "orderCompleteTill",
      "orderCreatedAt",
      "orderId",
    ],
  },
);

const usersListInputSchema = s.object(
  "The input payload for listing Kommo users.",
  {
    with: withSchema,
    page: pageSchema,
    limit: limitSchema,
  },
  { optional: ["with", "page", "limit"] },
);

const withInputSchema = s.object(
  "The input payload for reading Kommo data with optional includes.",
  {
    with: withSchema,
  },
  { optional: ["with"] },
);

const getByIdInputSchema = s.object(
  "The input payload for reading one Kommo record.",
  {
    id: idSchema,
    with: withSchema,
  },
  { optional: ["with"] },
);

const getByIdOnlyInputSchema = s.object("The input payload for reading one Kommo record by ID.", {
  id: idSchema,
});

export const kommoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Get Kommo account information for the connected account.",
    inputSchema: withInputSchema,
    outputSchema: s.object("The Kommo account response.", {
      account: accountSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_leads",
    description: "List leads from the connected Kommo account.",
    inputSchema: leadListInputSchema,
    outputSchema: s.object("The Kommo leads list response.", {
      leads: s.array("Kommo leads returned by the request.", leadSchema),
      ...listMetadataOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_lead",
    description: "Get one Kommo lead by ID.",
    inputSchema: getByIdInputSchema,
    outputSchema: s.object("The Kommo lead response.", {
      lead: leadSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    description: "List contacts from the connected Kommo account.",
    inputSchema: contactListInputSchema,
    outputSchema: s.object("The Kommo contacts list response.", {
      contacts: s.array("Kommo contacts returned by the request.", contactSchema),
      ...listMetadataOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_contact",
    description: "Get one Kommo contact by ID.",
    inputSchema: getByIdInputSchema,
    outputSchema: s.object("The Kommo contact response.", {
      contact: contactSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_companies",
    description: "List companies from the connected Kommo account.",
    inputSchema: companyListInputSchema,
    outputSchema: s.object("The Kommo companies list response.", {
      companies: s.array("Kommo companies returned by the request.", companySchema),
      ...listMetadataOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_company",
    description: "Get one Kommo company by ID.",
    inputSchema: getByIdInputSchema,
    outputSchema: s.object("The Kommo company response.", {
      company: companySchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List tasks from the connected Kommo account.",
    inputSchema: taskListInputSchema,
    outputSchema: s.object("The Kommo tasks list response.", {
      tasks: s.array("Kommo tasks returned by the request.", taskSchema),
      ...listMetadataOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Get one Kommo task by ID.",
    inputSchema: getByIdOnlyInputSchema,
    outputSchema: s.object("The Kommo task response.", {
      task: taskSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List users from the connected Kommo account.",
    inputSchema: usersListInputSchema,
    outputSchema: s.object("The Kommo users list response.", {
      users: s.array("Kommo users returned by the request.", userSchema),
      ...listMetadataOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get one Kommo user by ID.",
    inputSchema: getByIdInputSchema,
    outputSchema: s.object("The Kommo user response.", {
      user: userSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_pipelines",
    description: "List lead pipelines from the connected Kommo account.",
    inputSchema: s.object("The input payload for listing Kommo pipelines.", {}),
    outputSchema: s.object("The Kommo pipelines list response.", {
      pipelines: s.array("Kommo pipelines returned by the request.", pipelineSchema),
      ...listMetadataOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_pipeline",
    description: "Get one Kommo lead pipeline by ID.",
    inputSchema: getByIdOnlyInputSchema,
    outputSchema: s.object("The Kommo pipeline response.", {
      pipeline: pipelineSchema,
      raw: rawObjectSchema,
    }),
  }),
];
