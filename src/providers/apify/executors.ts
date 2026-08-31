import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "apify";
const apifyApiBaseUrl = "https://api.apify.com";
const apifyValidationPath = "/v2/users/me";

type ApifyQueryValue = number | string | undefined;
type ApifyRequestPhase = "validate" | "execute";

type ApifyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const apifyActionHandlers: ProviderActionHandlers<"apify", ApifyActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  get_actor(input, context) {
    return getActor(input, context);
  },
  run_actor(input, context) {
    return runActor(input, context);
  },
  get_run(input, context) {
    return getRun(input, context);
  },
  get_dataset_items(input, context) {
    return getDatasetItems(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, apifyActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestApifyJson({
      apiKey: input.apiKey,
      path: apifyValidationPath,
      fetcher,
      signal,
      phase: "validate",
    });

    const user = unwrapApifyObject(payload, "Apify user");
    const userId = optionalString(user.id);
    const username = optionalString(user.username);
    const email = optionalString(user.email);

    return {
      profile: {
        accountId: userId,
        displayName: username ?? email ?? "Apify API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: apifyApiBaseUrl,
        validationEndpoint: apifyValidationPath,
        userId,
        username,
        email,
      }),
    };
  },
};

async function getCurrentUser(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestApifyJson({
    apiKey: context.apiKey,
    path: apifyValidationPath,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    user: unwrapApifyObject(payload, "Apify user"),
  };
}

async function getActor(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const actorId = requiredString(input.actorId, "actorId", providerInputError);
  const payload = await requestApifyJson({
    apiKey: context.apiKey,
    path: `/v2/acts/${encodeURIComponent(actorId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    actor: unwrapApifyObject(payload, "Apify actor"),
  };
}

async function runActor(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const actorId = requiredString(input.actorId, "actorId", providerInputError);
  const body = readOptionalInputObject(input.input);
  const payload = await requestApifyJson({
    apiKey: context.apiKey,
    path: `/v2/acts/${encodeURIComponent(actorId)}/runs`,
    query: compactObject({
      build: optionalString(input.build),
      memory: readOptionalInteger(input.memoryMbytes, "memoryMbytes"),
      timeout: readOptionalInteger(input.timeoutSecs, "timeoutSecs"),
    }),
    body: body ?? {},
    method: "POST",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    run: unwrapApifyObject(payload, "Apify run"),
  };
}

async function getRun(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const runId = requiredString(input.runId, "runId", providerInputError);
  const payload = await requestApifyJson({
    apiKey: context.apiKey,
    path: `/v2/actor-runs/${encodeURIComponent(runId)}`,
    query: compactObject({
      waitForFinish: readOptionalInteger(input.waitForFinishSeconds, "waitForFinishSeconds"),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    run: unwrapApifyObject(payload, "Apify run"),
  };
}

async function getDatasetItems(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const datasetId = requiredString(input.datasetId, "datasetId", providerInputError);
  const payload = await requestApifyJson({
    apiKey: context.apiKey,
    path: `/v2/datasets/${encodeURIComponent(datasetId)}/items`,
    query: compactObject({
      limit: readOptionalInteger(input.limit, "limit"),
      offset: readOptionalInteger(input.offset, "offset"),
      clean: readOptionalBooleanFlag(input.clean),
      skipHidden: readOptionalBooleanFlag(input.skipHidden),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Apify dataset items response must be an array", payload);
  }

  return {
    items: payload,
  };
}

async function requestApifyJson(input: {
  apiKey: string;
  path: string;
  query?: Record<string, ApifyQueryValue>;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: ApifyRequestPhase;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }

    response = await input.fetcher(buildApifyUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
    payload = await readApifyPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Apify request failed: ${error.message}` : "Apify request failed",
    );
  }

  if (!response.ok) {
    throw createApifyError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }

  return payload;
}

function buildApifyUrl(path: string, query: Record<string, ApifyQueryValue> = {}): URL {
  const url = new URL(path, apifyApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readApifyPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Apify returned invalid JSON");
  }
}

function createApifyError(
  response: Response,
  payload: unknown,
  phase: ApifyRequestPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const message = extractApifyErrorMessage(payload) ?? `Apify request failed with status ${response.status}`;
  if (response.status === 401 || (response.status === 404 && notFoundAsInvalidInput)) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(phase === "validate" ? 502 : response.status, message, payload);
}

function extractApifyErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return optionalString(error?.message) ?? optionalString(record?.message) ?? optionalString(error?.type);
}

function unwrapApifyObject(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} response is not an object`, payload);
  }

  if (Object.prototype.hasOwnProperty.call(record, "data")) {
    const data = optionalRecord(record.data);
    if (!data) {
      throw new ProviderRequestError(502, `${label} response data is not an object`, payload);
    }
    return data;
  }

  return record;
}

function readOptionalInputObject(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = optionalRecord(value);
  if (!record || !isJsonCompatibleValue(record)) {
    throw new ProviderRequestError(400, "input must be a JSON-compatible object", value);
  }
  return record;
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return parsed;
}

function readOptionalBooleanFlag(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = optionalBoolean(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, "boolean input is required");
  }
  return parsed ? 1 : 0;
}

function isJsonCompatibleValue(value: unknown): boolean {
  return isJsonCompatibleValueInner(value, new WeakSet<object>());
}

function isJsonCompatibleValueInner(value: unknown, stack: WeakSet<object>): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (!value || typeof value !== "object" || stack.has(value)) {
    return false;
  }

  stack.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonCompatibleValueInner(item, stack))
    : isJsonCompatibleObject(value, stack);
  stack.delete(value);
  return valid;
}

function isJsonCompatibleObject(value: object, stack: WeakSet<object>): boolean {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }
  return Object.values(value).every((item) => isJsonCompatibleValueInner(item, stack));
}
