import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BeeminderActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const beeminderApiBaseUrl = "https://www.beeminder.com/api/v1";
const beeminderDefaultRequestTimeoutMs = 30_000;

type BeeminderPhase = "validate" | "execute";
type BeeminderContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type BeeminderActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const beeminderActionHandlers: Record<BeeminderActionName, BeeminderActionHandler> = {
  async get_user(input, context) {
    const payload = await requestBeeminderJson({
      method: "GET",
      path: `/users/${encodePathSegment(optionalString(input.username) ?? "me")}.json`,
      query: compactObject({
        associations: readOptionalBooleanString(input.associations),
        diff_since: readOptionalIntegerString(input.diff_since),
        skinny: readOptionalBooleanString(input.skinny),
        datapoints_count: readOptionalIntegerString(input.datapoints_count),
      }),
      context,
      phase: "execute",
    });

    return {
      user: normalizeUser(requirePayloadObject(payload, "Beeminder returned an invalid user")),
    };
  },
  async list_goals(input, context) {
    const payload = await requestBeeminderJson({
      method: "GET",
      path: `/users/${encodePathSegment(readRequiredString(input.username, "username"))}/goals.json`,
      query: {},
      context,
      phase: "execute",
    });

    return { goals: normalizeGoalList(payload) };
  },
  async list_archived_goals(input, context) {
    const payload = await requestBeeminderJson({
      method: "GET",
      path: `/users/${encodePathSegment(readRequiredString(input.username, "username"))}/goals/archived.json`,
      query: {},
      context,
      phase: "execute",
    });

    return { goals: normalizeGoalList(payload) };
  },
  async get_goal(input, context) {
    const payload = await requestBeeminderJson({
      method: "GET",
      path: `/users/${encodePathSegment(readRequiredString(input.username, "username"))}/goals/${encodePathSegment(readRequiredString(input.goal_slug, "goal_slug"))}.json`,
      query: compactObject({
        datapoints: readOptionalBooleanString(input.datapoints),
      }),
      context,
      phase: "execute",
    });

    return {
      goal: normalizeGoal(requirePayloadObject(payload, "Beeminder returned an invalid goal")),
    };
  },
  async list_datapoints(input, context) {
    const payload = await requestBeeminderJson({
      method: "GET",
      path: `/users/${encodePathSegment(readRequiredString(input.username, "username"))}/goals/${encodePathSegment(readRequiredString(input.goal_slug, "goal_slug"))}/datapoints.json`,
      query: compactObject({
        count: readOptionalIntegerString(input.count),
        page: readOptionalIntegerString(input.page),
        per: readOptionalIntegerString(input.per),
      }),
      context,
      phase: "execute",
    });

    return { datapoints: normalizeDatapointList(payload) };
  },
  async create_datapoint(input, context) {
    const payload = await requestBeeminderJson({
      method: "POST",
      path: `/users/${encodePathSegment(readRequiredString(input.username, "username"))}/goals/${encodePathSegment(readRequiredString(input.goal_slug, "goal_slug"))}/datapoints.json`,
      form: compactObject({
        value: String(readRequiredNumber(input.value, "value")),
        timestamp: readOptionalIntegerString(input.timestamp),
        daystamp: optionalString(input.daystamp),
        comment: optionalString(input.comment),
        requestid: optionalString(input.requestid),
      }),
      context,
      phase: "execute",
    });

    return {
      datapoint: normalizeDatapoint(requirePayloadObject(payload, "Beeminder returned an invalid datapoint")),
    };
  },
  async update_datapoint(input, context) {
    const form = compactObject({
      value: readOptionalNumberString(input.value),
      timestamp: readOptionalIntegerString(input.timestamp),
      daystamp: optionalString(input.daystamp),
      comment: optionalString(input.comment),
    });
    if (Object.keys(form).length === 0) {
      throw new ProviderRequestError(400, "at least one datapoint field must be provided");
    }

    const payload = await requestBeeminderJson({
      method: "PUT",
      path: `/users/${encodePathSegment(readRequiredString(input.username, "username"))}/goals/${encodePathSegment(readRequiredString(input.goal_slug, "goal_slug"))}/datapoints/${encodePathSegment(readRequiredString(input.datapoint_id, "datapoint_id"))}.json`,
      form,
      context,
      phase: "execute",
    });

    return {
      datapoint: normalizeDatapoint(requirePayloadObject(payload, "Beeminder returned an invalid datapoint")),
    };
  },
  async delete_datapoint(input, context) {
    const payload = await requestBeeminderJson({
      method: "DELETE",
      path: `/users/${encodePathSegment(readRequiredString(input.username, "username"))}/goals/${encodePathSegment(readRequiredString(input.goal_slug, "goal_slug"))}/datapoints/${encodePathSegment(readRequiredString(input.datapoint_id, "datapoint_id"))}.json`,
      query: {},
      context,
      phase: "execute",
    });

    return {
      datapoint: normalizeDatapoint(requirePayloadObject(payload, "Beeminder returned an invalid datapoint")),
    };
  },
};

export async function validateBeeminderCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestBeeminderJson({
    method: "GET",
    path: "/users/me.json",
    query: {},
    context: {
      apiKey,
      fetcher,
      signal,
    },
    phase: "validate",
  });
  const user = normalizeUser(requirePayloadObject(payload, "Beeminder returned an invalid user"));

  return {
    profile: {
      accountId: user.username || "beeminder-api-token",
      displayName: user.username ? `Beeminder ${user.username}` : "Beeminder API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      username: user.username || undefined,
      timezone: user.timezone ?? undefined,
      validationEndpoint: "/users/me.json",
      goalCount: user.goals.length,
    }),
  };
}

async function requestBeeminderJson(input: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | undefined>;
  form?: Record<string, string | undefined>;
  context: BeeminderContext;
  phase: BeeminderPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, beeminderDefaultRequestTimeoutMs);
  const body = input.form ? buildBeeminderForm(input.context.apiKey, input.form) : undefined;

  try {
    const response = await input.context.fetcher(
      buildBeeminderUrl(input.path, input.context.apiKey, input.query ?? {}, body !== undefined),
      {
        method: input.method,
        headers: body
          ? {
              accept: "application/json",
              "content-type": "application/x-www-form-urlencoded",
              "user-agent": providerUserAgent,
            }
          : {
              accept: "application/json",
              "user-agent": providerUserAgent,
            },
        body,
        signal: timeout.signal,
      },
    );
    const payload = await readBeeminderPayload(response);

    if (!response.ok) {
      throw createBeeminderError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Beeminder request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Beeminder request failed: ${error.message}` : "Beeminder request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildBeeminderUrl(
  path: string,
  authToken: string,
  query: Record<string, string | undefined>,
  authInBody: boolean,
): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${beeminderApiBaseUrl}/`);
  if (!authInBody) {
    url.searchParams.set("auth_token", authToken);
  }
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildBeeminderForm(authToken: string, form: Record<string, string | undefined>): URLSearchParams {
  const body = new URLSearchParams();
  body.set("auth_token", authToken);
  for (const [key, value] of Object.entries(form)) {
    if (value !== undefined) {
      body.set(key, value);
    }
  }
  return body;
}

async function readBeeminderPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Beeminder returned invalid JSON");
  }
}

function createBeeminderError(status: number, payload: unknown, phase: BeeminderPhase): ProviderRequestError {
  const message = extractBeeminderErrorMessage(payload) ?? `Beeminder request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractBeeminderErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const firstError = errors.find((item): item is string => typeof item === "string");
    if (firstError) {
      return firstError;
    }
  }

  return optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.reason);
}

function requirePayloadObject(payload: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

interface NormalizedUser {
  username: string;
  timezone: string | null;
  updated_at: number | null;
  goals: unknown[];
  deadbeat: boolean | null;
  urgency_load: number | null;
  deleted_goals: Array<Record<string, unknown>> | null;
  raw: Record<string, unknown>;
}

function normalizeUser(item: Record<string, unknown>): NormalizedUser {
  return {
    username: optionalString(item.username) ?? "",
    timezone: optionalString(item.timezone) ?? null,
    updated_at: readNullableInteger(item.updated_at),
    goals: Array.isArray(item.goals) ? item.goals : [],
    deadbeat: typeof item.deadbeat === "boolean" ? item.deadbeat : null,
    urgency_load: readNullableNumber(item.urgency_load),
    deleted_goals: Array.isArray(item.deleted_goals)
      ? item.deleted_goals.map((value) => optionalRecord(value)).filter((value) => value !== undefined)
      : null,
    raw: item,
  };
}

function normalizeGoalList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item) => item !== undefined)
    .map((item) => normalizeGoal(item));
}

function normalizeGoal(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(item.id) ?? null,
    slug: optionalString(item.slug) ?? "",
    title: optionalString(item.title) ?? null,
    goal_type: optionalString(item.goal_type) ?? null,
    graph_url: optionalString(item.graph_url) ?? null,
    svg_url: optionalString(item.svg_url) ?? null,
    thumb_url: optionalString(item.thumb_url) ?? null,
    updated_at: readNullableInteger(item.updated_at),
    losedate: readNullableInteger(item.losedate),
    goaldate: readNullableInteger(item.goaldate),
    datapoints: Array.isArray(item.datapoints)
      ? item.datapoints.map((value) => optionalRecord(value)).filter((value) => value !== undefined)
      : null,
    raw: item,
  };
}

function normalizeDatapointList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item) => item !== undefined)
    .map((item) => normalizeDatapoint(item));
}

function normalizeDatapoint(item: Record<string, unknown>): Record<string, unknown> {
  return {
    id: optionalString(item.id) ?? null,
    timestamp: readNullableInteger(item.timestamp),
    daystamp: optionalString(item.daystamp) ?? null,
    value: readNullableNumber(item.value),
    comment: optionalString(item.comment) ?? null,
    requestid: optionalString(item.requestid) ?? null,
    updated_at: readNullableInteger(item.updated_at),
    raw: item,
  };
}

function readRequiredString(value: unknown, fieldName: string): string {
  const trimmed = optionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return trimmed;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readOptionalNumberString(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return String(value);
}

function readOptionalIntegerString(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined;
  }
  return String(value);
}

function readOptionalBooleanString(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}

function readNullableInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
