import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { objectArray, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const bloomerangApiBaseUrl = "https://api.bloomerang.co/v2";
export const bloomerangValidationPath = "/user/current";

interface BloomerangRequestOptions extends ApiKeyProviderContext {
  path: string;
  query?: Record<string, string | undefined>;
}

type BloomerangActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const bloomerangActionHandlers: ProviderActionHandlers<"bloomerang", BloomerangActionHandler> = {
  list_constituents(input, context) {
    return listConstituents(input, context);
  },
  search_constituents(input, context) {
    return searchConstituents(input, context);
  },
  get_constituent(input, context) {
    return getConstituent(input, context);
  },
};

export async function validateBloomerangCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = requiredResponseRecord(
    await requestBloomerangJson({
      path: bloomerangValidationPath,
      apiKey,
      fetcher,
      signal,
    }),
    "Bloomerang current user",
  );
  const name = optionalString(payload.Name);
  const userName = optionalString(payload.UserName);

  return {
    profile: { displayName: name ?? userName ?? "Bloomerang API Key" },
    metadata: {
      apiBaseUrl: bloomerangApiBaseUrl,
      validationEndpoint: bloomerangValidationPath,
    },
  };
}

async function listConstituents(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const ids = Array.isArray(input.ids) ? input.ids.join("|") : undefined;
  const payload = await requestBloomerangJson({
    ...context,
    path: "/constituents",
    query: {
      skip: stringifyOptional(input.skip),
      take: stringifyOptional(input.take),
      lastModified: optionalString(input.lastModified),
      isFavorite: stringifyOptional(input.isFavorite),
      type: optionalString(input.type),
      id: ids,
      orderBy: optionalString(input.orderBy),
      orderDirection: optionalString(input.orderDirection),
      customFieldId: stringifyOptional(input.customFieldId),
      customFieldValue: optionalString(input.customFieldValue),
    },
  });
  return normalizeListResponse(payload, "Bloomerang constituents");
}

async function searchConstituents(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestBloomerangJson({
    ...context,
    path: "/constituents/search",
    query: {
      skip: stringifyOptional(input.skip),
      take: stringifyOptional(input.take),
      search: optionalString(input.search),
      type: optionalString(input.type),
    },
  });
  return normalizeListResponse(payload, "Bloomerang constituent search");
}

async function getConstituent(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const constituentId = optionalInteger(input.constituentId);
  const payload = requiredResponseRecord(
    await requestBloomerangJson({
      ...context,
      path: `/constituent/${constituentId}`,
    }),
    "Bloomerang constituent",
  );
  return { constituent: payload };
}

function normalizeListResponse(payload: unknown, label: string) {
  const body = requiredResponseRecord(payload, label);
  return {
    total: requireResponseInteger(body.Total, `${label} Total`),
    totalFiltered: requireResponseInteger(body.TotalFiltered, `${label} TotalFiltered`),
    start: requireResponseInteger(body.Start, `${label} Start`),
    resultCount: requireResponseInteger(body.ResultCount, `${label} ResultCount`),
    records: objectArray(body.Results, `${label} Results`, (message) => new ProviderRequestError(502, message)),
  };
}

async function requestBloomerangJson(options: BloomerangRequestOptions) {
  return runProviderRequest({ label: "Bloomerang", signal: options.signal }, async (signal) => {
    const url = new URL(`${bloomerangApiBaseUrl}${options.path}`);
    for (const [name, value] of Object.entries(options.query ?? {})) {
      if (value != null) {
        url.searchParams.set(name, value);
      }
    }

    const response = await options.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": options.apiKey,
      },
      signal,
    });
    const payload = await readResponsePayload(response);
    if (!response.ok) {
      throw mapBloomerangError(response.status, payload);
    }
    return payload;
  });
}

async function readResponsePayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Bloomerang returned invalid JSON");
  }
}

function mapBloomerangError(status: number, payload: unknown) {
  const body = optionalRecord(payload);
  const message =
    optionalString(body?.Message) ??
    optionalString(body?.message) ??
    optionalString(body?.error) ??
    `Bloomerang API request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status, message);
}

function stringifyOptional(value: unknown) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function requireResponseInteger(value: unknown, label: string) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new ProviderRequestError(502, `${label} must be an integer`);
}
