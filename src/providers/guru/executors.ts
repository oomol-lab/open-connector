import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { GuruActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "guru";
const guruApiBaseUrl = "https://api.getguru.com";
const guruFetch = createProviderFetch({ skipDnsValidation: true });
const guruValidationPath = "/api/v1/whoami";

type GuruRequestPhase = "validate" | "execute";

interface GuruActionContext {
  apiKey: string;
  username: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface GuruResponse {
  payload: unknown;
  links?: Record<string, string>;
}

type GuruActionHandler = (input: Record<string, unknown>, context: GuruActionContext) => Promise<unknown>;

export const guruActionHandlers: Record<GuruActionName, GuruActionHandler> = {
  async get_current_identity(_input, context) {
    const response = await guruGetJson(guruValidationPath, context, "execute");
    return {
      identity: normalizeObject(response.payload, "Guru identity response must be an object"),
    };
  },
  async search_cards(input, context) {
    const response = await guruGetJson(buildSearchCardsPath(input), context, "execute");
    return jsonObject({
      cards: normalizeArray(response.payload),
      links: response.links,
    });
  },
  async get_card(input, context) {
    const cardId = readRequiredString(input.cardId, "cardId");
    const response = await guruGetJson(`/api/v1/cards/${encodeURIComponent(cardId)}/extended`, context, "execute");
    return {
      card: normalizeObject(response.payload, "Guru card response must be an object"),
    };
  },
  async list_collections(input, context) {
    const response = await guruGetJson(buildListCollectionsPath(input), context, "execute");
    return {
      collections: normalizeArray(response.payload),
    };
  },
  async get_team_stats(input, context) {
    const teamId = readRequiredString(input.teamId, "teamId");
    const response = await guruGetJson(`/api/v1/teams/${encodeURIComponent(teamId)}/stats`, context, "execute");
    return {
      teamStats: normalizeObject(response.payload, "Guru team stats response must be an object"),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<GuruActionContext>({
  service,
  handlers: guruActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<GuruActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      username: readGuruUsername(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(guruApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${readGuruUsername(credential.values)}:${credential.apiKey}`).toString("base64")}`,
    );
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await guruFetch(url, init);
    if (!response.ok) {
      const payload = await readGuruPayload(response);
      throw createGuruError(response, payload, "execute");
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Guru request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGuruCredential(
      {
        apiKey: input.apiKey,
        username: readGuruUsername(input.values),
      },
      fetcher,
      signal,
    );
  },
};

async function validateGuruCredential(
  input: { apiKey: string; username: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const response = await guruGetJson(
    guruValidationPath,
    {
      apiKey: input.apiKey,
      username: input.username,
      fetcher,
      signal,
    },
    "validate",
  );
  const identity = normalizeObject(response.payload, "Guru identity response must be an object");
  const team = optionalRecord(identity.team);
  const user = optionalRecord(identity.user);
  const collection = optionalRecord(identity.collection);
  const teamId = optionalString(team?.id);
  const teamName = optionalString(team?.name);
  const userId = optionalString(user?.id);
  const userEmail = optionalString(user?.email);
  const collectionId = optionalString(collection?.id);
  const collectionName = optionalString(collection?.name);
  const tokenType = optionalString(identity.tokenType);

  return {
    profile: {
      accountId: teamId ?? collectionId ?? userId ?? "guru-api-token",
      displayName: teamName ?? collectionName ?? userEmail ?? "Guru API Token",
    },
    grantedScopes: [],
    metadata: jsonObject({
      apiBaseUrl: guruApiBaseUrl,
      validationEndpoint: guruValidationPath,
      teamId,
      teamName,
      userId,
      userEmail,
      collectionId,
      collectionName,
      tokenType,
      username: input.username,
    }),
  };
}

function buildSearchCardsPath(input: Record<string, unknown>): string {
  const url = guruUrl("/api/v1/search/query");
  appendOptionalQuery(url, "q", input.q);
  appendOptionalQuery(url, "searchTerms", input.searchTerms);
  appendOptionalQuery(url, "queryType", input.queryType);
  appendOptionalQuery(url, "showArchived", input.showArchived);
  appendOptionalQuery(url, "maxResults", input.maxResults);
  appendOptionalQuery(url, "sortField", input.sortField);
  appendOptionalQuery(url, "sortOrder", input.sortOrder);
  appendOptionalQuery(url, "includeCardAttributes", input.includeCardAttributes);
  appendOptionalQuery(url, "token", input.token);
  return guruPath(url);
}

function buildListCollectionsPath(input: Record<string, unknown>): string {
  const url = guruUrl("/api/v1/collections");
  appendOptionalQuery(url, "search", input.search);
  appendOptionalQuery(url, "sortField", input.sortField);
  appendOptionalQuery(url, "sortDir", input.sortDir);
  appendOptionalQuery(url, "filter", input.filter);
  return guruPath(url);
}

function appendOptionalQuery(url: URL, key: string, value: unknown): void {
  if (value !== undefined) {
    url.searchParams.set(key, String(value));
  }
}

async function guruGetJson(path: string, context: GuruActionContext, phase: GuruRequestPhase): Promise<GuruResponse> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(guruUrl(path), {
      method: "GET",
      headers: guruHeaders(context),
      signal: context.signal,
    });
    payload = await readGuruPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Guru request failed: ${error.message}` : "Guru request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createGuruError(response, payload, phase);
  }

  const result: GuruResponse = {
    payload,
  };
  const links = parseGuruLinks(response.headers);
  if (links) result.links = links;
  return result;
}

function guruHeaders(context: GuruActionContext): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${context.username}:${context.apiKey}`).toString("base64")}`,
    "user-agent": providerUserAgent,
  };
}

async function readGuruPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function parseGuruLinks(headers: Headers): Record<string, string> | undefined {
  const linkHeader = headers.get("link");
  if (!linkHeader) {
    return undefined;
  }

  const links: Record<string, string> = {};
  for (const part of linkHeader.split(",")) {
    const trimmed = part.trim();
    const start = trimmed.indexOf("<");
    const end = trimmed.indexOf(">");
    if (start !== 0 || end <= start) {
      continue;
    }

    const url = trimmed.slice(start + 1, end);
    if (trimmed.includes('rel="next"')) {
      links.next = url;
      const token = readTokenFromUrl(url);
      if (token) links.nextToken = token;
    } else if (trimmed.includes('rel="prev"') || trimmed.includes('rel="previous"')) {
      links.previous = url;
      const token = readTokenFromUrl(url);
      if (token) links.previousToken = token;
    }
  }

  return Object.keys(links).length > 0 ? links : undefined;
}

function readTokenFromUrl(value: string): string | undefined {
  try {
    return new URL(value).searchParams.get("token") ?? undefined;
  } catch {
    return undefined;
  }
}

function createGuruError(response: Response, payload: unknown, phase: GuruRequestPhase): ProviderRequestError {
  const message = readGuruErrorMessage(payload) ?? `Guru request failed with HTTP ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function readGuruErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error);
}

function normalizeArray(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Guru list response must be an array", payload);
  }

  return payload.map((item) => normalizeObject(item, "Guru list item must be an object"));
}

function normalizeObject(payload: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, message, payload);
  }
  return record;
}

function readRequiredString(value: unknown, label: string): string {
  return requiredString(value, `Guru ${label}`, (message) => new ProviderRequestError(400, message));
}

function readGuruUsername(values: Record<string, unknown> | undefined): string {
  const username = optionalString(values?.username);
  if (!username) {
    throw new ProviderRequestError(400, "Guru username is required");
  }
  return username;
}

function guruUrl(path: string): URL {
  return new URL(path, guruApiBaseUrl);
}

function guruPath(url: URL): string {
  return `${url.pathname}${url.search}`;
}
