import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { booleanString, compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const agilityApiBaseUrl = "https://api.aglty.io";
const agilityDefaultRequestTimeoutMs = 30_000;

type AgilityPhase = "validate" | "execute";

interface AgilityActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AgilityActionHandler = (input: Record<string, unknown>, context: AgilityActionContext) => Promise<unknown>;

export const agilityActionHandlers: ProviderActionHandlers<"agility", AgilityActionHandler> = {
  async list_content_models(input, context) {
    const payload = await requestAgilityJson({
      path: buildAgilityPath(input.guid, input.apiType, "contentmodels"),
      apiKey: context.apiKey,
      params: compactObject({
        lastModifiedDate: optionalString(input.lastModifiedDate),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Agility CMS returned invalid content models");
    }

    return {
      models: payload,
      raw: payload,
    };
  },

  async get_content_list(input, context) {
    const payload = await requestAgilityJson({
      path: buildAgilityPath(
        input.guid,
        input.apiType,
        readRequiredString(input.locale, "locale"),
        "list",
        readRequiredString(input.referenceName, "referenceName"),
      ),
      apiKey: context.apiKey,
      params: compactObject({
        ContentLinkDepth: readOptionalIntegerString(input.contentLinkDepth),
        ExpandAllContentLinks: booleanString(input.expandAllContentLinks),
        Fields: optionalString(input.fields),
        Take: readOptionalIntegerString(input.take),
        Skip: readOptionalIntegerString(input.skip),
        Filter: optionalString(input.filter),
        Sort: optionalString(input.sort),
        Direction: optionalString(input.direction),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      list: payload,
      raw: payload,
    };
  },

  async get_content_item(input, context) {
    const payload = await requestAgilityJson({
      path: buildAgilityPath(
        input.guid,
        input.apiType,
        readRequiredString(input.locale, "locale"),
        "item",
        readRequiredIntegerString(input.id, "id"),
      ),
      apiKey: context.apiKey,
      params: compactObject({
        contentLinkDepth: readOptionalIntegerString(input.contentLinkDepth),
        expandAllContentLinks: booleanString(input.expandAllContentLinks),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      item: payload,
      raw: payload,
    };
  },

  async get_page(input, context) {
    const payload = await requestAgilityJson({
      path: buildAgilityPath(
        input.guid,
        input.apiType,
        readRequiredString(input.locale, "locale"),
        "page",
        readRequiredIntegerString(input.id, "id"),
      ),
      apiKey: context.apiKey,
      params: compactObject({
        contentLinkDepth: readOptionalIntegerString(input.contentLinkDepth),
        expandAllContentLinks: booleanString(input.expandAllContentLinks),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      page: payload,
      raw: payload,
    };
  },

  async get_flat_sitemap(input, context) {
    const payload = await requestAgilityJson({
      path: buildAgilityPath(
        input.guid,
        input.apiType,
        readRequiredString(input.locale, "locale"),
        "sitemap",
        "flat",
        readRequiredString(input.channelName, "channelName"),
      ),
      apiKey: context.apiKey,
      params: {},
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    const sitemap = optionalRecord(payload);
    if (!sitemap) {
      throw new ProviderRequestError(502, "Agility CMS returned invalid flat sitemap");
    }

    return {
      sitemap,
      raw: payload,
    };
  },

  async get_nested_sitemap(input, context) {
    const payload = await requestAgilityJson({
      path: buildAgilityPath(
        input.guid,
        input.apiType,
        readRequiredString(input.locale, "locale"),
        "sitemap",
        "nested",
        readRequiredString(input.channelName, "channelName"),
      ),
      apiKey: context.apiKey,
      params: {},
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Agility CMS returned invalid nested sitemap");
    }

    return {
      sitemap: payload,
      raw: payload,
    };
  },
};

export async function validateAgilityCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = readRequiredString(input.apiKey, "apiKey");
  const guid = optionalString(input.guid);
  if (!guid) {
    return {
      profile: {
        accountId: "agility_api_key",
        displayName: "Agility CMS API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: agilityApiBaseUrl,
        validationSkipped: true,
        validationSkipReason: "guid extra field was not provided",
      },
    };
  }

  const payload = await requestAgilityJson({
    path: buildAgilityPath(guid, "fetch", "contentmodels"),
    apiKey,
    params: {},
    fetcher,
    signal,
    phase: "validate",
  });

  const modelCount = Array.isArray(payload) ? payload.length : undefined;

  return {
    profile: {
      accountId: guid,
      displayName: "Agility CMS API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: agilityApiBaseUrl,
      validationEndpoint: `/${guid}/fetch/contentmodels`,
      guid,
      modelCount,
    }),
  };
}

async function requestAgilityJson(input: {
  path: string;
  apiKey: string;
  params: Record<string, string | undefined>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: AgilityPhase;
}): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(agilityDefaultRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.fetcher(buildAgilityUrl(input.path, input.params), {
      method: "GET",
      headers: {
        accept: "application/json",
        APIKey: input.apiKey,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readAgilityPayload(response);

    if (!response.ok) {
      throw createAgilityError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && !input.signal?.aborted) {
      throw new ProviderRequestError(504, "Agility CMS request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Agility CMS request failed: ${error.message}` : "Agility CMS request failed",
    );
  }
}

function buildAgilityUrl(path: string, params: Record<string, string | undefined>): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${agilityApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildAgilityPath(...segments: unknown[]): string {
  return `/${segments.map((segment) => encodeURIComponent(readRequiredString(segment, "path"))).join("/")}`;
}

async function readAgilityPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Agility CMS returned invalid JSON");
  }
}

function createAgilityError(status: number, payload: unknown, phase: AgilityPhase): ProviderRequestError {
  const message = extractAgilityErrorMessage(payload) ?? `Agility CMS request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (status === 401 || status === 403 || status === 404)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractAgilityErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) {
    return message;
  }

  return optionalString(record.detail) ?? optionalString(record.title);
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }

  return text;
}

function readRequiredIntegerString(value: unknown, fieldName: string): string {
  const integer = optionalInteger(value);
  if (integer === undefined || integer <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }

  return String(integer);
}

function readOptionalIntegerString(value: unknown): string | undefined {
  const integer = optionalInteger(value);
  return integer === undefined ? undefined : String(integer);
}
