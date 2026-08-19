import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "breezy_hr";
const breezyHrApiBaseUrl = "https://api.breezy.hr/v3";
const breezyHrRequestTimeoutMs = 30_000;
const breezyHrMaxResponseBytes = 10 * 1024 * 1024;

type BreezyHrPhase = "validate" | "execute";
type BreezyHrActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface BreezyHrRequestInput {
  readonly path: string;
  readonly query?: Record<string, string | number | boolean | undefined>;
  readonly fetcher: typeof fetch;
  readonly apiKey: string;
  readonly signal?: AbortSignal;
  readonly phase: BreezyHrPhase;
}

export const breezyHrActionHandlers: ProviderActionHandlers<"breezy_hr", BreezyHrActionHandler> = {
  async get_current_user(_input, context) {
    const raw = await requestBreezyHrJson({
      path: "/user",
      ...context,
      phase: "execute",
    });

    return {
      user: requireRecord(raw, "user"),
      raw,
    };
  },

  async list_companies(_input, context) {
    const raw = await requestBreezyHrJson({
      path: "/companies",
      ...context,
      phase: "execute",
    });

    return {
      companies: requireArray(raw, "companies"),
      raw,
    };
  },

  async get_company(input, context) {
    const companyId = readRequiredString(input.companyId, "companyId");
    const raw = await requestBreezyHrJson({
      path: `/company/${encodeURIComponent(companyId)}`,
      ...context,
      phase: "execute",
    });

    return {
      company: requireRecord(raw, "company"),
      raw,
    };
  },

  async list_positions(input, context) {
    const companyId = readRequiredString(input.companyId, "companyId");
    const raw = await requestBreezyHrJson({
      path: `/company/${encodeURIComponent(companyId)}/positions`,
      query: compactObject({
        state: optionalString(input.state),
        page_size: optionalNumber(input.pageSize),
        page: optionalNumber(input.page),
        sort: optionalString(input.sort),
      }),
      ...context,
      phase: "execute",
    });

    return {
      positions: requireArray(raw, "positions"),
      raw,
    };
  },

  async get_position(input, context) {
    const companyId = readRequiredString(input.companyId, "companyId");
    const positionId = readRequiredString(input.positionId, "positionId");
    const raw = await requestBreezyHrJson({
      path: `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(positionId)}`,
      ...context,
      phase: "execute",
    });

    return {
      position: requireRecord(raw, "position"),
      raw,
    };
  },

  async list_position_candidates(input, context) {
    const companyId = readRequiredString(input.companyId, "companyId");
    const positionId = readRequiredString(input.positionId, "positionId");
    const raw = await requestBreezyHrJson({
      path: `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(positionId)}/candidates`,
      query: compactObject({
        page_size: optionalNumber(input.pageSize),
        page: optionalNumber(input.page),
        sort: optionalString(input.sort),
      }),
      ...context,
      phase: "execute",
    });

    return {
      candidates: requireArray(raw, "candidates"),
      raw,
    };
  },

  async get_candidate(input, context) {
    const companyId = readRequiredString(input.companyId, "companyId");
    const positionId = readRequiredString(input.positionId, "positionId");
    const candidateId = readRequiredString(input.candidateId, "candidateId");
    const raw = await requestBreezyHrJson({
      path: `/company/${encodeURIComponent(companyId)}/position/${encodeURIComponent(
        positionId,
      )}/candidate/${encodeURIComponent(candidateId)}`,
      ...context,
      phase: "execute",
    });

    return {
      candidate: requireRecord(raw, "candidate"),
      raw,
    };
  },

  async search_candidates_by_email(input, context) {
    const companyId = readRequiredString(input.companyId, "companyId");
    const raw = await requestBreezyHrJson({
      path: `/company/${encodeURIComponent(companyId)}/candidates/search`,
      query: {
        email_address: readRequiredString(input.emailAddress, "emailAddress").toLowerCase(),
      },
      ...context,
      phase: "execute",
    });

    return {
      candidates: requireArray(raw, "candidates"),
      raw,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, breezyHrActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: breezyHrApiBaseUrl,
  auth: { type: "api_key_header", name: "Authorization" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const raw = await requestBreezyHrJson({
      path: "/user",
      fetcher,
      apiKey: input.apiKey,
      signal,
      phase: "validate",
    });
    const user = requireRecord(raw, "user");
    const accountLabel = readFirstString(user, ["name", "email_address", "username"]) ?? "Breezy HR API Token";
    const accountId = optionalString(user._id) ?? "api_key";
    return {
      profile: {
        accountId,
        displayName: accountLabel,
      },
      grantedScopes: [],
      metadata: compactObject({
        userId: optionalString(user._id),
        emailAddress: optionalString(user.email_address),
        username: optionalString(user.username),
        apiBaseUrl: breezyHrApiBaseUrl,
      }),
    };
  },
};

async function requestBreezyHrJson(input: BreezyHrRequestInput) {
  const relativePath = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(`${breezyHrApiBaseUrl}/${relativePath}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.signal, breezyHrRequestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: input.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readBreezyHrPayload(response);
    if (!response.ok) {
      throw createBreezyHrError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "breezy_hr request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `breezy_hr request failed: ${error.message}` : "breezy_hr request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readBreezyHrPayload(response: Response) {
  const text = await readProviderTextBody(response, "Breezy HR response", breezyHrMaxResponseBytes);
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createBreezyHrError(response: Response, payload: unknown, phase: BreezyHrPhase) {
  const message = extractBreezyHrErrorMessage(payload) ?? response.statusText ?? "breezy_hr request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && [400, 404, 412].includes(response.status)) {
    return new ProviderRequestError(response.status, message);
  }

  return new ProviderRequestError(response.status >= 500 || response.status < 400 ? 502 : response.status, message);
}

function extractBreezyHrErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalRecord(record.error);
  return (
    optionalString(error?.message) ??
    optionalString(error?.type) ??
    optionalString(record.message) ??
    optionalString(record.error)
  );
}

function requireArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `invalid breezy_hr ${label} response`);
  }
  return value;
}

function requireRecord(value: unknown, label: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `invalid breezy_hr ${label} response`);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function readFirstString(input: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = optionalString(input[key]);
    if (value?.trim()) {
      return value.trim();
    }
  }
  return undefined;
}
