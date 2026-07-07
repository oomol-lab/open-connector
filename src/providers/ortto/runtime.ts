import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { OrttoActionName } from "./actions.ts";

import {
  compactObject,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export interface OrttoContext extends ApiKeyProviderContext {
  region?: string;
}

export const orttoRegionBaseUrls: Record<OrttoRegion, string> = {
  default: "https://api.ap3api.com",
  au: "https://api.au.ap3api.com",
  eu: "https://api.eu.ap3api.com",
};

const orttoValidationPath = "/v1/person/get";
const orttoListPeoplePath = "/v1/person/get";
const orttoGetPeopleByIdsPath = "/v1/person/get-by-ids";
const orttoMergePeoplePath = "/v1/person/merge";

type OrttoRegion = "default" | "au" | "eu";
type OrttoRequestPhase = "validate" | "execute";
type OrttoActionHandler = ProviderRuntimeHandler<OrttoContext>;

export const orttoActionHandlers: Record<OrttoActionName, OrttoActionHandler> = {
  async list_people(input, context) {
    const payload = await orttoPostJson(orttoListPeoplePath, input, context, "execute");
    return normalizeOrttoPeopleListPayload(payload);
  },
  async get_people_by_ids(input, context) {
    const payload = await orttoPostJson(orttoGetPeopleByIdsPath, input, context, "execute");
    return normalizeOrttoPeopleListPayload(payload);
  },
  async merge_people(input, context) {
    const payload = await orttoPostJson(orttoMergePeoplePath, input, context, "execute");
    return normalizeOrttoMergePeoplePayload(payload);
  },
};

export async function validateOrttoCredential(
  input: {
    apiKey: string;
    values: Record<string, string>;
  },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const region = readOrttoRegion(input.values.region);
  const payload = await orttoPostJson(
    orttoValidationPath,
    { limit: 1, fields: ["str::email"] },
    {
      apiKey: requireOrttoApiKey(input.apiKey),
      region,
      fetcher,
      signal,
    },
    "validate",
  );
  const listPayload = normalizeOrttoPeopleListPayload(payload);

  return {
    profile: {
      accountId: `ortto:${region}`,
      displayName: "Ortto API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: orttoRegionBaseUrls[region],
      region,
      validationEndpoint: orttoValidationPath,
      totalMatches: optionalNumber(listPayload.meta?.total_matches),
      totalContacts: optionalNumber(listPayload.meta?.total_contacts),
    }),
  };
}

export function resolveOrttoApiBaseUrl(value: unknown): string {
  return orttoRegionBaseUrls[readOrttoRegion(value)];
}

function requireOrttoApiKey(value: unknown): string {
  const apiKey = optionalString(value);
  if (!apiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }
  return apiKey;
}

function readOrttoRegion(value: unknown): OrttoRegion {
  const rawRegion = optionalString(value)?.toLowerCase();
  if (!rawRegion || rawRegion === "default" || rawRegion === "global" || rawRegion === "us") {
    return "default";
  }
  if (rawRegion === "au" || rawRegion === "australia") {
    return "au";
  }
  if (rawRegion === "eu" || rawRegion === "europe") {
    return "eu";
  }
  throw new ProviderRequestError(400, "ortto region must be default, au, or eu");
}

async function orttoPostJson(
  path: string,
  body: Record<string, unknown>,
  context: Pick<OrttoContext, "apiKey" | "region" | "fetcher" | "signal">,
  phase: OrttoRequestPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(new URL(path, orttoRegionBaseUrls[readOrttoRegion(context.region)]), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": requireOrttoApiKey(context.apiKey),
      },
      body: JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readOrttoPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ortto request failed: ${error.message}` : "ortto request failed",
    );
  }

  if (!response.ok) {
    throw createOrttoError(response.status, response.statusText, payload, phase);
  }

  return payload;
}

async function readOrttoPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createOrttoError(
  status: number,
  statusText: string,
  payload: unknown,
  phase: OrttoRequestPhase,
): ProviderRequestError {
  const message = extractOrttoErrorMessage(payload) ?? statusText ?? "ortto request failed";
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function extractOrttoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  for (const key of ["message", "error", "error_message", "description"]) {
    const value = optionalString(body[key]);
    if (value) {
      return value;
    }
  }

  const errors = body.errors;
  if (Array.isArray(errors)) {
    for (const error of errors) {
      const message = extractOrttoErrorMessage(error);
      if (message) {
        return message;
      }
    }
  }

  return undefined;
}

function normalizeOrttoPeopleListPayload(payload: unknown): {
  contacts: Array<Record<string, unknown>>;
  meta: Record<string, unknown> | null;
  offset: number | null;
  next_offset: number | null;
  cursor_id: string | null;
  has_more: boolean | null;
  raw: Record<string, unknown>;
} {
  const body = readOrttoResponseObject(payload);
  return {
    contacts: readObjectArray(body.contacts),
    meta: optionalRecord(body.meta) ?? null,
    offset: optionalInteger(body.offset) ?? null,
    next_offset: optionalInteger(body.next_offset) ?? null,
    cursor_id: optionalString(body.cursor_id) ?? null,
    has_more: typeof body.has_more === "boolean" ? body.has_more : null,
    raw: body,
  };
}

function normalizeOrttoMergePeoplePayload(payload: unknown): {
  accepted: boolean;
  contacts: Array<Record<string, unknown>>;
  raw: Record<string, unknown>;
} {
  const body = readOrttoResponseObject(payload);
  return {
    accepted: true,
    contacts: readObjectArray(body.contacts),
    raw: body,
  };
}

function readOrttoResponseObject(value: unknown): Record<string, unknown> {
  const body = optionalRecord(value);
  if (!body) {
    throw new ProviderRequestError(502, "ortto returned an invalid response");
  }
  return body;
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) =>
    requiredRecord(item, "ortto contact", (message) => new ProviderRequestError(502, message)),
  );
}
