import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  googleBigQueryExtractJobScopes,
  googleBigQueryInsertDataScopes,
  googleBigQueryLoadJobScopes,
  googleBigQueryReadScopes,
  googleBigQueryWriteScopes,
} from "./scopes.ts";

const service = "google_bigquery";

interface BigQueryActionSource {
  name: GoogleBigQueryActionName;
  readonly operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const rawObject = s.record(true, { description: "The raw BigQuery object returned by the API." });
const rawValue = s.unknown("A raw BigQuery value.");
const projectId = s.string({
  minLength: 1,
  description: "The Google Cloud project ID that owns the BigQuery resource.",
});
const datasetId = s.string({ minLength: 1, description: "The BigQuery dataset ID." });
const tableId = s.string({ minLength: 1, description: "The BigQuery table ID." });
const jobId = s.string({ minLength: 1, description: "The BigQuery job ID." });
const location = s.string({ minLength: 1, description: "The BigQuery job location, such as US or europe-west1." });
const pageToken = s.string({
  minLength: 1,
  description: "The opaque page token returned by a previous BigQuery response.",
});
const maxResults = s.integer({ minimum: 1, description: "The maximum number of results to return." });
const selectedFields = s.string({
  minLength: 1,
  description: "A subset of fields to return, formatted as a comma-separated list.",
});
const labels = s.record(s.string({ description: "A BigQuery label value." }), {
  description: "A BigQuery labels map.",
});
const tableReference = s.object(
  {
    projectId,
    datasetId,
    tableId,
  },
  { required: ["projectId", "datasetId", "tableId"], description: "A BigQuery table reference." },
);
const normalizedSchema = s.object(
  {
    fields: s.array(rawObject, { description: "The fields in the BigQuery table schema." }),
    raw: rawObject,
  },
  { required: ["fields", "raw"], additionalProperties: true, description: "A normalized BigQuery table schema." },
);
const normalizedRow = s.object(
  {
    values: s.array(rawValue, { description: "The row values in schema order." }),
    raw: rawObject,
  },
  { required: ["values", "raw"], additionalProperties: true, description: "A normalized BigQuery row." },
);
const deleteOutput = output({
  success: s.boolean({ description: "Whether BigQuery accepted the delete request." }),
  raw: rawObject,
});

const actions: BigQueryActionSource[] = [
  read(
    "list_projects",
    "List Google Cloud projects accessible to BigQuery.",
    input({
      maxResults,
      pageToken,
    }),
    output({ projects: s.array(rawObject), nextPageToken: s.nullable(s.string()), raw: rawObject }),
  ),
  read(
    "list_datasets",
    "List BigQuery datasets in a Google Cloud project.",
    input(
      {
        projectId,
        all: s.boolean({ description: "Whether to list all datasets, including hidden datasets." }),
        filter: s.string({ minLength: 1, description: "An expression for filtering datasets by label." }),
        maxResults,
        pageToken,
      },
      ["projectId"],
    ),
    output({ datasets: s.array(rawObject), nextPageToken: s.nullable(s.string()), raw: rawObject }),
  ),
  read(
    "get_dataset",
    "Retrieve BigQuery dataset metadata.",
    input({ projectId, datasetId, selectedFields }, ["projectId", "datasetId"]),
    output({ dataset: rawObject }),
  ),
  read(
    "list_tables",
    "List BigQuery tables in a dataset.",
    input({ projectId, datasetId, maxResults, pageToken }, ["projectId", "datasetId"]),
    output({ tables: s.array(rawObject), nextPageToken: s.nullable(s.string()), raw: rawObject }),
  ),
  read(
    "get_table",
    "Retrieve BigQuery table metadata, including schema when available.",
    input({ projectId, datasetId, tableId, selectedFields }, ["projectId", "datasetId", "tableId"]),
    output({ table: rawObject }),
  ),
  read(
    "list_table_data",
    "List rows from a BigQuery table.",
    input(
      {
        projectId,
        datasetId,
        tableId,
        maxResults,
        pageToken,
        startIndex: s.string({ minLength: 1, description: "The zero-based row offset to start reading from." }),
        selectedFields,
      },
      ["projectId", "datasetId", "tableId"],
    ),
    output({
      rows: s.array(normalizedRow),
      schema: s.nullable(normalizedSchema),
      totalRows: s.nullable(s.string()),
      pageToken: s.nullable(s.string()),
      raw: rawObject,
    }),
  ),
  read(
    "query",
    "Run a BigQuery SQL query synchronously.",
    input(
      {
        projectId,
        query: s.string({ minLength: 1, description: "The GoogleSQL query text to execute." }),
        location,
        maxResults,
        dryRun: s.boolean({ description: "Whether BigQuery should validate the query without running it." }),
        useLegacySql: s.boolean({ description: "Whether to use legacy SQL instead of GoogleSQL." }),
        timeoutMs: s.integer({
          minimum: 1,
          description: "How long BigQuery should wait for the query to complete, in milliseconds.",
        }),
        parameterMode: s.stringEnum(["NAMED", "POSITIONAL"], { description: "The BigQuery parameter mode." }),
        queryParameters: s.array(rawObject, {
          minItems: 1,
          description: "The query parameters for parameterized SQL.",
        }),
      },
      ["projectId", "query"],
    ),
    output({
      jobComplete: s.boolean(),
      jobReference: s.nullable(rawObject),
      rows: s.array(normalizedRow),
      schema: s.nullable(normalizedSchema),
      totalRows: s.nullable(s.string()),
      totalBytesProcessed: s.nullable(s.string()),
      cacheHit: s.nullable(s.boolean()),
      pageToken: s.nullable(s.string()),
      raw: rawObject,
    }),
  ),
  read(
    "get_query_results",
    "Poll BigQuery query job results.",
    input(
      {
        projectId,
        jobId,
        location,
        maxResults,
        pageToken,
        startIndex: s.string({ minLength: 1, description: "The zero-based row offset to start reading from." }),
        timeoutMs: s.integer({ minimum: 1 }),
      },
      ["projectId", "jobId"],
    ),
    output({
      jobComplete: s.boolean(),
      jobReference: s.nullable(rawObject),
      rows: s.array(normalizedRow),
      schema: s.nullable(normalizedSchema),
      totalRows: s.nullable(s.string()),
      totalBytesProcessed: s.nullable(s.string()),
      cacheHit: s.nullable(s.boolean()),
      pageToken: s.nullable(s.string()),
      raw: rawObject,
    }),
  ),
  read(
    "get_job",
    "Retrieve BigQuery job metadata.",
    input({ projectId, jobId, location }, ["projectId", "jobId"]),
    output({ job: rawObject }),
  ),
  read(
    "list_jobs",
    "List BigQuery jobs in a project.",
    input(
      {
        projectId,
        allUsers: s.boolean({ description: "Whether to list jobs owned by all users in the project." }),
        maxResults,
        pageToken,
        projection: s.stringEnum(["MINIMAL", "FULL"], { description: "The amount of job information to return." }),
        stateFilter: s.array(s.stringEnum(["DONE", "PENDING", "RUNNING"]), {
          minItems: 1,
          description: "The BigQuery job states to include.",
        }),
        minCreationTime: s.string({
          minLength: 1,
          description: "The minimum job creation time in milliseconds since epoch.",
        }),
        maxCreationTime: s.string({
          minLength: 1,
          description: "The maximum job creation time in milliseconds since epoch.",
        }),
      },
      ["projectId"],
    ),
    output({ jobs: s.array(rawObject), nextPageToken: s.nullable(s.string()), raw: rawObject }),
  ),
  destructive(
    "cancel_job",
    "Cancel a BigQuery job.",
    input({ projectId, jobId, location }, ["projectId", "jobId"]),
    output({ job: rawObject }),
  ),
  write(
    "start_query_job",
    "Start an asynchronous BigQuery query job.",
    input(
      {
        projectId,
        query: s.string({ minLength: 1, description: "The GoogleSQL query text to execute." }),
        location,
        jobId: s.string({ minLength: 1, description: "The optional client-provided BigQuery job ID." }),
        dryRun: s.boolean({ description: "Whether BigQuery should validate the query without running it." }),
        useLegacySql: s.boolean({ description: "Whether to use legacy SQL instead of GoogleSQL." }),
        destinationTable: rawObject,
        defaultDataset: rawObject,
        writeDisposition: s.string({ minLength: 1 }),
        createDisposition: s.string({ minLength: 1 }),
        priority: s.string({ minLength: 1 }),
        maximumBytesBilled: s.string({ minLength: 1 }),
        parameterMode: s.stringEnum(["NAMED", "POSITIONAL"]),
        queryParameters: s.array(rawObject, { minItems: 1 }),
        labels,
      },
      ["projectId", "query"],
    ),
    output({ job: rawObject }),
  ),
  loadJob(
    "start_load_job_from_gcs",
    "Start a BigQuery load job from Cloud Storage.",
    input(
      {
        projectId,
        sourceUris: s.array(s.string({ minLength: 1, description: "A Cloud Storage URI to load into BigQuery." }), {
          minItems: 1,
        }),
        destinationTable: tableReference,
        location,
        jobId,
        sourceFormat: s.string({ minLength: 1 }),
        schema: rawObject,
        writeDisposition: s.string({ minLength: 1 }),
        createDisposition: s.string({ minLength: 1 }),
        skipLeadingRows: s.integer({ minimum: 0 }),
        fieldDelimiter: s.string({ minLength: 1 }),
        allowQuotedNewlines: s.boolean(),
        allowJaggedRows: s.boolean(),
        ignoreUnknownValues: s.boolean(),
        maxBadRecords: s.integer({ minimum: 0 }),
        autodetect: s.boolean(),
        nullMarker: s.string({ minLength: 1 }),
        encoding: s.string({ minLength: 1 }),
        timePartitioning: rawObject,
        rangePartitioning: rawObject,
        clustering: rawObject,
        labels,
      },
      ["projectId", "sourceUris", "destinationTable"],
    ),
    output({ job: rawObject }),
  ),
  extractJob(
    "start_extract_job_to_gcs",
    "Start a BigQuery extract job to Cloud Storage.",
    input(
      {
        projectId,
        sourceTable: tableReference,
        destinationUris: s.array(s.string({ minLength: 1, description: "A Cloud Storage destination URI." }), {
          minItems: 1,
        }),
        location,
        jobId,
        destinationFormat: s.string({ minLength: 1 }),
        compression: s.string({ minLength: 1 }),
        fieldDelimiter: s.string({ minLength: 1 }),
        printHeader: s.boolean(),
        useAvroLogicalTypes: s.boolean(),
        labels,
      },
      ["projectId", "sourceTable", "destinationUris"],
    ),
    output({ job: rawObject }),
  ),
  write(
    "create_dataset",
    "Create a BigQuery dataset.",
    datasetInput(["projectId", "datasetId"]),
    output({ dataset: rawObject }),
  ),
  write(
    "patch_dataset",
    "Patch BigQuery dataset metadata.",
    datasetInput(["projectId", "datasetId"]),
    output({ dataset: rawObject }),
  ),
  destructive(
    "update_dataset",
    "Replace BigQuery dataset metadata.",
    datasetInput(["projectId", "datasetId"]),
    output({ dataset: rawObject }),
  ),
  destructive(
    "delete_dataset",
    "Delete a BigQuery dataset.",
    input(
      {
        projectId,
        datasetId,
        deleteContents: s.boolean({ description: "Whether to delete all tables in the dataset." }),
      },
      ["projectId", "datasetId"],
    ),
    deleteOutput,
  ),
  write(
    "create_table",
    "Create a BigQuery table.",
    tableInput(["projectId", "datasetId", "tableId"]),
    output({ table: rawObject }),
  ),
  write(
    "patch_table",
    "Patch BigQuery table metadata.",
    tableInput(["projectId", "datasetId", "tableId"]),
    output({ table: rawObject }),
  ),
  destructive(
    "update_table",
    "Replace BigQuery table metadata.",
    tableInput(["projectId", "datasetId", "tableId"]),
    output({ table: rawObject }),
  ),
  destructive(
    "delete_table",
    "Delete a BigQuery table.",
    input({ projectId, datasetId, tableId }, ["projectId", "datasetId", "tableId"]),
    deleteOutput,
  ),
  insertData(
    "insert_all",
    "Insert a small batch of rows into a BigQuery table.",
    input(
      {
        projectId,
        datasetId,
        tableId,
        rows: s.array(
          s.object(
            { insertId: s.string({ minLength: 1 }), json: rawObject },
            { required: ["json"], additionalProperties: true },
          ),
          { minItems: 1 },
        ),
        skipInvalidRows: s.boolean(),
        ignoreUnknownValues: s.boolean(),
        templateSuffix: s.string({ minLength: 1 }),
      },
      ["projectId", "datasetId", "tableId", "rows"],
    ),
    output({ insertErrors: s.array(rawObject), raw: rawObject }),
  ),
  read(
    "list_routines",
    "List BigQuery routines in a dataset.",
    input({ projectId, datasetId, maxResults, pageToken, readMask: selectedFields }, ["projectId", "datasetId"]),
    output({ routines: s.array(rawObject), nextPageToken: s.nullable(s.string()), raw: rawObject }),
  ),
  read(
    "get_routine",
    "Retrieve a BigQuery routine.",
    input({ projectId, datasetId, routineId: s.string({ minLength: 1 }), readMask: selectedFields }, [
      "projectId",
      "datasetId",
      "routineId",
    ]),
    output({ routine: rawObject }),
  ),
  write(
    "create_routine",
    "Create a BigQuery routine.",
    routineInput(["projectId", "datasetId", "routineId", "routineType", "definitionBody"]),
    output({ routine: rawObject }),
  ),
  destructive(
    "update_routine",
    "Replace BigQuery routine metadata.",
    routineInput(["projectId", "datasetId", "routineId", "routineType", "definitionBody"]),
    output({ routine: rawObject }),
  ),
  destructive(
    "delete_routine",
    "Delete a BigQuery routine.",
    input({ projectId, datasetId, routineId: s.string({ minLength: 1 }) }, ["projectId", "datasetId", "routineId"]),
    deleteOutput,
  ),
  read(
    "list_models",
    "List BigQuery models in a dataset.",
    input({ projectId, datasetId, maxResults, pageToken }, ["projectId", "datasetId"]),
    output({ models: s.array(rawObject), nextPageToken: s.nullable(s.string()), raw: rawObject }),
  ),
  read(
    "get_model",
    "Retrieve a BigQuery model.",
    input({ projectId, datasetId, modelId: s.string({ minLength: 1 }) }, ["projectId", "datasetId", "modelId"]),
    output({ model: rawObject }),
  ),
  write(
    "patch_model",
    "Patch BigQuery model metadata.",
    input(
      {
        projectId,
        datasetId,
        modelId: s.string({ minLength: 1 }),
        friendlyName: s.string({ minLength: 1 }),
        description: s.string({ minLength: 1 }),
        labels,
      },
      ["projectId", "datasetId", "modelId"],
    ),
    output({ model: rawObject }),
  ),
  destructive(
    "delete_model",
    "Delete a BigQuery model.",
    input({ projectId, datasetId, modelId: s.string({ minLength: 1 }) }, ["projectId", "datasetId", "modelId"]),
    deleteOutput,
  ),
];

export type GoogleBigQueryActionName =
  | "list_projects"
  | "list_datasets"
  | "get_dataset"
  | "list_tables"
  | "get_table"
  | "list_table_data"
  | "query"
  | "get_query_results"
  | "get_job"
  | "list_jobs"
  | "cancel_job"
  | "start_query_job"
  | "start_load_job_from_gcs"
  | "start_extract_job_to_gcs"
  | "create_dataset"
  | "patch_dataset"
  | "update_dataset"
  | "delete_dataset"
  | "create_table"
  | "patch_table"
  | "update_table"
  | "delete_table"
  | "insert_all"
  | "list_routines"
  | "get_routine"
  | "create_routine"
  | "update_routine"
  | "delete_routine"
  | "list_models"
  | "get_model"
  | "patch_model"
  | "delete_model";

export const googleBigQueryActions: ActionDefinition[] = actions.map((source) =>
  defineProviderAction(service, {
    name: source.name,
    operationType: source.operationType,
    description: source.description,
    requiredScopes: source.requiredScopes,
    providerPermissions: source.requiredScopes,
    inputSchema: source.inputSchema,
    outputSchema: source.outputSchema,
  }),
);

function read(
  name: GoogleBigQueryActionName,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): BigQueryActionSource {
  return {
    name,
    operationType: "read",
    description,
    requiredScopes: googleBigQueryReadScopes,
    inputSchema,
    outputSchema,
  };
}

function insertData(
  name: GoogleBigQueryActionName,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): BigQueryActionSource {
  return {
    name,
    operationType: "write",
    description,
    requiredScopes: googleBigQueryInsertDataScopes,
    inputSchema,
    outputSchema,
  };
}

function write(
  name: GoogleBigQueryActionName,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): BigQueryActionSource {
  return {
    name,
    operationType: "write",
    description,
    requiredScopes: googleBigQueryWriteScopes,
    inputSchema,
    outputSchema,
  };
}

function destructive(
  name: GoogleBigQueryActionName,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): BigQueryActionSource {
  return {
    name,
    operationType: "destructive",
    description,
    requiredScopes: googleBigQueryWriteScopes,
    inputSchema,
    outputSchema,
  };
}

function loadJob(
  name: GoogleBigQueryActionName,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): BigQueryActionSource {
  return {
    name,
    operationType: "write",
    description,
    requiredScopes: googleBigQueryLoadJobScopes,
    inputSchema,
    outputSchema,
  };
}

function extractJob(
  name: GoogleBigQueryActionName,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): BigQueryActionSource {
  return {
    name,
    operationType: "write",
    description,
    requiredScopes: googleBigQueryExtractJobScopes,
    inputSchema,
    outputSchema,
  };
}

function input(properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema {
  return s.actionInput(properties, required, "The input payload for this action.");
}

function output(properties: Record<string, JsonSchema>): JsonSchema {
  return s.object(properties, {
    required: Object.keys(properties),
    additionalProperties: true,
    description: "Google BigQuery action output.",
  });
}

function datasetInput(required: string[]): JsonSchema {
  return input(
    {
      projectId,
      datasetId,
      location,
      friendlyName: s.string({ minLength: 1 }),
      description: s.string({ minLength: 1 }),
      labels,
      defaultTableExpirationMs: s.string({ minLength: 1 }),
      defaultPartitionExpirationMs: s.string({ minLength: 1 }),
      updateMode: s.string({ minLength: 1 }),
    },
    required,
  );
}

function tableInput(required: string[]): JsonSchema {
  return input(
    {
      projectId,
      datasetId,
      tableId,
      schema: rawObject,
      friendlyName: s.string({ minLength: 1 }),
      description: s.string({ minLength: 1 }),
      labels,
      timePartitioning: rawObject,
      rangePartitioning: rawObject,
      clustering: rawObject,
      view: rawObject,
      materializedView: rawObject,
      externalDataConfiguration: rawObject,
      encryptionConfiguration: rawObject,
    },
    required,
  );
}

function routineInput(required: string[]): JsonSchema {
  return input(
    {
      projectId,
      datasetId,
      routineId: s.string({ minLength: 1 }),
      routineType: s.string({ minLength: 1 }),
      language: s.string({ minLength: 1 }),
      definitionBody: s.string({ minLength: 1 }),
      description: s.string({ minLength: 1 }),
      arguments: s.array(rawObject, { minItems: 1 }),
      returnType: rawObject,
      importedLibraries: s.array(s.string({ minLength: 1 }), { minItems: 1 }),
      determinismLevel: s.string({ minLength: 1 }),
    },
    required,
  );
}
