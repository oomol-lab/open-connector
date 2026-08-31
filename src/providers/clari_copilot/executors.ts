import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "clari_copilot";
const clariCopilotApiBaseUrl = "https://rest-api.copilot.clari.com";
const clariCopilotValidationPath = "/users";

type ClariCopilotPhase = "validate" | "execute";

interface ClariCopilotContext {
  apiKey: string;
  apiPassword: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type ClariCopilotActionHandler = (input: Record<string, unknown>, context: ClariCopilotContext) => Promise<unknown>;

const clariCopilotActionHandlers: ProviderActionHandlers<"clari_copilot", ClariCopilotActionHandler> = {
  list_users(_input, context) {
    return requestClariCopilotJson({
      path: "/users",
      context,
      phase: "execute",
    });
  },

  list_topics(input, context) {
    return requestClariCopilotJson({
      path: "/v2/topics",
      query: buildQuery(input, ["filterModifiedLt", "filterModifiedGt"]),
      context,
      phase: "execute",
    });
  },

  list_calls(input, context) {
    return requestClariCopilotJson({
      path: "/calls",
      query: buildCallsQuery(input),
      context,
      phase: "execute",
    });
  },

  get_call_details(input, context) {
    return requestClariCopilotJson({
      path: "/call-details",
      query: buildQuery(input, ["id", "includeAudio", "includeVideo"]),
      context,
      phase: "execute",
    });
  },

  list_scorecards(input, context) {
    return requestClariCopilotJson({
      path: "/scorecard",
      query: buildQuery(input, ["skip", "limit", "filterTimeGt", "filterTimeLt", "filterRepId", "filterScorerId"]),
      context,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ClariCopilotContext>({
  service,
  handlers: clariCopilotActionHandlers,
  async createContext(context, fetcher): Promise<ClariCopilotContext> {
    const credential = await requireApiKeyCredential(context, service);
    return readClariCopilotCredentials({
      apiKey: credential.apiKey,
      apiPassword: credential.values.apiPassword,
      fetcher,
      signal: context.signal,
    });
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = readClariCopilotCredentials({
      apiKey: input.apiKey,
      apiPassword: input.values.apiPassword,
      fetcher,
      signal,
    });
    const payload = await requestClariCopilotJson({
      path: clariCopilotValidationPath,
      context,
      phase: "validate",
    });
    const users = readArrayField(payload, "users", "Clari Copilot users");

    return {
      profile: {
        accountId: "clari_copilot:api-key",
        displayName: "Clari Copilot API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: clariCopilotApiBaseUrl,
        validationEndpoint: clariCopilotValidationPath,
        userCount: users.length,
      },
    };
  },
};

function readClariCopilotCredentials(input: {
  apiKey: string;
  apiPassword?: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}): ClariCopilotContext {
  return {
    apiKey: input.apiKey,
    apiPassword: requiredString(input.apiPassword, "apiPassword", (message) => new ProviderRequestError(400, message)),
    fetcher: input.fetcher,
    signal: input.signal,
  };
}

async function requestClariCopilotJson(input: {
  path: string;
  query?: URLSearchParams;
  context: ClariCopilotContext;
  phase: ClariCopilotPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);

  try {
    const response = await input.context.fetcher(buildClariCopilotUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": input.context.apiKey,
        "x-api-password": input.context.apiPassword,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readClariCopilotPayload(response);

    if (!response.ok) {
      throw createClariCopilotError(response, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Clari Copilot request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Clari Copilot request failed: ${error.message}` : "Clari Copilot request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildClariCopilotUrl(path: string, query?: URLSearchParams): URL {
  const url = new URL(path, clariCopilotApiBaseUrl);
  if (query && query.size > 0) {
    url.search = query.toString();
  }
  return url;
}

function buildCallsQuery(input: Record<string, unknown>): URLSearchParams {
  const query = buildQuery(input, [
    "skip",
    "limit",
    "filterTimeGt",
    "filterTimeLt",
    "filterModifiedGt",
    "filterModifiedLt",
    "filterDurationGt",
    "filterDurationLt",
    "sortTime",
    "sortProcessed",
    "includePrivate",
    "includeAudio",
    "includeVideo",
    "includePagination",
  ]);
  for (const key of ["filterUser", "filterAttendees", "filterTopics", "filterStatus", "filterType", "filterSourceId"]) {
    appendArrayQuery(query, key, input[key]);
  }
  return query;
}

function buildQuery(input: Record<string, unknown>, keys: readonly string[]): URLSearchParams {
  const query = new URLSearchParams();
  for (const key of keys) {
    appendScalarQuery(query, key, input[key]);
  }
  return query;
}

function appendScalarQuery(query: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  query.set(key, formatQueryValue(value));
}

function appendArrayQuery(query: URLSearchParams, key: string, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const item of value) {
    if (item !== undefined && item !== null && item !== "") {
      query.append(key, formatQueryValue(item));
    }
  }
}

function formatQueryValue(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

async function readClariCopilotPayload(response: Response): Promise<unknown> {
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

function createClariCopilotError(response: Response, payload: unknown, phase: ClariCopilotPhase): ProviderRequestError {
  const message =
    extractErrorMessage(payload) ??
    response.statusText ??
    `Clari Copilot request failed with status ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  for (const key of ["message", "error", "detail"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  const errors = record.errors;
  if (Array.isArray(errors)) {
    const firstString = errors.find((item) => typeof item === "string" && item.trim());
    if (typeof firstString === "string") {
      return firstString;
    }
  }
  return undefined;
}

function readArrayField(payload: unknown, key: string, label: string): unknown[] {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} response must be a JSON object`);
  }
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} response is missing ${key}`);
  }
  return value;
}
