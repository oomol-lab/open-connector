import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "ably_control";
const ablyControlApiBaseUrl = "https://control.ably.net/v1";
const ablyControlAccessTokenUrl = "https://ably.com/users/access_tokens";

interface AblyControlActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  metadata: Record<string, unknown>;
}

interface AblyControlRequestInput {
  path: string;
  phase: "validate" | "execute";
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  query?: URLSearchParams;
  body?: Record<string, unknown>;
  allowEmpty?: boolean;
}

type AblyControlActionHandler = (input: Record<string, unknown>, context: AblyControlActionContext) => Promise<unknown>;

export const ablyControlActionHandlers: ProviderActionHandlers<"ably_control", AblyControlActionHandler> = {
  async get_current_account(_input, context): Promise<unknown> {
    const payload = await requestAblyControlJson(context, {
      path: "/me",
      phase: "execute",
    });
    return { me: normalizeMe(payload) };
  },

  async get_account_stats(input, context): Promise<unknown> {
    const payload = await requestAblyControlJson(context, {
      path: `/accounts/${encodePathSegment(resolveAccountId(input, context))}/stats`,
      query: buildStatsQuery(input),
      phase: "execute",
    });
    return { stats: requireArrayPayload(payload, "ably account stats response") };
  },

  async get_app_stats(input, context): Promise<unknown> {
    const payload = await requestAblyControlJson(context, {
      path: `/apps/${encodePathSegment(requiredString(input.appId, "appId"))}/stats`,
      query: buildStatsQuery(input),
      phase: "execute",
    });
    return { stats: requireArrayPayload(payload, "ably app stats response") };
  },

  async list_apps(input, context): Promise<unknown> {
    const payload = await requestAblyControlJson(context, {
      path: `/accounts/${encodePathSegment(resolveAccountId(input, context))}/apps`,
      phase: "execute",
    });
    return {
      apps: requireArrayPayload(payload, "ably apps response").map(normalizeApp),
    };
  },

  async create_app(input, context): Promise<unknown> {
    const payload = await requestAblyControlJson(context, {
      path: `/accounts/${encodePathSegment(resolveAccountId(input, context))}/apps`,
      method: "POST",
      body: buildAppBody(input, true),
      phase: "execute",
    });
    return { app: normalizeApp(payload) };
  },

  async update_app(input, context): Promise<unknown> {
    const payload = await requestAblyControlJson(context, {
      path: `/apps/${encodePathSegment(requiredString(input.appId, "appId"))}`,
      method: "PATCH",
      body: buildAppBody(input, false),
      phase: "execute",
    });
    return { app: normalizeApp(payload) };
  },

  async delete_app(input, context): Promise<unknown> {
    await requestAblyControlJson(context, {
      path: `/apps/${encodePathSegment(requiredString(input.appId, "appId"))}`,
      method: "DELETE",
      phase: "execute",
      allowEmpty: true,
    });
    return { success: true };
  },

  async list_keys(input, context): Promise<unknown> {
    const payload = await requestAblyControlJson(context, {
      path: `/apps/${encodePathSegment(requiredString(input.appId, "appId"))}/keys`,
      phase: "execute",
    });
    return {
      keys: requireArrayPayload(payload, "ably keys response").map(normalizeKey),
    };
  },

  async create_key(input, context): Promise<unknown> {
    const payload = await requestAblyControlJson(context, {
      path: `/apps/${encodePathSegment(requiredString(input.appId, "appId"))}/keys`,
      method: "POST",
      body: buildKeyBody(input, true),
      phase: "execute",
    });
    return { key: normalizeKey(payload) };
  },

  async update_key(input, context): Promise<unknown> {
    const payload = await requestAblyControlJson(context, {
      path: `/apps/${encodePathSegment(requiredString(input.appId, "appId"))}/keys/${encodePathSegment(requiredString(input.keyId, "keyId"))}`,
      method: "PATCH",
      body: buildKeyBody(input, false),
      phase: "execute",
    });
    return { key: normalizeKey(payload) };
  },

  async revoke_key(input, context): Promise<unknown> {
    await requestAblyControlJson(context, {
      path: `/apps/${encodePathSegment(requiredString(input.appId, "appId"))}/keys/${encodePathSegment(requiredString(input.keyId, "keyId"))}/revoke`,
      method: "POST",
      phase: "execute",
      allowEmpty: true,
    });
    return { success: true };
  },

  async list_queues(input, context): Promise<unknown> {
    const payload = await requestAblyControlJson(context, {
      path: `/apps/${encodePathSegment(requiredString(input.appId, "appId"))}/queues`,
      phase: "execute",
    });
    return {
      queues: requireArrayPayload(payload, "ably queues response").map(normalizeQueue),
    };
  },

  async create_queue(input, context): Promise<unknown> {
    const payload = await requestAblyControlJson(context, {
      path: `/apps/${encodePathSegment(requiredString(input.appId, "appId"))}/queues`,
      method: "POST",
      body: compactObject({
        name: requiredString(input.name, "name"),
        region: requiredString(input.region, "region"),
        ttl: optionalInteger(input.ttl),
        maxLength: optionalInteger(input.maxLength),
      }),
      phase: "execute",
    });
    return { queue: normalizeQueue(payload) };
  },

  async delete_queue(input, context): Promise<unknown> {
    await requestAblyControlJson(context, {
      path: `/apps/${encodePathSegment(requiredString(input.appId, "appId"))}/queues/${encodePathSegment(requiredString(input.queueId, "queueId"))}`,
      method: "DELETE",
      phase: "execute",
      allowEmpty: true,
    });
    return { success: true };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AblyControlActionContext>({
  service,
  handlers: ablyControlActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AblyControlActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      metadata: credential.metadata,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const me = normalizeMe(
      await requestAblyControlJson(
        {
          apiKey: input.apiKey,
          fetcher,
          signal,
          metadata: {},
        },
        {
          path: "/me",
          phase: "validate",
        },
      ),
    );

    return {
      profile: {
        accountId: me.account.id,
        displayName: me.account.name,
      },
      grantedScopes: me.token.capabilities,
      metadata: compactObject({
        accountId: me.account.id,
        accountName: me.account.name,
        userEmail: optionalString(me.user.email),
        tokenId: String(me.token.id),
        tokenName: optionalString(me.token.name),
        apiBaseUrl: ablyControlApiBaseUrl,
        validationEndpoint: "/me",
        credentialHelpUrl: ablyControlAccessTokenUrl,
      }),
    };
  },
};

function resolveAccountId(input: Record<string, unknown>, context: AblyControlActionContext): string {
  return (
    optionalString(input.accountId) ??
    optionalString(context.metadata.accountId) ??
    requiredString(undefined, "accountId")
  );
}

function buildStatsQuery(input: Record<string, unknown>): URLSearchParams {
  const query = new URLSearchParams();
  setQueryValue(query, "start", optionalInteger(input.start)?.toString());
  setQueryValue(query, "end", optionalInteger(input.end)?.toString());
  setQueryValue(query, "limit", optionalInteger(input.limit)?.toString());
  setQueryValue(query, "unit", optionalString(input.unit));
  setQueryValue(query, "direction", optionalString(input.direction));
  return query;
}

function buildAppBody(input: Record<string, unknown>, requireName: boolean): Record<string, unknown> {
  return compactObject({
    name: requireName ? requiredString(input.name, "name") : optionalString(input.name),
    status: optionalString(input.status),
    tlsOnly: optionalBoolean(input.tlsOnly),
    fcmKey: optionalNullableString(input.fcmKey),
    fcmServiceAccount: optionalNullableString(input.fcmServiceAccount),
    fcmProjectId: optionalNullableString(input.fcmProjectId),
    apnsCertificate: optionalNullableString(input.apnsCertificate),
    apnsPrivateKey: optionalNullableString(input.apnsPrivateKey),
    apnsUseSandboxEndpoint: optionalBoolean(input.apnsUseSandboxEndpoint),
  });
}

function buildKeyBody(input: Record<string, unknown>, requireNameAndCapability: boolean): Record<string, unknown> {
  const capability = optionalRecord(input.capability);
  return compactObject({
    name: requireNameAndCapability ? requiredString(input.name, "name") : optionalString(input.name),
    capability: requireNameAndCapability && !capability ? requiredString(undefined, "capability") : capability,
  });
}

async function requestAblyControlJson(
  context: AblyControlActionContext,
  input: AblyControlRequestInput,
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(buildAblyControlUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildAblyControlHeaders(context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ably control request failed: ${error.message}` : "ably control request failed",
    );
  }

  const payload = await readAblyControlPayload(response);
  if (!response.ok) {
    throw createAblyControlError(response, payload, input.phase);
  }
  if (payload == null && !input.allowEmpty) {
    throw new ProviderRequestError(502, "empty ably control response");
  }

  return payload;
}

function buildAblyControlUrl(path: string, query?: URLSearchParams): URL {
  const url = new URL(`${ablyControlApiBaseUrl}${path}`);
  if (query) {
    for (const [key, value] of query.entries()) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildAblyControlHeaders(apiKey: string, hasBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readAblyControlPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "invalid ably control JSON response");
  }
}

function createAblyControlError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const payloadObject = optionalRecord(payload);
  const errorObject = optionalRecord(payloadObject?.error);
  const message =
    optionalString(payloadObject?.message) ??
    optionalString(errorObject?.message) ??
    `ably control request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, {
      phase,
      status: response.status,
      payload,
    });
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function normalizeMe(payload: unknown): {
  token: { id: string | number; name: string; capabilities: string[] } & Record<string, unknown>;
  user: { id: string | number; email: string } & Record<string, unknown>;
  account: { id: string; name: string };
} {
  const me = requireObjectPayload(payload, "ably me response");
  const token = requireObjectPayload(me.token, "ably token response");
  const user = requireObjectPayload(me.user, "ably user response");
  const account = requireObjectPayload(me.account, "ably account response");
  const capabilities = Array.isArray(token.capabilities)
    ? token.capabilities.filter((capability): capability is string => typeof capability === "string")
    : [];

  return {
    token: {
      ...token,
      id: typeof token.id === "number" || typeof token.id === "string" ? token.id : "",
      name: optionalString(token.name) ?? "",
      capabilities,
    },
    user: {
      ...user,
      id: typeof user.id === "number" || typeof user.id === "string" ? user.id : "",
      email: optionalString(user.email) ?? "",
    },
    account: {
      id: requiredString(account.id, "account.id"),
      name: requiredString(account.name, "account.name"),
    },
  };
}

function normalizeApp(value: unknown): Record<string, unknown> {
  const raw = requireObjectPayload(value, "ably app response");
  return {
    id: requiredString(raw.id, "app.id"),
    accountId: optionalString(raw.accountId) ?? null,
    name: optionalString(raw.name) ?? null,
    status: optionalString(raw.status) ?? null,
    tlsOnly: optionalBoolean(raw.tlsOnly) ?? null,
    apnsUseSandboxEndpoint: optionalBoolean(raw.apnsUseSandboxEndpoint) ?? null,
    raw,
  };
}

function normalizeKey(value: unknown): Record<string, unknown> {
  const raw = requireObjectPayload(value, "ably key response");
  return {
    id: requiredString(raw.id, "key.id"),
    appId: optionalString(raw.appId) ?? null,
    name: optionalString(raw.name) ?? null,
    status: optionalInteger(raw.status) ?? null,
    key: optionalString(raw.key) ?? null,
    capability: optionalRecord(raw.capability) ?? null,
    created: optionalInteger(raw.created) ?? null,
    modified: optionalInteger(raw.modified) ?? null,
    raw,
  };
}

function normalizeQueue(value: unknown): Record<string, unknown> {
  const raw = requireObjectPayload(value, "ably queue response");
  return {
    id: requiredString(raw.id, "queue.id"),
    appId: optionalString(raw.appId) ?? null,
    name: optionalString(raw.name) ?? null,
    region: optionalString(raw.region) ?? null,
    state: optionalString(raw.state) ?? null,
    ttl: optionalInteger(raw.ttl) ?? null,
    maxLength: optionalInteger(raw.maxLength) ?? null,
    deadletter: optionalBoolean(raw.deadletter) ?? null,
    raw,
  };
}

function requireArrayPayload(payload: unknown, label: string): unknown[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  return payload;
}

function requireObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `invalid ${label}`);
  }
  return object;
}

function optionalNullableString(value: unknown): string | null | undefined {
  return value === null ? null : optionalString(value);
}

function setQueryValue(query: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined) {
    query.set(key, value);
  }
}
