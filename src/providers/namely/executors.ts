import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { NamelyActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "namely";

type NamelyRequestPhase = "validate" | "execute";
type QueryValue = string | number | boolean | undefined;
type NamelyActionHandler = (input: Record<string, unknown>, context: NamelyContext) => Promise<unknown>;

interface NamelyContext {
  apiKey: string;
  company: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const namelyActionHandlers: Record<NamelyActionName, NamelyActionHandler> = {
  async list_profiles(input, context) {
    const raw = await requestNamelyJson({
      context,
      path: "/profiles",
      query: compactObject({
        page: readOptionalPositiveInteger(input.page, "page"),
        per_page: readOptionalPositiveInteger(input.perPage, "perPage"),
      }),
      phase: "execute",
    });

    return normalizeCollection(raw, "profiles", "profiles");
  },

  async get_profile(input, context) {
    const profileId = requiredString(input.profileId, "profileId", providerInputError);
    const raw = await requestNamelyJson({
      context,
      path: `/profiles/${encodeURIComponent(profileId)}`,
      phase: "execute",
    });

    return normalizeSingleProfile(raw);
  },

  async get_current_profile(_input, context) {
    const raw = await requestNamelyJson({
      context,
      path: "/profiles/me",
      phase: "execute",
    });

    return normalizeSingleProfile(raw);
  },

  async list_profile_fields(_input, context) {
    const raw = await requestNamelyJson({
      context,
      path: "/profile_fields",
      phase: "execute",
    });

    return normalizeCollection(raw, "profile_fields", "profileFields");
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<NamelyContext>({
  service,
  handlers: namelyActionHandlers,
  async createContext(context, fetcher): Promise<NamelyContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      company: readNamelyCompany(credential.metadata.company ?? credential.values.company),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return buildNamelyApiBaseUrl(readNamelyCompany(credential.metadata.company ?? credential.values.company));
  },
  auth: {
    type: "api_key_authorization",
    prefix: "Bearer ",
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const company = readNamelyCompany(input.values.company);
    const raw = await requestNamelyJson({
      context: {
        apiKey: input.apiKey,
        company,
        fetcher,
        signal,
      },
      path: "/profiles/me",
      phase: "validate",
    });
    const { profile } = normalizeSingleProfile(raw);

    return {
      profile: {
        accountId: `namely:${company}`,
        displayName: readProfileLabel(profile) ?? `Namely ${company}`,
      },
      grantedScopes: [],
      metadata: {
        company,
        apiBaseUrl: buildNamelyApiBaseUrl(company),
      },
    };
  },
};

function buildNamelyApiBaseUrl(company: string): string {
  return `https://${readNamelyCompany(company)}.namely.com/api/v1`;
}

function readNamelyCompany(value: unknown): string {
  const rawValue = optionalString(value)?.toLowerCase();
  if (!rawValue) {
    throw new ProviderRequestError(400, "company is required");
  }
  if (
    rawValue.startsWith("http://") ||
    rawValue.startsWith("https://") ||
    rawValue.includes("/") ||
    rawValue.includes(".")
  ) {
    throw new ProviderRequestError(400, "company must be the Namely company subdomain, not a full URL");
  }
  if (rawValue.startsWith("-") || rawValue.endsWith("-")) {
    throw new ProviderRequestError(400, "company must not start or end with a hyphen");
  }
  for (const char of rawValue) {
    const code = char.charCodeAt(0);
    const isLowercaseLetter = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    if (!isLowercaseLetter && !isDigit && char !== "-") {
      throw new ProviderRequestError(400, "company may only contain lowercase letters, numbers, and hyphens");
    }
  }

  return rawValue;
}

async function requestNamelyJson(input: {
  context: NamelyContext;
  path: string;
  query?: Record<string, QueryValue>;
  phase: NamelyRequestPhase;
}): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await input.context.fetcher(buildNamelyUrl(input.context.company, input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Namely request failed: ${error.message}` : "Namely request failed",
      error,
    );
  }

  const payload = await readJsonObject(response, { tolerant: !response.ok });
  if (!response.ok) {
    throw createNamelyError(response.status, payload, input.phase);
  }

  return payload;
}

function buildNamelyUrl(company: string, path: string, query: Record<string, QueryValue> = {}): URL {
  const url = new URL(`${buildNamelyApiBaseUrl(company)}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

async function readJsonObject(
  response: Response,
  options: { tolerant: boolean } = { tolerant: false },
): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    if (options.tolerant) {
      return {};
    }
    throw new ProviderRequestError(502, "Namely returned invalid JSON");
  }

  return readObject(payload, "response");
}

function createNamelyError(
  status: number,
  payload: Record<string, unknown>,
  phase: NamelyRequestPhase,
): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Namely API request failed with status ${status}`;
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function readErrorMessage(payload: Record<string, unknown>): string | undefined {
  const direct =
    optionalString(payload.message) ?? optionalString(payload.error) ?? optionalString(payload.error_description);
  if (direct) {
    return direct;
  }

  const errors = payload.errors;
  if (Array.isArray(errors)) {
    for (const error of errors) {
      if (typeof error === "string") {
        return error;
      }
      const message = optionalString(optionalRecord(error)?.message);
      if (message) {
        return message;
      }
    }
  }

  return undefined;
}

function normalizeCollection(
  raw: Record<string, unknown>,
  upstreamKey: string,
  outputKey: string,
): Record<string, unknown> {
  const body = readObject(raw, "response");
  const value = body[upstreamKey];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Namely returned invalid ${upstreamKey}`);
  }

  return {
    [outputKey]: value,
    meta: readNullableObject(body.meta),
    links: readNullableObject(body.links ?? body._links),
    linked: readNullableObject(body.linked),
    raw,
  };
}

function normalizeSingleProfile(raw: Record<string, unknown>): {
  profile: Record<string, unknown>;
  linked: unknown;
  raw: unknown;
} {
  const body = readObject(raw, "response");
  const profile = optionalRecord(body.profile) ?? readFirstObject(body.profiles) ?? readObject(body, "profile");

  return {
    profile,
    linked: readNullableObject(body.linked),
    raw,
  };
}

function readProfileLabel(profile: Record<string, unknown>): string | undefined {
  const firstName = optionalString(profile.first_name);
  const lastName = optionalString(profile.last_name);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  if (fullName) {
    return fullName;
  }

  return optionalString(profile.email) ?? optionalString(profile.preferred_name);
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return numberValue;
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Namely returned invalid ${fieldName}`);
  }
  return record;
}

function readNullableObject(value: unknown): Record<string, unknown> | null {
  return optionalRecord(value) ?? null;
}

function readFirstObject(value: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  for (const item of value) {
    const object = optionalRecord(item);
    if (object) {
      return object;
    }
  }
  return undefined;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
