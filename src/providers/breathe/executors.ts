import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "breathe";
const breatheApiBaseUrl = "https://api.breathehr.com/v1";
const breatheDefaultRequestTimeoutMs = 30_000;

type BreathePhase = "validate" | "execute";
type BreatheActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const breatheActionHandlers: ProviderActionHandlers<"breathe", BreatheActionHandler> = {
  async list_employees(input, context) {
    const payload = await requestBreatheJson({
      path: "/employees",
      context,
      params: compactObject({
        page: readOptionalNumberString(input.page),
        per_page: readOptionalNumberString(input.perPage),
        filter: optionalString(input.filter),
        rotacloud: readOptionalBooleanString(input.rotacloud),
      }) as Record<string, string>,
      phase: "execute",
    });

    return {
      employees: normalizeListPayload(payload, "employees"),
      raw: payload,
    };
  },
  async get_employee(input, context) {
    const payload = await requestBreatheJson({
      path: `/employees/${readRequiredInteger(input.employeeId, "employeeId")}`,
      context,
      params: {},
      phase: "execute",
    });

    return {
      employee: normalizeSinglePayload(payload, "employee"),
      raw: payload,
    };
  },
  async list_departments(input, context) {
    const payload = await requestBreatheJson({
      path: "/departments",
      context,
      params: compactObject({
        page: readOptionalNumberString(input.page),
        per_page: readOptionalNumberString(input.perPage),
      }) as Record<string, string>,
      phase: "execute",
    });

    return {
      departments: normalizeListPayload(payload, "departments"),
      raw: payload,
    };
  },
  async list_locations(_input, context) {
    const payload = await requestBreatheJson({
      path: "/locations",
      context,
      params: {},
      phase: "execute",
    });

    return {
      locations: normalizeListPayload(payload, "locations"),
      raw: payload,
    };
  },
  async get_account(_input, context) {
    const payload = await requestBreatheJson({
      path: "/account",
      context,
      params: {},
      phase: "execute",
    });

    return {
      account: normalizeSinglePayload(payload, "account"),
      raw: payload,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, breatheActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestBreatheJson({
      path: "/account",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      params: {},
      phase: "validate",
    });
    const account = normalizeSinglePayload(payload, "account");

    return {
      profile: {
        accountId: formatMetadataValue(account.id) ?? formatMetadataValue(account.uuid) ?? "breathe",
        displayName:
          optionalString(account.name) ??
          optionalString(account.domain) ??
          optionalString(account.uuid) ??
          "Breathe Account",
      },
      grantedScopes: [],
      metadata: compactObject({
        accountId: formatMetadataValue(account.id),
        accountDomain: optionalString(account.domain),
        accountUuid: optionalString(account.uuid),
        validationEndpoint: "/account",
      }),
    };
  },
};

async function requestBreatheJson(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  params: Record<string, string | undefined>;
  phase: BreathePhase;
}): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.context.signal, breatheDefaultRequestTimeoutMs);
  let response: Response;
  let payload: unknown;

  try {
    response = await input.context.fetcher(buildBreatheUrl(input.path, input.params), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-API-KEY": input.context.apiKey,
      },
      signal: timeout.signal,
    });
    payload = await readBreathePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Breathe request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Breathe request failed: ${error.message}` : "Breathe request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createBreatheError(response.status, payload, input.phase);
  }

  const payloadRecord = optionalRecord(payload);
  if (!payloadRecord) {
    throw new ProviderRequestError(502, "Breathe returned an invalid payload");
  }
  return payloadRecord;
}

function buildBreatheUrl(path: string, params: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${breatheApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, value);
  }
  return url;
}

async function readBreathePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Breathe returned invalid JSON");
  }
}

function createBreatheError(status: number, payload: unknown, phase: BreathePhase): ProviderRequestError {
  const message = extractBreatheErrorMessage(payload) ?? `Breathe request failed with status ${status}`;

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

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractBreatheErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage = optionalString(record.error) ?? optionalString(record.message) ?? optionalString(record.detail);
  if (directMessage) {
    return directMessage;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const first = errors.find((item) => typeof item === "string" && item.trim() !== "");
    if (typeof first === "string") {
      return first.trim();
    }
  }

  return undefined;
}

function normalizeListPayload(payload: Record<string, unknown>, preferredKey: string): Array<Record<string, unknown>> {
  const direct = payload[preferredKey];
  if (Array.isArray(direct)) {
    return normalizeRecordList(direct);
  }

  const data = payload.data;
  if (Array.isArray(data)) {
    return normalizeRecordList(data);
  }

  if (Object.keys(payload).length === 1) {
    const onlyValue = Object.values(payload)[0];
    if (Array.isArray(onlyValue)) {
      return normalizeRecordList(onlyValue);
    }
  }

  throw new ProviderRequestError(502, `Breathe returned an invalid ${preferredKey} payload`);
}

function normalizeSinglePayload(payload: Record<string, unknown>, preferredKey: string): Record<string, unknown> {
  const direct = optionalRecord(payload[preferredKey]);
  if (direct) {
    return direct;
  }

  const data = optionalRecord(payload.data);
  if (data) {
    return data;
  }

  if (Object.keys(payload).length > 0) {
    return payload;
  }

  throw new ProviderRequestError(502, `Breathe returned an invalid ${preferredKey} payload`);
}

function normalizeRecordList(items: unknown[]): Array<Record<string, unknown>> {
  return items.map((item) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, "Breathe returned a non-object list item");
    }
    return record;
  });
}

function readOptionalNumberString(value: unknown): string | undefined {
  return optionalInteger(value) !== undefined ? String(value) : undefined;
}

function readOptionalBooleanString(value: unknown): string | undefined {
  const parsed = optionalBoolean(value);
  return parsed === undefined ? undefined : String(parsed);
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function formatMetadataValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}
