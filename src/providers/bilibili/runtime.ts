import type { ExecutionContext, TransitFileWriter } from "../../core/types.ts";
import type { OAuthTokenResult } from "../../oauth/oauth-token.ts";
import type { ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash, createHmac, randomUUID } from "node:crypto";
import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderJsonBody,
  requireOAuthCredential,
  requiredResponseRecord,
  runProviderRequest,
  setSearchParams,
} from "../provider-runtime.ts";

const bilibiliMemberBaseUrl = "https://member.bilibili.com";
export const bilibiliUposBaseUrl = "https://openupos.bilivideo.com";
export const bilibiliOAuthRefreshTokenUrl = "https://api.bilibili.com/x/account-oauth2/v1/refresh_token";

const bilibiliApiBasePath = "/arcopen/fn";
const bilibiliSignatureMethod = "HMAC-SHA256";
const bilibiliSignatureVersion = "2.0";

// Business codes from the 接口签名实现标准和状态码 document. -101 is the
// main-site "not logged in" code that arcopen also returns for a dead token.
const bilibiliCredentialErrorCodes = new Set([-101, 127000, 127001, 127002, 127004]);
const bilibiliPermissionErrorCodes = new Set([123001, 127005, 127006, 127007, 127011, 127304, 127305]);
const bilibiliRateLimitErrorCodes = new Set([127009, 127306]);
const bilibiliInvalidInputErrorCodes = new Set([
  4000, 123003, 123004, 123005, 123008, 123009, 123010, 123012, 123013, 123014, 123015, 123016, 123017, 123018, 123024,
  123029, 123030, 123038, 123040, 123041, 129000, 129001, 129002, 129003, 129004, 129005, 129006, 129009, 129010,
  129012, 129015, 129018,
]);

export interface BilibiliActionContext {
  accessToken: string;
  clientId: string;
  appSecret: string;
  fetcher: ProviderFetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

/** Provider-native handler shape for Bilibili actions. */
export type BilibiliActionHandler = ProviderRuntimeHandler<BilibiliActionContext>;

/**
 * Reject an edit call that carries no editable field: it would resubmit
 * unchanged content and still cost a provider-side review round.
 */
export function assertAnyInputField(input: Record<string, unknown>, fields: readonly string[]): void {
  if (!fields.some((field) => input[field] !== undefined)) {
    throw providerInputError(`Provide at least one field to edit: ${fields.join(", ")}.`);
  }
}

/** Read the signing material stored on the connection metadata by the OAuth client config. */
export function readBilibiliSigningMaterial(
  metadata: Record<string, unknown>,
): { clientId: string; appSecret: string } | undefined {
  const clientId = optionalString(metadata.oauthClientId);
  const appSecret = optionalString(optionalRecord(metadata.oauthClientSecretExtra)?.appSecret);
  return clientId && appSecret ? { clientId, appSecret } : undefined;
}

/**
 * Resolve the access token plus the signing material of the configured OAuth
 * client. The Bilibili signature signs with the application App Secret, which
 * the OAuth client config stores as the `appSecret` secretExtra field.
 */
export async function createBilibiliContext(
  context: ExecutionContext,
  fetcher: ProviderFetch,
): Promise<BilibiliActionContext> {
  const credential = await requireOAuthCredential(context, "bilibili");
  const signing = readBilibiliSigningMaterial(credential.metadata);
  if (!signing) {
    throw new ProviderRequestError(
      401,
      "Bilibili OAuth client is missing clientId or appSecret. Reconfigure the Bilibili OAuth client first.",
    );
  }
  return {
    accessToken: credential.accessToken,
    clientId: signing.clientId,
    appSecret: signing.appSecret,
    fetcher,
    transitFiles: context.transitFiles,
    signal: context.signal,
  };
}

export interface BilibiliSignedHeadersInput {
  clientId: string;
  appSecret: string;
  accessToken: string;
  /** Exact request body string; GET and empty-body requests sign the MD5 of "". */
  body?: string;
}

/**
 * Create the signed common header set (signature version 2.0) for one arcopen
 * request. The HMAC-SHA256 signature covers the sorted x-bili-* header lines
 * joined by "\n"; per Bilibili's official demos the trailing newline of the
 * last line is trimmed before signing.
 */
export function createBilibiliSignedHeaders(input: BilibiliSignedHeadersInput): Record<string, string> {
  const contentMd5 = createHash("md5")
    .update(input.body ?? "")
    .digest("hex");
  const nonce = randomUUID();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signedLines = [
    `x-bili-accesskeyid:${input.clientId}`,
    `x-bili-content-md5:${contentMd5}`,
    `x-bili-signature-method:${bilibiliSignatureMethod}`,
    `x-bili-signature-nonce:${nonce}`,
    `x-bili-signature-version:${bilibiliSignatureVersion}`,
    `x-bili-timestamp:${timestamp}`,
  ];
  const authorization = createHmac("sha256", input.appSecret).update(signedLines.join("\n")).digest("hex");
  return {
    accept: "application/json",
    "access-token": input.accessToken,
    authorization,
    "x-bili-accesskeyid": input.clientId,
    "x-bili-content-md5": contentMd5,
    "x-bili-signature-method": bilibiliSignatureMethod,
    "x-bili-signature-nonce": nonce,
    "x-bili-signature-version": bilibiliSignatureVersion,
    "x-bili-timestamp": timestamp,
  };
}

export interface BilibiliApiRequestOptions {
  method?: "GET" | "POST";
  /** Endpoint path under https://member.bilibili.com/arcopen/fn, for example /archive/viewlist. */
  path: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  /** Short request label used in error messages. */
  label: string;
}

/** Call one signed member.bilibili.com arcopen endpoint and unwrap its data envelope. */
export async function bilibiliApiRequest(
  context: BilibiliActionContext,
  options: BilibiliApiRequestOptions,
): Promise<unknown> {
  const method = options.method ?? "GET";
  const url = new URL(`${bilibiliMemberBaseUrl}${bilibiliApiBasePath}${options.path}`);
  setSearchParams(url, options.query ?? {});
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const headers = createBilibiliSignedHeaders({
    clientId: context.clientId,
    appSecret: context.appSecret,
    accessToken: context.accessToken,
    body,
  });
  // The document's samples send Content-Type: application/json on every
  // JSON-channel request, including GETs and body-less POSTs.
  headers["content-type"] = "application/json";

  return runProviderRequest({ signal: context.signal, label: options.label }, async (signal) =>
    readBilibiliApiResponse(await context.fetcher(url.toString(), { method, headers, body, signal }), options.label),
  );
}

export interface BilibiliFormRequestOptions {
  /** Endpoint path under https://member.bilibili.com/arcopen/fn. */
  path: string;
  /** Form fields; undefined values are skipped. */
  fields?: Record<string, string | undefined>;
  /** Optional file part, sent as the `file` form field. */
  file?: File;
  /** Short request label used in error messages. */
  label: string;
}

/**
 * POST one arcopen endpoint as multipart/form-data. Bilibili article
 * endpoints take form fields instead of JSON, and per the signing rules the
 * content MD5 of a form body is computed over an empty string.
 */
export async function bilibiliFormRequest(
  context: BilibiliActionContext,
  options: BilibiliFormRequestOptions,
): Promise<unknown> {
  const url = new URL(`${bilibiliMemberBaseUrl}${bilibiliApiBasePath}${options.path}`);
  const form = new FormData();
  for (const [key, value] of Object.entries(options.fields ?? {})) {
    if (value !== undefined) {
      form.set(key, value);
    }
  }
  if (options.file) {
    form.set("file", options.file, options.file.name);
  }
  const headers = createBilibiliSignedHeaders({
    clientId: context.clientId,
    appSecret: context.appSecret,
    accessToken: context.accessToken,
  });

  return runProviderRequest({ signal: context.signal, label: options.label }, async (signal) =>
    readBilibiliApiResponse(
      await context.fetcher(url.toString(), { method: "POST", headers, body: form, signal }),
      options.label,
    ),
  );
}

/** Read one arcopen/openupos response into its envelope data, mapping HTTP and envelope failures. */
export async function readBilibiliApiResponse(response: Response, label: string): Promise<unknown> {
  if (!response.ok) {
    const text = await readProviderErrorTextBody(response, `${label} error response`);
    throw new ProviderRequestError(
      response.status >= 500 ? 502 : response.status,
      text || `${label} failed with HTTP ${response.status}`,
    );
  }
  const payload = await readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: `${label} returned invalid JSON`,
  });
  return readBilibiliEnvelopeData(payload, label);
}

/** Unwrap the shared Bilibili { code, message, data } envelope of arcopen and openupos responses. */
export function readBilibiliEnvelopeData(payload: unknown, label: string): unknown {
  const envelope = requiredResponseRecord(payload, label);
  const code = optionalNumber(envelope.code);
  if (code === 0) {
    return envelope.data;
  }
  const message = optionalString(envelope.message) ?? "unknown error";
  if (code !== undefined && bilibiliCredentialErrorCodes.has(code)) {
    throw new ProviderRequestError(401, `Bilibili credential expired or invalid (code ${code}): ${message}`, envelope);
  }
  const status = code === undefined ? 502 : mapBilibiliErrorStatus(code);
  if (status === 502) {
    throw providerResponseError(`${label} failed (code ${code ?? "unknown"}): ${message}`);
  }
  throw new ProviderRequestError(status, `${label} failed (code ${code}): ${message}`, envelope);
}

/** Map a documented non-zero business code to the runtime status it means; unknown codes stay upstream failures. */
function mapBilibiliErrorStatus(code: number): number {
  if (bilibiliPermissionErrorCodes.has(code)) {
    return 403;
  }
  if (bilibiliRateLimitErrorCodes.has(code)) {
    return 429;
  }
  if (bilibiliInvalidInputErrorCodes.has(code)) {
    return 400;
  }
  return 502;
}

/**
 * Read the comment increment of an inc-stats response. The field table of the
 * official document spells this counter icn_reply; the sample payload uses inc_reply.
 */
export function readBilibiliReplyIncrement(data: Record<string, unknown>): number | undefined {
  return optionalNumber(data.inc_reply) ?? optionalNumber(data.icn_reply);
}

export interface BilibiliOAuthTokenRequest {
  url: string;
  fields: Record<string, string>;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  createError: (message: string) => Error;
}

/**
 * Exchange or refresh a Bilibili OAuth token. Two Bilibili quirks force this
 * provider-local request: the parameters travel in the URL query (the
 * documents list them as url 参数), and `expires_in` is an absolute UTC Unix
 * timestamp rather than a lifetime in seconds.
 */
export async function requestBilibiliOAuthToken(input: BilibiliOAuthTokenRequest): Promise<OAuthTokenResult> {
  const url = new URL(input.url);
  setSearchParams(url, input.fields);
  const timeout = createProviderTimeout(input.signal);
  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": providerUserAgent,
      },
      redirect: "manual",
      signal: timeout.signal,
    });
  } catch (error) {
    timeout.cleanup();
    if (input.signal?.aborted) {
      throw input.createError("Bilibili OAuth token request was cancelled.");
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw input.createError("Bilibili OAuth token request timed out.");
    }
    throw input.createError("Bilibili OAuth token request failed without an HTTP response.");
  }
  try {
    const payload = optionalRecord(
      await readProviderJsonBody(response, {
        emptyBody: {},
        invalidJsonMessage: "Bilibili OAuth token request returned invalid JSON",
      }),
    );
    const code = optionalNumber(payload?.code);
    if (!response.ok || code !== 0) {
      throw input.createError(
        optionalString(payload?.message) ?? `Bilibili OAuth token request failed (HTTP ${response.status}).`,
      );
    }
    const data = optionalRecord(payload?.data);
    const accessToken = requiredString(data?.access_token, "access_token", input.createError);
    return {
      accessToken,
      refreshToken: optionalString(data?.refresh_token),
      tokenType: "Bearer",
      expiresAt: readBilibiliExpiresAt(optionalNumber(data?.expires_in)),
      metadata: compactObject({ scopes: data?.scopes }),
    };
  } finally {
    timeout.cleanup();
  }
}

function readBilibiliExpiresAt(expiresAtUnixSeconds: number | undefined): string | undefined {
  const millis = (expiresAtUnixSeconds ?? 0) * 1000;
  return millis > 0 && millis <= 8.64e15 ? new Date(millis).toISOString() : undefined;
}
