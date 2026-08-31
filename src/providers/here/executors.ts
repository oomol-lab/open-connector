import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "here";
const hereGeocodeBaseUrl = "https://geocode.search.hereapi.com/v1";
const hereReverseGeocodeBaseUrl = "https://revgeocode.search.hereapi.com/v1";
const hereDiscoverBaseUrl = "https://discover.search.hereapi.com/v1";
const hereAutosuggestBaseUrl = "https://autosuggest.search.hereapi.com/v1";
const hereAutocompleteBaseUrl = "https://autocomplete.search.hereapi.com/v1";
const hereLookupBaseUrl = "https://lookup.search.hereapi.com/v1";

type HereRequestPhase = "validate" | "execute";
type HereActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type HereActionHandler = (input: Record<string, unknown>, context: HereActionContext) => Promise<unknown>;

export const hereActionHandlers: ProviderActionHandlers<"here", HereActionHandler> = {
  geocode(input, context) {
    return hereGetJson(
      buildHereUrl(hereGeocodeBaseUrl, "/geocode", context.apiKey, {
        q: requiredInputString(input.q, "q"),
        lang: optionalString(input.lang),
        limit: optionalInteger(input.limit),
        in: optionalString(input.in),
        at: optionalString(input.at),
        types: optionalString(input.types),
        politicalView: optionalString(input.politicalView),
        show: optionalString(input.show),
      }),
      context,
      "execute",
    );
  },
  reverse_geocode(input, context) {
    return hereGetJson(
      buildHereUrl(hereReverseGeocodeBaseUrl, "/revgeocode", context.apiKey, {
        at: requiredInputString(input.at, "at"),
        lang: optionalString(input.lang),
        limit: optionalInteger(input.limit),
        types: optionalString(input.types),
        politicalView: optionalString(input.politicalView),
        show: optionalString(input.show),
      }),
      context,
      "execute",
    );
  },
  discover(input, context) {
    assertValidHereSpatialContext(input, "HERE Discover");
    return hereGetJson(
      buildHereUrl(hereDiscoverBaseUrl, "/discover", context.apiKey, {
        q: requiredInputString(input.q, "q"),
        at: optionalString(input.at),
        in: optionalString(input.in),
        lang: optionalString(input.lang),
        limit: optionalInteger(input.limit),
        types: optionalString(input.types),
        politicalView: optionalString(input.politicalView),
        show: optionalString(input.show),
      }),
      context,
      "execute",
    );
  },
  autosuggest(input, context) {
    assertValidHereSpatialContext(input, "HERE Autosuggest");
    return hereGetJson(
      buildHereUrl(hereAutosuggestBaseUrl, "/autosuggest", context.apiKey, {
        q: requiredInputString(input.q, "q"),
        at: optionalString(input.at),
        in: optionalString(input.in),
        lang: optionalString(input.lang),
        limit: optionalInteger(input.limit),
        politicalView: optionalString(input.politicalView),
      }),
      context,
      "execute",
    );
  },
  autocomplete(input, context) {
    return hereGetJson(
      buildHereUrl(hereAutocompleteBaseUrl, "/autocomplete", context.apiKey, {
        q: requiredInputString(input.q, "q"),
        at: optionalString(input.at),
        in: optionalString(input.in),
        lang: optionalString(input.lang),
        limit: optionalInteger(input.limit),
        politicalView: optionalString(input.politicalView),
      }),
      context,
      "execute",
    );
  },
  lookup(input, context) {
    return hereGetJson(
      buildHereUrl(hereLookupBaseUrl, "/lookup", context.apiKey, {
        id: requiredInputString(input.id, "id"),
        lang: optionalString(input.lang),
        show: optionalString(input.show),
      }),
      context,
      "execute",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, hereActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await hereGetJson(
      buildHereUrl(hereGeocodeBaseUrl, "/geocode", input.apiKey, {
        q: "Berlin",
        limit: 1,
      }),
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const firstTitle = extractFirstItemTitle(payload);

    return {
      profile: {
        accountId: "here-api-key",
        displayName: "HERE API Key",
      },
      grantedScopes: [],
      metadata: jsonObject({
        apiBaseUrl: hereGeocodeBaseUrl,
        validationEndpoint: "/geocode",
        authMethod: "query_apiKey",
        validatedResultTitle: firstTitle,
      }),
    };
  },
};

function buildHereUrl(
  baseUrl: string,
  path: string,
  apiKey: string,
  query: Record<string, string | number | undefined>,
): URL {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("apiKey", apiKey);
  return url;
}

async function hereGetJson(url: URL, context: HereActionContext, phase: HereRequestPhase): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readHerePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `HERE request failed: ${error.message}` : "HERE request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createHereError(response, payload, phase);
  }

  return payload;
}

async function readHerePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createHereError(response: Response, payload: unknown, phase: HereRequestPhase): ProviderRequestError {
  const message = extractHereErrorMessage(payload) ?? `HERE API returned HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 500) {
    return new ProviderRequestError(502, message, payload);
  }
  return new ProviderRequestError(400, message, payload);
}

function extractHereErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  for (const key of ["error_description", "message", "title", "error", "cause"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function extractFirstItemTitle(payload: unknown): string | undefined {
  const items = optionalRecord(payload)?.items;
  if (!Array.isArray(items)) {
    return undefined;
  }
  return optionalString(optionalRecord(items[0])?.title);
}

function assertValidHereSpatialContext(input: Record<string, unknown>, actionName: string): void {
  const at = optionalString(input.at);
  const inValue = optionalString(input.in);
  const hasSpatialIn = inValue?.startsWith("circle:") || inValue?.startsWith("bbox:");
  if (at && hasSpatialIn) {
    throw new ProviderRequestError(
      400,
      `${actionName} requires exactly one of at, in=circle, or in=bbox as spatial context.`,
    );
  }
  if (!at && !hasSpatialIn) {
    throw new ProviderRequestError(400, `${actionName} requires at, in=circle, or in=bbox as spatial context.`);
  }
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://geocode.search.hereapi.com/v1",
  auth: { type: "api_key_query", name: "apiKey" },
});
