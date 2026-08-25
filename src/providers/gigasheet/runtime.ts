import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const gigasheetApiBaseUrl = "https://api.gigasheet.com";
const gigasheetValidationPath = "/user/whoami";
const gigasheetHomePath = "/library/home";
const gigasheetExportsPath = "/library/exports";
const gigasheetSearchPath = "/library/search";
const gigasheetLibraryPathPath = "/library/path";
const gigasheetDatasetPath = "/dataset";

type GigasheetRequestPhase = "validate" | "execute";

interface GigasheetActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type GigasheetActionHandler = (input: Record<string, unknown>, context: GigasheetActionContext) => Promise<unknown>;

export const gigasheetActionHandlers: ProviderActionHandlers<"gigasheet", GigasheetActionHandler> = {
  list_home_files(_input, context) {
    return listHomeFiles(context);
  },
  list_exports(input, context) {
    return listExports(input, context);
  },
  search_library(input, context) {
    return searchLibrary(input, context);
  },
  get_library_path(input, context) {
    return getLibraryPath(input, context);
  },
  describe_dataset(input, context) {
    return describeDataset(input, context);
  },
  get_space_used(_input, context) {
    return getSpaceUsed(context);
  },
  get_enrichment_credits(_input, context) {
    return getEnrichmentCredits(context);
  },
};

export async function validateGigasheetCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestGigasheetJson({
    path: gigasheetValidationPath,
    apiKey: requireGigasheetApiKey(input.apiKey),
    fetcher,
    signal,
    phase: "validate",
  });

  const body = optionalRecord(payload);
  const username = optionalString(body?.username);
  const authenticated = body?.authenticated;
  if (authenticated === false) {
    throw new ProviderRequestError(400, "Gigasheet rejected the API key");
  }

  return {
    profile: {
      accountId: username ? `gigasheet:${username}` : "gigasheet",
      displayName: username ?? "Gigasheet API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: gigasheetValidationPath,
      username,
      authenticated: typeof authenticated === "boolean" ? authenticated : undefined,
    }),
  };
}

async function listHomeFiles(context: GigasheetActionContext): Promise<unknown> {
  const payload = await requestGigasheetJsonArray({
    path: gigasheetHomePath,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    entries: payload,
  };
}

async function listExports(input: Record<string, unknown>, context: GigasheetActionContext): Promise<unknown> {
  const payload = await requestGigasheetJsonArray({
    path: gigasheetExportsPath,
    query: compactObject({
      page: nonNegativeInteger(input.page, "page"),
      pageSize: positiveInteger(input.pageSize, "pageSize"),
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    entries: payload,
  };
}

async function searchLibrary(input: Record<string, unknown>, context: GigasheetActionContext): Promise<unknown> {
  const payload = await requestGigasheetJsonArray({
    path: gigasheetSearchPath,
    method: "POST",
    body: compactObject({
      searchTerm: input.searchTerm,
      fields: input.fields,
    }),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    entries: payload,
  };
}

async function getLibraryPath(input: Record<string, unknown>, context: GigasheetActionContext): Promise<unknown> {
  const handle = requireNonEmptyString(input.handle, "handle");
  const payload = await requestGigasheetJsonArray({
    path: `${gigasheetLibraryPathPath}/${encodeURIComponent(handle)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    path: payload,
  };
}

async function describeDataset(input: Record<string, unknown>, context: GigasheetActionContext): Promise<unknown> {
  const handle = requireNonEmptyString(input.handle, "handle");
  const payload = await requestGigasheetJsonObject({
    path: `${gigasheetDatasetPath}/${encodeURIComponent(handle)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    metadata: payload,
  };
}

async function getSpaceUsed(context: GigasheetActionContext): Promise<unknown> {
  const payload = await requestGigasheetJson({
    path: "/user/space-used",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  if (typeof payload !== "number" || !Number.isInteger(payload)) {
    throw new ProviderRequestError(502, "invalid Gigasheet space usage response");
  }

  return {
    space_used: payload,
  };
}

async function getEnrichmentCredits(context: GigasheetActionContext): Promise<unknown> {
  const payload = await requestGigasheetJsonObject({
    path: "/user/enrichment-credits",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    credits: payload,
  };
}

async function requestGigasheetJsonArray(input: GigasheetRequestInput): Promise<unknown[]> {
  const payload = await requestGigasheetJson(input);
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `invalid Gigasheet response for ${input.path}`);
  }
  return payload;
}

async function requestGigasheetJsonObject(input: GigasheetRequestInput): Promise<Record<string, unknown>> {
  const payload = await requestGigasheetJson(input);
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `invalid Gigasheet response for ${input.path}`);
  }
  return object;
}

interface GigasheetRequestInput {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: GigasheetRequestPhase;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}

async function requestGigasheetJson(input: GigasheetRequestInput): Promise<unknown> {
  const response = await requestGigasheet(input);
  const payload = await readGigasheetPayload(response);
  if (!response.ok) {
    throw createGigasheetError(response, payload, input.phase);
  }
  return payload;
}

async function requestGigasheet(input: GigasheetRequestInput): Promise<Response> {
  const url = new URL(input.path, gigasheetApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    return await input.fetcher(url, {
      method: input.method ?? (input.body ? "POST" : "GET"),
      headers: gigasheetHeaders(input.apiKey, Boolean(input.body)),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Gigasheet request failed: ${error.message}` : "Gigasheet request failed",
      error,
    );
  }
}

function gigasheetHeaders(apiKey: string, includeBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "X-GIGASHEET-TOKEN": apiKey,
  };
  if (includeBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readGigasheetPayload(response: Response): Promise<unknown> {
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

function createGigasheetError(
  response: Response,
  payload: unknown,
  phase: GigasheetRequestPhase,
): ProviderRequestError {
  const message = extractGigasheetMessage(payload) ?? `Gigasheet request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(response.status, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractGigasheetMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  for (const key of ["message", "Message", "error", "detail", "details"]) {
    const value = optionalString(body[key]);
    if (value) {
      return value;
    }
  }

  const nestedError = optionalRecord(body.error);
  return (
    optionalString(nestedError?.message) ?? optionalString(nestedError?.detail) ?? optionalString(nestedError?.error)
  );
}

function requireGigasheetApiKey(apiKey: string): string {
  if (!apiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }
  return apiKey;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function positiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function nonNegativeInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined || parsed < 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-negative integer`);
  }
  return parsed;
}
