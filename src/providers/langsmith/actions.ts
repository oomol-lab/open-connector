import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "langsmith";

const uuidSchema = s.uuid("The LangSmith UUID.");
const metadataSchema = s.looseObject("Provider-defined metadata forwarded to LangSmith.");
const looseJsonObjectSchema = s.looseObject("A JSON object forwarded to or returned by LangSmith.");
const dataTypeSchema = s.stringEnum("The LangSmith dataset data type.", ["kv", "llm", "chat"]);

const paginationInputSchema = {
  offset: s.nonNegativeInteger("The number of records to skip."),
  limit: s.integer("The maximum number of records to return.", { minimum: 1, maximum: 100 }),
};

const workspaceSchema = s.object("A LangSmith workspace visible to the API key.", {
  id: uuidSchema,
  organization_id: s.nullable(s.uuid("The organization ID that owns the workspace.")),
  display_name: s.string("The workspace display name."),
  is_personal: s.boolean("Whether this is a personal workspace."),
  is_deleted: s.boolean("Whether LangSmith marks the workspace as deleted."),
  tenant_handle: s.nullable(s.string("The workspace handle when returned.")),
  data_plane_url: s.nullable(s.string("The workspace data-plane URL when returned.")),
  raw: s.looseObject("The raw workspace object returned by LangSmith."),
});

const projectSchema = s.object("A LangSmith tracing project.", {
  id: uuidSchema,
  tenant_id: uuidSchema,
  name: s.nullable(s.string("The project name when returned.")),
  description: s.nullable(s.string("The project description when returned.")),
  start_time: s.nullable(s.string("The project start timestamp when returned.")),
  end_time: s.nullable(s.string("The project end timestamp when returned.")),
  run_count: s.nullable(s.integer("The number of runs in the project when returned.")),
  error_rate: s.nullable(s.number("The project error rate when returned.")),
  default_dataset_id: s.nullable(s.uuid("The default dataset ID when returned.")),
  reference_dataset_id: s.nullable(s.uuid("The reference dataset ID when returned.")),
  raw: s.looseObject("The raw project object returned by LangSmith."),
});

const datasetSchema = s.object("A LangSmith dataset.", {
  id: uuidSchema,
  tenant_id: uuidSchema,
  name: s.string("The dataset name."),
  description: s.nullable(s.string("The dataset description when returned.")),
  data_type: s.nullable(dataTypeSchema),
  created_at: s.nullable(s.string("The dataset creation timestamp when returned.")),
  modified_at: s.nullable(s.string("The dataset modification timestamp when returned.")),
  example_count: s.nullable(s.integer("The dataset example count when returned.")),
  session_count: s.nullable(s.integer("The dataset experiment session count when returned.")),
  metadata: s.nullable(metadataSchema),
  raw: s.looseObject("The raw dataset object returned by LangSmith."),
});

const splitSchema = s.anyOf("One or more LangSmith dataset splits.", [
  s.string("A single split name.", { minLength: 1 }),
  s.array("A list of split names.", s.string("A split name.", { minLength: 1 }), {
    minItems: 1,
  }),
]);

const exampleSchema = s.object("A LangSmith dataset example.", {
  id: uuidSchema,
  dataset_id: uuidSchema,
  name: s.nullable(s.string("The example name when returned.")),
  created_at: s.nullable(s.string("The example creation timestamp when returned.")),
  modified_at: s.nullable(s.string("The example modification timestamp when returned.")),
  inputs: s.looseObject("The example input values."),
  outputs: s.nullable(looseJsonObjectSchema),
  metadata: s.nullable(metadataSchema),
  raw: s.looseObject("The raw example object returned by LangSmith."),
});

export type LangSmithActionName =
  | "list_workspaces"
  | "list_projects"
  | "get_project"
  | "create_project"
  | "list_datasets"
  | "get_dataset"
  | "create_dataset"
  | "list_examples"
  | "get_example"
  | "create_example";

export const langSmithActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List LangSmith workspaces visible to the connected API key.",
    inputSchema: s.object(
      "Input parameters for listing LangSmith workspaces.",
      {
        include_deleted: s.boolean("Whether to include deleted workspaces in the response."),
        data_plane_id: uuidSchema,
      },
      { optional: ["include_deleted", "data_plane_id"] },
    ),
    outputSchema: s.object("The response returned when listing LangSmith workspaces.", {
      workspaces: s.array("The workspaces returned by LangSmith.", workspaceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List LangSmith tracing projects with optional name and pagination filters.",
    inputSchema: s.object(
      "Input parameters for listing LangSmith projects.",
      {
        name: s.nonEmptyString("A non-empty project name."),
        name_contains: s.nonEmptyString("A non-empty project name fragment."),
        include_stats: s.boolean("Whether LangSmith should include project statistics."),
        sort_by_desc: s.boolean("Whether LangSmith should sort descending."),
        ...paginationInputSchema,
      },
      { optional: ["name", "name_contains", "include_stats", "sort_by_desc", "offset", "limit"] },
    ),
    outputSchema: s.object("The response returned when listing LangSmith projects.", {
      projects: s.array("The projects returned by LangSmith.", projectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get a LangSmith tracing project by ID.",
    inputSchema: s.object(
      "Input parameters for getting a LangSmith project.",
      {
        projectId: uuidSchema,
        include_stats: s.boolean("Whether LangSmith should include project statistics."),
      },
      { optional: ["include_stats"] },
    ),
    outputSchema: s.object("The response returned when getting a LangSmith project.", {
      project: projectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_project",
    description: "Create a LangSmith tracing project.",
    inputSchema: s.object(
      "Input parameters for creating a LangSmith project.",
      {
        name: s.nonEmptyString("The project name."),
        description: s.string("The project description."),
        start_time: s.string("The project start timestamp."),
        end_time: s.string("The project end timestamp."),
        extra: looseJsonObjectSchema,
        default_dataset_id: uuidSchema,
        reference_dataset_id: uuidSchema,
        upsert: s.boolean("Whether LangSmith should upsert a project with the same name."),
      },
      {
        optional: [
          "description",
          "start_time",
          "end_time",
          "extra",
          "default_dataset_id",
          "reference_dataset_id",
          "upsert",
        ],
      },
    ),
    outputSchema: s.object("The response returned when creating a LangSmith project.", {
      project: projectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_datasets",
    description: "List LangSmith datasets with optional name, type, and pagination filters.",
    inputSchema: s.object(
      "Input parameters for listing LangSmith datasets.",
      {
        name: s.nonEmptyString("A non-empty dataset name."),
        name_contains: s.nonEmptyString("A non-empty dataset name fragment."),
        data_type: dataTypeSchema,
        ...paginationInputSchema,
      },
      { optional: ["name", "name_contains", "data_type", "offset", "limit"] },
    ),
    outputSchema: s.object("The response returned when listing LangSmith datasets.", {
      datasets: s.array("The datasets returned by LangSmith.", datasetSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_dataset",
    description: "Get a LangSmith dataset by ID.",
    inputSchema: s.object("Input parameters for getting a LangSmith dataset.", {
      datasetId: uuidSchema,
    }),
    outputSchema: s.object("The response returned when getting a LangSmith dataset.", {
      dataset: datasetSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_dataset",
    description: "Create a LangSmith dataset.",
    inputSchema: s.object(
      "Input parameters for creating a LangSmith dataset.",
      {
        name: s.nonEmptyString("The dataset name."),
        description: s.string("The dataset description."),
        data_type: dataTypeSchema,
        inputs_schema_definition: looseJsonObjectSchema,
        outputs_schema_definition: looseJsonObjectSchema,
        metadata: metadataSchema,
        externally_managed: s.boolean("Whether the dataset is externally managed."),
      },
      {
        optional: [
          "description",
          "data_type",
          "inputs_schema_definition",
          "outputs_schema_definition",
          "metadata",
          "externally_managed",
        ],
      },
    ),
    outputSchema: s.object("The response returned when creating a LangSmith dataset.", {
      dataset: datasetSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_examples",
    description: "List LangSmith dataset examples with optional dataset and text filters.",
    inputSchema: s.object(
      "Input parameters for listing LangSmith examples.",
      {
        datasetId: uuidSchema,
        full_text_contains: s.array(
          "Text fragments that LangSmith should search for.",
          s.string("A text fragment.", { minLength: 1 }),
          { minItems: 1 },
        ),
        as_of: s.string("The dataset version timestamp or latest."),
        ...paginationInputSchema,
      },
      { optional: ["datasetId", "full_text_contains", "as_of", "offset", "limit"] },
    ),
    outputSchema: s.object("The response returned when listing LangSmith examples.", {
      examples: s.array("The examples returned by LangSmith.", exampleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_example",
    description: "Get a LangSmith dataset example by ID.",
    inputSchema: s.object(
      "Input parameters for getting a LangSmith example.",
      {
        exampleId: uuidSchema,
        datasetId: uuidSchema,
        as_of: s.string("The dataset version timestamp or latest."),
      },
      { optional: ["datasetId", "as_of"] },
    ),
    outputSchema: s.object("The response returned when getting a LangSmith example.", {
      example: exampleSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_example",
    description: "Create a LangSmith dataset example with JSON inputs, outputs, and metadata.",
    inputSchema: s.object(
      "Input parameters for creating a LangSmith example.",
      {
        datasetId: uuidSchema,
        inputs: looseJsonObjectSchema,
        outputs: looseJsonObjectSchema,
        metadata: metadataSchema,
        split: splitSchema,
        id: uuidSchema,
        created_at: s.string("The example creation timestamp."),
      },
      { optional: ["inputs", "outputs", "metadata", "split", "id", "created_at"] },
    ),
    outputSchema: s.object("The response returned when creating a LangSmith example.", {
      example: exampleSchema,
    }),
  }),
];
