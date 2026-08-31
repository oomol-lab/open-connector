import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed, readBoundedResponseBytes } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerFetch,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

type MemosRequestPhase = "execute" | "validate";

interface MemosRequestOptions {
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}

interface AttachmentSource {
  bytes: Uint8Array;
  mimeType: string;
}

interface MemoUpdateField {
  inputName: string;
  maskName: string;
}

export interface MemosContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const requestTimeoutMs = 60_000;
const attachmentMaxBytes = 20 * 1024 * 1024;

export const memosActionHandlers: ProviderActionHandlers<"memos", ProviderRuntimeHandler<MemosContext>> = {
  async create_memo(input, context) {
    const memo = requireResponseObject(
      await requestMemosJson(context, "/memos", {
        method: "POST",
        query: compactObject({ memoId: optionalString(input.memoId) }),
        body: compactObject({
          content: input.content,
          visibility: optionalString(input.visibility),
          createTime: optionalString(input.createTime),
          pinned: optionalBoolean(input.pinned),
          location: input.location,
        }),
      }),
      "create memo",
    );
    return { memo };
  },

  async list_memos(input, context) {
    const payload = requireResponseObject(
      await requestMemosJson(context, "/memos", {
        query: compactObject({
          pageSize: optionalInteger(input.pageSize),
          pageToken: optionalString(input.pageToken),
          state: optionalString(input.state),
          orderBy: optionalString(input.orderBy),
          filter: optionalString(input.filter),
          showDeleted: optionalBoolean(input.showDeleted),
        }),
      }),
      "list memos",
    );
    return {
      memos: requireResponseObjectArray(payload.memos ?? [], "list memos"),
      nextPageToken: optionalString(payload.nextPageToken) ?? null,
    };
  },

  async get_memo(input, context) {
    const memo = requireResponseObject(
      await requestMemosJson(context, resourcePath(requiredInputString(input.name, "name"), "memos")),
      "get memo",
    );
    return { memo };
  },

  async update_memo(input, context) {
    const name = requiredInputString(input.name, "name");
    const fields: readonly MemoUpdateField[] = [
      { inputName: "content", maskName: "content" },
      { inputName: "visibility", maskName: "visibility" },
      { inputName: "pinned", maskName: "pinned" },
      { inputName: "state", maskName: "state" },
      { inputName: "createTime", maskName: "create_time" },
      { inputName: "location", maskName: "location" },
    ];
    const updateMask = fields.filter((field) => Object.hasOwn(input, field.inputName)).map((field) => field.maskName);
    if (updateMask.length === 0) throw providerInputError("Provide at least one memo field to update.");
    const memo = requireResponseObject(
      await requestMemosJson(context, resourcePath(name, "memos"), {
        method: "PATCH",
        query: { updateMask: updateMask.join(",") },
        body: compactObject({
          name,
          content: input.content,
          visibility: input.visibility,
          pinned: input.pinned,
          state: input.state,
          createTime: input.createTime,
          location: input.location,
        }),
      }),
      "update memo",
    );
    return { memo };
  },

  async delete_memo(input, context) {
    const name = requiredInputString(input.name, "name");
    await requestMemosJson(context, resourcePath(name, "memos"), {
      method: "DELETE",
      query: compactObject({ force: optionalBoolean(input.force) }),
    });
    return { deleted: true, name };
  },

  async upload_attachment(input, context) {
    const source = await downloadAttachmentSource(
      requiredInputString(input.fileUrl, "fileUrl"),
      optionalString(input.type),
      context.signal,
    );
    const attachment = requireResponseObject(
      await requestMemosJson(context, "/attachments", {
        method: "POST",
        query: compactObject({ attachmentId: optionalString(input.attachmentId) }),
        body: compactObject({
          filename: requiredInputString(input.filename, "filename"),
          content: Buffer.from(source.bytes).toString("base64"),
          type: source.mimeType,
          memo: optionalString(input.memo),
        }),
      }),
      "upload attachment",
    );
    return { attachment };
  },

  async list_attachments(input, context) {
    const payload = requireResponseObject(
      await requestMemosJson(context, "/attachments", {
        query: compactObject({
          pageSize: optionalInteger(input.pageSize),
          pageToken: optionalString(input.pageToken),
          filter: optionalString(input.filter),
          orderBy: optionalString(input.orderBy),
        }),
      }),
      "list attachments",
    );
    return {
      attachments: requireResponseObjectArray(payload.attachments ?? [], "list attachments"),
      nextPageToken: optionalString(payload.nextPageToken) ?? null,
    };
  },

  async get_attachment(input, context) {
    const attachment = requireResponseObject(
      await requestMemosJson(context, resourcePath(requiredInputString(input.name, "name"), "attachments")),
      "get attachment",
    );
    return { attachment };
  },

  async delete_attachment(input, context) {
    const name = requiredInputString(input.name, "name");
    await requestMemosJson(context, resourcePath(name, "attachments"), { method: "DELETE" });
    return { deleted: true, name };
  },

  async list_memo_attachments(input, context) {
    const name = requiredInputString(input.name, "name");
    const payload = requireResponseObject(
      await requestMemosJson(context, `${resourcePath(name, "memos")}/attachments`, {
        query: compactObject({
          pageSize: optionalInteger(input.pageSize),
          pageToken: optionalString(input.pageToken),
        }),
      }),
      "list memo attachments",
    );
    return {
      attachments: requireResponseObjectArray(payload.attachments ?? [], "list memo attachments"),
      nextPageToken: optionalString(payload.nextPageToken) ?? null,
    };
  },

  async set_memo_attachments(input, context) {
    const name = requiredInputString(input.name, "name");
    const attachmentNames = requiredStringArray(input.attachmentNames, "attachmentNames", providerInputError).map(
      (item) => requiredString(item, "attachmentNames", providerInputError),
    );
    for (const attachmentName of attachmentNames) resourcePath(attachmentName, "attachments");
    await requestMemosJson(context, `${resourcePath(name, "memos")}/attachments`, {
      method: "PATCH",
      body: { name, attachments: attachmentNames.map((attachmentName) => ({ name: attachmentName })) },
    });
    return { updated: true, name, attachmentNames };
  },

  async get_current_user(_input, context) {
    const payload = requireResponseObject(await requestMemosJson(context, "/auth/me"), "get current user");
    return { user: requireResponseObject(payload.user, "get current user") };
  },

  async list_users(input, context) {
    const payload = requireResponseObject(
      await requestMemosJson(context, "/users", {
        query: compactObject({
          pageSize: optionalInteger(input.pageSize),
          pageToken: optionalString(input.pageToken),
          filter: optionalString(input.filter),
          showDeleted: optionalBoolean(input.showDeleted),
        }),
      }),
      "list users",
    );
    return {
      users: requireResponseObjectArray(payload.users ?? [], "list users"),
      nextPageToken: optionalString(payload.nextPageToken) ?? null,
    };
  },

  async get_user(input, context) {
    const user = requireResponseObject(
      await requestMemosJson(context, resourcePath(requiredInputString(input.name, "name"), "users"), {
        query: compactObject({ readMask: optionalString(input.readMask) }),
      }),
      "get user",
    );
    return { user };
  },
};

export function createMemosContext(
  apiKey: string,
  baseUrl: unknown,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): MemosContext {
  return {
    apiKey: requiredString(apiKey, "apiKey", providerInputError),
    baseUrl: normalizeMemosBaseUrl(baseUrl),
    fetcher,
    signal,
  };
}

export function normalizeMemosBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const url = assertPublicHttpUrl(requiredString(value, "baseUrl", providerInputError), {
    fieldName: "baseUrl",
    createError: providerInputError,
    allowPrivateNetwork,
  });
  if (url.username || url.password) throw providerInputError("baseUrl must not include credentials");
  url.search = "";
  url.hash = "";
  const pathname = trimTrailingSlash(url.pathname);
  url.pathname = pathname.endsWith("/api/v1") ? pathname : `${pathname}/api/v1`;
  return url.toString().replace(/\/$/u, "");
}

export async function validateMemosCredential(
  apiKey: string,
  baseUrl: unknown,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createMemosContext(apiKey, baseUrl, fetcher, signal);
  const payload = requireResponseObject(
    await requestMemosJson(context, "/auth/me", {}, "validate"),
    "validate credential",
  );
  const user = requireResponseObject(payload.user, "validate credential");
  const name = optionalString(user.name);
  const username = optionalString(user.username);
  const host = new URL(context.baseUrl).host;
  return {
    profile: {
      accountId: name ? `memos:${name}` : `memos:${host}:${username ?? "user"}`,
      displayName:
        optionalString(user.displayName) ?? optionalString(user.email) ?? username ?? name ?? `Memos ${host}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      baseUrl: context.baseUrl,
      apiBaseUrl: context.baseUrl,
      validationEndpoint: "/auth/me",
      userName: name,
      username,
      email: optionalString(user.email),
      displayName: optionalString(user.displayName),
    }),
  };
}

async function requestMemosJson(
  context: MemosContext,
  path: string,
  options: MemosRequestOptions = {},
  phase: MemosRequestPhase = "execute",
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  const url = new URL(trimLeadingSlash(path), `${context.baseUrl}/`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${context.apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (options.body) headers.set("content-type", "application/json");
  try {
    const response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readMemosPayload(response);
    if (!response.ok) throw mapMemosHttpError(response.status, readMemosErrorMessage(payload), phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error))
      throw new ProviderRequestError(504, `Memos ${path} request timed out`);
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Memos ${path} request failed: ${error.message}` : `Memos ${path} request failed`,
    );
  } finally {
    timeout.cleanup();
  }
}

async function downloadAttachmentSource(
  fileUrl: string,
  mimeTypeInput: string | undefined,
  signal?: AbortSignal,
): Promise<AttachmentSource> {
  const url = assertPublicHttpUrl(fileUrl, { fieldName: "fileUrl", createError: providerInputError });
  const timeout = createProviderTimeout(signal, requestTimeoutMs);
  try {
    const response = await providerFetch(url, { signal: timeout.signal });
    if (!response.ok) throw new ProviderRequestError(502, `failed to fetch fileUrl: ${response.status}`);
    const bytes = await readBoundedResponseBytes(response, {
      maxBytes: attachmentMaxBytes,
      fieldName: "attachment",
      createError: (message) => new ProviderRequestError(413, message),
    });
    const responseMimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    return { bytes, mimeType: mimeTypeInput ?? responseMimeType ?? "application/octet-stream" };
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error))
      throw new ProviderRequestError(504, "fileUrl request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `failed to fetch fileUrl: ${error.message}` : "failed to fetch fileUrl",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readMemosPayload(response: Response): Promise<unknown> {
  return readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Memos returned invalid JSON",
    invalidJsonFallback: response.ok ? undefined : (text) => text,
  });
}

function mapMemosHttpError(status: number, message: string, phase: MemosRequestPhase): ProviderRequestError {
  if (phase === "validate" && (status === 401 || status === 403)) return providerInputError(message);
  if ([400, 403, 404, 409, 422].includes(status)) return providerInputError(message);
  if (status === 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function readMemosErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  return optionalString(optionalRecord(payload)?.message) ?? "Memos request failed";
}

function requireResponseObject(value: unknown, operation: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(502, `Memos ${operation} response did not include an object`);
  return object;
}

function requireResponseObjectArray(value: unknown, operation: string): Record<string, unknown>[] {
  if (!Array.isArray(value))
    throw new ProviderRequestError(502, `Memos ${operation} response did not include an array`);
  return value.map((item) => requireResponseObject(item, operation));
}

function resourcePath(name: string, collection: "attachments" | "memos" | "users"): string {
  const segments = name.split("/");
  if (segments.length !== 2 || segments[0] !== collection || !segments[1] || [".", ".."].includes(segments[1])) {
    throw providerInputError(`name must use the ${collection}/{id} resource format`);
  }
  return `/${collection}/${encodeURIComponent(segments[1])}`;
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInputError);
}

function trimLeadingSlash(value: string): string {
  let index = 0;
  while (value[index] === "/") index += 1;
  return value.slice(index);
}

function trimTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") end -= 1;
  return value.slice(0, end);
}
