import type { QueryValue } from "../../core/request.ts";
import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

export const flagsmithApiBaseUrl = "https://edge.api.flagsmith.com/api/v1";
const service = "flagsmith";
const flagsmithValidationPath = "/flags/";

type FlagsmithRequestPhase = "validate" | "execute";
type FlagsmithActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const flagsmithActionHandlers: ProviderActionHandlers<"flagsmith", FlagsmithActionHandler> = {
  async list_flags(input, context) {
    const payload = await requestFlagsmithJson({
      path: "/flags/",
      method: "GET",
      query: {
        feature: optionalString(input.feature),
      },
      context,
      phase: "execute",
    });

    const rawFlags = Array.isArray(payload) ? payload.map(asObject) : [asObject(payload)];
    return {
      flags: rawFlags.map(normalizeFlag),
      raw: rawFlags,
    };
  },
  async get_feature_flag(input, context) {
    const payload = await requestFlagsmithJson({
      path: "/flags/",
      method: "GET",
      query: {
        feature: requiredInputString(input.feature, "feature"),
      },
      context,
      phase: "execute",
    });
    const raw = asObject(Array.isArray(payload) ? payload[0] : payload);
    return {
      flag: normalizeFlag(raw),
      raw,
    };
  },
  async get_identity_flags(input, context) {
    const payload = await requestFlagsmithJson({
      path: "/identities/",
      method: "GET",
      query: {
        identifier: requiredInputString(input.identifier, "identifier"),
      },
      context,
      phase: "execute",
    });
    const raw = asObject(payload);
    return {
      identity: normalizeIdentity(raw),
      raw,
    };
  },
  async identify_identity(input, context) {
    const payload = await requestFlagsmithJson({
      path: "/identities/",
      method: "POST",
      body: compactObject({
        identifier: requiredInputString(input.identifier, "identifier"),
        traits: readOptionalTraits(input.traits),
      }),
      context,
      phase: "execute",
    });
    const raw = asObject(payload);
    return {
      identity: normalizeIdentity(raw),
      raw,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, flagsmithActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: flagsmithApiBaseUrl,
  auth: { type: "api_key_header", name: "X-Environment-Key" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    await requestFlagsmithJson({
      path: flagsmithValidationPath,
      method: "GET",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });

    return {
      profile: {
        accountId: "flagsmith-environment-key",
        displayName: "Flagsmith Environment Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: flagsmithApiBaseUrl,
        validationEndpoint: flagsmithValidationPath,
      },
    };
  },
};

async function requestFlagsmithJson(input: {
  path: string;
  method: "GET" | "POST";
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: FlagsmithRequestPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const headers = new Headers({
      accept: "application/json",
      "user-agent": providerUserAgent,
      "x-environment-key": input.context.apiKey,
    });
    if (input.body) {
      headers.set("content-type", "application/json");
    }

    const response = await input.context.fetcher(buildFlagsmithUrl(input.path, input.query), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readFlagsmithPayload(response);

    if (!response.ok) {
      throw createFlagsmithError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Flagsmith request timed out");
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

function buildFlagsmithUrl(path: string, query: Record<string, QueryValue> = {}): string {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${flagsmithApiBaseUrl}/`);
  for (const [key, value] of Object.entries(queryParams(query))) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function readFlagsmithPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (!text) {
    return {};
  }

  if (contentType.includes("application/json")) {
    return parseFlagsmithJsonPayload(text);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { detail: text };
  }
}

function parseFlagsmithJsonPayload(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Flagsmith returned malformed JSON");
  }
}

function createFlagsmithError(status: number, payload: unknown, phase: FlagsmithRequestPhase): ProviderRequestError {
  const message = readFlagsmithErrorMessage(payload) ?? `Flagsmith request failed with ${status}`;
  if (status == 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status == 401 || status == 403) {
    return new ProviderRequestError(phase == "validate" ? 400 : 401, message, payload);
  }
  if (status == 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status == 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function readFlagsmithErrorMessage(payload: unknown): string | undefined {
  if (typeof payload == "string") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const detail = optionalString(record.detail);
  if (detail) {
    return detail;
  }

  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) {
    return message;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    return errors.map((item) => String(item)).join(", ");
  }

  return undefined;
}

function normalizeFlag(raw: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    feature: optionalRecord(raw.feature),
    enabled: typeof raw.enabled == "boolean" ? raw.enabled : undefined,
    feature_state_value: raw.feature_state_value,
    featurestate_uuid: optionalString(raw.featurestate_uuid),
    multivariate_feature_state_values: Array.isArray(raw.multivariate_feature_state_values)
      ? raw.multivariate_feature_state_values.map(asObject)
      : undefined,
    metadata: optionalRecord(raw.metadata),
    raw,
  });
}

function normalizeIdentity(raw: Record<string, unknown>): Record<string, unknown> {
  const flags = Array.isArray(raw.flags) ? raw.flags.map((item) => normalizeFlag(asObject(item))) : [];
  const traits = Array.isArray(raw.traits) ? raw.traits.map((item) => normalizeTrait(asObject(item))) : [];
  return compactObject({
    identifier: optionalString(raw.identifier),
    identity_uuid: optionalString(raw.identity_uuid),
    django_id: typeof raw.django_id == "number" ? raw.django_id : undefined,
    flags,
    traits,
    raw,
  });
}

function normalizeTrait(raw: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    trait_key: optionalString(raw.trait_key),
    trait_value: raw.trait_value,
    raw,
  });
}

function readOptionalTraits(value: unknown): Array<Record<string, unknown>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "traits must be an array");
  }
  return value.map((item) => {
    const trait = asObject(item);
    return {
      trait_key: requiredInputString(trait.trait_key, "trait_key"),
      trait_value: trait.trait_value,
    };
  });
}

function asObject(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "Flagsmith response item", (message) => new ProviderRequestError(502, message, value));
}
