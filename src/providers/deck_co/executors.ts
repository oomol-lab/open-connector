import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "deck_co";
const deckCoApiBaseUrl = "https://api.deck.co/v2";

type DeckCoRequestPhase = "validate" | "execute";

interface DeckCoContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type DeckCoActionHandler = (input: Record<string, unknown>, context: DeckCoContext) => Promise<unknown>;

const deckCoActionHandlers: ProviderActionHandlers<"deck_co", DeckCoActionHandler> = {
  test_api_key(_input, context) {
    return deckCoGetJson("/test", {}, context, "execute");
  },
  async list_agents(input, context) {
    const payload = await deckCoGetJson("/agents", buildPaginationQuery(input), context, "execute");
    const record = readObject(payload, "Deck.co agents response");
    return {
      agents: Array.isArray(record.data) ? record.data : [],
      hasMore: record.has_more === true,
      nextCursor: optionalString(record.next_cursor) ?? null,
      requestId: optionalString(record.request_id) ?? null,
    };
  },
  async get_agent(input, context) {
    const agentId = String(input.agent_id);
    const payload = await deckCoGetJson(`/agents/${encodeURIComponent(agentId)}`, {}, context, "execute");
    return { agent: readObject(payload, "Deck.co agent response") };
  },
  async list_sources(input, context) {
    const payload = await deckCoGetJson("/sources", buildPaginationQuery(input), context, "execute");
    const record = readObject(payload, "Deck.co sources response");
    return {
      sources: Array.isArray(record.data) ? record.data : [],
      hasMore: record.has_more === true,
      nextCursor: optionalString(record.next_cursor) ?? null,
      requestId: optionalString(record.request_id) ?? null,
    };
  },
  async get_source(input, context) {
    const sourceId = String(input.source_id);
    const payload = await deckCoGetJson(`/sources/${encodeURIComponent(sourceId)}`, {}, context, "execute");
    return { source: readObject(payload, "Deck.co source response") };
  },
  async create_source(input, context) {
    const payload = await deckCoPostJson(
      "/sources",
      compactObject({
        type: "website",
        website: {
          url: String(input.website_url),
        },
        name: optionalString(input.name),
      }),
      context,
      optionalString(input.idempotencyKey),
    );
    return { source: readObject(payload, "Deck.co source response") };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, deckCoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await deckCoGetJson("/test", {}, { apiKey: input.apiKey, fetcher, signal }, "validate");
    const record = readObject(payload, "Deck.co test response");

    return {
      profile: {
        accountId: "api_key",
        displayName: "Deck.co API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: deckCoApiBaseUrl,
        validationEndpoint: "/test",
        environment: optionalString(record.environment),
        requestId: optionalString(record.request_id),
      }),
    };
  },
};

async function deckCoGetJson(
  path: string,
  query: Record<string, unknown>,
  context: DeckCoContext,
  phase: DeckCoRequestPhase,
): Promise<unknown> {
  const url = deckCoUrl(path);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return deckCoRequestJson("GET", url, undefined, context, phase);
}

async function deckCoPostJson(
  path: string,
  body: Record<string, unknown>,
  context: DeckCoContext,
  idempotencyKey?: string,
): Promise<unknown> {
  return deckCoRequestJson("POST", deckCoUrl(path), body, context, "execute", idempotencyKey);
}

async function deckCoRequestJson(
  method: "GET" | "POST",
  url: URL,
  body: Record<string, unknown> | undefined,
  context: DeckCoContext,
  phase: DeckCoRequestPhase,
  idempotencyKey?: string,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method,
      headers: deckCoHeaders(context.apiKey, body !== undefined, idempotencyKey),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readDeckCoPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Deck.co request failed: ${error.message}` : "Deck.co request failed",
    );
  }

  if (!response.ok) {
    throw createDeckCoError(response, payload, phase);
  }

  return payload;
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    limit: input.limit,
    cursor: input.cursor,
  });
}

function deckCoUrl(path: string): URL {
  return new URL(path.startsWith("/") ? path.slice(1) : path, `${deckCoApiBaseUrl}/`);
}

function deckCoHeaders(apiKey: string, hasBody: boolean, idempotencyKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }
  return headers;
}

async function readDeckCoPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "invalid Deck.co response");
  }
}

function createDeckCoError(response: Response, payload: unknown, phase: DeckCoRequestPhase): ProviderRequestError {
  const message =
    extractDeckCoErrorMessage(payload) ?? response.statusText ?? `Deck.co request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 422) {
    return new ProviderRequestError(response.status, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? response.status : 502, message, payload);
}

function extractDeckCoErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  if (typeof record.message === "string") {
    return record.message;
  }
  if (Array.isArray(record.errors)) {
    const firstError = optionalRecord(record.errors[0]);
    return optionalString(firstError?.message);
  }
  return undefined;
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  return record;
}
