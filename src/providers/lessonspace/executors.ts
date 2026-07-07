import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { LessonspaceActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "lessonspace";
const lessonspaceApiBaseUrl = "https://api.thelessonspace.com/v2";
const lessonspaceValidationPath = "/hello/";
const lessonspaceDefaultRequestTimeoutMs = 30_000;

type LessonspacePhase = "validate" | "execute";
type LessonspaceActionHandler = (input: Record<string, unknown>, context: LessonspaceContext) => Promise<unknown>;

interface LessonspaceContext {
  apiKey: string;
  organisationId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface LessonspaceRequestInput {
  path: string;
  method: "GET" | "POST";
  query: Record<string, string | undefined>;
  queryLists?: Record<string, string[] | undefined>;
  body?: Record<string, unknown>;
  phase: LessonspacePhase;
}

export const lessonspaceActionHandlers: Record<LessonspaceActionName, LessonspaceActionHandler> = {
  list_organisation_sessions(input, context) {
    return listOrganisationSessions(input, context);
  },
  get_organisation_session(input, context) {
    return getOrganisationSession(input, context);
  },
  get_session_recording_url(input, context) {
    return getSessionRecordingUrl(input, context);
  },
  create_unified_space(input, context) {
    return createUnifiedSpace(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<LessonspaceContext>({
  service,
  handlers: lessonspaceActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<LessonspaceContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      organisationId: readOrganisationId(credential.values.organisationId, credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: lessonspaceApiBaseUrl,
  auth: {
    type: "api_key_authorization",
    prefix: "Organisation ",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await lessonspaceRequestJson({
      context: {
        apiKey: input.apiKey,
        organisationId: readOrganisationId(input.values.organisationId, undefined),
        fetcher,
        signal,
      },
      path: lessonspaceValidationPath,
      method: "GET",
      query: {},
      phase: "validate",
    });

    const organisationId = readOrganisationId(input.values.organisationId, undefined);

    return {
      profile: {
        accountId: `lessonspace:${organisationId}`,
        displayName: `Lessonspace ${organisationId}`,
      },
      grantedScopes: [],
      metadata: {
        organisationId,
        apiBaseUrl: lessonspaceApiBaseUrl,
        validationEndpoint: lessonspaceValidationPath,
      },
    } satisfies CredentialValidationResult;
  },
};

async function listOrganisationSessions(input: Record<string, unknown>, context: LessonspaceContext): Promise<unknown> {
  const payload = await lessonspaceRequestJson({
    context: {
      ...context,
      organisationId: readOrganisationId(input.organisation_id, { organisationId: context.organisationId }),
    },
    path: `/organisations/${encodeURIComponent(
      readOrganisationId(input.organisation_id, {
        organisationId: context.organisationId,
      }),
    )}/sessions/`,
    method: "GET",
    query: compactObject({
      search: optionalString(input.search),
      page: stringifyOptionalInteger(input.page),
      include_single_user: stringifyOptionalBoolean(input.include_single_user),
      duration_min: stringifyOptionalInteger(input.duration_min),
      duration_max: stringifyOptionalInteger(input.duration_max),
      start_time_after: optionalString(input.start_time_after),
      start_time_before: optionalString(input.start_time_before),
      end_time_after: optionalString(input.end_time_after),
      end_time_before: optionalString(input.end_time_before),
      date_after: optionalString(input.date_after),
      date_before: optionalString(input.date_before),
      launch_id: optionalString(input.launch_id),
      in_progress_only: stringifyOptionalBoolean(input.in_progress_only),
      tags: stringifyOptionalObject(input.tags),
      user_external_id: optionalString(input.user_external_id),
      user_name: optionalString(input.user_name),
    }),
    queryLists: compactObject({
      user: readOptionalStringList(input.user),
      space: readOptionalStringList(input.space),
    }),
    phase: "execute",
  });

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Lessonspace sessions response must be an array", payload);
  }

  return {
    sessions: payload.map((item, index) => normalizeSessionSummary(item, index)),
  };
}

async function getOrganisationSession(input: Record<string, unknown>, context: LessonspaceContext): Promise<unknown> {
  const organisationId = readOrganisationId(input.organisation_id, { organisationId: context.organisationId });
  const sessionUuid = readRequiredTrimmedString(input.session_uuid, "session_uuid");
  const payload = await lessonspaceRequestJson({
    context,
    path: `/organisations/${encodeURIComponent(organisationId)}/sessions/${encodeURIComponent(sessionUuid)}/`,
    method: "GET",
    query: {},
    phase: "execute",
  });

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Lessonspace session response must be an object", payload);
  }

  return {
    session: normalizeSessionDetail(record),
  };
}

async function getSessionRecordingUrl(input: Record<string, unknown>, context: LessonspaceContext): Promise<unknown> {
  const organisationId = readOrganisationId(input.organisation_id, { organisationId: context.organisationId });
  const sessionUuid = readRequiredTrimmedString(input.session_uuid, "session_uuid");
  const payload = await lessonspaceRequestJson({
    context,
    path: `/organisations/${encodeURIComponent(organisationId)}/sessions/${encodeURIComponent(sessionUuid)}/playback/`,
    method: "GET",
    query: {},
    phase: "execute",
  });

  const record = optionalRecord(payload);
  const recordingUrl = optionalString(record?.recording_url);
  if (!recordingUrl) {
    throw new ProviderRequestError(502, "Lessonspace response field recording_url must be a string", payload);
  }

  return {
    recordingUrl,
  };
}

async function createUnifiedSpace(input: Record<string, unknown>, context: LessonspaceContext): Promise<unknown> {
  const payload = (await lessonspaceRequestJson({
    context,
    path: "/spaces/launch/",
    method: "POST",
    query: {},
    body: buildLaunchBody(input),
    phase: "execute",
  })) as { status: number; body: unknown };

  const record = optionalRecord(payload.body);
  if (!record) {
    throw new ProviderRequestError(502, "Lessonspace launch response must be an object", payload);
  }

  return {
    statusCode: payload.status,
    clientUrl: readRequiredResponseString(record.client_url, "client_url"),
    apiBase: readRequiredResponseString(record.api_base, "api_base"),
    roomId: readRequiredResponseString(record.room_id, "room_id"),
    secret: readRequiredResponseString(record.secret, "secret"),
    sessionId: readRequiredResponseString(record.session_id, "session_id"),
    userId: readRequiredResponseInteger(record.user_id, "user_id"),
    roomSettings: optionalRecord(record.room_settings) ?? {},
    raw: record,
  };
}

function buildLaunchBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: readRequiredTrimmedString(input.id, "id"),
    name: optionalString(input.name),
    user: readOptionalPlainObject(input.user, "user"),
    features: readOptionalPlainObject(input.features, "features"),
    invite_url: optionalString(input.invite_url),
    resource_url: optionalString(input.resource_url),
    tags: readOptionalPlainObject(input.tags, "tags"),
    space_tags: readOptionalPlainObject(input.space_tags, "space_tags"),
    holodeck_parameters: readOptionalPlainObject(input.holodeck_parameters, "holodeck_parameters"),
    auth_external: readOptionalPlainObject(input.auth_external, "auth_external"),
  });
}

async function lessonspaceRequestJson(
  input: LessonspaceRequestInput & { context: LessonspaceContext },
): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, lessonspaceDefaultRequestTimeoutMs);

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Organisation ${input.context.apiKey}`,
      "user-agent": providerUserAgent,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }

    const response = await input.context.fetcher(buildLessonspaceUrl(input), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readLessonspacePayload(response);

    if (!response.ok) {
      throw createLessonspaceError(response.status, payload, input.phase);
    }

    return input.method === "POST" ? { status: response.status, body: payload } : payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Lessonspace request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Lessonspace request failed: ${error.message}` : "Lessonspace request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildLessonspaceUrl(input: {
  path: string;
  query: Record<string, string | undefined>;
  queryLists?: Record<string, string[] | undefined>;
}): URL {
  const normalizedPath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(normalizedPath, `${lessonspaceApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  for (const [key, values] of Object.entries(input.queryLists ?? {})) {
    for (const value of values ?? []) {
      url.searchParams.append(key, value);
    }
  }
  return url;
}

async function readLessonspacePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Lessonspace returned invalid JSON");
  }
}

function createLessonspaceError(status: number, payload: unknown, phase: LessonspacePhase): ProviderRequestError {
  const message = extractLessonspaceErrorMessage(payload) ?? `Lessonspace request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractLessonspaceErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.detail) ?? optionalString(record.message);
}

function normalizeSessionSummary(value: unknown, index: number): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Lessonspace sessions[${index}] response item must be an object`, value);
  }

  return {
    id: readRequiredResponseInteger(record.id, "id"),
    uuid: readRequiredResponseString(record.uuid, "uuid"),
    name: optionalString(record.name) ?? null,
    startTime: optionalString(record.start_time) ?? null,
    endTime: optionalString(record.end_time) ?? null,
    raw: record,
  };
}

function normalizeSessionDetail(record: Record<string, unknown>): Record<string, unknown> {
  const space = optionalRecord(record.space);

  return {
    id: readRequiredResponseInteger(record.id, "id"),
    uuid: readRequiredResponseString(record.uuid, "uuid"),
    name: optionalString(record.name) ?? null,
    startTime: optionalString(record.start_time) ?? null,
    endTime: optionalString(record.end_time) ?? null,
    summary: optionalString(record.summary) ?? null,
    recordingAvailable: typeof record.recording_available === "boolean" ? record.recording_available : null,
    playbackUrl: optionalString(record.playback_url) ?? null,
    space: space
      ? {
          id: optionalString(space.id) ?? null,
          slug: optionalString(space.slug) ?? null,
        }
      : null,
    raw: record,
  };
}

function readOrganisationId(inputValue: unknown, metadata: Record<string, unknown> | undefined): string {
  const direct = optionalString(inputValue);
  if (direct) {
    return direct;
  }

  const metadataValue = optionalString(metadata?.organisationId);
  if (metadataValue) {
    return metadataValue;
  }

  throw new ProviderRequestError(
    400,
    "lessonspace requires organisation_id in action input or organisationId in credential metadata",
  );
}

function readRequiredTrimmedString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}

function readRequiredResponseString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new ProviderRequestError(502, `Lessonspace response field ${fieldName} must be a string`);
  }
  return result;
}

function readRequiredResponseInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `Lessonspace response field ${fieldName} must be an integer`);
  }
  return value;
}

function readOptionalStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined);
}

function stringifyOptionalBoolean(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}

function stringifyOptionalInteger(value: unknown): string | undefined {
  return optionalInteger(value) === undefined ? undefined : String(value);
}

function stringifyOptionalObject(value: unknown): string | undefined {
  const objectValue = optionalRecord(value);
  return objectValue ? JSON.stringify(objectValue) : undefined;
}

function readOptionalPlainObject(value: unknown, fieldName: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  try {
    return requiredRecord(value, fieldName, (message) => new ProviderRequestError(400, message));
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
}
