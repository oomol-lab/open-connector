import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { isIP } from "node:net";
import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "api_void";
const apiVoidApiBaseUrl = "https://api.apivoid.com";
const apiVoidRequestTimeoutMs = 30_000;

type ApiVoidRequestPhase = "validate" | "execute";

interface ApiVoidActionOutput {
  data: Record<string, unknown>;
  quota: ApiVoidQuota | null;
}

interface ApiVoidQuota {
  raw: string;
  callUsage?: number;
  available?: number;
  reset?: number;
  overageAllowed?: boolean;
  overageEnabled?: boolean;
  overageValue?: number;
  overageLimit?: number;
}

interface ApiVoidRequestInput {
  path: string;
  body?: Record<string, unknown>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: ApiVoidRequestPhase;
}

type ApiVoidActionHandler = (
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) => Promise<ApiVoidActionOutput>;

export const apiVoidActionHandlers: ProviderActionHandlers<"api_void", ApiVoidActionHandler> = {
  get_account_info(_input, context) {
    return requestApiVoidForAction(context, "/v2/account-info");
  },
  check_ip_reputation(input, context) {
    const ip = requiredString(input.ip, "ip", providerInputError);
    if (isIP(ip) === 0) {
      throw new ProviderRequestError(400, "ip must be a valid IPv4 or IPv6 address.");
    }

    return requestApiVoidForAction(context, "/v2/ip-reputation", {
      ip,
      exclude_engines: optionalString(input.excludeEngines),
      spamhaus_key: optionalString(input.spamhausKey),
      disable_reverse_dns: optionalBoolean(input.disableReverseDns),
    });
  },
  check_domain_reputation(input, context) {
    return requestApiVoidForAction(context, "/v2/domain-reputation", {
      host: requiredString(input.host, "host", providerInputError),
      exclude_engines: optionalString(input.excludeEngines),
      spamhaus_key: optionalString(input.spamhausKey),
      include_domain_age: optionalBoolean(input.includeDomainAge),
      domain_age_cache_only: optionalBoolean(input.domainAgeCacheOnly),
    });
  },
  check_url_reputation(input, context) {
    return requestApiVoidForAction(context, "/v2/url-reputation", {
      url: normalizePublicUrl(input.url, "url"),
    });
  },
  verify_email(input, context) {
    const email = optionalString(input.email);
    const domain = optionalString(input.domain);
    if ((email != null) === (domain != null)) {
      throw new ProviderRequestError(400, "Provide exactly one of email or domain.");
    }

    return requestApiVoidForAction(context, "/v2/email-verify", {
      email,
      domain,
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, apiVoidActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiVoidApiBaseUrl,
  auth: {
    type: "api_key_header",
    name: "X-API-Key",
  },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const output = await requestApiVoid({
      path: "/v2/account-info",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });

    return {
      profile: {
        accountId: "api_key",
        displayName: "APIVoid API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: apiVoidApiBaseUrl,
        validationEndpoint: "/v2/account-info",
        remainingCredits: readNestedNumber(output.data, "credits", "remained"),
        nextResetTs: readNestedNumber(output.data, "credits", "next_reset_ts"),
      }),
    };
  },
};

function requestApiVoidForAction(
  context: ApiKeyProviderContext,
  path: string,
  body?: Record<string, unknown>,
): Promise<ApiVoidActionOutput> {
  return requestApiVoid({
    path,
    body,
    context,
    phase: "execute",
  });
}

async function requestApiVoid(input: ApiVoidRequestInput): Promise<ApiVoidActionOutput> {
  const timeout = createProviderTimeout(input.context.signal, apiVoidRequestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(new URL(input.path, apiVoidApiBaseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "X-API-Key": input.context.apiKey,
      },
      body: JSON.stringify(compactObject(input.body ?? {})),
      signal: timeout.signal,
    });
    payload = await readApiVoidPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "APIVoid request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `APIVoid request failed: ${error.message}` : "APIVoid request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw mapApiVoidError(response.status, payload, input.phase);
  }

  const data = optionalRecord(payload);
  if (!data) {
    throw new ProviderRequestError(502, "APIVoid returned an invalid JSON object", payload);
  }

  return {
    data,
    quota: parseApiVoidQuota(response.headers.get("x-service-quota")),
  };
}

async function readApiVoidPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "APIVoid returned invalid JSON");
  }
}

function mapApiVoidError(status: number, payload: unknown, phase: ApiVoidRequestPhase): ProviderRequestError {
  const fallback = phase === "validate" ? "APIVoid credential validation failed" : "APIVoid request failed";
  const message = extractApiVoidErrorMessage(payload) ?? fallback;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function extractApiVoidErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }
  return optionalString(optionalRecord(payload)?.error);
}

function parseApiVoidQuota(raw: string | null): ApiVoidQuota | null {
  if (!raw) {
    return null;
  }

  const quota: ApiVoidQuota = { raw };
  for (const part of raw.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key === "call-usage") quota.callUsage = parseInteger(value);
    if (key === "available") quota.available = parseInteger(value);
    if (key === "reset") quota.reset = parseInteger(value);
    if (key === "overage-allowed") quota.overageAllowed = parseBoolean(value);
    if (key === "overage-enabled") quota.overageEnabled = parseBoolean(value);
    if (key === "overage-value") quota.overageValue = parseInteger(value);
    if (key === "overage-limit") quota.overageLimit = parseInteger(value);
  }

  return quota;
}

function parseInteger(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseBoolean(value: string): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function readNestedNumber(input: Record<string, unknown>, objectKey: string, childKey: string): number | undefined {
  const object = optionalRecord(input[objectKey]);
  const value = object?.[childKey];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function normalizePublicUrl(value: unknown, fieldName: string): string {
  return assertPublicHttpUrl(requiredString(value, fieldName, providerInputError), {
    fieldName,
    createError: providerInputError,
  }).toString();
}
