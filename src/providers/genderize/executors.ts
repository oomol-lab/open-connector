import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, stringArray } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "genderize";
const genderizeApiBaseUrl = "https://api.genderize.io";
const genderizeValidationName = "peter";

type GenderizeRequestPhase = "validate" | "execute";
type GenderizeActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type GenderizeActionHandler = (input: Record<string, unknown>, context: GenderizeActionContext) => Promise<unknown>;

export const genderizeActionHandlers: ProviderActionHandlers<"genderize", GenderizeActionHandler> = {
  async predict_gender(input, context) {
    const { payload } = await requestGenderize({
      context,
      phase: "execute",
      name: optionalString(input.name),
      country_id: optionalString(input.country_id),
    });

    return normalizeGenderizePrediction(payload, "predict_gender");
  },

  async predict_gender_batch(input, context) {
    const requestedNames = stringArray(input.names, "names", (message) => new ProviderRequestError(400, message));
    const { payload } = await requestGenderize({
      context,
      phase: "execute",
      names: requestedNames,
      country_id: optionalString(input.country_id),
    });
    const predictions = normalizeGenderizePredictionArray(payload, "predict_gender_batch");
    if (predictions.length !== requestedNames.length) {
      throw new ProviderRequestError(
        502,
        `genderize response for predict_gender_batch returned ${predictions.length} predictions for ${requestedNames.length} names`,
        payload,
      );
    }

    return {
      predictions,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, genderizeActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const { response, payload } = await requestGenderize({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
      name: genderizeValidationName,
    });
    const prediction = normalizeGenderizePrediction(payload, "validateCredential");

    return {
      profile: {
        accountId: "genderize-api-key",
        displayName: "Genderize API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: genderizeApiBaseUrl,
        validationName: genderizeValidationName,
        validationEndpoint: "/",
        rateLimitLimit: readIntegerHeader(response.headers, "x-rate-limit-limit"),
        rateLimitRemaining: readIntegerHeader(response.headers, "x-rate-limit-remaining"),
        rateLimitResetSeconds: readIntegerHeader(response.headers, "x-rate-limit-reset"),
        sampleCount: prediction.count,
        sampleGender: prediction.gender,
        sampleProbability: prediction.probability,
      }),
    };
  },
};

async function requestGenderize(input: {
  context: GenderizeActionContext;
  phase: GenderizeRequestPhase;
  name?: string;
  names?: string[];
  country_id?: string;
}): Promise<{ response: Response; payload: unknown }> {
  const url = new URL(genderizeApiBaseUrl);
  url.searchParams.set("apikey", input.context.apiKey);
  if (input.name) {
    url.searchParams.set("name", input.name);
  }
  for (const name of input.names ?? []) {
    if (name) {
      url.searchParams.append("name[]", name);
    }
  }
  if (input.country_id) {
    url.searchParams.set("country_id", input.country_id);
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
    payload = await readGenderizePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Genderize request failed: ${error.message}` : "Genderize request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createGenderizeError(response, payload, input.phase);
  }

  return {
    response,
    payload,
  };
}

async function readGenderizePayload(response: Response): Promise<unknown> {
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

function createGenderizeError(
  response: Response,
  payload: unknown,
  phase: GenderizeRequestPhase,
): ProviderRequestError {
  const message =
    extractGenderizeErrorMessage(payload) ?? response.statusText ?? `genderize request failed with ${response.status}`;

  if (response.status === 402 || response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && response.status === 401) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }

  if (response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function extractGenderizeErrorMessage(payload: unknown): string | undefined {
  return optionalString(optionalRecord(payload)?.error);
}

function normalizeGenderizePrediction(payload: unknown, endpoint: string): Record<string, unknown> {
  const record = requireGenderizeObject(payload, endpoint);
  const name = optionalString(record.name);
  const probability = optionalNumber(record.probability);
  const count = optionalNumber(record.count);
  const gender = readGenderizeGender(record.gender);

  if (!name) {
    throw new ProviderRequestError(502, `genderize response for ${endpoint} is missing name`, payload);
  }
  if (typeof probability !== "number" || !Number.isFinite(probability)) {
    throw new ProviderRequestError(502, `genderize response for ${endpoint} is missing probability`, payload);
  }
  if (!Number.isInteger(count)) {
    throw new ProviderRequestError(502, `genderize response for ${endpoint} is missing count`, payload);
  }
  if (gender === undefined) {
    throw new ProviderRequestError(502, `genderize response for ${endpoint} has unsupported gender value`, payload);
  }

  return compactObject({
    name,
    gender,
    probability,
    count,
    country_id: optionalString(record.country_id),
  });
}

function normalizeGenderizePredictionArray(payload: unknown, endpoint: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `genderize response for ${endpoint} was not an array`, payload);
  }

  return payload.map((item, index) => normalizeGenderizePrediction(item, `${endpoint}[${index}]`));
}

function requireGenderizeObject(payload: unknown, endpoint: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `genderize response for ${endpoint} was not a JSON object`, payload);
  }
  return record;
}

function readGenderizeGender(value: unknown): "male" | "female" | null | undefined {
  if (value === null) {
    return null;
  }

  if (value === "male" || value === "female") {
    return value;
  }

  return undefined;
}

function readIntegerHeader(headers: Headers, key: string): number | undefined {
  const value = headers.get(key);
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}
