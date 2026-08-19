import type { CredentialValidationResult, TransitFileWriter } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { posix as path } from "node:path";
import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed, readBoundedResponseBytes } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerFetch,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

type FastNoteSyncRequestPhase = "execute" | "validate";

interface FastNoteSyncRequestOptions {
  method?: "DELETE" | "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  formData?: FormData;
  accept?: string;
}

interface FastNoteSyncListResult {
  items: Record<string, unknown>[];
  pagination: {
    page: number;
    pageSize: number;
    totalRows: number;
  };
}

interface AttachmentSource {
  bytes: Uint8Array;
  mimeType: string;
}

export interface FastNoteSyncContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  transitFiles?: TransitFileWriter;
}

const requestTimeoutMs = 60_000;
const attachmentMaxBytes = 20 * 1024 * 1024;

export const fastNoteSyncActionHandlers: ProviderActionHandlers<
  "fast_note_sync",
  ProviderRuntimeHandler<FastNoteSyncContext>
> = {
  async get_current_user(_input, context) {
    const response = await requestFastNoteSyncJson(context, "/user/info");
    return { user: sanitizeUser(readResponseDataObject(response, "get current user")) };
  },

  async list_vaults(_input, context) {
    const response = await requestFastNoteSyncJson(context, "/vault");
    return { vaults: readResponseDataObjectArray(response, "list vaults") };
  },

  async get_vault(input, context) {
    const response = await requestFastNoteSyncJson(context, "/vault/get", {
      query: { id: input.id },
    });
    return { vault: readResponseDataObject(response, "get vault") };
  },

  async upsert_vault(input, context) {
    const response = await requestFastNoteSyncJson(context, "/vault", {
      method: "POST",
      body: compactObject({ id: input.id, vault: input.vault }),
    });
    return { vault: readResponseDataObject(response, "upsert vault") };
  },

  async delete_vault(input, context) {
    await requestFastNoteSyncJson(context, "/vault", {
      method: "DELETE",
      query: { id: input.id },
    });
    return { deleted: true };
  },

  async list_notes(input, context) {
    const response = await requestFastNoteSyncJson(context, "/notes", {
      query: pickFields(input, ["vault", "page", "pageSize", "isRecycle", "sortBy", "sortOrder"]),
    });
    const result = readListResponse(response, input, "list notes");
    return { notes: result.items, pagination: result.pagination };
  },

  async search_notes(input, context) {
    const field = requiredInputString(input.field, "field");
    const response = await requestFastNoteSyncJson(context, "/notes", {
      query: {
        ...pickFields(input, ["vault", "page", "pageSize", "isRecycle", "sortBy", "sortOrder"]),
        keyword: input.query,
        searchMode: field,
        searchContent: field === "content",
      },
    });
    const result = readListResponse(response, input, "search notes");
    return { notes: result.items, pagination: result.pagination };
  },

  async get_note(input, context) {
    const response = await requestFastNoteSyncJson(context, "/note", {
      query: pickFields(input, ["vault", "path", "isRecycle"]),
    });
    return { note: readResponseDataObject(response, "get note") };
  },

  async upsert_note(input, context) {
    const response = await requestFastNoteSyncJson(context, "/note", {
      method: "POST",
      body: pickFields(input, ["vault", "path", "content", "createOnly", "ctime", "mtime"]),
    });
    return { note: readResponseDataObject(response, "upsert note") };
  },

  async delete_note(input, context) {
    const response = await requestFastNoteSyncJson(context, "/note", {
      method: "DELETE",
      query: pickFields(input, ["vault", "path"]),
    });
    return { deleted: true, note: readResponseDataObject(response, "delete note") };
  },

  async list_attachments(input, context) {
    const response = await requestFastNoteSyncJson(context, "/files", {
      query: pickFields(input, ["vault", "keyword", "page", "pageSize", "isRecycle", "sortBy", "sortOrder"]),
    });
    const result = readListResponse(response, input, "list attachments");
    return { attachments: result.items, pagination: result.pagination };
  },

  async upload_attachment(input, context) {
    const attachmentPath = requiredInputString(input.path, "path");
    const source = await downloadAttachmentSource(
      requiredInputString(input.fileUrl, "fileUrl"),
      optionalString(input.mimeType),
      context.signal,
    );
    const formData = new FormData();
    formData.set("vault", requiredInputString(input.vault, "vault"));
    formData.set("path", attachmentPath);
    if (input.ctime != null) formData.set("ctime", String(input.ctime));
    if (input.mtime != null) formData.set("mtime", String(input.mtime));
    formData.set(
      "file",
      new File([Uint8Array.from(source.bytes)], path.basename(attachmentPath) || "attachment", {
        type: source.mimeType,
      }),
    );
    const response = await requestFastNoteSyncJson(context, "/file", {
      method: "POST",
      formData,
    });
    return { attachment: readResponseDataObject(response, "upload attachment") };
  },

  async download_attachment(input, context) {
    if (!context.transitFiles) {
      throw new ProviderRequestError(503, "file transit is not configured");
    }
    const attachmentPath = requiredInputString(input.path, "path");
    const maxBytes = Math.min(attachmentMaxBytes, context.transitFiles.maxBytes);
    const source = await requestFastNoteSyncResponse(
      context,
      "/file",
      "execute",
      {
        query: pickFields(input, ["vault", "path", "isRecycle"]),
        accept: "application/octet-stream",
      },
      async (response) => {
        const bytes = await readBoundedResponseBytes(response, {
          maxBytes,
          fieldName: "attachment",
          createError: (message) => new ProviderRequestError(413, message),
        });
        assertBinaryResponseDidNotContainError(response, bytes);
        const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() || "application/octet-stream";
        return { bytes, mimeType };
      },
    );
    const name = path.basename(attachmentPath) || "attachment";
    const upload = await context.transitFiles.create(
      new File([Uint8Array.from(source.bytes)], name, { type: source.mimeType }),
    );
    return {
      attachment: {
        fileId: upload.fileId,
        downloadUrl: upload.downloadUrl,
        sizeBytes: upload.sizeBytes,
        name: upload.name,
        mimeType: upload.mimeType,
      },
    };
  },

  async delete_attachment(input, context) {
    const response = await requestFastNoteSyncJson(context, "/file", {
      method: "DELETE",
      query: pickFields(input, ["vault", "path", "pathHash"]),
    });
    return { deleted: true, attachment: readResponseDataObject(response, "delete attachment") };
  },
};

export function createFastNoteSyncContext(
  apiKey: string,
  baseUrl: unknown,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  transitFiles?: TransitFileWriter,
): FastNoteSyncContext {
  return {
    apiKey: requiredString(apiKey, "apiKey", inputError),
    baseUrl: normalizeFastNoteSyncBaseUrl(baseUrl),
    fetcher,
    signal,
    transitFiles,
  };
}

export function normalizeFastNoteSyncBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const raw = requiredString(value, "baseUrl", inputError);
  const url = assertPublicHttpUrl(raw, {
    fieldName: "baseUrl",
    createError: inputError,
    allowPrivateNetwork,
  });
  if (url.username || url.password) throw inputError("baseUrl must not include credentials");
  url.search = "";
  url.hash = "";
  const pathname = trimTrailingSlash(url.pathname);
  url.pathname = pathname.endsWith("/api") ? pathname : `${pathname}/api`;
  return url.toString().replace(/\/$/u, "");
}

export async function validateFastNoteSyncCredential(
  apiKey: string,
  baseUrl: unknown,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createFastNoteSyncContext(apiKey, baseUrl, fetcher, signal);
  const response = await requestFastNoteSyncJson(context, "/user/info", {}, "validate");
  const user = sanitizeUser(readResponseDataObject(response, "get current user"));
  const host = new URL(context.baseUrl).host;
  const uid = optionalInteger(user.uid);
  const username = optionalString(user.username);
  const email = optionalString(user.email);
  const identity = uid == null ? createHash("sha256").update(context.apiKey).digest("hex").slice(0, 16) : String(uid);
  return {
    profile: {
      accountId: `fast_note_sync:${host}:${identity}`,
      displayName: `${username ?? email ?? "FNS user"} @ ${host}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      baseUrl: context.baseUrl,
      uid,
      username,
      email,
      validationEndpoint: "/user/info",
    }),
  };
}

async function requestFastNoteSyncJson(
  context: FastNoteSyncContext,
  endpoint: string,
  options: FastNoteSyncRequestOptions = {},
  phase: FastNoteSyncRequestPhase = "execute",
): Promise<Record<string, unknown>> {
  return requestFastNoteSyncResponse(context, endpoint, phase, options, async (response) => {
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: `FNS ${endpoint} returned invalid JSON`,
    });
    const object = optionalRecord(payload);
    if (!object) throw new ProviderRequestError(502, `FNS ${endpoint} returned an invalid response object`);
    const code = optionalInteger(object.code);
    if (object.status === false || code === 0 || (code != null && code >= 400)) {
      throw mapFastNoteSyncBusinessError(code, readFastNoteSyncErrorMessage(object), phase);
    }
    return object;
  });
}

async function requestFastNoteSyncResponse<TResult>(
  context: FastNoteSyncContext,
  endpoint: string,
  phase: FastNoteSyncRequestPhase,
  options: FastNoteSyncRequestOptions,
  readResponse: (response: Response) => Promise<TResult>,
): Promise<TResult> {
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  const url = new URL(trimLeadingSlash(endpoint), `${context.baseUrl}/`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  const headers = new Headers({
    accept: options.accept ?? "application/json",
    authorization: `Bearer ${context.apiKey}`,
    "user-agent": providerUserAgent,
  });
  let body: BodyInit | undefined = options.formData;
  if (options.body) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }
  try {
    const response = await context.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body,
      signal: timeout.signal,
    });
    if (!response.ok) {
      const payload = await readFastNoteSyncErrorPayload(response);
      throw mapFastNoteSyncHttpError(response.status, readFastNoteSyncErrorMessage(payload), phase);
    }
    return await readResponse(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, `FNS ${endpoint} request timed out`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `FNS ${endpoint} request failed: ${error.message}` : `FNS ${endpoint} request failed`,
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
  const url = assertPublicHttpUrl(fileUrl, { fieldName: "fileUrl", createError: inputError });
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
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "fileUrl request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `failed to fetch fileUrl: ${error.message}` : "failed to fetch fileUrl",
    );
  } finally {
    timeout.cleanup();
  }
}

function readResponseDataObject(response: Record<string, unknown>, operation: string): Record<string, unknown> {
  const data = optionalRecord(response.data);
  if (!data) throw new ProviderRequestError(502, `FNS ${operation} response did not include an object in data`);
  return data;
}

function readResponseDataObjectArray(response: Record<string, unknown>, operation: string): Record<string, unknown>[] {
  if (!Array.isArray(response.data)) {
    throw new ProviderRequestError(502, `FNS ${operation} response did not include an array in data`);
  }
  return response.data.map((item) => {
    const object = optionalRecord(item);
    if (!object) throw new ProviderRequestError(502, `FNS ${operation} response included an invalid resource`);
    return object;
  });
}

function readListResponse(
  response: Record<string, unknown>,
  input: Record<string, unknown>,
  operation: string,
): FastNoteSyncListResult {
  const data = optionalRecord(response.data);
  if (!data || !Array.isArray(data.list)) {
    throw new ProviderRequestError(502, `FNS ${operation} response did not include data.list`);
  }
  const items = data.list.map((item) => {
    const object = optionalRecord(item);
    if (!object) throw new ProviderRequestError(502, `FNS ${operation} response included an invalid resource`);
    return object;
  });
  const pager = optionalRecord(data.pager);
  return {
    items,
    pagination: {
      page: optionalInteger(pager?.page) ?? optionalInteger(input.page) ?? 1,
      pageSize: optionalInteger(pager?.pageSize) ?? optionalInteger(input.pageSize) ?? 10,
      totalRows: optionalInteger(pager?.totalRows) ?? items.length,
    },
  };
}

async function readFastNoteSyncErrorPayload(response: Response): Promise<Record<string, unknown> | undefined> {
  const payload = await readProviderJsonBody(response, {
    emptyBody: undefined,
    invalidJsonMessage: "FNS returned invalid JSON",
    invalidJsonFallback: (text) => ({ message: text }),
  });
  return optionalRecord(payload);
}

function readFastNoteSyncErrorMessage(payload: Record<string, unknown> | undefined): string {
  const message = optionalString(payload?.message);
  if (message) return message;
  if (Array.isArray(payload?.details)) {
    const details = payload.details.filter((item): item is string => typeof item === "string");
    if (details.length > 0) return details.join("; ");
  }
  return "FNS request failed";
}

function mapFastNoteSyncHttpError(
  status: number,
  message: string,
  phase: FastNoteSyncRequestPhase,
): ProviderRequestError {
  if (phase === "validate" && (status === 401 || status === 403)) return inputError(message);
  if (status === 400 || status === 404 || status === 422) return inputError(message);
  if (status === 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function mapFastNoteSyncBusinessError(
  code: number | undefined,
  message: string,
  phase: FastNoteSyncRequestPhase,
): ProviderRequestError {
  if (isFastNoteSyncCredentialErrorCode(code))
    return phase === "validate" ? inputError(message) : new ProviderRequestError(401, message);
  if (code === 303) return new ProviderRequestError(429, message);
  if (code === 305 || (code != null && code >= 400 && code < 500)) return inputError(message);
  return new ProviderRequestError(502, message);
}

function isFastNoteSyncCredentialErrorCode(code: number | undefined): boolean {
  return code != null && ((code >= 306 && code <= 315) || code === 507 || code === 508);
}

function assertBinaryResponseDidNotContainError(response: Response, bytes: Uint8Array): void {
  if (!response.headers.get("content-type")?.toLowerCase().includes("json")) return;
  try {
    const object = optionalRecord(JSON.parse(new TextDecoder().decode(bytes)));
    const code = optionalInteger(object?.code);
    if (object && (object.status === false || code === 0 || (code != null && code >= 400))) {
      throw mapFastNoteSyncBusinessError(code, readFastNoteSyncErrorMessage(object), "execute");
    }
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
  }
}

function sanitizeUser(user: Record<string, unknown>): Record<string, unknown> {
  const result = { ...user };
  delete result.token;
  return result;
}

function pickFields(input: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of fields) {
    if (input[field] !== undefined) output[field] = input[field];
  }
  return output;
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, inputError);
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
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
