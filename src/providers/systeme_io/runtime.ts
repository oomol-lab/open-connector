import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const systemeIoApiBaseUrl = "https://api.systeme.io";

type SystemeIoPhase = "validate" | "execute";
type SystemeIoMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type SystemeIoActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface SystemeIoRequestInput {
  method: SystemeIoMethod;
  path: string;
  apiKey: string;
  params: Record<string, string | undefined>;
  fetcher: typeof fetch;
  phase: SystemeIoPhase;
  signal?: AbortSignal;
  body?: Record<string, unknown>;
}

export const systemeIoActionHandlers: ProviderActionHandlers<"systeme_io", SystemeIoActionHandler> = {
  async list_contacts(input, context) {
    const { items, hasMore } = extractPaginatedPayload(
      await requestSystemeIoJson({
        method: "GET",
        path: "/api/contacts",
        apiKey: context.apiKey,
        params: pageParams(input),
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );
    return { contacts: items, hasMore: hasMore ?? false };
  },
  async get_contact(input, context) {
    return {
      contact: await getRecord(
        context,
        `/api/contacts/${encodeURIComponent(readRequiredString(input.contactId, "contactId"))}`,
      ),
    };
  },
  async create_contact(input, context) {
    const payload = await requestSystemeIoJson({
      method: "POST",
      path: "/api/contacts",
      apiKey: context.apiKey,
      params: {},
      body: compactObject({
        email: readRequiredString(input.email, "email"),
        firstName: optionalString(input.firstName),
        lastName: optionalString(input.lastName),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { contact: normalizeRecord(payload) };
  },
  async update_contact(input, context) {
    const payload = await requestSystemeIoJson({
      method: "PATCH",
      path: `/api/contacts/${encodeURIComponent(readRequiredString(input.contactId, "contactId"))}`,
      apiKey: context.apiKey,
      params: {},
      body: compactObject({
        email: optionalString(input.email),
        firstName: optionalString(input.firstName),
        lastName: optionalString(input.lastName),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { contact: normalizeRecord(payload) };
  },
  async delete_contact(input, context) {
    await deletePath(context, `/api/contacts/${encodeURIComponent(readRequiredString(input.contactId, "contactId"))}`);
    return { success: true };
  },
  async attach_contact_tag(input, context) {
    await requestSystemeIoJson({
      method: "POST",
      path: `/api/contacts/${encodeURIComponent(readRequiredString(input.contactId, "contactId"))}/tags`,
      apiKey: context.apiKey,
      params: {},
      body: { tagId: readRequiredString(input.tagId, "tagId") },
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { success: true };
  },
  async detach_contact_tag(input, context) {
    await deletePath(
      context,
      `/api/contacts/${encodeURIComponent(readRequiredString(input.contactId, "contactId"))}/tags/${encodeURIComponent(
        readRequiredString(input.tagId, "tagId"),
      )}`,
    );
    return { success: true };
  },
  async list_contact_fields(_input, context) {
    const { items } = extractPaginatedPayload(
      await requestSystemeIoJson({
        method: "GET",
        path: "/api/contact_fields",
        apiKey: context.apiKey,
        params: {},
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );
    return { fields: items };
  },
  async list_tags(input, context) {
    const { items, hasMore } = extractPaginatedPayload(
      await requestSystemeIoJson({
        method: "GET",
        path: "/api/tags",
        apiKey: context.apiKey,
        params: pageParams(input),
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );
    return { tags: items, hasMore: hasMore ?? false };
  },
  async get_tag(input, context) {
    return {
      tag: await getRecord(context, `/api/tags/${encodeURIComponent(readRequiredString(input.tagId, "tagId"))}`),
    };
  },
  async create_tag(input, context) {
    const payload = await requestSystemeIoJson({
      method: "POST",
      path: "/api/tags",
      apiKey: context.apiKey,
      params: {},
      body: { name: readRequiredString(input.name, "name") },
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { tag: normalizeRecord(payload) };
  },
  async delete_tag(input, context) {
    await deletePath(context, `/api/tags/${encodeURIComponent(readRequiredString(input.tagId, "tagId"))}`);
    return { success: true };
  },
  async update_tag(input, context) {
    const payload = await requestSystemeIoJson({
      method: "PUT",
      path: `/api/tags/${encodeURIComponent(readRequiredString(input.tagId, "tagId"))}`,
      apiKey: context.apiKey,
      params: {},
      body: { name: readRequiredString(input.name, "name") },
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { tag: normalizeRecord(payload) };
  },
  async list_webhooks(input, context) {
    const { items, hasMore } = extractPaginatedPayload(
      await requestSystemeIoJson({
        method: "GET",
        path: "/api/webhooks",
        apiKey: context.apiKey,
        params: pageParams(input),
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );
    return { webhooks: items, hasMore: hasMore ?? false };
  },
  async get_webhook(input, context) {
    return {
      webhook: await getRecord(
        context,
        `/api/webhooks/${encodeURIComponent(readRequiredString(input.webhookId, "webhookId"))}`,
      ),
    };
  },
  async create_webhook(input, context) {
    const payload = await requestSystemeIoJson({
      method: "POST",
      path: "/api/webhooks",
      apiKey: context.apiKey,
      params: {},
      body: compactObject({
        name: readRequiredString(input.name, "name"),
        url: readRequiredString(input.url, "url"),
        events: Array.isArray(input.events) ? input.events : undefined,
        active: typeof input.active === "boolean" ? input.active : undefined,
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { webhook: normalizeRecord(payload) };
  },
  async update_webhook(input, context) {
    const payload = await requestSystemeIoJson({
      method: "PATCH",
      path: `/api/webhooks/${encodeURIComponent(readRequiredString(input.webhookId, "webhookId"))}`,
      apiKey: context.apiKey,
      params: {},
      body: compactObject({
        name: optionalString(input.name),
        url: optionalString(input.url),
        events: Array.isArray(input.events) ? input.events : undefined,
        active: typeof input.active === "boolean" ? input.active : undefined,
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { webhook: normalizeRecord(payload) };
  },
  async delete_webhook(input, context) {
    await deletePath(context, `/api/webhooks/${encodeURIComponent(readRequiredString(input.webhookId, "webhookId"))}`);
    return { success: true };
  },
  async list_courses(input, context) {
    const { items, hasMore } = extractPaginatedPayload(
      await requestSystemeIoJson({
        method: "GET",
        path: "/api/school/courses",
        apiKey: context.apiKey,
        params: pageParams(input),
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );
    return { courses: items, hasMore: hasMore ?? false };
  },
  async list_enrollments(input, context) {
    const { items, hasMore } = extractPaginatedPayload(
      await requestSystemeIoJson({
        method: "GET",
        path: `/api/school/courses/${encodeURIComponent(readRequiredString(input.courseId, "courseId"))}/enrollments`,
        apiKey: context.apiKey,
        params: pageParams(input),
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );
    return { enrollments: items, hasMore: hasMore ?? false };
  },
  async create_enrollment(input, context) {
    const payload = await requestSystemeIoJson({
      method: "POST",
      path: `/api/school/courses/${encodeURIComponent(readRequiredString(input.courseId, "courseId"))}/enrollments`,
      apiKey: context.apiKey,
      params: {},
      body: compactObject({
        contactId: readRequiredString(input.contactId, "contactId"),
        accessType: optionalString(input.accessType),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { enrollment: normalizeRecord(payload) };
  },
  async delete_enrollment(input, context) {
    await deletePath(
      context,
      `/api/school/courses/${encodeURIComponent(readRequiredString(input.courseId, "courseId"))}/enrollments/${encodeURIComponent(
        readRequiredString(input.enrollmentId, "enrollmentId"),
      )}`,
    );
    return { success: true };
  },
  async list_subscriptions(input, context) {
    const { items, hasMore } = extractPaginatedPayload(
      await requestSystemeIoJson({
        method: "GET",
        path: "/api/payment/subscriptions",
        apiKey: context.apiKey,
        params: pageParams(input),
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
      }),
    );
    return { subscriptions: items, hasMore: hasMore ?? false };
  },
  async cancel_subscription(input, context) {
    await requestSystemeIoJson({
      method: "POST",
      path: `/api/payment/subscriptions/${encodeURIComponent(readRequiredString(input.subscriptionId, "subscriptionId"))}/cancel`,
      apiKey: context.apiKey,
      params: {},
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return { success: true };
  },
};

export async function validateSystemeIoCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const { items } = extractPaginatedPayload(
    await requestSystemeIoJson({
      method: "GET",
      path: "/api/tags",
      apiKey: input.apiKey,
      params: { limit: "1" },
      fetcher,
      signal,
      phase: "validate",
    }),
  );
  return {
    profile: {
      accountId: "systeme_io",
      displayName: "Systeme.io API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/api/tags",
      tagCount: items.length,
    },
  };
}

async function getRecord(context: ApiKeyProviderContext, path: string): Promise<Record<string, unknown>> {
  return normalizeRecord(
    await requestSystemeIoJson({
      method: "GET",
      path,
      apiKey: context.apiKey,
      params: {},
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    }),
  );
}

async function deletePath(context: ApiKeyProviderContext, path: string): Promise<void> {
  await requestSystemeIoJson({
    method: "DELETE",
    path,
    apiKey: context.apiKey,
    params: {},
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

function pageParams(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    page: readOptionalNumberString(input.page),
    limit: readOptionalNumberString(input.limit),
  });
}

async function requestSystemeIoJson(input: SystemeIoRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal);
  try {
    const headers: Record<string, string> = {
      "x-api-key": input.apiKey,
      "user-agent": providerUserAgent,
    };
    const init: RequestInit = {
      method: input.method,
      headers,
      signal: timeout.signal,
    };
    if (input.body !== undefined && (input.method === "POST" || input.method === "PUT" || input.method === "PATCH")) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(input.body);
    }

    const response = await input.fetcher(buildSystemeIoUrl(input.path, input.params), init);
    const payload = await readSystemeIoPayload(response, { strictJson: response.ok });
    if (!response.ok) throw createSystemeIoError(response.status, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error))
      throw new ProviderRequestError(504, "Systeme.io request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Systeme.io request failed: ${error.message}` : "Systeme.io request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildSystemeIoUrl(path: string, params: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${systemeIoApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url;
}

async function readSystemeIoPayload(response: Response, options: { strictJson: boolean }): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!options.strictJson) return text;
    throw new ProviderRequestError(502, "Systeme.io returned invalid JSON");
  }
}

function createSystemeIoError(status: number, payload: unknown, phase: SystemeIoPhase): ProviderRequestError {
  const message = extractSystemeIoErrorMessage(payload) ?? `Systeme.io request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function extractSystemeIoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function extractPaginatedPayload(payload: unknown): {
  items: Record<string, unknown>[];
  hasMore: boolean | undefined;
} {
  const record = optionalRecord(payload);
  if (!record) {
    return Array.isArray(payload)
      ? { items: payload.map((item) => normalizeRecord(item)), hasMore: undefined }
      : { items: [], hasMore: undefined };
  }

  const hasMore = typeof record.hasMore === "boolean" ? record.hasMore : undefined;
  if (Array.isArray(record.items)) return { items: record.items.map((item) => normalizeRecord(item)), hasMore };
  for (const key of ["data", "result", "results"]) {
    if (Array.isArray(record[key])) return { items: record[key].map((item) => normalizeRecord(item)), hasMore };
  }
  return { items: [record], hasMore };
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? { value };
}

function readRequiredString(value: unknown, fieldName: string): string {
  const trimmed = optionalString(value);
  if (!trimmed) throw new ProviderRequestError(400, `${fieldName} is required`);
  return trimmed;
}

function readOptionalNumberString(value: unknown): string | undefined {
  return typeof value === "number" ? String(value) : undefined;
}
