import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export interface GatherupContext {
  apiKey: string;
  clientId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const gatherupApiBaseUrl = "https://app.gatherup.com/api/v2";

type GatherupRequestPhase = "validate" | "execute";
type GatherupQueryValue = string | number | boolean | undefined;
interface GatherupRequestInput {
  apiKey: string;
  clientId: string;
  path: string;
  phase: GatherupRequestPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  query?: Record<string, GatherupQueryValue>;
}

export const gatherupActionHandlers: ProviderActionHandlers<"gatherup", ProviderRuntimeHandler<GatherupContext>> = {
  async list_businesses(input, context) {
    return requestGatherupJson({
      ...context,
      path: "/businesses/get",
      query: {
        agent: input.agent as number | undefined,
        includeDeletedBusinesses: readOptionalFlag(input.includeDeletedBusinesses),
        page: input.page as number | undefined,
        limit: input.limit as number | undefined,
      },
      phase: "execute",
    });
  },

  async get_business(input, context) {
    return requestGatherupJson({
      ...context,
      path: "/business/get",
      query: {
        agent: input.agent as number | undefined,
        businessId: input.businessId as number,
      },
      phase: "execute",
    });
  },

  async list_customers(input, context) {
    return requestGatherupJson({
      ...context,
      path: "/customers/get",
      query: {
        agent: input.agent as number | undefined,
        businessId: input.businessId as number | undefined,
        customerId: input.customerId as number | undefined,
        customId: input.customId as string | undefined,
        jobId: input.jobId as string | undefined,
        email: input.email as string | undefined,
        page: input.page as number | undefined,
        subscription: readOptionalFlag(input.subscription),
        showHistory: readOptionalFlag(input.showHistory),
      },
      phase: "execute",
    });
  },

  async get_customer(input, context) {
    return requestGatherupJson({
      ...context,
      path: "/customer/get",
      query: {
        agent: input.agent as number | undefined,
        customerId: input.customerId as number,
      },
      phase: "execute",
    });
  },
};

export async function validateGatherupCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ profile: { displayName: string }; grantedScopes: string[] }> {
  const apiKey = requiredString(input.apiKey, "apiKey", providerInputError);
  const clientId = requiredString(input.clientId, "clientId", providerInputError);
  await requestGatherupJson({
    apiKey,
    clientId,
    path: "/test",
    phase: "validate",
    fetcher,
  });

  return {
    profile: { displayName: "GatherUp API Key" },
    grantedScopes: [],
  };
}

async function requestGatherupJson(input: GatherupRequestInput) {
  const timeout = createProviderTimeout(input.signal);

  try {
    const response = await input.fetcher(buildGatherupUrl(input), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readGatherupPayload(response);
    if (!response.ok) {
      throw createGatherupError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "GatherUp request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `GatherUp request failed: ${error.message}` : "GatherUp request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildGatherupUrl(input: GatherupRequestInput) {
  const path = input.path.startsWith("/") ? input.path.slice(1) : input.path;
  const url = new URL(path, `${gatherupApiBaseUrl}/`);
  url.searchParams.set("clientId", input.clientId);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readGatherupPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createGatherupError(status: number, payload: unknown, phase: GatherupRequestPhase) {
  const message = extractGatherupErrorMessage(payload) ?? `GatherUp request failed with status ${status}`;

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message);
  }
  if (status === 429 || status === 503) {
    return new ProviderRequestError(status, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractGatherupErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return optionalString(record?.errorMessage) ?? optionalString(record?.message) ?? optionalString(record?.error);
}

function readOptionalFlag(value: unknown) {
  return typeof value === "boolean" ? (value ? 1 : 0) : undefined;
}
