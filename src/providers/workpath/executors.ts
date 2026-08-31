import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, positiveInteger, requiredRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "workpath";
const workpathApiBaseUrl = "https://connect.workpath.com/api/v3";
const workpathValidationPath = "/users";
const workpathDefaultRequestTimeoutMs = 30_000;

type WorkpathRequestMode = "validate" | "execute";
type WorkpathActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface WorkpathRequestInput {
  path: string;
  query?: Record<string, string | number | undefined>;
  mode: WorkpathRequestMode;
}

interface WorkpathRequestResult {
  payload: unknown;
  pagination: WorkpathPagination;
}

interface WorkpathPagination {
  page: number | null;
  limit: number | null;
  pageCount: number | null;
  itemCount: number | null;
  nextPage: string | null;
  link: string | null;
}

export const workpathActionHandlers: ProviderActionHandlers<"workpath", WorkpathActionHandler> = {
  async list_goals(input, context) {
    assertDateRangePair(input);
    const result = await workpathRequest(context, {
      path: "/goals",
      query: {
        page: optionalPositiveInteger(input.page, "page"),
        start_date: optionalString(input.startDate),
        end_date: optionalString(input.endDate),
      },
      mode: "execute",
    });
    return {
      goals: requireArrayPayload(result.payload, "Workpath goals response must be an array"),
      pagination: result.pagination,
    };
  },
  async get_goal(input, context) {
    const result = await workpathRequest(context, {
      path: `/goals/${encodeURIComponent(String(positiveInteger(input.id, "id", providerInputError)))}`,
      mode: "execute",
    });
    return {
      goal: requireObjectPayload(result.payload, "Workpath goal response must be an object"),
    };
  },
  async list_goal_key_results(input, context) {
    const result = await workpathRequest(context, {
      path: `/goals/${encodeURIComponent(String(positiveInteger(input.goalId, "goalId", providerInputError)))}/key_results`,
      mode: "execute",
    });
    return {
      keyResults: requireArrayPayload(result.payload, "Workpath key results response must be an array"),
    };
  },
  async get_goal_key_result(input, context) {
    const result = await workpathRequest(context, {
      path: `/key_results/${encodeURIComponent(String(positiveInteger(input.id, "id", providerInputError)))}`,
      mode: "execute",
    });
    return {
      keyResult: requireObjectPayload(result.payload, "Workpath key result response must be an object"),
    };
  },
  async list_users(input, context) {
    const result = await workpathRequest(context, {
      path: "/users",
      query: {
        page: optionalPositiveInteger(input.page, "page"),
      },
      mode: "execute",
    });
    return {
      users: requireArrayPayload(result.payload, "Workpath users response must be an array"),
      pagination: result.pagination,
    };
  },
  async get_user(input, context) {
    const result = await workpathRequest(context, {
      path: `/users/${encodeURIComponent(String(positiveInteger(input.id, "id", providerInputError)))}`,
      mode: "execute",
    });
    return {
      user: requireObjectPayload(result.payload, "Workpath user response must be an object"),
    };
  },
  async list_teams(input, context) {
    const result = await workpathRequest(context, {
      path: "/teams",
      query: {
        page: optionalPositiveInteger(input.page, "page"),
      },
      mode: "execute",
    });
    return {
      teams: requireArrayPayload(result.payload, "Workpath teams response must be an array"),
      pagination: result.pagination,
    };
  },
  async get_team(input, context) {
    const result = await workpathRequest(context, {
      path: `/teams/${encodeURIComponent(String(positiveInteger(input.id, "id", providerInputError)))}`,
      mode: "execute",
    });
    return {
      team: requireObjectPayload(result.payload, "Workpath team response must be an object"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, workpathActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const result = await workpathRequest(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      {
        path: workpathValidationPath,
        query: { page: 1 },
        mode: "validate",
      },
    );
    const users = requireArrayPayload(result.payload, "Workpath users response must be an array");
    const firstUser = optionalRecord(users[0]);
    const userId = firstUser?.id;
    const email = optionalString(firstUser?.email);
    const name = optionalString(firstUser?.name);

    return {
      profile: {
        accountId: typeof userId === "number" ? String(userId) : "workpath-api-token",
        displayName: name ?? email ?? "Workpath API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: workpathApiBaseUrl,
        validationEndpoint: workpathValidationPath,
        validatedUserId: typeof userId === "number" ? userId : undefined,
        validatedUserEmail: email,
      }),
    };
  },
};

async function workpathRequest(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  input: WorkpathRequestInput,
): Promise<WorkpathRequestResult> {
  const apiKey = context.apiKey.trim();
  if (!apiKey) {
    throw new ProviderRequestError(400, "workpath apiKey is required");
  }

  const url = new URL(`${workpathApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(context.signal, workpathDefaultRequestTimeoutMs);
  try {
    const response = await context.fetcher(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });

    const payload = await readWorkpathPayload(response, response.ok);
    if (!response.ok) {
      throw buildWorkpathError(response, payload, input.mode);
    }

    return {
      payload,
      pagination: readWorkpathPagination(response.headers),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Workpath ${input.path} request timed out after ${Math.ceil(workpathDefaultRequestTimeoutMs / 1000)} seconds`,
      );
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Workpath request failed: ${error.message}` : "Workpath request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readWorkpathPayload(response: Response, requireJson: boolean): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (requireJson) {
      throw new ProviderRequestError(502, "Workpath returned invalid JSON");
    }
    return text;
  }
}

function readWorkpathPagination(headers: Headers): WorkpathPagination {
  return {
    page: readIntegerHeader(headers, "Pagination-Page"),
    limit: readIntegerHeader(headers, "Pagination-Limit"),
    pageCount: readIntegerHeader(headers, "Pagination-Page-Count"),
    itemCount: readIntegerHeader(headers, "Pagination-Item-Count"),
    nextPage: headers.get("Pagination-Next-Page"),
    link: headers.get("Link"),
  };
}

function readIntegerHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function requireArrayPayload(payload: unknown, message: string): unknown[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, message);
  }
  return payload;
}

function requireObjectPayload(payload: unknown, message: string): Record<string, unknown> {
  return requiredRecord(payload, message, () => new ProviderRequestError(502, message));
}

function optionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  return value === undefined ? undefined : positiveInteger(value, fieldName, providerInputError);
}

function assertDateRangePair(input: Record<string, unknown>): void {
  if ((input.startDate === undefined) !== (input.endDate === undefined)) {
    throw new ProviderRequestError(400, "startDate and endDate must be provided together");
  }
}

function buildWorkpathError(response: Response, payload: unknown, mode: WorkpathRequestMode): ProviderRequestError {
  const message = extractWorkpathErrorMessage(payload) ?? `Workpath request failed with ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (mode === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if ([400, 404, 406, 422].includes(response.status)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractWorkpathErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  const errors = object.errors;
  if (Array.isArray(errors) && typeof errors[0] === "string") {
    return errors[0];
  }
  const firstError = Array.isArray(errors) ? optionalRecord(errors[0]) : undefined;
  const firstErrorMessage = firstError ? optionalString(firstError.message) : undefined;
  return (
    optionalString(object.message) ??
    optionalString(object.error) ??
    firstErrorMessage ??
    optionalString(optionalRecord(object.error)?.message)
  );
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
