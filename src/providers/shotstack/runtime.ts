import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalBoolean, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const shotstackApiBaseUrl = "https://api.shotstack.io/edit/v1";
export const shotstackProxyBaseUrl = "https://api.shotstack.io";

type ShotstackRequestPhase = "validate" | "execute";

export const shotstackActionHandlers: ProviderActionHandlers<
  "shotstack",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  render_edit(input, context) {
    return renderEdit(input, context);
  },
  get_render(input, context) {
    return getRender(input, context);
  },
};

export async function validateShotstackCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestShotstackJson({
    apiKey,
    path: "/templates",
    method: "GET",
    fetcher,
    signal,
    phase: "validate",
  });
  if (!optionalRecord(payload)) {
    throw new ProviderRequestError(502, "Shotstack returned an invalid validation response");
  }
  return {
    profile: {
      accountId: "shotstack:api-key",
      displayName: "Shotstack API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: shotstackApiBaseUrl,
      validationEndpoint: "/templates",
    },
  };
}

async function renderEdit(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestShotstackJson({
    apiKey: context.apiKey,
    path: "/render",
    method: "POST",
    body: input.edit,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const response = requireShotstackResponse(payload);
  const id = optionalString(response.id);
  const message = optionalString(response.message);
  if (!id || !message) {
    throw new ProviderRequestError(502, "Shotstack render response did not include id and message");
  }
  return { render: { id, message } };
}

async function getRender(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const id = requiredString(input.id, "id", (message) => new ProviderRequestError(400, message));
  const query = new URLSearchParams();
  const data = optionalBoolean(input.data);
  const merged = optionalBoolean(input.merged);
  if (data !== undefined) {
    query.set("data", String(data));
  }
  if (merged !== undefined) {
    query.set("merged", String(merged));
  }

  const suffix = query.size === 0 ? "" : `?${query}`;
  const payload = await requestShotstackJson({
    apiKey: context.apiKey,
    path: `/render/${encodeURIComponent(id)}${suffix}`,
    method: "GET",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const response = requireShotstackResponse(payload);
  const responseId = optionalString(response.id);
  const status = optionalString(response.status);
  if (!responseId || !status) {
    throw new ProviderRequestError(502, "Shotstack render response did not include id and status");
  }
  return {
    render: jsonObject({
      id: responseId,
      status,
      url: optionalString(response.url) ?? null,
      poster: optionalString(response.poster),
      thumbnail: optionalString(response.thumbnail),
      owner: optionalString(response.owner),
      plan: optionalString(response.plan),
      error: optionalString(response.error),
      duration: optionalNumber(response.duration),
      renderTime: optionalNumber(response.renderTime),
      created: optionalString(response.created),
      updated: optionalString(response.updated),
      data: optionalRecord(response.data),
    }),
  };
}

async function requestShotstackJson(input: {
  apiKey: string;
  path: string;
  method: "GET" | "POST";
  body?: unknown;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: ShotstackRequestPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal);
  const headers: Record<string, string> = {
    accept: "application/json",
    "x-api-key": input.apiKey,
    "user-agent": providerUserAgent,
  };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(buildShotstackUrl(input.path), {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    payload = await readShotstackPayload(response);
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Shotstack request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Shotstack request failed: ${error.message}` : "Shotstack request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createShotstackError(response, payload, input.phase);
  }
  return payload;
}

function buildShotstackUrl(path: string): URL {
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(relativePath, `${shotstackApiBaseUrl}/`);
}

async function readShotstackPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Shotstack returned invalid JSON");
  }
}

function requireShotstackResponse(payload: unknown): Record<string, unknown> {
  const response = optionalRecord(optionalRecord(payload)?.response);
  if (!response) {
    throw new ProviderRequestError(502, "Shotstack response did not include response data");
  }
  return response;
}

function createShotstackError(
  response: Response,
  payload: unknown,
  phase: ShotstackRequestPhase,
): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(optionalRecord(record?.response)?.message) ??
    `Shotstack request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}
