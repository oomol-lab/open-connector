import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const podscribeApiBaseUrl = "https://backend.podscribe.ai";
const validationPath = "/api/public/integration-health";

type PodscribePhase = "validate" | "execute";
type PodscribeActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type PodscribeContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

export const podscribeActionHandlers: ProviderActionHandlers<"podscribe", PodscribeActionHandler> = {
  get_integration_health(input, context) {
    if (input.withPixels === true && !optionalString(input.advertiserName)) {
      throw new ProviderRequestError(400, "advertiserName is required when withPixels is true");
    }
    return requestPodscribeJson("POST", validationPath, buildIntegrationHealthBody(input), context, "execute");
  },
  search_episodes(input, context) {
    return requestPodscribeJson("GET", buildSearchEpisodesPath(input), undefined, context, "execute");
  },
  get_show_info(input, context) {
    const id = requiredString(input.id, "id", (message) => new ProviderRequestError(400, message));
    return requestPodscribeJson(
      "GET",
      `/api/public/series/episodes/${encodeURIComponent(id)}`,
      undefined,
      context,
      "execute",
    );
  },
};

export async function validatePodscribeCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestPodscribeJson("POST", validationPath, {}, { apiKey, fetcher, signal }, "validate");
  return {
    profile: {
      displayName: "Podscribe API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: podscribeApiBaseUrl,
      validationEndpoint: validationPath,
      validationMode: "integration_health_probe",
    },
  };
}

function buildIntegrationHealthBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    advertiserName: optionalString(input.advertiserName),
    withPixels: typeof input.withPixels === "boolean" ? input.withPixels : undefined,
  });
}

function buildSearchEpisodesPath(input: Record<string, unknown>): string {
  const url = new URL("/api/public/episode/search", podscribeApiBaseUrl);
  url.searchParams.set(
    "search",
    requiredString(input.search, "search", (message) => new ProviderRequestError(400, message)),
  );
  setOptionalQuery(url, "timeFrame", optionalInteger(input.timeFrame));
  setOptionalQuery(url, "exact", typeof input.exact === "boolean" ? input.exact : undefined);
  setOptionalQuery(url, "transcriptOnly", typeof input.transcriptOnly === "boolean" ? input.transcriptOnly : undefined);
  setOptionalQuery(url, "excludeAds", typeof input.excludeAds === "boolean" ? input.excludeAds : undefined);
  appendArrayQuery(url, "showFilterIds", input.showFilterIds, "number");
  appendArrayQuery(url, "mediaType", input.mediaType, "string");
  return `${url.pathname}${url.search}`;
}

async function requestPodscribeJson(
  method: "GET" | "POST",
  path: string,
  body: Record<string, unknown> | undefined,
  context: PodscribeContext,
  phase: PodscribePhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(new URL(path, podscribeApiBaseUrl), {
      method,
      headers: {
        authorization: `Bearer ${context.apiKey}`,
        accept: "application/json",
        "user-agent": providerUserAgent,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Podscribe request failed: ${error.message}` : "Podscribe request failed",
    );
  }

  if (!response.ok) {
    throw createPodscribeError(response.status, payload, phase);
  }
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createPodscribeError(status: number, payload: unknown, phase: PodscribePhase): ProviderRequestError {
  const message = extractMessage(payload) ?? `Podscribe request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function setOptionalQuery(url: URL, key: string, value: boolean | number | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(key, String(value));
  }
}

function appendArrayQuery(url: URL, key: string, value: unknown, type: "number" | "string"): void {
  const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  for (const item of values) {
    if (type === "number" ? Number.isInteger(item) : typeof item === "string") {
      url.searchParams.append(key, String(item));
    }
  }
}
