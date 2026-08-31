import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
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

export interface TriliumContext {
  readonly apiToken: string;
  readonly baseUrl: string;
  readonly fetcher: typeof fetch;
  readonly signal?: AbortSignal;
}

interface TriliumRequest {
  readonly context: TriliumContext;
  readonly path: string;
  readonly phase: "execute" | "validate";
  readonly method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  readonly query?: Record<string, unknown>;
  readonly jsonBody?: Record<string, unknown>;
  readonly body?: BodyInit;
  readonly contentType?: string;
  readonly accept?: string;
}

interface AttachmentSource {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
}

const triliumRequestTimeoutMs = 60_000;
const triliumTextContentMaxBytes = 10 * 1024 * 1024;
const triliumAttachmentMaxBytes = 20 * 1024 * 1024;

export const triliumActionHandlers: ProviderActionHandlers<"trilium", ProviderRuntimeHandler<TriliumContext>> = {
  async search_notes(input, context) {
    const payload = requireResponseObject(
      await requestActionJson(context, "notes", {
        query: compactObject({
          search: input.search,
          fastSearch: input.fastSearch,
          includeArchivedNotes: input.includeArchivedNotes,
          ancestorNoteId: input.ancestorNoteId,
          ancestorDepth: input.ancestorDepth,
          orderBy: input.orderBy,
          orderDirection: input.orderDirection,
          limit: input.limit,
          debug: input.debug,
        }),
      }),
      "search notes",
    );
    return {
      notes: requireResponseObjectArray(payload.results, "search notes"),
      debugInfo: optionalRecord(payload.debugInfo) ?? null,
    };
  },

  async create_note(input, context) {
    const payload = requireResponseObject(
      await requestActionJson(context, "create-note", {
        method: "POST",
        jsonBody: compactObject({
          parentNoteId: input.parentNoteId,
          title: input.title,
          type: input.type,
          content: input.content,
          mime: input.mime,
          notePosition: input.notePosition,
          prefix: input.prefix,
          isExpanded: input.isExpanded,
          noteId: input.noteId,
          dateCreated: input.dateCreated,
          utcDateCreated: input.utcDateCreated,
        }),
      }),
      "create note",
    );
    return {
      note: requireResponseObject(payload.note, "create note"),
      branch: requireResponseObject(payload.branch, "create note"),
    };
  },

  async get_note(input, context) {
    const noteId = requireInputString(input.noteId, "noteId");
    const note = requireResponseObject(await requestActionJson(context, entityPath("notes", noteId)), "get note");
    return { note };
  },

  async update_note(input, context) {
    const noteId = requireInputString(input.noteId, "noteId");
    requireAnyInputField(
      input,
      ["title", "type", "mime", "dateCreated", "utcDateCreated"],
      "Provide at least one note field to update.",
    );
    const note = requireResponseObject(
      await requestActionJson(context, entityPath("notes", noteId), {
        method: "PATCH",
        jsonBody: compactObject({
          title: input.title,
          type: input.type,
          mime: input.mime,
          dateCreated: input.dateCreated,
          utcDateCreated: input.utcDateCreated,
        }),
      }),
      "update note",
    );
    return { note };
  },

  async delete_note(input, context) {
    const noteId = requireInputString(input.noteId, "noteId");
    await requestActionResponse(context, entityPath("notes", noteId), {
      method: "DELETE",
    });
    return { deleted: true, noteId };
  },

  async get_note_content(input, context) {
    const noteId = requireInputString(input.noteId, "noteId");
    const content = await requestTriliumResponse(
      {
        context,
        path: `${entityPath("notes", noteId)}/content`,
        phase: "execute",
        accept: "text/*, application/json, application/xml",
      },
      async (response) => {
        const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "text/plain";
        if (!isTextMimeType(mimeType)) {
          throw new ProviderRequestError(
            400,
            `note ${noteId} has binary content type ${mimeType}; use the Trilium proxy for binary content`,
          );
        }
        const bytes = await readBoundedResponseBytes(response, {
          maxBytes: triliumTextContentMaxBytes,
          fieldName: "note content",
          createError: (message) => new ProviderRequestError(413, message),
        });
        return { text: new TextDecoder().decode(bytes), mimeType };
      },
    );
    return {
      noteId,
      content: content.text,
      mimeType: content.mimeType,
    };
  },

  async update_note_content(input, context) {
    const noteId = requireInputString(input.noteId, "noteId");
    const content = requireInputString(input.content, "content", true);
    await requestActionResponse(context, `${entityPath("notes", noteId)}/content`, {
      method: "PUT",
      body: content,
      contentType: "text/plain; charset=utf-8",
    });
    return { updated: true, noteId };
  },

  async create_branch(input, context) {
    const branch = requireResponseObject(
      await requestActionJson(context, "branches", {
        method: "POST",
        jsonBody: compactObject({
          noteId: input.noteId,
          parentNoteId: input.parentNoteId,
          notePosition: input.notePosition,
          prefix: input.prefix,
          isExpanded: input.isExpanded,
        }),
      }),
      "create branch",
    );
    return { branch };
  },

  async get_branch(input, context) {
    const branchId = requireInputString(input.branchId, "branchId");
    const branch = requireResponseObject(
      await requestActionJson(context, entityPath("branches", branchId)),
      "get branch",
    );
    return { branch };
  },

  async update_branch(input, context) {
    const branchId = requireInputString(input.branchId, "branchId");
    requireAnyInputField(
      input,
      ["notePosition", "prefix", "isExpanded"],
      "Provide at least one branch field to update.",
    );
    const branch = requireResponseObject(
      await requestActionJson(context, entityPath("branches", branchId), {
        method: "PATCH",
        jsonBody: compactObject({
          notePosition: input.notePosition,
          prefix: input.prefix,
          isExpanded: input.isExpanded,
        }),
      }),
      "update branch",
    );
    return { branch };
  },

  async delete_branch(input, context) {
    const branchId = requireInputString(input.branchId, "branchId");
    await requestActionResponse(context, entityPath("branches", branchId), {
      method: "DELETE",
    });
    return { deleted: true, branchId };
  },

  async create_attribute(input, context) {
    if (input.type === "relation" && (typeof input.value !== "string" || !input.value)) {
      throw providerInputError("A relation attribute requires a target note id in value.");
    }
    const attribute = requireResponseObject(
      await requestActionJson(context, "attributes", {
        method: "POST",
        jsonBody: compactObject({
          attributeId: input.attributeId,
          noteId: input.noteId,
          type: input.type,
          name: input.name,
          value: input.value,
          position: input.position,
          isInheritable: input.isInheritable,
        }),
      }),
      "create attribute",
    );
    return { attribute };
  },

  async get_attribute(input, context) {
    const attributeId = requireInputString(input.attributeId, "attributeId");
    const attribute = requireResponseObject(
      await requestActionJson(context, entityPath("attributes", attributeId)),
      "get attribute",
    );
    return { attribute };
  },

  async update_attribute(input, context) {
    const attributeId = requireInputString(input.attributeId, "attributeId");
    requireAnyInputField(input, ["value", "position"], "Provide at least one attribute field to update.");
    const attribute = requireResponseObject(
      await requestActionJson(context, entityPath("attributes", attributeId), {
        method: "PATCH",
        jsonBody: compactObject({
          value: input.value,
          position: input.position,
        }),
      }),
      "update attribute",
    );
    return { attribute };
  },

  async delete_attribute(input, context) {
    const attributeId = requireInputString(input.attributeId, "attributeId");
    await requestActionResponse(context, entityPath("attributes", attributeId), {
      method: "DELETE",
    });
    return { deleted: true, attributeId };
  },

  async list_note_attachments(input, context) {
    const noteId = requireInputString(input.noteId, "noteId");
    const attachments = requireResponseObjectArray(
      await requestActionJson(context, `${entityPath("notes", noteId)}/attachments`),
      "list note attachments",
    );
    return { attachments };
  },

  async upload_attachment(input, context) {
    const ownerId = requireInputString(input.ownerId, "ownerId");
    const source = await downloadAttachmentSource(
      requireInputString(input.fileUrl, "fileUrl"),
      optionalString(input.mime),
      context.signal,
    );
    const attachment = requireResponseObject(
      await requestActionJson(context, "attachments", {
        method: "POST",
        jsonBody: {
          ownerId,
          role: input.role,
          mime: source.mimeType,
          title: input.title,
          position: input.position,
        },
      }),
      "create attachment",
    );
    const attachmentId = requireResponseString(attachment.attachmentId, "attachmentId");
    try {
      await requestActionResponse(context, `${entityPath("attachments", attachmentId)}/content`, {
        method: "PUT",
        body: new Blob([new Uint8Array(source.bytes).buffer], { type: source.mimeType }),
        contentType: source.mimeType,
      });
    } catch (error) {
      await requestActionResponse(context, entityPath("attachments", attachmentId), {
        method: "DELETE",
      }).catch(() => {});
      throw error;
    }
    const uploadedAttachment = requireResponseObject(
      await requestActionJson(context, entityPath("attachments", attachmentId)),
      "get uploaded attachment",
    );
    return { attachment: uploadedAttachment };
  },

  async get_attachment(input, context) {
    const attachmentId = requireInputString(input.attachmentId, "attachmentId");
    const attachment = requireResponseObject(
      await requestActionJson(context, entityPath("attachments", attachmentId)),
      "get attachment",
    );
    return { attachment };
  },

  async update_attachment(input, context) {
    const attachmentId = requireInputString(input.attachmentId, "attachmentId");
    requireAnyInputField(
      input,
      ["role", "mime", "title", "position"],
      "Provide at least one attachment field to update.",
    );
    const attachment = requireResponseObject(
      await requestActionJson(context, entityPath("attachments", attachmentId), {
        method: "PATCH",
        jsonBody: compactObject({
          role: input.role,
          mime: input.mime,
          title: input.title,
          position: input.position,
        }),
      }),
      "update attachment",
    );
    return { attachment };
  },

  async delete_attachment(input, context) {
    const attachmentId = requireInputString(input.attachmentId, "attachmentId");
    await requestActionResponse(context, entityPath("attachments", attachmentId), {
      method: "DELETE",
    });
    return { deleted: true, attachmentId };
  },
};

export async function validateTriliumCredential(
  apiTokenInput: unknown,
  baseUrlInput: unknown,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createTriliumContext(apiTokenInput, baseUrlInput, fetcher, signal);
  const appInfo = requireResponseObject(
    await requestTriliumJson({
      context,
      path: "app-info",
      phase: "validate",
    }),
    "validate credential",
  );
  const host = new URL(context.baseUrl).host;
  const tokenId = createHash("sha256").update(context.apiToken).digest("hex").slice(0, 16);
  return {
    profile: {
      accountId: `trilium:${host}:${tokenId}`,
      displayName: `Trilium ${host}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      baseUrl: context.baseUrl,
      apiBaseUrl: context.baseUrl,
      appVersion: optionalString(appInfo.appVersion),
      dbVersion: appInfo.dbVersion,
      syncVersion: appInfo.syncVersion,
      buildRevision: optionalString(appInfo.buildRevision),
      validationEndpoint: "app-info",
    }),
  };
}

export function createTriliumContext(
  apiTokenInput: unknown,
  baseUrlInput: unknown,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): TriliumContext {
  return {
    apiToken: requiredString(apiTokenInput, "apiKey", providerInputError),
    baseUrl: normalizeTriliumBaseUrl(baseUrlInput),
    fetcher,
    signal,
  };
}

export function normalizeTriliumBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const rawValue = optionalString(value)?.trim();
  if (!rawValue) {
    throw providerInputError("baseUrl is required");
  }

  const url = assertPublicHttpUrl(rawValue, {
    fieldName: "baseUrl",
    allowPrivateNetwork,
    createError: providerInputError,
  });
  if (url.username || url.password) {
    throw providerInputError("baseUrl must not include username or password");
  }

  url.search = "";
  url.hash = "";
  const path = trimTrailingSlash(url.pathname);
  url.pathname = path.endsWith("/etapi") ? `${path}/` : `${path}/etapi/`;
  return url.toString();
}

function requestActionJson(
  context: TriliumContext,
  path: string,
  options: Pick<TriliumRequest, "jsonBody" | "method" | "query"> = {},
) {
  return requestTriliumJson({
    context,
    path,
    phase: "execute",
    ...options,
  });
}

function requestActionResponse(
  context: TriliumContext,
  path: string,
  options: Pick<TriliumRequest, "accept" | "body" | "contentType" | "method" | "query"> = {},
) {
  return requestTriliumResponse(
    {
      context,
      path,
      phase: "execute",
      ...options,
    },
    async () => undefined,
  );
}

async function requestTriliumJson(input: TriliumRequest) {
  return requestTriliumResponse(input, (response) =>
    readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: `Trilium ${input.path} returned invalid JSON`,
    }),
  );
}

async function requestTriliumResponse<TResult>(
  input: TriliumRequest,
  readResponse: (response: Response) => Promise<TResult>,
): Promise<TResult> {
  const timeout = createProviderTimeout(input.context.signal, triliumRequestTimeoutMs);
  const headers = new Headers({
    accept: input.accept ?? "application/json",
    authorization: `Bearer ${input.context.apiToken}`,
    "user-agent": providerUserAgent,
  });
  let body = input.body;
  if (input.jsonBody) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(input.jsonBody);
  } else if (input.contentType) {
    headers.set("content-type", input.contentType);
  }

  try {
    const response = await input.context.fetcher(buildTriliumUrl(input.context.baseUrl, input.path, input.query), {
      method: input.method ?? "GET",
      headers,
      body,
      signal: timeout.signal,
    });
    if (!response.ok) {
      const payload = await readErrorPayload(response);
      throw mapTriliumHttpError(response.status, readErrorMessage(payload), input.phase);
    }
    return await readResponse(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Trilium ${input.path} request timed out after ${Math.ceil(triliumRequestTimeoutMs / 1000)} seconds`,
      );
    }
    const message = error instanceof Error && error.message.trim() ? error.message : "request failed";
    throw new ProviderRequestError(502, `Trilium ${input.path} request failed: ${message}`);
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
  const timeout = createProviderTimeout(signal, triliumRequestTimeoutMs);
  try {
    const response = await providerFetch(url, {
      method: "GET",
      signal: timeout.signal,
    });
    if (!response.ok) {
      throw new ProviderRequestError(502, `failed to fetch fileUrl: ${response.status}`);
    }
    const bytes = await readBoundedResponseBytes(response, {
      maxBytes: triliumAttachmentMaxBytes,
      fieldName: "attachment",
      createError: (message) => new ProviderRequestError(413, message),
    });
    const responseMimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    return {
      bytes,
      mimeType: mimeTypeInput ?? responseMimeType ?? "application/octet-stream",
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `fileUrl request timed out after ${Math.ceil(triliumRequestTimeoutMs / 1000)} seconds`,
      );
    }
    const message = error instanceof Error && error.message.trim() ? error.message : "request failed";
    throw new ProviderRequestError(502, `failed to fetch fileUrl: ${message}`);
  } finally {
    timeout.cleanup();
  }
}

async function readErrorPayload(response: Response) {
  return readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "Trilium returned invalid JSON",
    invalidJsonFallback: (text) => text,
  });
}

function readErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  return optionalString(object?.message)?.trim() || "Trilium request failed";
}

function mapTriliumHttpError(status: number, message: string, phase: TriliumRequest["phase"]) {
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (status === 400 || status === 403 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function buildTriliumUrl(baseUrl: string, path: string, query?: Record<string, unknown>) {
  const url = new URL(trimLeadingSlash(path), baseUrl);
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value != null) {
      url.searchParams.set(name, String(value));
    }
  }
  return url;
}

function entityPath(collection: "attachments" | "attributes" | "branches" | "notes", id: string) {
  return `${collection}/${encodeURIComponent(id)}`;
}

function requireInputString(value: unknown, fieldName: string, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && !value)) {
    throw providerInputError(`${fieldName} is required`);
  }
  return value;
}

function requireResponseString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value) {
    throw new ProviderRequestError(502, `Trilium response did not include ${fieldName}`);
  }
  return value;
}

function requireResponseObject(value: unknown, operation: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `Trilium ${operation} response did not include an object`);
  }
  return object;
}

function requireResponseObjectArray(value: unknown, operation: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Trilium ${operation} response did not include an array`);
  }
  return value.map((item) => requireResponseObject(item, operation));
}

function requireAnyInputField(input: Record<string, unknown>, fields: readonly string[], message: string): void {
  if (!fields.some((field) => Object.hasOwn(input, field))) {
    throw providerInputError(message);
  }
}

function isTextMimeType(value: string) {
  const mimeType = value.toLowerCase();
  return (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/javascript" ||
    mimeType === "application/xml" ||
    mimeType.endsWith("+json") ||
    mimeType.endsWith("+xml")
  );
}

function trimLeadingSlash(value: string) {
  let index = 0;
  while (value[index] === "/") {
    index += 1;
  }
  return value.slice(index);
}

function trimTrailingSlash(value: string) {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}
