import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "heartbeat";
const apiBaseUrl = "https://api.heartbeat.chat/v0";
const requestTimeoutMs = 30_000;
const credentialHelpUrl = "https://help.heartbeat.chat/hc/en-us/articles/33257714954001-Heartbeat-API";

type HeartbeatRequestPhase = "validate" | "execute";
type HeartbeatActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const heartbeatActionHandlers: ProviderActionHandlers<"heartbeat", HeartbeatActionHandler> = {
  async list_users(_input, context) {
    return {
      users: requireResourceArray(
        await requestHeartbeatJson({ context, path: "/users", phase: "execute" }),
        "Heartbeat users response",
      ),
    };
  },
  async get_user(input, context) {
    const userId = requiredString(input.userId, "userId", providerInputError);
    return {
      user: requireResourceObject(
        await requestHeartbeatJson({
          context,
          path: `/users/${encodeURIComponent(userId)}`,
          phase: "execute",
        }),
        "Heartbeat user response",
      ),
    };
  },
  async find_users_by_email(input, context) {
    return {
      users: requireResourceArray(
        await requestHeartbeatJson({
          context,
          path: "/find/users",
          phase: "execute",
          query: {
            email: requiredString(input.email, "email", providerInputError),
          },
        }),
        "Heartbeat user search response",
      ),
    };
  },
  async list_groups(_input, context) {
    return {
      groups: requireResourceArray(
        await requestHeartbeatJson({ context, path: "/groups", phase: "execute" }),
        "Heartbeat groups response",
      ),
    };
  },
  async get_group(input, context) {
    const groupId = requiredString(input.groupId, "groupId", providerInputError);
    return {
      group: requireResourceObject(
        await requestHeartbeatJson({
          context,
          path: `/groups/${encodeURIComponent(groupId)}`,
          phase: "execute",
        }),
        "Heartbeat group response",
      ),
    };
  },
  async list_channels(_input, context) {
    return {
      channels: requireResourceArray(
        await requestHeartbeatJson({ context, path: "/channels", phase: "execute" }),
        "Heartbeat channels response",
      ),
    };
  },
  async list_events(input, context) {
    return {
      events: requireResourceArray(
        await requestHeartbeatJson({
          context,
          path: "/events",
          phase: "execute",
          query: {
            groupID: optionalString(input.groupId),
          },
        }),
        "Heartbeat events response",
      ),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, heartbeatActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const channels = requireResourceArray(
      await requestHeartbeatJson({
        context: { apiKey: input.apiKey, fetcher, signal },
        path: "/channels",
        phase: "validate",
      }),
      "Heartbeat channels response",
    );
    return {
      profile: {
        accountId: "heartbeat:api-key",
        displayName: "Heartbeat API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/channels",
        channelCount: channels.length,
        credentialHelpUrl,
      },
    };
  },
};

async function requestHeartbeatJson(input: {
  context: ApiKeyProviderContext;
  path: string;
  phase: HeartbeatRequestPhase;
  query?: Record<string, string | undefined>;
}): Promise<unknown> {
  const url = new URL(input.path.startsWith("/") ? input.path.slice(1) : input.path, `${apiBaseUrl}/`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(name, value);
    }
  }
  const timeout = createProviderTimeout(input.context.signal, requestTimeoutMs);

  try {
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readHeartbeatPayload(response);
    if (!response.ok) {
      throw createHeartbeatError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Heartbeat request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Heartbeat request failed: ${error.message}` : "Heartbeat request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readHeartbeatPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Heartbeat response");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw new ProviderRequestError(502, "invalid Heartbeat JSON response");
  }
}

function createHeartbeatError(status: number, payload: unknown, phase: HeartbeatRequestPhase): ProviderRequestError {
  const message = extractHeartbeatErrorMessage(payload) ?? `Heartbeat request failed with status ${status}`;
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractHeartbeatErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const body = optionalRecord(payload);
  return (
    optionalString(body?.message)?.trim() ?? optionalString(body?.error)?.trim() ?? optionalString(body?.detail)?.trim()
  );
}

function requireResourceArray(payload: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} is invalid`);
  }
  return payload.map((item) => requireResourceObject(item, `${label} item`));
}

function requireResourceObject(payload: unknown, label: string): Record<string, unknown> {
  return requiredRecord(payload, label, (message) => new ProviderRequestError(502, message));
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function isAbortLikeError(error: unknown): boolean {
  return (
    error instanceof DOMException ||
    (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}
