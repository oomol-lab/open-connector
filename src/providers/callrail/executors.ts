import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { CallrailActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "callrail";
const callrailApiBaseUrl = "https://api.callrail.com";
const requestTimeoutMs = 30_000;

type CallrailRequestPhase = "validate" | "execute";
type CallrailActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const callrailActionHandlers: Record<CallrailActionName, CallrailActionHandler> = {
  async list_accounts(input, context) {
    const payload = await requestCallrailJson({
      context,
      path: "/v3/a.json",
      phase: "execute",
      query: buildListAccountsQuery(input),
    });

    return normalizeAccountsPayload(payload);
  },

  async list_companies(input, context) {
    const payload = await requestCallrailJson({
      context,
      path: `/v3/a/${encodeURIComponent(readRequiredText(input.accountId, "accountId"))}/companies.json`,
      phase: "execute",
      query: buildPaginationQuery(input),
    });

    return normalizeCompaniesPayload(payload);
  },

  async list_calls(input, context) {
    const payload = await requestCallrailJson({
      context,
      path: `/v3/a/${encodeURIComponent(readRequiredText(input.accountId, "accountId"))}/calls.json`,
      phase: "execute",
      query: buildListCallsQuery(input),
    });

    return normalizeCallsPayload(payload);
  },

  async get_call(input, context) {
    const payload = await requestCallrailJson({
      context,
      path: `/v3/a/${encodeURIComponent(readRequiredText(input.accountId, "accountId"))}/calls/${encodeURIComponent(
        readRequiredText(input.callId, "callId"),
      )}.json`,
      phase: "execute",
      query: buildFieldsQuery(input),
    });
    const call = normalizeCall(optionalRecord(payload) ?? {});

    return {
      call,
      raw: optionalRecord(payload) ?? {},
    };
  },

  async list_form_submissions(input, context) {
    const payload = await requestCallrailJson({
      context,
      path: `/v3/a/${encodeURIComponent(readRequiredText(input.accountId, "accountId"))}/form_submissions.json`,
      phase: "execute",
      query: buildListFormSubmissionsQuery(input),
    });

    return normalizeFormSubmissionsPayload(payload);
  },

  async get_form_submission(input, context) {
    const payload = await requestCallrailJson({
      context,
      path: `/v3/a/${encodeURIComponent(
        readRequiredText(input.accountId, "accountId"),
      )}/form_submissions/${encodeURIComponent(readRequiredText(input.formSubmissionId, "formSubmissionId"))}.json`,
      phase: "execute",
    });
    const formSubmission = normalizeFormSubmission(optionalRecord(payload) ?? {});

    return {
      formSubmission,
      raw: optionalRecord(payload) ?? {},
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, callrailActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: callrailApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: 'Token token="', suffix: '"' },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestCallrailJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: "/v3/a.json",
      phase: "validate",
      query: {
        per_page: "1",
      },
    });
    const accounts = readObjectArray(payload, "accounts");
    const firstAccount = accounts[0];
    const accountId = optionalString(firstAccount?.id);
    const accountName = optionalString(firstAccount?.name);

    return {
      profile: {
        accountId: accountId ?? "callrail",
        displayName: accountName ?? "CallRail API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: callrailApiBaseUrl,
        validationEndpoint: "/v3/a.json",
        accountId,
        accountName,
      }),
    };
  },
};

async function requestCallrailJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: CallrailRequestPhase;
  query?: Record<string, string | undefined>;
}): Promise<unknown> {
  const url = new URL(input.path, callrailApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.context.signal, requestTimeoutMs);

  try {
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: callrailHeaders(input.context.apiKey),
      signal: timeout.signal,
    });
    const payload = await readCallrailPayload(response);

    if (!response.ok) {
      throw mapCallrailError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "CallRail request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `CallRail request failed: ${error.message}` : "CallRail request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function callrailHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Token token="${apiKey}"`,
    "user-agent": providerUserAgent,
  };
}

async function readCallrailPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "CallRail returned a non-JSON response");
  }
}

function mapCallrailError(status: number, payload: unknown, phase: CallrailRequestPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `CallRail request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 404) {
    return new ProviderRequestError(404, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return optionalString(object.error) ?? optionalString(object.message) ?? optionalString(object.detail);
}

function buildListAccountsQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    ...buildPaginationQuery(input),
    hipaa_account: input.hipaaAccount === undefined ? undefined : String(input.hipaaAccount),
  };
}

function buildListCallsQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    ...buildPaginationQuery(input),
    ...buildFieldsQuery(input),
    company_id: optionalString(input.companyId),
    tracker_id: optionalString(input.trackerId),
    start_date: optionalString(input.startDate),
    end_date: optionalString(input.endDate),
    relative_pagination: input.relativePagination === undefined ? undefined : String(input.relativePagination),
  };
}

function buildListFormSubmissionsQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    ...buildPaginationQuery(input),
    ...buildFieldsQuery(input),
    company_id: optionalString(input.companyId),
    start_date: optionalString(input.startDate),
    end_date: optionalString(input.endDate),
  };
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    page: input.page === undefined ? undefined : String(input.page),
    per_page: input.perPage === undefined ? undefined : String(input.perPage),
  };
}

function buildFieldsQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    fields: Array.isArray(input.fields) ? input.fields.map(String).join(",") : undefined,
  };
}

function normalizeAccountsPayload(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload) ?? {};

  return {
    ...normalizePagination(object),
    accounts: readObjectArray(object, "accounts").map(normalizeAccount),
    raw: object,
  };
}

function normalizeCompaniesPayload(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload) ?? {};

  return {
    ...normalizePagination(object),
    companies: readObjectArray(object, "companies").map(normalizeCompany),
    raw: object,
  };
}

function normalizeCallsPayload(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload) ?? {};

  return {
    ...normalizePagination(object),
    calls: readObjectArray(object, "calls").map(normalizeCall),
    raw: object,
  };
}

function normalizeFormSubmissionsPayload(payload: unknown): Record<string, unknown> {
  const object = optionalRecord(payload) ?? {};

  return {
    ...normalizePagination(object),
    formSubmissions: readObjectArray(object, "form_submissions").map(normalizeFormSubmission),
    raw: object,
  };
}

function normalizePagination(input: Record<string, unknown>): Record<string, unknown> {
  return {
    page: asNullableInteger(input.page),
    perPage: asNullableInteger(input.per_page),
    totalPages: asNullableInteger(input.total_pages),
    totalRecords: asNullableInteger(input.total_records),
    hasNextPage: typeof input.has_next_page === "boolean" ? input.has_next_page : null,
    nextPageUrl: asNullableString(input.next_page),
  };
}

function normalizeAccount(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: asNullableString(input.id),
    name: asNullableString(input.name),
    outboundRecordingEnabled: asNullableBoolean(input.outbound_recording_enabled),
    hipaaAccount: asNullableBoolean(input.hipaa_account),
    raw: input,
  };
}

function normalizeCompany(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: asNullableString(input.id),
    name: asNullableString(input.name),
    status: asNullableString(input.status),
    timeZone: asNullableString(input.time_zone),
    createdAt: asNullableString(input.created_at),
    disabledAt: asNullableString(input.disabled_at),
    raw: input,
  };
}

function normalizeCall(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: asNullableString(input.id),
    companyId: asNullableString(input.company_id),
    customerName: asNullableString(input.customer_name),
    customerPhoneNumber: asNullableString(input.customer_phone_number),
    trackingPhoneNumber: asNullableString(input.tracking_phone_number),
    businessPhoneNumber: asNullableString(input.business_phone_number),
    direction: asNullableString(input.direction),
    answered: asNullableBoolean(input.answered),
    duration: asNullableInteger(input.duration),
    startTime: asNullableString(input.start_time),
    source: asNullableString(input.source),
    recording: asNullableString(input.recording),
    raw: input,
  };
}

function normalizeFormSubmission(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: asNullableString(input.id),
    companyId: asNullableString(input.company_id),
    personId: asNullableString(input.person_id),
    customerName: asNullableString(input.customer_name),
    customerEmail: asNullableString(input.customer_email),
    customerPhoneNumber: asNullableString(input.customer_phone_number),
    formUrl: asNullableString(input.form_url),
    landingPageUrl: asNullableString(input.landing_page_url),
    submittedAt: asNullableString(input.submitted_at),
    source: asNullableString(input.source),
    formData: optionalRecord(input.form_data) ?? {},
    raw: input,
  };
}

function readObjectArray(input: unknown, key: string): Array<Record<string, unknown>> {
  const object = optionalRecord(input);
  const value = object?.[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => optionalRecord(item) ?? {});
}

function readRequiredText(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function asNullableString(value: unknown): string | null {
  return value === null ? null : (optionalString(value) ?? null);
}

function asNullableInteger(value: unknown): number | null {
  const number = optionalNumber(value);
  return number !== undefined && Number.isInteger(number) ? number : null;
}

function asNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
