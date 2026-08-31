import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "postgrid_verify";
const postgridVerifyApiBaseUrl = "https://api.postgrid.com/v1/addver";
const postgridVerifyValidationEndpoint = "/zip_codes";

type PostgridVerifyPhase = "validate" | "execute";
type PostgridVerifyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const postgridVerifyActionHandlers: ProviderActionHandlers<"postgrid_verify", PostgridVerifyActionHandler> = {
  verify_address(input, context) {
    return requestPostgridVerifyJson({
      path: "/verifications",
      query: {
        includeDetails: optionalBooleanString(input.includeDetails),
        geocode: optionalBooleanString(input.geocode),
        properCase: optionalBooleanString(input.properCase),
      },
      body: compactObject({
        address: optionalString(input.address),
        line1: optionalString(input.line1),
        line2: optionalString(input.line2),
        city: optionalString(input.city),
        provinceOrState: optionalString(input.provinceOrState),
        postalOrZip: optionalString(input.postalOrZip),
        country: optionalString(input.country),
      }),
      context,
      phase: "execute",
    });
  },
  autocomplete_address(input, context) {
    return requestPostgridVerifyJson({
      path: "/completions",
      body: compactObject({
        partialStreet: requiredInputString(input.partialStreet, "partialStreet"),
        index: optionalString(input.index),
        pcFilter: optionalString(input.pcFilter),
        cityFilter: optionalString(input.cityFilter),
        stateFilter: optionalString(input.stateFilter),
        countryFilter: optionalString(input.countryFilter),
      }),
      context,
      phase: "execute",
    });
  },
  parse_address(input, context) {
    return requestPostgridVerifyJson({
      path: "/parses",
      body: {
        address: requiredInputString(input.address, "address"),
      },
      context,
      phase: "execute",
    });
  },
  lookup_city_state_from_postal(input, context) {
    return requestPostgridVerifyJson({
      path: postgridVerifyValidationEndpoint,
      body: {
        postalOrZip: requiredInputString(input.postalOrZip, "postalOrZip"),
      },
      context,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, postgridVerifyActionHandlers);

export async function validatePostgridVerifyCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context: ApiKeyProviderContext = {
    apiKey: requiredInputString(input.apiKey, "apiKey"),
    fetcher,
    signal,
  };
  const payload = await requestPostgridVerifyJson({
    path: postgridVerifyValidationEndpoint,
    body: {
      postalOrZip: "10001",
    },
    context,
    phase: "validate",
  });

  return {
    profile: {
      accountId: "postgrid-verify-api-key",
      displayName: "PostGrid Verify API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: postgridVerifyApiBaseUrl,
      validationEndpoint: postgridVerifyValidationEndpoint,
      status: optionalString(payload.status),
      message: optionalString(payload.message),
    }),
  };
}

interface PostgridVerifyRequest {
  path: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  context: ApiKeyProviderContext;
  phase: PostgridVerifyPhase;
}

async function requestPostgridVerifyJson(input: PostgridVerifyRequest): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await input.context.fetcher(buildPostgridVerifyUrl(input.path, input.query ?? {}), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.context.apiKey,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `PostGrid Verify request failed: ${error.message}` : "PostGrid Verify request failed",
    );
  }

  const payload = await readPostgridVerifyPayload(response);
  if (!response.ok) {
    throw createPostgridVerifyError(response.status, payload, input.phase);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "PostGrid Verify returned an invalid payload");
  }
  return record;
}

function buildPostgridVerifyUrl(path: string, query: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${postgridVerifyApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readPostgridVerifyPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "PostGrid Verify returned invalid JSON");
  }
}

function createPostgridVerifyError(status: number, payload: unknown, phase: PostgridVerifyPhase): ProviderRequestError {
  const message = extractPostgridVerifyErrorMessage(payload) ?? `PostGrid Verify request failed with ${status}`;
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(401, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractPostgridVerifyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.status);
}

function optionalBooleanString(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}
