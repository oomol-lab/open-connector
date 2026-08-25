import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cloudconvert";

const taskReadPermission = ["task.read"];
const taskWritePermission = ["task.write"];
const userReadPermission = ["user.read"];

const jobId = s.nonEmptyString("The CloudConvert job ID.");
const taskId = s.nonEmptyString("The CloudConvert task ID.");
const format = s.nonEmptyString("File format such as `pdf`, `docx`, or `png`.");
const status = s.nonEmptyString(
  "CloudConvert status filter such as `waiting`, `processing`, `finished`, `error`, or `canceled`.",
);
const page = s.positiveInteger("Page number to request from CloudConvert.");
const perPage = s.positiveInteger("Number of items to request per CloudConvert page.");
const stringMapSchema = s.record("String-to-string map forwarded to CloudConvert.", s.string("One string value."));
const conversionOptionsSchema = s.record(
  "Additional `convert` task options forwarded to CloudConvert as-is, excluding reserved task wrapper fields.",
  s.unknown("One conversion option value."),
);

const userSchema = s.looseObject("CloudConvert user.");
const conversionTypeSchema = s.looseObject("Possible CloudConvert conversion type.");
const taskSchema = s.looseObject("CloudConvert task.");
const jobSchema = s.looseObject("CloudConvert job.");
const exportedFileSchema = s.object("File returned by an `export/url` task.", {
  filename: s.string("Exported file name."),
  url: s.url("Download URL for the exported file."),
});
const paginationLinksSchema = s.nullable(s.looseObject("Pagination links returned by CloudConvert."));
const paginationMetaSchema = s.nullable(s.looseObject("Pagination metadata returned by CloudConvert."));

const getCurrentUserOutputSchema = s.object("Current CloudConvert user and credits.", {
  user: userSchema,
});

const listConversionTypesOutputSchema = s.object("Possible CloudConvert conversion types.", {
  conversionTypes: s.array("Possible CloudConvert conversion types matching the filters.", conversionTypeSchema),
});

const jobWithFilesOutputSchema = s.object("CloudConvert job plus exported files extracted from the job tasks.", {
  job: jobSchema,
  files: s.array("Files extracted from completed `export/url` tasks.", exportedFileSchema),
});

const listJobsOutputSchema = s.object("Paginated CloudConvert job list.", {
  jobs: s.array("Jobs returned by CloudConvert.", jobSchema),
  links: paginationLinksSchema,
  meta: paginationMetaSchema,
});

const taskOutputSchema = s.object("Single CloudConvert task.", {
  task: taskSchema,
});

const listTasksOutputSchema = s.object("Paginated CloudConvert task list.", {
  tasks: s.array("Tasks returned by CloudConvert.", taskSchema),
  links: paginationLinksSchema,
  meta: paginationMetaSchema,
});

const deleteOutputSchema = s.object("Deletion result returned by the connector.", {
  deleted: s.boolean("Whether the resource deletion request succeeded."),
  id: s.string("Deleted CloudConvert resource ID."),
});

const urlConversionJobInputSchema = s.object(
  "Input payload for creating a URL-based CloudConvert conversion job.",
  {
    sourceUrl: s.url("Remote file URL that CloudConvert should import."),
    sourceFilename: s.nonEmptyString("Optional file name override used for the imported source."),
    sourceHeaders: stringMapSchema,
    inputFormat: format,
    outputFormat: format,
    engine: s.nonEmptyString("Optional CloudConvert engine name."),
    engineVersion: s.nonEmptyString("Optional CloudConvert engine version."),
    conversionOptions: conversionOptionsSchema,
    outputFilename: s.nonEmptyString("Optional file name for the exported result."),
    inline: s.boolean("Whether the exported file should be marked for inline display when possible."),
    archiveMultipleFiles: s.boolean("Whether CloudConvert should archive multiple exported files when needed."),
    jobTag: s.nonEmptyString("Optional tag stored on the created job."),
    webhookUrl: s.url("Optional webhook URL CloudConvert should call for job status updates."),
  },
  {
    optional: [
      "sourceFilename",
      "sourceHeaders",
      "inputFormat",
      "engine",
      "engineVersion",
      "conversionOptions",
      "outputFilename",
      "inline",
      "archiveMultipleFiles",
      "jobTag",
      "webhookUrl",
    ],
  },
);

export const cloudconvertActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the current CloudConvert user and remaining credits for the API token.",
    requiredScopes: userReadPermission,
    inputSchema: s.object("No input is required.", {}),
    outputSchema: getCurrentUserOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_conversion_types",
    description: "List possible CloudConvert conversion types for the requested input and output formats.",
    inputSchema: s.object(
      "Filters for listing CloudConvert conversion types.",
      {
        inputFormat: format,
        outputFormat: format,
        engine: s.nonEmptyString("Optional engine filter."),
        engineVersion: s.nonEmptyString("Optional engine version filter."),
        alternatives: s.boolean("Whether to include alternative engines for the same format pair."),
        includeOptions: s.boolean("Whether to include conversion option descriptors in the response."),
        includeEngineVersions: s.boolean("Whether to include compatible engine version descriptors in the response."),
      },
      {
        optional: [
          "inputFormat",
          "outputFormat",
          "engine",
          "engineVersion",
          "alternatives",
          "includeOptions",
          "includeEngineVersions",
        ],
      },
    ),
    outputSchema: listConversionTypesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_url_conversion_job",
    description:
      "Create a CloudConvert job that imports a remote file URL, converts it, and exports the result via `export/url`.",
    requiredScopes: taskWritePermission,
    followUpActions: ["cloudconvert.wait_for_job", "cloudconvert.get_job"],
    inputSchema: urlConversionJobInputSchema,
    outputSchema: jobWithFilesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_url_conversion_job_and_wait",
    description: "Create a URL-based CloudConvert conversion job and wait synchronously until the job finishes.",
    requiredScopes: [...taskReadPermission, ...taskWritePermission],
    followUpActions: ["cloudconvert.get_job"],
    inputSchema: urlConversionJobInputSchema,
    outputSchema: jobWithFilesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_job",
    description: "Get a single CloudConvert job and include its tasks.",
    requiredScopes: taskReadPermission,
    followUpActions: ["cloudconvert.wait_for_job"],
    inputSchema: idInput("Input payload for getting a CloudConvert job.", "jobId", jobId),
    outputSchema: jobWithFilesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "wait_for_job",
    description:
      "Wait synchronously for a CloudConvert job to finish and return the finished or failed job with tasks.",
    requiredScopes: taskReadPermission,
    inputSchema: idInput("Input payload for waiting on a CloudConvert job.", "jobId", jobId),
    outputSchema: jobWithFilesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_jobs",
    description: "List CloudConvert jobs for the current account.",
    requiredScopes: taskReadPermission,
    inputSchema: s.object(
      "Input payload for listing CloudConvert jobs.",
      {
        status,
        tag: s.nonEmptyString("Optional job tag filter."),
        page,
        perPage,
      },
      { optional: ["status", "tag", "page", "perPage"] },
    ),
    outputSchema: listJobsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_job",
    description: "Delete a CloudConvert job, including all tasks and related data.",
    requiredScopes: taskWritePermission,
    inputSchema: idInput("Input payload for deleting a CloudConvert job.", "jobId", jobId),
    outputSchema: deleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Get a single CloudConvert task by ID.",
    requiredScopes: taskReadPermission,
    followUpActions: ["cloudconvert.wait_for_task"],
    inputSchema: idInput("Input payload for getting a CloudConvert task.", "taskId", taskId),
    outputSchema: taskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "wait_for_task",
    description: "Wait synchronously for a CloudConvert task to finish and return the finished or failed task.",
    requiredScopes: taskReadPermission,
    inputSchema: idInput("Input payload for waiting on a CloudConvert task.", "taskId", taskId),
    outputSchema: taskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List CloudConvert tasks for the current account.",
    requiredScopes: taskReadPermission,
    inputSchema: s.object(
      "Input payload for listing CloudConvert tasks.",
      {
        jobId,
        status,
        operation: s.nonEmptyString("Optional task operation filter."),
        page,
        perPage,
      },
      { optional: ["jobId", "status", "operation", "page", "perPage"] },
    ),
    outputSchema: listTasksOutputSchema,
  }),
  defineProviderAction(service, {
    name: "cancel_task",
    description: "Cancel a CloudConvert task that is still waiting or processing.",
    requiredScopes: taskWritePermission,
    inputSchema: idInput("Input payload for canceling a CloudConvert task.", "taskId", taskId),
    outputSchema: taskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "retry_task",
    description: "Retry a CloudConvert task by creating a new task from the original payload.",
    requiredScopes: taskWritePermission,
    inputSchema: idInput("Input payload for retrying a CloudConvert task.", "taskId", taskId),
    outputSchema: taskOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_task",
    description: "Delete a CloudConvert task, including all related data.",
    requiredScopes: taskWritePermission,
    inputSchema: idInput("Input payload for deleting a CloudConvert task.", "taskId", taskId),
    outputSchema: deleteOutputSchema,
  }),
];

function idInput(description: string, key: string, schema: JsonSchema): JsonSchema {
  return s.object(description, { [key]: schema }, { required: [key] });
}
