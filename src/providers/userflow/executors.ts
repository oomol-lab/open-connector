import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "userflow";
const userflowApiBaseUrl = "https://api.userflow.com";
const userflowApiVersion = "2020-01-03";

type UserflowActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const userflowActionHandlers: ProviderActionHandlers<"userflow", UserflowActionHandler> = {
  async list_users(input, context) {
    return requestUserflow(context, buildListUsersUrl(input));
  },
  async get_user(input, context) {
    return {
      user: await requestUserflow(context, buildObjectUrl("users", requiredString(input.user_id, "user_id"), input)),
    };
  },
  async upsert_user(input, context) {
    return { user: await requestUserflow(context, "/users", { method: "POST", body: compactObject(input) }) };
  },
  async delete_user(input, context) {
    return deleteUserflowObject(context, "users", "user_id", requiredString(input.user_id, "user_id"));
  },
  async upsert_group(input, context) {
    return { group: await requestUserflow(context, "/groups", { method: "POST", body: compactObject(input) }) };
  },
  async get_group(input, context) {
    return {
      group: await requestUserflow(
        context,
        buildObjectUrl("groups", requiredString(input.group_id, "group_id"), input),
      ),
    };
  },
  async delete_group(input, context) {
    return deleteUserflowObject(context, "groups", "group_id", requiredString(input.group_id, "group_id"));
  },
  async track_event(input, context) {
    return { event: await requestUserflow(context, "/events", { method: "POST", body: compactObject(input) }) };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, userflowActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context = { apiKey: input.apiKey, fetcher, signal };
    const payload = await requestUserflow(context, "/users?limit=1", {}, "validate");
    return {
      profile: {
        displayName: readFirstUserLabel(payload) ?? "Userflow API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: userflowApiBaseUrl,
        apiVersion: userflowApiVersion,
        validationEndpoint: "/users?limit=1",
      },
    };
  },
};

function buildListUsersUrl(input: Record<string, unknown>): URL {
  const url = new URL("/users", userflowApiBaseUrl);
  appendQueryFields(url, input, ["limit", "starting_after", "ending_before", "email", "user_id", "order_by"]);
  appendExpand(url, input.expand);
  return url;
}

function buildObjectUrl(resource: "users" | "groups", id: string, input: Record<string, unknown>): URL {
  const url = new URL(`/${resource}/${encodeURIComponent(id)}`, userflowApiBaseUrl);
  appendExpand(url, input.expand);
  return url;
}

function appendQueryFields(url: URL, input: Record<string, unknown>, fields: readonly string[]): void {
  for (const field of fields) {
    const value = input[field];
    if (typeof value === "string" || typeof value === "number") url.searchParams.set(field, String(value));
  }
}

function appendExpand(url: URL, expand: unknown): void {
  if (!Array.isArray(expand)) return;
  for (const field of expand) url.searchParams.append("expand[]", String(field));
}

async function deleteUserflowObject(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  resource: "users" | "groups",
  idField: "user_id" | "group_id",
  id: string,
): Promise<Record<string, unknown>> {
  const raw = await requestUserflow(context, `/${resource}/${encodeURIComponent(id)}`, { method: "DELETE" });
  return { deleted: true, [idField]: id, raw };
}

async function requestUserflow(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  pathOrUrl: string | URL,
  input: { method?: "GET" | "POST" | "DELETE"; body?: Record<string, unknown> } = {},
  mode: "validate" | "execute" = "execute",
): Promise<Record<string, unknown>> {
  const url =
    pathOrUrl instanceof URL
      ? pathOrUrl
      : new URL(pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`, userflowApiBaseUrl);
  const body = input.body ? JSON.stringify(input.body) : undefined;
  let response: Response;
  try {
    response = await context.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers: userflowHeaders(context.apiKey, body !== undefined),
      body,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      error instanceof Error && error.name === "AbortError" ? 504 : 502,
      error instanceof Error ? `Userflow request failed: ${error.message}` : "Userflow request failed",
    );
  }

  await assertUserflowResponse(response, mode);
  return readUserflowJson(response, "invalid Userflow response");
}

function userflowHeaders(apiKey: string, hasBody = false): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    "userflow-version": userflowApiVersion,
  });
  if (hasBody) headers.set("content-type", "application/json");
  return headers;
}

async function assertUserflowResponse(response: Response, mode: "validate" | "execute"): Promise<void> {
  if (response.ok) return;
  const error = await readUserflowError(response);
  if (response.status === 429) throw new ProviderRequestError(429, error.message);
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, error.message);
  }
  if (mode === "execute" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(response.status, error.message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new ProviderRequestError(response.status, error.message);
  }
  throw new ProviderRequestError(response.status, error.message);
}

async function readUserflowJson(response: Response, message: string): Promise<Record<string, unknown>> {
  if (response.status === 204) return {};
  try {
    const payload = await response.json();
    const record = optionalRecord(payload);
    if (!record) throw new ProviderRequestError(502, message);
    return record;
  } catch {
    throw new ProviderRequestError(502, message);
  }
}

async function readUserflowError(response: Response): Promise<{ message: string }> {
  try {
    const payload = (await response.json()) as { error?: unknown; message?: unknown };
    const nestedError = optionalRecord(payload.error);
    const nestedMessage = nestedError ? optionalString(nestedError.message) : undefined;
    return {
      message:
        nestedMessage ??
        optionalString(payload.message) ??
        optionalString(payload.error) ??
        `Userflow request failed with status ${response.status}`,
    };
  } catch {
    return { message: `Userflow request failed with status ${response.status}` };
  }
}

function readFirstUserLabel(payload: Record<string, unknown>): string | undefined {
  if (!Array.isArray(payload.data)) return undefined;
  const first = optionalRecord(payload.data[0]);
  return first ? (optionalString(first.email) ?? optionalString(first.name) ?? optionalString(first.id)) : undefined;
}
