import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "mem";
const memApiBaseUrl = "https://api.mem.ai/v2";
const memRequestTimeoutMs = 30_000;
const memMaxResponseBytes = 10 * 1024 * 1024;

type MemRequestPhase = "validate" | "execute";
interface MemActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type MemActionHandler = (input: Record<string, unknown>, context: MemActionContext) => Promise<unknown>;

export const memActionHandlers: ProviderActionHandlers<"mem", MemActionHandler> = {
  create_note(input, context) {
    validateContentBytes(input.content);
    validateCollectionTitles(input.collection_titles);
    return requestMemJson("/notes", "POST", input, context, "execute");
  },
  list_notes(input, context) {
    const url = buildMemUrl("/notes");
    appendQuery(url, input);
    return requestMemJson(url, "GET", undefined, context, "execute");
  },
  read_note(input, context) {
    return requestMemJson(notePath(input.note_id), "GET", undefined, context, "execute");
  },
  search_notes(input, context) {
    validateSearchInput(input);
    const url = buildMemUrl("/notes/search");
    appendQuery(url, {
      limit: input.limit,
      offset: input.offset,
      snapshot_id: input.snapshot_id,
    });
    const { limit: _limit, offset: _offset, snapshot_id: _snapshotId, ...body } = input;
    return requestMemJson(url, "POST", body, context, "execute");
  },
  update_note(input, context) {
    validateContentBytes(input.content);
    const { note_id: _noteId, ...body } = input;
    return requestMemJson(notePath(input.note_id), "PATCH", body, context, "execute");
  },
  trash_note(input, context) {
    return requestMemJson(`${notePath(input.note_id)}/trash`, "POST", undefined, context, "execute");
  },
  restore_note(input, context) {
    return requestMemJson(`${notePath(input.note_id)}/restore`, "POST", undefined, context, "execute");
  },
  delete_note(input, context) {
    return requestMemJson(notePath(input.note_id), "DELETE", undefined, context, "execute");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, memActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: memApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestMemJson(
      "/notes?limit=1",
      "GET",
      undefined,
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
    );
    const record = optionalRecord(payload);
    return {
      profile: {
        accountId: `mem:${createHash("sha256").update(input.apiKey).digest("hex").slice(0, 16)}`,
        displayName: "Mem API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: memApiBaseUrl,
        validationEndpoint: "/notes?limit=1",
        ...(typeof record?.total === "number" ? { noteCount: record.total } : {}),
      },
    };
  },
};

async function requestMemJson(
  pathOrUrl: string | URL,
  method: string,
  body: Record<string, unknown> | undefined,
  context: MemActionContext,
  phase: MemRequestPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, memRequestTimeoutMs);
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${context.apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }

  try {
    const response = await context.fetcher(typeof pathOrUrl === "string" ? buildMemUrl(pathOrUrl) : pathOrUrl, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: timeout.signal,
    });
    const payload = await readMemPayload(response);
    if (!response.ok) {
      throw mapMemError(response, payload, phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Mem request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Mem request failed: ${error.message}` : "Mem request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildMemUrl(path: string): URL {
  return new URL(`${memApiBaseUrl}${path}`);
}

function notePath(value: unknown): string {
  const noteId = optionalString(value)?.trim();
  if (!noteId) {
    throw new ProviderRequestError(400, "note_id is required");
  }
  return `/notes/${encodeURIComponent(noteId)}`;
}

function appendQuery(url: URL, input: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      url.searchParams.set(key, String(value));
    }
  }
}

async function readMemPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Mem response", memMaxResponseBytes);
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return { message: text };
    }
    throw new ProviderRequestError(502, "Mem returned invalid JSON");
  }
}

function mapMemError(response: Response, payload: unknown, phase: MemRequestPhase): ProviderRequestError {
  const message = extractMemMessage(payload) ?? `Mem request failed with HTTP ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if ([400, 404, 409, 422].includes(response.status)) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message);
}

function extractMemMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return optionalString(error?.message) ?? optionalString(record?.message);
}

function validateContentBytes(value: unknown): void {
  if (typeof value === "string" && new TextEncoder().encode(value).byteLength > 200_000) {
    throw new ProviderRequestError(400, "content must not exceed 200000 UTF-8 bytes");
  }
}

function validateCollectionTitles(value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const title of value) {
    if (typeof title === "string" && new TextEncoder().encode(title).byteLength > 1_000) {
      throw new ProviderRequestError(400, "collection title must not exceed 1000 UTF-8 bytes");
    }
  }
}

function validateSearchInput(input: Record<string, unknown>): void {
  if (typeof input.query === "string" && input.query.trim().length === 0) {
    throw new ProviderRequestError(400, "query must contain at least one non-whitespace character");
  }
  if (typeof input.offset === "number" && input.offset > 0 && !input.snapshot_id) {
    throw new ProviderRequestError(400, "snapshot_id is required when offset is greater than 0");
  }
}
