import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { What3wordsActionName } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const what3wordsApiBaseUrl = "https://api.what3words.com/v3";
const validationWords = "filled.count.soap";

type What3wordsPhase = "validate" | "execute";
type What3wordsQueryValue = string | number | boolean | undefined;
type What3wordsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const what3wordsActionHandlers: Record<What3wordsActionName, What3wordsActionHandler> = {
  convert_to_coordinates(input, context) {
    return what3wordsGet("/convert-to-coordinates", buildConvertToCoordinatesQuery(input), context);
  },
  convert_to_3wa(input, context) {
    return what3wordsGet("/convert-to-3wa", buildConvertTo3waQuery(input), context);
  },
  autosuggest(input, context) {
    return what3wordsGet("/autosuggest", buildAutosuggestQuery(input), context);
  },
  grid_section(input, context) {
    return what3wordsGet("/grid-section", buildGridSectionQuery(input), context);
  },
  available_languages(_input, context) {
    return what3wordsGet("/available-languages", {}, context);
  },
};

export async function validateWhat3wordsCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await what3wordsGet(
    "/convert-to-coordinates",
    { words: validationWords },
    { apiKey, fetcher, signal },
    "validate",
  );
  return {
    profile: {
      accountId: "what3words-api-key",
      displayName: "what3words API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/convert-to-coordinates",
      apiBaseUrl: what3wordsApiBaseUrl,
      validatedWords: readStringField(payload, "words") ?? validationWords,
      validatedNearestPlace: readStringField(payload, "nearestPlace"),
    },
  };
}

async function what3wordsGet(
  path: string,
  query: Record<string, What3wordsQueryValue>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: What3wordsPhase = "execute",
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(buildWhat3wordsUrl(path, query, context.apiKey), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: context.signal,
    });
    payload = await readWhat3wordsPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `what3words request failed: ${error.message}` : "what3words request failed",
    );
  }
  if (!response.ok) throw createWhat3wordsError(response, payload, phase);
  return payload;
}

function buildWhat3wordsUrl(path: string, query: Record<string, What3wordsQueryValue>, apiKey: string): URL {
  const url = new URL(`${what3wordsApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  url.searchParams.set("key", apiKey);
  return url;
}

async function readWhat3wordsPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createWhat3wordsError(response: Response, payload: unknown, phase: What3wordsPhase): ProviderRequestError {
  const message = extractWhat3wordsErrorMessage(payload) || response.statusText || "what3words request failed";
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(409, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractWhat3wordsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const error = optionalRecord(record.error);
  if (error) return readStringField(error, "message") ?? readStringField(error, "code");
  return readStringField(record, "message") ?? readStringField(record, "error");
}

function buildConvertToCoordinatesQuery(input: Record<string, unknown>): Record<string, What3wordsQueryValue> {
  return {
    words: requireString(input.words, "words"),
    ...pickQuery(input, ["format", "locale"]),
  };
}

function buildConvertTo3waQuery(input: Record<string, unknown>): Record<string, What3wordsQueryValue> {
  return {
    coordinates: `${input.lat},${input.lng}`,
    ...pickQuery(input, ["language", "format"]),
  };
}

function buildAutosuggestQuery(input: Record<string, unknown>): Record<string, What3wordsQueryValue> {
  if ((input.focusLat === undefined) !== (input.focusLng === undefined)) {
    throw new ProviderRequestError(400, "focusLat and focusLng must be provided together");
  }
  const query: Record<string, What3wordsQueryValue> = {
    input: requireString(input.input, "input"),
    ...pickQuery(input, [
      "language",
      "locale",
      "nResults",
      "nFocusResults",
      "clipToCountry",
      "clipToCircle",
      "clipToBoundingBox",
      "clipToPolygon",
      "inputType",
      "preferLand",
    ]),
  };
  if (input.focusLat !== undefined && input.focusLng !== undefined) {
    query.focus = `${input.focusLat},${input.focusLng}`;
  }
  return query;
}

function buildGridSectionQuery(input: Record<string, unknown>): Record<string, What3wordsQueryValue> {
  return {
    "bounding-box": `${input.southwestLat},${input.southwestLng},${input.northeastLat},${input.northeastLng}`,
    ...pickQuery(input, ["format"]),
  };
}

function pickQuery(input: Record<string, unknown>, keys: readonly string[]): Record<string, What3wordsQueryValue> {
  const query: Record<string, What3wordsQueryValue> = {};
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      query[key] = typeof value === "string" ? optionalString(value) : value;
    }
  }
  return query;
}

function readStringField(value: unknown, field: string): string | undefined {
  return optionalString(optionalRecord(value)?.[field]);
}

function requireString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) throw new ProviderRequestError(400, `${fieldName} is required`);
  return text;
}
