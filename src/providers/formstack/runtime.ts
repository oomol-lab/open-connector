import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const formstackApiBaseUrl = "https://www.formstack.com/api/v2025";

export type FormstackRequestPhase = "validate" | "execute" | "trigger";

export const formstackActionHandlers: Record<
  string,
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  async list_forms(input, context) {
    const payload = requireObject(
      await requestFormstack({
        apiKey: context.apiKey,
        path: "/forms",
        method: "GET",
        fetcher: context.fetcher,
        phase: "execute",
        operation: "list forms",
        query: {
          pageNumber: optionalNumber(input.pageNumber),
          pageSize: optionalNumber(input.pageSize),
          search: optionalString(input.search),
          orderBy: optionalString(input.orderBy),
          order: optionalString(input.order),
          folder: optionalNumber(input.folderId),
        },
      }),
      "list forms",
    );
    return {
      page: requireObject(payload.page, "forms pagination"),
      forms: normalizeNullableArray(payload.forms, "forms"),
    };
  },
  async get_form(input, context) {
    const formId = requiredPositiveInteger(input.formId, "formId");
    const payload = requireObject(
      await requestFormstack({
        apiKey: context.apiKey,
        path: `/forms/${formId}`,
        method: "GET",
        fetcher: context.fetcher,
        phase: "execute",
        operation: "get form",
        query: {
          withFields: input.includeFields === undefined ? undefined : boolQuery(input.includeFields),
        },
      }),
      "form",
    );
    return { form: payload };
  },
  async list_form_fields(input, context) {
    const formId = requiredPositiveInteger(input.formId, "formId");
    const payload = requireObject(
      await requestFormstack({
        apiKey: context.apiKey,
        path: `/forms/${formId}/fields`,
        method: "GET",
        fetcher: context.fetcher,
        phase: "execute",
        operation: "list form fields",
      }),
      "list form fields",
    );
    return { fields: normalizeNullableArray(payload.fields, "form fields") };
  },
  async list_submissions(input, context) {
    const formId = requiredPositiveInteger(input.formId, "formId");
    const query: Record<string, string | number | undefined> = {
      pageNumber: optionalNumber(input.pageNumber),
      pageSize: optionalNumber(input.pageSize),
      order: optionalString(input.order),
      keyword: optionalString(input.keyword),
      minTime: optionalString(input.minTime),
      maxTime: optionalString(input.maxTime),
      data: optionalBooleanQuery(input.includeData),
      expandData: optionalBooleanQuery(input.expandData),
      prettyName: optionalBooleanQuery(input.prettyName),
      dataFormat: optionalString(input.dataFormat),
    };
    appendSearchCriteria(query, input.search);
    const payload = requireObject(
      await requestFormstack({
        apiKey: context.apiKey,
        path: `/forms/${formId}/submissions`,
        method: "GET",
        fetcher: context.fetcher,
        phase: "execute",
        operation: "list submissions",
        query,
        headers: encryptionHeaders(input.encryptionPassword),
      }),
      "list submissions",
    );
    return {
      page: requireObject(payload.page, "submissions pagination"),
      submissions: normalizeNullableArray(payload.submissions, "submissions"),
    };
  },
  async get_submission(input, context) {
    const submissionId = requiredPositiveInteger(input.submissionId, "submissionId");
    const submission = requireObject(
      await requestFormstack({
        apiKey: context.apiKey,
        path: `/submissions/${submissionId}`,
        method: "GET",
        fetcher: context.fetcher,
        phase: "execute",
        operation: "get submission",
        headers: encryptionHeaders(input.encryptionPassword),
      }),
      "submission",
    );
    return { submission };
  },
  async create_submission(input, context) {
    const formId = requiredPositiveInteger(input.formId, "formId");
    const submission = requireObject(
      await requestFormstack({
        apiKey: context.apiKey,
        path: `/forms/${formId}/submissions`,
        method: "POST",
        fetcher: context.fetcher,
        phase: "execute",
        operation: "create submission",
        body: compactObject({
          fields: input.fields,
          userAgent: input.userAgent,
          remoteAddr: input.remoteAddress,
          read: optionalBooleanQuery(input.read),
          longitude: input.longitude,
          latitude: input.latitude,
          deviceId: input.deviceId,
        }),
      }),
      "created submission",
    );
    return { submission };
  },
  async update_submission(input, context) {
    const submissionId = requiredPositiveInteger(input.submissionId, "submissionId");
    const submission = requireObject(
      await requestFormstack({
        apiKey: context.apiKey,
        path: `/submissions/${submissionId}`,
        method: "PUT",
        fetcher: context.fetcher,
        phase: "execute",
        operation: "update submission",
        headers: encryptionHeaders(input.encryptionPassword),
        body: compactObject({
          fields: input.fields,
          userAgent: input.userAgent,
          remoteAddr: input.remoteAddress,
          paymentStatus: input.paymentStatus,
          read: optionalBooleanQuery(input.read),
          timestamp: input.timestamp,
        }),
      }),
      "updated submission",
    );
    return { submission };
  },
  async delete_submission(input, context) {
    const submissionId = requiredPositiveInteger(input.submissionId, "submissionId");
    const payload = requireObject(
      await requestFormstack({
        apiKey: context.apiKey,
        path: `/submissions/${submissionId}`,
        method: "DELETE",
        fetcher: context.fetcher,
        phase: "execute",
        operation: "delete submission",
      }),
      "deleted submission",
    );
    const deletedId = requiredPositiveInteger(payload.id, "deleted submission id");
    return { deleted: deletedId === submissionId, submissionId: deletedId };
  },
};

export async function validateFormstackCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const payload = requireObject(
    await requestFormstack({
      apiKey: requireApiKey(input.apiKey),
      path: "/forms",
      method: "GET",
      fetcher,
      phase: "validate",
      operation: "validate credentials",
      query: { pageNumber: 1, pageSize: 10 },
    }),
    "credential validation",
  );
  normalizeNullableArray(payload.forms, "credential validation forms");
  return {
    profile: { displayName: "Formstack Personal Access Token" },
    metadata: {
      apiBaseUrl: formstackApiBaseUrl,
      validationEndpoint: "/forms",
      apiVersion: "v2025",
    },
  };
}

async function requestFormstack(options: {
  apiKey: string;
  path: string;
  method: string;
  fetcher: typeof fetch;
  phase: FormstackRequestPhase;
  operation: string;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(`${formstackApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const timeout = createProviderTimeout(undefined);
  try {
    const response = await options.fetcher(url, {
      method: options.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${requireApiKey(options.apiKey)}`,
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...options.headers,
        "user-agent": providerUserAgent,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: timeout.signal,
    });
    const text = await response.text();
    const payload = response.ok ? parseJson(text, options.operation) : parseErrorPayload(text);
    if (!response.ok) {
      throw mapFormstackError(response.status, payload, options.phase, options.operation);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || (error instanceof DOMException && error.name === "AbortError")) {
      throw new ProviderRequestError(504, `Formstack ${options.operation} request timed out.`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Formstack ${options.operation} request failed: ${error.message}`
        : `Formstack ${options.operation} request failed.`,
    );
  } finally {
    timeout.cleanup();
  }
}

function requireApiKey(value: unknown) {
  const apiKey = optionalString(value)?.trim();
  if (!apiKey) throw new ProviderRequestError(400, "apiKey is required");
  return apiKey;
}

function mapFormstackError(status: number, payload: unknown, phase: FormstackRequestPhase, operation: string) {
  const message = extractError(payload) ?? `Formstack ${operation} failed with HTTP ${status}.`;
  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status, message, payload);
}

function appendSearchCriteria(query: Record<string, string | number | undefined>, value: unknown) {
  if (!Array.isArray(value)) return;
  value.forEach((criterion, index) => {
    const item = optionalRecord(criterion);
    if (!item) return;
    query[`search[${index}][fieldId]`] = optionalString(item.fieldId);
    query[`search[${index}][value]`] = optionalString(item.value);
  });
}

function encryptionHeaders(value: unknown): Record<string, string> | undefined {
  const password = optionalString(value);
  return password ? { "X-FS-Encryption-Password": password } : undefined;
}

function optionalBooleanQuery(value: unknown) {
  return typeof value === "boolean" ? boolQuery(value) : undefined;
}

function boolQuery(value: unknown) {
  return value === true ? "true" : "false";
}

function optionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function requiredPositiveInteger(value: unknown, field: string) {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new ProviderRequestError(400, `${field} must be a positive integer`);
  }
  return value as number;
}

function requireArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Formstack ${name} response must be an array.`, value);
  }
  return value;
}

function normalizeNullableArray(value: unknown, name: string): unknown[] {
  return value === null ? [] : requireArray(value, name);
}

function requireObject(value: unknown, name: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Formstack ${name} response must be an object.`, value);
  }
  return object;
}

function parseJson(text: string, operation: string): unknown {
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, `Formstack ${operation} returned invalid JSON.`);
  }
}

function parseErrorPayload(text: string): unknown {
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractError(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload || undefined;
  const object = optionalRecord(payload);
  const errors = Array.isArray(object?.errors) ? object.errors : [];
  const firstError = optionalRecord(errors[0]);
  return optionalString(object?.message) ?? optionalString(object?.error) ?? optionalString(firstError?.message);
}
