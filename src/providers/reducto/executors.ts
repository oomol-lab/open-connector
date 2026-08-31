import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "reducto";
const reductoApiBaseUrl = "https://platform.reducto.ai";
const reductoDefaultRequestTimeoutMs = 120_000;

type ReductoPhase = "validate" | "execute";
type ReductoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const reductoActionHandlers: ProviderActionHandlers<"reducto", ReductoActionHandler> = {
  parse_document(input, context) {
    return executeParseDocument(input, context);
  },
  extract_data(input, context) {
    return executeExtractData(input, context);
  },
  split_document(input, context) {
    return executeSplitDocument(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, reductoActionHandlers);

export const credentialValidators = {
  async apiKey(
    input: { apiKey: string; values: Record<string, string> },
    options: { fetcher: typeof fetch; signal?: AbortSignal },
  ): Promise<CredentialValidationResult> {
    await reductoGetJson(
      "/jobs",
      { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
      "validate",
      {
        exclude_configs: "true",
        limit: "1",
      },
    );
    return {
      profile: {
        accountId: "reducto-api-key",
        displayName: "Reducto API Key",
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: reductoApiBaseUrl,
        validationEndpoint: "/jobs",
      },
    };
  },
};

async function executeParseDocument(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await reductoPostJson(
    "/parse",
    compactObject({
      input: readRequiredDocumentUrl(input),
      enhance: optionalRecord(input.enhance),
      retrieval: optionalRecord(input.retrieval),
      formatting: optionalRecord(input.formatting),
      spreadsheet: optionalRecord(input.spreadsheet),
      settings: optionalRecord(input.settings),
    }),
    context,
  );
  return normalizeReductoResponse(payload);
}

async function executeExtractData(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await reductoPostJson(
    "/extract",
    compactObject({
      input: readRequiredDocumentUrl(input),
      instructions: compactObject({
        schema: optionalRecord(input.schema) ?? {},
        system_prompt: readOptionalTrimmedString(input.systemPrompt),
      }),
      parsing: optionalRecord(input.parsing),
      settings: optionalRecord(input.settings),
    }),
    context,
  );
  return normalizeReductoResponse(payload);
}

async function executeSplitDocument(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await reductoPostJson(
    "/split",
    compactObject({
      input: readRequiredDocumentUrl(input),
      split_description: input.splitDescription,
      split_rules: readOptionalTrimmedString(input.splitRules),
      parsing: optionalRecord(input.parsing),
      settings: optionalRecord(input.settings),
    }),
    context,
  );
  return normalizeSplitResponse(payload);
}

async function reductoGetJson(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: ReductoPhase,
  params: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(path, reductoApiBaseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return reductoRequestJson(
    url,
    {
      method: "GET",
      headers: reductoHeaders(context.apiKey, { accept: "application/json" }),
    },
    phase,
    context,
  );
}

async function reductoPostJson(
  path: string,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return reductoRequestJson(
    new URL(path, reductoApiBaseUrl),
    {
      method: "POST",
      headers: reductoHeaders(context.apiKey, {
        accept: "application/json",
        "content-type": "application/json",
      }),
      body: JSON.stringify(body),
    },
    "execute",
    context,
  );
}

async function reductoRequestJson(
  url: URL,
  init: RequestInit,
  phase: ReductoPhase,
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
): Promise<unknown> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), reductoDefaultRequestTimeoutMs);
  const abortListener = (): void => timeoutController.abort();
  context.signal?.addEventListener("abort", abortListener, { once: true });
  try {
    const response = await context.fetcher(url, {
      ...init,
      signal: timeoutController.signal,
    });
    const payload = await readReductoPayload(response);
    if (!response.ok) {
      throw createReductoError(response, payload, phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(502, "Reducto request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Reducto request failed: ${error.message}` : "Reducto request failed",
    );
  } finally {
    clearTimeout(timeout);
    context.signal?.removeEventListener("abort", abortListener);
  }
}

function reductoHeaders(apiKey: string, extraHeaders: Record<string, string>): Record<string, string> {
  return {
    "user-agent": providerUserAgent,
    Authorization: `Bearer ${apiKey}`,
    ...extraHeaders,
  };
}

async function readReductoPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createReductoError(response: Response, payload: unknown, phase: ReductoPhase): ProviderRequestError {
  const message =
    extractReductoErrorMessage(payload) ??
    response.statusText ??
    `Reducto request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 401 : 401, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function extractReductoErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const detail = record.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail)) {
    for (const item of detail) {
      const message = optionalString(optionalRecord(item)?.msg);
      if (message) {
        return message;
      }
    }
  }
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.error_info);
}

function normalizeReductoResponse(payload: unknown): Record<string, unknown> {
  const record = requirePayloadRecord(payload);
  return {
    jobId: optionalString(record.job_id) ?? null,
    duration: typeof record.duration === "number" ? record.duration : null,
    pdfUrl: optionalString(record.pdf_url) ?? null,
    studioLink: optionalString(record.studio_link) ?? null,
    usage: optionalRecord(record.usage) ?? null,
    result: record.result,
    raw: record,
  };
}

function normalizeSplitResponse(payload: unknown): Record<string, unknown> {
  const record = requirePayloadRecord(payload);
  const result = optionalRecord(record.result);
  return {
    sectionMapping: optionalRecord(result?.section_mapping) ?? null,
    splits: Array.isArray(result?.splits) ? result.splits : [],
    usage: optionalRecord(record.usage) ?? null,
    result: record.result,
    raw: record,
  };
}

function requirePayloadRecord(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Reducto returned an invalid payload");
  }
  return record;
}

function readRequiredDocumentUrl(input: Record<string, unknown>): string {
  return requiredString(input.documentUrl, "documentUrl", (message) => new ProviderRequestError(400, message));
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  return optionalString(value);
}
