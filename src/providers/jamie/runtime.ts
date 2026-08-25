import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const jamieApiBaseUrl = "https://beta-api.meetjamie.ai";

type JamieKeyScope = "personal" | "workspace";

interface JamieContext {
  apiKey: string;
  keyScope: JamieKeyScope;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const jamieActionHandlers: ProviderActionHandlers<"jamie", ProviderRuntimeHandler<JamieContext>> = {
  async list_meetings(input, context) {
    assertScopeFilterCompatibility("list_meetings", input, context.keyScope);
    const payload = await jamieGetJson(
      context,
      routeFor(context.keyScope, "meetings.list"),
      buildListMeetingsInput(input),
    );
    return {
      meetings: readArray(payload, "meetings", "Jamie meetings"),
      nextCursor: readNullableStringProperty(payload, "nextCursor"),
    };
  },
  async get_meeting(input, context) {
    const payload = await jamieGetJson(context, routeFor(context.keyScope, "meetings.get"), {
      meetingId: readRequiredString(input.meetingId, "meetingId"),
    });
    return { meeting: payload };
  },
  async list_tasks(input, context) {
    assertScopeFilterCompatibility("list_tasks", input, context.keyScope);
    const payload = await jamieGetJson(context, routeFor(context.keyScope, "tasks.list"), buildListTasksInput(input));
    return {
      tasks: readArray(payload, "tasks", "Jamie tasks"),
      nextCursor: readNullableStringProperty(payload, "nextCursor"),
    };
  },
  async search_meetings(input, context) {
    requirePersonalScope(context.keyScope, "search_meetings");
    const payload = await jamieGetJson(context, routeFor(context.keyScope, "meetings.search"), {
      query: readRequiredString(input.query, "query"),
      ...compactObject({
        startDate: optionalString(input.startDate),
        endDate: optionalString(input.endDate),
      }),
    });
    return { results: readArray(payload, "results", "Jamie search results") };
  },
  async list_tags(_input, context) {
    requirePersonalScope(context.keyScope, "list_tags");
    const payload = await jamieGetJson(context, routeFor(context.keyScope, "tags.list"));
    return { tags: readArray(payload, "tags", "Jamie tags") };
  },
};

export async function validateJamieCredential(
  input: { apiKey: string; values: Record<string, string> },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const keyScope = readJamieKeyScope(input.values.keyScope);
  const validationEndpoint = routeFor(keyScope, "meetings.list");
  await jamieGetJson(
    {
      apiKey: input.apiKey,
      keyScope,
      fetcher: options.fetcher,
      signal: options.signal,
    },
    validationEndpoint,
    {
      limit: 1,
    },
    "validate",
  );

  return {
    profile: {
      accountId: `jamie:${keyScope}`,
      displayName: keyScope === "workspace" ? "Jamie Workspace API Key" : "Jamie Personal API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: jamieApiBaseUrl,
      keyScope,
      validationEndpoint,
    },
  };
}

function buildListMeetingsInput(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    limit: optionalInteger(input.limit),
    cursor: optionalString(input.cursor),
    startDate: optionalString(input.startDate),
    endDate: optionalString(input.endDate),
    userEmail: optionalString(input.userEmail),
    tag: optionalString(input.tag),
  });
}

function buildListTasksInput(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    limit: optionalInteger(input.limit),
    cursor: optionalString(input.cursor),
    startDate: optionalString(input.startDate),
    endDate: optionalString(input.endDate),
    userEmail: optionalString(input.userEmail),
    completed: optionalBoolean(input.completed),
    meetingId: optionalString(input.meetingId),
  });
}

async function jamieGetJson(
  context: JamieContext,
  path: string,
  input?: Record<string, unknown>,
  mode: "validate" | "execute" = "execute",
): Promise<unknown> {
  const url = new URL(path, jamieApiBaseUrl);
  if (input && Object.keys(input).length > 0) {
    url.searchParams.set("input", JSON.stringify({ json: input }));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
      },
      signal: context.signal,
    });
    payload = await readJamiePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Jamie request failed: ${error.message}` : "Jamie request failed",
    );
  }

  if (!response.ok) {
    throw createJamieError(response.status, payload, mode);
  }

  return readJamieResultJson(payload);
}

async function readJamiePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Invalid Jamie response JSON: ${error.message}` : "Invalid Jamie response JSON",
    );
  }
}

function readJamieResultJson(payload: unknown): unknown {
  const payloadObject = optionalRecord(payload);
  const result = optionalRecord(payloadObject?.result);
  const data = optionalRecord(result?.data);
  const json = data?.json;
  if (json === undefined) {
    throw new ProviderRequestError(502, "Jamie response missing result.data.json");
  }
  return json;
}

function createJamieError(status: number, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const message = readJamieErrorMessage(payload) ?? `Jamie request failed with status ${status}`;

  if (status === 400 || status === 404) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(status, message, payload);
}

function readJamieErrorMessage(payload: unknown): string | undefined {
  const payloadObject = optionalRecord(payload);
  return (
    optionalString(payloadObject?.error) ??
    optionalString(payloadObject?.message) ??
    optionalString(optionalRecord(payloadObject?.error)?.message)
  );
}

export function readJamieKeyScope(value: unknown): JamieKeyScope {
  const normalized = optionalString(value)?.toLowerCase();
  if (normalized === "personal" || normalized === "workspace") {
    return normalized;
  }

  throw new ProviderRequestError(400, "Jamie keyScope must be personal or workspace");
}

function routeFor(keyScope: JamieKeyScope, endpoint: string): string {
  const routeSet = keyScope === "personal" ? "me" : "workspace";
  return `/v1/${routeSet}/${endpoint}`;
}

function assertScopeFilterCompatibility(
  actionName: "list_meetings" | "list_tasks",
  input: Record<string, unknown>,
  keyScope: JamieKeyScope,
): void {
  if (keyScope === "personal" && input.userEmail !== undefined) {
    throw new ProviderRequestError(400, "Jamie userEmail filter requires a workspace API key");
  }

  if (actionName === "list_meetings" && keyScope === "workspace" && input.tag !== undefined) {
    throw new ProviderRequestError(400, "Jamie tag filter requires a personal API key");
  }
}

function requirePersonalScope(keyScope: JamieKeyScope, actionName: "search_meetings" | "list_tags"): void {
  if (keyScope !== "personal") {
    throw new ProviderRequestError(400, `Jamie ${actionName} requires a personal API key`);
  }
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `Jamie ${fieldName} is required`);
  }
  return text;
}

function readArray(payload: unknown, key: string, label: string): unknown[] {
  const payloadObject = optionalRecord(payload);
  const value = payloadObject?.[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }
  return value;
}

function readNullableStringProperty(payload: unknown, key: string): string | null {
  const payloadObject = optionalRecord(payload);
  const value = payloadObject?.[key];
  if (value === undefined || value === null) {
    return null;
  }
  const text = optionalString(value);
  if (text === undefined) {
    throw new ProviderRequestError(502, `Jamie ${key} must be a string or null`);
  }
  return text;
}
