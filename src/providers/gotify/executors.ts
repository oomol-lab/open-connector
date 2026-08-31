import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import {
  compactObject,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "gotify";
const gotifyRequestTimeoutMs = 30_000;

interface GotifyContext {
  applicationToken: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type GotifyRequestPhase = "validate" | "execute";

interface GotifyJsonRequestOptions {
  context: GotifyContext;
  path: string;
  method: "GET" | "POST";
  apiKey?: string;
  body?: Record<string, unknown>;
  phase: GotifyRequestPhase;
}

export const gotifyActionHandlers: ProviderActionHandlers<"gotify", ProviderRuntimeHandler<GotifyContext>> = {
  async send_message(input, context) {
    const payload = await requestGotifyJson({
      context,
      path: "/message",
      method: "POST",
      apiKey: context.applicationToken,
      body: compactObject({
        message: input.message,
        title: input.title,
        priority: input.priority,
        extras: input.extras,
      }),
      phase: "execute",
    });
    return normalizeGotifyMessage(payload);
  },
  async get_health(_input, context) {
    const payload = await requestGotifyJson({
      context,
      path: "/health",
      method: "GET",
      phase: "execute",
    });
    return normalizeGotifyHealth(payload);
  },
  async get_version(_input, context) {
    const payload = await requestGotifyJson({
      context,
      path: "/version",
      method: "GET",
      phase: "execute",
    });
    return normalizeGotifyVersion(payload);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<GotifyContext>({
  service,
  handlers: gotifyActionHandlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<GotifyContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      applicationToken: credential.apiKey,
      baseUrl: normalizeGotifyBaseUrl(
        optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl),
      ),
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "Gotify request failed",
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context): Promise<string> {
    const credential = await requireApiKeyCredential(context, service);
    const baseUrl = optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl);
    if (!baseUrl) {
      throw new ProviderRequestError(500, "gotify connection is missing baseUrl metadata");
    }
    return normalizeGotifyBaseUrl(baseUrl);
  },
  auth: { type: "api_key_header", name: "X-Gotify-Key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const baseUrl = normalizeGotifyBaseUrl(input.values.baseUrl);
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    const payload = await requestGotifyJson({
      context: {
        applicationToken: input.apiKey,
        baseUrl,
        fetcher: guardedFetcher,
        signal,
      },
      path: "/version",
      method: "GET",
      phase: "validate",
    });
    const version = optionalRawString(optionalRecord(payload)?.version);
    const tokenHash = createHash("sha256").update(input.apiKey).digest("hex");
    const host = new URL(baseUrl).host;

    return {
      profile: {
        accountId: `gotify:${host}:${tokenHash.slice(0, 16)}`,
        displayName: `Gotify ${host}`,
      },
      grantedScopes: [],
      metadata: compactObject({
        baseUrl,
        tokenHash,
        validationEndpoint: "/version",
        version,
      }),
    };
  },
};

function normalizeGotifyBaseUrl(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): string {
  const rawValue = requiredString(value, "baseUrl", (message) => new ProviderRequestError(400, message));
  const url = assertPublicHttpUrl(rawValue, {
    fieldName: "baseUrl",
    allowPrivateNetwork,
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "baseUrl must not include username or password");
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/u, "");
}

async function requestGotifyJson(input: GotifyJsonRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, gotifyRequestTimeoutMs);
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      "user-agent": providerUserAgent,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }
    if (input.apiKey) {
      headers["x-gotify-key"] = input.apiKey;
    }

    const response = await input.context.fetcher(new URL(input.path.slice(1), `${input.context.baseUrl}/`), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Gotify returned invalid JSON",
      invalidJsonFallback: (text) => ({ error: text }),
    });
    if (!response.ok) {
      throw mapGotifyHttpError(response.status, readGotifyErrorMessage(payload), input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `Gotify ${input.path} request timed out after ${Math.ceil(gotifyRequestTimeoutMs / 1000)} seconds`,
      );
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Gotify ${input.path} request failed: ${error.message}`
        : `Gotify ${input.path} request failed`,
    );
  } finally {
    timeout.cleanup();
  }
}

function normalizeGotifyMessage(payload: unknown): Record<string, unknown> {
  const record = requiredRecord(payload, "Gotify message response", gotifyResponseError);
  return compactObject({
    id: requireGotifyInteger(record.id, "id"),
    appid: requireGotifyInteger(record.appid, "appid"),
    message: requireGotifyString(record.message, "message"),
    date: requireGotifyString(record.date, "date"),
    title: record.title === undefined ? undefined : requireGotifyString(record.title, "title"),
    priority: record.priority === undefined ? undefined : requireGotifyInteger(record.priority, "priority"),
    extras: record.extras === undefined ? undefined : requiredRecord(record.extras, "extras", gotifyResponseError),
  });
}

function normalizeGotifyHealth(payload: unknown): Record<string, string> {
  const record = requiredRecord(payload, "Gotify health response", gotifyResponseError);
  return {
    health: requireGotifyString(record.health, "health"),
    database: requireGotifyString(record.database, "database"),
  };
}

function normalizeGotifyVersion(payload: unknown): Record<string, string> {
  const record = requiredRecord(payload, "Gotify version response", gotifyResponseError);
  return {
    version: requireGotifyString(record.version, "version"),
    commit: requireGotifyString(record.commit, "commit"),
    buildDate: requireGotifyString(record.buildDate, "buildDate"),
  };
}

function requireGotifyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw gotifyResponseError(`${fieldName} must be a string`);
  }
  return value;
}

function requireGotifyInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw gotifyResponseError(`${fieldName} must be an integer`);
  }
  return parsed;
}

function gotifyResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Gotify returned an invalid response: ${message}`);
}

function readGotifyErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return optionalString(record?.errorDescription) ?? optionalString(record?.error) ?? "Gotify request failed";
}

function mapGotifyHttpError(status: number, message: string, phase: GotifyRequestPhase): ProviderRequestError {
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}
