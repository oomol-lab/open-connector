import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, positiveInteger } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const breezeApiPathPrefix = "/api";

type BreezeRequestPhase = "validate" | "execute";
type BreezeQueryValue = string | number | undefined;

interface BreezeActionContext {
  apiKey: string;
  subdomain: string;
  baseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type BreezeActionHandler = (input: Record<string, unknown>, context: BreezeActionContext) => Promise<unknown>;

export const breezeActionHandlers: Record<string, BreezeActionHandler> = {
  list_people(input, context) {
    return executeListPeople(input, context);
  },
  get_person(input, context) {
    return executeGetPerson(input, context);
  },
  list_profile_fields(input, context) {
    return executeListProfileFields(input, context);
  },
  list_tags(input, context) {
    return executeListTags(input, context);
  },
  list_tag_folders(input, context) {
    return executeListTagFolders(input, context);
  },
};

export async function validateBreezeCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = optionalString(apiKey);
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }

  const subdomain = normalizeBreezeSubdomain(values.subdomain);
  const baseUrl = buildBreezeBaseUrl(subdomain);
  const sections = await requestBreezeArray(
    "/profile",
    {},
    { apiKey: trimmedApiKey, subdomain, baseUrl, fetcher, signal },
    "validate",
  );

  return {
    profile: {
      accountId: `breeze:${subdomain}`,
      displayName: `Breeze ${subdomain}`,
    },
    grantedScopes: [],
    metadata: {
      subdomain,
      baseUrl,
      validationEndpoint: "/api/profile",
      profileSectionCount: sections.length,
    },
  };
}

async function executeListPeople(input: Record<string, unknown>, context: BreezeActionContext): Promise<unknown> {
  const people = await requestBreezeArray(
    "/people",
    compactObject({
      details: readOptionalDetailsFlag(input.details),
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
      filter_json: stringifyFilterJson(input.filter_json),
    }),
    resolveBreezeContext(input, context),
    "execute",
  );

  return { people };
}

async function executeGetPerson(input: Record<string, unknown>, context: BreezeActionContext): Promise<unknown> {
  const personId = positiveInteger(input.person_id, "person_id", (message) => new ProviderRequestError(400, message));
  const person = await requestBreezeObject(
    `/people/${personId}`,
    compactObject({
      details: readOptionalDetailsFlag(input.details),
    }),
    resolveBreezeContext(input, context),
    "execute",
  );

  return { person };
}

async function executeListProfileFields(
  input: Record<string, unknown>,
  context: BreezeActionContext,
): Promise<unknown> {
  const sections = await requestBreezeArray("/profile", {}, resolveBreezeContext(input, context), "execute");
  return { sections };
}

async function executeListTags(input: Record<string, unknown>, context: BreezeActionContext): Promise<unknown> {
  const tags = await requestBreezeArray(
    "/tags/list_tags",
    compactObject({
      folder_id: optionalInteger(input.folder_id),
    }),
    resolveBreezeContext(input, context),
    "execute",
  );

  return { tags };
}

async function executeListTagFolders(input: Record<string, unknown>, context: BreezeActionContext): Promise<unknown> {
  const folders = await requestBreezeArray("/tags/list_folders", {}, resolveBreezeContext(input, context), "execute");
  return { folders };
}

function resolveBreezeContext(input: Record<string, unknown>, context: BreezeActionContext): BreezeActionContext {
  const inputSubdomain = optionalString(input.subdomain);
  if (!inputSubdomain) {
    return context;
  }

  const subdomain = normalizeBreezeSubdomain(inputSubdomain);
  return {
    ...context,
    subdomain,
    baseUrl: buildBreezeBaseUrl(subdomain),
  };
}

async function requestBreezeArray(
  path: string,
  query: Record<string, BreezeQueryValue>,
  context: BreezeActionContext,
  phase: BreezeRequestPhase,
): Promise<Array<Record<string, unknown>>> {
  const payload = await requestBreezeJson(path, query, context, phase);
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Breeze response must be an array");
  }

  return payload.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ProviderRequestError(502, `Breeze response item at index ${index} must be an object`);
    }
    return item as Record<string, unknown>;
  });
}

async function requestBreezeObject(
  path: string,
  query: Record<string, BreezeQueryValue>,
  context: BreezeActionContext,
  phase: BreezeRequestPhase,
): Promise<Record<string, unknown>> {
  const payload = await requestBreezeJson(path, query, context, phase);
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Breeze response must be an object");
  }
  return record;
}

async function requestBreezeJson(
  path: string,
  query: Record<string, BreezeQueryValue>,
  context: BreezeActionContext,
  phase: BreezeRequestPhase,
): Promise<unknown> {
  const url = buildBreezeUrl(context.baseUrl, path, query);

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "api-key": context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readBreezePayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Breeze request failed: ${error.message}` : "Breeze request failed",
    );
  }

  if (!response.ok) {
    throw createBreezeError(response.status, payload, phase);
  }

  return payload;
}

async function readBreezePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Breeze returned invalid JSON");
  }
}

function createBreezeError(status: number, payload: unknown, phase: BreezeRequestPhase): ProviderRequestError {
  const message = extractBreezeErrorMessage(payload) ?? `Breeze request failed with ${status}`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }

  if (status === 404) {
    return new ProviderRequestError(404, message, payload);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function extractBreezeErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.errors);
}

function stringifyFilterJson(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return JSON.stringify(value);
}

function readOptionalDetailsFlag(value: unknown): number | undefined {
  if (typeof value !== "boolean") {
    return undefined;
  }

  return value ? 1 : 0;
}

function buildBreezeUrl(baseUrl: string, path: string, query: Record<string, BreezeQueryValue>): URL {
  const url = new URL(`${breezeApiPathPrefix}${path}`, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export function buildBreezeBaseUrl(subdomain: string): string {
  return `https://${subdomain}.breezechms.com`;
}

export function normalizeBreezeBaseUrl(value: unknown): string | undefined {
  const input = optionalString(value);
  if (!input) {
    return undefined;
  }

  let url: URL;
  try {
    url = assertPublicHttpUrl(input, {
      fieldName: "baseUrl",
      createError: (message) => new ProviderRequestError(400, message),
    });
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:" || !url.hostname.endsWith(".breezechms.com")) {
    return undefined;
  }
  return `${url.protocol}//${url.hostname}`;
}

export function normalizeBreezeSubdomain(value: unknown): string {
  const trimmed = optionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, "subdomain is required");
  }

  let candidate = trimmed;
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    try {
      candidate = new URL(candidate).hostname;
    } catch {
      throw new ProviderRequestError(400, "subdomain must be a valid Breeze subdomain");
    }
  }

  candidate = candidate.replace(/\/+$/, "").toLowerCase();
  if (candidate.endsWith(".breezechms.com")) {
    candidate = candidate.slice(0, -".breezechms.com".length);
  }

  if (!candidate || !/^[a-z0-9-]+$/.test(candidate)) {
    throw new ProviderRequestError(400, "subdomain must be a valid Breeze subdomain");
  }

  return candidate;
}
