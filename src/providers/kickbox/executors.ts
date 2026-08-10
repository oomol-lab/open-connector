import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { KickboxActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "kickbox";
const kickboxApiBaseUrl = "https://api.kickbox.com";
const kickboxOpenApiBaseUrl = "https://open.kickbox.com";
const kickboxValidationEmail = "hello@example.com";

type KickboxRequestPhase = "validate" | "execute";
type KickboxActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const kickboxActionHandlers: Record<KickboxActionName, KickboxActionHandler> = {
  verify_email(input, context) {
    return requestKickboxVerify({
      apiKey: context.apiKey,
      email: optionalString(input.email) ?? "",
      context,
      phase: "execute",
    });
  },
  check_disposable_email(input, context) {
    return requestKickboxDisposable({
      domainOrEmail: optionalString(input.domain_or_email) ?? "",
      context,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, kickboxActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestKickboxVerify({
      apiKey: input.apiKey,
      email: kickboxValidationEmail,
      context: {
        fetcher,
        signal,
      },
      phase: "validate",
    });

    const record = requireKickboxObject(payload, "/v2/verify");
    const email = optionalString(record.email) ?? kickboxValidationEmail;

    return {
      profile: {
        accountId: buildKickboxProviderAccountId(input.apiKey),
        displayName: email,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: kickboxApiBaseUrl,
        validationEndpoint: "/v2/verify",
        validatedEmail: email,
        result: optionalString(record.result),
        reason: optionalString(record.reason),
        disposable: optionalBoolean(record.disposable),
        accept_all: optionalBoolean(record.accept_all),
        sendex: optionalNumber(record.sendex),
      },
    };
  },
};

async function requestKickboxVerify(input: {
  apiKey: string;
  email: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: KickboxRequestPhase;
}): Promise<unknown> {
  return requestKickboxJson({
    baseUrl: kickboxApiBaseUrl,
    path: "/v2/verify",
    context: input.context,
    apiKey: input.apiKey,
    phase: input.phase,
    query: {
      email: input.email,
    },
  });
}

async function requestKickboxDisposable(input: {
  domainOrEmail: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: KickboxRequestPhase;
}): Promise<unknown> {
  return requestKickboxJson({
    baseUrl: kickboxOpenApiBaseUrl,
    path: `/v1/disposable/${encodeURIComponent(input.domainOrEmail)}`,
    context: input.context,
    phase: input.phase,
  });
}

async function requestKickboxJson(input: {
  baseUrl: string;
  path: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: KickboxRequestPhase;
  apiKey?: string;
  query?: Record<string, string | undefined>;
}): Promise<unknown> {
  const url = new URL(input.path, input.baseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  if (input.apiKey) {
    url.searchParams.set("apikey", input.apiKey);
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
    payload = await readKickboxPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Kickbox request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Kickbox request failed: ${error.message}` : "Kickbox request failed",
    );
  }

  if (!response.ok) {
    throw createKickboxError(response, payload, {
      phase: input.phase,
      usedApiKey: Boolean(input.apiKey),
    });
  }

  return requireKickboxObject(payload, input.path);
}

async function readKickboxPayload(response: Response): Promise<unknown> {
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

function createKickboxError(
  response: Response,
  payload: unknown,
  context: { phase: KickboxRequestPhase; usedApiKey: boolean },
): ProviderRequestError {
  const message =
    extractKickboxErrorMessage(payload) ?? response.statusText ?? `Kickbox request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (context.phase === "validate" && context.usedApiKey && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (context.phase === "execute" && context.usedApiKey && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractKickboxErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed || undefined;
  }

  const record = optionalRecord(payload);
  return (
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.reason) ??
    optionalString(record?.code)
  );
}

function buildKickboxProviderAccountId(apiKey: string): string {
  return `kickbox:api_key:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`;
}

function requireKickboxObject(payload: unknown, endpoint: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `Kickbox response for ${endpoint} was not a JSON object`);
  }
  return record;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.kickbox.com",
  auth: { type: "api_key_query", name: "apikey" },
});
