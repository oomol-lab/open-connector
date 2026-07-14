import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { RocketChatActionName } from "./actions.ts";

import { isIP } from "node:net";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "rocket_chat";
const requestTimeoutMs = 30_000;
const validationPath = "/me";

const privateAwareFetch = createProviderFetch({ allowPrivateNetwork: isPrivateNetworkAccessAllowed });

interface RocketChatCredential {
  baseUrl: string;
  apiBaseUrl: string;
  userId: string;
  authToken: string;
}

interface RocketChatContext {
  credential: RocketChatCredential;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type RocketChatActionHandler = (input: Record<string, unknown>, context: RocketChatContext) => Promise<unknown>;

export const rocketChatActionHandlers: Record<RocketChatActionName, RocketChatActionHandler> = {
  async get_me(_input, context) {
    const profile = await requestRocketChatObject({
      credential: context.credential,
      fetcher: context.fetcher,
      signal: context.signal,
      path: validationPath,
      phase: "execute",
    });
    return { profile };
  },
  list_rooms(input, context) {
    return requestRocketChatObject({
      credential: context.credential,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/rooms.get",
      phase: "execute",
      query: { updatedSince: input.updatedSince },
    });
  },
  get_room(input, context) {
    return requestRocketChatObject({
      credential: context.credential,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/rooms.info",
      phase: "execute",
      query: {
        roomId: input.roomId,
        roomName: input.roomName,
        fields: stringifyJsonQueryValue(input.fields),
      },
    });
  },
  list_channel_messages(input, context) {
    return requestRocketChatObject({
      credential: context.credential,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/channels.messages",
      phase: "execute",
      query: {
        roomId: input.roomId,
        count: input.count,
        offset: input.offset,
        sort: stringifyJsonQueryValue(input.sort),
        mentionIds: stringifyJsonQueryValue(input.mentionIds),
        starredIds: stringifyJsonQueryValue(input.starredIds),
        pinned: input.pinned,
      },
    });
  },
  get_message(input, context) {
    return requestRocketChatObject({
      credential: context.credential,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/chat.getMessage",
      phase: "execute",
      query: { msgId: input.msgId },
    });
  },
  post_message(input, context) {
    return requestRocketChatObject({
      credential: context.credential,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/chat.postMessage",
      phase: "execute",
      method: "POST",
      body: compactObject({
        roomId: input.roomId,
        text: input.text,
        parseUrls: input.parseUrls,
        alias: input.alias,
        avatar: input.avatar,
        emoji: input.emoji,
        attachments: input.attachments,
        tmid: input.tmid,
        customFields: input.customFields,
      }),
    });
  },
  update_message(input, context) {
    return requestRocketChatObject({
      credential: context.credential,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/chat.update",
      phase: "execute",
      method: "POST",
      body: compactObject({
        roomId: input.roomId,
        msgId: input.msgId,
        text: input.text,
        previewUrls: input.previewUrls,
        customFields: input.customFields,
      }),
    });
  },
  delete_message(input, context) {
    return requestRocketChatObject({
      credential: context.credential,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/chat.delete",
      phase: "execute",
      method: "POST",
      body: compactObject({
        roomId: input.roomId,
        msgId: input.msgId,
        asUser: input.asUser,
      }),
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<RocketChatContext>({
  service,
  handlers: rocketChatActionHandlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<RocketChatContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure rocket_chat custom credentials first.");
    }
    return {
      credential: readRocketChatCredential(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const credential = readRocketChatCredential(input.values);
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    const payload = await requestRocketChatObject({
      credential,
      fetcher: guardedFetcher,
      signal,
      path: validationPath,
      phase: "validate",
    });
    const profileId = optionalString(payload._id) ?? credential.userId;
    const username = optionalString(payload.username);
    const name = optionalString(payload.name);
    return {
      profile: {
        accountId: profileId,
        displayName: name ?? username ?? `Rocket.Chat User ${profileId}`,
      },
      grantedScopes: [],
      metadata: compactObject({
        baseUrl: credential.baseUrl,
        apiBaseUrl: credential.apiBaseUrl,
        validationEndpoint: validationPath,
        userId: credential.userId,
        profileId,
        username,
        name,
        avatarUrl: optionalString(payload.avatarUrl),
      }),
    };
  },
};

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure rocket_chat custom credentials first.");
    }
    const rocketChatCredential = readRocketChatCredential(credential.values);
    const url = createProviderProxyUrl(rocketChatCredential.apiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);
    headers.set("X-Auth-Token", rocketChatCredential.authToken);
    headers.set("X-User-Id", rocketChatCredential.userId);

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

    const response = await privateAwareFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

async function requestRocketChatObject(options: {
  credential: RocketChatCredential;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  path: string;
  phase: "validate" | "execute";
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const response = await requestRocketChat(options);
  const payload = optionalRecord(response.payload);
  if (!payload) {
    throw new ProviderRequestError(502, "invalid rocket_chat response", response.rawText);
  }
  return payload;
}

async function requestRocketChat(options: {
  credential: RocketChatCredential;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  path: string;
  phase: "validate" | "execute";
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): Promise<{ status: number; payload: unknown; rawText: string }> {
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(requestTimeoutMs)])
    : AbortSignal.timeout(requestTimeoutMs);
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "X-Auth-Token": options.credential.authToken,
    "X-User-Id": options.credential.userId,
  });
  let body: string | undefined;
  if (options.body) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.body);
  }

  let response: Response;
  let rawText: string;
  let payload: unknown;
  try {
    response = await options.fetcher(buildRocketChatUrl(options.credential.apiBaseUrl, options.path, options.query), {
      method: options.method ?? "GET",
      headers,
      body,
      signal,
    });
    rawText = await response.text();
    payload = parseJsonResponse(rawText);
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      throw new ProviderRequestError(504, "rocket_chat request timed out", error);
    }
    throw new ProviderRequestError(502, "rocket_chat request failed", error);
  }

  if (!response.ok) {
    throw createRocketChatError(response.status, payload, rawText, options.phase);
  }
  return { status: response.status, payload, rawText };
}

function buildRocketChatUrl(apiBaseUrl: string, path: string, query: Record<string, unknown> | undefined): string {
  const url = new URL(stripLeadingSlashes(path), `${apiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function parseJsonResponse(rawText: string): unknown {
  if (!rawText) {
    return null;
  }
  try {
    return JSON.parse(rawText) as unknown;
  } catch (error) {
    throw new ProviderRequestError(502, "invalid rocket_chat JSON response", error);
  }
}

function createRocketChatError(
  status: number,
  payload: unknown,
  rawText: string,
  phase: "validate" | "execute",
): ProviderRequestError {
  const payloadObject = optionalRecord(payload);
  const upstreamMessage =
    optionalString(payloadObject?.error) ?? optionalString(payloadObject?.message) ?? rawText.trim();
  const message = upstreamMessage || `rocket_chat request failed with status ${status}`;
  if (status === 401 || (phase === "validate" && status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readRocketChatCredential(
  input: Record<string, string>,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): RocketChatCredential {
  const baseUrl = normalizeRocketChatBaseUrl(readCredentialString(input, "baseUrl"), allowPrivateNetwork);
  const userId = readCredentialString(input, "userId");
  const authToken = readCredentialString(input, "authToken");
  return {
    baseUrl,
    apiBaseUrl: buildRocketChatApiBaseUrl(baseUrl),
    userId,
    authToken,
  };
}

function readCredentialString(input: Record<string, string>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return value.trim();
}

function normalizeRocketChatBaseUrl(
  input: string,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const url = assertPublicHttpUrl(input, {
    fieldName: "baseUrl",
    allowPrivateNetwork,
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use https");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "baseUrl must not include credentials");
  }
  if (!allowPrivateNetwork) {
    validateRocketChatHostname(url.hostname);
  }
  url.hash = "";
  url.search = "";
  url.pathname = trimTrailingSlashes(url.pathname);
  if (url.pathname.endsWith("/api/v1")) {
    url.pathname = trimTrailingSlashes(url.pathname.slice(0, -7));
  }
  if (url.pathname === "/") {
    url.pathname = "";
  }
  return url.toString().endsWith("/") ? url.toString().slice(0, -1) : url.toString();
}

function validateRocketChatHostname(hostname: string): void {
  const normalizedHostname = hostname.toLowerCase();
  const ipVersion = isIP(normalizedHostname);
  if (
    (ipVersion === 4 && isRestrictedIpv4Host(normalizedHostname)) ||
    (ipVersion === 6 && isRestrictedIpv6Host(normalizedHostname))
  ) {
    throw new ProviderRequestError(400, "baseUrl must not use a private IP address");
  }
}

function isRestrictedIpv4Host(hostname: string): boolean {
  const octets = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return false;
  }
  const [first = 0, second = 0] = octets;
  return (
    first === 10 ||
    first === 127 ||
    first === 0 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isRestrictedIpv6Host(hostname: string): boolean {
  return (
    hostname === "::1" ||
    hostname === "::" ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80:")
  );
}

function buildRocketChatApiBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${trimTrailingSlashes(url.pathname)}/api/v1`;
  return url.toString().endsWith("/") ? url.toString().slice(0, -1) : url.toString();
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

function stripLeadingSlashes(value: string): string {
  let start = 0;
  while (start < value.length && value[start] === "/") {
    start += 1;
  }
  return value.slice(start);
}

function stringifyJsonQueryValue(value: unknown): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value);
}
