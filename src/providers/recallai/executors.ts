import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { RecallAiActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderProxy,
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "recallai";
const recallaiApiBaseUrlByRegion: Record<RecallAiRegion, string> = {
  "us-east-1": "https://us-east-1.recall.ai",
  "us-west-2": "https://us-west-2.recall.ai",
  "eu-central-1": "https://eu-central-1.recall.ai",
  "ap-northeast-1": "https://ap-northeast-1.recall.ai",
};

type RecallAiRegion = "us-east-1" | "us-west-2" | "eu-central-1" | "ap-northeast-1";

interface RecallAiContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type RecallAiActionHandler = (input: Record<string, unknown>, context: RecallAiContext) => Promise<unknown>;

export const recallaiActionHandlers: Record<RecallAiActionName, RecallAiActionHandler> = {
  async create_bot(input, context) {
    return {
      bot: readRecallAiObject(
        await requestRecallAi({
          path: "/api/v1/bot/",
          method: "POST",
          body: buildCreateBotBody(input),
          context,
          mode: "execute",
        }),
      ),
    };
  },
  async list_bots(input, context) {
    const query = buildListBotsQuery(input);
    const page = readPaginatedBotList(
      await requestRecallAi({
        path: query ? `/api/v1/bot/?${query}` : "/api/v1/bot/",
        context,
        mode: "execute",
      }),
    );
    return {
      count: page.count ?? null,
      next: page.next ?? null,
      previous: page.previous ?? null,
      bots: page.results,
    };
  },
  async get_bot(input, context) {
    const botId = requiredInputString(input.id, "id");
    return {
      bot: readRecallAiObject(
        await requestRecallAi({
          path: `/api/v1/bot/${encodeURIComponent(botId)}/`,
          context,
          mode: "execute",
        }),
      ),
    };
  },
  async remove_bot_from_call(input, context) {
    const botId = requiredInputString(input.id, "id");
    const payload = await requestRecallAi({
      path: `/api/v1/bot/${encodeURIComponent(botId)}/leave_call/`,
      method: "POST",
      context,
      mode: "execute",
    });
    return { bot: payload == null ? null : readRecallAiObject(payload) };
  },
  async delete_bot_media(input, context) {
    const botId = requiredInputString(input.id, "id");
    const payload = await requestRecallAi({
      path: `/api/v1/bot/${encodeURIComponent(botId)}/delete_media/`,
      method: "POST",
      context,
      mode: "execute",
    });
    return { bot: payload == null ? null : readRecallAiObject(payload) };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<RecallAiContext>({
  service,
  handlers: recallaiActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<RecallAiContext> {
    const credential = await requireApiKeyCredential(context, service);
    const apiBaseUrl = resolveRecallAiApiBaseUrl({ ...credential.values, ...credential.metadata });
    const runtimeContext: RecallAiContext = {
      apiKey: credential.apiKey,
      apiBaseUrl,
      fetcher,
    };
    if (context.signal) runtimeContext.signal = context.signal;
    return runtimeContext;
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: recallAiProxyBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Token " },
});

async function recallAiProxyBaseUrl(context: ExecutionContext): Promise<string> {
  const credential = await requireApiKeyCredential(context, service);
  return resolveRecallAiApiBaseUrl({ ...credential.values, ...credential.metadata });
}

export async function validateRecallAiCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const region = normalizeRecallAiRegion(input.region);
  const apiBaseUrl = recallaiApiBaseUrlByRegion[region];
  const validationPath = "/api/v1/bot/?page=1";
  const page = readPaginatedBotList(
    await requestRecallAi({
      path: validationPath,
      context: { apiKey, apiBaseUrl, fetcher },
      mode: "validate",
    }),
  );
  return {
    profile: {
      accountId: buildRecallAiAccountId(apiKey, region),
      displayName: `Recall.ai API Key (${region})`,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      region,
      apiBaseUrl,
      validationEndpoint: validationPath,
      botCount: page.count,
      nextPageUrl: page.next,
    },
  };
}

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateRecallAiCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};

async function requestRecallAi(input: {
  path: string;
  context: Pick<RecallAiContext, "apiKey" | "apiBaseUrl" | "fetcher" | "signal">;
  mode: "validate" | "execute";
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(new URL(input.path, input.context.apiBaseUrl), {
      method: input.method ?? "GET",
      headers: {
        authorization: `Token ${input.context.apiKey}`,
        accept: "application/json",
        ...(input.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
    payload = await readRecallAiPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `recallai request failed: ${error.message}` : "recallai request failed",
    );
  }
  if (!response.ok) throw createRecallAiError(response, payload, input.mode);
  return payload;
}

function buildCreateBotBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    meeting_url: requiredInputString(input.meeting_url, "meeting_url"),
    bot_name: optionalString(input.bot_name),
    join_at: optionalString(input.join_at),
    recording_config: readOptionalObject(input.recording_config, "recording_config"),
    automatic_leave: readOptionalObject(input.automatic_leave, "automatic_leave"),
    metadata: readOptionalStringRecord(input.metadata, "metadata"),
  });
}

function buildListBotsQuery(input: Record<string, unknown>): string {
  const query = new URLSearchParams();
  const page = optionalInteger(input.page);
  if (page !== undefined) query.set("page", String(page));
  for (const key of ["meeting_url", "join_at_after", "join_at_before", "use_cursor"]) {
    const value = optionalString(input[key]);
    if (value) query.set(key, value);
  }
  appendStringArray(query, "platform", input.platform);
  appendStringArray(query, "status", input.status);
  const metadata = readOptionalStringRecord(input.metadata, "metadata");
  for (const [key, value] of Object.entries(metadata ?? {})) {
    query.set(`metadata__${key}`, value);
  }
  return query.toString();
}

function resolveRecallAiApiBaseUrl(providerMetadata: Record<string, unknown>): string {
  const apiBaseUrl = optionalString(providerMetadata.apiBaseUrl);
  if (apiBaseUrl) return apiBaseUrl;
  return recallaiApiBaseUrlByRegion[normalizeRecallAiRegion(providerMetadata.region)];
}

function normalizeRecallAiRegion(value: unknown): RecallAiRegion {
  const rawValue = optionalString(value);
  if (!rawValue) throw new ProviderRequestError(400, "region is required");
  const lowerRawValue = rawValue.toLowerCase();
  const valueWithoutProtocol = lowerRawValue.includes("://") ? (lowerRawValue.split("://", 2)[1] ?? "") : lowerRawValue;
  const normalizedValue = valueWithoutProtocol.split("/", 1)[0] ?? "";
  if (normalizedValue === "api.recall.ai" || normalizedValue === "us-east-1.recall.ai") return "us-east-1";
  for (const region of Object.keys(recallaiApiBaseUrlByRegion) as RecallAiRegion[]) {
    if (normalizedValue === region || normalizedValue === `${region}.recall.ai`) return region;
  }
  throw new ProviderRequestError(400, `unsupported Recall.ai region: ${rawValue}`);
}

function buildRecallAiAccountId(apiKey: string, region: RecallAiRegion): string {
  const suffix = createHash("sha256").update(`${region}:${apiKey}`).digest("hex").slice(0, 16);
  return `recallai:${region}:${suffix}`;
}

function createRecallAiError(response: Response, payload: unknown, mode: "validate" | "execute"): ProviderRequestError {
  const message = extractRecallAiErrorMessage(payload) ?? response.statusText ?? "recallai request failed";
  const detailCode = extractRecallAiErrorCode(payload);
  if (response.status === 429 || response.status === 507) return new ProviderRequestError(429, message, payload);
  if (response.status === 401) return new ProviderRequestError(mode === "validate" ? 401 : 403, message, payload);
  if (response.status === 403 && detailCode === "request_blocked")
    return new ProviderRequestError(400, message, payload);
  if (response.status === 409 && message.toLowerCase().includes("already in progress"))
    return new ProviderRequestError(409, message, payload);
  if ([400, 403, 404, 405].includes(response.status)) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(response.status >= 500 ? 502 : 400, message, payload);
}

async function readRecallAiPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readPaginatedBotList(payload: unknown): {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results: Array<Record<string, unknown>>;
} {
  const record = readRecallAiObject(payload);
  const results = Array.isArray(record.results) ? record.results.map((item) => readRecallAiObject(item)) : [];
  return {
    count: typeof record.count === "number" ? record.count : undefined,
    next: readNullableString(record.next),
    previous: readNullableString(record.previous),
    results,
  };
}

function readRecallAiObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) throw new ProviderRequestError(502, "Recall.ai returned a non-object payload");
  return record;
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalObject(value: unknown, fieldName: string): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(400, `${fieldName} must be an object`);
  return record;
}

function readOptionalStringRecord(value: unknown, fieldName: string): Record<string, string> | undefined {
  if (value == null) return undefined;
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(400, `${fieldName} must be an object`);
  const normalized: Record<string, string> = {};
  for (const [key, child] of Object.entries(record)) {
    const normalizedChild = optionalString(child);
    if (normalizedChild == null) throw new ProviderRequestError(400, `${fieldName}.${key} must be a string`);
    normalized[key] = normalizedChild;
  }
  return normalized;
}

function appendStringArray(query: URLSearchParams, key: string, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const normalized = optionalString(item);
    if (normalized) query.append(key, normalized);
  }
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return optionalString(value);
}

function extractRecallAiErrorCode(payload: unknown): string | null {
  const code = optionalString(optionalRecord(payload)?.code);
  return code ?? null;
}

function extractRecallAiErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  if (!record) return null;
  for (const key of ["detail", "message", "error", "code"]) {
    const value = optionalString(record[key]);
    if (value) return value;
  }
  return null;
}
