import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { E2bActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const e2bApiBaseUrl = "https://api.e2b.app";

const e2bDefaultRequestTimeoutMs = 30_000;
const e2bValidationPath = "/v2/sandboxes";

type E2bRequestPhase = "validate" | "execute";
type E2bQueryValue = string | number | boolean | readonly string[] | undefined;
type E2bContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type E2bActionHandler = (input: Record<string, unknown>, context: E2bContext) => Promise<unknown>;

interface E2bRequestOptions {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: E2bRequestPhase;
  method?: "DELETE" | "GET" | "POST";
  query?: Record<string, E2bQueryValue>;
  body?: Record<string, unknown>;
  emptySuccess?: unknown;
  notFoundAsInvalidInput?: boolean;
}

export const e2bActionHandlers: Record<E2bActionName, E2bActionHandler> = {
  create_sandbox(input, context) {
    return createSandbox(input, context);
  },
  list_sandboxes(input, context) {
    return listSandboxes(input, context);
  },
  get_sandbox(input, context) {
    return getSandbox(input, context);
  },
  delete_sandbox(input, context) {
    return deleteSandbox(input, context);
  },
};

export async function validateE2bCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const sandboxes = await requestE2bSandboxArray({
    apiKey,
    path: e2bValidationPath,
    query: {
      limit: 1,
    },
    fetcher,
    signal,
    phase: "validate",
  });
  const firstSandbox = sandboxes[0];

  return {
    profile: {
      accountId: "api_key",
      displayName: "E2B API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: e2bApiBaseUrl,
      validationEndpoint: e2bValidationPath,
      firstSandboxID: optionalString(firstSandbox?.sandboxID),
      firstTemplateID: optionalString(firstSandbox?.templateID),
    }),
  };
}

async function createSandbox(input: Record<string, unknown>, context: E2bContext): Promise<unknown> {
  const payload = await requestE2bJson({
    ...context,
    path: "/sandboxes",
    method: "POST",
    body: compactObject({
      templateID: requiredString(input.templateID, "templateID"),
      timeout: optionalInteger(input.timeout),
      autoPause: optionalBoolean(input.autoPause),
      autoPauseMemory: optionalBoolean(input.autoPauseMemory),
      autoResume: optionalRecord(input.autoResume),
      secure: optionalBoolean(input.secure),
      allow_internet_access: optionalBoolean(input.allow_internet_access),
      network: optionalRecord(input.network),
      metadata: optionalRecord(input.metadata),
      envVars: optionalRecord(input.envVars),
      mcp: input.mcp === null ? null : optionalRecord(input.mcp),
      volumeMounts: Array.isArray(input.volumeMounts) ? input.volumeMounts : undefined,
    }),
    phase: "execute",
  });

  return {
    sandbox: requireObject(payload, "E2B create sandbox response"),
  };
}

async function listSandboxes(input: Record<string, unknown>, context: E2bContext): Promise<unknown> {
  const sandboxes = await requestE2bSandboxArray({
    ...context,
    path: "/v2/sandboxes",
    query: compactObject({
      metadata: optionalString(input.metadata),
      state: optionalStringArray(input.state),
      nextToken: optionalString(input.nextToken),
      limit: optionalInteger(input.limit),
    }),
    phase: "execute",
  });

  return {
    sandboxes,
  };
}

async function getSandbox(input: Record<string, unknown>, context: E2bContext): Promise<unknown> {
  const sandboxID = requiredString(input.sandboxID, "sandboxID");
  const payload = await requestE2bJson({
    ...context,
    path: `/sandboxes/${encodeURIComponent(sandboxID)}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    sandbox: requireObject(payload, "E2B get sandbox response"),
  };
}

async function deleteSandbox(input: Record<string, unknown>, context: E2bContext): Promise<unknown> {
  const sandboxID = requiredString(input.sandboxID, "sandboxID");
  await requestE2bJson({
    ...context,
    path: `/sandboxes/${encodeURIComponent(sandboxID)}`,
    method: "DELETE",
    phase: "execute",
    emptySuccess: {
      sandboxID,
      success: true,
    },
    notFoundAsInvalidInput: true,
  });

  return {
    sandboxID,
    success: true,
  };
}

async function requestE2bSandboxArray(input: E2bRequestOptions): Promise<Array<Record<string, unknown>>> {
  const payload = await requestE2bJson(input);
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "E2B returned a non-array sandboxes payload", payload);
  }

  return payload.map((sandbox) => requireObject(sandbox, "E2B sandbox"));
}

async function requestE2bJson(input: E2bRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, e2bDefaultRequestTimeoutMs);
  try {
    const response = await input.fetcher(buildE2bUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildE2bHeaders(input.apiKey, input.body !== undefined),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readE2bPayload(response, input.emptySuccess);

    if (!response.ok) {
      throw createE2bError(response.status, payload, input.phase, input.notFoundAsInvalidInput);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "E2B request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `E2B request failed: ${error.message}` : "E2B request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildE2bUrl(path: string, query?: Record<string, E2bQueryValue>): URL {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${e2bApiBaseUrl}${normalizedPath}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      url.searchParams.set(key, value.join(","));
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

function buildE2bHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };

  if (hasBody) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

async function readE2bPayload(response: Response, emptySuccess: unknown): Promise<unknown> {
  if (response.status === 204) {
    return emptySuccess ?? null;
  }

  const text = await response.text().catch(() => "");
  if (!text) {
    return emptySuccess ?? null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }

    throw new ProviderRequestError(502, "E2B returned invalid JSON");
  }
}

function createE2bError(
  status: number,
  payload: unknown,
  phase: E2bRequestPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = extractE2bErrorMessage(payload) ?? `E2B request failed with status ${status}`;
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }

  if (notFoundAsInvalidInput && status === 404) {
    return new ProviderRequestError(404, message, payload);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(status, message, payload);
}

function extractE2bErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const strings = value.filter((item): item is string => typeof item === "string" && item !== "");
  return strings.length > 0 ? strings : undefined;
}

function requireObject(value: unknown, displayName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${displayName} was not an object`, value);
  }

  return record;
}
