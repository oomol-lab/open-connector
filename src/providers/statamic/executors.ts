import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "statamic";
const statamicApiBaseUrl = "https://statamic.com/api/v1";

type StatamicPhase = "validate" | "execute";
type StatamicActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const statamicActionHandlers: ProviderActionHandlers<"statamic", StatamicActionHandler> = {
  async list_sites(_input, context) {
    const payload = await requestStatamicJson({
      path: "/sites",
      method: "GET",
      context,
      phase: "execute",
    });

    return {
      sites: normalizeSiteList(payload.data),
    };
  },
  async create_site(input, context) {
    assertSiteMutationInput(input, false);
    const payload = await requestStatamicJson({
      path: "/sites",
      method: "POST",
      context,
      body: buildSiteMutationBody(input),
      phase: "execute",
    });

    return {
      site: normalizeSite(payload.data),
    };
  },
  async update_site(input, context) {
    assertSiteMutationInput(input, true);
    const payload = await requestStatamicJson({
      path: `/sites/${encodeURIComponent(requiredString(input.key, "key", providerInputError))}`,
      method: "PATCH",
      context,
      body: buildSiteMutationBody(input),
      phase: "execute",
    });

    return {
      site: normalizeSite(payload.data),
    };
  },
  async delete_site(input, context) {
    const payload = await requestStatamicJson({
      path: `/sites/${encodeURIComponent(requiredString(input.key, "key", providerInputError))}`,
      method: "DELETE",
      context,
      phase: "execute",
    });

    return {
      message: optionalString(payload.message) ?? "Site deleted.",
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, statamicActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestStatamicJson({
      path: "/sites",
      method: "GET",
      context: { apiKey: input.apiKey, fetcher, signal },
      phase: "validate",
    });
    const sites = normalizeSiteList(payload.data);
    const firstSite = sites[0];

    return {
      profile: {
        accountId: optionalString(firstSite?.key) ?? "statamic:api-key",
        displayName: optionalString(firstSite?.name)
          ? `Statamic: ${optionalString(firstSite?.name)}`
          : "Statamic API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: statamicApiBaseUrl,
        validationEndpoint: "/sites",
        siteCount: sites.length,
        firstSiteKey: optionalString(firstSite?.key),
        firstSiteName: optionalString(firstSite?.name),
      }),
    };
  },
};

async function requestStatamicJson(input: {
  path: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: StatamicPhase;
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${input.context.apiKey}`,
      "user-agent": providerUserAgent,
    };
    if (input.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await input.context.fetcher(buildStatamicUrl(input.path), {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readStatamicPayload(response);

    if (!response.ok) {
      throw createStatamicError(response.status, payload, input.phase);
    }

    const payloadRecord = optionalRecord(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "Statamic returned an invalid payload");
    }
    return payloadRecord;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Statamic request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Statamic request failed: ${error.message}` : "Statamic request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildStatamicUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, `${statamicApiBaseUrl}/`).toString();
}

async function readStatamicPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Statamic returned invalid JSON");
  }
}

function createStatamicError(status: number, payload: unknown, phase: StatamicPhase): ProviderRequestError {
  const message = extractStatamicErrorMessage(payload) ?? `Statamic request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractStatamicErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message);
  if (message) {
    return message;
  }

  const error = optionalString(record.error);
  if (error) {
    return error;
  }

  const errors = optionalRecord(record.errors);
  if (errors) {
    const firstError = Object.values(errors).find((value) => typeof value === "string" || Array.isArray(value));
    if (typeof firstError === "string" && firstError.trim() !== "") {
      return firstError.trim();
    }
    if (Array.isArray(firstError)) {
      const firstMessage = firstError.find((value) => typeof value === "string");
      if (typeof firstMessage === "string" && firstMessage.trim() !== "") {
        return firstMessage.trim();
      }
    }
  }

  return undefined;
}

function assertSiteMutationInput(input: Record<string, unknown>, requireMutationField: boolean): void {
  if (input.domain !== undefined && input.domains !== undefined) {
    throw new ProviderRequestError(400, "Provide either domain or domains, not both.");
  }
  if (requireMutationField && input.name === undefined && input.domain === undefined && input.domains === undefined) {
    throw new ProviderRequestError(400, "Provide at least one of name, domain, or domains.");
  }
}

function buildSiteMutationBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    domain: optionalString(input.domain),
    domains: readOptionalStringList(input.domains),
  });
}

function normalizeSiteList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeSite(item));
}

function normalizeSite(value: unknown): Record<string, unknown> {
  const site = optionalRecord(value);
  if (!site) {
    throw new ProviderRequestError(502, "Statamic response is missing site data");
  }

  return {
    name: optionalString(site.name) ?? "",
    key: optionalString(site.key) ?? "",
    domains: readResponseStringList(site.domains) ?? [],
    createdAt: optionalString(site.created_at) ?? null,
    raw: site,
  };
}

function readOptionalStringList(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "domains must be an array");
  }
  return value.map((item) => requiredString(item, "domains item", providerInputError));
}

function readResponseStringList(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Statamic response has invalid domains field");
  }
  return value.filter((item): item is string => typeof item === "string");
}
