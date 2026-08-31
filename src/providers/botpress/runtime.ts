import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export interface BotpressContext extends Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal"> {
  workspaceId: string;
}

interface BotpressRequestInput {
  apiKey: string;
  fetcher: ProviderFetch;
  path: string;
  method?: string;
  workspaceId?: string;
  query?: Record<string, boolean | string | undefined>;
  phase?: BotpressPhase;
  signal?: AbortSignal;
}

type BotpressPhase = "validate" | "execute";

export const botpressApiBaseUrl = "https://api.botpress.cloud/v1/admin";

const botpressRequestBaseUrl = "https://api.botpress.cloud/v1/admin/";
const botpressValidationPath = "/bots";

export const botpressActionHandlers: ProviderActionHandlers<"botpress", ProviderRuntimeHandler<BotpressContext>> = {
  async list_workspaces(input, context) {
    return botpressRequest({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      path: "/workspaces",
      query: pickQuery(input, ["nextToken", "handle"]),
    });
  },
  async list_bots(input, context) {
    return botpressRequest({
      ...context,
      path: "/bots",
      query: pickQuery(input, ["dev", "nextToken", "sortField", "sortDirection"]),
    });
  },
  async get_bot(input, context) {
    return botpressRequest({
      ...context,
      path: `/bots/${encodeURIComponent(readRequiredString(input, "botId"))}`,
    });
  },
};

export async function validateBotpressCredential(
  input: { apiKey: string; values: Record<string, string> },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = readApiKey(input.apiKey);
  const workspaceId = readWorkspaceId(input.values);
  const payload = await botpressRequest({
    apiKey,
    workspaceId,
    fetcher,
    signal,
    path: botpressValidationPath,
    phase: "validate",
  });
  const payloadObject = optionalRecord(payload);
  const bots = Array.isArray(payloadObject?.bots) ? payloadObject.bots : [];
  const firstBot = optionalRecord(bots[0]);
  const firstBotId = optionalString(firstBot?.id);
  const firstBotName = optionalString(firstBot?.name);

  return {
    profile: {
      accountId: `botpress:${workspaceId}`,
      displayName: `Botpress workspace ${workspaceId}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: botpressApiBaseUrl,
      validationEndpoint: botpressValidationPath,
      workspaceId,
      firstBotId,
      firstBotName,
      botCount: bots.length,
    }),
  };
}

async function botpressRequest(input: BotpressRequestInput): Promise<unknown> {
  const url = buildBotpressUrl(input.path);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.signal);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: botpressHeaders(input.apiKey, input.workspaceId),
      signal: timeout.signal,
    });
    const payload = await readBotpressPayload(response);
    if (!response.ok) {
      throw createBotpressError(response, payload, input.phase ?? "execute");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Botpress request timed out");
    }
    throw error;
  } finally {
    timeout.cleanup();
  }
}

function buildBotpressUrl(path: string): URL {
  return new URL(path.startsWith("/") ? path.slice(1) : path, botpressRequestBaseUrl);
}

function botpressHeaders(apiKey: string, workspaceId?: string): Record<string, string> {
  return compactObject({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    "x-workspace-id": workspaceId,
  }) as Record<string, string>;
}

async function readBotpressPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createBotpressError(response: Response, payload: unknown, phase: BotpressPhase): ProviderRequestError {
  const message = (extractErrorMessage(payload) ?? response.statusText) || "Botpress request failed";
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : 500, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) {
    return message;
  }
  const errors = record.errors;
  if (Array.isArray(errors)) {
    const first = optionalRecord(errors[0]);
    return optionalString(first?.message) ?? optionalString(errors[0]);
  }
  return undefined;
}

function pickQuery(input: Record<string, unknown>, keys: readonly string[]): Record<string, boolean | string> {
  const query: Record<string, boolean | string> = {};
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" || typeof value === "boolean") {
      query[key] = value;
    }
  }
  const tags = optionalRecord(input.tags);
  if (tags) {
    for (const [key, value] of Object.entries(tags)) {
      if (typeof value === "string") {
        query[`tags[${key}]`] = value;
      }
    }
  }
  return query;
}

function readApiKey(value: unknown): string {
  const apiKey = optionalString(value);
  if (!apiKey) {
    throw new ProviderRequestError(400, "botpress api token is required");
  }
  return apiKey;
}

function readWorkspaceId(input: Record<string, string | undefined>): string {
  const workspaceId = optionalString(input.workspaceId);
  if (!workspaceId) {
    throw new ProviderRequestError(400, "botpress workspaceId is required");
  }
  return workspaceId;
}

function readRequiredString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return value;
}
