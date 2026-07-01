import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { Api2pdfActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "api2pdf";
const api2pdfApiBaseUrl = "https://v2.api2pdf.com";
const api2pdfBalancePath = "/balance";
const api2pdfMarkdownToPdfPath = "/chrome/pdf/markdown";

type Api2pdfRequestPhase = "validate" | "execute";

interface Api2pdfActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type Api2pdfActionHandler = (input: Record<string, unknown>, context: Api2pdfActionContext) => Promise<unknown>;

export const api2pdfActionHandlers: Record<Api2pdfActionName, Api2pdfActionHandler> = {
  markdown_to_pdf(input, context) {
    return executeMarkdownToPdf(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<Api2pdfActionContext>({
  service,
  handlers: api2pdfActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<Api2pdfActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestApi2pdfJson({
      path: api2pdfBalancePath,
      apiKey: input.apiKey,
      method: "GET",
      phase: "validate",
      fetcher,
      signal,
    });

    return {
      profile: {
        accountId: "api_key",
        displayName: "API2PDF API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: api2pdfApiBaseUrl,
        validationEndpoint: api2pdfBalancePath,
        remainingBalance: extractBalanceValue(payload),
      }),
    };
  },
};

async function executeMarkdownToPdf(
  input: Record<string, unknown>,
  context: Api2pdfActionContext,
): Promise<unknown> {
  const markdown = requireApi2pdfString(input.markdown, "markdown");
  const fileName = optionalString(input.fileName);
  const inline = optionalBoolean(input.inline);
  const options = optionalRecord(input.options);

  const payload = await requestApi2pdfJson({
    path: api2pdfMarkdownToPdfPath,
    apiKey: context.apiKey,
    method: "POST",
    body: compactObject({
      markdown,
      fileName,
      inline,
      options,
    }),
    phase: "execute",
    fetcher: context.fetcher,
    signal: context.signal,
  });

  return normalizeMarkdownToPdfPayload(payload);
}

async function requestApi2pdfJson(input: {
  path: string;
  apiKey: string;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  phase: Api2pdfRequestPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(new URL(input.path, api2pdfApiBaseUrl), {
      method: input.method,
      headers: api2pdfHeaders(input.apiKey, input.method === "POST"),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
    payload = await readApi2pdfPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `API2PDF request failed: ${error.message}` : "API2PDF request failed",
    );
  }

  if (!response.ok) {
    throw createApi2pdfError(response, payload, input.phase);
  }

  return payload;
}

function api2pdfHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    Authorization: apiKey,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readApi2pdfPayload(response: Response): Promise<unknown> {
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

function createApi2pdfError(
  response: Response,
  payload: unknown,
  phase: Api2pdfRequestPhase,
): ProviderRequestError {
  const message = extractApi2pdfErrorMessage(payload) ?? response.statusText ?? "API2PDF request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (phase === "execute" && (response.status === 400 || response.status === 404 || response.status === 422)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? response.status : 502, message, payload);
}

function extractApi2pdfErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const data = optionalRecord(record.data);
  return (
    optionalString(record.message) ??
    optionalString(record.Message) ??
    optionalString(record.error) ??
    optionalString(record.Error) ??
    optionalString(record.detail) ??
    optionalString(record.Detail) ??
    optionalString(record.title) ??
    optionalString(record.Title) ??
    optionalString(data?.message) ??
    optionalString(data?.Message) ??
    optionalString(data?.error) ??
    optionalString(data?.Error) ??
    optionalString(data?.detail) ??
    optionalString(data?.Detail) ??
    optionalString(data?.title) ??
    optionalString(data?.Title)
  );
}

function extractBalanceValue(payload: unknown): number | undefined {
  if (typeof payload === "number" && Number.isFinite(payload)) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalNumber(record.balance) ??
    optionalNumber(record.remainingBalance) ??
    optionalNumber(record.credits) ??
    optionalNumber(record.Balance) ??
    optionalNumber(record.RemainingBalance) ??
    optionalNumber(record.Credits)
  );
}

function normalizeMarkdownToPdfPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "API2PDF returned invalid JSON", payload);
  }

  const data = optionalRecord(record.data) ?? record;
  const pdfUrl =
    optionalString(data.pdf) ??
    optionalString(data.Pdf) ??
    optionalString(data.fileUrl) ??
    optionalString(data.FileUrl) ??
    null;
  const success =
    optionalBoolean(data.success) ??
    optionalBoolean(data.Success) ??
    optionalBoolean(record.successful) ??
    optionalBoolean(record.Successful) ??
    pdfUrl !== null;
  const error = extractApi2pdfErrorMessage(record) ?? null;

  if (!success) {
    throw new ProviderRequestError(502, error ?? "API2PDF markdown conversion failed", payload);
  }
  if (!pdfUrl) {
    throw new ProviderRequestError(502, "API2PDF markdown response did not include a pdf url", payload);
  }

  return {
    pdfUrl,
    success,
    responseId: optionalString(data.responseId) ?? optionalString(data.ResponseId) ?? null,
    cost: optionalNumber(data.cost ?? data.Cost) ?? null,
    mbIn: optionalNumber(data.mbIn ?? data.MbIn) ?? null,
    mbOut: optionalNumber(data.mbOut ?? data.MbOut) ?? null,
    seconds: optionalNumber(data.seconds ?? data.Seconds) ?? null,
    error,
  };
}

function requireApi2pdfString(value: unknown, fieldName: string): string {
  const resolved = optionalString(value);
  if (resolved) {
    return resolved;
  }

  throw new ProviderRequestError(400, `${fieldName} is required`);
}
