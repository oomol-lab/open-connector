import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export interface TickCredential {
  apiKey: string;
  subscriptionId: string;
  email: string;
}
export interface TickContext {
  credential: TickCredential;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}
interface TickRequestInput extends TickContext {
  path: string;
  method?: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  phase: "validate" | "execute";
}
type Handler = (input: Record<string, unknown>, context: TickContext) => Promise<unknown>;

export const handlers: ProviderActionHandlers<"tick", Handler> = {
  list_clients(input, context) {
    return listResource(
      "clients",
      optionalBoolean(input.includeAll) ? "/clients/all.json" : "/clients.json",
      input,
      context,
    );
  },
  list_projects(input, context) {
    return listResource(
      "projects",
      optionalBoolean(input.closed) ? "/projects/closed.json" : "/projects.json",
      input,
      context,
    );
  },
  list_tasks(input, context) {
    const projectId = optionalInteger(input.projectId);
    return listResource(
      "tasks",
      `${projectId == null ? "" : `/projects/${projectId}`}${optionalBoolean(input.closed) ? "/tasks/closed.json" : "/tasks.json"}`,
      input,
      context,
    );
  },
  list_users(input, context) {
    return listResource(
      "users",
      optionalBoolean(input.deleted) ? "/users/deleted.json" : "/users.json",
      input,
      context,
    );
  },
  async list_entries(input, context) {
    validateEntryFilters(input);
    const payload = await requestTickJson({
      ...context,
      path: "/entries.json",
      query: compactObject({
        page: stringifyInteger(input.page),
        start_date: optionalString(input.startDate),
        end_date: optionalString(input.endDate),
        updated_at: optionalString(input.updatedAt),
        billable: stringifyBoolean(input.billable),
        billed: stringifyBoolean(input.billed),
        project_id: stringifyInteger(input.projectId),
        task_id: stringifyInteger(input.taskId),
        user_id: stringifyInteger(input.userId),
      }),
      phase: "execute",
    });
    return { entries: objectArray(payload, "Tick time entries response", providerResponseError) };
  },
  async get_entry(input, context) {
    const payload = await requestTickJson({
      ...context,
      path: `/entries/${positiveInteger(input.entryId, "entryId")}.json`,
      phase: "execute",
    });
    return { entry: requiredResponseRecord(payload, "Tick time entry response") };
  },
  async create_entry(input, context) {
    const payload = await requestTickJson({
      ...context,
      path: "/entries.json",
      method: "POST",
      body: buildEntryBody(input, false),
      phase: "execute",
    });
    return { entry: requiredResponseRecord(payload, "Tick create entry response") };
  },
  async update_entry(input, context) {
    const entryId = positiveInteger(input.entryId, "entryId");
    const body = buildEntryBody(input, true);
    if (Object.keys(body).length == 0)
      throw providerInputError("Tick update_entry requires at least one field to update");
    const payload = await requestTickJson({
      ...context,
      path: `/entries/${entryId}.json`,
      method: "PUT",
      body,
      phase: "execute",
    });
    return { entry: requiredResponseRecord(payload, "Tick update entry response") };
  },
  async delete_entry(input, context) {
    await requestTickJson({
      ...context,
      path: `/entries/${positiveInteger(input.entryId, "entryId")}.json`,
      method: "DELETE",
      phase: "execute",
    });
    return { deleted: true };
  },
};

export function resolveTickCredential(input: Record<string, string>): TickCredential {
  const credential = {
    apiKey: requiredInputString(input.apiKey, "apiKey"),
    subscriptionId: requiredInputString(input.subscriptionId, "subscriptionId"),
    email: requiredInputString(input.email, "email"),
  };
  if (!Number.isSafeInteger(Number(credential.subscriptionId)) || Number(credential.subscriptionId) < 1)
    throw providerInputError("subscriptionId must be a positive integer");
  return credential;
}

export async function validateTickCredential(
  input: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = resolveTickCredential(input);
  await requestTickJson({ credential, path: "/users.json", fetcher, signal, phase: "validate" });
  return {
    profile: { accountId: `tick:${credential.subscriptionId}`, displayName: `Tick ${credential.subscriptionId}` },
    grantedScopes: [],
    metadata: {
      subscriptionId: credential.subscriptionId,
      email: credential.email,
      apiBaseUrl: buildTickApiBaseUrl(credential.subscriptionId),
    },
  };
}

export function buildTickApiBaseUrl(subscriptionId: string): string {
  return `https://www.tickspot.com/${encodeURIComponent(subscriptionId)}/api/v2`;
}
async function listResource(key: string, path: string, input: Record<string, unknown>, context: TickContext) {
  const payload = await requestTickJson({
    ...context,
    path,
    query: compactObject({ page: stringifyInteger(input.page) }),
    phase: "execute",
  });
  return { [key]: objectArray(payload, `Tick ${key} response`, providerResponseError) };
}
function buildEntryBody(input: Record<string, unknown>, partial: boolean) {
  return compactObject({
    date: partial ? optionalString(input.date) : requiredInputString(input.date, "date"),
    hours: positiveNumber(input.hours, "hours", partial),
    task_id: positiveIntegerOrUndefined(input.taskId, "taskId", partial),
    notes: optionalString(input.notes),
    user_id: optionalInteger(input.userId),
    billed: optionalBoolean(input.billed),
  });
}
function validateEntryFilters(input: Record<string, unknown>): void {
  if (optionalString(input.updatedAt) || (optionalString(input.startDate) && optionalString(input.endDate))) return;
  throw providerInputError("Tick list_entries requires updatedAt or both startDate and endDate");
}
function positiveNumber(value: unknown, fieldName: string, optional: boolean): number | undefined {
  if (value == null && optional) return undefined;
  if (typeof value != "number" || !Number.isFinite(value) || value <= 0)
    throw providerInputError(`${fieldName} must be a positive number`);
  return value;
}
function positiveIntegerOrUndefined(value: unknown, fieldName: string, optional: boolean): number | undefined {
  return value == null && optional ? undefined : positiveInteger(value, fieldName);
}
function positiveInteger(value: unknown, fieldName: string): number {
  const result = optionalInteger(value);
  if (result == null || result < 1) throw providerInputError(`${fieldName} must be a positive integer`);
  return result;
}
function stringifyInteger(value: unknown): string | undefined {
  const result = optionalInteger(value);
  return result == null ? undefined : String(result);
}
function stringifyBoolean(value: unknown): string | undefined {
  const result = optionalBoolean(value);
  return result == null ? undefined : String(result);
}

async function requestTickJson(input: TickRequestInput): Promise<unknown> {
  return runProviderRequest({ label: "Tick", signal: input.signal }, async (signal) => {
    const url = new URL(`${buildTickApiBaseUrl(input.credential.subscriptionId)}${input.path}`);
    for (const [key, value] of Object.entries(input.query ?? {})) if (value != null) url.searchParams.set(key, value);
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Token token=${input.credential.apiKey}`,
        "content-type": "application/json; charset=utf-8",
        "user-agent": `oomol-connect (${input.credential.email})`,
      },
      body: input.body == null ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) throw createError(response.status, payload, input.phase);
    return payload;
  });
}
async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw providerResponseError("Tick returned invalid JSON");
  }
}
function createError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.error) ?? optionalString(record?.message) ?? `Tick request failed with status ${status}`;
  if (phase == "validate" && 400 <= status && status < 500) return providerInputError(message);
  return new ProviderRequestError(status || 502, message);
}
