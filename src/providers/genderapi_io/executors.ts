import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "genderapi_io";
const genderapiIoApiBaseUrl = "https://api.genderapi.io";
const genderapiIoValidationName = "Alice";

type GenderapiIoPhase = "validate" | "execute";
type GenderapiIoActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type GenderapiIoActionHandler = (input: Record<string, unknown>, context: GenderapiIoActionContext) => Promise<unknown>;

interface GenderapiIoNormalizedPrediction {
  status: true;
  q: string;
  name?: string;
  gender?: "male" | "female" | null;
  country?: string;
  probability: number;
  total_names: number;
  used_credits: number;
  remaining_credits: number;
  expires: number;
  duration: string;
}

export const genderapiIoActionHandlers: ProviderActionHandlers<"genderapi_io", GenderapiIoActionHandler> = {
  async get_gender_by_first_name(input, context) {
    const payload = await requestGenderapiIo(
      "/api",
      compactObject({
        name: readInputString(input.firstName, "firstName"),
        country: optionalString(input.country),
        askToAI: optionalBoolean(input.askToAI),
        forceToGenderize: optionalBoolean(input.forceToGenderize),
      }),
      context,
      "execute",
    );

    return normalizeGenderapiIoPrediction(payload, "get_gender_by_first_name");
  },

  async get_gender_by_email_address(input, context) {
    const payload = await requestGenderapiIo(
      "/api/email",
      compactObject({
        email: readInputString(input.emailAddress, "emailAddress"),
        country: optionalString(input.country),
        askToAI: optionalBoolean(input.askToAI),
      }),
      context,
      "execute",
    );

    return normalizeGenderapiIoPrediction(payload, "get_gender_by_email_address");
  },

  async get_gender_by_username(input, context) {
    const payload = await requestGenderapiIo(
      "/api/username",
      compactObject({
        username: readInputString(input.username, "username"),
        country: optionalString(input.country),
        askToAI: optionalBoolean(input.askToAI),
        forceToGenderize: optionalBoolean(input.forceToGenderize),
      }),
      context,
      "execute",
    );

    return normalizeGenderapiIoPrediction(payload, "get_gender_by_username");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, genderapiIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestGenderapiIo(
      "/api",
      { name: genderapiIoValidationName },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );
    const prediction = normalizeGenderapiIoPrediction(payload, "validateCredential");

    return {
      profile: {
        accountId: "genderapi-io-api-key",
        displayName: "GenderAPI.io API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: genderapiIoApiBaseUrl,
        validationEndpoint: "/api",
        validationName: genderapiIoValidationName,
        usedCredits: prediction.used_credits,
        remainingCredits: prediction.remaining_credits,
        expires: prediction.expires,
        sampleGender: prediction.gender ?? undefined,
        sampleProbability: prediction.probability,
        sampleCountry: prediction.country,
      }),
    };
  },
};

async function requestGenderapiIo(
  path: string,
  query: Record<string, string | boolean | undefined>,
  context: GenderapiIoActionContext,
  phase: GenderapiIoPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(buildGenderapiIoUrl(path, query, context.apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readGenderapiIoPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `GenderAPI.io request failed: ${error.message}` : "GenderAPI.io request failed",
      error,
    );
  }

  if (!response.ok || isGenderapiIoErrorPayload(payload)) {
    throw createGenderapiIoError(response.status, payload, phase);
  }

  return payload;
}

function buildGenderapiIoUrl(
  path: string,
  query: Record<string, string | boolean | undefined>,
  apiKey: string,
): string {
  const url = new URL(path, genderapiIoApiBaseUrl);
  url.searchParams.set("key", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readGenderapiIoPayload(response: Response): Promise<unknown> {
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

function isGenderapiIoErrorPayload(payload: unknown): boolean {
  return optionalRecord(payload)?.status === false;
}

function createGenderapiIoError(status: number, payload: unknown, phase: GenderapiIoPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const errno = readOptionalInteger(record?.errno);
  const message = optionalString(record?.errmsg) ?? `GenderAPI.io request failed with ${status || 500}`;
  const normalizedMessage = message.toLowerCase();

  if (
    errno === 94 ||
    normalizedMessage.includes("invalid or missing key") ||
    normalizedMessage.includes("invalid key")
  ) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  if (
    errno === 91 ||
    normalizedMessage.includes("not set") ||
    normalizedMessage.includes("invalid email") ||
    normalizedMessage.includes("invalid country")
  ) {
    return new ProviderRequestError(400, message, payload);
  }

  if (status === 402 || status === 429 || normalizedMessage.includes("credit") || normalizedMessage.includes("limit")) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function normalizeGenderapiIoPrediction(payload: unknown, actionName: string): GenderapiIoNormalizedPrediction {
  const record = requireObject(payload, actionName);
  const q = readRequiredString(record.q, "q");
  const probability = readRequiredInteger(record.probability, "probability");
  const totalNames = readRequiredInteger(record.total_names, "total_names");
  const usedCredits = readRequiredInteger(record.used_credits, "used_credits");
  const remainingCredits = readRequiredInteger(record.remaining_credits, "remaining_credits");
  const expires = readRequiredInteger(record.expires, "expires");
  const duration = readRequiredString(record.duration, "duration");
  const name = optionalString(record.name);
  const gender = readGender(record.gender);
  const country = optionalString(record.country);

  const output: GenderapiIoNormalizedPrediction = {
    status: true,
    q,
    probability,
    total_names: totalNames,
    used_credits: usedCredits,
    remaining_credits: remainingCredits,
    expires,
    duration,
  };
  if (name) output.name = name;
  if (gender !== undefined) output.gender = gender;
  if (country) output.country = country;
  return output;
}

function requireObject(payload: unknown, actionName: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `GenderAPI.io response for ${actionName} is not an object`, payload);
  }
  return record;
}

function readInputString(value: unknown, key: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return stringValue;
}

function readRequiredString(value: unknown, key: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `GenderAPI.io response is missing ${key}`);
  }
  return stringValue;
}

function readRequiredInteger(value: unknown, key: string): number {
  const numberValue = optionalNumber(value);
  if (numberValue === undefined || !Number.isInteger(numberValue)) {
    throw new ProviderRequestError(502, `GenderAPI.io response is missing ${key}`, value);
  }
  return numberValue;
}

function readOptionalInteger(value: unknown): number | undefined {
  const numberValue = optionalNumber(value);
  return numberValue !== undefined && Number.isInteger(numberValue) ? numberValue : undefined;
}

function readGender(value: unknown): "male" | "female" | null | undefined {
  if (value === null) {
    return null;
  }
  if (value === "male" || value === "female") {
    return value;
  }
  return undefined;
}
