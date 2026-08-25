import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "one_password";
const onePasswordValidationPath = "/v1/vaults";
const onePasswordRequestTimeoutMs = 30_000;

type OnePasswordPhase = "validate" | "execute";
type OnePasswordActionHandler = (input: Record<string, unknown>, context: OnePasswordContext) => Promise<unknown>;

interface OnePasswordContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface OnePasswordRequestInput {
  context: OnePasswordContext;
  path: string;
  phase: OnePasswordPhase;
  query?: Record<string, string | number | boolean | undefined>;
}

export const onePasswordActionHandlers: ProviderActionHandlers<"one_password", OnePasswordActionHandler> = {
  async get_health(_input, context) {
    const health = await requestOnePasswordJson({
      context,
      path: "/health",
      phase: "execute",
    });

    return {
      health: requireObjectPayload(health, "1Password health response"),
    };
  },
  async list_vaults(input, context) {
    const vaults = await requestOnePasswordJson({
      context,
      path: "/v1/vaults",
      query: {
        filter: optionalString(input.filter),
      },
      phase: "execute",
    });

    return {
      vaults: requireObjectArrayPayload(vaults, "1Password vault list response"),
    };
  },
  async get_vault(input, context) {
    const vault = await requestOnePasswordJson({
      context,
      path: `/v1/vaults/${encodeURIComponent(readInputString(input.vaultId, "vaultId"))}`,
      phase: "execute",
    });

    return {
      vault: requireObjectPayload(vault, "1Password vault response"),
    };
  },
  async list_items(input, context) {
    const items = await requestOnePasswordJson({
      context,
      path: `/v1/vaults/${encodeURIComponent(readInputString(input.vaultId, "vaultId"))}/items`,
      query: {
        filter: optionalString(input.filter),
      },
      phase: "execute",
    });

    return {
      items: requireObjectArrayPayload(items, "1Password item list response"),
    };
  },
  async get_item(input, context) {
    const vaultId = readInputString(input.vaultId, "vaultId");
    const itemId = readInputString(input.itemId, "itemId");
    const item = await requestOnePasswordJson({
      context,
      path: `/v1/vaults/${encodeURIComponent(vaultId)}/items/${encodeURIComponent(itemId)}`,
      phase: "execute",
    });

    return {
      item: requireObjectPayload(item, "1Password item response"),
    };
  },
  async list_activity(input, context) {
    const activity = await requestOnePasswordJson({
      context,
      path: "/v1/activity",
      query: {
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
      },
      phase: "execute",
    });

    return {
      activity: requireObjectArrayPayload(activity, "1Password activity response"),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<OnePasswordContext>({
  service,
  handlers: onePasswordActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<OnePasswordContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: normalizeOnePasswordBaseUrl(credential.metadata.baseUrl ?? credential.values.baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const baseUrl = normalizeOnePasswordBaseUrl(input.values.baseUrl);
    const context: OnePasswordContext = {
      apiKey: input.apiKey,
      baseUrl,
      fetcher,
      signal,
    };
    const vaults = requireObjectArrayPayload(
      await requestOnePasswordJson({
        context,
        path: onePasswordValidationPath,
        phase: "validate",
      }),
      "1Password vault list response",
    );
    const firstVaultName = optionalString(vaults[0]?.name);
    const accountLabel = firstVaultName ? `1Password Connect (${firstVaultName})` : "1Password Connect";

    return {
      profile: {
        accountId: `one_password:${new URL(baseUrl).host}:${buildTokenFingerprint(input.apiKey)}`,
        displayName: accountLabel,
      },
      grantedScopes: [],
      metadata: {
        baseUrl,
        apiBaseUrl: baseUrl,
        validationEndpoint: onePasswordValidationPath,
        vaultCount: vaults.length,
      },
    };
  },
};

async function requestOnePasswordJson(input: OnePasswordRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, onePasswordRequestTimeoutMs);
  try {
    const response = await input.context.fetcher(buildOnePasswordUrl(input), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readOnePasswordPayload(response);

    if (!response.ok) {
      throw createOnePasswordError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "1Password request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `1Password request failed: ${error.message}` : "1Password request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildOnePasswordUrl(input: {
  context: Pick<OnePasswordContext, "baseUrl">;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
}): URL {
  const url = new URL(input.path, `${input.context.baseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readOnePasswordPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createOnePasswordError(status: number, payload: unknown, phase: OnePasswordPhase): ProviderRequestError {
  const message = extractOnePasswordErrorMessage(payload) ?? `1Password request failed with status ${status}`;

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractOnePasswordErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function normalizeOnePasswordBaseUrl(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }

  const url = assertPublicHttpUrl(raw, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use https");
  }
  if (url.pathname !== "/") {
    throw new ProviderRequestError(400, "baseUrl must be the Connect Server root URL without any path");
  }

  url.hash = "";
  url.search = "";
  return trimTrailingSlash(url.toString());
}

function readInputString(value: unknown, key: string): string {
  return requiredString(value, key, (message) => new ProviderRequestError(400, message));
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} is invalid`, payload);
  }
  return record;
}

function requireObjectArrayPayload(payload: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} is invalid`, payload);
  }

  return payload.map((item) => requireObjectPayload(item, label));
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildTokenFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 12);
}
