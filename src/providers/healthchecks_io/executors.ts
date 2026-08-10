import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { HealthchecksIoActionName } from "./actions.ts";

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
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "healthchecks_io";
const healthchecksIoApiBaseUrl = "https://healthchecks.io/api/v3";
const healthchecksIoDefaultRequestTimeoutMs = 30_000;

type HealthchecksIoPhase = "validate" | "execute";
type HealthchecksIoMethod = "GET" | "POST" | "DELETE";
type HealthchecksIoActionContext = ApiKeyProviderContext;
type HealthchecksIoActionHandler = (
  input: Record<string, unknown>,
  context: HealthchecksIoActionContext,
) => Promise<unknown>;

export const healthchecksIoActionHandlers: Record<HealthchecksIoActionName, HealthchecksIoActionHandler> = {
  async list_checks(input, context) {
    const payload = await requestHealthchecksIoJson({
      context,
      path: "/checks/",
      query: compactObject({
        slug: optionalString(input.slug),
      }),
      phase: "execute",
    });

    return {
      checks: readArrayProperty(payload, "checks", "Healthchecks.io checks response"),
    };
  },
  async get_check(input, context) {
    const payload = await requestHealthchecksIoJson({
      context,
      path: `/checks/${encodeURIComponent(requiredString(input.check_id, "check_id", providerInputError))}`,
      phase: "execute",
    });

    return {
      check: requireObject(payload, "Healthchecks.io check response"),
    };
  },
  async create_check(input, context) {
    assertCreateCheckInput(input);
    const payload = await requestHealthchecksIoJson({
      context,
      path: "/checks/",
      method: "POST",
      body: buildCheckMutationBody(input),
      phase: "execute",
    });

    return {
      check: requireObject(payload, "Healthchecks.io create check response"),
    };
  },
  async update_check(input, context) {
    assertUpdateCheckInput(input);
    const payload = await requestHealthchecksIoJson({
      context,
      path: `/checks/${encodeURIComponent(requiredString(input.uuid, "uuid", providerInputError))}`,
      method: "POST",
      body: buildCheckMutationBody(input, { skipUuid: true }),
      phase: "execute",
    });

    return {
      check: requireObject(payload, "Healthchecks.io update check response"),
    };
  },
  async pause_check(input, context) {
    const payload = await requestHealthchecksIoJson({
      context,
      path: `/checks/${encodeURIComponent(requiredString(input.uuid, "uuid", providerInputError))}/pause`,
      method: "POST",
      emptyBody: true,
      phase: "execute",
    });

    return {
      check: requireObject(payload, "Healthchecks.io pause check response"),
    };
  },
  async resume_check(input, context) {
    const payload = await requestHealthchecksIoJson({
      context,
      path: `/checks/${encodeURIComponent(requiredString(input.uuid, "uuid", providerInputError))}/resume`,
      method: "POST",
      emptyBody: true,
      phase: "execute",
    });

    return {
      check: requireObject(payload, "Healthchecks.io resume check response"),
    };
  },
  async delete_check(input, context) {
    const payload = await requestHealthchecksIoJson({
      context,
      path: `/checks/${encodeURIComponent(requiredString(input.uuid, "uuid", providerInputError))}`,
      method: "DELETE",
      phase: "execute",
    });

    return {
      deleted: true,
      check: optionalRecord(payload) ?? null,
    };
  },
  async list_pings(input, context) {
    const payload = await requestHealthchecksIoJson({
      context,
      path: `/checks/${encodeURIComponent(requiredString(input.uuid, "uuid", providerInputError))}/pings/`,
      phase: "execute",
    });

    return {
      pings: readArrayProperty(payload, "pings", "Healthchecks.io pings response"),
    };
  },
  async list_flips(input, context) {
    const payload = await requestHealthchecksIoJson({
      context,
      path: `/checks/${encodeURIComponent(requiredString(input.check_id, "check_id", providerInputError))}/flips/`,
      query: compactObject({
        seconds: optionalNumberString(input.seconds),
        start: optionalNumberString(input.start),
        end: optionalNumberString(input.end),
      }),
      phase: "execute",
    });

    return {
      flips: readArrayProperty(payload, "flips", "Healthchecks.io flips response"),
    };
  },
  async list_channels(_input, context) {
    const payload = await requestHealthchecksIoJson({
      context,
      path: "/channels/",
      phase: "execute",
    });

    return {
      channels: readArrayProperty(payload, "channels", "Healthchecks.io channels response"),
    };
  },
  async list_badges(_input, context) {
    const payload = await requestHealthchecksIoJson({
      context,
      path: "/badges/",
      phase: "execute",
    });

    return {
      badges: readObjectProperty(payload, "badges", "Healthchecks.io badges response"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, healthchecksIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestHealthchecksIoJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: "/checks/",
      phase: "validate",
    });
    const checks = readArrayProperty(payload, "checks", "Healthchecks.io checks response");
    const firstCheck = optionalRecord(checks[0]);

    return {
      profile: {
        displayName: "Healthchecks.io API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: healthchecksIoApiBaseUrl,
        validationEndpoint: "/checks/",
        checkCount: checks.length,
        firstCheckName: optionalString(firstCheck?.name),
        firstCheckUuid: optionalString(firstCheck?.uuid),
      }),
    };
  },
};

async function requestHealthchecksIoJson(input: {
  context: HealthchecksIoActionContext;
  path: string;
  phase: HealthchecksIoPhase;
  method?: HealthchecksIoMethod;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  emptyBody?: boolean;
}): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(healthchecksIoDefaultRequestTimeoutMs);
  const signal = input.context.signal ? AbortSignal.any([input.context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.context.fetcher(buildHealthchecksIoUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildHealthchecksIoHeaders(input.context.apiKey, input.body),
      signal,
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      ...(input.emptyBody ? { body: "" } : {}),
    });
    const payload = await readHealthchecksIoPayload(response);

    if (!response.ok) {
      throw createHealthchecksIoError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Healthchecks.io request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Healthchecks.io request failed: ${error.message}` : "Healthchecks.io request failed",
    );
  }
}

function buildHealthchecksIoUrl(path: string, query?: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${healthchecksIoApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildHealthchecksIoHeaders(apiKey: string, body?: Record<string, unknown>): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
    ...(body ? { "content-type": "application/json" } : {}),
  };
}

async function readHealthchecksIoPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Healthchecks.io returned invalid JSON");
  }
}

function createHealthchecksIoError(status: number, payload: unknown, phase: HealthchecksIoPhase): ProviderRequestError {
  const message = extractHealthchecksIoErrorMessage(payload) ?? `Healthchecks.io request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractHealthchecksIoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  return optionalString(record?.detail) ?? optionalString(record?.error) ?? optionalString(record?.message);
}

function buildCheckMutationBody(
  input: Record<string, unknown>,
  options: { skipUuid?: boolean } = {},
): Record<string, unknown> {
  const body: Record<string, unknown> = compactObject({
    name: optionalString(input.name),
    slug: optionalString(input.slug),
    tags: optionalString(input.tags),
    desc: typeof input.desc === "string" ? input.desc : undefined,
    timeout: optionalInteger(input.timeout),
    grace: optionalInteger(input.grace),
    schedule: optionalString(input.schedule),
    tz: optionalString(input.tz),
    manual_resume: optionalBoolean(input.manual_resume),
    methods: optionalString(input.methods),
    channels: typeof input.channels === "string" ? input.channels : undefined,
    start_kw: typeof input.start_kw === "string" ? input.start_kw : undefined,
    success_kw: typeof input.success_kw === "string" ? input.success_kw : undefined,
    failure_kw: typeof input.failure_kw === "string" ? input.failure_kw : undefined,
    filter_subject: optionalBoolean(input.filter_subject),
    filter_body: optionalBoolean(input.filter_body),
    filter_http_body: optionalBoolean(input.filter_http_body),
    filter_default_fail: optionalBoolean(input.filter_default_fail),
  });

  if (!options.skipUuid && input.uuid !== undefined) {
    body.uuid = input.uuid;
  }

  return body;
}

function requireObject(value: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${context} is not an object`);
  }
  return record;
}

function readArrayProperty(payload: unknown, key: string, context: string): unknown[] {
  const record = requireObject(payload, context);
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${context} is missing ${key}`);
  }
  return value;
}

function readObjectProperty(payload: unknown, key: string, context: string): Record<string, unknown> {
  const record = requireObject(payload, context);
  const value = optionalRecord(record[key]);
  if (!value) {
    throw new ProviderRequestError(502, `${context} is missing ${key}`);
  }
  return value;
}

function optionalNumberString(value: unknown): string | undefined {
  const numberValue = optionalInteger(value);
  return numberValue === undefined ? undefined : String(numberValue);
}

function assertCreateCheckInput(input: Record<string, unknown>): void {
  if (input.timeout === undefined && input.schedule === undefined) {
    throw new ProviderRequestError(400, "Either timeout or schedule must be provided.");
  }
}

function assertUpdateCheckInput(input: Record<string, unknown>): void {
  const mutationKeys = [
    "name",
    "slug",
    "tags",
    "desc",
    "timeout",
    "grace",
    "schedule",
    "tz",
    "manual_resume",
    "methods",
    "channels",
    "start_kw",
    "success_kw",
    "failure_kw",
    "filter_subject",
    "filter_body",
    "filter_http_body",
    "filter_default_fail",
  ];
  if (!mutationKeys.some((key) => input[key] !== undefined)) {
    throw new ProviderRequestError(400, "At least one update field must be provided.");
  }
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function isAbortLikeError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    (String((error as { name?: unknown }).name) === "AbortError" ||
      String((error as { name?: unknown }).name) === "TimeoutError")
  );
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://healthchecks.io/api/v3",
  auth: { type: "api_key_header", name: "x-api-key" },
});
