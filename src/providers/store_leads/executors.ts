import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { objectArray, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "store_leads";
const storeLeadsApiBaseUrl = "https://storeleads.app/json/api/v1/all";
const storeLeadsValidationPath = "/app";

type StoreLeadsPhase = "validate" | "execute";
type StoreLeadsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const storeLeadsActionHandlers: ProviderActionHandlers<"store_leads", StoreLeadsActionHandler> = {
  async get_domain(input, context) {
    const body = await requestStoreLeadsObject({
      context,
      path: `/domain/${encodeURIComponent(requiredString(input.domain, "domain", providerInputError))}`,
      query: buildQueryParams(input, ["follow_redirects", "fields"]),
      phase: "execute",
    });
    return { domain: requireProviderObject(body.domain, "Store Leads domain response domain") };
  },
  async list_domains(input, context) {
    const body = await requestStoreLeadsObject({
      context,
      path: "/domain",
      query: buildQueryParams(input, ["cursor", "aq", "fields", "page_size"]),
      phase: "execute",
    });
    return {
      domains: objectArray(body.domains, "Store Leads domains list response", providerResponseError),
      next_cursor: optionalString(body.next_cursor) ?? null,
    };
  },
  async get_app(input, context) {
    const body = await requestStoreLeadsObject({
      context,
      path: `/app/${encodeURIComponent(requiredString(input.app_id, "app_id", providerInputError))}`,
      query: buildQueryParams(input, ["fields"]),
      phase: "execute",
    });
    return { app: requireProviderObject(body.app, "Store Leads app response app") };
  },
  async list_apps(input, context) {
    const body = await requestStoreLeadsObject({
      context,
      path: "/app",
      query: buildQueryParams(input, [
        "page",
        "page_size",
        "sort",
        "q",
        "fields",
        ["platform", "f:p"],
        ["categories", "f:categories"],
      ]),
      phase: "execute",
    });
    return { apps: objectArray(body.apps, "Store Leads apps list response", providerResponseError) };
  },
  async get_technology(input, context) {
    const body = await requestStoreLeadsObject({
      context,
      path: `/technology/${encodeURIComponent(requiredString(input.technology, "technology", providerInputError))}`,
      query: buildQueryParams(input, ["fields"]),
      phase: "execute",
    });
    return {
      technology: requireProviderObject(body.technology, "Store Leads technology response technology"),
    };
  },
  async list_technologies(input, context) {
    const body = await requestStoreLeadsObject({
      context,
      path: "/technology",
      query: buildQueryParams(input, ["page", "page_size", "sort", "q", "fields"]),
      phase: "execute",
    });
    return {
      technologies: objectArray(body.technologies, "Store Leads technologies list response", providerResponseError),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, storeLeadsActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const body = await requestStoreLeadsObject({
      context: { apiKey: input.apiKey, fetcher, signal },
      path: storeLeadsValidationPath,
      query: buildQueryParams({ page_size: 1 }, ["page_size"]),
      phase: "validate",
    });
    const apps = objectArray(body.apps, "Store Leads apps list response", providerResponseError);
    const firstApp = apps[0];
    return {
      profile: {
        accountId: "store_leads:api-key",
        displayName: optionalString(firstApp?.name)
          ? `Store Leads (${optionalString(firstApp?.name)})`
          : "Store Leads API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: storeLeadsApiBaseUrl,
        validationEndpoint: `${storeLeadsValidationPath}?page_size=1`,
        sampleAppId: optionalString(firstApp?.id) ?? null,
      },
    };
  },
};

async function requestStoreLeadsObject(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: StoreLeadsPhase;
  query?: URLSearchParams;
}): Promise<Record<string, unknown>> {
  const payload = await requestStoreLeadsJson(input);
  return requireProviderObject(payload, "Store Leads response");
}

async function requestStoreLeadsJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: StoreLeadsPhase;
  query?: URLSearchParams;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(buildStoreLeadsUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readStoreLeadsPayload(response);
    if (!response.ok) {
      throw createStoreLeadsError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Store Leads request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Store Leads request failed: ${error.message}` : "Store Leads request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildStoreLeadsUrl(path: string, query?: URLSearchParams): string {
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(relativePath, `${storeLeadsApiBaseUrl}/`);
  if (query) {
    url.search = query.toString();
  }
  return url.toString();
}

function buildQueryParams(
  input: Record<string, unknown>,
  allowed: readonly (string | readonly [string, string])[],
): URLSearchParams | undefined {
  const query = new URLSearchParams();
  for (const field of allowed) {
    const inputKey = typeof field === "string" ? field : field[0];
    const outputKey = typeof field === "string" ? field : field[1];
    const value = input[inputKey];
    if (value !== undefined && value !== null && value !== "") {
      query.set(outputKey, String(value));
    }
  }
  return query.size > 0 ? query : undefined;
}

async function readStoreLeadsPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "invalid Store Leads JSON response");
  }
}

function createStoreLeadsError(status: number, payload: unknown, phase: StoreLeadsPhase): ProviderRequestError {
  const message = extractStoreLeadsErrorMessage(payload) ?? `Store Leads request failed with status ${status}`;
  const mappedStatus = phase === "validate" && (status === 401 || status === 403) ? 400 : status;
  return new ProviderRequestError(mappedStatus, message, payload);
}

function extractStoreLeadsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function requireProviderObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${label} is missing an object`, value);
  }
  return object;
}
