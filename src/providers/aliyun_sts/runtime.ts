import { createHmac, randomBytes } from "node:crypto";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const aliyunStsEndpoint = "https://sts.aliyuncs.com/";
export const aliyunStsApiVersion = "2015-04-01";
const stsTimeoutMs = 10_000;
const defaultRoleSessionName = "oomol-connect";

export interface AliyunStsCredential {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken: string;
  expiration: string;
  requestId: string | null;
  assumedRoleUser: {
    arn: string | null;
    assumedRoleId: string | null;
  } | null;
}

export interface AssumeAliyunRoleInput {
  accessKeyId: string;
  accessKeySecret: string;
  roleArn: string;
  roleSessionName?: string;
  durationSeconds?: number;
  policy?: string;
}

interface AliyunStsResponse {
  Credentials?: {
    AccessKeyId?: string;
    AccessKeySecret?: string;
    SecurityToken?: string;
    Expiration?: string;
  };
  AssumedRoleUser?: {
    Arn?: string;
    AssumedRoleId?: string;
  };
  Code?: string;
  Message?: string;
  RequestId?: string;
}

export async function assumeAliyunRole(
  input: AssumeAliyunRoleInput,
  deps: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
    now?: () => Date;
    nonce?: () => string;
  } = {},
): Promise<AliyunStsCredential> {
  const fetcher = deps.fetcher ?? fetch;
  const now = deps.now ?? (() => new Date());
  const nonce = deps.nonce ?? createAliyunStsSignatureNonce;
  const params = buildAssumeRoleParams(input, now(), nonce());
  const body = buildAliyunStsSignedRpcBody(params, input.accessKeySecret);
  const timeoutSignal = AbortSignal.timeout(stsTimeoutMs);
  const signal = deps.signal ? AbortSignal.any([deps.signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  let payload: AliyunStsResponse;
  try {
    response = await fetcher(aliyunStsEndpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": providerUserAgent,
      },
      body,
      signal,
    });
    payload = parseStsResponse(await response.text());
  } catch (error) {
    if (timeoutSignal.aborted || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "aliyun_sts request timed out");
    }
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `aliyun_sts request failed: ${error.message}` : "aliyun_sts request failed",
    );
  }

  if (!response.ok) {
    throw normalizeAliyunStsError(response, payload);
  }

  return normalizeStsCredential(payload);
}

function buildAssumeRoleParams(input: AssumeAliyunRoleInput, now: Date, nonce: string): Record<string, string> {
  const roleSessionName = input.roleSessionName?.trim() || defaultRoleSessionName;
  const params: Record<string, string> = {
    AccessKeyId: input.accessKeyId,
    Action: "AssumeRole",
    Format: "JSON",
    RoleArn: input.roleArn,
    RoleSessionName: roleSessionName,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: nonce,
    SignatureVersion: "1.0",
    Timestamp: formatAliyunStsRpcTimestamp(now),
    Version: aliyunStsApiVersion,
  };

  if (input.durationSeconds != null) {
    params.DurationSeconds = String(input.durationSeconds);
  }
  if (input.policy?.trim()) {
    params.Policy = input.policy.trim();
  }

  return params;
}

export function buildAliyunStsSignedRpcBody(params: Record<string, string>, accessKeySecret: string): string {
  const signedParams: Record<string, string> = {
    ...params,
    Signature: signAliyunRpcParams(params, accessKeySecret),
  };
  return Object.keys(signedParams)
    .sort()
    .map((key) => `${rpcPercentEncode(key)}=${rpcPercentEncode(signedParams[key]!)}`)
    .join("&");
}

function signAliyunRpcParams(params: Record<string, string>, accessKeySecret: string): string {
  const canonicalizedQueryString = Object.keys(params)
    .sort()
    .map((key) => `${rpcPercentEncode(key)}=${rpcPercentEncode(params[key]!)}`)
    .join("&");
  const stringToSign = `POST&%2F&${rpcPercentEncode(canonicalizedQueryString)}`;
  return createHmac("sha1", `${accessKeySecret}&`).update(stringToSign).digest("base64");
}

function rpcPercentEncode(value: string): string {
  return encodeURIComponent(value).replaceAll("+", "%20").replaceAll("*", "%2A").replaceAll("%7E", "~");
}

export function formatAliyunStsRpcTimestamp(value: Date): string {
  const iso = value.toISOString();
  const dotIndex = iso.lastIndexOf(".");
  if (dotIndex === -1 || !iso.endsWith("Z")) {
    return iso;
  }
  return `${iso.slice(0, dotIndex)}Z`;
}

export function createAliyunStsSignatureNonce(): string {
  return randomBytes(16).toString("hex");
}

function parseStsResponse(text: string): AliyunStsResponse {
  try {
    return JSON.parse(text) as AliyunStsResponse;
  } catch {
    throw new ProviderRequestError(502, `STS returned non-JSON response: ${text}`);
  }
}

function normalizeAliyunStsError(response: Response, payload: AliyunStsResponse): ProviderRequestError {
  const code = payload.Code ?? "unknown";
  const message = payload.Message ?? response.statusText;
  const status =
    response.status === 400 || response.status === 401 || response.status === 403 ? 400 : response.status || 500;
  return new ProviderRequestError(status, `aliyun_sts AssumeRole failed: ${code}: ${message}`);
}

function normalizeStsCredential(payload: AliyunStsResponse): AliyunStsCredential {
  const credentials = payload.Credentials;
  return {
    accessKeyId: requireStsField(credentials?.AccessKeyId, "Credentials.AccessKeyId"),
    accessKeySecret: requireStsField(credentials?.AccessKeySecret, "Credentials.AccessKeySecret"),
    securityToken: requireStsField(credentials?.SecurityToken, "Credentials.SecurityToken"),
    expiration: requireStsField(credentials?.Expiration, "Credentials.Expiration"),
    requestId: payload.RequestId ?? null,
    assumedRoleUser: payload.AssumedRoleUser
      ? {
          arn: payload.AssumedRoleUser.Arn ?? null,
          assumedRoleId: payload.AssumedRoleUser.AssumedRoleId ?? null,
        }
      : null,
  };
}

function requireStsField(value: string | undefined, field: string): string {
  if (!value) {
    throw new ProviderRequestError(502, `aliyun_sts response missing ${field}`);
  }
  return value;
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
