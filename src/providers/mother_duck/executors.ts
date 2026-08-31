import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "mother_duck";
const motherDuckApiBaseUrl = "https://api.motherduck.com";
const motherDuckTokenHelpUrl = "https://app.motherduck.com/settings/tokens";

type MotherDuckMethod = "GET" | "POST" | "PUT" | "DELETE";
type MotherDuckPhase = "validate" | "execute";
type MotherDuckActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface MotherDuckRequestInput {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  method?: MotherDuckMethod;
  path: string;
  phase: MotherDuckPhase;
  body?: Record<string, unknown>;
  allowEmpty?: boolean;
}

export const motherDuckActionHandlers: ProviderActionHandlers<"mother_duck", MotherDuckActionHandler> = {
  list_active_accounts(_input, context) {
    return listActiveAccounts(context);
  },
  create_user(input, context) {
    return createUser(input, context);
  },
  delete_user(input, context) {
    return deleteUser(input, context);
  },
  list_tokens(input, context) {
    return listTokens(input, context);
  },
  create_token(input, context) {
    return createToken(input, context);
  },
  delete_token(input, context) {
    return deleteToken(input, context);
  },
  get_user_duckling_config(input, context) {
    return getUserDucklingConfig(input, context);
  },
  set_user_duckling_config(input, context) {
    return setUserDucklingConfig(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, motherDuckActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestMotherDuckJson({
      context: { apiKey: input.apiKey, fetcher, signal },
      path: "/v1/active_accounts",
      phase: "validate",
    });
    const accounts = readArrayProperty(payload, "accounts");
    const firstUsername = accounts
      .map(optionalRecord)
      .map((account) => optionalString(account?.username))
      .find(Boolean);

    return {
      profile: {
        accountId: firstUsername ? `motherduck:${firstUsername}` : `motherduck:${input.apiKey.slice(-6)}`,
        displayName: firstUsername ? `MotherDuck ${firstUsername}` : "MotherDuck Admin API Token",
      },
      grantedScopes: [],
      metadata: jsonObject({
        apiBaseUrl: motherDuckApiBaseUrl,
        validationEndpoint: "/v1/active_accounts",
        credentialHelpUrl: motherDuckTokenHelpUrl,
        firstActiveUsername: firstUsername,
      }),
    };
  },
};

async function listActiveAccounts(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestMotherDuckJson({
    context,
    path: "/v1/active_accounts",
    phase: "execute",
  });
  return { accounts: readArrayProperty(payload, "accounts") };
}

async function createUser(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const username = readRequiredString(input.username, "username");
  const payload = await requestMotherDuckJson({
    context,
    method: "POST",
    path: "/v1/users",
    phase: "execute",
    body: { username },
  });
  return { username: readResponseUsername(payload, username) };
}

async function deleteUser(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const username = readRequiredString(input.username, "username");
  const payload = await requestMotherDuckJson({
    context,
    method: "DELETE",
    path: `/v1/users/${encodeURIComponent(username)}`,
    phase: "execute",
  });
  return { username: readResponseUsername(payload, username) };
}

async function listTokens(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const username = readRequiredString(input.username, "username");
  const payload = await requestMotherDuckJson({
    context,
    path: `/v1/users/${encodeURIComponent(username)}/tokens`,
    phase: "execute",
  });
  return { tokens: readArrayProperty(payload, "tokens").map(normalizeToken) };
}

async function createToken(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const username = readRequiredString(input.username, "username");
  const payload = await requestMotherDuckJson({
    context,
    method: "POST",
    path: `/v1/users/${encodeURIComponent(username)}/tokens`,
    phase: "execute",
    body: jsonObject({
      name: readRequiredString(input.name, "name"),
      ttl: input.ttl,
      token_type: input.token_type,
    }),
  });
  return { token: normalizeToken(payload) };
}

async function deleteToken(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const username = readRequiredString(input.username, "username");
  const tokenId = readRequiredString(input.token_id, "token_id");
  await requestMotherDuckJson({
    context,
    method: "DELETE",
    path: `/v1/users/${encodeURIComponent(username)}/tokens/${encodeURIComponent(tokenId)}`,
    phase: "execute",
    allowEmpty: true,
  });
  return { success: true };
}

async function getUserDucklingConfig(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const username = readRequiredString(input.username, "username");
  const payload = await requestMotherDuckJson({
    context,
    path: `/v1/users/${encodeURIComponent(username)}/instances`,
    phase: "execute",
  });
  return { config: payload };
}

async function setUserDucklingConfig(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const username = readRequiredString(input.username, "username");
  const config = readRequiredObject(input.config, "config");
  const payload = await requestMotherDuckJson({
    context,
    method: "PUT",
    path: `/v1/users/${encodeURIComponent(username)}/instances`,
    phase: "execute",
    body: { config },
  });
  return { config: payload };
}

async function requestMotherDuckJson(input: MotherDuckRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal);

  try {
    const response = await input.context.fetcher(new URL(input.path, motherDuckApiBaseUrl), {
      method: input.method ?? "GET",
      headers: jsonObject({
        authorization: `Bearer ${input.context.apiKey}`,
        accept: "application/json",
        "content-type": input.body ? "application/json" : undefined,
        "user-agent": providerUserAgent,
      }) as Record<string, string>,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });

    const payload = await readMotherDuckPayload(response);
    if (!response.ok) {
      throw createMotherDuckError(response.status, payload, input.phase);
    }
    if (input.allowEmpty && isEmptyPayload(payload)) {
      return {};
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      timeout.didTimeout() || isAbortLikeError(error) ? 504 : 502,
      error instanceof Error ? `MotherDuck request failed: ${error.message}` : "MotherDuck request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readMotherDuckPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createMotherDuckError(status: number, payload: unknown, phase: MotherDuckPhase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `MotherDuck request failed with ${status}`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }

  if ([400, 404, 409, 422].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function normalizeToken(value: unknown): Record<string, unknown> {
  const token = readRequiredObject(value, "token");
  return jsonObject({
    id: optionalString(token.id),
    name: optionalString(token.name),
    token: optionalString(token.token),
    expire_at: optionalString(token.expire_at),
    created_ts: optionalString(token.created_ts),
    read_only: typeof token.read_only === "boolean" ? token.read_only : undefined,
    token_type: optionalString(token.token_type),
    raw: token,
  });
}

function readResponseUsername(payload: unknown, fallback: string): string {
  return optionalString(optionalRecord(payload)?.username) ?? fallback;
}

function readArrayProperty(payload: unknown, key: string): unknown[] {
  const value = optionalRecord(payload)?.[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `invalid MotherDuck ${key} response`, payload);
  }
  return value;
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return object;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function extractErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  return optionalString(object.message) ?? optionalString(object.error) ?? optionalString(object.code);
}

function isEmptyPayload(payload: unknown): boolean {
  return Boolean(
    payload && typeof payload === "object" && !Array.isArray(payload) && Object.keys(payload).length === 0,
  );
}
