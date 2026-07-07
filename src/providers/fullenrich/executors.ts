import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FullenrichActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "fullenrich";
const fullenrichApiBaseUrl = "https://app.fullenrich.com/api/v2";
const fullenrichRequestTimeoutMs = 30_000;

type FullenrichPhase = "validate" | "execute";
type FullenrichActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type FullenrichActionHandler = (input: Record<string, unknown>, context: FullenrichActionContext) => Promise<unknown>;

interface FullenrichRequestOptions {
  context: FullenrichActionContext;
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  phase: FullenrichPhase;
}

export const fullenrichActionHandlers: Record<FullenrichActionName, FullenrichActionHandler> = {
  async get_credit_balance(_input, context) {
    const payload = await requestFullenrichJson({
      context,
      path: "/account/credits",
      phase: "execute",
    });

    if (typeof payload.balance !== "number") {
      throw new ProviderRequestError(502, "FullEnrich returned an invalid credit balance", payload);
    }

    return {
      balance: payload.balance,
    };
  },
  async lookup_person(input, context) {
    validatePersonLookupInput(input);
    const payload = await requestFullenrichJson({
      context,
      path: "/people/lookup",
      method: "POST",
      body: compactObject(input),
      phase: "execute",
    });

    return {
      people: readObjectArray(payload.people),
      metadata: readOptionalObject(payload.metadata),
      raw: payload,
    };
  },
  async lookup_company(input, context) {
    validateCompanyLookupInput(input);
    const payload = await requestFullenrichJson({
      context,
      path: "/company/lookup",
      method: "POST",
      body: compactObject(input),
      phase: "execute",
    });

    return {
      companies: readObjectArray(payload.companies),
      metadata: readOptionalObject(payload.metadata),
      raw: payload,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, fullenrichActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: fullenrichApiBaseUrl,
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestFullenrichJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: "/account/keys/verify",
      phase: "validate",
    });

    const workspaceId = optionalString(payload.workspace_id);
    return {
      profile: {
        accountId: workspaceId ?? "api_key",
        displayName: workspaceId ? `FullEnrich workspace ${workspaceId}` : "FullEnrich API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        workspaceId,
        validationEndpoint: "/account/keys/verify",
        apiBaseUrl: fullenrichApiBaseUrl,
      }),
    };
  },
};

function validatePersonLookupInput(input: Record<string, unknown>): void {
  const hasPersonIdentifier =
    hasString(input.person_professional_network_url) || Number.isInteger(input.person_professional_network_id);
  const hasName = hasString(input.person_name);
  const hasCompanyIdentifier =
    hasString(input.company_professional_network_url) ||
    Number.isInteger(input.company_professional_network_id) ||
    hasString(input.company_domain);

  if (!hasPersonIdentifier && !(hasName && hasCompanyIdentifier)) {
    throw new ProviderRequestError(
      400,
      "Provide a person professional-network identifier, or person_name with a company identifier.",
    );
  }
}

function validateCompanyLookupInput(input: Record<string, unknown>): void {
  if (
    !hasString(input.domain) &&
    !hasString(input.professional_network_url) &&
    !Number.isInteger(input.professional_network_id)
  ) {
    throw new ProviderRequestError(400, "Provide domain, professional_network_url, or professional_network_id.");
  }
}

async function requestFullenrichJson(options: FullenrichRequestOptions): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(options.context.signal, fullenrichRequestTimeoutMs);
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${options.context.apiKey}`,
      "user-agent": providerUserAgent,
    };
    if (options.body) {
      headers["content-type"] = "application/json";
    }

    const response = await options.context.fetcher(`${fullenrichApiBaseUrl}${options.path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: timeout.signal,
    });

    const payload = await readFullenrichJson(response);
    if (!response.ok) {
      throw mapFullenrichError(response.status, payload, options.phase);
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "FullEnrich returned invalid JSON", payload);
    }

    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "FullEnrich request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `FullEnrich request failed: ${error.message}` : "FullEnrich request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readFullenrichJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "FullEnrich returned invalid JSON");
  }
}

function mapFullenrichError(status: number, payload: unknown, phase: FullenrichPhase): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `FullEnrich request failed with status ${status}`;
  if (status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const error = optionalRecord(payload);
  if (!error) {
    return undefined;
  }

  return optionalString(error.message) ?? optionalString(error.code);
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => optionalRecord(item) !== undefined)
    : [];
}

function readOptionalObject(value: unknown): Record<string, unknown> | null {
  return optionalRecord(value) ?? null;
}

function hasString(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}
