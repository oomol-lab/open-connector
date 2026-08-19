import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "zipcodebase";
const zipcodebaseApiBaseUrl = "https://app.zipcodebase.com/api/v1";

type ZipcodebaseRequestPhase = "validate" | "execute";
type ZipcodebaseQueryValue = string | number | undefined;
type ZipcodebaseActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type ZipcodebaseActionHandler = (input: Record<string, unknown>, context: ZipcodebaseActionContext) => Promise<unknown>;

export const zipcodebaseActionHandlers: ProviderActionHandlers<"zipcodebase", ZipcodebaseActionHandler> = {
  get_status(_input, context) {
    return requestZipcodebaseJson("/status", {}, context, "execute");
  },
  search_postal_codes(input, context) {
    return requestZipcodebaseJson(
      "/search",
      {
        codes: readStringList(input.codes, "codes").join(","),
        country: optionalString(input.country),
      },
      context,
      "execute",
    );
  },
  calculate_distance(input, context) {
    return requestZipcodebaseJson(
      "/distance",
      {
        code: requiredString(input.code, "code", badInput),
        compare: readStringList(input.compare, "compare").join(","),
        country: requiredString(input.country, "country", badInput),
        unit: optionalString(input.unit),
      },
      context,
      "execute",
    );
  },
  list_postal_codes_within_radius(input, context) {
    return requestZipcodebaseJson(
      "/radius",
      {
        code: requiredString(input.code, "code", badInput),
        radius: requiredNumber(input.radius, "radius"),
        country: requiredString(input.country, "country", badInput),
        unit: optionalString(input.unit),
      },
      context,
      "execute",
    );
  },
  match_postal_codes_by_distance(input, context) {
    return requestZipcodebaseJson(
      "/match",
      {
        codes: readStringList(input.codes, "codes").join(","),
        distance: requiredNumber(input.distance, "distance"),
        country: requiredString(input.country, "country", badInput),
        unit: optionalString(input.unit),
      },
      context,
      "execute",
    );
  },
  list_postal_codes_by_city(input, context) {
    return requestZipcodebaseJson(
      "/code/city",
      {
        city: requiredString(input.city, "city", badInput),
        country: requiredString(input.country, "country", badInput),
        state_name: optionalString(input.state_name),
      },
      context,
      "execute",
    );
  },
  list_postal_codes_by_state(input, context) {
    return requestZipcodebaseJson(
      "/code/state",
      {
        state_name: requiredString(input.state_name, "state_name", badInput),
        country: requiredString(input.country, "country", badInput),
      },
      context,
      "execute",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, zipcodebaseActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestZipcodebaseJson(
      "/status",
      {},
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const record = optionalRecord(payload);

    return {
      profile: {
        accountId: "zipcodebase",
        displayName: "Zipcodebase API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: zipcodebaseApiBaseUrl,
        validationEndpoint: "/status",
        requestsRemaining: record?.requests_remaining,
      }),
    };
  },
};

async function requestZipcodebaseJson(
  path: string,
  query: Record<string, ZipcodebaseQueryValue>,
  context: ZipcodebaseActionContext,
  phase: ZipcodebaseRequestPhase,
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(buildZipcodebaseUrl(path, query), {
      method: "GET",
      headers: {
        accept: "application/json",
        apikey: context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `zipcodebase request failed: ${error.message}` : "zipcodebase request failed",
    );
  }

  const payload = await readZipcodebasePayload(response);
  const providerError = readZipcodebaseError(payload);
  if (providerError) {
    throw createZipcodebaseError(providerError, phase);
  }
  if (!response.ok) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : response.status || 502,
      `zipcodebase request failed with HTTP ${response.status}`,
      payload,
    );
  }

  return payload;
}

function buildZipcodebaseUrl(path: string, query: Record<string, ZipcodebaseQueryValue>): URL {
  const url = new URL(path, `${zipcodebaseApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function readStringList(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => String(item).trim()).filter((item) => item);
}

function requiredNumber(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed !== undefined) {
    return parsed;
  }
  throw badInput(`${fieldName} must be a number`);
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

async function readZipcodebasePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(response.status === 429 ? 429 : 502, "zipcodebase returned empty response body");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : 502,
      error instanceof Error
        ? `zipcodebase returned invalid JSON: ${error.message}`
        : "zipcodebase returned invalid JSON",
    );
  }
}

interface ZipcodebaseProviderError {
  code?: number;
  type?: string;
  info: string;
}

function readZipcodebaseError(payload: unknown): ZipcodebaseProviderError | null {
  const record = optionalRecord(payload);
  if (!record) {
    return null;
  }

  if (record.success !== false && record.error === undefined) {
    return null;
  }

  const error = record.error;
  if (typeof error === "string") {
    return {
      info: error,
    };
  }

  const errorRecord = optionalRecord(error);
  if (!errorRecord) {
    return {
      info: optionalString(record.message) ?? "zipcodebase request failed",
    };
  }

  return {
    code: typeof errorRecord.code === "number" ? errorRecord.code : undefined,
    type: optionalString(errorRecord.type),
    info: optionalString(errorRecord.info) ?? optionalString(errorRecord.message) ?? "zipcodebase request failed",
  };
}

function createZipcodebaseError(error: ZipcodebaseProviderError, phase: ZipcodebaseRequestPhase): ProviderRequestError {
  if (error.code === 104 || error.type === "usage_limit_reached") {
    return new ProviderRequestError(429, error.info, error);
  }
  if (phase === "validate" && (error.code === 101 || error.type === "invalid_access_key")) {
    return new ProviderRequestError(400, error.info, error);
  }
  if (phase === "execute" && (error.code === 101 || error.type === "invalid_access_key")) {
    return new ProviderRequestError(401, error.info, error);
  }
  if (
    error.code === 102 ||
    error.code === 103 ||
    error.code === 105 ||
    error.type === "invalid_api_function" ||
    error.type === "invalid_api_function_access" ||
    error.type === "function_access_restricted"
  ) {
    return new ProviderRequestError(400, error.info, error);
  }
  return new ProviderRequestError(502, error.info, error);
}
