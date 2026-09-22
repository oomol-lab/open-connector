import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { compactObject, looseArray, optionalInteger, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "speak_ai";
const apiBaseUrl = "https://api.speakai.co/v1";
type Phase = "validate" | "execute";
interface Token {
  accessToken: string;
  email?: string;
  expiresAt: number;
}
const tokenCache = new Map<string, Promise<Token>>();
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
const handlers: ProviderActionHandlers<"speak_ai", Handler> = {
  async upload_media(input, context) {
    const data = await request(
      "/media/upload",
      {
        method: "POST",
        body: compactObject({
          name: requiredInputString(input.name, "name"),
          url: requiredInputString(input.mediaUrl, "mediaUrl"),
          mediaType: optionalString(input.mediaType),
          description: optionalString(input.description),
          sourceLanguage: optionalString(input.sourceLanguage),
          tags: optionalString(input.tags),
          folderId: optionalString(input.folderId),
        }),
      },
      context,
      "execute",
    );
    return { mediaId: requiredInputString(data.mediaId, "Speak AI upload mediaId") };
  },
  async list_media(input, context) {
    const data = await request(
      buildUrl("/media", input, {
        mediaType: "mediaType",
        page: "page",
        pageSize: "pageSize",
        sortBy: "sortBy",
        filterMedia: "filterMedia",
        filterName: "filterName",
        folderId: "folderId",
      }),
      { method: "GET" },
      context,
      "execute",
    );
    return {
      totalCount: requireInteger(data.totalCount, "totalCount"),
      pages: requireInteger(data.pages, "pages"),
      media: looseArray(data.mediaList),
    };
  },
  async get_media_status(input, context) {
    const data = await media(input, context, "status");
    return {
      mediaId: requiredInputString(data.mediaId, "mediaId"),
      state: requiredInputString(data.state, "state"),
      media: data,
    };
  },
  async get_transcript(input, context) {
    const data = await media(input, context, "transcript");
    return { mediaId: requiredInputString(data.mediaId, "mediaId"), transcript: data };
  },
  async get_media_insights(input, context) {
    const data = await media(input, context, "insight");
    return { mediaId: requiredInputString(data.mediaId, "mediaId"), insights: data };
  },
  async list_folders(input, context) {
    const data = await request(
      buildUrl("/folder", input, { page: "page", pageSize: "pageSize", sortBy: "sortBy" }),
      { method: "GET" },
      context,
      "execute",
    );
    return {
      totalCount: requireInteger(data.totalCount, "totalCount"),
      pages: data.pages == null ? null : requireInteger(data.pages, "pages"),
      folders: looseArray(data.folders),
    };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const token = await authenticate(input.apiKey, fetcher, "validate");
    return {
      profile: { accountId: token.email ?? "speak-ai-api-key", displayName: token.email ?? "Speak AI API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl, validationEndpoint: "/auth/accessToken" },
    };
  },
};

async function media(input: Record<string, unknown>, context: ApiKeyProviderContext, family: string) {
  return request(
    `/media/${family}/${encodeURIComponent(requiredInputString(input.mediaId, "mediaId"))}`,
    { method: "GET" },
    context,
    "execute",
  );
}
async function request(
  path: string | URL,
  init: { method: string; body?: Record<string, unknown> },
  context: ApiKeyProviderContext,
  phase: Phase,
): Promise<Record<string, unknown>> {
  let token = await authenticate(context.apiKey, context.fetcher, phase);
  let response = await fetchToken(path, init, context, token.accessToken);
  let payload = await readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: "Speak AI returned invalid JSON",
  });
  if (phase === "execute" && response.status === 401) {
    tokenCache.delete(sha256Hex(context.apiKey));
    token = await authenticate(context.apiKey, context.fetcher, phase);
    response = await fetchToken(path, init, context, token.accessToken);
    payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Speak AI returned invalid JSON",
    });
  }
  if (!response.ok) throw error(response.status, payload, phase);
  return requiredResponseRecord(requiredResponseRecord(payload, "Speak AI response").data, "Speak AI response data");
}
function fetchToken(
  path: string | URL,
  init: { method: string; body?: Record<string, unknown> },
  context: ApiKeyProviderContext,
  accessToken: string,
) {
  return runProviderRequest({ signal: context.signal, label: "Speak AI" }, (signal) =>
    context.fetcher(path instanceof URL ? path : `${apiBaseUrl}${path}`, {
      method: init.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-speakai-key": context.apiKey,
        "x-access-token": accessToken,
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal,
    }),
  );
}
async function authenticate(apiKey: string, fetcher: typeof fetch, phase: Phase): Promise<Token> {
  const key = sha256Hex(apiKey);
  if (phase === "validate") tokenCache.delete(key);
  const cached = tokenCache.get(key);
  if (cached) {
    const value = await cached;
    if (Date.now() < value.expiresAt) return value;
    tokenCache.delete(key);
  }
  const pending = runProviderRequest({ label: "Speak AI authentication" }, async (signal) => {
    const response = await fetcher(`${apiBaseUrl}/auth/accessToken`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": providerUserAgent, "x-speakai-key": apiKey },
      body: "{}",
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Speak AI returned invalid JSON",
    });
    if (!response.ok) throw error(response.status, payload, phase);
    const data = requiredResponseRecord(
      requiredResponseRecord(payload, "Speak AI authentication response").data,
      "Speak AI authentication data",
    );
    return {
      accessToken: requiredInputString(data.accessToken, "accessToken"),
      email: optionalString(data.email),
      expiresAt: Date.now() + 3_000_000,
    };
  });
  tokenCache.set(key, pending);
  try {
    return await pending;
  } catch (cause) {
    tokenCache.delete(key);
    throw cause;
  }
}
function error(status: number, payload: unknown, phase: Phase): ProviderRequestError {
  const body = requiredResponseRecord(payload, "Speak AI error response");
  const message = optionalString(body.message) ?? "Speak AI request failed";
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && optionalInteger(body.code) === 401) return providerInputError(message);
  if (status === 400 || status === 422) return providerInputError(message);
  return new ProviderRequestError(status || 502, message, payload);
}
function requireInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value))
    throw new ProviderRequestError(502, `Speak AI ${label} must be an integer`);
  return value;
}
function buildUrl(path: string, input: Record<string, unknown>, mapping: Record<string, string>): URL {
  const url = new URL(`${apiBaseUrl}${path}`);
  for (const [key, query] of Object.entries(mapping))
    if (input[key] != null) url.searchParams.set(query, String(input[key]));
  return url;
}
