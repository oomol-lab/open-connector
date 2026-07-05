import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { FiberAiActionName } from "./actions.ts";

import { optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const fiberAiApiBaseUrl = "https://api.fiber.ai";
const fiberAiRequestTimeoutMs = 30_000;
const getOrgCreditsPath = "/v1/get-org-credits";
const getRateLimitsPath = "/v1/rate-limits";

type FiberAiRequestPhase = "validate" | "execute";
type FiberAiEnumType =
  | "accelerators"
  | "flight_regions"
  | "industries"
  | "languages"
  | "metro_areas"
  | "naics_codes"
  | "regions"
  | "skills"
  | "subdivisions"
  | "tags"
  | "technologies"
  | "time_zones";

const fiberAiEnumPathByType: Record<FiberAiEnumType, string> = {
  accelerators: "/v1/enums/accelerators",
  flight_regions: "/v1/enums/flight-regions",
  industries: "/v1/enums/industries",
  languages: "/v1/enums/languages",
  metro_areas: "/v1/enums/metro-areas",
  naics_codes: "/v1/enums/naics-codes",
  regions: "/v1/enums/regions",
  skills: "/v1/enums/skills",
  subdivisions: "/v1/enums/subdivisions",
  tags: "/v1/enums/tags",
  technologies: "/v1/enums/technologies",
  time_zones: "/v1/enums/time-zones",
};

export const fiberAiActionHandlers: Record<FiberAiActionName, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async get_org_credits(_input, context) {
    const payload = await fiberAiGetJson({
      path: getOrgCreditsPath,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return normalizeFiberAiResponse(payload);
  },
  async get_rate_limits(_input, context) {
    const payload = await fiberAiGetJson({
      path: getRateLimitsPath,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return normalizeFiberAiResponse(payload);
  },
  async list_enum_values(input, context) {
    const enumType = readEnumType(input.enumType);
    const payload = await fiberAiGetJson({
      path: fiberAiEnumPathByType[enumType],
      apiKey: context.apiKey,
      query:
        enumType === "subdivisions" ? { countryCode: optionalString(input.countryCode)?.toUpperCase() } : undefined,
      fetcher: context.fetcher,
      phase: "execute",
      signal: context.signal,
    });
    return normalizeFiberAiResponse(payload);
  },
};

export async function validateFiberAiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await fiberAiGetJson({
    path: getOrgCreditsPath,
    apiKey,
    fetcher,
    phase: "validate",
    signal,
  });
  const response = normalizeFiberAiResponse(payload);
  const organizationId = optionalString(response.output.organizationId);
  const availableCredits = optionalNumber(response.output.available);

  return {
    profile: {
      displayName: organizationId ? `Fiber AI ${organizationId}` : "Fiber AI API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: fiberAiApiBaseUrl,
      validationEndpoint: getOrgCreditsPath,
      ...(organizationId ? { organizationId } : {}),
      ...(availableCredits !== undefined ? { availableCredits } : {}),
    },
  };
}

async function fiberAiGetJson(input: {
  path: string;
  apiKey: string;
  query?: Record<string, string | undefined>;
  fetcher: typeof fetch;
  phase: FiberAiRequestPhase;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const url = new URL(input.path, fiberAiApiBaseUrl);
  url.searchParams.set("apiKey", input.apiKey);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.signal, fiberAiRequestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: fiberAiHeaders(),
      signal: timeout.signal,
    });
    payload = await readFiberAiPayload(response);
  } catch (error) {
    if (isAbortLikeError(error) && timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Fiber AI request timed out");
    }
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Fiber AI request failed: ${error.message}` : "Fiber AI request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createFiberAiError(response, payload, input.phase);
  }
  return readPayloadObject(payload, "Fiber AI returned a non-object response");
}

function fiberAiHeaders(): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readFiberAiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Fiber AI returned invalid JSON");
  }
}

function normalizeFiberAiResponse(payload: Record<string, unknown>): {
  output: Record<string, unknown>;
  chargeInfo: Record<string, unknown>;
  warnings: Array<Record<string, unknown>> | null;
  advice: string[];
  raw: Record<string, unknown>;
} {
  return {
    output: readPayloadObject(payload.output, "Fiber AI response is missing output"),
    chargeInfo: readPayloadObject(payload.chargeInfo, "Fiber AI response is missing chargeInfo"),
    warnings: normalizeWarnings(payload.warnings),
    advice: normalizeAdvice(payload.advice),
    raw: payload,
  };
}

function normalizeWarnings(value: unknown): Array<Record<string, unknown>> | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Fiber AI response has invalid warnings", value);
  }
  return value.map((item) => readPayloadObject(item, "Fiber AI response has invalid warnings"));
}

function normalizeAdvice(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Fiber AI response has invalid advice", value);
  }
  return value.map((item) => {
    if (typeof item !== "string") {
      throw new ProviderRequestError(502, "Fiber AI response has invalid advice", value);
    }
    return item;
  });
}

function readPayloadObject(value: unknown, message: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message, value);
  }
  return object;
}

function readEnumType(value: unknown): FiberAiEnumType {
  if (typeof value === "string" && value in fiberAiEnumPathByType) {
    return value as FiberAiEnumType;
  }
  throw new ProviderRequestError(400, "enumType is invalid");
}

function createFiberAiError(response: Response, payload: unknown, phase: FiberAiRequestPhase): ProviderRequestError {
  const message =
    extractFiberAiErrorMessage(payload) ??
    response.statusText ??
    `Fiber AI request failed with HTTP ${response.status}`;
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractFiberAiErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  const nestedError = optionalRecord(object.error);
  return (
    optionalString(object.message) ??
    optionalString(object.error) ??
    optionalString(object.detail) ??
    optionalString(nestedError?.message)
  );
}
