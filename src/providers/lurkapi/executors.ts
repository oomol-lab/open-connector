import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  requiredInputString,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { loadLurkapiEndpoints, lurkapiBaseUrl } from "./catalog.ts";

const service = "lurkapi";
const balancePath = "/v1/account/credit-balance";
/** LurkAPI answers or gives up within 30 seconds on most endpoints; web rendering can take longer. */
const requestTimeoutMs = 120_000;
/** The error codes that mean the key itself was refused. */
const credentialErrorCodes = new Set(["missing_api_key", "invalid_api_key", "account_suspended"]);
/** Fields every LurkAPI answer carries around its data. */
const envelopeFields = new Set(["success", "credits_remaining", "credits_charged"]);

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type RequestPhase = "validate" | "execute";

const lurkapiActionHandlers: ProviderActionHandlers<"lurkapi", Handler> = {
  async get_credit_balance(_input, context) {
    const body = await lurkapiRequest(balancePath, {}, context);
    return {
      creditsRemaining: optionalNumber(body.credits_remaining) ?? 0,
      dailyTopUp: optionalNumber(body.daily_top_up) ?? null,
      nextTopUpAt: optionalString(body.next_top_up_at) ?? null,
    };
  },
  async find_endpoints(input, context) {
    const endpoints = await loadLurkapiEndpoints(context);
    const words = (optionalString(input.query) ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const platform = optionalString(input.platform)?.toLowerCase();
    const offset = optionalInteger(input.offset) ?? 0;
    const limit = optionalInteger(input.limit) ?? 20;
    const matching = endpoints.filter((endpoint) => {
      if (platform && endpoint.platform.toLowerCase() !== platform) return false;
      const text = `${endpoint.platform} ${endpoint.title} ${endpoint.path} ${endpoint.description}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
    return {
      endpoints: matching.slice(offset, offset + limit),
      total: matching.length,
      nextOffset: offset + limit < matching.length ? offset + limit : null,
    };
  },
  async call_endpoint(input, context) {
    const path = requiredInputString(input.path, "path");
    const endpoints = await loadLurkapiEndpoints(context);
    if (!endpoints.some((endpoint) => endpoint.path === path)) {
      throw providerInputError(`${path} is not a LurkAPI endpoint; use find_endpoints to see the paths`);
    }
    const query: Record<string, string> = {};
    for (const [name, value] of Object.entries(optionalRecord(input.query) ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        throw providerInputError(`query.${name} must be a string, number or boolean`);
      }
      query[name] = String(value);
    }
    const body = await lurkapiRequest(path, query, context);
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (!envelopeFields.has(key)) data[key] = value;
    }
    return {
      path,
      creditsCharged: optionalNumber(body.credits_charged) ?? null,
      creditsRemaining: optionalNumber(body.credits_remaining) ?? null,
      data,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, lurkapiActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: lurkapiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  timeoutMs: requestTimeoutMs,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const body = await lurkapiRequest(balancePath, {}, { apiKey: input.apiKey, fetcher, signal }, "validate");
    return {
      profile: { accountId: "lurkapi-api-key", displayName: "LurkAPI API Key" },
      metadata: {
        apiBaseUrl: lurkapiBaseUrl,
        validationEndpoint: balancePath,
        creditsRemaining: optionalNumber(body.credits_remaining),
      },
    };
  },
};

/** Send one GET to LurkAPI and return its JSON answer. */
async function lurkapiRequest(
  path: string,
  query: Record<string, string>,
  context: ApiKeyProviderContext,
  phase: RequestPhase = "execute",
): Promise<Record<string, unknown>> {
  return runProviderRequest(
    { label: "LurkAPI", signal: context.signal, timeoutMs: requestTimeoutMs },
    async (signal) => {
      const url = new URL(path, lurkapiBaseUrl);
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
      const response = await context.fetcher(url.toString(), {
        headers: { "accept": "application/json", "user-agent": providerUserAgent, "x-api-key": context.apiKey },
        signal,
      });
      const payload = await readProviderJsonBody(response, {
        emptyBody: {},
        invalidJsonMessage: "LurkAPI returned invalid JSON",
        invalidJsonFallback: response.ok ? undefined : (text) => text.slice(0, 500),
      });
      const body = optionalRecord(payload);
      if (!response.ok || body?.success === false) {
        throw lurkapiRequestError(response, body, payload, phase);
      }
      if (!body) {
        throw providerResponseError("LurkAPI returned an answer that is not a JSON object");
      }
      return body;
    },
  );
}

/**
 * Turn a LurkAPI error, `{ success: false, error, code, docs, issues? }`, into
 * the execution error the runtime can express.
 */
function lurkapiRequestError(
  response: Response,
  body: Record<string, unknown> | undefined,
  payload: unknown,
  phase: RequestPhase,
): ProviderRequestError {
  const status = response.status;
  const code = optionalString(body?.code);
  const message = optionalString(body?.error) ?? `LurkAPI request failed with HTTP ${status}`;
  const details = withRetryAfterSeconds(response, payload);
  if (status === 402) {
    // `over_max_credits` means the call costs more than the caller's own max_credits, which a top-up cannot fix.
    return new ProviderRequestError(
      402,
      message,
      details,
      code === "over_max_credits" ? "invalid_input" : "insufficient_credit",
    );
  }
  if (status === 401 || status === 403) {
    const refusedKey = code === undefined || credentialErrorCodes.has(code);
    if (phase === "validate" && refusedKey) {
      return new ProviderRequestError(400, message, details);
    }
    // LurkAPI also answers 403 `not_public` for content only logged-in visitors see; a new key cannot fix that.
    if (!refusedKey) {
      return new ProviderRequestError(status, message, details, "invalid_input");
    }
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, details);
}
