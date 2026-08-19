import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalIntegerLike, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const cloudconvertApiBaseUrl = "https://api.cloudconvert.com/v2";
const cloudconvertSyncApiBaseUrl = "https://sync.api.cloudconvert.com/v2";
const cloudconvertDefaultRequestTimeoutMs = 30_000;
const cloudconvertWaitRequestTimeoutMs = 300_000;
const cloudconvertJobTasksInclude = ["tasks"];
const reservedConvertTaskOptionKeys = new Set([
  "operation",
  "input",
  "input_format",
  "output_format",
  "engine",
  "engine_version",
]);

type CloudconvertRequestPhase = "validate" | "execute";
type CloudconvertQueryValue = string | number | boolean | string[] | undefined;
type CloudconvertActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface CloudconvertRequestInput {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: CloudconvertRequestPhase;
  signal?: AbortSignal;
  apiBaseUrl?: string;
  timeoutMs?: number;
  method?: string;
  query?: Record<string, CloudconvertQueryValue>;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}

export const cloudconvertActionHandlers: ProviderActionHandlers<"cloudconvert", CloudconvertActionHandler> = {
  get_current_user(input, context) {
    return getCurrentUser(input, context);
  },
  list_conversion_types(input, context) {
    return listConversionTypes(input, context);
  },
  create_url_conversion_job(input, context) {
    return createUrlConversionJob(input, context);
  },
  create_url_conversion_job_and_wait(input, context) {
    return createUrlConversionJobAndWait(input, context);
  },
  get_job(input, context) {
    return getJob(input, context);
  },
  wait_for_job(input, context) {
    return waitForJob(input, context);
  },
  list_jobs(input, context) {
    return listJobs(input, context);
  },
  delete_job(input, context) {
    return deleteJob(input, context);
  },
  get_task(input, context) {
    return getTask(input, context);
  },
  wait_for_task(input, context) {
    return waitForTask(input, context);
  },
  list_tasks(input, context) {
    return listTasks(input, context);
  },
  cancel_task(input, context) {
    return cancelTask(input, context);
  },
  retry_task(input, context) {
    return retryTask(input, context);
  },
  delete_task(input, context) {
    return deleteTask(input, context);
  },
};

export async function validateCloudconvertCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = await requestCloudconvertData({
    apiKey,
    path: "/users/me",
    fetcher,
    signal,
    phase: "validate",
  });
  const providerAccountId = requireResponseIdentifier(user.id, "id");
  const username = optionalString(user.username);
  const email = optionalString(user.email);
  const credits = optionalNumber(user.credits);
  const grantedScopes = parseCloudconvertApiKeyScopes(apiKey);

  return {
    profile: {
      accountId: providerAccountId,
      displayName: pickFirstNonEmptyString(username, email) ?? "CloudConvert User",
      grantedScopes,
    },
    grantedScopes,
    metadata: compactObject({
      validationEndpoint: "/users/me",
      username,
      email,
      credits,
    }),
  };
}

async function getCurrentUser(_input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const user = await requestCloudconvertData({
    apiKey: context.apiKey,
    path: "/users/me",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { user };
}

async function listConversionTypes(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { items } = await requestCloudconvertCollection({
    apiKey: context.apiKey,
    path: "/convert/formats",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: buildConversionTypeQuery(input),
  });
  return {
    conversionTypes: items,
  };
}

async function createUrlConversionJob(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const job = await requestCloudconvertData({
    apiKey: context.apiKey,
    path: "/jobs",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    method: "POST",
    body: buildUrlConversionJobPayload(input),
  });
  return normalizeJobWithFiles(job);
}

async function createUrlConversionJobAndWait(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const job = await requestCloudconvertData({
    apiKey: context.apiKey,
    path: "/jobs",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    method: "POST",
    body: buildUrlConversionJobPayload(input),
  });
  const jobId = requireResponseIdentifier(job.id, "id");
  const finishedJob = await waitForJobById(context.apiKey, jobId, context.fetcher, context.signal);
  return normalizeJobWithFiles(finishedJob);
}

async function getJob(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const jobId = requireInputString(input.jobId, "jobId");
  const job = await getJobById(context.apiKey, jobId, context.fetcher, context.signal);
  return normalizeJobWithFiles(job);
}

async function waitForJob(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const jobId = requireInputString(input.jobId, "jobId");
  const job = await waitForJobById(context.apiKey, jobId, context.fetcher, context.signal);
  return normalizeJobWithFiles(job);
}

async function listJobs(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { items, links, meta } = await requestCloudconvertCollection({
    apiKey: context.apiKey,
    path: "/jobs",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: compactObject({
      "filter[status]": optionalString(input.status),
      "filter[tag]": optionalString(input.tag),
      page: readOptionalPositiveInteger(input.page, "page"),
      per_page: readOptionalPositiveInteger(input.perPage, "perPage"),
    }),
  });
  return { jobs: items, links, meta };
}

async function deleteJob(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const jobId = requireInputString(input.jobId, "jobId");
  await requestCloudconvertNoContent({
    apiKey: context.apiKey,
    path: `/jobs/${encodeURIComponent(jobId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    method: "DELETE",
    notFoundAsInvalidInput: true,
  });
  return { deleted: true, id: jobId };
}

async function getTask(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const taskId = requireInputString(input.taskId, "taskId");
  const task = await getTaskById(context.apiKey, taskId, context.fetcher, context.signal);
  return { task };
}

async function waitForTask(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const taskId = requireInputString(input.taskId, "taskId");
  const task = await waitForTaskById(context.apiKey, taskId, context.fetcher, context.signal);
  return { task };
}

async function listTasks(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const { items, links, meta } = await requestCloudconvertCollection({
    apiKey: context.apiKey,
    path: "/tasks",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: compactObject({
      "filter[job_id]": optionalString(input.jobId),
      "filter[status]": optionalString(input.status),
      "filter[operation]": optionalString(input.operation),
      page: readOptionalPositiveInteger(input.page, "page"),
      per_page: readOptionalPositiveInteger(input.perPage, "perPage"),
    }),
  });
  return { tasks: items, links, meta };
}

async function cancelTask(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const taskId = requireInputString(input.taskId, "taskId");
  const task = await requestCloudconvertData({
    apiKey: context.apiKey,
    path: `/tasks/${encodeURIComponent(taskId)}/cancel`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    method: "POST",
    notFoundAsInvalidInput: true,
  });
  return { task };
}

async function retryTask(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const taskId = requireInputString(input.taskId, "taskId");
  const task = await requestCloudconvertData({
    apiKey: context.apiKey,
    path: `/tasks/${encodeURIComponent(taskId)}/retry`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    method: "POST",
    notFoundAsInvalidInput: true,
  });
  return { task };
}

async function deleteTask(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const taskId = requireInputString(input.taskId, "taskId");
  await requestCloudconvertNoContent({
    apiKey: context.apiKey,
    path: `/tasks/${encodeURIComponent(taskId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    method: "DELETE",
    notFoundAsInvalidInput: true,
  });
  return { deleted: true, id: taskId };
}

function getJobById(
  apiKey: string,
  jobId: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return requestCloudconvertData({
    apiKey,
    path: `/jobs/${encodeURIComponent(jobId)}`,
    fetcher,
    signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
    query: { include: cloudconvertJobTasksInclude },
  });
}

function waitForJobById(
  apiKey: string,
  jobId: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return requestCloudconvertData({
    apiKey,
    path: `/jobs/${encodeURIComponent(jobId)}`,
    fetcher,
    signal,
    phase: "execute",
    apiBaseUrl: cloudconvertSyncApiBaseUrl,
    timeoutMs: cloudconvertWaitRequestTimeoutMs,
    notFoundAsInvalidInput: true,
    query: { include: cloudconvertJobTasksInclude },
  });
}

function getTaskById(
  apiKey: string,
  taskId: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return requestCloudconvertData({
    apiKey,
    path: `/tasks/${encodeURIComponent(taskId)}`,
    fetcher,
    signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

function waitForTaskById(
  apiKey: string,
  taskId: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return requestCloudconvertData({
    apiKey,
    path: `/tasks/${encodeURIComponent(taskId)}`,
    fetcher,
    signal,
    phase: "execute",
    apiBaseUrl: cloudconvertSyncApiBaseUrl,
    timeoutMs: cloudconvertWaitRequestTimeoutMs,
    notFoundAsInvalidInput: true,
  });
}

function buildConversionTypeQuery(input: Record<string, unknown>): Record<string, CloudconvertQueryValue> {
  const include: string[] = [];
  if (input.includeOptions === true) {
    include.push("options");
  }
  if (input.includeEngineVersions === true) {
    include.push("engine_versions");
  }
  return compactObject({
    "filter[input_format]": optionalString(input.inputFormat),
    "filter[output_format]": optionalString(input.outputFormat),
    "filter[engine]": optionalString(input.engine),
    "filter[engine_version]": optionalString(input.engineVersion),
    alternatives: typeof input.alternatives === "boolean" ? input.alternatives : undefined,
    include: include.length > 0 ? include : undefined,
  });
}

function buildUrlConversionJobPayload(input: Record<string, unknown>): Record<string, unknown> {
  const sourceUrl = assertPublicHttpUrl(requireInputString(input.sourceUrl, "sourceUrl"), {
    fieldName: "sourceUrl",
    createError: (message) => new ProviderRequestError(400, message),
  }).toString();
  const outputFormat = requireInputString(input.outputFormat, "outputFormat");
  const conversionOptions = optionalRecord(input.conversionOptions) ?? {};
  for (const key of Object.keys(conversionOptions)) {
    if (reservedConvertTaskOptionKeys.has(key)) {
      throw new ProviderRequestError(400, `conversionOptions must not override reserved convert task field: ${key}`);
    }
  }
  const sourceHeaders = optionalRecord(input.sourceHeaders);
  return compactObject({
    tasks: {
      "import-source": compactObject({
        operation: "import/url",
        url: sourceUrl,
        filename: optionalString(input.sourceFilename),
        headers: sourceHeaders,
      }),
      "convert-file": compactObject({
        operation: "convert",
        input: ["import-source"],
        input_format: optionalString(input.inputFormat),
        output_format: outputFormat,
        engine: optionalString(input.engine),
        engine_version: optionalString(input.engineVersion),
        ...conversionOptions,
      }),
      "export-file": compactObject({
        operation: "export/url",
        input: ["convert-file"],
        filename: optionalString(input.outputFilename),
        inline: typeof input.inline === "boolean" ? input.inline : undefined,
        archive_multiple_files:
          typeof input.archiveMultipleFiles === "boolean" ? input.archiveMultipleFiles : undefined,
      }),
    },
    tag: optionalString(input.jobTag),
    webhook_url: optionalString(input.webhookUrl),
  });
}

function normalizeJobWithFiles(job: Record<string, unknown>): Record<string, unknown> {
  return {
    job,
    files: extractExportedFilesFromJob(job),
  };
}

function extractExportedFilesFromJob(job: Record<string, unknown>): Array<{ filename: string; url: string }> {
  const tasks = Array.isArray(job.tasks) ? job.tasks : [];
  const files: Array<{ filename: string; url: string }> = [];
  for (const task of tasks) {
    const taskRecord = optionalRecord(task);
    if (!taskRecord || optionalString(taskRecord.operation) !== "export/url") {
      continue;
    }
    const result = optionalRecord(taskRecord.result);
    const exportedFiles = Array.isArray(result?.files) ? result.files : [];
    for (const file of exportedFiles) {
      const fileRecord = optionalRecord(file);
      const url = optionalString(fileRecord?.url);
      if (!url) {
        continue;
      }
      const filename =
        optionalString(fileRecord?.filename) ??
        optionalString(fileRecord?.name) ??
        guessFilenameFromUrl(url) ??
        "output";
      files.push({ filename, url });
    }
  }
  return files;
}

function guessFilenameFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split("/").at(-1);
    return filename && filename.length > 0 ? filename : undefined;
  } catch {
    return undefined;
  }
}

async function requestCloudconvertCollection(input: CloudconvertRequestInput): Promise<{
  items: unknown[];
  links: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
}> {
  const payload = await requestCloudconvertJson(input);
  const envelope = requireResponseObject(payload, "collection response");
  if (!Array.isArray(envelope.data)) {
    throw new ProviderRequestError(502, "CloudConvert collection response must be an array");
  }
  return {
    items: envelope.data,
    links: optionalRecord(envelope.links) ?? null,
    meta: optionalRecord(envelope.meta) ?? null,
  };
}

async function requestCloudconvertData(input: CloudconvertRequestInput): Promise<Record<string, unknown>> {
  const payload = await requestCloudconvertJson(input);
  const envelope = requireResponseObject(payload, "response envelope");
  const data = optionalRecord(envelope.data);
  if (!data) {
    throw new ProviderRequestError(502, "CloudConvert response did not include a data object");
  }
  return data;
}

async function requestCloudconvertNoContent(input: CloudconvertRequestInput): Promise<void> {
  const response = await cloudconvertFetch(input);
  if (!response.ok) {
    throw await toCloudconvertError(response, input.phase, input.notFoundAsInvalidInput);
  }
}

async function requestCloudconvertJson(input: CloudconvertRequestInput): Promise<unknown> {
  const response = await cloudconvertFetch(input);
  if (!response.ok) {
    throw await toCloudconvertError(response, input.phase, input.notFoundAsInvalidInput);
  }
  const payload = await readCloudconvertPayload(response);
  if (payload == null) {
    throw new ProviderRequestError(502, "CloudConvert returned an empty response body");
  }
  return payload;
}

async function cloudconvertFetch(input: CloudconvertRequestInput): Promise<Response> {
  const url = new URL(`${input.apiBaseUrl ?? cloudconvertApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
    "user-agent": providerUserAgent,
  });
  let body: string | undefined;
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.body);
  }
  const timeout = createProviderTimeout(input.signal, input.timeoutMs ?? cloudconvertDefaultRequestTimeoutMs);
  try {
    return await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body,
      signal: timeout.signal,
    });
  } catch (error) {
    if (isAbortLikeError(error) && timeout.didTimeout()) {
      throw new ProviderRequestError(
        504,
        `CloudConvert ${input.path} request timed out after ${Math.max(
          1,
          Math.ceil((input.timeoutMs ?? cloudconvertDefaultRequestTimeoutMs) / 1000),
        )} seconds`,
      );
    }
    throw new ProviderRequestError(
      502,
      `CloudConvert ${input.path} request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    timeout.cleanup();
  }
}

async function toCloudconvertError(
  response: Response,
  phase: CloudconvertRequestPhase,
  notFoundAsInvalidInput?: boolean,
): Promise<ProviderRequestError> {
  const payload = await readCloudconvertPayload(response);
  const message = extractCloudconvertErrorMessage(payload, response.status);
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(response.status || 500, message);
}

async function readCloudconvertPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractCloudconvertErrorMessage(payload: unknown, status: number): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return `CloudConvert request failed with status ${status}`;
  }
  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) {
    return message;
  }
  const errors = record.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const firstError = errors[0];
    if (typeof firstError === "string" && firstError.length > 0) {
      return firstError;
    }
    const firstErrorRecord = optionalRecord(firstError);
    const detail = optionalString(firstErrorRecord?.message) ?? optionalString(firstErrorRecord?.detail);
    if (detail) {
      return detail;
    }
  }
  return `CloudConvert request failed with status ${status}`;
}

function requireInputString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function requireResponseObject(value: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `CloudConvert ${context} must be an object`);
  }
  return record;
}

function requireResponseIdentifier(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  throw new ProviderRequestError(502, `CloudConvert response missing ${fieldName}`);
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value == null) {
    return undefined;
  }
  const parsed = optionalIntegerLike(value, fieldName, (message) => new ProviderRequestError(400, message));
  if (parsed === undefined || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function pickFirstNonEmptyString(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function parseCloudconvertApiKeyScopes(apiKey: string): string[] {
  const payloadSegment = apiKey.split(".")[1];
  if (!payloadSegment) {
    return [];
  }
  try {
    const payloadJson = Buffer.from(payloadSegment, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as { scopes?: unknown };
    if (!Array.isArray(payload.scopes)) {
      return [];
    }
    return payload.scopes.filter((scope): scope is string => typeof scope === "string");
  } catch {
    return [];
  }
}
