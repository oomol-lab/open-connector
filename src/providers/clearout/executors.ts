import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "clearout";
const clearoutDefaultBaseUrl = "https://api.clearout.io/v2";
const clearoutDefaultRequestTimeoutMs = 30_000;

interface ClearoutContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ClearoutRequestPhase = "validate" | "execute";
type ClearoutActionHandler = (input: Record<string, unknown>, context: ClearoutContext) => Promise<unknown>;

export const clearoutActionHandlers: ProviderActionHandlers<"clearout", ClearoutActionHandler> = {
  get_available_credits(_input, context) {
    return requestClearoutJson({
      path: "/email_verify/getcredits",
      method: "GET",
      context,
      phase: "execute",
    });
  },
  instant_verify_email(input, context) {
    return requestClearoutJson({
      path: "/email_verify/instant",
      method: "POST",
      context,
      body: buildVerifyBody(input),
      timeoutMs: readOptionalTimeout(input),
      phase: "execute",
    });
  },
  verify_catch_all_email(input, context) {
    return executeEmailAttributeCheck(input, context, "/email/verify/catchall");
  },
  verify_disposable_email(input, context) {
    return executeEmailAttributeCheck(input, context, "/email/verify/disposable");
  },
  verify_free_account_email(input, context) {
    return executeEmailAttributeCheck(input, context, "/email/verify/free");
  },
  verify_role_account_email(input, context) {
    return executeEmailAttributeCheck(input, context, "/email/verify/role");
  },
  verify_gibberish_email(input, context) {
    return executeEmailAttributeCheck(input, context, "/email/verify/gibberish");
  },
  verify_business_account_email(input, context) {
    return executeEmailAttributeCheck(input, context, "/email/verify/business");
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ClearoutContext>({
  service,
  handlers: clearoutActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ClearoutContext> {
    const credential = await requireApiKeyCredential(context, service);
    const baseUrl = normalizeBaseUrl(
      optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl),
    );
    return {
      apiKey: credential.apiKey,
      baseUrl,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateClearoutCredential(input.apiKey, input.values, fetcher, signal);
  },
};

async function validateClearoutCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const baseUrl = normalizeBaseUrl(values.baseUrl);
  const payload = await requestClearoutJson({
    path: "/email_verify/getcredits",
    method: "GET",
    context: { apiKey, baseUrl, fetcher, signal },
    phase: "validate",
  });
  const data = requireObjectField(payload, "data");
  return {
    profile: {
      accountId: "clearout",
      displayName: "Clearout API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      baseUrl,
      validationEndpoint: "/email_verify/getcredits",
      availableCredits: optionalNumber(data.available_credits),
      lowCreditBalanceMinThreshold: optionalNumber(data.low_credit_balance_min_threshold),
    }),
  };
}

function executeEmailAttributeCheck(
  input: Record<string, unknown>,
  context: ClearoutContext,
  path: string,
): Promise<unknown> {
  return requestClearoutJson({
    path,
    method: "POST",
    context,
    body: buildVerifyBody(input),
    timeoutMs: readOptionalTimeout(input),
    phase: "execute",
  });
}

async function requestClearoutJson(input: {
  path: string;
  method: "GET" | "POST";
  context: ClearoutContext;
  phase: ClearoutRequestPhase;
  body?: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, input.timeoutMs ?? clearoutDefaultRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(buildUrl(input.context.baseUrl, input.path), {
      method: input.method,
      headers: buildHeaders(input.context.apiKey, input.method === "POST"),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readJsonPayload(response);
    if (!response.ok) {
      throw mapClearoutError(response.status, payload, input.phase);
    }
    if (!optionalRecord(payload)) {
      throw new ProviderRequestError(502, "clearout returned invalid JSON", payload);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "clearout request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `clearout request failed: ${error.message}` : "clearout request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return clearoutDefaultBaseUrl;
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ProviderRequestError(400, "baseUrl must be a valid Clearout HTTPS URL");
  }
  if (url.protocol !== "https:" || !isClearoutHostname(url.hostname)) {
    throw new ProviderRequestError(400, "baseUrl must use a Clearout-owned HTTPS host");
  }
  url.username = "";
  url.password = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function isClearoutHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.+$/, "");
  return normalized === "api.clearout.io";
}

function buildUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, `${baseUrl}/`).toString();
}

function buildHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

function buildVerifyBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    email: readRequiredEmail(input.email),
    timeout: readOptionalTimeout(input),
  });
}

function readRequiredEmail(value: unknown): string {
  const email = optionalString(value);
  if (!email) {
    throw new ProviderRequestError(400, "email is required");
  }
  return email;
}

function readOptionalTimeout(input: Record<string, unknown>): number | undefined {
  return optionalNumber(input.timeout);
}

function requireObjectField(payload: unknown, field: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "clearout returned invalid JSON", payload);
  }
  const value = optionalRecord(record[field]);
  if (!value) {
    throw new ProviderRequestError(502, `clearout response is missing ${field}`, payload);
  }
  return value;
}

function mapClearoutError(status: number, payload: unknown, phase: ClearoutRequestPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `clearout request failed with ${status}`;
  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 402) {
    return new ProviderRequestError(502, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.message) ?? optionalString(optionalRecord(record.error)?.message);
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "clearout returned invalid JSON");
  }
}
