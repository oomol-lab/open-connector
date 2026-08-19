import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "formspree";
const formspreeApiBaseUrl = "https://formspree.io/api/0/";

interface FormspreeContext {
  apiKey: string;
  formId?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type FormspreeActionHandler = (input: Record<string, unknown>, context: FormspreeContext) => Promise<unknown>;

export const formspreeActionHandlers: ProviderActionHandlers<"formspree", FormspreeActionHandler> = {
  list_submissions(input, context) {
    return listSubmissions(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<FormspreeContext>({
  service,
  handlers: formspreeActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FormspreeContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      formId: optionalString(credential.values.formId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const formId = requireNonEmptyString(input.values.formId, "formId");
    const response = await formspreeFetch(buildSubmissionsPath(formId, { limit: 1 }), {
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
    const payload = await readFormspreePayload(response);
    if (!response.ok) {
      throw createFormspreeError(response, payload, "validate");
    }

    return {
      profile: {
        accountId: formId,
        displayName: `Formspree ${formId}`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: formspreeApiBaseUrl,
        formId,
      },
    };
  },
};

async function listSubmissions(input: Record<string, unknown>, context: FormspreeContext): Promise<unknown> {
  const formId = optionalString(input.form_id) ?? context.formId;
  const payload = await requestJson(
    buildSubmissionsPath(
      requireNonEmptyString(formId, "form_id"),
      compactObject({
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        since: optionalString(input.since),
        order: optionalString(input.order),
        spam: optionalBoolean(input.spam),
      }),
    ),
    context,
    "execute",
  );
  const page = normalizeSubmissionsPayload(payload);
  return {
    fields: page.fields,
    submissions: page.submissions.map(normalizeSubmission),
    page: page.info,
    raw: normalizeRawObject(payload),
  };
}

async function requestJson(path: string, context: FormspreeContext, phase: "validate" | "execute"): Promise<unknown> {
  const response = await formspreeFetch(path, context);
  const payload = await readFormspreePayload(response);
  if (!response.ok) {
    throw createFormspreeError(response, payload, phase);
  }
  return payload;
}

async function formspreeFetch(
  path: string,
  input: { apiKey: string; fetcher: typeof fetch; signal?: AbortSignal },
): Promise<Response> {
  const url = new URL(path, formspreeApiBaseUrl);
  const timeoutSignal = AbortSignal.timeout(30_000);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${input.apiKey}`,
    "user-agent": providerUserAgent,
  });

  try {
    return await input.fetcher(url, {
      headers,
      signal,
    });
  } catch (error) {
    if (timeoutSignal.aborted && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Formspree request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Formspree request failed: ${error.message}` : "Formspree request failed",
      error,
    );
  }
}

async function readFormspreePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Formspree returned malformed JSON");
    }
    return { message: text };
  }
}

function buildSubmissionsPath(formId: string, query: Record<string, unknown>): string {
  return buildPath(`forms/${encodeURIComponent(formId)}/submissions`, query);
}

function buildPath(path: string, query: Record<string, unknown>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }
  const queryString = searchParams.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function normalizeSubmissionsPayload(payload: unknown): {
  fields: string[];
  submissions: Array<Record<string, unknown>>;
  info: {
    count: number | null;
    limit: number | null;
    offset: number | null;
  };
} {
  const record = normalizeObject(payload, "Formspree submissions");
  const rawSubmissions = Array.isArray(record.submissions) ? record.submissions : [];
  const rawFields = Array.isArray(record.fields) ? record.fields : [];

  return {
    fields: rawFields.map((field) => String(field)),
    submissions: rawSubmissions.map((item) => normalizeObject(item, "Formspree submission")),
    info: {
      count: nullableInteger(record.count),
      limit: nullableInteger(record.limit),
      offset: nullableInteger(record.offset),
    },
  };
}

function normalizeSubmission(value: unknown): Record<string, unknown> {
  const record = normalizeObject(value, "Formspree submission");
  return {
    email: nullableString(record.email),
    name: nullableString(record.name),
    message: nullableString(record.message),
    status: pickNullableString(record, "_status", "status"),
    submitted_at: pickNullableString(record, "_date", "submitted_at", "submittedAt"),
    data: normalizeSubmissionData(record),
    raw: record,
  };
}

function normalizeSubmissionData(record: Record<string, unknown>): Record<string, unknown> {
  const omitted = new Set(["_date", "_status"]);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !omitted.has(key)));
}

function normalizeObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} response must be an object`, value);
  }
  return record;
}

function normalizeRawObject(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? { results: value };
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function nullableString(value: unknown): string | null {
  return value === undefined ? null : (optionalString(value) ?? null);
}

function nullableInteger(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function pickNullableString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return nullableString(record[key]);
    }
  }
  return null;
}

function createFormspreeError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `Formspree request failed with ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(
    phase === "validate" ? 400 : response.status >= 400 && response.status < 500 ? response.status : 502,
    message,
    payload,
  );
}

function extractErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail))
    : undefined;
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
