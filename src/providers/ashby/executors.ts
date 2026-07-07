import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { AshbyActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, objectArray, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  defineProviderProxy,
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "ashby";
const ashbyApiBaseUrl = "https://api.ashbyhq.com";

type AshbyPhase = "validate" | "execute";
type AshbyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const ashbyActionHandlers: Record<AshbyActionName, AshbyActionHandler> = {
  async api_key_info(_input, context) {
    const payload = await requestAshbyJson({
      endpoint: "apiKey.info",
      body: {},
      context,
      phase: "execute",
    });
    return {
      apiKey: normalizeApiKeyInfo(payload.results),
    };
  },

  async list_jobs(input, context) {
    const payload = await requestAshbyJson({
      endpoint: "job.list",
      body: compactObject({
        createdAfter: input.createdAfter,
        cursor: input.cursor,
        syncToken: input.syncToken,
        limit: input.limit,
        status: input.status,
        openedAfter: input.openedAfter,
        openedBefore: input.openedBefore,
        closedAfter: input.closedAfter,
        closedBefore: input.closedBefore,
        includeUnpublishedJobPostingsIds: input.includeUnpublishedJobPostingsIds,
        expand: input.expand,
      }),
      context,
      phase: "execute",
    });
    return {
      page: normalizePage(payload),
      jobs: normalizeRecordList(payload.results),
    };
  },

  async list_candidates(input, context) {
    const payload = await requestAshbyJson({
      endpoint: "candidate.list",
      body: compactObject({
        createdAfter: input.createdAfter,
        cursor: input.cursor,
        syncToken: input.syncToken,
        limit: input.limit,
      }),
      context,
      phase: "execute",
    });
    return {
      page: normalizePage(payload),
      candidates: normalizeRecordList(payload.results),
    };
  },

  async search_candidates(input, context) {
    const payload = await requestAshbyJson({
      endpoint: "candidate.search",
      body: compactObject({
        email: optionalString(input.email),
        name: optionalString(input.name),
      }),
      context,
      phase: "execute",
    });
    return {
      candidates: normalizeRecordList(payload.results),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiKeyProviderContext>({
  service,
  handlers: ashbyActionHandlers,
  async createContext(context, fetcher): Promise<ApiKeyProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ashbyApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestAshbyJson({
      endpoint: "apiKey.info",
      body: {},
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const apiKeyInfo = normalizeApiKeyInfo(payload.results);

    return {
      profile: {
        displayName: apiKeyInfo.title ?? "Ashby API Key",
      },
      grantedScopes: apiKeyInfo.scopes,
      metadata: compactObject({
        validationEndpoint: "/apiKey.info",
        apiKeyTitle: apiKeyInfo.title ?? undefined,
        createdAt: apiKeyInfo.createdAt ?? undefined,
        scopeCount: apiKeyInfo.scopes.length,
      }),
    };
  },
};

async function requestAshbyJson(input: {
  endpoint: string;
  body: Record<string, unknown>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: AshbyPhase;
}): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await input.context.fetcher(new URL(input.endpoint, `${ashbyApiBaseUrl}/`), {
      method: "POST",
      headers: {
        accept: "application/json; version=1",
        authorization: createAshbyAuthorization(input.context.apiKey),
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `Ashby request failed: ${error.message}` : "Ashby request failed",
    );
  }

  const payload = await readAshbyPayload(response);
  if (!response.ok) {
    throw createAshbyHttpError(response.status, payload, input.phase);
  }
  if (payload.success === false) {
    throw createAshbyApplicationError(payload, input.phase);
  }

  return payload;
}

async function readAshbyPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.trim() === "") {
    throw new ProviderRequestError(502, "Ashby returned an empty payload");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Ashby returned invalid JSON");
  }

  return requiredRecord(payload, "Ashby payload", (message) => new ProviderRequestError(502, message));
}

function createAshbyHttpError(status: number, payload: unknown, phase: AshbyPhase): ProviderRequestError {
  const message = extractAshbyErrorMessage(payload) ?? `Ashby request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function createAshbyApplicationError(payload: Record<string, unknown>, phase: AshbyPhase): ProviderRequestError {
  const message = extractAshbyErrorMessage(payload) ?? "Ashby request failed";
  const errorCode = extractAshbyErrorCode(payload);

  if (errorCode === "missing_endpoint_permission") {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message, payload);
  }

  return new ProviderRequestError(400, message, payload);
}

function extractAshbyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage = optionalString(record.message);
  if (directMessage) {
    return directMessage;
  }

  const error = record.error;
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  const errorRecord = optionalRecord(error);
  return optionalString(errorRecord?.message) ?? optionalString(errorRecord?.code);
}

function extractAshbyErrorCode(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directCode = optionalString(record.errorCode) ?? optionalString(record.code);
  if (directCode) {
    return directCode;
  }

  const error = record.error;
  if (typeof error === "string") {
    return error.trim() || undefined;
  }

  return optionalString(optionalRecord(error)?.code);
}

function normalizeApiKeyInfo(value: unknown): {
  title: string | null;
  createdAt: string | null;
  scopes: string[];
  raw: Record<string, unknown>;
} {
  const raw = requiredRecord(value, "Ashby API key information", (message) => new ProviderRequestError(502, message));
  return {
    title: optionalString(raw.title) ?? null,
    createdAt: optionalString(raw.createdAt) ?? null,
    scopes: normalizeStringList(raw.scopes),
    raw,
  };
}

function normalizePage(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    moreDataAvailable: payload.moreDataAvailable === true,
    nextCursor: optionalString(payload.nextCursor) ?? null,
    syncToken: optionalString(payload.syncToken) ?? null,
  };
}

function normalizeRecordList(value: unknown): Array<Record<string, unknown>> {
  return objectArray(value, "Ashby result", (message) => new ProviderRequestError(502, message));
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function createAshbyAuthorization(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
