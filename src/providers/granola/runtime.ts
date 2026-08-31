import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const granolaApiBaseUrl = "https://public-api.granola.ai";

type GranolaActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type GranolaRequestMode = "validate" | "execute";

export const granolaActionHandlers: ProviderActionHandlers<"granola", GranolaActionHandler> = {
  async list_notes(input, context) {
    const payload = await requestGranola(context, buildListNotesUrl(input), "execute");
    const record = asRecord(payload, "Granola notes response");
    return {
      notes: Array.isArray(record.notes) ? record.notes : [],
      hasMore: Boolean(record.hasMore),
      cursor: optionalString(record.cursor) ?? null,
      nextCursor: optionalString(record.cursor) ?? null,
    };
  },
  async get_note(input, context) {
    const payload = await requestGranola(context, buildGetNoteUrl(input), "execute");
    return { note: asRecord(payload, "Granola note response") };
  },
  async list_folders(input, context) {
    const payload = await requestGranola(context, buildListFoldersUrl(input), "execute");
    const record = asRecord(payload, "Granola folders response");
    return {
      folders: Array.isArray(record.folders) ? record.folders : [],
      hasMore: Boolean(record.hasMore),
      cursor: optionalString(record.cursor) ?? null,
      nextCursor: optionalString(record.cursor) ?? null,
    };
  },
};

export async function validateGranolaCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestGranola(
    { apiKey, fetcher, signal },
    granolaUrl("/v1/folders", { page_size: 1 }),
    "validate",
  );
  const record = asRecord(payload, "Granola folders response");
  const folders = Array.isArray(record.folders) ? record.folders : [];
  const firstFolder = optionalRecord(folders[0]);
  const firstFolderName = optionalString(firstFolder?.name);
  const firstFolderId = optionalString(firstFolder?.id);

  return {
    profile: {
      accountId: firstFolderId,
      displayName: firstFolderName ?? firstFolderId ?? "Granola API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: granolaApiBaseUrl,
      validationEndpoint: "/v1/folders",
      firstFolderId,
      firstFolderName,
    }),
  };
}

function buildListNotesUrl(input: Record<string, unknown>): URL {
  return granolaUrl("/v1/notes", {
    created_before: input.created_before,
    created_after: input.created_after,
    updated_after: input.updated_after,
    folder_id: input.folder_id,
    cursor: input.cursor,
    page_size: input.page_size,
  });
}

function buildGetNoteUrl(input: Record<string, unknown>): URL {
  return granolaUrl(`/v1/notes/${encodeURIComponent(requireString(input.note_id, "note_id"))}`, {
    include: input.include,
  });
}

function buildListFoldersUrl(input: Record<string, unknown>): URL {
  return granolaUrl("/v1/folders", {
    cursor: input.cursor,
    page_size: input.page_size,
  });
}

function granolaUrl(path: string, query?: Record<string, unknown>): URL {
  const url = new URL(path, granolaApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function requestGranola(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  url: URL,
  mode: GranolaRequestMode,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal);
  let response: Response;
  try {
    response = await context.fetcher(url.toString(), {
      method: "GET",
      headers: granolaHeaders(context.apiKey),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Granola request timed out");
    }
    throw new ProviderRequestError(
      502,
      `Granola request failed: ${error instanceof Error ? error.message : "unknown transport error"}`,
    );
  } finally {
    timeout.cleanup();
  }

  await assertGranolaResponse(response, mode);
  return readGranolaJson(response, "invalid Granola response");
}

function granolaHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function assertGranolaResponse(response: Response, mode: GranolaRequestMode): Promise<void> {
  if (response.ok) {
    return;
  }

  const error = await readGranolaError(response);
  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, error.message);
  }
  if (mode === "execute" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(response.status, error.message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new ProviderRequestError(400, error.message);
  }

  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, error.message);
}

async function readGranolaJson(response: Response, message: string): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, message);
  }
}

async function readGranolaError(response: Response): Promise<{ message: string }> {
  const payload = await readGranolaJson(response, `Granola request failed with ${response.status}`);
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `Granola request failed with ${response.status}`;
  return { message };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  return record;
}

function requireString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}
