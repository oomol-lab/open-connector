import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { booleanString, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const zenkitApiBaseUrl = "https://base.zenkit.com/api/v1";
const zenkitValidationPath = "/auth/currentuser";

interface ZenkitActionContext extends ApiKeyProviderContext {}

interface ZenkitRequestOptions extends ZenkitActionContext {
  path: string;
  phase: "validate" | "execute";
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: unknown;
}

type ZenkitActionHandler = (input: Record<string, unknown>, context: ZenkitActionContext) => Promise<unknown>;

export const zenkitActionHandlers: ProviderActionHandlers<"zenkit", ZenkitActionHandler> = {
  list_workspaces_and_lists(_input, context) {
    return listWorkspacesAndLists(context);
  },
  get_workspace(input, context) {
    return getResource("workspaces", input.workspaceId, "workspaceId", context);
  },
  get_list(input, context) {
    return getResource("lists", input.listId, "listId", context);
  },
  get_entry(input, context) {
    return getEntry(input, context);
  },
  search_entries(input, context) {
    return searchEntries(input, context);
  },
  create_entry(input, context) {
    return createEntry(input, context);
  },
  update_entry(input, context) {
    return updateEntry(input, context);
  },
  delete_entry(input, context) {
    return deleteEntry(input, context);
  },
};

export async function validateZenkitCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestZenkitJson({
    path: zenkitValidationPath,
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  const user = requiredResponseRecord(payload, "Zenkit current user response");
  const label =
    optionalString(user.displayName) ??
    optionalString(user.fullname) ??
    optionalString(user.username) ??
    "Zenkit API Key";

  return {
    profile: { displayName: label },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: zenkitApiBaseUrl,
      validationEndpoint: zenkitValidationPath,
    },
  };
}

async function listWorkspacesAndLists(context: ZenkitActionContext) {
  const payload = await requestZenkitJson({
    ...context,
    path: "/users/me/workspacesWithLists",
    phase: "execute",
  });
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Zenkit workspaces response must be an array", undefined, "provider_error");
  }
  return { workspaces: payload };
}

async function getResource(
  resource: "workspaces" | "lists",
  value: unknown,
  fieldName: string,
  context: ZenkitActionContext,
) {
  const id = requireAllId(value, fieldName);
  const payload = await requestZenkitJson({
    ...context,
    path: `/${resource}/${encodeURIComponent(id)}`,
    phase: "execute",
  });
  return { resource: requiredResponseRecord(payload, `Zenkit ${resource} response`) };
}

async function getEntry(input: Record<string, unknown>, context: ZenkitActionContext) {
  const listId = requireAllId(input.listId, "listId");
  const entryId = requireAllId(input.entryId, "entryId");
  const payload = await requestZenkitJson({
    ...context,
    path: `/lists/${encodeURIComponent(listId)}/entries/${encodeURIComponent(entryId)}`,
    phase: "execute",
  });
  return { entry: requiredResponseRecord(payload, "Zenkit entry response") };
}

async function searchEntries(input: Record<string, unknown>, context: ZenkitActionContext) {
  const payload = await requestZenkitJson({
    ...context,
    path: "/entries/search",
    phase: "execute",
    query: {
      query: requiredInputString(input.query, "query"),
      limit: stringifyOptionalNumber(input.limit),
      preferredListIds: stringifyOptionalArray(input.preferredListIds),
      excludeListEntryUUIDs: stringifyOptionalArray(input.excludeEntryUuids),
      searchInArchive: booleanString(input.searchInArchive),
      includeRelatedLists: booleanString(input.includeRelatedLists),
      includeRelatedWorkspaces: booleanString(input.includeRelatedWorkspaces),
      includeRelatedListElements: booleanString(input.includeRelatedListElements),
    },
  });
  return { results: requiredResponseRecord(payload, "Zenkit entry search response") };
}

async function createEntry(input: Record<string, unknown>, context: ZenkitActionContext) {
  const listId = requirePositiveInteger(input.listId, "listId");
  const body = {
    ...requireInputObject(input.data, "data"),
    sortOrder: input.sortOrder,
  };
  const payload = await requestZenkitJson({
    ...context,
    path: `/lists/${listId}/entries`,
    phase: "execute",
    method: "POST",
    body,
  });
  return { entry: requiredResponseRecord(payload, "Zenkit create entry response") };
}

async function updateEntry(input: Record<string, unknown>, context: ZenkitActionContext) {
  const listId = requirePositiveInteger(input.listId, "listId");
  const entryId = requirePositiveInteger(input.entryId, "entryId");
  const body = {
    ...requireInputObject(input.data, "data"),
    updateAction: optionalString(input.updateAction),
  };
  const payload = await requestZenkitJson({
    ...context,
    path: `/lists/${listId}/entries/${entryId}`,
    phase: "execute",
    method: "PUT",
    body,
  });
  return { entry: requiredResponseRecord(payload, "Zenkit update entry response") };
}

async function deleteEntry(input: Record<string, unknown>, context: ZenkitActionContext) {
  const listId = requireAllId(input.listId, "listId");
  const entryId = requireAllId(input.entryId, "entryId");
  const response = await requestZenkitJson({
    ...context,
    path: `/lists/${encodeURIComponent(listId)}/deprecated/entries/${encodeURIComponent(entryId)}`,
    phase: "execute",
    method: "DELETE",
  });
  return { deleted: true, response };
}

async function requestZenkitJson(options: ZenkitRequestOptions) {
  return runProviderRequest({ label: "Zenkit", signal: options.signal }, async (signal) => {
    const url = new URL(`${zenkitApiBaseUrl}${options.path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": providerUserAgent,
      "zenkit-api-key": options.apiKey,
    };
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await options.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
    const payload = await readZenkitPayload(response);
    if (!response.ok) {
      throw mapZenkitError(response.status, payload, options.phase);
    }
    return payload;
  });
}

async function readZenkitPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return { message: text.trim().slice(0, 500) };
    }
    throw new ProviderRequestError(502, "Zenkit returned invalid JSON", undefined, "provider_error");
  }
}

function mapZenkitError(status: number, payload: unknown, phase: "validate" | "execute") {
  const message = readZenkitErrorMessage(payload) ?? `Zenkit request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, undefined, "rate_limited");
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, undefined, "invalid_input");
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(status === 404 ? 404 : 400, message, undefined, "invalid_input");
  }
  return new ProviderRequestError(status || 502, message, undefined, "provider_error");
}

function readZenkitErrorMessage(payload: unknown) {
  const body = optionalRecord(payload);
  const error = optionalRecord(body?.error);
  return (
    optionalString(error?.message) ??
    optionalString(error?.description) ??
    optionalString(error?.name) ??
    optionalString(body?.message)
  );
}

function requireAllId(value: unknown, fieldName: string) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }
  return requiredInputString(value, fieldName);
}

function requirePositiveInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`, undefined, "invalid_input");
  }
  return value;
}

function requireInputObject(value: unknown, fieldName: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`, undefined, "invalid_input");
  }
  return object;
}

function stringifyOptionalNumber(value: unknown) {
  return typeof value === "number" ? String(value) : undefined;
}

function stringifyOptionalArray(value: unknown) {
  return Array.isArray(value) ? value.join(",") : undefined;
}
