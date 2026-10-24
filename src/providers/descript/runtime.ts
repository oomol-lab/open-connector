import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyActionRequest } from "../provider-executors.ts";
import type { ProviderActionName } from "../provider-executors.ts";

import {
  compactObject,
  looseArray,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const descriptApiBaseUrl = "https://descriptapi.com/v1/";

interface DescriptRequestOptions {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, unknown>;
  body?: unknown;
}

export async function validateDescriptCredential(
  apiKey: string,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const payload = await requestDescriptJson({
    apiKey,
    path: "status",
    fetcher,
    phase: "validate",
  });
  const status = requiredResponseRecord(payload, "Descript status response");
  const driveId = requiredString(status.drive_id, "Descript status drive_id", providerResponseError);
  const driveName = optionalString(status.drive_name);
  return {
    profile: { accountId: `descript:drive:${driveId}`, displayName: driveName ?? `Descript Drive ${driveId}` },
    metadata: compactObject({ driveId, apiVersion: optionalString(status.api_version) }),
  };
}

export async function executeDescriptAction(input: ApiKeyActionRequest, fetcher: typeof fetch): Promise<unknown> {
  const apiKey = input.apiKey;
  switch (input.actionName as ProviderActionName<"descript">) {
    case "list_projects": {
      const raw = requiredResponseRecord(
        await requestDescriptJson({
          apiKey,
          path: "projects",
          query: mapQuery(input.input),
          fetcher,
          phase: "execute",
        }),
        "Descript projects response",
      );
      return {
        projects: looseArray(raw.data),
        pagination: optionalRecord(raw.pagination) ?? {},
        raw,
      };
    }
    case "get_project": {
      const raw = requiredResponseRecord(
        await requestDescriptJson({
          apiKey,
          path: `projects/${encodeURIComponent(requiredInputString(input.input.projectId, "projectId"))}`,
          fetcher,
          phase: "execute",
        }),
        "Descript project response",
      );
      return { project: raw };
    }
    case "list_jobs": {
      const raw = requiredResponseRecord(
        await requestDescriptJson({
          apiKey,
          path: "jobs",
          query: mapQuery(input.input),
          fetcher,
          phase: "execute",
        }),
        "Descript jobs response",
      );
      return {
        jobs: looseArray(raw.data),
        pagination: optionalRecord(raw.pagination) ?? {},
        raw,
      };
    }
    case "get_job": {
      const job = requiredResponseRecord(
        await requestDescriptJson({
          apiKey,
          path: `jobs/${encodeURIComponent(requiredInputString(input.input.jobId, "jobId"))}`,
          fetcher,
          phase: "execute",
        }),
        "Descript job response",
      );
      return { status: normalizeJobStatus(job), job };
    }
    case "cancel_job":
      await requestDescriptJson({
        apiKey,
        path: `jobs/${encodeURIComponent(requiredInputString(input.input.jobId, "jobId"))}`,
        method: "DELETE",
        fetcher,
        phase: "execute",
      });
      return { cancelled: true };
    case "list_agent_models": {
      const raw = requiredResponseRecord(
        await requestDescriptJson({ apiKey, path: "agent/models", fetcher, phase: "execute" }),
        "Descript agent models response",
      );
      return {
        availableModels: looseArray(raw.availableModels),
        aliases: looseArray(raw.aliases),
        raw,
      };
    }
    case "prompt_agent":
      assertExactlyOneProjectTarget(input.input);
      if (input.input.compositionId !== undefined && input.input.projectId === undefined) {
        throw new ProviderRequestError(400, "compositionId requires an existing projectId");
      }
      return submitJob(apiKey, "jobs/agent", mapBody(input.input), fetcher);
    case "import_media":
      assertExactlyOneProjectTarget(input.input);
      return submitJob(apiKey, "jobs/import/project_media", buildImportBody(input.input), fetcher);
    case "publish_project":
      if (input.input.mediaType === "Audio" && input.input.resolution !== undefined) {
        throw new ProviderRequestError(400, "resolution is only valid when mediaType is Video");
      }
      return submitJob(apiKey, "jobs/publish", mapBody(input.input), fetcher);
  }
}

function assertExactlyOneProjectTarget(input: Record<string, unknown>) {
  const projectId = optionalString(input.projectId);
  const projectName = optionalString(input.projectName);
  if ((projectId ? 1 : 0) + (projectName ? 1 : 0) !== 1) {
    throw new ProviderRequestError(400, "exactly one of projectId or projectName is required");
  }
}

function buildImportBody(input: Record<string, unknown>) {
  const media = looseArray(input.media);
  const mediaNames = new Set<string>();
  const addMediaEntries: Array<[string, { url: string }]> = [];
  for (const item of media) {
    const record = requiredRecord(item, "media item", providerInputError);
    const name = requiredInputString(record.name, "media.name");
    if (mediaNames.has(name)) {
      throw new ProviderRequestError(400, `media contains duplicate name: ${name}`);
    }
    mediaNames.add(name);
    addMediaEntries.push([name, { url: requiredInputString(record.url, "media.url") }]);
  }
  return compactObject({
    ...mapBody(input),
    add_media: Object.fromEntries(addMediaEntries),
    add_compositions: input.compositions,
    media: undefined,
    compositions: undefined,
  });
}

async function submitJob(apiKey: string, path: string, body: unknown, fetcher: typeof fetch) {
  const raw = requiredResponseRecord(
    await requestDescriptJson({ apiKey, path, method: "POST", body, fetcher, phase: "execute" }),
    "Descript job submission response",
  );
  return {
    jobId: requiredString(raw.job_id, "Descript submission job_id", providerResponseError),
    projectId: requiredString(raw.project_id, "Descript submission project_id", providerResponseError),
    projectUrl: requiredString(raw.project_url, "Descript submission project_url", providerResponseError),
    raw,
  };
}

function normalizeJobStatus(job: Record<string, unknown>) {
  const state = optionalString(job.job_state);
  if (state === "queued" || state === "running") return state;
  const result = optionalRecord(job.result);
  const resultStatus = optionalString(result?.status);
  if (resultStatus === "success") return "succeeded";
  if (resultStatus === "error") return "failed";
  if (state === "cancelled" || resultStatus === "cancelled") return "cancelled";
  throw new ProviderRequestError(502, "Descript job response has an unknown terminal state");
}

const inputToApiField: Record<string, string> = {
  projectId: "project_id",
  projectName: "project_name",
  compositionId: "composition_id",
  teamAccess: "team_access",
  callbackUrl: "callback_url",
  folderName: "folder_name",
  mediaType: "media_type",
  accessLevel: "access_level",
  folderPath: "folder_path",
  createdBy: "created_by",
  createdAfter: "created_after",
  createdBefore: "created_before",
  updatedAfter: "updated_after",
  updatedBefore: "updated_before",
};

function mapBody(input: Record<string, unknown>) {
  return mapFields(input);
}

function mapQuery(input: Record<string, unknown>) {
  return mapFields(input);
}

function mapFields(input: Record<string, unknown>) {
  return compactObject(
    Object.fromEntries(Object.entries(input).map(([key, value]) => [inputToApiField[key] ?? key, value])),
  );
}

async function requestDescriptJson(input: DescriptRequestOptions) {
  return runProviderRequest({ label: "Descript" }, async (signal) => {
    const url = new URL(input.path, descriptApiBaseUrl);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const headers = new Headers({
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
    });
    if (input.body !== undefined) headers.set("content-type", "application/json");
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = await readDescriptPayload(response);
    if (!response.ok) throw createDescriptError(response, payload, input.phase);
    return payload;
  });
}

async function readDescriptPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Descript returned invalid JSON");
  }
}

function createDescriptError(response: Response, payload: unknown, phase: "validate" | "execute") {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `Descript request failed with status ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && response.status === 401 && record?.error === "unauthorized")
    return providerInputError(message);
  if (phase === "execute" && response.status === 401 && record?.error === "unauthorized")
    return new ProviderRequestError(401, message);
  if (response.status === 400 || response.status === 404 || response.status === 422) return providerInputError(message);
  return new ProviderRequestError(response.status || 500, message);
}
