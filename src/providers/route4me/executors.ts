import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "route4me";
const route4meApiBaseUrl = "https://api.route4me.com/api.v4";
const route4meValidationPath = "/optimization_problem.php";

type Route4meMode = "validation" | "execution";
type Route4meMethod = "GET" | "POST" | "DELETE";
type Route4meQueryValue = string | number | boolean | undefined;
type Route4meActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const route4meActionHandlers: ProviderActionHandlers<"route4me", Route4meActionHandler> = {
  create_optimization(input, context) {
    return createOptimization(input, context);
  },
  list_optimizations(input, context) {
    return listOptimizations(input, context);
  },
  delete_optimizations(input, context) {
    return deleteOptimizations(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, route4meActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    await route4meRequest("GET", route4meValidationPath, {}, undefined, apiKey, fetcher, "validation", signal);
    return {
      profile: {
        accountId: "route4me-api-key",
        displayName: "Route4Me API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: route4meApiBaseUrl,
        validationEndpoint: route4meValidationPath,
      },
    };
  },
};

async function createOptimization(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await route4meRequest(
    "POST",
    route4meValidationPath,
    {},
    {
      parameters: readRequiredObject(input.parameters, "parameters", 400),
      addresses: readRequiredArray(input.addresses, "addresses"),
    },
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return normalizeOptimizationSummary(readRequiredObject(payload, "create optimization"));
}

async function listOptimizations(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await route4meRequest(
    "GET",
    route4meValidationPath,
    compactObject({
      optimization_problem_id: optionalString(input.optimizationProblemId),
      state: optionalInteger(input.state),
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
      start_date: optionalString(input.startDate),
      end_date: optionalString(input.endDate),
    }),
    undefined,
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  const items = Array.isArray(payload) ? payload : [payload];
  return {
    optimizations: items.map((item, index) =>
      normalizeOptimizationSummary(readRequiredObject(item, `optimizations[${index}]`)),
    ),
  };
}

async function deleteOptimizations(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await route4meRequest(
    "DELETE",
    route4meValidationPath,
    {},
    { optimization_problem_ids: readRequiredStringArray(input.optimizationProblemIds, "optimizationProblemIds") },
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  const record = readRequiredObject(payload, "delete response");
  return {
    status: readRequiredBoolean(record.status, "status"),
    removed: readRequiredInteger(record.removed, "removed"),
    raw: record,
  };
}

async function route4meRequest(
  method: Route4meMethod,
  path: string,
  query: Record<string, Route4meQueryValue>,
  body: Record<string, unknown> | undefined,
  apiKey: string,
  fetcher: typeof fetch,
  mode: Route4meMode,
  signal?: AbortSignal,
): Promise<unknown> {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${route4meApiBaseUrl}/`);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(compactObject(query))) {
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await fetcher(url, {
      method,
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    payload = await readRoute4mePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Route4Me request failed: ${error.message}` : "Route4Me request failed",
    );
  }
  if (!response.ok) throw buildRoute4meError(response.status, payload, mode);
  return payload;
}

async function readRoute4mePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Route4Me returned invalid JSON");
  }
}

function buildRoute4meError(status: number, payload: unknown, mode: Route4meMode): ProviderRequestError {
  const message = extractRoute4meErrorMessage(payload) ?? `Route4Me request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (mode === "execution" && status === 401) return new ProviderRequestError(401, message, payload);
  if (status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : 400, message, payload);
}

function extractRoute4meErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const direct =
    optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.status_message);
  if (direct) return direct;
  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      const text = optionalString(item);
      if (text) return text;
      const nested = optionalRecord(item);
      const nestedMessage = optionalString(nested?.message) ?? optionalString(nested?.error);
      if (nestedMessage) return nestedMessage;
    }
  }
  return undefined;
}

function normalizeOptimizationSummary(payload: Record<string, unknown>): Record<string, unknown> {
  const routes = readOptionalArray(payload.routes);
  const addresses = readOptionalArray(payload.addresses);
  return {
    optimizationProblemId: readRequiredString(payload.optimization_problem_id, "optimization_problem_id"),
    state: readOptionalInteger(payload.state) ?? null,
    routeIds: routes
      .map((item, index) => readOptionalRouteId(item, `routes[${index}]`))
      .filter((value): value is string => value !== undefined),
    routeCount: routes.length,
    addressCount: addresses.length,
    raw: payload,
  };
}

function readOptionalRouteId(value: unknown, fieldName: string): string | undefined {
  const record = readRequiredObject(value, fieldName);
  return optionalString(record.route_id);
}

function readRequiredObject(value: unknown, fieldName: string, status = 502): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(status, `invalid route4me ${fieldName} response`);
  return record;
}

function readRequiredArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(400, `${fieldName} must be an array`);
  return value;
}

function readOptionalArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readRequiredString(value: unknown, fieldName: string): string {
  const result = optionalString(value);
  if (!result) throw new ProviderRequestError(502, `invalid route4me ${fieldName} response`);
  return result;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") throw new ProviderRequestError(502, `invalid route4me ${fieldName} response`);
  return value;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `invalid route4me ${fieldName} response`);
  }
  return value;
}

function readOptionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function readRequiredStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string array`);
  }
  return value.map((item, index) => {
    const text = optionalString(item);
    if (!text) throw new ProviderRequestError(400, `${fieldName}[${index}] must be a non-empty string`);
    return text;
  });
}
