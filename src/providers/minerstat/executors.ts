import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "minerstat";
const minerstatApiOrigin = "https://api.minerstat.com";
const minerstatApiBaseUrl = `${minerstatApiOrigin}/v2`;

type MinerstatRequestPhase = "validate" | "execute";
type MinerstatActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const minerstatActionHandlers: ProviderActionHandlers<"minerstat", MinerstatActionHandler> = {
  list_coins(input, context) {
    return runMinerstatAction(input, context, "/coins", "coins", ["list", "algo"]);
  },
  list_hardware(input, context) {
    return runMinerstatAction(input, context, "/hardware", "hardware", ["type", "brand"]);
  },
  list_pools(input, context) {
    return runMinerstatAction(input, context, "/pools", "pools", ["coin", "type"]);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, minerstatActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: minerstatApiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const coins = await requestMinerstatArray({
      path: "/coins",
      query: { list: "BTC" },
      context: { apiKey: input.apiKey, fetcher, signal },
      phase: "validate",
    });
    const firstCoin = optionalRecord(coins[0]);
    return {
      profile: {
        accountId: "api_key",
        displayName: "Minerstat API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: minerstatApiBaseUrl,
        validationEndpoint: "/coins",
        validationTicker: optionalString(firstCoin?.coin) ?? "BTC",
      }),
    };
  },
};

async function runMinerstatAction(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  path: string,
  outputField: string,
  queryFields: readonly string[],
): Promise<Record<string, unknown>> {
  const query = Object.fromEntries(queryFields.map((field) => [field, optionalTrimmedString(input[field])]));
  return {
    [outputField]: await requestMinerstatArray({
      path,
      query,
      context,
      phase: "execute",
    }),
  };
}

async function requestMinerstatArray(input: {
  path: string;
  query: Record<string, string | undefined>;
  context: ApiKeyProviderContext;
  phase: MinerstatRequestPhase;
}): Promise<unknown[]> {
  const url = new URL(`/v2${input.path}`, minerstatApiOrigin);
  for (const [name, value] of Object.entries(input.query)) {
    if (value !== undefined) {
      url.searchParams.set(name, value);
    }
  }

  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "X-API-Key": input.context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readMinerstatPayload(response);
    if (!response.ok) {
      throw createMinerstatError(response.status, payload, input.phase);
    }
    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Minerstat returned an invalid JSON array");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Minerstat request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Minerstat request failed: ${error.message}` : "Minerstat request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readMinerstatPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Minerstat response");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "Minerstat returned invalid JSON");
  }
}

function createMinerstatError(status: number, payload: unknown, phase: MinerstatRequestPhase): ProviderRequestError {
  const message = extractMinerstatErrorMessage(payload) ?? `Minerstat request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 401 : status, message);
  }
  if (status === 402 || status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function extractMinerstatErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const message = payload.trim();
    return message && !message.startsWith("<") ? message.slice(0, 300) : undefined;
  }
  const record = optionalRecord(payload);
  const nestedError = optionalRecord(record?.error);
  return record
    ? (optionalString(record.message) ??
        optionalString(record.error) ??
        optionalString(nestedError?.message) ??
        optionalString(record.detail))
    : undefined;
}

function optionalTrimmedString(value: unknown): string | undefined {
  return optionalString(value)?.trim() || undefined;
}
