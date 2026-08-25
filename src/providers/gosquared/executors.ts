import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "gosquared";
const gosquaredApiBaseUrl = "https://api.gosquared.com";
const gosquaredDefaultRequestTimeoutMs = 30_000;
const gosquaredTokenInfoPath = "/auth/v1/tokeninfo";

interface GosquaredActionContext {
  apiKey: string;
  siteToken?: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface GosquaredRequestOptions {
  path: string;
  apiKey: string;
  siteToken?: string;
  query?: Record<string, string | undefined>;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  phase: "validate" | "execute";
}

type GosquaredActionHandler = (input: Record<string, unknown>, context: GosquaredActionContext) => Promise<unknown>;

export const gosquaredActionHandlers: ProviderActionHandlers<"gosquared", GosquaredActionHandler> = {
  async get_token_info(_input, context) {
    const payload = await requestGosquaredJson({
      path: gosquaredTokenInfoPath,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      scopes: normalizeScopes(payload.scopes),
      raw: payload,
    };
  },
  get_now_overview(input, context) {
    return requestGosquaredReport("/now/v3/overview", input, context, {
      from: optionalString(input.from),
      to: optionalString(input.to),
      dateFormat: optionalString(input.dateFormat),
    });
  },
  get_now_time_series(input, context) {
    return requestGosquaredReport("/now/v3/timeSeries", input, context, {
      from: optionalString(input.from),
      to: optionalString(input.to),
      interval: optionalString(input.interval),
      dateFormat: optionalString(input.dateFormat),
    });
  },
  get_trends_aggregate(input, context) {
    return requestGosquaredReport("/trends/v2/aggregate", input, context, {
      from: optionalString(input.from),
      to: optionalString(input.to),
      dateFormat: optionalString(input.dateFormat),
      format: "json",
      limit: optionalString(input.limit),
      interval: optionalString(input.interval),
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: gosquaredActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<GosquaredActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      siteToken: readOptionalSiteToken(credential.values) ?? readOptionalSiteToken(credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: gosquaredApiBaseUrl,
  auth: {
    type: "api_key_query",
    name: "api_key",
  },
  customizeRequest({ url, headers, credential }) {
    headers.set("accept", headers.get("accept") ?? "application/json");
    url.searchParams.set("site_token", readSiteTokenFromCredential(credential));
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateGosquaredCredential(
      {
        apiKey: input.apiKey,
        ...input.values,
      },
      fetcher,
      signal,
    );
  },
};

async function validateGosquaredCredential(
  input: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const siteToken = readRequiredSiteToken(input.siteToken);
  const payload = await requestGosquaredJson({
    path: gosquaredTokenInfoPath,
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  const grantedScopes = normalizeScopes(payload.scopes);

  return {
    profile: {
      accountId: `gosquared:${siteToken}`,
      displayName: `GoSquared ${siteToken}`,
      grantedScopes,
    },
    grantedScopes,
    metadata: {
      apiBaseUrl: gosquaredApiBaseUrl,
      siteToken,
      validationEndpoint: gosquaredTokenInfoPath,
    },
  };
}

async function requestGosquaredReport(
  path: string,
  input: Record<string, unknown>,
  context: GosquaredActionContext,
  query: Record<string, string | undefined>,
): Promise<unknown> {
  const payload = await requestGosquaredJson({
    path,
    apiKey: context.apiKey,
    siteToken: readRequiredSiteToken(optionalString(input.siteToken) ?? context.siteToken),
    query: compactObject(query),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    raw: payload,
  };
}

async function requestGosquaredJson(options: GosquaredRequestOptions): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(options.signal, gosquaredDefaultRequestTimeoutMs);

  try {
    const response = await options.fetcher(buildGosquaredUrl(options), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readGosquaredPayload(response);

    if (!response.ok) {
      throw createGosquaredError(response.status, payload, options.phase);
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "GoSquared returned an invalid payload", payload);
    }

    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "GoSquared request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `GoSquared request failed: ${error.message}` : "GoSquared request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildGosquaredUrl(options: Pick<GosquaredRequestOptions, "path" | "apiKey" | "siteToken" | "query">): URL {
  const normalizedPath = options.path.startsWith("/") ? options.path.slice(1) : options.path;
  const url = new URL(normalizedPath, `${gosquaredApiBaseUrl}/`);
  url.searchParams.set("api_key", options.apiKey);
  if (options.siteToken) {
    url.searchParams.set("site_token", options.siteToken);
  }
  setSearchParams(url, options.query ?? {});
  return url;
}

async function readGosquaredPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "GoSquared returned invalid JSON");
  }
}

function createGosquaredError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const code = readGosquaredErrorCode(payload);
  const message = readGosquaredErrorMessage(payload) ?? `GoSquared request failed with status ${status}`;

  if (status === 429 || code === 4002) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (code === 4000 || code === 4001 || code === 4003 || code === 4004) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 400 || status === 422) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function readGosquaredErrorCode(payload: unknown): number | undefined {
  const record = optionalRecord(payload);
  return typeof record?.code === "number" ? record.code : undefined;
}

function readGosquaredErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function normalizeScopes(value: unknown): string[] {
  return Array.isArray(value) ? value.map((scope) => String(scope)) : [];
}

function readOptionalSiteToken(input: Record<string, unknown> | undefined): string | undefined {
  return optionalString(input?.siteToken);
}

function readSiteTokenFromCredential(credential: ResolvedCredential | undefined): string {
  if (!credential || credential.authType !== "api_key") {
    throw new ProviderRequestError(401, "Configure gosquared credentials first.");
  }
  return readRequiredSiteToken(readOptionalSiteToken(credential.values) ?? readOptionalSiteToken(credential.metadata));
}

function readRequiredSiteToken(value: unknown): string {
  const siteToken = optionalString(value);
  if (!siteToken) {
    throw new ProviderRequestError(400, "siteToken is required");
  }
  return siteToken;
}
