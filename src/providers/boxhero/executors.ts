import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "boxhero";
const boxheroApiBaseUrl = "https://rest.boxhero-app.com";
const boxheroValidationPath = "/v1/team";

type BoxheroRequestPhase = "validate" | "execute";
type BoxheroActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const boxheroActionHandlers: ProviderActionHandlers<"boxhero", BoxheroActionHandler> = {
  get_team_info(_input, context) {
    return requestBoxheroJson({
      apiKey: context.apiKey,
      path: boxheroValidationPath,
      context,
      phase: "execute",
    });
  },
  list_items(input, context) {
    return requestBoxheroJson({
      apiKey: context.apiKey,
      path: "/v1/items",
      query: input,
      context,
      phase: "execute",
    });
  },
  get_item(input, context) {
    return requestBoxheroJson({
      apiKey: context.apiKey,
      path: `/v1/items/${encodeURIComponent(String(requireNonNegativeInteger(input.item_id, "item_id")))}`,
      query: {
        location_ids: input.location_ids,
      },
      context,
      phase: "execute",
    });
  },
  list_locations(_input, context) {
    return requestBoxheroJson({
      apiKey: context.apiKey,
      path: "/v1/locations",
      context,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, boxheroActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestBoxheroJson({
      apiKey: input.apiKey,
      path: boxheroValidationPath,
      context: {
        fetcher,
        signal,
      },
      phase: "validate",
    });

    const team = optionalRecord(optionalRecord(payload)?.item);
    const teamId = optionalInteger(team?.id);
    const teamName = optionalString(team?.name);
    const teamMode = optionalInteger(team?.mode);
    const currencySymbol = optionalString(team?.currency_symbol);
    if (teamId === undefined || !teamName || teamMode === undefined) {
      throw new ProviderRequestError(502, "BoxHero validation response is invalid");
    }

    return {
      profile: {
        accountId: String(teamId),
        displayName: teamName,
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: boxheroApiBaseUrl,
        validationEndpoint: boxheroValidationPath,
        teamMode,
        currencySymbol,
      }),
    };
  },
};

async function requestBoxheroJson(input: {
  apiKey: string;
  path: string;
  query?: Record<string, unknown>;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: BoxheroRequestPhase;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildBoxheroUrl(input.path, input.query), {
      method: "GET",
      headers: buildBoxheroHeaders(input.apiKey),
      signal: input.context.signal,
    });
    payload = await readBoxheroPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `BoxHero request failed: ${error.message}` : "BoxHero request failed",
    );
  }

  const payloadError = readBoxheroError(payload);
  if (payloadError) {
    throw mapBoxheroError(payloadError, input.phase);
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      response.status >= 500 ? 502 : response.status || 502,
      response.statusText || `BoxHero request failed with HTTP ${response.status}`,
      payload,
    );
  }

  return payload;
}

function buildBoxheroHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

function buildBoxheroUrl(path: string, query?: Record<string, unknown>): URL {
  const url = new URL(path, boxheroApiBaseUrl);
  if (!query) {
    return url;
  }

  for (const [key, value] of Object.entries(query)) {
    appendQueryValue(url, key, value);
  }
  return url;
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(url, key, item);
    }
    return;
  }

  url.searchParams.append(key, String(value));
}

async function readBoxheroPayload(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function readBoxheroError(payload: unknown): { type: string; title: string } | null {
  const record = optionalRecord(payload);
  const type = optionalString(record?.type);
  const title = optionalString(record?.title);
  if (!type || !title) {
    return null;
  }

  return {
    type,
    title,
  };
}

function mapBoxheroError(error: { type: string; title: string }, phase: BoxheroRequestPhase): ProviderRequestError {
  if (error.type === "/errors/tokens/required" || error.type === "/errors/tokens/invalid") {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, error.title, error);
  }

  if (error.type === "/errors/not-found" || error.type === "/errors/invalid-request") {
    return new ProviderRequestError(400, error.title, error);
  }

  return new ProviderRequestError(502, error.title, error);
}

function requireNonNegativeInteger(value: unknown, fieldName: string): number {
  const integer = optionalInteger(value);
  if (integer !== undefined && integer >= 0) {
    return integer;
  }

  throw new ProviderRequestError(400, `${fieldName} must be a non-negative integer`);
}
