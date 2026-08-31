import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "next_dns";
const nextDnsApiBaseUrl = "https://api.nextdns.io";
const nextDnsValidationPath = "/profiles";

type NextDnsRequestPhase = "validate" | "execute";
type NextDnsActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const nextDnsActionHandlers: ProviderActionHandlers<"next_dns", NextDnsActionHandler> = {
  async list_profiles(_input, context) {
    return normalizeNextDnsListPayload(
      await requestNextDnsJson({
        path: nextDnsValidationPath,
        query: {},
        context,
        phase: "execute",
      }),
    );
  },
  async get_profile(input, context) {
    const payload = await requestNextDnsJson({
      path: `/profiles/${encodeURIComponent(requiredInputString(input.profileId, "profileId"))}`,
      query: {},
      context,
      phase: "execute",
    });

    return {
      profile: readDataObject(payload),
      raw: optionalRecord(payload) ?? {},
    };
  },
  async get_logs(input, context) {
    return normalizeNextDnsListPayload(
      await requestNextDnsJson({
        path: `/profiles/${encodeURIComponent(requiredInputString(input.profileId, "profileId"))}/logs`,
        query: buildLogsQuery(input),
        context,
        phase: "execute",
      }),
    );
  },
  async get_analytics_domains(input, context) {
    return requestNextDnsAnalytics(input, context, "domains");
  },
  async get_analytics_devices(input, context) {
    return requestNextDnsAnalytics(input, context, "devices");
  },
  async get_analytics_status(input, context) {
    return requestNextDnsAnalytics(input, context, "status");
  },
  async get_analytics_reasons(input, context) {
    return requestNextDnsAnalytics(input, context, "reasons");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, nextDnsActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = {
      apiKey: input.apiKey,
      fetcher,
      signal,
    };
    const payload = await requestNextDnsJson({
      path: nextDnsValidationPath,
      query: {},
      context,
      phase: "validate",
    });
    const firstProfile = optionalRecord(readDataArray(payload)[0]);
    return {
      profile: {
        accountId: optionalString(firstProfile?.id) ?? "next_dns:api_key",
        displayName: "NextDNS API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: nextDnsApiBaseUrl,
        validationEndpoint: nextDnsValidationPath,
        firstProfileId: optionalString(firstProfile?.id),
        firstProfileName: optionalString(firstProfile?.name),
      }),
    };
  },
};

function requestNextDnsAnalytics(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  family: string,
): Promise<unknown> {
  return requestNextDnsJson({
    path: `/profiles/${encodeURIComponent(requiredInputString(input.profileId, "profileId"))}/analytics/${family}`,
    query: buildAnalyticsQuery(input),
    context,
    phase: "execute",
  }).then(normalizeNextDnsListPayload);
}

async function requestNextDnsJson(input: {
  path: string;
  query: Record<string, unknown>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: NextDnsRequestPhase;
}): Promise<unknown> {
  const url = buildNextDnsUrl(input.path, input.query);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "X-Api-Key": input.context.apiKey,
      },
      signal: input.context.signal,
    });
    payload = await readNextDnsPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      isAbortLikeError(error) ? 504 : 502,
      error instanceof Error ? `NextDNS request failed: ${error.message}` : "NextDNS request failed",
    );
  }

  if (!response.ok) {
    throw mapNextDnsError(response.status, extractNextDnsErrorMessage(payload), input.phase, payload);
  }

  const userErrorMessage = extractNextDnsUserErrorMessage(payload);
  if (userErrorMessage) {
    throw new ProviderRequestError(400, userErrorMessage, payload);
  }

  return payload;
}

function buildNextDnsUrl(path: string, query: Record<string, unknown>): URL {
  const url = new URL(path, nextDnsApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildLogsQuery(input: Record<string, unknown>): Record<string, unknown> {
  return {
    from: input.from,
    to: input.to,
    limit: input.limit,
    cursor: input.cursor,
    device: input.device,
    search: input.search,
    status: input.status,
    sort: input.sort,
    raw: input.raw,
  };
}

function buildAnalyticsQuery(input: Record<string, unknown>): Record<string, unknown> {
  return {
    from: input.from,
    to: input.to,
    limit: input.limit,
    cursor: input.cursor,
    device: input.device,
    status: input.status,
    root: input.root,
  };
}

function normalizeNextDnsListPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    return {
      data: [],
      meta: null,
      raw: {},
    };
  }

  return {
    data: Array.isArray(record.data) ? record.data : [],
    meta: optionalRecord(record.meta) ?? null,
    raw: record,
  };
}

function readDataArray(payload: unknown): unknown[] {
  const record = optionalRecord(payload);
  return Array.isArray(record?.data) ? record.data : [];
}

function readDataObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  const data = optionalRecord(record?.data);
  return data ?? record ?? {};
}

async function readNextDnsPayload(response: Response): Promise<unknown> {
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

function extractNextDnsErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const nestedError = optionalRecord(record.error);
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(nestedError?.message);
}

function extractNextDnsUserErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const errors = record?.errors;
  if (!Array.isArray(errors)) {
    return undefined;
  }

  const firstError = errors[0];
  if (typeof firstError === "string" && firstError.trim()) {
    return firstError;
  }

  const firstErrorRecord = optionalRecord(firstError);
  return (
    optionalString(firstErrorRecord?.detail) ??
    optionalString(firstErrorRecord?.message) ??
    optionalString(firstErrorRecord?.code)
  );
}

function mapNextDnsError(
  status: number,
  message: string | undefined,
  phase: NextDnsRequestPhase,
  payload: unknown,
): ProviderRequestError {
  const normalizedMessage = message ?? "NextDNS request failed";

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, normalizedMessage, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, normalizedMessage, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, normalizedMessage, payload);
  }

  return new ProviderRequestError(status || 502, normalizedMessage, payload);
}
