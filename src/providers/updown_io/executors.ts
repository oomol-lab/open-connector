import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "updown_io";
const updownIoApiBaseUrl = "https://updown.io";

type UpdownRequestPhase = "validate" | "execute";
type UpdownIoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const updownIoActionHandlers: ProviderActionHandlers<"updown_io", UpdownIoActionHandler> = {
  async list_checks(_input, context) {
    return requestUpdownJson({ context, path: "/api/checks", phase: "execute" });
  },
  async get_check(input, context) {
    return requestUpdownJson({
      context,
      path: `/api/checks/${encodeURIComponent(requiredString(input.token, "token"))}`,
      phase: "execute",
    });
  },
  async create_check(input, context) {
    return requestUpdownJson({
      context,
      path: "/api/checks",
      method: "POST",
      body: buildCheckFormBody(input),
      phase: "execute",
    });
  },
  async update_check(input, context) {
    return requestUpdownJson({
      context,
      path: `/api/checks/${encodeURIComponent(requiredString(input.token, "token"))}`,
      method: "PUT",
      body: buildCheckFormBody(input, { skipToken: true }),
      phase: "execute",
    });
  },
  async delete_check(input, context) {
    await requestUpdownJson({
      context,
      path: `/api/checks/${encodeURIComponent(requiredString(input.token, "token"))}`,
      method: "DELETE",
      phase: "execute",
    });
    return { deleted: true };
  },
  async list_nodes(_input, context) {
    return requestUpdownJson({ context, path: "/api/nodes", phase: "execute" });
  },
  async list_node_ips(_input, context) {
    return requestUpdownJson({ context, path: "/api/nodes/ips", phase: "execute" });
  },
  async list_node_ipv4(_input, context) {
    return requestUpdownJson({ context, path: "/api/nodes/ipv4", phase: "execute" });
  },
  async list_node_ipv6(_input, context) {
    return requestUpdownJson({ context, path: "/api/nodes/ipv6", phase: "execute" });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, updownIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestUpdownJson({
      context: { apiKey: input.apiKey, fetcher, signal },
      path: "/api/checks",
      phase: "validate",
    });
    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "updown.io returned an invalid checks list");
    }

    return {
      profile: {
        displayName: "updown.io API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: updownIoApiBaseUrl,
        validationEndpoint: "/api/checks",
        checkCount: payload.length,
      },
    };
  },
};

async function requestUpdownJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: UpdownRequestPhase;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: URLSearchParams;
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(new URL(input.path, updownIoApiBaseUrl), {
      method: input.method ?? "GET",
      headers: updownHeaders(input.context.apiKey),
      body: input.body,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `updown.io request failed: ${error.message}` : "updown.io request failed",
    );
  }

  const payload = await readUpdownPayload(response);
  if (!response.ok) {
    throw createUpdownError(response, payload, input.phase);
  }
  return payload;
}

function updownHeaders(apiKey: string): Headers {
  return new Headers({
    "X-API-KEY": apiKey,
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
}

async function readUpdownPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "updown.io returned invalid JSON");
  }
}

function createUpdownError(response: Response, payload: unknown, phase: UpdownRequestPhase): ProviderRequestError {
  const message = readUpdownErrorMessage(payload) ?? `updown.io request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 404) {
    return new ProviderRequestError(404, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 500) {
    return new ProviderRequestError(502, message, payload);
  }
  if (phase === "validate") {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function readUpdownErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) {
    return payload;
  }
  const record = optionalRecord(payload);
  return record ? (optionalString(record.error) ?? optionalString(record.message)) : undefined;
}

function buildCheckFormBody(input: Record<string, unknown>, options: { skipToken?: boolean } = {}): URLSearchParams {
  const body = new URLSearchParams();
  if (!options.skipToken) {
    appendFormValue(body, "token", optionalString(input.token));
  }
  appendFormValue(body, "url", optionalString(input.url));
  appendFormValue(body, "type", optionalString(input.type));
  appendFormNumber(body, "period", typeof input.period === "number" ? input.period : undefined);
  appendFormNumber(body, "apdex_t", typeof input.apdex_t === "number" ? input.apdex_t : undefined);
  appendFormBoolean(body, "enabled", optionalBoolean(input.enabled));
  appendFormBoolean(body, "published", optionalBoolean(input.published));
  appendFormValue(body, "alias", optionalString(input.alias));
  appendFormValue(body, "string_match", optionalString(input.string_match));
  appendFormValue(body, "mute_until", optionalString(input.mute_until));
  appendFormValue(body, "http_verb", optionalString(input.http_verb));
  appendFormValue(body, "http_body", optionalString(input.http_body));
  appendFormStringArray(body, "disabled_locations[]", input.disabled_locations);
  appendFormStringArray(body, "recipients[]", input.recipients);
  appendFormRecord(body, "custom_headers", input.custom_headers);
  return body;
}

function appendFormValue(body: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined) body.append(key, value);
}

function appendFormNumber(body: URLSearchParams, key: string, value: number | undefined): void {
  if (value !== undefined) body.append(key, String(value));
}

function appendFormBoolean(body: URLSearchParams, key: string, value: boolean | undefined): void {
  if (value !== undefined) body.append(key, String(value));
}

function appendFormStringArray(body: URLSearchParams, key: string, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    const text = optionalString(item);
    if (text !== undefined) body.append(key, text);
  }
}

function appendFormRecord(body: URLSearchParams, key: string, value: unknown): void {
  const record = optionalRecord(value);
  if (!record) return;
  for (const [childKey, childValue] of Object.entries(compactObject(record))) {
    const text = optionalString(childValue);
    if (text !== undefined) body.append(`${key}[${childKey}]`, text);
  }
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://updown.io",
  auth: { type: "api_key_header", name: "x-api-key" },
});
