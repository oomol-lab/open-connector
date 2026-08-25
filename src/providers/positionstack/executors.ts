import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "positionstack";
const positionstackApiBaseUrl = "https://api.positionstack.com/v1";
const positionstackValidationQuery = "1600 Pennsylvania Ave NW, Washington DC";

type PositionstackRequestPhase = "validate" | "execute";

interface PositionstackActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface PositionstackProviderError {
  code?: string;
  message: string;
}

type PositionstackActionHandler = (
  input: Record<string, unknown>,
  context: PositionstackActionContext,
) => Promise<unknown>;

export const positionstackActionHandlers: ProviderActionHandlers<"positionstack", PositionstackActionHandler> = {
  forward_geocode(input, context) {
    return positionstackRequest("/forward", buildQuery(input), context, "execute");
  },
  reverse_geocode(input, context) {
    return positionstackRequest("/reverse", buildQuery(input), context, "execute");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, positionstackActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: positionstackApiBaseUrl,
  auth: {
    type: "api_key_query",
    name: "access_key",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await positionstackRequest(
      "/forward",
      {
        query: positionstackValidationQuery,
        limit: 1,
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const data = optionalRecord(optionalRecord(payload)?.data);
    const results = Array.isArray(data?.results) ? data.results : undefined;
    const firstResult = optionalRecord(results?.[0]);

    return {
      profile: {
        accountId: "api_key",
        displayName: "Positionstack API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/forward",
        apiBaseUrl: positionstackApiBaseUrl,
        validatedQuery: positionstackValidationQuery,
        validatedLabel: optionalString(firstResult?.label),
      }),
    };
  },
};

function buildQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    query: requiredString(input.query, "query", (message) => new ProviderRequestError(400, message)),
    country: optionalString(input.country),
    region: optionalString(input.region),
    language: optionalString(input.language),
    limit: optionalInteger(input.limit),
    fields: readOptionalFields(input.fields),
    country_module: readOptionalModuleFlag(input.country_module),
    sun_module: readOptionalModuleFlag(input.sun_module),
    timezone_module: readOptionalModuleFlag(input.timezone_module),
    bbox_module: readOptionalModuleFlag(input.bbox_module),
  });
}

async function positionstackRequest(
  path: string,
  query: Record<string, string | number | undefined>,
  context: PositionstackActionContext,
  phase: PositionstackRequestPhase,
): Promise<unknown> {
  const url = buildPositionstackUrl(path, query, context.apiKey);

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
    payload = await readPositionstackPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Positionstack request failed: ${error.message}` : "Positionstack request failed",
    );
  }

  const providerError = readPositionstackError(payload);
  if (providerError) {
    throw mapPositionstackError(providerError, phase);
  }
  if (!response.ok) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : response.status || 500,
      `Positionstack request failed with HTTP ${response.status}`,
      payload,
    );
  }

  return payload;
}

function buildPositionstackUrl(path: string, query: Record<string, string | number | undefined>, apiKey: string): URL {
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(relativePath, `${positionstackApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("access_key", apiKey);
  return url;
}

async function readPositionstackPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(response.status === 429 ? 429 : 502, "Positionstack returned empty response body");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : 502,
      error instanceof Error
        ? `Positionstack returned invalid JSON: ${error.message}`
        : "Positionstack returned invalid JSON",
    );
  }
}

function readPositionstackError(payload: unknown): PositionstackProviderError | undefined {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  if (!error) {
    return undefined;
  }

  return {
    code: optionalString(error.code),
    message: optionalString(error.message) ?? "Positionstack request failed",
  };
}

function mapPositionstackError(
  error: PositionstackProviderError,
  phase: PositionstackRequestPhase,
): ProviderRequestError {
  if (error.code === "usage_limit_reached" || error.code === "rate_limit_reached") {
    return new ProviderRequestError(429, error.message);
  }

  if (error.code === "invalid_access_key" || error.code === "missing_access_key") {
    return phase === "validate"
      ? new ProviderRequestError(400, error.message)
      : new ProviderRequestError(401, error.message);
  }

  if (error.code === "validation_error") {
    return new ProviderRequestError(400, error.message);
  }

  return new ProviderRequestError(502, error.message);
}

function readOptionalFields(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const fields = value.map((item) => String(item).trim()).filter(Boolean);
  return fields.length > 0 ? fields.join(",") : undefined;
}

function readOptionalModuleFlag(value: unknown): number | undefined {
  return typeof value === "boolean" ? (value ? 1 : 0) : undefined;
}
