import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  positiveInteger,
  requiredRecord,
  requiredStringArray,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "concord";
const concordApiBaseUrl = "https://api.concordnow.com/api/rest/1";
const concordRequestTimeoutMs = 30_000;

type ConcordPhase = "validate" | "execute";
type ConcordActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const concordActionHandlers: ProviderActionHandlers<"concord", ConcordActionHandler> = {
  async get_current_user(_input, context) {
    return { user: await requestConcordObject("/user/me", context, "execute", "current user") };
  },
  async list_organizations(_input, context) {
    const payload = await requestConcordObject("/user/me/organizations", context, "execute", "organization list");
    if (!Array.isArray(payload.organizations)) {
      throw new ProviderRequestError(502, "Concord organization list did not include organizations");
    }
    return { organizations: payload.organizations };
  },
  async get_organization(input, context) {
    const organizationId = positiveInteger(input.organizationId, "organizationId", inputError);
    return {
      organization: await requestConcordObject(`/organizations/${organizationId}`, context, "execute", "organization"),
    };
  },
  async list_folders(input, context) {
    const organizationId = positiveInteger(input.organizationId, "organizationId", inputError);
    return {
      folder: await requestConcordObject(
        `/user/me/organizations/${organizationId}/folders`,
        context,
        "execute",
        "folder tree",
      ),
    };
  },
  async list_agreements(input, context) {
    const organizationId = positiveInteger(input.organizationId, "organizationId", inputError);
    const query = new URLSearchParams();
    for (const status of requiredStringArray(input.statuses, "statuses", inputError)) query.append("statuses", status);
    appendOptional(query, "page", optionalInteger(input.page));
    appendOptional(query, "numberOfItemsByPage", optionalInteger(input.numberOfItemsByPage));
    appendOptional(query, "search", optionalString(input.search));
    appendOptional(query, "isInboxed", optionalBoolean(input.isInboxed));
    appendOptional(query, "isBookmarked", optionalBoolean(input.isBookmarked));
    appendOptional(query, "sortByColumn", optionalString(input.sortByColumn));
    appendOptional(query, "sortByAsc", optionalBoolean(input.sortByAsc));
    if (Array.isArray(input.tagIds)) {
      for (const tagId of input.tagIds) query.append("tagIds", String(positiveInteger(tagId, "tagIds", inputError)));
    }
    return requestConcordObject(
      `/user/me/organizations/${organizationId}/agreements?${query}`,
      context,
      "execute",
      "agreement list",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, concordActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const user = await requestConcordObject(
      "/user/me",
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
      "current user",
    );
    const email = optionalString(user.email);
    return {
      profile: {
        accountId: optionalString(user.id) ?? email ?? "concord-api-key",
        displayName: optionalString(user.fullName) ?? email ?? "Concord API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: concordApiBaseUrl,
        validationEndpoint: "/user/me",
      },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: concordApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-KEY" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    if (!headers.has("user-agent")) headers.set("user-agent", providerUserAgent);
  },
});

async function requestConcordObject(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: ConcordPhase,
  label: string,
): Promise<Record<string, unknown>> {
  return requiredRecord(await requestConcordJson(path, context, phase), `Concord ${label}`, outputError);
}

async function requestConcordJson(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: ConcordPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, concordRequestTimeoutMs);
  try {
    const response = await context.fetcher(`${concordApiBaseUrl}${path}`, {
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-API-KEY": context.apiKey,
      },
      signal: timeout.signal,
    });
    const payload = await readJson(response);
    if (!response.ok) throw createConcordError(response.status, payload, phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Concord request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Concord request failed: ${error.message}` : "Concord request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Concord returned invalid JSON");
  }
}

function createConcordError(status: number, payload: unknown, phase: ConcordPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.restCode) ??
    `Concord request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) return new ProviderRequestError(status, message, payload);
  if (status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function appendOptional(query: URLSearchParams, name: string, value: string | number | boolean | undefined): void {
  if (value !== undefined) query.set(name, String(value));
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function outputError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
