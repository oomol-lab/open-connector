import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "serpapi";
const serpapiBaseUrl = "https://serpapi.com";

type SerpapiPhase = "validate" | "execute";
type SerpapiQueryValue = string | number | boolean | undefined;
type SerpapiActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const serpapiActionHandlers: ProviderActionHandlers<"serpapi", SerpapiActionHandler> = {
  async google_search(input, context) {
    const payload = requirePayloadRecord(
      await requestSerpApiJson(
        compactObject({
          engine: "google",
          q: requiredInputString(input.q, "q"),
          location: optionalString(input.location),
          hl: optionalString(input.hl),
          gl: optionalString(input.gl),
          start: optionalNumber(input.start),
          num: optionalNumber(input.num),
          safe: optionalString(input.safe),
        }),
        context,
        "execute",
      ),
    );

    return compactObject({
      search_metadata: requirePayloadRecord(payload.search_metadata ?? {}),
      search_parameters: requirePayloadRecord(payload.search_parameters ?? {}),
      search_information: requirePayloadRecord(payload.search_information ?? {}),
      organic_results: asArrayOfObjects(payload.organic_results),
      knowledge_graph: optionalRecord(payload.knowledge_graph),
      related_questions: asOptionalArrayOfObjects(payload.related_questions),
      related_searches: asOptionalArrayOfObjects(payload.related_searches),
      top_stories: asOptionalArrayOfObjects(payload.top_stories),
    });
  },
  async google_news_search(input, context) {
    const payload = requirePayloadRecord(
      await requestSerpApiJson(
        compactObject({
          engine: "google_news",
          q: requiredInputString(input.q, "q"),
          hl: optionalString(input.hl),
          gl: optionalString(input.gl),
          start: optionalNumber(input.start),
          so: optionalString(input.so),
        }),
        context,
        "execute",
      ),
    );

    return compactObject({
      search_metadata: requirePayloadRecord(payload.search_metadata ?? {}),
      search_parameters: requirePayloadRecord(payload.search_parameters ?? {}),
      search_information: requirePayloadRecord(payload.search_information ?? {}),
      news_results: asArrayOfObjects(payload.news_results),
      stories: asOptionalArrayOfObjects(payload.stories),
      pagination: optionalRecord(payload.pagination),
    });
  },
  async google_maps_search(input, context) {
    const payload = requirePayloadRecord(
      await requestSerpApiJson(
        compactObject({
          engine: "google_maps",
          q: requiredInputString(input.q, "q"),
          ll: optionalString(input.ll),
          hl: optionalString(input.hl),
          gl: optionalString(input.gl),
          start: optionalNumber(input.start),
        }),
        context,
        "execute",
      ),
    );

    return compactObject({
      search_metadata: requirePayloadRecord(payload.search_metadata ?? {}),
      search_parameters: requirePayloadRecord(payload.search_parameters ?? {}),
      search_information: requirePayloadRecord(payload.search_information ?? {}),
      local_results: asArrayOfObjects(payload.local_results),
      place_results: optionalRecord(payload.place_results),
      pagination: optionalRecord(payload.pagination),
    });
  },
};

export async function validateSerpapiCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestSerpApiJson(
    {
      engine: "google",
      q: "coffee",
      num: 1,
    },
    {
      apiKey,
      fetcher,
      signal,
    },
    "validate",
  );

  return {
    profile: {
      accountId: "api_key",
      displayName: "SerpApi API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/search.json",
      validationEngine: "google",
      validationQuery: "coffee",
    },
  };
}

async function requestSerpApiJson(
  query: Record<string, SerpapiQueryValue>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: SerpapiPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;

  try {
    response = await context.fetcher(buildSerpApiUrl(query, context.apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
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
      error instanceof Error ? `SerpApi request failed: ${error.message}` : "SerpApi request failed",
    );
  }

  if (!response.ok) {
    throw createSerpApiError(response.status, payload, phase);
  }

  const payloadObject = optionalRecord(payload);
  const metadata = optionalRecord(payloadObject?.search_metadata);
  if (metadata?.status === "Error" || payloadObject?.error) {
    throw createSerpApiError(response.status || 502, payload, phase);
  }

  return payload;
}

function buildSerpApiUrl(query: Record<string, SerpapiQueryValue>, apiKey: string): string {
  const url = new URL("/search.json", serpapiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("api_key", apiKey);
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
    throw new ProviderRequestError(502, "SerpApi returned invalid JSON");
  }
}

function createSerpApiError(status: number, payload: unknown, phase: SerpapiPhase): ProviderRequestError {
  const message = extractSerpApiMessage(payload) ?? `SerpApi request failed with ${status || 500}`;
  if (status === 400 || ((status === 401 || status === 403) && phase === "validate") || status === 403) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractSerpApiMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message);
}

function requirePayloadRecord(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "SerpApi response", (message) => new ProviderRequestError(502, message));
}

function asArrayOfObjects(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => requirePayloadRecord(item)) : [];
}

function asOptionalArrayOfObjects(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value) ? value.map((item) => requirePayloadRecord(item)) : undefined;
}

export const serpapiExecutors: ProviderExecutors = defineApiKeyProviderExecutors(service, serpapiActionHandlers);
