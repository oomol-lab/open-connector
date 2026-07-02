import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { WebvizioActionName } from "./actions.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const webvizioApiBaseUrl = "https://app.webvizio.com/api/v1";
const webvizioWebhookPath = "/webhook";
const webvizioValidationEvent = "task.created";
const webvizioValidationUrl = "https://example.com/oomol-connect/webvizio/validate";
const webvizioDefaultRequestTimeoutMs = 30_000;

type WebvizioPhase = "validate" | "execute";
type WebvizioActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface WebvizioRequestInput {
  path: string;
  method: "POST" | "DELETE";
  phase: WebvizioPhase;
  body?: Record<string, unknown>;
}

export const webvizioActionHandlers: Record<WebvizioActionName, WebvizioActionHandler> = {
  async create_rest_hook_subscription(input, context) {
    const url = requiredString(input.url, "url", providerInputError);
    const event = requiredString(input.event, "event", providerInputError);
    const response = await requestWebvizioJson(
      {
        path: webvizioWebhookPath,
        method: "POST",
        phase: "execute",
        body: { url, event },
      },
      context,
    );
    return { id: readWebhookId(response), event, url };
  },
  async delete_rest_hook_subscription(input, context) {
    const id = readRequiredWebhookId(input, "id");
    await requestWebvizioJson(
      {
        path: `${webvizioWebhookPath}/${id}`,
        method: "DELETE",
        phase: "execute",
      },
      context,
    );
    return { deleted: true, id };
  },
};

export async function validateWebvizioCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = { apiKey, fetcher, signal };
  const created = await requestWebvizioJson(
    {
      path: webvizioWebhookPath,
      method: "POST",
      phase: "validate",
      body: {
        url: webvizioValidationUrl,
        event: webvizioValidationEvent,
      },
    },
    context,
  );
  const webhookId = readWebhookId(created);
  await requestWebvizioJson(
    {
      path: `${webvizioWebhookPath}/${webhookId}`,
      method: "DELETE",
      phase: "validate",
    },
    context,
  );
  return {
    profile: {
      accountId: "webvizio-personal-access-token",
      displayName: "Webvizio Personal Access Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: webvizioApiBaseUrl,
      validationEndpoint: `POST ${webvizioWebhookPath} -> DELETE ${webvizioWebhookPath}/{id}`,
      validationEvent: webvizioValidationEvent,
      validationWebhookId: webhookId,
    },
  };
}

async function requestWebvizioJson(
  input: WebvizioRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, webvizioDefaultRequestTimeoutMs);
  try {
    const response = await context.fetcher(buildWebvizioUrl(input.path), {
      method: input.method,
      headers: buildWebvizioHeaders(context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readWebvizioPayload(response);
    if (!response.ok) throw createWebvizioError(response.status, payload, input.phase);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      timeout.didTimeout() || isAbortLikeError(error) ? 504 : 502,
      timeout.didTimeout() || isAbortLikeError(error)
        ? `Webvizio request timed out after ${Math.max(1, Math.ceil(webvizioDefaultRequestTimeoutMs / 1000))} seconds`
        : error instanceof Error
          ? `Webvizio request failed: ${error.message}`
          : "Webvizio request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildWebvizioUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, `${webvizioApiBaseUrl}/`).toString();
}

function buildWebvizioHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) headers["content-type"] = "application/json";
  return headers;
}

async function readWebvizioPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createWebvizioError(status: number, payload: unknown, phase: WebvizioPhase): ProviderRequestError {
  const message = extractWebvizioErrorMessage(payload) ?? `Webvizio request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if ((status === 401 || status === 403) && phase === "validate")
    return new ProviderRequestError(400, message, payload);
  if ((status === 401 || status === 403) && phase === "execute")
    return new ProviderRequestError(status, message, payload);
  if (status >= 400 && status < 500) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status || 502, message, payload);
}

function extractWebvizioErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.errorMessage);
}

function readWebhookId(payload: unknown): number {
  const parsed = Number(optionalRecord(payload)?.id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(502, "Webvizio returned an invalid webhook ID", payload);
  }
  return parsed;
}

function readRequiredWebhookId(input: Record<string, unknown>, key: string): number {
  const parsed = Number(input[key]);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new ProviderRequestError(400, `${key} must be a positive integer`);
  return parsed;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
