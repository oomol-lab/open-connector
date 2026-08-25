import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const superSaasApiBaseUrl = "https://www.supersaas.com";

interface SuperSaasContext extends Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal"> {
  accountName: string;
}

type SuperSaasActionHandler = (input: Record<string, unknown>, context: SuperSaasContext) => Promise<unknown>;

export const superSaasActionHandlers: ProviderActionHandlers<"super_saas", SuperSaasActionHandler> = {
  list_schedules(input, context) {
    return requestTupleList(input, context, "/api/schedules.json", "schedules");
  },
  list_super_forms(input, context) {
    return requestTupleList(input, context, "/api/super_forms.json", "superForms");
  },
  list_groups(input, context) {
    return requestTupleList(input, context, "/api/groups.json", "groups");
  },
  list_resources(input, context) {
    return requestTupleList(input, context, "/api/resources.json", "resources");
  },
  list_field_names(input, context) {
    return listFieldNames(input, context);
  },
  list_recent_changes(input, context) {
    return requestBookingList(input, context, `/api/changes/${input.schedule_id}.json`);
  },
  list_appointments(input, context) {
    return requestBookingList(input, context, `/api/range/${input.schedule_id}.json`);
  },
};

export async function validateSuperSaasCredential(
  input: { apiKey?: string; accountName?: string },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requireSuperSaasSecret(input.apiKey, "apiKey");
  const accountName = requireSuperSaasSecret(input.accountName, "accountName");
  await requestSuperSaas(
    buildSuperSaasUrl("/api/schedules.json", {
      api_key: apiKey,
      account: accountName,
    }),
    fetcher,
    signal,
  );

  return {
    profile: {
      accountId: `super_saas:${accountName}`,
      displayName: `SuperSaaS ${accountName}`,
    },
    grantedScopes: [],
    metadata: {
      accountName,
      apiBaseUrl: superSaasApiBaseUrl,
    },
  };
}

async function requestTupleList(
  input: Record<string, unknown>,
  context: SuperSaasContext,
  path: string,
  outputKey: "schedules" | "superForms" | "groups" | "resources",
): Promise<Record<string, unknown>> {
  const payload = await requestSuperSaas(buildActionUrl(input, context, path), context.fetcher, context.signal);
  return {
    [outputKey]: normalizeTupleArray(payload),
  };
}

async function listFieldNames(input: Record<string, unknown>, context: SuperSaasContext): Promise<unknown> {
  const payload = await requestSuperSaas(
    buildActionUrl(input, context, "/api/field_list.json"),
    context.fetcher,
    context.signal,
  );
  return {
    fields: normalizeObjectPayload(payload),
  };
}

async function requestBookingList(
  input: Record<string, unknown>,
  context: SuperSaasContext,
  path: string,
): Promise<unknown> {
  const payload = normalizeObjectPayload(
    await requestSuperSaas(buildActionUrl(input, context, path), context.fetcher, context.signal),
  );
  return {
    bookings: normalizeObjectArray(payload.bookings),
    slots: normalizeObjectArray(payload.slots),
    raw: payload,
  };
}

function buildActionUrl(input: Record<string, unknown>, context: SuperSaasContext, path: string): URL {
  const url = buildSuperSaasUrl(path, {
    api_key: requireSuperSaasSecret(context.apiKey, "apiKey"),
    account: requireSuperSaasSecret(context.accountName, "accountName"),
  });

  for (const [key, value] of Object.entries(input)) {
    if (key === "schedule_id" || value === undefined || value === null) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  if (path === "/api/resources.json" || path === "/api/field_list.json") {
    const scheduleId = input.schedule_id;
    if (scheduleId !== undefined) {
      url.searchParams.set("schedule_id", String(scheduleId));
    }
  }

  return url;
}

function buildSuperSaasUrl(path: string, query: Record<string, string>): URL {
  const url = new URL(path, superSaasApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function requestSuperSaas(url: URL, fetcher: ProviderFetch, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `super_saas request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  }

  const payload = await readSuperSaasPayload(response);
  if (!response.ok) {
    throw mapSuperSaasError(response.status, readErrorMessage(payload), payload);
  }
  if (isSuperSaasErrorPayload(payload)) {
    throw mapSuperSaasError(400, readErrorMessage(payload), payload);
  }
  return payload;
}

async function readSuperSaasPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "super_saas returned malformed JSON");
    }
    return { error: text };
  }
}

function requireSuperSaasSecret(value: string | undefined, fieldName: string): string {
  if (!value?.trim()) {
    throw new ProviderRequestError(400, `super_saas ${fieldName} is required`);
  }
  return value.trim();
}

function normalizeTupleArray(payload: unknown): unknown[][] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "super_saas returned a non-array tuple list", payload);
  }
  return payload.map((item) => (Array.isArray(item) ? item : [item]));
}

function normalizeObjectPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "super_saas returned a non-object response", payload);
  }
  return record;
}

function normalizeObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "super_saas returned a non-array booking list", value);
  }
  return value.map((item) => normalizeObjectPayload(item));
}

function isSuperSaasErrorPayload(payload: unknown): boolean {
  const record = optionalRecord(payload);
  return Boolean(record && (record.error !== undefined || record.errors !== undefined));
}

function readErrorMessage(payload: unknown): string {
  const record = optionalRecord(payload);
  if (!record) {
    return "SuperSaaS request failed";
  }
  for (const key of ["error", "message", "errors"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "SuperSaaS request failed";
}

function mapSuperSaasError(status: number, message: string, details?: unknown): ProviderRequestError {
  if (status === 400 || status === 401 || status === 403) {
    return new ProviderRequestError(400, message, details);
  }
  return new ProviderRequestError(status === 404 ? 502 : status || 502, message, details);
}
