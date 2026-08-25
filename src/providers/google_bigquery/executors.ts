import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger as asOptionalInteger,
  requiredRecord,
} from "../../core/cast.ts";
import { googleJsonRequest, googleRequest } from "../google-runtime.ts";
import { defineOAuthProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";

const bigQueryApiBaseUrl = "https://bigquery.googleapis.com/bigquery/v2";

type GoogleBigQueryRuntimeDeps = OAuthProviderContext;

type GoogleBigQueryActionHandler = (
  input: Record<string, unknown>,
  context: GoogleBigQueryRuntimeDeps,
) => Promise<unknown>;

export const googleBigQueryActionHandlers: ProviderActionHandlers<"google_bigquery", GoogleBigQueryActionHandler> = {
  list_projects: listProjects,
  list_datasets: listDatasets,
  get_dataset: getDataset,
  list_tables: listTables,
  get_table: getTable,
  list_table_data: listTableData,
  query: query,
  get_query_results: getQueryResults,
  get_job: getJob,
  list_jobs: listJobs,
  cancel_job: cancelJob,
  start_query_job: startQueryJob,
  start_load_job_from_gcs: startLoadJobFromGcs,
  start_extract_job_to_gcs: startExtractJobToGcs,
  create_dataset: createDataset,
  patch_dataset: patchDataset,
  update_dataset: updateDataset,
  delete_dataset: deleteDataset,
  create_table: createTable,
  patch_table: patchTable,
  update_table: updateTable,
  delete_table: deleteTable,
  insert_all: insertAll,
  list_routines: listRoutines,
  get_routine: getRoutine,
  create_routine: createRoutine,
  update_routine: updateRoutine,
  delete_routine: deleteRoutine,
  list_models: listModels,
  get_model: getModel,
  patch_model: patchModel,
  delete_model: deleteModel,
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(
  "google_bigquery",
  googleBigQueryActionHandlers,
);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const profile = await googleJsonRequest<{
      email?: string;
      name?: string;
      sub?: string;
    }>("https://www.googleapis.com/oauth2/v3/userinfo", {
      accessToken: input.accessToken,
      fetcher,
    });
    return {
      profile: {
        accountId: profile.email ?? profile.sub ?? "google_bigquery:oauth2",
        displayName: profile.name ?? profile.email ?? "Google BigQuery User",
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

async function listProjects(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const payload = await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects`, {
    context,
    query: compactObject({
      maxResults: optionalScalarString(input.maxResults),
      pageToken: optionalNonEmptyString(input.pageToken),
    }),
  });
  const record = asObject(payload);

  return {
    projects: optionalObjectArray(record.projects).map(normalizeProject),
    nextPageToken: optionalNonEmptyString(record.nextPageToken) ?? null,
    raw: record,
  };
}

async function listDatasets(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const payload = await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects/${projectId}/datasets`, {
    context,
    query: compactObject({
      all: optionalBooleanString(input.all),
      filter: optionalNonEmptyString(input.filter),
      maxResults: optionalScalarString(input.maxResults),
      pageToken: optionalNonEmptyString(input.pageToken),
    }),
  });
  const record = asObject(payload);

  return {
    datasets: optionalObjectArray(record.datasets).map(normalizeDataset),
    nextPageToken: optionalNonEmptyString(record.nextPageToken) ?? null,
    raw: record,
  };
}

async function getDataset(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const payload = await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}`, {
    context,
    query: compactObject({
      selectedFields: optionalNonEmptyString(input.selectedFields),
    }),
  });

  return {
    dataset: normalizeDataset(asObject(payload)),
  };
}

async function listTables(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const payload = await googleBigQueryJsonRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/tables`,
    {
      context,
      query: compactObject({
        maxResults: optionalScalarString(input.maxResults),
        pageToken: optionalNonEmptyString(input.pageToken),
      }),
    },
  );
  const record = asObject(payload);

  return {
    tables: optionalObjectArray(record.tables).map(normalizeTable),
    nextPageToken: optionalNonEmptyString(record.nextPageToken) ?? null,
    raw: record,
  };
}

async function getTable(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const tableId = requireNonEmptyString(input.tableId, "tableId");
  const payload = await googleBigQueryJsonRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/tables/${tableId}`,
    {
      context,
      query: compactObject({
        selectedFields: optionalNonEmptyString(input.selectedFields),
      }),
    },
  );

  return {
    table: normalizeTable(asObject(payload)),
  };
}

async function listTableData(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const tableId = requireNonEmptyString(input.tableId, "tableId");
  const payload = await googleBigQueryJsonRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/tables/${tableId}/data`,
    {
      context,
      query: compactObject({
        maxResults: optionalScalarString(input.maxResults),
        pageToken: optionalNonEmptyString(input.pageToken),
        startIndex: optionalNonEmptyString(input.startIndex),
        selectedFields: optionalNonEmptyString(input.selectedFields),
      }),
    },
  );
  const record = asObject(payload);

  return {
    rows: normalizeRows(record.rows),
    schema: normalizeNullableSchema(record.schema),
    totalRows: optionalNonEmptyString(record.totalRows) ?? null,
    pageToken: optionalNonEmptyString(record.pageToken) ?? null,
    raw: record,
  };
}

async function query(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const payload = await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects/${projectId}/queries`, {
    context,
    method: "POST",
    body: compactObject({
      query: requireNonEmptyString(input.query, "query"),
      location: optionalNonEmptyString(input.location),
      maxResults: asOptionalInteger(input.maxResults),
      dryRun: optionalBoolean(input.dryRun),
      useLegacySql: optionalBoolean(input.useLegacySql) ?? false,
      timeoutMs: asOptionalInteger(input.timeoutMs),
      parameterMode: optionalNonEmptyString(input.parameterMode),
      queryParameters: optionalObjectArrayOrUndefined(input.queryParameters),
    }),
  });
  const record = asObject(payload);

  return {
    jobComplete: record.jobComplete === true,
    jobReference: asOptionalObjectOrNull(record.jobReference),
    rows: normalizeRows(record.rows),
    schema: normalizeNullableSchema(record.schema),
    totalRows: optionalNonEmptyString(record.totalRows) ?? null,
    totalBytesProcessed: optionalNonEmptyString(record.totalBytesProcessed) ?? null,
    cacheHit: typeof record.cacheHit === "boolean" ? record.cacheHit : null,
    pageToken: optionalNonEmptyString(record.pageToken) ?? null,
    raw: record,
  };
}

async function getQueryResults(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const jobId = requireNonEmptyString(input.jobId, "jobId");
  const payload = await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects/${projectId}/queries/${jobId}`, {
    context,
    query: compactObject({
      location: optionalNonEmptyString(input.location),
      maxResults: optionalScalarString(input.maxResults),
      pageToken: optionalNonEmptyString(input.pageToken),
      startIndex: optionalNonEmptyString(input.startIndex),
      timeoutMs: optionalScalarString(input.timeoutMs),
    }),
  });

  return normalizeQueryResult(asObject(payload));
}

async function getJob(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const jobId = requireNonEmptyString(input.jobId, "jobId");
  const payload = await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects/${projectId}/jobs/${jobId}`, {
    context,
    query: compactObject({
      location: optionalNonEmptyString(input.location),
    }),
  });

  return {
    job: normalizeJob(asObject(payload)),
  };
}

async function listJobs(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const payload = await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects/${projectId}/jobs`, {
    context,
    query: compactObject({
      allUsers: optionalBooleanString(input.allUsers),
      maxResults: optionalScalarString(input.maxResults),
      pageToken: optionalNonEmptyString(input.pageToken),
      projection: optionalUppercaseString(input.projection),
      stateFilter: optionalUppercaseStringArray(input.stateFilter),
      minCreationTime: optionalScalarString(input.minCreationTime),
      maxCreationTime: optionalScalarString(input.maxCreationTime),
    }),
  });
  const record = asObject(payload);

  return {
    jobs: optionalObjectArray(record.jobs).map(normalizeJob),
    nextPageToken: optionalNonEmptyString(record.nextPageToken) ?? null,
    raw: record,
  };
}

async function cancelJob(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const jobId = requireNonEmptyString(input.jobId, "jobId");
  const payload = await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects/${projectId}/jobs/${jobId}/cancel`, {
    context,
    method: "POST",
    query: compactObject({
      location: optionalNonEmptyString(input.location),
    }),
  });
  const record = asObject(payload);

  return {
    job: normalizeJob(asObject(record.job)),
  };
}

async function startQueryJob(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const payload = await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects/${projectId}/jobs`, {
    context,
    method: "POST",
    body: compactObject({
      jobReference: compactObject({
        projectId,
        jobId: optionalNonEmptyString(input.jobId),
        location: optionalNonEmptyString(input.location),
      }),
      configuration: compactObject({
        query: compactObject({
          query: requireNonEmptyString(input.query, "query"),
          useLegacySql: optionalBoolean(input.useLegacySql) ?? false,
          destinationTable: optionalPlainObject(input.destinationTable),
          defaultDataset: optionalPlainObject(input.defaultDataset),
          writeDisposition: optionalNonEmptyString(input.writeDisposition),
          createDisposition: optionalNonEmptyString(input.createDisposition),
          priority: optionalNonEmptyString(input.priority),
          maximumBytesBilled: optionalNonEmptyString(input.maximumBytesBilled),
          parameterMode: optionalNonEmptyString(input.parameterMode),
          queryParameters: optionalObjectArrayOrUndefined(input.queryParameters),
        }),
        dryRun: optionalBoolean(input.dryRun),
        labels: optionalPlainObject(input.labels),
      }),
    }),
  });

  return {
    job: normalizeJob(asObject(payload)),
  };
}

async function startLoadJobFromGcs(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const payload = await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects/${projectId}/jobs`, {
    context,
    method: "POST",
    body: compactObject({
      jobReference: compactObject({
        projectId,
        jobId: optionalNonEmptyString(input.jobId),
        location: optionalNonEmptyString(input.location),
      }),
      configuration: compactObject({
        load: buildLoadJobConfiguration(input),
        labels: optionalPlainObject(input.labels),
      }),
    }),
  });

  return {
    job: normalizeJob(asObject(payload)),
  };
}

async function startExtractJobToGcs(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const payload = await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects/${projectId}/jobs`, {
    context,
    method: "POST",
    body: compactObject({
      jobReference: compactObject({
        projectId,
        jobId: optionalNonEmptyString(input.jobId),
        location: optionalNonEmptyString(input.location),
      }),
      configuration: compactObject({
        extract: buildExtractJobConfiguration(input),
        labels: optionalPlainObject(input.labels),
      }),
    }),
  });

  return {
    job: normalizeJob(asObject(payload)),
  };
}

async function createDataset(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const payload = await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects/${projectId}/datasets`, {
    context,
    method: "POST",
    body: compactObject({
      datasetReference: { projectId, datasetId },
      location: optionalNonEmptyString(input.location),
      friendlyName: optionalNonEmptyString(input.friendlyName),
      description: optionalNonEmptyString(input.description),
      labels: optionalPlainObject(input.labels),
      defaultTableExpirationMs: optionalNonEmptyString(input.defaultTableExpirationMs),
      defaultPartitionExpirationMs: optionalNonEmptyString(input.defaultPartitionExpirationMs),
    }),
  });

  return {
    dataset: normalizeDataset(asObject(payload)),
  };
}

async function patchDataset(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const payload = await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}`, {
    context,
    method: "PATCH",
    query: compactObject({
      updateMode: optionalNonEmptyString(input.updateMode),
    }),
    body: buildDatasetPatchBody(input),
  });

  return {
    dataset: normalizeDataset(asObject(payload)),
  };
}

async function updateDataset(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const existing = asObject(
    await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}`, { context }),
  );
  const payload = await googleBigQueryJsonRequest(`${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}`, {
    context,
    method: "PUT",
    body: buildDatasetUpdateBody(input, existing, projectId, datasetId),
  });

  return {
    dataset: normalizeDataset(asObject(payload)),
  };
}

async function deleteDataset(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const payload = await googleBigQueryEmptyRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}`,
    {
      context,
      method: "DELETE",
      query: compactObject({
        deleteContents: optionalTrueString(input.deleteContents),
      }),
    },
  );

  return normalizeDeleteResponse(payload);
}

async function createTable(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const tableId = requireNonEmptyString(input.tableId, "tableId");
  const payload = await googleBigQueryJsonRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/tables`,
    {
      context,
      method: "POST",
      body: compactObject({
        tableReference: { projectId, datasetId, tableId },
        ...buildTablePatchBody(input),
      }),
    },
  );

  return {
    table: normalizeTable(asObject(payload)),
  };
}

async function patchTable(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const tableId = requireNonEmptyString(input.tableId, "tableId");
  const payload = await googleBigQueryJsonRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/tables/${tableId}`,
    {
      context,
      method: "PATCH",
      body: buildTablePatchBody(input),
    },
  );

  return {
    table: normalizeTable(asObject(payload)),
  };
}

async function updateTable(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const tableId = requireNonEmptyString(input.tableId, "tableId");
  const existing = asObject(
    await googleBigQueryJsonRequest(
      `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/tables/${tableId}`,
      { context },
    ),
  );
  const payload = await googleBigQueryJsonRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/tables/${tableId}`,
    {
      context,
      method: "PUT",
      body: buildTableUpdateBody(input, existing, projectId, datasetId, tableId),
    },
  );

  return {
    table: normalizeTable(asObject(payload)),
  };
}

async function deleteTable(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const tableId = requireNonEmptyString(input.tableId, "tableId");
  const payload = await googleBigQueryEmptyRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/tables/${tableId}`,
    {
      context,
      method: "DELETE",
    },
  );

  return normalizeDeleteResponse(payload);
}

async function insertAll(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const tableId = requireNonEmptyString(input.tableId, "tableId");
  const payload = await googleBigQueryJsonRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/tables/${tableId}/insertAll`,
    {
      context,
      method: "POST",
      body: compactObject({
        skipInvalidRows: optionalBoolean(input.skipInvalidRows),
        ignoreUnknownValues: optionalBoolean(input.ignoreUnknownValues),
        templateSuffix: optionalNonEmptyString(input.templateSuffix),
        rows: optionalObjectArray(input.rows).map(normalizeInsertAllInputRow),
      }),
    },
  );
  const record = asObject(payload);

  return {
    insertErrors: optionalObjectArray(record.insertErrors).map(normalizeInsertError),
    raw: record,
  };
}

async function listRoutines(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const payload = await googleBigQueryJsonRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/routines`,
    {
      context,
      query: compactObject({
        maxResults: optionalScalarString(input.maxResults),
        pageToken: optionalNonEmptyString(input.pageToken),
        readMask: optionalNonEmptyString(input.readMask),
      }),
    },
  );
  const record = asObject(payload);

  return {
    routines: optionalObjectArray(record.routines).map(normalizeRoutine),
    nextPageToken: optionalNonEmptyString(record.nextPageToken) ?? null,
    raw: record,
  };
}

async function getRoutine(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const routineId = requireNonEmptyString(input.routineId, "routineId");
  const payload = await googleBigQueryJsonRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/routines/${routineId}`,
    {
      context,
      query: compactObject({
        readMask: optionalNonEmptyString(input.readMask),
      }),
    },
  );

  return {
    routine: normalizeRoutine(asObject(payload)),
  };
}

async function createRoutine(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const routineId = requireNonEmptyString(input.routineId, "routineId");
  const payload = await googleBigQueryJsonRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/routines`,
    {
      context,
      method: "POST",
      body: {
        routineReference: { projectId, datasetId, routineId },
        ...buildRoutineBody(input),
      },
    },
  );

  return {
    routine: normalizeRoutine(asObject(payload)),
  };
}

async function updateRoutine(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const routineId = requireNonEmptyString(input.routineId, "routineId");
  const existing = asObject(
    await googleBigQueryJsonRequest(
      `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/routines/${routineId}`,
      { context },
    ),
  );
  const payload = await googleBigQueryJsonRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/routines/${routineId}`,
    {
      context,
      method: "PUT",
      body: {
        ...existing,
        routineReference: { projectId, datasetId, routineId },
        ...buildRoutineBody(input),
      },
    },
  );

  return {
    routine: normalizeRoutine(asObject(payload)),
  };
}

async function deleteRoutine(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const routineId = requireNonEmptyString(input.routineId, "routineId");
  const payload = await googleBigQueryEmptyRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/routines/${routineId}`,
    {
      context,
      method: "DELETE",
    },
  );

  return normalizeDeleteResponse(payload);
}

async function listModels(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const payload = await googleBigQueryJsonRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/models`,
    {
      context,
      query: compactObject({
        maxResults: optionalScalarString(input.maxResults),
        pageToken: optionalNonEmptyString(input.pageToken),
      }),
    },
  );
  const record = asObject(payload);

  return {
    models: optionalObjectArray(record.models).map(normalizeModel),
    nextPageToken: optionalNonEmptyString(record.nextPageToken) ?? null,
    raw: record,
  };
}

async function getModel(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const modelId = requireNonEmptyString(input.modelId, "modelId");
  const payload = await googleBigQueryJsonRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/models/${modelId}`,
    {
      context,
    },
  );

  return {
    model: normalizeModel(asObject(payload)),
  };
}

async function patchModel(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const modelId = requireNonEmptyString(input.modelId, "modelId");
  const payload = await googleBigQueryJsonRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/models/${modelId}`,
    {
      context,
      method: "PATCH",
      body: buildModelPatchBody(input),
    },
  );

  return {
    model: normalizeModel(asObject(payload)),
  };
}

async function deleteModel(input: Record<string, unknown>, context: GoogleBigQueryRuntimeDeps) {
  const projectId = requireNonEmptyString(input.projectId, "projectId");
  const datasetId = requireNonEmptyString(input.datasetId, "datasetId");
  const modelId = requireNonEmptyString(input.modelId, "modelId");
  const payload = await googleBigQueryEmptyRequest(
    `${bigQueryApiBaseUrl}/projects/${projectId}/datasets/${datasetId}/models/${modelId}`,
    {
      context,
      method: "DELETE",
    },
  );

  return normalizeDeleteResponse(payload);
}

async function googleBigQueryJsonRequest(
  url: string,
  input: {
    context: GoogleBigQueryRuntimeDeps;
    method?: string;
    query?: Record<string, string | readonly string[] | undefined>;
    body?: unknown;
  },
) {
  return googleJsonRequest(url, {
    accessToken: input.context.accessToken,
    fetcher: input.context.fetcher,
    method: input.method,
    query: input.query,
    body: input.body,
  });
}

async function googleBigQueryEmptyRequest(
  url: string,
  input: {
    context: GoogleBigQueryRuntimeDeps;
    method?: string;
    query?: Record<string, string | readonly string[] | undefined>;
  },
) {
  const response = await googleRequest(url, {
    accessToken: input.context.accessToken,
    fetcher: input.context.fetcher,
    method: input.method,
    query: input.query,
  });
  const text = (await response.text()).trim();
  return text ? (JSON.parse(text) as unknown) : {};
}

function normalizeProject(value: Record<string, unknown>) {
  const reference = asObjectOrEmpty(value.projectReference);
  return {
    id: optionalNonEmptyString(value.id) ?? optionalNonEmptyString(reference.projectId) ?? "",
    projectId: optionalNonEmptyString(reference.projectId) ?? optionalNonEmptyString(value.id) ?? "",
    numericId: optionalNonEmptyString(value.numericId) ?? null,
    friendlyName: optionalNonEmptyString(value.friendlyName) ?? null,
    raw: value,
  };
}

function normalizeDataset(value: Record<string, unknown>) {
  const reference = asObjectOrEmpty(value.datasetReference);
  return {
    id: optionalNonEmptyString(value.id) ?? buildDatasetId(reference),
    projectId: optionalNonEmptyString(reference.projectId) ?? "",
    datasetId: optionalNonEmptyString(reference.datasetId) ?? "",
    friendlyName: optionalNonEmptyString(value.friendlyName) ?? null,
    description: optionalNonEmptyString(value.description) ?? null,
    labels: asOptionalObjectOrNull(value.labels),
    location: optionalNonEmptyString(value.location) ?? null,
    defaultTableExpirationMs: optionalNonEmptyString(value.defaultTableExpirationMs) ?? null,
    defaultPartitionExpirationMs: optionalNonEmptyString(value.defaultPartitionExpirationMs) ?? null,
    creationTime: optionalNonEmptyString(value.creationTime) ?? null,
    modifiedTime: optionalNonEmptyString(value.lastModifiedTime) ?? null,
    raw: value,
  };
}

function normalizeTable(value: Record<string, unknown>) {
  const reference = asObjectOrEmpty(value.tableReference);
  return {
    id: optionalNonEmptyString(value.id) ?? buildTableId(reference),
    projectId: optionalNonEmptyString(reference.projectId) ?? "",
    datasetId: optionalNonEmptyString(reference.datasetId) ?? "",
    tableId: optionalNonEmptyString(reference.tableId) ?? "",
    friendlyName: optionalNonEmptyString(value.friendlyName) ?? null,
    type: optionalNonEmptyString(value.type) ?? null,
    location: optionalNonEmptyString(value.location) ?? null,
    creationTime: optionalNonEmptyString(value.creationTime) ?? null,
    modifiedTime: optionalNonEmptyString(value.lastModifiedTime) ?? null,
    numRows: optionalNonEmptyString(value.numRows) ?? null,
    numBytes: optionalNonEmptyString(value.numBytes) ?? null,
    schema: normalizeNullableSchema(value.schema),
    raw: value,
  };
}

function normalizeQueryResult(record: Record<string, unknown>) {
  return {
    jobComplete: record.jobComplete === true,
    jobReference: asOptionalObjectOrNull(record.jobReference),
    rows: normalizeRows(record.rows),
    schema: normalizeNullableSchema(record.schema),
    totalRows: optionalNonEmptyString(record.totalRows) ?? null,
    totalBytesProcessed: optionalNonEmptyString(record.totalBytesProcessed) ?? null,
    cacheHit: typeof record.cacheHit === "boolean" ? record.cacheHit : null,
    pageToken: optionalNonEmptyString(record.pageToken) ?? null,
    raw: record,
  };
}

function normalizeJob(value: Record<string, unknown>) {
  const reference = asObjectOrEmpty(value.jobReference);
  const status = asOptionalObjectOrNull(value.status);
  const state = optionalNonEmptyString(value.state) ?? (status ? optionalNonEmptyString(status.state) : undefined);
  return {
    id: optionalNonEmptyString(value.id) ?? buildJobId(reference),
    projectId: optionalNonEmptyString(reference.projectId) ?? "",
    jobId: optionalNonEmptyString(reference.jobId) ?? "",
    location: optionalNonEmptyString(reference.location) ?? null,
    state: state ?? null,
    status,
    errorResult:
      asOptionalObjectOrNull(value.errorResult) ?? (status ? asOptionalObjectOrNull(status.errorResult) : null),
    errors:
      optionalObjectArray(value.errors).length > 0
        ? optionalObjectArray(value.errors)
        : status
          ? optionalObjectArray(status.errors)
          : [],
    configuration: asOptionalObjectOrNull(value.configuration),
    statistics: asOptionalObjectOrNull(value.statistics),
    userEmail: optionalNonEmptyString(value.userEmail) ?? optionalNonEmptyString(value.user_email) ?? null,
    raw: value,
  };
}

function normalizeInsertError(value: Record<string, unknown>) {
  return {
    index: typeof value.index === "number" && Number.isInteger(value.index) ? value.index : null,
    errors: optionalObjectArray(value.errors),
    raw: value,
  };
}

function normalizeRoutine(value: Record<string, unknown>) {
  const reference = asObjectOrEmpty(value.routineReference);
  return {
    id: optionalNonEmptyString(value.id) ?? buildRoutineId(reference),
    projectId: optionalNonEmptyString(reference.projectId) ?? "",
    datasetId: optionalNonEmptyString(reference.datasetId) ?? "",
    routineId: optionalNonEmptyString(reference.routineId) ?? "",
    routineType: optionalNonEmptyString(value.routineType) ?? null,
    language: optionalNonEmptyString(value.language) ?? null,
    creationTime: optionalNonEmptyString(value.creationTime) ?? null,
    modifiedTime: optionalNonEmptyString(value.lastModifiedTime) ?? null,
    raw: value,
  };
}

function normalizeModel(value: Record<string, unknown>) {
  const reference = asObjectOrEmpty(value.modelReference);
  return {
    id: optionalNonEmptyString(value.id) ?? buildModelId(reference),
    projectId: optionalNonEmptyString(reference.projectId) ?? "",
    datasetId: optionalNonEmptyString(reference.datasetId) ?? "",
    modelId: optionalNonEmptyString(reference.modelId) ?? "",
    modelType: optionalNonEmptyString(value.modelType) ?? null,
    friendlyName: optionalNonEmptyString(value.friendlyName) ?? null,
    description: optionalNonEmptyString(value.description) ?? null,
    labels: asOptionalObjectOrNull(value.labels),
    creationTime: optionalNonEmptyString(value.creationTime) ?? null,
    modifiedTime: optionalNonEmptyString(value.lastModifiedTime) ?? null,
    raw: value,
  };
}

function normalizeDeleteResponse(value: unknown) {
  return {
    success: true,
    raw: asObjectOrEmpty(value),
  };
}

function normalizeNullableSchema(value: unknown) {
  const schema = asOptionalObjectOrNull(value);
  if (!schema) {
    return null;
  }

  return {
    fields: optionalObjectArray(schema.fields).map(normalizeField),
    raw: schema,
  };
}

type NormalizedField = {
  name: string;
  type: string;
  mode: string | null;
  description: string | null;
  fields: NormalizedField[];
  raw: Record<string, unknown>;
};

function normalizeField(value: Record<string, unknown>): NormalizedField {
  return {
    name: optionalNonEmptyString(value.name) ?? "",
    type: optionalNonEmptyString(value.type) ?? "",
    mode: optionalNonEmptyString(value.mode) ?? null,
    description: optionalNonEmptyString(value.description) ?? null,
    fields: optionalObjectArray(value.fields).map(normalizeField),
    raw: value,
  };
}

function normalizeRows(value: unknown) {
  return optionalObjectArray(value).map((row) => ({
    values: optionalObjectArray(row.f).map((cell) => ("v" in cell ? cell.v : null)),
    raw: row,
  }));
}

function buildDatasetPatchBody(input: Record<string, unknown>) {
  return compactObject({
    location: optionalNonEmptyString(input.location),
    friendlyName: optionalNonEmptyString(input.friendlyName),
    description: optionalNonEmptyString(input.description),
    labels: optionalPlainObject(input.labels),
    defaultTableExpirationMs: optionalNonEmptyString(input.defaultTableExpirationMs),
    defaultPartitionExpirationMs: optionalNonEmptyString(input.defaultPartitionExpirationMs),
  });
}

function buildDatasetUpdateBody(
  input: Record<string, unknown>,
  existing: Record<string, unknown>,
  projectId: string,
  datasetId: string,
) {
  return compactObject({
    ...existing,
    datasetReference: { projectId, datasetId },
    location: optionalNonEmptyString(input.location) ?? existing.location,
    friendlyName: optionalNonEmptyString(input.friendlyName) ?? existing.friendlyName,
    description: optionalNonEmptyString(input.description) ?? existing.description,
    labels: optionalPlainObject(input.labels) ?? existing.labels,
    defaultTableExpirationMs:
      optionalNonEmptyString(input.defaultTableExpirationMs) ?? existing.defaultTableExpirationMs,
    defaultPartitionExpirationMs:
      optionalNonEmptyString(input.defaultPartitionExpirationMs) ?? existing.defaultPartitionExpirationMs,
  });
}

function buildTablePatchBody(input: Record<string, unknown>) {
  return compactObject({
    schema: optionalPlainObject(input.schema),
    friendlyName: optionalNonEmptyString(input.friendlyName),
    description: optionalNonEmptyString(input.description),
    labels: optionalPlainObject(input.labels),
    timePartitioning: optionalPlainObject(input.timePartitioning),
    rangePartitioning: optionalPlainObject(input.rangePartitioning),
    clustering: optionalPlainObject(input.clustering),
    view: optionalPlainObject(input.view),
    materializedView: optionalPlainObject(input.materializedView),
    externalDataConfiguration: optionalPlainObject(input.externalDataConfiguration),
    encryptionConfiguration: optionalPlainObject(input.encryptionConfiguration),
  });
}

function buildTableUpdateBody(
  input: Record<string, unknown>,
  existing: Record<string, unknown>,
  projectId: string,
  datasetId: string,
  tableId: string,
) {
  return compactObject({
    ...existing,
    tableReference: { projectId, datasetId, tableId },
    schema: optionalPlainObject(input.schema) ?? existing.schema,
    friendlyName: optionalNonEmptyString(input.friendlyName) ?? existing.friendlyName,
    description: optionalNonEmptyString(input.description) ?? existing.description,
    labels: optionalPlainObject(input.labels) ?? existing.labels,
    timePartitioning: optionalPlainObject(input.timePartitioning) ?? existing.timePartitioning,
    rangePartitioning: optionalPlainObject(input.rangePartitioning) ?? existing.rangePartitioning,
    clustering: optionalPlainObject(input.clustering) ?? existing.clustering,
    view: optionalPlainObject(input.view) ?? existing.view,
    materializedView: optionalPlainObject(input.materializedView) ?? existing.materializedView,
    externalDataConfiguration:
      optionalPlainObject(input.externalDataConfiguration) ?? existing.externalDataConfiguration,
    encryptionConfiguration: optionalPlainObject(input.encryptionConfiguration) ?? existing.encryptionConfiguration,
  });
}

function buildLoadJobConfiguration(input: Record<string, unknown>) {
  return compactObject({
    sourceUris: requireNonEmptyStringArray(input.sourceUris, "sourceUris"),
    destinationTable: requireObject(input.destinationTable, "destinationTable"),
    sourceFormat: optionalNonEmptyString(input.sourceFormat),
    schema: optionalPlainObject(input.schema),
    writeDisposition: optionalNonEmptyString(input.writeDisposition),
    createDisposition: optionalNonEmptyString(input.createDisposition),
    skipLeadingRows: asOptionalInteger(input.skipLeadingRows),
    fieldDelimiter: optionalNonEmptyString(input.fieldDelimiter),
    allowQuotedNewlines: optionalBoolean(input.allowQuotedNewlines),
    allowJaggedRows: optionalBoolean(input.allowJaggedRows),
    ignoreUnknownValues: optionalBoolean(input.ignoreUnknownValues),
    maxBadRecords: asOptionalInteger(input.maxBadRecords),
    autodetect: optionalBoolean(input.autodetect),
    nullMarker: optionalNonEmptyString(input.nullMarker),
    encoding: optionalNonEmptyString(input.encoding),
    timePartitioning: optionalPlainObject(input.timePartitioning),
    rangePartitioning: optionalPlainObject(input.rangePartitioning),
    clustering: optionalPlainObject(input.clustering),
  });
}

function buildExtractJobConfiguration(input: Record<string, unknown>) {
  return compactObject({
    sourceTable: requireObject(input.sourceTable, "sourceTable"),
    destinationUris: requireNonEmptyStringArray(input.destinationUris, "destinationUris"),
    destinationFormat: optionalNonEmptyString(input.destinationFormat),
    compression: optionalNonEmptyString(input.compression),
    fieldDelimiter: optionalNonEmptyString(input.fieldDelimiter),
    printHeader: optionalBoolean(input.printHeader),
    useAvroLogicalTypes: optionalBoolean(input.useAvroLogicalTypes),
  });
}

function buildRoutineBody(input: Record<string, unknown>) {
  return compactObject({
    routineType: requireNonEmptyString(input.routineType, "routineType"),
    language: optionalNonEmptyString(input.language),
    definitionBody: requireNonEmptyString(input.definitionBody, "definitionBody"),
    description: optionalNonEmptyString(input.description),
    arguments: optionalObjectArrayOrUndefined(input.arguments),
    returnType: optionalPlainObject(input.returnType),
    importedLibraries: optionalStringArray(input.importedLibraries),
    determinismLevel: optionalNonEmptyString(input.determinismLevel),
  });
}

function buildModelPatchBody(input: Record<string, unknown>) {
  return compactObject({
    friendlyName: optionalNonEmptyString(input.friendlyName),
    description: optionalNonEmptyString(input.description),
    labels: optionalPlainObject(input.labels),
  });
}

function normalizeInsertAllInputRow(value: Record<string, unknown>) {
  return compactObject({
    insertId: optionalNonEmptyString(value.insertId),
    json: asObject(value.json),
  });
}

function buildDatasetId(reference: Record<string, unknown>) {
  const projectId = optionalNonEmptyString(reference.projectId);
  const datasetId = optionalNonEmptyString(reference.datasetId);
  return projectId && datasetId ? `${projectId}:${datasetId}` : "";
}

function buildTableId(reference: Record<string, unknown>) {
  const projectId = optionalNonEmptyString(reference.projectId);
  const datasetId = optionalNonEmptyString(reference.datasetId);
  const tableId = optionalNonEmptyString(reference.tableId);
  return projectId && datasetId && tableId ? `${projectId}:${datasetId}.${tableId}` : "";
}

function buildJobId(reference: Record<string, unknown>) {
  const projectId = optionalNonEmptyString(reference.projectId);
  const location = optionalNonEmptyString(reference.location);
  const jobId = optionalNonEmptyString(reference.jobId);
  if (!projectId || !jobId) {
    return "";
  }
  return location ? `${projectId}:${location}.${jobId}` : `${projectId}.${jobId}`;
}

function buildRoutineId(reference: Record<string, unknown>) {
  const projectId = optionalNonEmptyString(reference.projectId);
  const datasetId = optionalNonEmptyString(reference.datasetId);
  const routineId = optionalNonEmptyString(reference.routineId);
  return projectId && datasetId && routineId ? `${projectId}:${datasetId}.${routineId}` : "";
}

function buildModelId(reference: Record<string, unknown>) {
  const projectId = optionalNonEmptyString(reference.projectId);
  const datasetId = optionalNonEmptyString(reference.datasetId);
  const modelId = optionalNonEmptyString(reference.modelId);
  return projectId && datasetId && modelId ? `${projectId}:${datasetId}.${modelId}` : "";
}

function asObjectOrEmpty(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asOptionalObjectOrNull(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function optionalObjectArray(value: unknown) {
  return Array.isArray(value) ? value.map(asObject) : [];
}

function optionalObjectArrayOrUndefined(value: unknown) {
  return Array.isArray(value) ? value.map(asObject) : undefined;
}

function optionalStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(optionalNonEmptyString).filter((item): item is string => item !== undefined)
    : undefined;
}

function optionalPlainObject(value: unknown) {
  return asOptionalObjectOrNull(value) ?? undefined;
}

function requireNonEmptyString(value: unknown, fieldName: string) {
  const resolved = optionalNonEmptyString(value);
  if (!resolved) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return resolved;
}

function requireNonEmptyStringArray(value: unknown, fieldName: string) {
  const resolved = optionalStringArray(value);
  if (!resolved || resolved.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return resolved;
}

function requireObject(value: unknown, fieldName: string) {
  const resolved = asOptionalObjectOrNull(value);
  if (!resolved) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return resolved;
}

function optionalNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function optionalScalarString(value: unknown) {
  if (value == null || value === "") {
    return undefined;
  }
  return String(value);
}

function optionalBooleanString(value: unknown) {
  return typeof value === "boolean" ? String(value) : undefined;
}

function optionalTrueString(value: unknown) {
  return value === true ? "true" : undefined;
}

function optionalUppercaseString(value: unknown) {
  const text = optionalNonEmptyString(value);
  return text ? text.toUpperCase() : undefined;
}

function optionalUppercaseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => optionalUppercaseString(item)).filter((item) => item !== undefined)
    : undefined;
}

function asObject(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "object input", (message) => new ProviderRequestError(400, message));
}
