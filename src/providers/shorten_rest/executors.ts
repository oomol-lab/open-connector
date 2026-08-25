import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "shorten_rest";
const shortenRestApiBaseUrl = "https://api.shorten.rest";
const shortenRestValidationPath = "/aliases/all";

type ShortenRestRequestPhase = "validate" | "execute";
type ShortenRestActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface ShortenRestRequestInput {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: ShortenRestRequestPhase;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}

export const shortenRestActionHandlers: ProviderActionHandlers<"shorten_rest", ShortenRestActionHandler> = {
  async create_alias(input, context) {
    const payload = await shortenRestRequest({
      method: "POST",
      path: "/aliases",
      query: buildAliasReferenceQuery(input),
      body: buildAliasBody(input),
      phase: "execute",
      context,
    });

    return normalizeCreateAlias(payload);
  },
  async get_alias(input, context) {
    const payload = await shortenRestRequest({
      method: "GET",
      path: "/aliases",
      query: buildAliasReferenceQuery(input),
      phase: "execute",
      context,
    });

    return {
      alias: payload === null ? null : normalizeAlias(payload),
    };
  },
  async update_alias(input, context) {
    await shortenRestRequest({
      method: "PUT",
      path: "/aliases",
      query: buildAliasReferenceQuery(input),
      body: buildAliasBody(input),
      phase: "execute",
      context,
    });

    return { success: true };
  },
  async delete_alias(input, context) {
    await shortenRestRequest({
      method: "DELETE",
      path: "/aliases",
      query: buildAliasReferenceQuery(input),
      phase: "execute",
      context,
    });

    return { success: true };
  },
  async list_aliases(input, context) {
    const payload = await shortenRestRequest({
      method: "GET",
      path: "/aliases/all",
      query: buildListQuery(input, "domainName"),
      phase: "execute",
      context,
    });

    return normalizeAliasList(payload);
  },
  async list_clicks(input, context) {
    const payload = await shortenRestRequest({
      method: "GET",
      path: "/clicks",
      query: buildListQuery(input),
      phase: "execute",
      context,
    });

    return normalizeClickList(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, shortenRestActionHandlers);

export const credentialValidators = {
  apiKey(
    input: { apiKey: string },
    { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
  ): Promise<CredentialValidationResult> {
    return validateShortenRestCredential(input.apiKey, fetcher, signal);
  },
};

async function validateShortenRestCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await shortenRestRequest({
    method: "GET",
    path: shortenRestValidationPath,
    query: {
      limit: 1,
    },
    phase: "validate",
    context: { apiKey, fetcher, signal },
  });
  normalizeAliasList(payload);

  return {
    profile: {
      accountId: "shorten_rest",
      displayName: "Shorten.REST API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: shortenRestApiBaseUrl,
      validationEndpoint: `${shortenRestValidationPath}?limit=1`,
    },
  };
}

async function shortenRestRequest(input: ShortenRestRequestInput): Promise<unknown> {
  const url = new URL(input.path, shortenRestApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method,
      headers: {
        "x-api-key": input.context.apiKey,
        accept: "application/json",
        "user-agent": providerUserAgent,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Shorten.REST request failed: ${error.message}` : "Shorten.REST request failed",
    );
  }

  const payload = await readShortenRestPayload(response);
  if (!response.ok) {
    throw createShortenRestError(response.status, response.statusText, payload, input.phase);
  }

  return payload;
}

async function readShortenRestPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Shorten.REST returned invalid JSON");
    }
    return text;
  }
}

function createShortenRestError(
  status: number,
  statusText: string,
  payload: unknown,
  phase: ShortenRestRequestPhase,
): ProviderRequestError {
  const message =
    extractShortenRestErrorMessage(payload) ?? statusText ?? `Shorten.REST request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }

  if ([400, 404, 409, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function extractShortenRestErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  return (
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.detail) ??
    optionalString(record?.title)
  );
}

function buildAliasReferenceQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    domainName: readOptionalTrimmedString(input.domainName),
    aliasName: readOptionalTrimmedString(input.aliasName),
  });
}

function buildListQuery(
  input: Record<string, unknown>,
  domainField?: "domainName",
): Record<string, string | number | undefined> {
  return compactObject({
    ...(domainField ? { domainName: readOptionalTrimmedString(input[domainField]) } : {}),
    continueFrom: readOptionalTrimmedString(input.continueFrom),
    limit: optionalInteger(input.limit),
  });
}

function buildAliasBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    destinations: normalizeInputArray(input.destinations, normalizeInputDestination),
    metatags: normalizeInputArray(input.metatags, normalizeInputMetatag),
    snippets: normalizeInputArray(input.snippets, normalizeInputSnippet),
  });
}

function normalizeInputArray<T>(value: unknown, normalize: (record: Record<string, unknown>) => T): T[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Array.isArray(value) ? value.map((item) => normalize(optionalRecord(item) ?? {})) : undefined;
}

function normalizeInputDestination(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    url: value.url,
    country: readOptionalTrimmedString(value.country),
    os: readOptionalTrimmedString(value.os),
  });
}

function normalizeInputMetatag(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: readOptionalTrimmedString(value.name),
    content: readOptionalTrimmedString(value.content),
  });
}

function normalizeInputSnippet(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: readOptionalTrimmedString(value.id),
    parameters: optionalRecord(value.parameters),
  });
}

function normalizeCreateAlias(payload: unknown): Record<string, unknown> {
  const record = requireResponseObject(payload, "create alias");

  return {
    aliasName: readRequiredString(record.aliasName, "aliasName"),
    domainName: readRequiredString(record.domainName, "domainName"),
    shortUrl: readRequiredString(record.shortUrl, "shortUrl"),
  };
}

function normalizeAlias(payload: unknown): Record<string, unknown> {
  const record = requireResponseObject(payload, "alias");

  return compactObject({
    name: readRequiredString(record.name, "name"),
    domainName: optionalString(record.domainName),
    createdAt: optionalInteger(record.createdAt),
    updatedAt: optionalInteger(record.updatedAt),
    destinations: normalizeOptionalObjectArray(record.destinations, normalizeDestination),
    metatags: normalizeOptionalObjectArray(record.metatags, normalizeMetatag),
    snippets: normalizeOptionalObjectArray(record.snippets, normalizeSnippet),
  });
}

function normalizeAliasList(payload: unknown): Record<string, unknown> {
  const record = requireResponseObject(payload, "alias list");
  if (!Array.isArray(record.aliases)) {
    throw new ProviderRequestError(502, "Shorten.REST aliases response must be an array");
  }

  return compactObject({
    aliases: record.aliases.map((alias) => readRequiredString(alias, "alias")),
    lastId: optionalString(record.lastId),
  });
}

function normalizeClickList(payload: unknown): Record<string, unknown> {
  const record = requireResponseObject(payload, "click list");
  if (!Array.isArray(record.clicks)) {
    throw new ProviderRequestError(502, "Shorten.REST clicks response must be an array");
  }

  return compactObject({
    clicks: record.clicks.map(normalizeClick),
    lastId: optionalString(record.lastId),
  });
}

function normalizeDestination(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    url: readRequiredString(value.url, "destination.url"),
    country: optionalString(value.country),
    os: optionalString(value.os),
  });
}

function normalizeMetatag(value: Record<string, unknown>): Record<string, unknown> {
  return {
    name: readRequiredString(value.name, "metatag.name"),
    content: readRequiredString(value.content, "metatag.content"),
  };
}

function normalizeSnippet(value: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: readRequiredString(value.id, "snippet.id"),
    parameters: optionalRecord(value.parameters),
  });
}

function normalizeClick(value: unknown): Record<string, unknown> {
  const record = requireResponseObject(value, "click");

  return compactObject({
    country: optionalString(record.country),
    os: optionalString(record.os),
    createdAt: optionalInteger(record.createdAt),
    domain: optionalString(record.domain),
    aliasId: optionalString(record.aliasId),
    alias: optionalString(record.alias),
    destination: optionalString(record.destination),
    userAgent: optionalString(record.userAgent),
    browser: optionalString(record.browser),
    referrer: optionalString(record.referrer),
  });
}

function normalizeOptionalObjectArray<T>(
  value: unknown,
  normalize: (record: Record<string, unknown>) => T,
): T[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Shorten.REST response field must be an array");
  }
  return value.map((item) => normalize(requireResponseObject(item, "array item")));
}

function requireResponseObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Shorten.REST response missing ${fieldName}`);
  }
  return record;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  return optionalString(value);
}

function readRequiredString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `Shorten.REST response missing ${fieldName}`);
  }
  return stringValue;
}
