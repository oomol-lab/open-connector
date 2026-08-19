import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import { queryFlag } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "opencage";
const opencageApiBaseUrl = "https://api.opencagedata.com";

type OpencagePhase = "validate" | "execute";
type OpencageActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const opencageActionHandlers: ProviderActionHandlers<"opencage", OpencageActionHandler> = {
  geocode_forward(input, context) {
    return opencageRequest("json", asForwardQuery(input), context, "execute");
  },
  geocode_reverse(input, context) {
    return opencageRequest("json", asReverseQuery(input), context, "execute");
  },
  geocode_geojson(input, context) {
    return opencageRequest("geojson", asGeojsonQuery(input), context, "execute");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, opencageActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = requiredRecord(
      await opencageRequest(
        "json",
        {
          q: "NOWHERE-INTERESTING",
        },
        {
          apiKey: input.apiKey,
          fetcher,
          signal,
        },
        "validate",
      ),
      "OpenCage payload",
      providerError,
    );
    const rate = optionalRecord(payload.rate);

    return {
      profile: {
        accountId: "opencage",
        displayName: "OpenCage API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/geocode/v1/json",
        apiBaseUrl: opencageApiBaseUrl,
        rateLimit: optionalInteger(rate?.limit),
        rateRemaining: optionalInteger(rate?.remaining),
        rateReset: optionalInteger(rate?.reset),
      }),
    };
  },
};

async function opencageRequest(
  format: "json" | "geojson",
  query: Record<string, string | undefined>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: OpencagePhase,
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(buildOpencageUrl(format, query, context.apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `OpenCage request failed: ${error.message}` : "OpenCage request failed",
    );
  }

  const payload = await readJsonPayload(response);
  if (!response.ok) {
    throw createOpencageError(response.status, payload, phase);
  }

  return payload;
}

function buildOpencageUrl(format: "json" | "geojson", query: Record<string, string | undefined>, apiKey: string): URL {
  const url = new URL(`/geocode/v1/${format}`, opencageApiBaseUrl);
  url.searchParams.set("key", apiKey);
  setSearchParams(url, query);
  return url;
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "OpenCage returned invalid JSON");
  }
}

function createOpencageError(status: number, payload: unknown, phase: OpencagePhase): ProviderRequestError {
  const message = extractOpencageMessage(payload) ?? `OpenCage request failed with ${status || 500}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  if (status === 401 && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }

  if (status === 401) {
    return new ProviderRequestError(401, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractOpencageMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const status = optionalRecord(record?.status);
  return optionalString(status?.message) ?? optionalString(record?.message);
}

function asForwardQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    q: readRequiredString(input.q, "q"),
    limit: integerParam(input.limit),
    bounds: optionalString(input.bounds),
    language: optionalString(input.language),
    proximity: optionalString(input.proximity),
    countrycode: optionalString(input.countrycode),
    abbrv: queryFlag(optionalBoolean(input.abbrv)),
    add_request: queryFlag(optionalBoolean(input.add_request)),
    no_annotations: queryFlag(optionalBoolean(input.no_annotations)),
    pretty: queryFlag(optionalBoolean(input.pretty)),
    min_confidence: integerParam(input.min_confidence),
  });
}

function asReverseQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    q: readRequiredString(input.q, "q"),
    language: optionalString(input.language),
    roadinfo: queryFlag(optionalBoolean(input.roadinfo)),
    abbrv: queryFlag(optionalBoolean(input.abbrv)),
    add_request: queryFlag(optionalBoolean(input.add_request)),
    no_annotations: queryFlag(optionalBoolean(input.no_annotations)),
    pretty: queryFlag(optionalBoolean(input.pretty)),
    min_confidence: integerParam(input.min_confidence),
    normalizecity: queryFlag(optionalBoolean(input.normalizecity)),
  });
}

function asGeojsonQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    ...asForwardQuery(input),
    roadinfo: queryFlag(optionalBoolean(input.roadinfo)),
  });
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function integerParam(value: unknown): string | undefined {
  const parsed = optionalInteger(value);
  return parsed === undefined ? undefined : String(parsed);
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
