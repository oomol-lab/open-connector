import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, setSearchParams } from "../provider-runtime.ts";

const wiseApiBaseUrl = "https://api.wise.com";
const wiseValidationPath = "/v2/profiles";

type WiseRequestMode = "validate" | "execute";

interface WiseRequestOptions {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  mode: WiseRequestMode;
  signal?: AbortSignal;
  query?: Record<string, string | undefined>;
}

export const wiseActionHandlers: ProviderActionHandlers<"wise", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_profiles(_input, context) {
    const payload = await requestWiseJson({
      path: wiseValidationPath,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });

    return {
      profiles: requireArray(payload, "profiles"),
    };
  },
  async list_currencies(_input, context) {
    const payload = await requestWiseJson({
      path: "/v1/currencies",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
    });

    return {
      currencies: requireArray(payload, "currencies"),
    };
  },
  async get_rates(input, context) {
    const payload = await requestWiseJson({
      path: "/v1/rates",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
      query: {
        source: optionalString(input.source),
        target: optionalString(input.target),
        time: optionalString(input.time),
        from: optionalString(input.from),
        to: optionalString(input.to),
        group: optionalString(input.group),
      },
    });

    return {
      rates: requireArray(payload, "rates"),
    };
  },
};

export async function validateWiseCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestWiseJson({
    path: wiseValidationPath,
    apiKey,
    fetcher,
    signal,
    mode: "validate",
  });
  const profiles = requireArray(payload, "profiles");
  const firstProfile = optionalRecord(profiles[0]);
  const profileId = readProfileId(firstProfile);

  return {
    profile: {
      accountId: profileId ? `wise:profile:${profileId}` : "wise:api_token",
      displayName: buildAccountLabel(firstProfile),
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: wiseApiBaseUrl,
      validationEndpoint: wiseValidationPath,
      ...readProfileMetadata(firstProfile),
    }),
  };
}

async function requestWiseJson(options: WiseRequestOptions): Promise<unknown> {
  const url = new URL(options.path, wiseApiBaseUrl);
  setSearchParams(url, options.query ?? {});

  let response: Response;
  try {
    response = await options.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: options.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Wise request failed: ${error.message}` : "Wise request failed",
    );
  }

  const payload = await readWisePayload(response);
  if (!response.ok) {
    throw mapWiseError(response.status, payload, options.mode);
  }
  return payload;
}

async function readWisePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Wise returned malformed JSON");
    }
    return { message: text };
  }
}

function mapWiseError(status: number, payload: unknown, mode: WiseRequestMode): ProviderRequestError {
  const message = readWiseErrorMessage(payload) ?? `Wise request failed with status ${status}`;
  if (mode === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function readWiseErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const message = optionalString(body.message);
  if (message) {
    return message;
  }

  const error = optionalString(body.error);
  if (error) {
    return error;
  }

  if (Array.isArray(body.errors)) {
    for (const item of body.errors) {
      const itemMessage =
        typeof item === "string" ? optionalString(item) : optionalString(optionalRecord(item)?.message);
      if (itemMessage) {
        return itemMessage;
      }
    }
  }

  return undefined;
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Wise returned an invalid ${fieldName} payload`);
  }
  return value;
}

function buildAccountLabel(profile: Record<string, unknown> | undefined): string {
  if (!profile) {
    return "Wise Account";
  }

  return (
    optionalString(profile.businessName) ??
    optionalString(profile.name) ??
    joinPersonalName(profile) ??
    readProfileIdLabel(profile) ??
    "Wise Account"
  );
}

function joinPersonalName(profile: Record<string, unknown>): string | undefined {
  const fullName = [optionalString(profile.firstName), optionalString(profile.lastName)].filter(Boolean).join(" ");
  return fullName || undefined;
}

function readProfileIdLabel(profile: Record<string, unknown>): string | undefined {
  const id = readProfileId(profile);
  return id ? `Wise profile ${id}` : undefined;
}

function readProfileId(profile: Record<string, unknown> | undefined): string | undefined {
  if (!profile) {
    return undefined;
  }
  return optionalString(profile.id) ?? (typeof profile.id === "number" ? String(profile.id) : undefined);
}

function readProfileMetadata(profile: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!profile) {
    return {};
  }

  return compactObject({
    profileId: readProfileId(profile),
    profileType: optionalString(profile.type),
    businessName: optionalString(profile.businessName),
    name: optionalString(profile.name),
    firstName: optionalString(profile.firstName),
    lastName: optionalString(profile.lastName),
    email: optionalString(profile.email),
  });
}
