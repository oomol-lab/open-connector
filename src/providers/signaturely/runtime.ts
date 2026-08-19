import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const signaturelyApiBaseUrl = "https://api.signaturely.com/api/v1/";
const timeoutMs = 30_000;
export const signaturelyActionHandlers: ProviderActionHandlers<
  "signaturely",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async list_folders(input, context) {
    const query = new URLSearchParams({ page: String(input.page), limit: String(input.limit) });
    for (const key of ["folderId", "orderingKey", "orderingDirection"]) {
      const value = optionalString(input[key]);
      if (value) query.set(key, value);
    }
    return normalizeList(await request(`api-integrations/folders?${query}`, context, "execute"));
  },
  async get_folder(input, context) {
    return normalizeFolder(
      await request(
        `api-integrations/folders/${encodeURIComponent(input.id === null ? "null" : inputString(input.id, "id"))}`,
        context,
        "execute",
      ),
    );
  },
  async create_folder(input, context) {
    return normalizeFolder(
      await request(
        "api-integrations/folders",
        context,
        "execute",
        "POST",
        compactObject({
          title: inputString(input.title, "title"),
          parentId: optionalInputString(input.parentId, "parentId"),
        }),
      ),
    );
  },
  async rename_folder(input, context) {
    return normalizeFolder(
      await request(
        `api-integrations/folders/${encodeURIComponent(inputString(input.id, "id"))}`,
        context,
        "execute",
        "PATCH",
        { title: inputString(input.title, "title") },
      ),
    );
  },
};
export async function validateSignaturelyCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await request("user/by-api", { apiKey, fetcher, signal }, "validate");
  const user = record(payload.data, "Signaturely user");
  const id = responseString(user.id, "user id");
  return {
    profile: {
      accountId: id,
      displayName: optionalString(user.name)?.trim() || optionalString(user.email)?.trim() || "Signaturely API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/user/by-api",
      userId: id,
      email: optionalString(user.email),
      role: optionalString(user.role),
      status: optionalString(user.status),
      appSumoStatus: optionalString(user.appSumoStatus),
    }),
  };
}
async function request(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: "validate" | "execute",
  method = "GET",
  body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal, timeoutMs);
  try {
    const response = await context.fetcher(new URL(path, signaturelyApiBaseUrl), {
      method,
      headers: {
        accept: "application/json",
        authorization: `Api-Key ${context.apiKey}`,
        "user-agent": providerUserAgent,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Signaturely returned invalid JSON",
    });
    if (!response.ok) {
      const object = optionalRecord(payload);
      const error = optionalRecord(object?.error);
      const message =
        optionalString(object?.message) ??
        optionalString(object?.detail) ??
        optionalString(error?.message) ??
        `Signaturely request failed with HTTP ${response.status}`;
      const status =
        phase === "validate" && (response.status === 401 || response.status === 403) ? 400 : response.status;
      throw new ProviderRequestError(status, message, payload);
    }
    return record(payload, "Signaturely response");
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error))
      throw new ProviderRequestError(504, "Signaturely request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Signaturely request failed: ${error.message}` : "Signaturely request failed",
    );
  } finally {
    timeout.cleanup();
  }
}
function normalizeList(payload: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(payload.items)) throw new ProviderRequestError(502, "Signaturely folder items are missing");
  return {
    items: payload.items.map((item) => normalizeListItem(record(item, "folder item"))),
    itemCount: integer(payload.itemCount, "itemCount"),
    totalItems: integer(payload.totalItems, "totalItems"),
    itemsPerPage: integer(payload.itemsPerPage, "itemsPerPage"),
    totalPages: integer(payload.totalPages, "totalPages"),
    currentPage: integer(payload.currentPage, "currentPage"),
  };
}
function normalizeListItem(folder: Record<string, unknown>): Record<string, unknown> {
  return {
    id: responseString(folder.id, "folder id"),
    title: responseString(folder.title, "folder title"),
    documentsCount: integer(folder.documentsCount, "documentsCount"),
    foldersCount: integer(folder.foldersCount, "foldersCount"),
  };
}
function normalizeFolder(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    id: responseString(payload.id, "folder id"),
    title: responseString(payload.title, "folder title"),
    parentId: payload.parentId === null ? null : responseString(payload.parentId, "folder parentId"),
    documentsCount: integer(payload.documentsCount, "documentsCount"),
    foldersCount: integer(payload.foldersCount, "foldersCount"),
  };
}
function record(value: unknown, field: string): Record<string, unknown> {
  const result = optionalRecord(value);
  if (!result) throw new ProviderRequestError(502, `${field} is missing`);
  return result;
}
function responseString(value: unknown, field: string): string {
  return requiredString(value, field, (message) => new ProviderRequestError(502, message)).trim();
}
function inputString(value: unknown, field: string): string {
  return requiredString(value, field, (message) => new ProviderRequestError(400, message)).trim();
}
function optionalInputString(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : inputString(value, field);
}
function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value))
    throw new ProviderRequestError(502, `Signaturely ${field} is missing`);
  return value;
}
