import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "capsule_crm" as const;

const emptyInputSchema = s.object("This action does not require any input.", {});
const idInputSchema = (description: string) =>
  s.object("The input payload for reading one Capsule CRM record.", {
    id: s.positiveInteger(description),
  });
const deleteInputSchema = (description: string) =>
  s.object("The input payload for deleting one Capsule CRM record.", {
    id: s.positiveInteger(description),
  });
const pageField = s.positiveInteger("The page number of results to return.");
const perPageField = s.positiveInteger("The number of records to return per page.", { maximum: 100 });
const sinceField = s.dateTime("Only include records changed after this ISO 8601 timestamp.");
const embedField = (values: string[]) =>
  s.array(
    "Additional related resources to embed in the Capsule CRM response.",
    s.stringEnum("One related resource name to embed.", values),
  );
const qField = s.string("The search query.", { minLength: 1 });
const looseRecord = (description: string) => s.looseObject(description);
const looseRecordArray = (description: string, itemDescription: string) =>
  s.array(description, looseRecord(itemDescription));
const outputItem = (description: string) => looseRecord(description);
const itemOutputSchema = (description: string, propertyName: string) =>
  s.object(description, {
    [propertyName]: outputItem(`The Capsule CRM ${propertyName} payload.`),
  });
const listOutputSchema = (description: string, propertyName: string) =>
  s.object(description, {
    [propertyName]: looseRecordArray(
      `The Capsule CRM ${propertyName} returned by the API.`,
      "One Capsule CRM record from the API response.",
    ),
    pagination: s.looseObject("Pagination metadata from Capsule CRM response headers."),
  });
const deleteOutputSchema = s.object("The delete action result.", {
  deleted: s.boolean("Whether Capsule CRM accepted the delete request."),
});
const partyPayloadSchema = s.looseObject("The Capsule CRM party payload to send.");
const opportunityPayloadSchema = s.looseObject("The Capsule CRM opportunity payload to send.");
const taskPayloadSchema = s.looseObject("The Capsule CRM task payload to send.");

const listPartiesInputSchema = s.object(
  "The input payload for listing Capsule CRM parties.",
  {
    page: pageField,
    perPage: perPageField,
    since: sinceField,
    embed: embedField(["tags", "fields", "organisation", "missingImportantFields"]),
  },
  { optional: ["page", "perPage", "since", "embed"] },
);
const searchPartiesInputSchema = s.object(
  "The input payload for searching Capsule CRM parties.",
  {
    q: qField,
    page: pageField,
    perPage: perPageField,
    embed: embedField(["tags", "fields", "organisation", "missingImportantFields"]),
  },
  { optional: ["page", "perPage", "embed"] },
);
const partyWriteInputSchema = s.object("The input payload for writing a Capsule CRM party.", {
  party: partyPayloadSchema,
});
const partyUpdateInputSchema = s.object("The input payload for updating a Capsule CRM party.", {
  id: s.positiveInteger("The unique Capsule CRM party ID."),
  party: partyPayloadSchema,
});

const listOpportunitiesInputSchema = s.object(
  "The input payload for listing Capsule CRM opportunities.",
  {
    page: pageField,
    perPage: perPageField,
    since: sinceField,
    embed: embedField(["tags", "fields", "party", "milestone", "missingImportantFields"]),
  },
  { optional: ["page", "perPage", "since", "embed"] },
);
const searchOpportunitiesInputSchema = s.object(
  "The input payload for searching Capsule CRM opportunities.",
  {
    q: qField,
    page: pageField,
    perPage: perPageField,
    embed: embedField(["tags", "fields", "party", "milestone", "missingImportantFields"]),
  },
  { optional: ["page", "perPage", "embed"] },
);
const opportunityWriteInputSchema = s.object("The input payload for writing a Capsule CRM opportunity.", {
  opportunity: opportunityPayloadSchema,
});
const opportunityUpdateInputSchema = s.object("The input payload for updating a Capsule CRM opportunity.", {
  id: s.positiveInteger("The unique Capsule CRM opportunity ID."),
  opportunity: opportunityPayloadSchema,
});

const listTasksInputSchema = s.object(
  "The input payload for listing Capsule CRM tasks.",
  {
    page: pageField,
    perPage: perPageField,
    status: s.array(
      "Task statuses to include.",
      s.stringEnum("One Capsule CRM task status.", ["open", "completed", "pending"]),
    ),
    embed: embedField(["party", "opportunity", "kase", "owner", "nextTask"]),
  },
  { optional: ["page", "perPage", "status", "embed"] },
);
const taskWriteInputSchema = s.object("The input payload for writing a Capsule CRM task.", {
  task: taskPayloadSchema,
});
const taskUpdateInputSchema = s.object("The input payload for updating a Capsule CRM task.", {
  id: s.positiveInteger("The unique Capsule CRM task ID."),
  task: taskPayloadSchema,
});

const listPipelineMilestonesInputSchema = s.object(
  "The input payload for listing Capsule CRM pipeline milestones.",
  {
    pipelineId: s.positiveInteger("The unique Capsule CRM pipeline ID."),
    page: pageField,
    perPage: perPageField,
  },
  { optional: ["page", "perPage"] },
);
const listCategoriesInputSchema = s.object(
  "The input payload for listing Capsule CRM task categories.",
  {
    page: pageField,
    perPage: perPageField,
  },
  { optional: ["page", "perPage"] },
);
const listPipelinesInputSchema = s.object(
  "The input payload for listing Capsule CRM pipelines.",
  {
    page: pageField,
    perPage: perPageField,
    includeDeleted: s.boolean("Whether to include deleted or archived pipelines."),
  },
  { optional: ["page", "perPage", "includeDeleted"] },
);
const listUsersInputSchema = s.object(
  "The input payload for listing Capsule CRM users.",
  {
    embed: embedField(["party"]),
  },
  { optional: ["embed"] },
);
const getCurrentUserInputSchema = s.object(
  "The input payload for reading the current Capsule CRM user.",
  {
    embed: embedField(["party"]),
  },
  { optional: ["embed"] },
);
const listStagesInputSchema = s.object(
  "The input payload for listing Capsule CRM stages.",
  {
    boardId: s.positiveInteger("The unique Capsule CRM board ID used to list only board stages."),
    page: pageField,
    perPage: perPageField,
    status: s.stringEnum("The Capsule CRM stage status filter.", ["active", "archived", "all"]),
    includeOnDeletedBoard: s.boolean("Whether to include stages from archived boards."),
  },
  { optional: ["boardId", "page", "perPage", "status", "includeOnDeletedBoard"] },
);

export const capsuleCrmActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_parties",
    description: "List Capsule CRM parties with pagination, optional change filtering, and embeds.",
    requiredScopes: [],
    inputSchema: listPartiesInputSchema,
    outputSchema: listOutputSchema("The Capsule CRM parties list response.", "parties"),
  }),
  defineProviderAction(service, {
    name: "search_parties",
    description: "Search Capsule CRM parties by query text.",
    requiredScopes: [],
    inputSchema: searchPartiesInputSchema,
    outputSchema: listOutputSchema("The Capsule CRM parties search response.", "parties"),
  }),
  defineProviderAction(service, {
    name: "get_party",
    description: "Read one Capsule CRM party by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("The unique Capsule CRM party ID."),
    outputSchema: itemOutputSchema("The Capsule CRM party response.", "party"),
  }),
  defineProviderAction(service, {
    name: "create_party",
    description: "Create a Capsule CRM party.",
    requiredScopes: [],
    inputSchema: partyWriteInputSchema,
    outputSchema: itemOutputSchema("The created Capsule CRM party response.", "party"),
  }),
  defineProviderAction(service, {
    name: "update_party",
    description: "Update a Capsule CRM party.",
    requiredScopes: [],
    inputSchema: partyUpdateInputSchema,
    outputSchema: itemOutputSchema("The updated Capsule CRM party response.", "party"),
  }),
  defineProviderAction(service, {
    name: "delete_party",
    description: "Delete a Capsule CRM party.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("The unique Capsule CRM party ID."),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_opportunities",
    description: "List Capsule CRM opportunities with pagination, optional change filtering, and embeds.",
    requiredScopes: [],
    inputSchema: listOpportunitiesInputSchema,
    outputSchema: listOutputSchema("The Capsule CRM opportunities list response.", "opportunities"),
  }),
  defineProviderAction(service, {
    name: "search_opportunities",
    description: "Search Capsule CRM opportunities by query text.",
    requiredScopes: [],
    inputSchema: searchOpportunitiesInputSchema,
    outputSchema: listOutputSchema("The Capsule CRM opportunities search response.", "opportunities"),
  }),
  defineProviderAction(service, {
    name: "get_opportunity",
    description: "Read one Capsule CRM opportunity by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("The unique Capsule CRM opportunity ID."),
    outputSchema: itemOutputSchema("The Capsule CRM opportunity response.", "opportunity"),
  }),
  defineProviderAction(service, {
    name: "create_opportunity",
    description: "Create a Capsule CRM opportunity.",
    requiredScopes: [],
    inputSchema: opportunityWriteInputSchema,
    outputSchema: itemOutputSchema("The created Capsule CRM opportunity response.", "opportunity"),
  }),
  defineProviderAction(service, {
    name: "update_opportunity",
    description: "Update a Capsule CRM opportunity.",
    requiredScopes: [],
    inputSchema: opportunityUpdateInputSchema,
    outputSchema: itemOutputSchema("The updated Capsule CRM opportunity response.", "opportunity"),
  }),
  defineProviderAction(service, {
    name: "delete_opportunity",
    description: "Delete a Capsule CRM opportunity.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("The unique Capsule CRM opportunity ID."),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Capsule CRM tasks with pagination, status filtering, and embeds.",
    requiredScopes: [],
    inputSchema: listTasksInputSchema,
    outputSchema: listOutputSchema("The Capsule CRM tasks list response.", "tasks"),
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Read one Capsule CRM task by ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("The unique Capsule CRM task ID."),
    outputSchema: itemOutputSchema("The Capsule CRM task response.", "task"),
  }),
  defineProviderAction(service, {
    name: "create_task",
    description: "Create a Capsule CRM task.",
    requiredScopes: [],
    inputSchema: taskWriteInputSchema,
    outputSchema: itemOutputSchema("The created Capsule CRM task response.", "task"),
  }),
  defineProviderAction(service, {
    name: "update_task",
    description: "Update a Capsule CRM task.",
    requiredScopes: [],
    inputSchema: taskUpdateInputSchema,
    outputSchema: itemOutputSchema("The updated Capsule CRM task response.", "task"),
  }),
  defineProviderAction(service, {
    name: "delete_task",
    description: "Delete a Capsule CRM task.",
    requiredScopes: [],
    inputSchema: deleteInputSchema("The unique Capsule CRM task ID."),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Capsule CRM users.",
    requiredScopes: [],
    inputSchema: listUsersInputSchema,
    outputSchema: listOutputSchema("The Capsule CRM users list response.", "users"),
  }),
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Read the Capsule CRM user associated with the access token.",
    requiredScopes: [],
    inputSchema: getCurrentUserInputSchema,
    outputSchema: itemOutputSchema("The current Capsule CRM user response.", "user"),
  }),
  defineProviderAction(service, {
    name: "list_categories",
    description: "List Capsule CRM task categories.",
    requiredScopes: [],
    inputSchema: listCategoriesInputSchema,
    outputSchema: listOutputSchema("The Capsule CRM categories list response.", "categories"),
  }),
  defineProviderAction(service, {
    name: "list_countries",
    description: "List countries supported by Capsule CRM.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: listOutputSchema("The Capsule CRM countries list response.", "countries"),
  }),
  defineProviderAction(service, {
    name: "list_currencies",
    description: "List currencies supported by Capsule CRM.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: listOutputSchema("The Capsule CRM currencies list response.", "currencies"),
  }),
  defineProviderAction(service, {
    name: "list_pipelines",
    description: "List Capsule CRM sales pipelines.",
    requiredScopes: [],
    inputSchema: listPipelinesInputSchema,
    outputSchema: listOutputSchema("The Capsule CRM pipelines list response.", "pipelines"),
  }),
  defineProviderAction(service, {
    name: "list_pipeline_milestones",
    description: "List milestones for a Capsule CRM pipeline.",
    requiredScopes: [],
    inputSchema: listPipelineMilestonesInputSchema,
    outputSchema: listOutputSchema("The Capsule CRM milestones list response.", "milestones"),
  }),
  defineProviderAction(service, {
    name: "list_stages",
    description: "List stages for a Capsule CRM board.",
    requiredScopes: [],
    inputSchema: listStagesInputSchema,
    outputSchema: listOutputSchema("The Capsule CRM stages list response.", "stages"),
  }),
];
