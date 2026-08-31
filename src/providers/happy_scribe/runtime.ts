import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString, recordOrEmpty } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import {
  createProviderTimeout,
  getProviderActionHandler,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

interface ApiKeyProviderActionInput {
  apiKey: string;
  values: Record<string, string>;
  actionName: string;
  input: Record<string, unknown>;
}

const happyScribeApiBaseUrl = "https://www.happyscribe.com/api/v1";

type RequestPhase = "validate" | "execute";
type ActionHandler = (input: Record<string, unknown>, fetcher: typeof fetch, apiKey: string) => Promise<unknown>;

const happyScribeActionHandlers: ProviderActionHandlers<"happy_scribe", ActionHandler> = {
  async list_organizations(_input, fetcher, apiKey) {
    const payload = await requestHappyScribe({
      path: "/organizations",
      method: "GET",
      apiKey,
      fetcher,
      phase: "execute",
    });
    return normalizeOrganizations(payload);
  },
  async create_transcription_order(input, fetcher, apiKey) {
    const payload = await requestHappyScribe({
      path: "/orders",
      method: "POST",
      apiKey,
      body: {
        order: jsonObject({
          url: readRequiredString(input.mediaUrl, "mediaUrl"),
          language: readRequiredString(input.language, "language"),
          service: readRequiredString(input.service, "service"),
          organization_id: optionalInteger(input.organizationId),
          name: optionalString(input.name),
          folder: optionalString(input.folder),
          confirm: optionalBoolean(input.confirm),
          is_subtitle: optionalBoolean(input.isSubtitle),
          webhook_url: optionalString(input.webhookUrl),
          tags: readOptionalStringArray(input.tags, "tags"),
        }),
      },
      fetcher,
      phase: "execute",
    });
    return { order: recordOrEmpty(payload) };
  },
  async create_translation_order(input, fetcher, apiKey) {
    const payload = await requestHappyScribe({
      path: "/orders/translation",
      method: "POST",
      apiKey,
      body: {
        order: jsonObject({
          source_transcription_id: readRequiredString(input.sourceTranscriptionId, "sourceTranscriptionId"),
          target_languages: readRequiredStringArray(input.targetLanguages, "targetLanguages"),
          service: readRequiredString(input.service, "service"),
          confirm: optionalBoolean(input.confirm),
          webhook_url: optionalString(input.webhookUrl),
        }),
      },
      fetcher,
      phase: "execute",
    });
    return { order: recordOrEmpty(payload) };
  },
  async get_order(input, fetcher, apiKey) {
    const payload = await requestHappyScribe({
      path: `/orders/${encodeURIComponent(readRequiredString(input.orderId, "orderId"))}`,
      method: "GET",
      apiKey,
      fetcher,
      phase: "execute",
    });
    return { order: recordOrEmpty(payload) };
  },
  async confirm_order(input, fetcher, apiKey) {
    const orderId = readRequiredString(input.orderId, "orderId");
    await requestHappyScribe({
      path: `/orders/${encodeURIComponent(orderId)}/confirm`,
      method: "POST",
      apiKey,
      fetcher,
      phase: "execute",
    });
    return { confirmed: true, orderId };
  },
  async list_transcriptions(input, fetcher, apiKey) {
    const payload = await requestHappyScribe({
      path: "/transcriptions",
      method: "GET",
      apiKey,
      params: jsonObject({
        organization_id: String(readRequiredInteger(input.organizationId, "organizationId")),
        page: optionalIntegerString(input.page),
        per_page: optionalIntegerString(input.perPage),
        folder_id: optionalIntegerString(input.folderId),
        tags: readOptionalStringArray(input.tags, "tags")?.join(","),
      }),
      fetcher,
      phase: "execute",
    });
    return normalizeTranscriptions(payload);
  },
  async get_transcription(input, fetcher, apiKey) {
    const payload = await requestHappyScribe({
      path: `/transcriptions/${encodeURIComponent(readRequiredString(input.transcriptionId, "transcriptionId"))}`,
      method: "GET",
      apiKey,
      fetcher,
      phase: "execute",
    });
    return { transcription: recordOrEmpty(payload) };
  },
  async update_transcription(input, fetcher, apiKey) {
    const payload = await requestHappyScribe({
      path: `/transcriptions/${encodeURIComponent(readRequiredString(input.transcriptionId, "transcriptionId"))}`,
      method: "PATCH",
      apiKey,
      body: {
        transcription: jsonObject({
          organization_id: optionalInteger(input.organizationId),
          name: optionalString(input.name),
          sharing_enabled: optionalBoolean(input.sharingEnabled),
          folder_id: optionalInteger(input.folderId),
        }),
      },
      fetcher,
      phase: "execute",
    });
    return { transcription: recordOrEmpty(payload) };
  },
  async delete_transcription(input, fetcher, apiKey) {
    const transcriptionId = readRequiredString(input.transcriptionId, "transcriptionId");
    await requestHappyScribe({
      path: `/transcriptions/${encodeURIComponent(transcriptionId)}`,
      method: "DELETE",
      apiKey,
      params: jsonObject({
        permanent: input.permanent === undefined ? undefined : optionalBoolean(input.permanent) ? "true" : "false",
      }),
      fetcher,
      phase: "execute",
    });
    return { deleted: true, transcriptionId };
  },
  async create_export(input, fetcher, apiKey) {
    const payload = await requestHappyScribe({
      path: "/exports",
      method: "POST",
      apiKey,
      body: {
        export: jsonObject({
          transcription_ids: readRequiredStringArray(input.transcriptionIds, "transcriptionIds"),
          format: readRequiredString(input.format, "format"),
          show_timestamps: optionalBoolean(input.showTimestamps),
          show_speakers: optionalBoolean(input.showSpeakers),
          show_comments: optionalBoolean(input.showComments),
          show_highlights: optionalBoolean(input.showHighlights),
        }),
      },
      fetcher,
      phase: "execute",
    });
    return { export: recordOrEmpty(payload) };
  },
  async get_export(input, fetcher, apiKey) {
    const payload = await requestHappyScribe({
      path: `/exports/${encodeURIComponent(readRequiredString(input.exportId, "exportId"))}`,
      method: "GET",
      apiKey,
      fetcher,
      phase: "execute",
    });
    return { export: recordOrEmpty(payload) };
  },
};

export async function validateHappyScribeCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ accountLabel: string; providerScopes: string[]; providerMetadata: Record<string, unknown> }> {
  const payload = await requestHappyScribe({
    path: "/organizations",
    method: "GET",
    apiKey: input.apiKey,
    fetcher,
    phase: "validate",
  });
  const organizations = readOrganizations(payload);
  const first = optionalRecord(organizations[0]);
  const name = first ? optionalString(first.name) : undefined;

  return {
    accountLabel: name ?? "Happy Scribe API Key",
    providerScopes: [],
    providerMetadata: {
      validationEndpoint: "/organizations",
      organizationCount: organizations.length,
    },
  };
}

export async function executeHappyScribeAction(
  input: ApiKeyProviderActionInput & {
    actionName: string;
    input: Record<string, unknown>;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const handler = getProviderActionHandler(happyScribeActionHandlers, input.actionName);
  if (!handler) {
    throw new ProviderRequestError(400, `unknown happy_scribe action: ${input.actionName}`);
  }
  return handler(input.input, fetcher, input.apiKey);
}

async function requestHappyScribe(input: {
  path: string;
  method: "DELETE" | "GET" | "PATCH" | "POST";
  apiKey: string;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  phase: RequestPhase;
}) {
  const timeout = createProviderTimeout(undefined);
  try {
    const response = await input.fetcher(buildUrl(input.path, input.params), {
      method: input.method,
      headers: buildHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw createHappyScribeError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortError(error)) {
      throw new ProviderRequestError(504, "Happy Scribe request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Happy Scribe request failed: ${error.message}` : "Happy Scribe request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildUrl(path: string, params?: Record<string, unknown>) {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${happyScribeApiBaseUrl}/`);
  for (const [name, value] of Object.entries(params ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  return url;
}

function buildHeaders(apiKey: string, hasBody: boolean) {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) headers["content-type"] = "application/json";
  return headers;
}

async function readPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Happy Scribe returned invalid JSON");
  }
}

function createHappyScribeError(status: number, payload: unknown, phase: RequestPhase) {
  const object = optionalRecord(payload);
  const message =
    (object && (optionalString(object.error) ?? optionalString(object.message) ?? optionalString(object.detail))) ??
    `Happy Scribe request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (400 <= status && status < 500) return new ProviderRequestError(status, message);
  return new ProviderRequestError(status, message);
}

function normalizeOrganizations(payload: unknown) {
  const organizations = readOrganizations(payload).map(recordOrEmpty);
  return { organizations, raw: recordOrEmpty(payload) };
}

function readOrganizations(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const object = optionalRecord(payload);
  return object && Array.isArray(object.organizations) ? object.organizations : [];
}

function normalizeTranscriptions(payload: unknown) {
  const object = optionalRecord(payload);
  const transcriptions = Array.isArray(payload)
    ? payload
    : object && Array.isArray(object.results)
      ? object.results
      : [];
  return { transcriptions: transcriptions.map(recordOrEmpty), raw: recordOrEmpty(payload) };
}

function readRequiredString(value: unknown, fieldName: string) {
  const parsed = optionalString(value)?.trim();
  if (!parsed) throw new ProviderRequestError(400, `${fieldName} is required`);
  return parsed;
}

function readRequiredInteger(value: unknown, fieldName: string) {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return parsed;
}

function optionalIntegerString(value: unknown) {
  const parsed = optionalInteger(value);
  return parsed === undefined ? undefined : String(parsed);
}

function readOptionalStringArray(value: unknown, fieldName: string) {
  if (value === undefined) return undefined;
  return readRequiredStringArray(value, fieldName);
}

function readRequiredStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string array`);
  }
  return value.map((entry) => readRequiredString(entry, fieldName));
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
