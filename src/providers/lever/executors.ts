import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { LeverActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "lever";
const leverApiBaseUrl = "https://api.lever.co/v1";
const leverDefaultRequestTimeoutMs = 30_000;

type LeverPhase = "validate" | "execute";
type LeverActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const leverActionHandlers: Record<LeverActionName, LeverActionHandler> = {
  async list_postings(input, context) {
    const payload = await requestLeverJson({
      context,
      path: "postings",
      query: compactObject({
        offset: input.offset,
        limit: input.limit,
        state: input.state,
        team: input.team,
        location: input.location,
        department: input.department,
        owner: input.owner,
        tag: input.tag,
      }),
      phase: "execute",
    });

    return {
      page: normalizePage(payload),
      postings: normalizeRecordList(payload.data, "postings"),
    };
  },
  async get_posting(input, context) {
    const payload = await requestLeverJson({
      context,
      path: `postings/${encodeURIComponent(String(input.postingId))}`,
      query: {},
      phase: "execute",
    });

    return {
      posting: normalizeRecord(payload.data, "posting"),
    };
  },
  async list_opportunities(input, context) {
    const payload = await requestLeverJson({
      context,
      path: "opportunities",
      query: compactObject({
        offset: input.offset,
        limit: input.limit,
        createdAtStart: input.createdAtStart,
        createdAtEnd: input.createdAtEnd,
        updatedAtStart: input.updatedAtStart,
        updatedAtEnd: input.updatedAtEnd,
        stage_id: input.stageId,
        posting_id: input.postingId,
        archive_reason_id: input.archiveReasonId,
        contact: input.contact,
        expand: input.expand,
      }),
      phase: "execute",
    });

    return {
      page: normalizePage(payload),
      opportunities: normalizeRecordList(payload.data, "opportunities"),
    };
  },
  async get_opportunity(input, context) {
    const payload = await requestLeverJson({
      context,
      path: `opportunities/${encodeURIComponent(String(input.opportunityId))}`,
      query: {},
      phase: "execute",
    });

    return {
      opportunity: normalizeRecord(payload.data, "opportunity"),
    };
  },
  async list_opportunity_notes(input, context) {
    const payload = await requestLeverJson({
      context,
      path: `opportunities/${encodeURIComponent(String(input.opportunityId))}/notes`,
      query: compactObject({
        offset: input.offset,
        limit: input.limit,
      }),
      phase: "execute",
    });

    return {
      page: normalizePage(payload),
      notes: normalizeRecordList(payload.data, "notes"),
    };
  },
  async create_opportunity_note(input, context) {
    const payload = await requestLeverJson({
      context,
      path: `opportunities/${encodeURIComponent(String(input.opportunityId))}/notes`,
      query: {},
      method: "POST",
      body: {
        value: input.value,
      },
      phase: "execute",
    });

    return {
      note: normalizeRecord(payload.data, "note"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, leverActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: leverApiBaseUrl,
  auth: {
    type: "api_key_basic",
    suffix: ":",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestLeverJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: "postings",
      query: {
        limit: 1,
      },
      phase: "validate",
    });

    return {
      profile: {
        accountId: "lever",
        displayName: "Lever API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: leverApiBaseUrl,
        validationEndpoint: "/postings",
        validationRecordCount: Array.isArray(payload.data) ? payload.data.length : undefined,
      }),
    } satisfies CredentialValidationResult;
  },
};

async function requestLeverJson(input: {
  context: ApiKeyProviderContext;
  path: string;
  query: Record<string, unknown>;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  phase: LeverPhase;
}): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.context.signal, leverDefaultRequestTimeoutMs);

  try {
    const url = new URL(`${leverApiBaseUrl}/${input.path}`);
    appendLeverQuery(url, input.query);

    const response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: createLeverAuthorization(input.context.apiKey),
        ...(input.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readLeverPayload(response);

    if (!response.ok) {
      throw createLeverHttpError(response.status, payload, input.phase);
    }

    const payloadRecord = optionalRecord(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "Lever returned an invalid payload", payload);
    }

    return payloadRecord;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Lever request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Lever request failed: ${error.message}` : "Lever request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function appendLeverQuery(url: URL, query: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }

    url.searchParams.set(key, String(value));
  }
}

async function readLeverPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Lever returned invalid JSON");
  }
}

function createLeverHttpError(status: number, payload: unknown, phase: LeverPhase): ProviderRequestError {
  const message = extractLeverErrorMessage(payload) ?? `Lever request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && status === 403) {
    return new ProviderRequestError(403, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractLeverErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
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
  if (typeof error === "string" && error.trim() !== "") {
    return error;
  }

  const errorRecord = optionalRecord(error);
  return optionalString(errorRecord?.message) ?? optionalString(errorRecord?.code);
}

function normalizePage(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    hasNext: payload.hasNext === true,
    next: optionalString(payload.next) ?? null,
  };
}

function normalizeRecordList(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Lever returned an invalid ${label} list`, value);
  }

  return value.map((item) => normalizeRecord(item, label));
}

function normalizeRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Lever returned an invalid ${label} object`, value);
  }
  return record;
}

function createLeverAuthorization(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}
