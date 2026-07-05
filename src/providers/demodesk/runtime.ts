import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { DemodeskActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const demodeskApiBaseUrl = "https://demodesk.com/api/v2";

type DemodeskMode = "validate" | "execute";
type DemodeskHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type DemodeskQuery = Array<[string, string]>;

interface DemodeskRequestInput {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  mode: DemodeskMode;
  signal?: AbortSignal;
  method?: "GET" | "POST";
  query?: DemodeskQuery;
  body?: Record<string, unknown>;
}

export const demodeskActionHandlers: Record<DemodeskActionName, DemodeskHandler> = {
  async get_current_user(_input, context) {
    const payload = await requestDemodeskJson({
      path: "/me",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
    });
    return { user: readDataObject(payload, "Demodesk current user") };
  },
  async list_users(input, context) {
    const payload = await requestDemodeskJson({
      path: "/users",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
      query: readUsersQuery(input),
    });
    return {
      users: readDataArray(payload, "Demodesk users"),
      meta: readPaginationMetaObject(payload),
    };
  },
  async list_recordings(input, context) {
    const payload = await requestDemodeskJson({
      path: "/recordings",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
      query: readRecordingsQuery(input),
    });
    return {
      recordings: readDataArray(payload, "Demodesk recordings"),
      meta: readPaginationMetaObject(payload),
    };
  },
  async get_recording(input, context) {
    const token = encodePathSegment(requiredString(input.token, "token", badInput));
    const payload = await requestDemodeskJson({
      path: `/recordings/${token}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
    });
    return { recording: readDataObject(payload, "Demodesk recording") };
  },
  get_recording_transcript(input, context) {
    return requestDemodeskTranscript(input, context);
  },
  async batch_get_recording_transcripts(input, context) {
    const payload = await requestDemodeskJson({
      path: "/transcripts/batch",
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
      body: compactObject({
        recordingTokens: input.recordingTokens,
        lang: input.lang,
        format: input.format,
      }),
    });
    return {
      results: readDataArray(payload, "Demodesk transcript batch results"),
      meta: readMetaObject(payload),
    };
  },
  async list_recording_summaries(input, context) {
    const token = encodePathSegment(requiredString(input.token, "token", badInput));
    const payload = await requestDemodeskJson({
      path: `/recordings/${token}/summaries`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
    });
    return { summaries: readDataArray(payload, "Demodesk recording summaries") };
  },
  async list_recording_scorecards(input, context) {
    const token = encodePathSegment(requiredString(input.token, "token", badInput));
    const payload = await requestDemodeskJson({
      path: `/recordings/${token}/scorecards`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
    });
    return { scorecards: readDataArray(payload, "Demodesk recording scorecards") };
  },
};

export async function validateDemodeskCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestDemodeskJson({
    path: "/me",
    apiKey,
    fetcher,
    mode: "validate",
    signal,
  });
  const user = readDataObject(payload, "Demodesk current user");
  const email = optionalString(user.email);
  const fullName = [optionalString(user.firstName), optionalString(user.lastName)].filter(Boolean).join(" ").trim();
  const userId = optionalString(user.id);

  return {
    profile: {
      accountId: userId ?? email ?? "api_key",
      displayName: fullName || email || "Demodesk API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: demodeskApiBaseUrl,
      validationEndpoint: "/me",
      userId,
      email,
    }),
  };
}

async function requestDemodeskJson(input: DemodeskRequestInput): Promise<unknown> {
  const response = await fetchDemodesk(input, "application/json");
  const payload = await readDemodeskOptionalJsonPayload(response);
  if (!response.ok) {
    throw createDemodeskError(response, payload, input.mode);
  }
  if (payload === null) {
    throw new ProviderRequestError(502, "Demodesk returned an empty JSON response");
  }
  return payload;
}

async function requestDemodeskTranscript(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const token = encodePathSegment(requiredString(input.token, "token", badInput));
  const format = optionalString(input.format) ?? "json";
  const response = await fetchDemodesk(
    {
      path: `/recordings/${token}/transcript`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      mode: "execute",
      signal: context.signal,
      query: readTranscriptQuery(input),
    },
    format === "plaintext" ? "text/plain" : "application/json",
  );

  if (response.status === 202) {
    return {
      status: "processing",
      transcript: null,
      text: null,
      error: await readDemodeskOptionalJsonPayload(response),
    };
  }
  if (response.status === 204) {
    return { status: "empty", transcript: null, text: null, error: null };
  }
  if (!response.ok) {
    const payload = await readDemodeskOptionalJsonPayload(response);
    throw createDemodeskError(response, payload, "execute");
  }
  if (format === "plaintext") {
    return {
      status: "ready",
      transcript: null,
      text: await response.text(),
      error: null,
    };
  }
  const payload = await readDemodeskJsonPayload(response);
  return {
    status: "ready",
    transcript: readDataObject(payload, "Demodesk recording transcript"),
    text: null,
    error: null,
  };
}

async function fetchDemodesk(input: DemodeskRequestInput, accept: string): Promise<Response> {
  const headers: Record<string, string> = {
    accept,
    authorization: `Bearer ${input.apiKey}`,
    "user-agent": providerUserAgent,
  };
  let body: string | undefined;
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(input.body);
  }

  try {
    return await input.fetcher(buildDemodeskUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers,
      body,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Demodesk request failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

function buildDemodeskUrl(path: string, query?: DemodeskQuery): URL {
  const baseUrl = demodeskApiBaseUrl.endsWith("/") ? demodeskApiBaseUrl : `${demodeskApiBaseUrl}/`;
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(relativePath, baseUrl);
  for (const [key, value] of query ?? []) {
    url.searchParams.append(key, value);
  }
  return url;
}

function readUsersQuery(input: Record<string, unknown>): DemodeskQuery {
  const query: DemodeskQuery = [];
  appendOptionalQueryValue(query, "search", input.search);
  appendOptionalQueryValue(query, "cursor", input.cursor);
  appendOptionalQueryValue(query, "limit", input.limit);
  return query;
}

function readRecordingsQuery(input: Record<string, unknown>): DemodeskQuery {
  const query: DemodeskQuery = [];
  appendOptionalQueryValue(query, "cursor", input.cursor);
  appendOptionalQueryValue(query, "limit", input.limit);

  const filters = optionalRecord(input.filters);
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        query.push([`filter[${key}][]`, String(item)]);
      }
    } else {
      appendOptionalQueryValue(query, `filter[${key}]`, value);
    }
  }
  return query;
}

function readTranscriptQuery(input: Record<string, unknown>): DemodeskQuery {
  const query: DemodeskQuery = [];
  appendOptionalQueryValue(query, "lang", input.lang);
  appendOptionalQueryValue(query, "format", input.format);
  return query;
}

function appendOptionalQueryValue(query: DemodeskQuery, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }
  query.push([key, String(value)]);
}

async function readDemodeskJsonPayload(response: Response): Promise<unknown> {
  const payload = await readDemodeskOptionalJsonPayload(response);
  if (payload === null) {
    throw new ProviderRequestError(502, "Demodesk returned an empty JSON response");
  }
  return payload;
}

async function readDemodeskOptionalJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Demodesk returned invalid JSON");
  }
}

function readDataObject(payload: unknown, description: string): Record<string, unknown> {
  const data = optionalRecord(optionalRecord(payload)?.data);
  if (!data) {
    throw new ProviderRequestError(502, `${description} response did not include data`);
  }
  return data;
}

function readDataArray(payload: unknown, description: string): unknown[] {
  const data = optionalRecord(payload)?.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, `${description} response did not include data`);
  }
  return data;
}

function readMetaObject(payload: unknown): Record<string, unknown> {
  return optionalRecord(optionalRecord(payload)?.meta) ?? {};
}

function readPaginationMetaObject(payload: unknown): Record<string, unknown> {
  const meta = readMetaObject(payload);
  return {
    ...meta,
    nextCursor: meta.nextCursor === undefined ? null : meta.nextCursor,
  };
}

function createDemodeskError(response: Response, payload: unknown, mode: DemodeskMode): ProviderRequestError {
  const message = extractDemodeskErrorMessage(payload) ?? `Demodesk request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractDemodeskErrorMessage(payload: unknown): string | undefined {
  const payloadObject = optionalRecord(payload);
  const error = optionalRecord(payloadObject?.error);
  return optionalString(error?.message) ?? optionalString(error?.code) ?? optionalString(payloadObject?.message);
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
