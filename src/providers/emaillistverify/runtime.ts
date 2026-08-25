import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { base64Bytes, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const emailListVerifyApiBaseUrl = "https://apps.emaillistverify.com";
const emailListVerifyApiKeyRejectedStatus = "error_credit";
const emailListVerifyDefaultRequestTimeoutMs = 30_000;

type EmailListVerifyRequestPhase = "validate" | "execute";
type EmailListVerifyResponseType = "auto" | "binary";
type EmailListVerifyActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const emailListVerifyActionHandlers: ProviderActionHandlers<"emaillistverify", EmailListVerifyActionHandler> = {
  async verify_email(input, context) {
    const email = requiredString(input.email, "email", badInput);
    const status = await requestEmailListVerifyStatus({
      apiKey: context.apiKey,
      email,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });

    return {
      email,
      status,
    };
  },
  verify_email_detailed(input, context) {
    return requestEmailListVerifyDetailed({
      apiKey: context.apiKey,
      email: requiredString(input.email, "email", badInput),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  get_credits(_input, context) {
    return requestEmailListVerifyCredits({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  upload_email_list(input, context) {
    return requestEmailListVerifyUpload({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      input,
    });
  },
  check_disposable(input, context) {
    return requestEmailListVerifyCheckDisposable({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      domain: requiredString(input.domain, "domain", badInput),
    });
  },
  get_email_list_progress(input, context) {
    return requestEmailListVerifyEmailListProgress({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      emailListId: requiredString(input.emailListId, "emailListId", badInput),
    });
  },
  download_email_list(input, context) {
    return requestEmailListVerifyDownload({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      emailListId: requiredString(input.emailListId, "emailListId", badInput),
      format: optionalString(input.format),
      results: Array.isArray(input.results) ? input.results.map(String) : undefined,
    });
  },
  delete_email_list(input, context) {
    return requestEmailListVerifyDelete({
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
      emailListId: requiredString(input.emailListId, "emailListId", badInput),
    });
  },
};

export async function validateEmailListVerifyCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credits = await requestEmailListVerifyCredits({
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: buildEmailListVerifyProviderAccountId(apiKey),
      displayName: "EmailListVerify API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: emailListVerifyApiBaseUrl,
      validationEndpoint: "/api/credits",
      credits,
    },
  };
}

async function requestEmailListVerifyStatus(input: EmailListVerifyRequestInput & { email: string }): Promise<string> {
  const { payload } = await requestEmailListVerifyApi({
    path: "/api/verifyEmail",
    apiKey: input.apiKey,
    query: {
      email: input.email,
    },
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });

  const status = typeof payload === "string" ? payload.trim() : "";
  if (!status) {
    throw new ProviderRequestError(502, "EmailListVerify verifyEmail response was empty");
  }
  if (status === emailListVerifyApiKeyRejectedStatus) {
    throw mapEmailListVerifyRejectedApiKey(input.phase);
  }

  return status;
}

async function requestEmailListVerifyDetailed(
  input: EmailListVerifyRequestInput & { email: string },
): Promise<Record<string, unknown>> {
  const { payload } = await requestEmailListVerifyApi({
    path: "/api/verifyEmailDetailed",
    apiKey: input.apiKey,
    query: {
      email: input.email,
    },
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });

  const record = requireEmailListVerifyObject(payload, "/api/verifyEmailDetailed");
  if (optionalString(record.result) === emailListVerifyApiKeyRejectedStatus) {
    throw mapEmailListVerifyRejectedApiKey(input.phase);
  }
  return record;
}

async function requestEmailListVerifyCredits(input: EmailListVerifyRequestInput): Promise<Record<string, unknown>> {
  const { payload } = await requestEmailListVerifyApi({
    path: "/api/credits",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });

  return requireEmailListVerifyObject(payload, "/api/credits");
}

async function requestEmailListVerifyUpload(
  input: EmailListVerifyRequestInput & { input: Record<string, unknown> },
): Promise<{ emailListId: string }> {
  const fileName = requiredString(input.input.fileName, "fileName", badInput);
  const quality = optionalString(input.input.quality);
  const contentText = optionalString(input.input.contentText);
  const contentBase64 = optionalString(input.input.contentBase64);
  const bytes = resolveEmailListVerifyUploadBytes(contentText, contentBase64);

  const formData = new FormData();
  formData.set(
    "file_contents",
    new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], {
      type: inferEmailListVerifyUploadMimeType(fileName),
    }),
    fileName,
  );
  if (quality) {
    formData.set("quality", quality);
  }

  const { payload } = await requestEmailListVerifyApi({
    path: "/api/verifyApiFile",
    method: "POST",
    apiKey: input.apiKey,
    body: formData,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });

  const emailListId = typeof payload === "string" ? payload.trim() : "";
  if (!emailListId) {
    throw new ProviderRequestError(502, "EmailListVerify upload response was empty");
  }

  return {
    emailListId,
  };
}

async function requestEmailListVerifyCheckDisposable(
  input: EmailListVerifyRequestInput & { domain: string },
): Promise<Record<string, unknown>> {
  const { payload } = await requestEmailListVerifyApi({
    path: "/api/checkDisposable",
    method: "POST",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    query: {
      domain: input.domain,
    },
  });

  return requireEmailListVerifyObject(payload, "/api/checkDisposable");
}

async function requestEmailListVerifyEmailListProgress(
  input: EmailListVerifyRequestInput & { emailListId: string },
): Promise<Record<string, unknown>> {
  const { payload } = await requestEmailListVerifyApi({
    path: `/api/maillists/${encodeURIComponent(input.emailListId)}/progress`,
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });

  return requireEmailListVerifyObject(payload, "/api/maillists/{id}/progress");
}

async function requestEmailListVerifyDownload(
  input: EmailListVerifyRequestInput & { emailListId: string; format?: string; results?: string[] },
): Promise<{ fileName: string; contentType: string; contentBase64: string }> {
  const { payload, response } = await requestEmailListVerifyApi({
    path: `/api/maillists/${encodeURIComponent(input.emailListId)}`,
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
    responseType: "binary",
    query: {
      format: input.format,
      results: input.results?.join(","),
    },
  });

  if (!(payload instanceof Uint8Array)) {
    throw new ProviderRequestError(502, "EmailListVerify download response was not binary content");
  }

  return {
    fileName: resolveEmailListVerifyDownloadFileName(response, input.emailListId, input.format),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    contentBase64: Buffer.from(payload).toString("base64"),
  };
}

async function requestEmailListVerifyDelete(
  input: EmailListVerifyRequestInput & { emailListId: string },
): Promise<{ deleted: boolean; emailListId: string }> {
  await requestEmailListVerifyApi({
    path: `/api/maillists/${encodeURIComponent(input.emailListId)}`,
    method: "DELETE",
    apiKey: input.apiKey,
    fetcher: input.fetcher,
    signal: input.signal,
    phase: input.phase,
  });

  return {
    deleted: true,
    emailListId: input.emailListId,
  };
}

interface EmailListVerifyRequestInput {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: EmailListVerifyRequestPhase;
}

async function requestEmailListVerifyApi(
  input: EmailListVerifyRequestInput & {
    path: string;
    method?: "GET" | "POST" | "DELETE";
    query?: Record<string, string | undefined>;
    body?: BodyInit;
    responseType?: EmailListVerifyResponseType;
  },
): Promise<{ response: Response; payload: unknown }> {
  const url = new URL(input.path, emailListVerifyApiBaseUrl);
  url.searchParams.set("secret", input.apiKey);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.signal, emailListVerifyDefaultRequestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: input.responseType === "binary" ? "*/*" : "application/json, text/plain",
        "user-agent": providerUserAgent,
      },
      body: input.body,
      signal: timeout.signal,
    });
    const payload =
      response.ok && input.responseType === "binary"
        ? new Uint8Array(await response.arrayBuffer())
        : await readEmailListVerifyPayload(response);
    if (!response.ok) {
      throw createEmailListVerifyHttpError(response, payload, input.phase);
    }

    return {
      response,
      payload,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "EmailListVerify request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `EmailListVerify request failed: ${error.message}` : "EmailListVerify request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readEmailListVerifyPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return "";
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    return text;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "EmailListVerify returned invalid JSON");
  }
}

function createEmailListVerifyHttpError(
  response: Response,
  payload: unknown,
  phase: EmailListVerifyRequestPhase,
): ProviderRequestError {
  const message = extractEmailListVerifyErrorMessage(payload);
  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 403) {
    if (phase === "validate" || /invalid api key/i.test(message)) {
      return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
    }
    return new ProviderRequestError(403, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractEmailListVerifyErrorMessage(payload: unknown): string {
  if (typeof payload === "string") {
    return payload.trim() || "EmailListVerify request failed";
  }

  const record = optionalRecord(payload);
  return (
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.result) ??
    "EmailListVerify request failed"
  );
}

function requireEmailListVerifyObject(payload: unknown, endpoint: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `EmailListVerify response for ${endpoint} was not a JSON object`, payload);
  }
  return record;
}

function resolveEmailListVerifyUploadBytes(
  contentText: string | undefined,
  contentBase64: string | undefined,
): Uint8Array<ArrayBuffer> {
  const provided = Number(contentText !== undefined) + Number(contentBase64 !== undefined);
  if (provided !== 1) {
    throw new ProviderRequestError(400, "exactly one of contentText or contentBase64 must be provided");
  }
  if (contentText !== undefined) {
    return new TextEncoder().encode(contentText);
  }
  return base64Bytes(contentBase64, "contentBase64", badInput);
}

function inferEmailListVerifyUploadMimeType(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  if (normalized.endsWith(".csv")) {
    return "text/csv";
  }
  if (normalized.endsWith(".txt")) {
    return "text/plain";
  }
  if (normalized.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/octet-stream";
}

function resolveEmailListVerifyDownloadFileName(
  response: Response,
  emailListId: string,
  format: string | undefined,
): string {
  const contentDisposition = response.headers.get("content-disposition");
  const match =
    contentDisposition?.match(/filename\*=UTF-8''([^;]+)/iu) ?? contentDisposition?.match(/filename="?([^";]+)"?/iu);
  const rawFileName = match?.[1];
  if (rawFileName) {
    return decodeURIComponent(rawFileName);
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("spreadsheet") || contentType.includes("xlsx")) {
    return `${emailListId}.xlsx`;
  }
  if (contentType.includes("csv")) {
    return `${emailListId}.csv`;
  }
  if (format === "xlsx") {
    return `${emailListId}.xlsx`;
  }
  return `${emailListId}.csv`;
}

function mapEmailListVerifyRejectedApiKey(phase: EmailListVerifyRequestPhase): ProviderRequestError {
  return new ProviderRequestError(phase === "validate" ? 400 : 401, "EmailListVerify rejected the API key");
}

function buildEmailListVerifyProviderAccountId(apiKey: string): string {
  return `emaillistverify:api_key:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`;
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
