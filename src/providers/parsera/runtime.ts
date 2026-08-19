import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const parseraApiBaseUrl = "https://api.parsera.org";
const parseraValidationPath = "/readyz";

type ParseraRequestPhase = "validate" | "execute";
type ParseraActionContext = ApiKeyProviderContext;
type ParseraActionHandler = (input: Record<string, unknown>, context: ParseraActionContext) => Promise<unknown>;

export const parseraActionHandlers: ProviderActionHandlers<"parsera", ParseraActionHandler> = {
  extract: parseraPostAction("/v1/extractor/extract", buildExtractorBody),
  parse: parseraPostAction("/v1/extractor/parse", buildExtractorBody),
  async extract_markdown(input, context) {
    const payload = await parseraPostJson(
      "/v1/extractor/extract_markdown",
      buildExtractorBody(input),
      context.apiKey,
      context.fetcher,
      "execute",
    );
    return normalizeMarkdownPayload(payload);
  },
  list_llm_specs: parseraGetAction("/llm-specs"),
  list_proxy_countries: parseraGetAction("/proxy-countries"),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("parsera", parseraActionHandlers);

export async function validateParseraCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await parseraGetJson(parseraValidationPath, apiKey, fetcher, "validate");

  return {
    profile: {
      accountId: "parsera-api-key",
      displayName: "Parsera API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: parseraApiBaseUrl,
      validationEndpoint: parseraValidationPath,
      ready: readReadyStatus(payload),
    }),
  };
}

function parseraPostAction(
  path: string,
  buildBody: (input: Record<string, unknown>) => Record<string, unknown>,
): ParseraActionHandler {
  return (input, context) => parseraPostJson(path, buildBody(input), context.apiKey, context.fetcher, "execute");
}

function parseraGetAction(path: string): ParseraActionHandler {
  return (_input, context) => parseraGetJson(path, context.apiKey, context.fetcher, "execute");
}

function buildExtractorBody(input: Record<string, unknown>) {
  return compactObject({
    ...input,
    proxy_country: input.proxyCountry,
    proxyCountry: undefined,
  });
}

async function parseraGetJson(path: string, apiKey: string, fetcher: typeof fetch, phase: ParseraRequestPhase) {
  let response: Response;
  try {
    response = await fetcher(new URL(path, parseraApiBaseUrl), {
      method: "GET",
      headers: parseraHeaders(apiKey, false),
    });
  } catch (error) {
    throw parseraNetworkError(error);
  }

  const payload = await readParseraPayload(response);
  if (!response.ok) {
    throw createParseraError(response, payload, phase);
  }

  return payload;
}

async function parseraPostJson(
  path: string,
  body: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  phase: ParseraRequestPhase,
) {
  let response: Response;
  try {
    response = await fetcher(new URL(path, parseraApiBaseUrl), {
      method: "POST",
      headers: parseraHeaders(apiKey, true),
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw parseraNetworkError(error);
  }

  const payload = await readParseraPayload(response);
  if (!response.ok) {
    throw createParseraError(response, payload, phase);
  }

  return payload;
}

function parseraHeaders(apiKey: string, hasBody: boolean) {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "X-API-KEY": apiKey,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readParseraPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Parsera returned malformed JSON");
    }
    return text;
  }
}

function createParseraError(response: Response, payload: unknown, phase: ParseraRequestPhase) {
  const extractedMessage = extractParseraErrorMessage(payload) ?? response.statusText;
  const message = extractedMessage || "Parsera request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 500, message, payload);
}

function extractParseraErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const detail = record.detail;
  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const firstDetail = detail.find((item) => {
      const itemRecord = optionalRecord(item);
      return typeof itemRecord?.msg === "string";
    });
    const firstDetailRecord = optionalRecord(firstDetail);
    if (typeof firstDetailRecord?.msg === "string") {
      return firstDetailRecord.msg;
    }
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.error_message) ??
    optionalString(record.title)
  );
}

function normalizeMarkdownPayload(payload: unknown) {
  const record = optionalRecord(payload);
  const markdown = optionalString(record?.markdown) ?? optionalString(record?.content) ?? optionalString(record?.data);

  return {
    markdown: markdown ?? null,
    raw: payload,
  };
}

function readReadyStatus(payload: unknown) {
  if (typeof payload === "string") {
    return payload;
  }
  const record = optionalRecord(payload);
  return optionalString(record?.status) ?? optionalString(record?.message) ?? optionalString(record?.ready);
}

function parseraNetworkError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
  const isTimeout =
    (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) ||
    errorCode === "ETIMEDOUT" ||
    errorCode === "ECONNABORTED" ||
    message.toLowerCase().includes("timeout") ||
    message.toLowerCase().includes("timed out");

  return new ProviderRequestError(
    isTimeout ? 504 : 502,
    error instanceof Error ? `Parsera request failed: ${error.message}` : "Parsera request failed",
  );
}
