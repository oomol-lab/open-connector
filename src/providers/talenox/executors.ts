import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { optionalRawString, optionalRecord, positiveInteger } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "talenox";
const talenoxApiBaseUrl = "https://api.talenox.com/api/v2";
const talenoxDefaultRequestTimeoutMs = 30_000;
const talenoxValidationPath = "/company_settings";

interface TalenoxRequestOptions {
  path: string;
  apiKey: string;
  fetcher: ProviderFetch;
  phase: "validate" | "execute";
  signal?: AbortSignal;
}

type TalenoxActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const talenoxActionHandlers: ProviderActionHandlers<"talenox", TalenoxActionHandler> = {
  async list_company_settings(_input, context) {
    const payload = await requestTalenoxJson({
      path: "/company_settings",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return { companySettings: readObjectPayload(payload, "company settings") };
  },
  async list_branches(_input, context) {
    return listTalenoxCollection("/branches", "branches", context);
  },
  async get_branch(input, context) {
    return getTalenoxEntity(`/branches/${readPositiveId(input.id, "id")}`, "branch", context);
  },
  async list_employees(_input, context) {
    return listTalenoxCollection("/employees", "employees", context);
  },
  async get_employee(input, context) {
    return getTalenoxEntity(`/employees/${readPositiveId(input.id, "id")}`, "employee", context);
  },
  async list_working_days(_input, context) {
    return listTalenoxCollection("/working_days", "workingDays", context);
  },
  async get_working_day(input, context) {
    return getTalenoxEntity(`/working_days/${readPositiveId(input.id, "id")}`, "workingDay", context);
  },
  async list_working_hours(_input, context) {
    return listTalenoxCollection("/working_hours", "workingHours", context);
  },
  async get_working_hour(input, context) {
    return getTalenoxEntity(`/working_hours/${readPositiveId(input.id, "id")}`, "workingHour", context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, talenoxActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: talenoxApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTalenoxCredential(input.apiKey, fetcher, signal);
  },
};

async function validateTalenoxCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestTalenoxJson({
    path: talenoxValidationPath,
    apiKey,
    fetcher,
    phase: "validate",
    signal,
  });
  const companySettings = readObjectPayload(payload, "company settings");

  return {
    profile: {
      accountId: "talenox:api_token",
      displayName: "Talenox API Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: talenoxApiBaseUrl,
      validationEndpoint: talenoxValidationPath,
      companySettings,
    },
  };
}

async function listTalenoxCollection(
  path: string,
  outputKey: "branches" | "employees" | "workingDays" | "workingHours",
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestTalenoxJson({
    path,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
  return { [outputKey]: readObjectArrayPayload(payload, outputKey) };
}

async function getTalenoxEntity(
  path: string,
  outputKey: "branch" | "employee" | "workingDay" | "workingHour",
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestTalenoxJson({
    path,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
  return { [outputKey]: readObjectPayload(payload, outputKey) };
}

async function requestTalenoxJson(options: TalenoxRequestOptions): Promise<unknown> {
  const url = new URL(`${talenoxApiBaseUrl}${options.path}`);
  const timeout = createProviderTimeout(options.signal, talenoxDefaultRequestTimeoutMs);
  try {
    const response = await options.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readResponsePayload(response);
    if (!response.ok) {
      throw mapTalenoxError(response.status, payload, options.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Talenox request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Talenox request failed: ${error.message}` : "Talenox request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Talenox returned malformed JSON");
    }
    return { message: text };
  }
}

function mapTalenoxError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Talenox API request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 404 || status === 429) {
    return new ProviderRequestError(status, message);
  }
  if (status === 400 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function readErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }
  if (typeof body.error === "string" && body.error !== "") {
    return body.error;
  }
  const nestedMessage = optionalRawString(optionalRecord(body.error)?.message);
  return nestedMessage || optionalRawString(body.message);
}

function readObjectPayload(value: unknown, resourceName: string): Record<string, unknown> {
  const body = optionalRecord(value);
  if (!body) {
    throw new ProviderRequestError(502, `Talenox returned an invalid ${resourceName} payload`);
  }
  return body;
}

function readObjectArrayPayload(value: unknown, resourceName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Talenox returned an invalid ${resourceName} payload`);
  }
  return value.map((item) => readObjectPayload(item, resourceName));
}

function readPositiveId(value: unknown, fieldName: string): number {
  return positiveInteger(value, fieldName, (message) => new ProviderRequestError(400, message));
}
