import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

type WebscrapingAiPhase = "validate" | "execute";
type WebscrapingAiQueryValue = string | number | boolean | readonly string[] | undefined;
type WebscrapingAiActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type WebscrapingAiActionHandler = (
  input: Record<string, unknown>,
  context: WebscrapingAiActionContext,
) => Promise<unknown>;

interface WebscrapingAiRequestInput {
  path: string;
  query?: Record<string, WebscrapingAiQueryValue>;
  accept: string;
}

export const webscrapingAiApiBaseUrl = "https://api.webscraping.ai";

export const webscrapingAiActionHandlers: ProviderActionHandlers<"webscraping_ai", WebscrapingAiActionHandler> = {
  async get_account_info(_input, context) {
    return {
      account: await requestWebscrapingAiAccount(context.apiKey, context.fetcher, context.signal, "execute"),
    };
  },
  fetch_html(input, context) {
    return requestWebscrapingAiText(
      {
        path: "/html",
        query: {
          ...buildCommonScrapeQuery(input),
          format: "text",
          return_script_result: optionalBoolean(input.returnScriptResult),
        },
        accept: "text/html, text/plain, application/json",
      },
      context,
    );
  },
  extract_text(input, context) {
    return requestWebscrapingAiText(
      {
        path: "/text",
        query: {
          ...buildCommonScrapeQuery(input),
          text_format: optionalString(input.textFormat),
          return_links: optionalBoolean(input.returnLinks),
        },
        accept: "text/plain, text/html, text/xml, application/json",
      },
      context,
    );
  },
  select_html(input, context) {
    return requestWebscrapingAiText(
      {
        path: "/selected",
        query: {
          ...buildCommonScrapeQuery(input),
          selector: requiredInputString(input.selector, "selector"),
          format: "text",
        },
        accept: "text/html, text/plain, application/json",
      },
      context,
    );
  },
  select_multiple_html(input, context) {
    return requestWebscrapingAiSelectedMultiple(input, context);
  },
};

export async function validateWebscrapingAiCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = requiredInputString(apiKey, "apiKey");
  const account = await requestWebscrapingAiAccount(trimmedApiKey, fetcher, signal, "validate");
  const email = optionalString(account.email);

  return {
    profile: {
      accountId: email ?? "webscraping_ai:api_key",
      displayName: email ?? "WebScraping.AI API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: webscrapingAiApiBaseUrl,
      validationEndpoint: "/account",
      email,
      remainingApiCalls: optionalInteger(account.remaining_api_calls),
      resetsAt: optionalInteger(account.resets_at),
      remainingConcurrency: optionalInteger(account.remaining_concurrency),
    }),
  };
}

async function requestWebscrapingAiText(
  input: WebscrapingAiRequestInput,
  context: WebscrapingAiActionContext,
): Promise<Record<string, unknown>> {
  const response = await requestWebscrapingAiRaw(input, context, "execute");
  return {
    content: await response.text(),
    statusCode: response.status,
    contentType: response.headers.get("content-type"),
  };
}

async function requestWebscrapingAiSelectedMultiple(
  input: Record<string, unknown>,
  context: WebscrapingAiActionContext,
): Promise<Record<string, unknown>> {
  const response = await requestWebscrapingAiRaw(
    {
      path: "/selected-multiple",
      query: {
        ...buildCommonScrapeQuery(input),
        selectors: readStringArray(input.selectors, "selectors"),
      },
      accept: "application/json",
    },
    context,
    "execute",
  );
  const payload = await readWebscrapingAiJson(response, "WebScraping.AI selected areas response");
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "WebScraping.AI selected areas response must be an array");
  }

  return {
    areas: payload.map((item) => {
      if (typeof item !== "string") {
        throw new ProviderRequestError(502, "WebScraping.AI selected areas response must contain strings");
      }
      return item;
    }),
    statusCode: response.status,
    contentType: response.headers.get("content-type"),
  };
}

async function requestWebscrapingAiAccount(
  apiKey: string,
  fetcher: ProviderFetch,
  signal: AbortSignal | undefined,
  phase: WebscrapingAiPhase,
): Promise<Record<string, unknown>> {
  const response = await requestWebscrapingAiRaw(
    {
      path: "/account",
      accept: "application/json",
    },
    { apiKey, fetcher, signal },
    phase,
  );
  const payload = await readWebscrapingAiJson(response, "WebScraping.AI account response");
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "WebScraping.AI account response must be an object");
  }

  return Object.fromEntries(Object.entries(record));
}

async function requestWebscrapingAiRaw(
  input: WebscrapingAiRequestInput,
  context: WebscrapingAiActionContext,
  phase: WebscrapingAiPhase,
): Promise<Response> {
  const url = buildWebscrapingAiUrl(input.path, context.apiKey, input.query ?? {});

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: input.accept,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "WebScraping.AI request was aborted");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `WebScraping.AI request failed: ${error.message}` : "WebScraping.AI request failed",
      error,
    );
  }

  if (!response.ok) {
    throw await createWebscrapingAiError(response, phase);
  }

  return response;
}

function buildWebscrapingAiUrl(path: string, apiKey: string, query: Record<string, WebscrapingAiQueryValue>): URL {
  const url = new URL(path, webscrapingAiApiBaseUrl);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

function buildCommonScrapeQuery(input: Record<string, unknown>): Record<string, WebscrapingAiQueryValue> {
  return compactObject({
    url: readTargetUrl(input.url),
    headers: serializeHeaders(input.headers),
    timeout: optionalInteger(input.timeout),
    js: optionalBoolean(input.js),
    js_timeout: optionalInteger(input.jsTimeout),
    wait_for: optionalString(input.waitFor),
    proxy: optionalString(input.proxy),
    country: optionalString(input.country),
    device: optionalString(input.device),
    error_on_404: optionalBoolean(input.errorOn404),
    error_on_redirect: optionalBoolean(input.errorOnRedirect),
    js_script: optionalString(input.jsScript),
  });
}

function readTargetUrl(value: unknown): string {
  const rawUrl = requiredInputString(value, "url");
  const url = assertPublicHttpUrl(rawUrl, {
    fieldName: "url",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "url must not include credentials");
  }
  return url.toString();
}

function serializeHeaders(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const headers = requiredRecord(value, "headers", providerInputError);
  const result: Record<string, string> = {};
  for (const [key, child] of Object.entries(headers)) {
    if (typeof child !== "string") {
      throw new ProviderRequestError(400, "headers values must be strings");
    }
    result[key] = child;
  }
  return JSON.stringify(result);
}

async function readWebscrapingAiJson(response: Response, label: string): Promise<unknown> {
  const body = await response.text();
  if (!body.trim()) {
    throw new ProviderRequestError(502, `${label} was empty`);
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ProviderRequestError(502, `${label} was not valid JSON`);
  }
}

async function createWebscrapingAiError(response: Response, phase: WebscrapingAiPhase): Promise<ProviderRequestError> {
  const body = await response.text();
  const message =
    extractWebscrapingAiErrorMessage(body) ?? `WebScraping.AI request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && response.status === 403) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && response.status === 403) {
    return new ProviderRequestError(403, message);
  }
  if (response.status === 400) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 504) {
    return new ProviderRequestError(504, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : 500, message);
}

function extractWebscrapingAiErrorMessage(body: string): string | undefined {
  const trimmed = body.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const payload = JSON.parse(trimmed) as unknown;
    const record = optionalRecord(payload);
    if (record) {
      const message = optionalString(record.message);
      const statusMessage = optionalString(record.status_message);
      if (message && statusMessage) {
        return `${message}: ${statusMessage}`;
      }
      return message ?? statusMessage;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function readStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => {
    const text = optionalString(item);
    if (!text) {
      throw new ProviderRequestError(400, `${fieldName} must contain strings`);
    }
    return text;
  });
}
