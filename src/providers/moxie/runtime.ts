import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { objectArray, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
} from "../provider-runtime.ts";

export interface MoxieActionContext {
  apiKey: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const timeoutMs = 30_000;
const maxResponseBytes = 4 * 1024 * 1024;
const validationPath = "action/pipelineStages/list";

export const moxieActionHandlers: Record<string, ProviderRuntimeHandler<MoxieActionContext>> = {
  list_clients(_input, context) {
    return requestCollection(context, "action/clients/list", "clients");
  },
  search_clients(input, context) {
    return requestCollection(context, "action/clients/search", "clients", { query: input.query });
  },
  search_contacts(input, context) {
    return requestCollection(context, "action/contacts/search", "contacts", { query: input.query });
  },
  search_projects(input, context) {
    return requestCollection(context, "action/projects/search", "projects", { query: input.query });
  },
  list_pipeline_stages(_input, context) {
    return requestCollection(context, validationPath, "stages");
  },
  list_task_stages(_input, context) {
    return requestCollection(context, "action/taskStages/list", "stages");
  },
};

export async function validateMoxieCredential(
  input: { apiKey: string; values?: Record<string, string> },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<import("../../core/types.ts").CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", providerInputError).trim();
  const baseUrl = normalizeMoxieBaseUrl(input.values?.baseUrl);
  const payload = await requestMoxieJson({ apiKey, baseUrl, path: validationPath, fetcher, signal, validation: true });
  objectArray(payload, "Moxie pipeline stage response", providerResponseError);
  const host = new URL(baseUrl).host;
  return {
    profile: {
      accountId: `moxie:${createHash("sha256").update(baseUrl).digest("hex").slice(0, 24)}`,
      displayName: `Moxie @ ${host}`,
    },
    metadata: { baseUrl, validationEndpoint: `/${validationPath}` },
  };
}

export function normalizeMoxieBaseUrl(value: unknown): string {
  const raw = requiredString(value, "baseUrl", providerInputError).trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderRequestError(400, "baseUrl must be a valid HTTPS URL");
  }
  if (url.protocol !== "https:") throw new ProviderRequestError(400, "baseUrl must use HTTPS");
  if (url.username || url.password || url.search || url.hash) {
    throw new ProviderRequestError(400, "baseUrl must not include credentials, query parameters, or a fragment");
  }
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/`;
  return url.toString();
}

async function requestCollection(
  context: MoxieActionContext,
  path: string,
  key: "clients" | "contacts" | "projects" | "stages",
  query: Record<string, unknown> = {},
) {
  const payload = await requestMoxieJson({ ...context, path, query });
  return { [key]: objectArray(payload, `Moxie ${key} response`, providerResponseError) };
}

async function requestMoxieJson(input: {
  apiKey: string;
  baseUrl: string;
  path: string;
  query?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  validation?: boolean;
}): Promise<unknown> {
  const url = new URL(input.path, input.baseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    const text = optionalString(value);
    if (text != null) url.searchParams.set(key, text);
  }
  const timeout = createProviderTimeout(input.signal, timeoutMs);
  try {
    const response = await input.fetcher(url, {
      headers: { accept: "application/json", "user-agent": providerUserAgent, "x-api-key": input.apiKey },
      signal: timeout.signal,
    });
    const text = await readBoundedText(response);
    const payload = text ? parseJson(text, response.ok) : undefined;
    if (!response.ok) throw mapMoxieError(response.status, payload, input.validation === true);
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "Moxie request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Moxie request failed: ${error.message}` : "Moxie request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readBoundedText(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxResponseBytes) throw responseTooLarge();
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return text + decoder.decode();
      size += chunk.value.byteLength;
      if (size > maxResponseBytes) {
        await reader.cancel();
        throw responseTooLarge();
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

function parseJson(text: string, success: boolean): unknown {
  try {
    return JSON.parse(text);
  } catch {
    if (success) throw new ProviderRequestError(502, "Moxie returned invalid JSON");
    return text;
  }
}

function mapMoxieError(status: number, payload: unknown, validation: boolean): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    (typeof payload === "string" ? payload.trim() : "") ||
    optionalString(record?.message) ||
    optionalString(record?.error) ||
    `Moxie request failed with status ${status}`;
  if (validation && [400, 401, 403].includes(status)) return new ProviderRequestError(400, message);
  if (status === 401 || status === 403) return new ProviderRequestError(401, message);
  if ([400, 404, 422].includes(status)) return new ProviderRequestError(400, message);
  if (status === 429) return new ProviderRequestError(429, message);
  return new ProviderRequestError(status || 502, message);
}

function responseTooLarge(): ProviderRequestError {
  return new ProviderRequestError(502, `Moxie response exceeds ${maxResponseBytes} bytes`);
}
