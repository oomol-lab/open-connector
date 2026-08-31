import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "interzoid";
const interzoidApiBaseUrl = "https://api.interzoid.com";

type InterzoidPhase = "validate" | "execute";
type InterzoidContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type InterzoidActionHandler = (input: Record<string, unknown>, context: InterzoidContext) => Promise<unknown>;

interface InterzoidRequestInput {
  path: string;
  query: Record<string, string | undefined>;
  phase: InterzoidPhase;
}

export const interzoidActionHandlers: ProviderActionHandlers<"interzoid", InterzoidActionHandler> = {
  async get_company_match_key(input, context) {
    const payload = await requestInterzoidJson(
      {
        path: "/getcompanymatchadvanced",
        query: {
          company: readRequiredString(input.company, "company"),
          algorithm: readRequiredString(input.algorithm, "algorithm"),
        },
        phase: "execute",
      },
      context,
    );

    return normalizeMatchKeyResponse(payload);
  },
  async get_full_name_match_key(input, context) {
    const payload = await requestInterzoidJson(
      {
        path: "/getfullnamematch",
        query: {
          fullname: readRequiredString(input.fullName, "fullName"),
        },
        phase: "execute",
      },
      context,
    );

    return normalizeMatchKeyResponse(payload);
  },
  async get_full_name_match_score(input, context) {
    const payload = await requestInterzoidJson(
      {
        path: "/getfullnamematchscore",
        query: {
          fullname1: readRequiredString(input.fullName1, "fullName1"),
          fullname2: readRequiredString(input.fullName2, "fullName2"),
        },
        phase: "execute",
      },
      context,
    );

    return {
      ...normalizeBaseResponse(payload),
      score: optionalInteger(payload.Score) ?? null,
    };
  },
  async standardize_organization_name(input, context) {
    const payload = await requestInterzoidJson(
      {
        path: "/getorgstandard",
        query: {
          org: readRequiredString(input.organization, "organization"),
        },
        phase: "execute",
      },
      context,
    );

    return {
      ...normalizeBaseResponse(payload),
      standard: optionalString(payload.Standard) ?? null,
    };
  },
  async get_email_info(input, context) {
    const payload = await requestInterzoidJson(
      {
        path: "/getemailinfo",
        query: {
          email: readRequiredString(input.email, "email"),
        },
        phase: "execute",
      },
      context,
    );

    return {
      ...normalizeBaseResponse(payload),
      email: optionalString(payload.Email) ?? null,
      response: optionalString(payload.Response) ?? null,
      info: optionalString(payload.Info) ?? null,
      domain: optionalString(payload.Domain) ?? null,
      organization: optionalString(payload.Organization) ?? null,
      geolocation: optionalString(payload.Geolocation) ?? null,
      domainOwner: optionalString(payload.DomainOwner) ?? null,
      isDisposable: optionalString(payload.IsDisposable) ?? null,
      isGeneric: optionalString(payload.IsGeneric) ?? null,
    };
  },
  async get_ip_profile(input, context) {
    const payload = await requestInterzoidJson(
      {
        path: "/getipprofile",
        query: {
          lookup: readRequiredString(input.ip, "ip"),
        },
        phase: "execute",
      },
      context,
    );

    return {
      ...normalizeBaseResponse(payload),
      version: optionalString(payload.Version) ?? null,
      cidr: optionalString(payload.CIDR) ?? null,
      asn: optionalString(payload.ASN) ?? null,
      hostname: optionalString(payload.Hostname) ?? null,
      organization: optionalString(payload.Organization) ?? null,
      geolocation: optionalString(payload.Geolocation) ?? null,
      reputation: optionalString(payload.Reputation) ?? null,
      abuseContact: optionalString(payload.AbuseContact) ?? null,
    };
  },
  async get_remaining_credits(_input, context) {
    const payload = await requestInterzoidJson(
      {
        path: "/getremainingcredits",
        query: {},
        phase: "execute",
      },
      context,
    );

    return normalizeBaseResponse(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, interzoidActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestInterzoidJson(
      {
        path: "/getremainingcredits",
        query: {},
        phase: "validate",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    );
    const normalized = normalizeBaseResponse(payload);

    return {
      profile: {
        accountId: "api_key",
        displayName: "Interzoid API License",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: interzoidApiBaseUrl,
        validationEndpoint: "/getremainingcredits",
        credits: normalized.credits ?? undefined,
      }),
    };
  },
};

async function requestInterzoidJson(
  input: InterzoidRequestInput,
  context: InterzoidContext,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal);

  try {
    const response = await context.fetcher(buildInterzoidUrl(input, context.apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readInterzoidPayload(response);

    if (!response.ok) {
      throw createInterzoidError(response.status, payload);
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Interzoid returned an invalid payload", payload);
    }

    const code = optionalString(record.Code);
    if (code && code.toLowerCase() !== "success") {
      throw createInterzoidError(response.status, record);
    }

    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Interzoid request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Interzoid request failed: ${error.message}` : "Interzoid request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildInterzoidUrl(input: InterzoidRequestInput, apiKey: string): URL {
  const normalizedPath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(normalizedPath, `${interzoidApiBaseUrl}/`);
  url.searchParams.set("license", apiKey);

  for (const [key, value] of Object.entries(input.query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  return url;
}

async function readInterzoidPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Interzoid returned invalid JSON");
  }
}

function createInterzoidError(status: number, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const code = (optionalString(record?.Code) ?? "").toUpperCase();
  const message =
    optionalString(record?.Message) ??
    optionalString(record?.Error) ??
    `Interzoid request failed with status ${status}`;

  if (status === 401 || status === 403 || status === 402) {
    return new ProviderRequestError(400, message, payload);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  if (code.startsWith("HTTP 4")) {
    return new ProviderRequestError(Math.max(status, 400), message, payload);
  }

  return new ProviderRequestError(502, message, payload);
}

function normalizeMatchKeyResponse(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    ...normalizeBaseResponse(payload),
    simKey: optionalString(payload.SimKey) ?? null,
  };
}

function normalizeBaseResponse(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    code: optionalString(payload.Code) ?? "Success",
    credits: optionalInteger(payload.Credits) ?? null,
    message: optionalString(payload.Message) ?? null,
    raw: payload,
  };
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}
