import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "check";
const sandboxApiBaseUrl = "https://sandbox.checkhq.com";
const productionApiBaseUrl = "https://api.checkhq.com";
const requestTimeoutMs = 30_000;

type CheckEnvironment = "sandbox" | "production";
type CheckPhase = "validate" | "execute";

interface CheckContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type CheckHandler = (input: Record<string, unknown>, context: CheckContext) => Promise<unknown>;

export const checkActionHandlers: ProviderActionHandlers<"check", CheckHandler> = {
  async validate_address(input, context) {
    const payload = await requestCheckJson({
      context,
      path: "/addresses/validate",
      method: "POST",
      phase: "execute",
      body: compactObject({
        line1: requiredString(input.line1, "line1"),
        line2: optionalString(input.line2),
        city: requiredString(input.city, "city"),
        state: requiredString(input.state, "state"),
        postal_code: requiredString(input.postalCode, "postalCode"),
        country: optionalString(input.country),
      }),
    });

    return {
      result: requiredRecord(payload, "Check address validation response", providerError),
    };
  },
  async list_agencies(input, context) {
    const payload = await requestCheckJson({
      context,
      path: "/agencies",
      method: "GET",
      phase: "execute",
      query: compactObject({
        id: optionalStringList(input.ids),
        jurisdiction: optionalStringList(input.jurisdictions),
        label_contains: optionalString(input.labelContains),
        limit: optionalIntegerString(input.limit, "limit"),
      }),
    });
    const page = requiredRecord(payload, "Check agency list response", providerError);

    return {
      next: nullableString(page.next, "pagination URL"),
      previous: nullableString(page.previous, "pagination URL"),
      agencies: normalizeAgencyList(page.results),
      raw: page,
    };
  },
  async get_agency(input, context) {
    const payload = await requestCheckJson({
      context,
      path: `/agencies/${encodeURIComponent(requiredString(input.id, "id"))}`,
      method: "GET",
      phase: "execute",
    });

    return {
      agency: normalizeAgency(payload),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<CheckContext>({
  service,
  handlers: checkActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CheckContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveApiBaseUrl(
        resolveEnvironment(credential.values.environment ?? credential.metadata.environment),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return resolveApiBaseUrl(resolveEnvironment(credential.values.environment ?? credential.metadata.environment));
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const environment = resolveEnvironment(input.values.environment);
    const apiBaseUrl = resolveApiBaseUrl(environment);
    const context = { apiKey: input.apiKey, apiBaseUrl, fetcher, signal };
    const payload = await requestCheckJson({
      context,
      path: "/agencies",
      method: "GET",
      phase: "validate",
      query: { limit: "1" },
    });
    const page = requiredRecord(payload, "Check agency validation response", providerError);
    const firstAgency = normalizeAgencyList(page.results)[0];

    return {
      profile: {
        accountId: environment,
        displayName: environment === "production" ? "Check Production API Key" : "Check Sandbox API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        environment,
        apiBaseUrl,
        validationEndpoint: "/agencies",
        firstAgencyId: firstAgency?.id,
        firstAgencyLabel: firstAgency?.label,
      }),
    };
  },
};

async function requestCheckJson(input: {
  context: CheckContext;
  path: string;
  method: "GET" | "POST";
  phase: CheckPhase;
  query?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const signal = input.context.signal
    ? AbortSignal.any([input.context.signal, AbortSignal.timeout(requestTimeoutMs)])
    : AbortSignal.timeout(requestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildUrl(input.context.apiBaseUrl, input.path, input.query), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal,
    });
    payload = await readJson(response, "Check");
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (isAbortLikeError(error)) throw new ProviderRequestError(504, "Check request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Check request failed: ${error.message}` : "Check request failed",
    );
  }
  if (!response.ok) throw createError(response, payload, input.phase, "Check");
  return payload;
}

function buildUrl(apiBaseUrl: string, path: string, query: Record<string, string | string[] | undefined> = {}): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${apiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readJson(response: Response, source: string): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, `${source} returned invalid JSON`);
  }
}

function createError(response: Response, payload: unknown, phase: CheckPhase, source: string): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `${source} request failed with status ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 401) return new ProviderRequestError(401, message, payload);
  if (phase === "execute" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return optionalString(error?.message) ?? optionalString(record?.message) ?? optionalString(error?.type);
}

function normalizeAgencyList(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => normalizeAgency(item)) : [];
}

function normalizeAgency(value: unknown): Record<string, unknown> {
  const record = requiredRecord(value, "Check agency", providerError);
  return {
    id: requiredString(record.id, "agency.id", providerError),
    label: requiredString(record.label, "agency.label", providerError),
    jurisdiction: requiredString(record.jurisdiction, "agency.jurisdiction", providerError),
    raw: record,
  };
}

function nullableString(value: unknown, fieldName: string): string | null {
  if (value == null) return null;
  return requiredString(value, fieldName);
}

function optionalStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined);
  return values.length > 0 ? values : undefined;
}

function optionalIntegerString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) return undefined;
  const parsed = optionalInteger(value);
  if (parsed === undefined) throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  return String(parsed);
}

function resolveEnvironment(value: unknown): CheckEnvironment {
  const environment = optionalString(value)?.toLowerCase() ?? "sandbox";
  if (environment === "sandbox" || environment === "production") return environment;
  throw new ProviderRequestError(400, "environment must be either sandbox or production");
}

function resolveApiBaseUrl(environment: CheckEnvironment): string {
  return environment === "production" ? productionApiBaseUrl : sandboxApiBaseUrl;
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
