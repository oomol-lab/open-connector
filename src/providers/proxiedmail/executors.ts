import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProxiedmailActionName } from "./actions.ts";

import {
  compactObject,
  objectArray,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "proxiedmail";
const proxiedmailApiBaseUrl = "https://proxiedmail.com/api/v1";
const proxiedmailRequestTimeoutMs = 30_000;

type ProxiedmailRequestPhase = "validate" | "execute";
type ProxiedmailMethod = "GET" | "POST" | "PATCH";

interface ProxiedmailActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ProxiedmailActionHandler = (input: Record<string, unknown>, context: ProxiedmailActionContext) => Promise<unknown>;

export const proxiedmailActionHandlers: Record<ProxiedmailActionName, ProxiedmailActionHandler> = {
  async list_proxy_bindings(_input, context) {
    const payload = await requestProxiedmailJson({
      apiKey: context.apiKey,
      path: "/proxy-bindings",
      method: "GET",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return normalizeProxyBindingsList(payload);
  },

  async create_proxy_binding(input, context) {
    const payload = await requestProxiedmailJson({
      apiKey: context.apiKey,
      path: "/proxy-bindings",
      method: "POST",
      body: {
        data: {
          type: "proxy_bindings",
          attributes: compactObject({
            real_addresses: readStringArray(input.realAddresses, "realAddresses"),
            proxy_address: readOptionalNonEmptyString(input.proxyAddress),
            callback_url: readOptionalString(input.callbackUrl),
            is_browsable: typeof input.isBrowsable === "boolean" ? input.isBrowsable : undefined,
          }),
        },
      },
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return normalizeProxyBindingResponse(payload);
  },

  async update_proxy_binding(input, context) {
    const proxyBindingId = readRequiredNonEmptyString(input.proxyBindingId, "proxyBindingId");
    const attributes = compactObject({
      real_addresses: readOptionalRealAddressUpdates(input.realAddresses),
      proxy_address: readOptionalNonEmptyString(input.proxyAddress),
      description: typeof input.description === "string" ? input.description : undefined,
      callback_url: readOptionalString(input.callbackUrl),
      is_browsable: typeof input.isBrowsable === "boolean" ? input.isBrowsable : undefined,
    });

    if (Object.keys(attributes).length === 0) {
      throw new ProviderRequestError(400, "at least one ProxiedMail proxy binding field is required");
    }

    const payload = await requestProxiedmailJson({
      apiKey: context.apiKey,
      path: `/proxy-bindings/${encodeURIComponent(proxyBindingId)}`,
      method: "PATCH",
      body: {
        data: {
          id: proxyBindingId,
          type: "proxy_bindings",
          attributes,
        },
      },
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    return normalizeProxyBindingResponse(payload);
  },

  async list_received_email_links(input, context) {
    const proxyBindingId = readRequiredNonEmptyString(input.proxyBindingId, "proxyBindingId");
    const payload = await requestProxiedmailJson({
      apiKey: context.apiKey,
      path: `/received-emails-links/${encodeURIComponent(proxyBindingId)}`,
      method: "GET",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    const payloadRecord = requireProviderRecord(
      payload,
      "ProxiedMail returned an invalid received-email links response",
    );
    return {
      receivedEmailLinks: readProviderArray(payloadRecord.data),
      raw: payloadRecord,
    };
  },

  async get_received_email(input, context) {
    const receivedEmailId = readRequiredNonEmptyString(input.receivedEmailId, "receivedEmailId");
    const payload = await requestProxiedmailJson({
      apiKey: context.apiKey,
      path: `/received-emails/${encodeURIComponent(receivedEmailId)}`,
      method: "GET",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
    const payloadRecord = requireProviderRecord(payload, "ProxiedMail returned an invalid received-email response");
    return {
      receivedEmail: requireProviderRecord(
        payloadRecord.data,
        "ProxiedMail returned an invalid received-email resource",
      ),
      raw: payloadRecord,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ProxiedmailActionContext>({
  service,
  handlers: proxiedmailActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ProxiedmailActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: proxiedmailApiBaseUrl,
  auth: { type: "api_key_header", name: "Token" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestProxiedmailJson({
      apiKey: input.apiKey,
      path: "/proxy-bindings",
      method: "GET",
      fetcher,
      signal,
      phase: "validate",
    });
    const normalized = normalizeProxyBindingsList(payload);
    const meta = normalized.meta;

    return {
      profile: {
        accountId: "api_key",
        displayName: "ProxiedMail API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: proxiedmailApiBaseUrl,
        validationEndpoint: "/proxy-bindings",
        proxyBindingCount: normalized.proxyBindings.length,
        usedProxyBindings: optionalInteger(meta.usedProxyBindings),
        availableProxyBindings: optionalInteger(meta.availableProxyBindings),
      }),
    };
  },
};

async function requestProxiedmailJson(input: {
  apiKey: string;
  path: string;
  method: ProxiedmailMethod;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: ProxiedmailRequestPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, proxiedmailRequestTimeoutMs);
  try {
    const response = await input.fetcher(buildProxiedmailUrl(input.path), {
      method: input.method,
      headers: {
        accept: "application/json",
        ...(input.body ? { "content-type": "application/json" } : {}),
        Token: input.apiKey,
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readProxiedmailPayload(response);

    if (!response.ok) {
      throw mapProxiedmailError(response.status, payload, input.phase);
    }

    return payload ?? {};
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "ProxiedMail request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ProxiedMail request failed: ${error.message}` : "ProxiedMail request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildProxiedmailUrl(path: string): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, `${proxiedmailApiBaseUrl}/`);
}

async function readProxiedmailPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => undefined);
  }

  const text = await response.text().catch(() => "");
  return text ? { message: text } : undefined;
}

function mapProxiedmailError(status: number, payload: unknown, phase: ProxiedmailRequestPhase): ProviderRequestError {
  const message = readProxiedmailErrorMessage(payload) ?? `ProxiedMail request failed (${status})`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function readProxiedmailErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const direct = optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
  if (direct) {
    return direct;
  }

  if (Array.isArray(record.errors) && record.errors.length > 0) {
    const first = record.errors[0];
    if (typeof first === "string") {
      return first;
    }
    const firstRecord = optionalRecord(first);
    return firstRecord ? (optionalString(firstRecord.message) ?? optionalString(firstRecord.detail)) : undefined;
  }

  return undefined;
}

function normalizeProxyBindingsList(payload: unknown): {
  meta: Record<string, unknown>;
  proxyBindings: Array<Record<string, unknown>>;
  raw: Record<string, unknown>;
} {
  const payloadRecord = requireProviderRecord(payload, "ProxiedMail returned an invalid proxy bindings response");

  return {
    meta: optionalRecord(payloadRecord.meta) ?? {},
    proxyBindings: readProviderArray(payloadRecord.data),
    raw: payloadRecord,
  };
}

function normalizeProxyBindingResponse(payload: unknown): {
  meta: Record<string, unknown>;
  proxyBinding: Record<string, unknown>;
  raw: Record<string, unknown>;
} {
  const payloadRecord = requireProviderRecord(payload, "ProxiedMail returned an invalid proxy binding response");

  return {
    meta: optionalRecord(payloadRecord.meta) ?? {},
    proxyBinding: requireProviderRecord(payloadRecord.data, "ProxiedMail returned an invalid proxy binding resource"),
    raw: payloadRecord,
  };
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }

  return value.map((item) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new ProviderRequestError(400, `${fieldName} must contain strings`);
    }
    return item.trim();
  });
}

function readOptionalRealAddressUpdates(value: unknown): Record<string, boolean> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = requiredRecord(value, "realAddresses", (message) => new ProviderRequestError(400, message));
  return Object.fromEntries(
    Object.entries(record).map(([email, enabled]) => {
      if (typeof enabled !== "boolean") {
        throw new ProviderRequestError(400, "realAddresses values must be booleans");
      }
      return [email, enabled];
    }),
  );
}

function readRequiredNonEmptyString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalNonEmptyString(value: unknown): string | undefined {
  return optionalString(value);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function readProviderArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? objectArray(value, "array item", (message) => new ProviderRequestError(502, message))
    : [];
}

function requireProviderRecord(value: unknown, message: string): Record<string, unknown> {
  return requiredRecord(value, message, () => new ProviderRequestError(502, message));
}
