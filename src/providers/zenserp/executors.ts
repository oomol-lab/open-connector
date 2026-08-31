import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "zenserp";
const zenserpBaseUrl = "https://app.zenserp.com";
const zenserpApiBaseUrl = "https://app.zenserp.com/api/v2";
const zenserpSearchPath = "/api/v2/search";

type ZenserpPhase = "validate" | "execute";
type ZenserpQueryValue = string | number | boolean | undefined;
type ZenserpActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const zenserpActionHandlers: ProviderActionHandlers<"zenserp", ZenserpActionHandler> = {
  search(input, context) {
    return requestZenserpSearch(buildZenserpSearchQuery(input, undefined), context, "execute");
  },
  google_news_search(input, context) {
    return requestZenserpSearch(buildZenserpSearchQuery(input, "nws"), context, "execute");
  },
  google_maps_search(input, context) {
    return requestZenserpSearch(buildZenserpSearchQuery(input, "lcl"), context, "execute");
  },
  google_image_search(input, context) {
    return requestZenserpSearch(buildZenserpSearchQuery(input, "isch"), context, "execute");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, zenserpActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    await requestZenserpSearch(
      {
        q: "coffee",
        engine: "google",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        accountId: "zenserp-api-key",
        displayName: "Zenserp API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: zenserpApiBaseUrl,
        validationEndpoint: "/search",
        validationQuery: "coffee",
        validationEngine: "google",
      },
    };
  },
};

async function requestZenserpSearch(
  query: Record<string, ZenserpQueryValue>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: ZenserpPhase,
): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;

  try {
    response = await context.fetcher(buildZenserpUrl(query), {
      method: "GET",
      headers: {
        accept: "application/json",
        apikey: context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Zenserp request failed: ${error.message}` : "Zenserp request failed",
    );
  }

  if (!response.ok) {
    throw createZenserpError(response.status, payload, phase);
  }

  return requiredRecord(payload, "Zenserp response", providerResponseError);
}

function buildZenserpSearchQuery(
  input: Record<string, unknown>,
  tbm: string | undefined,
): Record<string, ZenserpQueryValue> {
  return compactObject({
    q: requiredString(input.q, "q", providerInputError),
    engine: "google",
    tbm,
    search_engine: optionalString(input.searchEngine),
    location: optionalString(input.location),
    hl: optionalString(input.hl),
    gl: optionalString(input.gl),
    num: readOptionalInteger(input.num, "num", { minimum: 1, maximum: 100 }),
    start: readOptionalInteger(input.start, "start", { minimum: 0 }),
  }) as Record<string, ZenserpQueryValue>;
}

function buildZenserpUrl(query: Record<string, ZenserpQueryValue>): string {
  const url = new URL(zenserpSearchPath, zenserpBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Zenserp returned invalid JSON");
  }
}

function createZenserpError(status: number, payload: unknown, phase: ZenserpPhase): ProviderRequestError {
  const message = extractZenserpMessage(payload) ?? `Zenserp request failed with ${status || 500}`;

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(403, message, payload);
  }

  if (phase === "execute" && [400, 404, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractZenserpMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    for (const item of errors) {
      if (typeof item === "string" && item.trim()) {
        return item;
      }
    }
  }

  return (
    optionalString(record.error) ??
    optionalString(record.message) ??
    optionalString(record.detail) ??
    optionalString(record.title)
  );
}

function readOptionalInteger(
  value: unknown,
  fieldName: string,
  bounds: {
    minimum?: number;
    maximum?: number;
  } = {},
): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }

  if (bounds.minimum !== undefined && value < bounds.minimum) {
    throw new ProviderRequestError(400, `${fieldName} must be greater than or equal to ${bounds.minimum}`);
  }

  if (bounds.maximum !== undefined && value > bounds.maximum) {
    throw new ProviderRequestError(400, `${fieldName} must be less than or equal to ${bounds.maximum}`);
  }

  return value;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://app.zenserp.com",
  auth: { type: "api_key_header", name: "apikey" },
});
