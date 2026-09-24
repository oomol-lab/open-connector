import { createHmac } from "node:crypto";
import { encodeRfc3986, sha256Hex } from "../../core/aws-sigv4.ts";
import { randomUUIDv7 } from "../../core/uuid-v7.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  runProviderRequest,
} from "../provider-runtime.ts";

const aliyunAckApiVersion = "2015-12-15";
const aliyunAckTimeoutMs = 15_000;
const signatureAlgorithm = "ACS3-HMAC-SHA256";
const emptyPayloadHash = sha256Hex("");

export interface AliyunAckCredential {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken?: string;
}

export interface GetTemporaryKubeconfigInput {
  clusterId: string;
  regionId: string;
  temporaryDurationMinutes: number;
  privateIpAddress?: boolean;
}

interface AliyunAckErrorPayload {
  code?: string;
  message?: string;
  requestId?: string;
  Code?: string;
  Message?: string;
  RequestId?: string;
}

export async function getTemporaryKubeconfig(
  input: GetTemporaryKubeconfigInput,
  credential: AliyunAckCredential,
  deps: {
    fetcher?: typeof fetch;
    signal?: AbortSignal;
    now?: () => Date;
    nonce?: () => string;
  } = {},
): Promise<{ config: string; expiration: string }> {
  const endpoint = buildAliyunAckEndpoint(input.regionId);
  const pathname = `/k8s/${encodeRfc3986(input.clusterId)}/user_config`;
  const query = {
    PrivateIpAddress: String(input.privateIpAddress ?? false),
    TemporaryDurationMinutes: String(input.temporaryDurationMinutes),
  };
  const signedRequest = signAliyunAckRequest({
    endpoint,
    pathname,
    query,
    credential,
    date: (deps.now ?? (() => new Date()))(),
    nonce: (deps.nonce ?? randomUUIDv7)(),
  });
  const url = `https://${endpoint}${pathname}?${signedRequest.canonicalQuery}`;
  return runProviderRequest(
    { label: "aliyun_ack", timeoutMs: aliyunAckTimeoutMs, signal: deps.signal },
    async (signal) => {
      const response = await (deps.fetcher ?? fetch)(url, {
        method: "GET",
        headers: signedRequest.headers,
        redirect: "manual",
        signal,
      });
      const payload = parseJsonObject(await response.text());
      if (!response.ok) throw createAliyunAckHttpError(response, payload);
      return {
        config: requireResponseString(payload.config, "config"),
        expiration: requireResponseString(payload.expiration, "expiration"),
      };
    },
  );
}

export function buildAliyunAckEndpoint(regionId: string) {
  return `cs.${regionId}.aliyuncs.com`;
}

export function signAliyunAckRequest(input: {
  endpoint: string;
  pathname: string;
  query: Record<string, string>;
  credential: AliyunAckCredential;
  date: Date;
  nonce: string;
}): { canonicalQuery: string; headers: Record<string, string> } {
  const headers: Record<string, string> = {
    host: input.endpoint,
    "user-agent": providerUserAgent,
    "x-acs-action": "DescribeClusterUserKubeconfig",
    "x-acs-content-sha256": emptyPayloadHash,
    "x-acs-date": formatAliyunDate(input.date),
    "x-acs-signature-nonce": input.nonce,
    "x-acs-version": aliyunAckApiVersion,
  };
  if (input.credential.securityToken) {
    headers["x-acs-security-token"] = input.credential.securityToken;
  }

  const signedHeaderNames = Object.keys(headers)
    .filter((name) => name !== "user-agent")
    .sort(compareAscii);
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalHeaders = `${signedHeaderNames
    .map((name) => `${name}:${normalizeHeaderValue(headers[name]!)}`)
    .join("\n")}\n`;
  const canonicalQuery = Object.entries(input.query)
    .sort(([left], [right]) => compareAscii(left, right))
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join("&");
  const canonicalRequest = [
    "GET",
    input.pathname,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    emptyPayloadHash,
  ].join("\n");
  const stringToSign = `${signatureAlgorithm}\n${sha256Hex(canonicalRequest)}`;
  const signature = createHmac("sha256", input.credential.accessKeySecret).update(stringToSign).digest("hex");
  headers.authorization = `${signatureAlgorithm} Credential=${input.credential.accessKeyId},SignedHeaders=${signedHeaders},Signature=${signature}`;

  return { canonicalQuery, headers };
}

function parseJsonObject(text: string): Record<string, unknown> {
  if (!text.trim()) {
    return {};
  }
  try {
    const payload = JSON.parse(text) as unknown;
    return typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function createAliyunAckHttpError(response: Response, payload: Record<string, unknown>) {
  const error = payload as AliyunAckErrorPayload;
  const code = error.code ?? error.Code ?? "unknown";
  const upstreamMessage = error.message ?? error.Message ?? response.statusText;
  const requestId = error.requestId ?? error.RequestId;
  const message = `aliyun_ack DescribeClusterUserKubeconfig failed: ${code}: ${upstreamMessage}${requestId ? ` (requestId: ${requestId})` : ""}`;

  if (response.status === 429 || code.includes("Throttl")) {
    return new ProviderRequestError(429, message);
  }
  if (
    response.status === 401 ||
    code.includes("InvalidAccessKey") ||
    code.includes("Signature") ||
    code.includes("SecurityToken")
  ) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 403 || code.includes("Forbidden") || code.includes("NoPermission")) {
    return new ProviderRequestError(403, message);
  }
  if (response.status === 400 || response.status === 404) {
    return providerInputError(message);
  }
  return providerResponseError(message);
}

function requireResponseString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(502, `aliyun_ack response missing ${field}`);
  }
  return value;
}

function normalizeHeaderValue(value: string) {
  return value.trim();
}

function compareAscii(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function formatAliyunDate(value: Date) {
  const iso = value.toISOString();
  const dotIndex = iso.lastIndexOf(".");
  return dotIndex === -1 ? iso : `${iso.slice(0, dotIndex)}Z`;
}
