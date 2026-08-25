import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, objectArray, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const microsoftClarityApiBaseUrl = "https://www.clarity.ms";
const microsoftClarityExportPath = "/export-data/api/v1/project-live-insights";
const microsoftClarityValidationCacheTtlMs = 60_000;

type MicrosoftClarityRequestPhase = "validate" | "execute";
type MicrosoftClarityActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type MicrosoftClarityActionHandler = (
  input: Record<string, unknown>,
  context: MicrosoftClarityActionContext,
) => Promise<unknown>;

const validationCache = new Map<string, number>();

export const microsoftClarityActionHandlers: ProviderActionHandlers<
  "microsoft_clarity",
  MicrosoftClarityActionHandler
> = {
  export_live_insights(input, context) {
    return exportLiveInsights(input, context);
  },
};

export async function validateMicrosoftClarityCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const normalizedApiKey = requiredInputString(apiKey, "apiKey");
  if (!isValidationCached(normalizedApiKey)) {
    await requestMicrosoftClarity({
      apiKey: normalizedApiKey,
      fetcher,
      signal,
      phase: "validate",
      query: {
        numOfDays: "1",
      },
    });
    cacheValidation(normalizedApiKey);
  }

  return {
    profile: {
      accountId: "microsoft_clarity",
      displayName: "Microsoft Clarity API Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: microsoftClarityApiBaseUrl,
      validationEndpoint: microsoftClarityExportPath,
      authScheme: "bearer",
      maxNumOfDays: 3,
      maxDimensions: 3,
      dailyRequestLimit: 10,
    },
  };
}

export function clearMicrosoftClarityValidationCache(): void {
  validationCache.clear();
}

async function exportLiveInsights(
  input: Record<string, unknown>,
  context: MicrosoftClarityActionContext,
): Promise<unknown> {
  const payload = await requestMicrosoftClarity({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: buildExportQuery(input),
  });

  return {
    insights: readInsights(payload),
  };
}

function buildExportQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  validateDimensionOrder(input);
  return compactObject({
    numOfDays: readNumOfDays(input.numOfDays),
    dimension1: optionalString(input.dimension1),
    dimension2: optionalString(input.dimension2),
    dimension3: optionalString(input.dimension3),
  });
}

async function requestMicrosoftClarity(input: {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  phase: MicrosoftClarityRequestPhase;
  query: Record<string, string | undefined>;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;

  try {
    response = await input.fetcher(buildMicrosoftClarityUrl(input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
    payload = await readMicrosoftClarityPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Microsoft Clarity request failed: ${error.message}`
        : "Microsoft Clarity request failed",
    );
  }

  if (!response.ok) {
    throw buildMicrosoftClarityError(response.status, payload, input.phase);
  }

  return payload;
}

function buildMicrosoftClarityUrl(query: Record<string, string | undefined>): URL {
  const url = new URL(microsoftClarityExportPath, microsoftClarityApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readMicrosoftClarityPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isValidationCached(apiKey: string): boolean {
  const expiresAt = validationCache.get(apiKey);
  if (!expiresAt) {
    return false;
  }
  if (expiresAt > Date.now()) {
    return true;
  }
  validationCache.delete(apiKey);
  return false;
}

function cacheValidation(apiKey: string): void {
  validationCache.set(apiKey, Date.now() + microsoftClarityValidationCacheTtlMs);
}

function buildMicrosoftClarityError(
  status: number,
  payload: unknown,
  phase: MicrosoftClarityRequestPhase,
): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Microsoft Clarity request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = safeRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.detail);
}

function readInsights(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "microsoft_clarity response must be an array of insight groups");
  }

  return objectArray(payload, "insights", (message) => new ProviderRequestError(502, message));
}

function validateDimensionOrder(input: Record<string, unknown>): void {
  const dimensions = [
    ["dimension1", optionalString(input.dimension1)],
    ["dimension2", optionalString(input.dimension2)],
    ["dimension3", optionalString(input.dimension3)],
  ] as const;

  if (dimensions[1][1] && !dimensions[0][1]) {
    throw new ProviderRequestError(400, "dimension2 requires dimension1.");
  }
  if (dimensions[2][1] && !dimensions[1][1]) {
    throw new ProviderRequestError(400, "dimension3 requires dimension2.");
  }

  const seen = new Set<string>();
  for (const [key, value] of dimensions) {
    if (!value) {
      continue;
    }
    if (seen.has(value)) {
      throw new ProviderRequestError(400, `${key} duplicates another dimension.`);
    }
    seen.add(value);
  }
}

function readNumOfDays(value: unknown): string {
  if (value === 1 || value === 2 || value === 3) {
    return String(value);
  }

  throw new ProviderRequestError(400, "numOfDays must be 1, 2, or 3");
}

function safeRecord(value: unknown): Record<string, unknown> | undefined {
  try {
    return requiredRecord(value, "payload");
  } catch {
    return undefined;
  }
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
