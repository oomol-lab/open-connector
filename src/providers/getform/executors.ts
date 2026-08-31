import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "getform";
const getformSubmitBaseUrl = "https://forminit.com";
const getformApiOrigin = "https://api.forminit.com";
const getformApiBasePath = "/v1";

type GetformRequestPhase = "validate" | "execute";
type GetformActionContext = ApiKeyProviderContext;
type GetformActionHandler = (input: Record<string, unknown>, context: GetformActionContext) => Promise<unknown>;

type GetformErrorPayload = {
  success?: unknown;
  error?: unknown;
  code?: unknown;
  statusCode?: unknown;
  message?: unknown;
};

export const getformActionHandlers: ProviderActionHandlers<"getform", GetformActionHandler> = {
  submit_form(input, context) {
    return submitForm(input, context);
  },
  list_submissions(input, context) {
    return listSubmissions(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, getformActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    if (!input.apiKey.trim()) {
      throw new ProviderRequestError(400, "getform apiKey is required");
    }

    return {
      profile: {
        accountId: "api_key",
        displayName: "Getform API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: `${getformApiOrigin}${getformApiBasePath}`,
        validationMode: "format_only",
        authMode: "protected",
      },
    };
  },
};

async function submitForm(input: Record<string, unknown>, context: GetformActionContext): Promise<unknown> {
  assertNoFileBlocks(input.blocks);

  return requestGetform(
    new URL(`/f/${encodeURIComponent(requiredInputString(input.formId, "formId"))}`, getformSubmitBaseUrl),
    {
      method: "POST",
      headers: getformHeaders(context.apiKey, {
        "content-type": "application/json",
      }),
      body: JSON.stringify({
        blocks: input.blocks,
      }),
    },
    context,
    "execute",
  );
}

async function listSubmissions(input: Record<string, unknown>, context: GetformActionContext): Promise<unknown> {
  const formId = requiredInputString(input.formId, "formId");
  const url = new URL(`${getformApiBasePath}/forms/${encodeURIComponent(formId)}`, getformApiOrigin);

  const page = optionalInteger(input.page);
  if (page !== undefined) {
    url.searchParams.set("page", String(page));
  }

  const size = optionalInteger(input.size);
  if (size !== undefined) {
    url.searchParams.set("size", String(size));
  }

  const query = optionalString(input.query);
  if (query) {
    url.searchParams.set("query", query);
  }

  const files = optionalBoolean(input.files);
  if (files !== undefined) {
    url.searchParams.set("files", files ? "true" : "false");
  }

  const timezone = optionalString(input.timezone);
  if (timezone) {
    url.searchParams.set("timezone", timezone);
  }

  return requestGetform(
    url,
    {
      method: "GET",
      headers: getformHeaders(context.apiKey),
    },
    context,
    "execute",
  );
}

function assertNoFileBlocks(blocks: unknown): void {
  if (!Array.isArray(blocks)) {
    return;
  }

  for (const block of blocks) {
    const record = optionalRecord(block);
    if (record?.type === "file") {
      throw new ProviderRequestError(
        400,
        "getform submit_form does not support file blocks in the first pass; use non-file JSON blocks only",
      );
    }
  }
}

async function requestGetform(
  url: URL,
  init: RequestInit,
  context: GetformActionContext,
  phase: GetformRequestPhase,
): Promise<unknown> {
  let response: Response;

  try {
    response = await context.fetcher(url.toString(), {
      ...init,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `getform request failed: ${error.message}` : "getform request failed",
      error,
    );
  }

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    const payload = parseGetformErrorPayload(text);
    throw createGetformError(response.status, payload, phase);
  }

  const payload = parseGetformPayload(text);
  const record = optionalRecord(payload);
  if (record?.success === false) {
    throw createGetformError(response.status, payload, phase);
  }

  return payload;
}

function parseGetformErrorPayload(text: string): unknown {
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function parseGetformPayload(text: string): unknown {
  if (!text.trim()) {
    throw new ProviderRequestError(502, "empty getform response");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "invalid getform JSON response");
  }
}

function createGetformError(status: number, payload: unknown, phase: GetformRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload) as GetformErrorPayload | undefined;
  const normalizedStatus = normalizeGetformErrorStatus(status, record);
  const message = readGetformErrorMessage(record, normalizedStatus);

  if (normalizedStatus === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "execute" && normalizedStatus === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (normalizedStatus === 400 || normalizedStatus === 401 || normalizedStatus === 403 || normalizedStatus === 404) {
    return new ProviderRequestError(normalizedStatus === 401 ? 400 : normalizedStatus, message, payload);
  }

  return new ProviderRequestError(normalizedStatus >= 500 ? 502 : normalizedStatus, message, payload);
}

function normalizeGetformErrorStatus(status: number, record: GetformErrorPayload | undefined): number {
  for (const candidate of [record?.code, record?.statusCode]) {
    if (typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 400) {
      return candidate;
    }
  }

  return status >= 400 ? status : 502;
}

function readGetformErrorMessage(record: GetformErrorPayload | undefined, status: number): string {
  if (typeof record?.message === "string" && record.message.trim()) {
    return record.message;
  }
  if (typeof record?.error === "string" && record.error.trim()) {
    return record.error;
  }

  switch (status) {
    case 400:
      return "getform request is invalid";
    case 401:
      return "getform api key is missing or invalid";
    case 403:
      return "getform request is forbidden";
    case 404:
      return "getform resource not found";
    case 429:
      return "getform rate limit exceeded";
    default:
      return "getform request failed";
  }
}

function getformHeaders(apiKey: string, extraHeaders?: HeadersInit): Headers {
  const headers = new Headers(extraHeaders);
  headers.set("accept", "application/json");
  headers.set("user-agent", providerUserAgent);
  headers.set("x-api-key", apiKey);
  return headers;
}
