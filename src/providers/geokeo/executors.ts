import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";

const service = "geokeo";
const geokeoApiBaseUrl = "https://geokeo.com";
const geokeoValidationQuery = "ZZQXV NO MATCH PLACE 19700101";

type GeokeoActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type GeokeoActionHandler = (input: Record<string, unknown>, context: GeokeoActionContext) => Promise<unknown>;

export const geokeoActionHandlers: ProviderActionHandlers<"geokeo", GeokeoActionHandler> = {
  geocode_forward(input, context) {
    return geokeoRequest(
      "/geocode/v1/search.php",
      compactObject({
        q: readRequiredString(input.q, "q"),
        country: optionalString(input.country),
      }),
      context,
    );
  },

  geocode_reverse(input, context) {
    return geokeoRequest(
      "/geocode/v1/reverse.php",
      {
        lat: readRequiredNumber(input.lat, "lat"),
        lng: readRequiredNumber(input.lng, "lng"),
      },
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, geokeoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = optionalRecord(
      await geokeoRequest(
        "/geocode/v1/search.php",
        {
          q: geokeoValidationQuery,
        },
        {
          apiKey: input.apiKey,
          fetcher,
          signal,
        },
      ),
    );

    const results = Array.isArray(payload?.results) ? payload.results : undefined;
    const status = readGeokeoStatus(payload);

    return {
      profile: {
        accountId: "geokeo-api-key",
        displayName: "Geokeo API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/geocode/v1/search.php",
        apiBaseUrl: geokeoApiBaseUrl,
        validatedQuery: geokeoValidationQuery,
        validatedStatus: status,
        resultCount: results?.length,
      }),
    };
  },
};

async function geokeoRequest(
  path: string,
  query: Record<string, string | number | undefined>,
  context: GeokeoActionContext,
): Promise<unknown> {
  const url = new URL(path, geokeoApiBaseUrl);
  url.searchParams.set("api", context.apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Geokeo request failed: ${error.message}` : "Geokeo request failed",
      error,
    );
  }

  const payloadObject = optionalRecord(payload);
  const status = readGeokeoStatus(payloadObject);
  if (status && !isSuccessfulGeokeoStatus(status)) {
    throw createGeokeoStatusError(status);
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      response.status >= 500 ? 502 : response.status || 502,
      status ? `Geokeo request failed with status ${status}` : "Geokeo request failed",
      payload,
    );
  }

  return payload;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Geokeo returned invalid JSON", text);
  }
}

function isSuccessfulGeokeoStatus(status: string): boolean {
  return status === "ok" || status === "ZERO_RESULTS";
}

function createGeokeoStatusError(status: string): ProviderRequestError {
  if (status === "OVER_QUERY_LIMIT") {
    return new ProviderRequestError(429, status);
  }

  if (status === "INVALID_REQUEST") {
    return new ProviderRequestError(400, status);
  }

  if (status === "ACCESS_DENIED") {
    return new ProviderRequestError(400, status);
  }

  return new ProviderRequestError(502, status);
}

function readGeokeoStatus(payload: Record<string, unknown> | undefined): string | undefined {
  return optionalString(payload?.status);
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be a number`);
  }
  return value;
}
