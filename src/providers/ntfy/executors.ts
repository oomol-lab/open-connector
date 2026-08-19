import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "ntfy";
const ntfyApiBaseUrl = "https://ntfy.sh";
const ntfyAccountPath = "/v1/account";

type NtfyRequestPhase = "validate" | "execute";
type NtfyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const ntfyActionHandlers: ProviderActionHandlers<"ntfy", NtfyActionHandler> = {
  async get_account(_input, context) {
    const payload = await requestNtfyJson({
      path: ntfyAccountPath,
      method: "GET",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return parseNtfyAccount(payload);
  },
  async publish_message(input, context) {
    const payload = await requestNtfyJson({
      path: "/",
      method: "POST",
      apiKey: context.apiKey,
      body: buildNtfyPublishBody(input),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return parseNtfyMessage(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ntfyActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestNtfyJson({
      path: ntfyAccountPath,
      method: "GET",
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    const account = parseNtfyAccount(payload);
    const username = optionalString(account.username);

    return {
      profile: {
        accountId: username,
        displayName: username ? `${username} (ntfy)` : "ntfy Access Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: ntfyApiBaseUrl,
        validationEndpoint: ntfyAccountPath,
        username,
        role: optionalString(account.role),
      }),
    };
  },
};

async function requestNtfyJson(input: {
  path: string;
  method: "GET" | "POST";
  apiKey: string;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: NtfyRequestPhase;
}): Promise<unknown> {
  let response: Response;
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${input.apiKey}`,
      "user-agent": providerUserAgent,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }

    response = await input.fetcher(new URL(input.path, ntfyApiBaseUrl), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ntfy request failed: ${error.message}` : "ntfy request failed",
    );
  }

  const rawBody = await response.text().catch((error: unknown) => {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Failed to read ntfy response body: ${error.message}`
        : "Failed to read ntfy response body",
    );
  });
  const payload = parseNtfyJson(rawBody, response.status, input.phase);

  if (!response.ok) {
    throw createNtfyHttpError(response.status, payload, rawBody, input.phase);
  }

  return payload;
}

function parseNtfyJson(rawBody: string, status: number, phase: NtfyRequestPhase): unknown {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch (error) {
    if (status >= 400) {
      throw createNtfyHttpError(status, null, rawBody, phase);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ntfy returned invalid JSON: ${error.message}` : "ntfy returned invalid JSON",
    );
  }
}

function buildNtfyPublishBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    topic: optionalString(input.topic),
    message: optionalString(input.message),
    sequence_id: optionalString(input.sequence_id),
    title: optionalString(input.title),
    priority: optionalNumber(input.priority),
    tags: Array.isArray(input.tags) ? input.tags : undefined,
    click: optionalString(input.click),
    attach: optionalString(input.attach),
    icon: optionalString(input.icon),
    filename: optionalString(input.filename),
    markdown: optionalBoolean(input.markdown),
    email: optionalString(input.email),
    call: optionalString(input.call),
    delay: optionalString(input.delay),
    cache: optionalString(input.cache),
    firebase: optionalString(input.firebase),
  });
}

function parseNtfyAccount(payload: unknown): Record<string, unknown> {
  const account = requireNtfyObject(payload, "ntfy account response");

  return compactObject({
    username: optionalString(account.username),
    role: optionalString(account.role),
    sync_topic: optionalString(account.sync_topic),
    provisioned: optionalBoolean(account.provisioned),
    language: optionalString(account.language),
    date_format: optionalString(account.date_format),
    time_format: optionalString(account.time_format),
    tier: optionalRecord(account.tier),
    limits: optionalRecord(account.limits),
    stats: optionalRecord(account.stats),
    raw: account,
  });
}

function parseNtfyMessage(payload: unknown): Record<string, unknown> {
  const message = requireNtfyObject(payload, "ntfy publish response");

  return compactObject({
    id: optionalString(message.id),
    sequence_id: optionalString(message.sequence_id),
    time: optionalNumber(message.time),
    expires: optionalNumber(message.expires),
    event: optionalString(message.event),
    topic: optionalString(message.topic),
    title: optionalString(message.title),
    message: optionalString(message.message),
    priority: optionalNumber(message.priority),
    tags: Array.isArray(message.tags) ? message.tags : undefined,
    click: optionalString(message.click),
    icon: optionalString(message.icon),
    attachment: optionalRecord(message.attachment),
    content_type: optionalString(message.content_type),
    raw: message,
  });
}

function requireNtfyObject(payload: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(payload);
  if (!object) {
    throw new ProviderRequestError(502, `${label} was not a JSON object`);
  }

  return object;
}

function createNtfyHttpError(
  status: number,
  payload: unknown,
  rawBody: string,
  phase: NtfyRequestPhase,
): ProviderRequestError {
  const message = extractNtfyErrorMessage(payload, rawBody, status);
  const mappedStatus = phase === "validate" && (status === 401 || status === 403) ? 400 : status;

  return new ProviderRequestError(mappedStatus, message, payload);
}

function extractNtfyErrorMessage(payload: unknown, rawBody: string, status: number): string {
  const errorPayload = optionalRecord(payload);
  const errorMessage =
    optionalString(errorPayload?.error) ??
    optionalString(errorPayload?.message) ??
    optionalString(errorPayload?.detail);

  if (errorMessage) {
    return errorMessage;
  }

  const bodySnippet = rawBody.trim().slice(0, 200);
  return bodySnippet || `ntfy request failed with status ${status}`;
}
