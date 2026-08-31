import { Buffer } from "node:buffer";
import { createHash, createHmac } from "node:crypto";

const defaultAwsServiceName = "s3";

/**
 * Access key material used by AWS Signature Version 4.
 */
export interface AwsSigV4Credential {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/**
 * Query-string presign input. `url` must already contain the signed host and
 * path; existing search parameters are replaced with the SigV4 query.
 */
export interface AwsSigV4PresignInput {
  credential: AwsSigV4Credential;
  method: string;
  url: URL;
  region: string;
  expiresSeconds: number;
  service?: string;
  headers?: Record<string, string | undefined>;
  now?: Date;
}

/**
 * `Authorization` header signing input. `url` supplies the signed host, path,
 * and query; the query is signed verbatim, so callers canonicalize it with
 * {@link canonicalizeSearchParams} before signing and send exactly that URL.
 * `payloadHash` is the SHA-256 hex of the body (or `UNSIGNED-PAYLOAD`).
 */
export interface AwsSigV4SignInput {
  credential: AwsSigV4Credential;
  method: string;
  url: URL;
  region: string;
  payloadHash: string;
  service?: string;
  headers?: HeadersInit;
  now?: Date;
}

interface AwsSigV4SigningScope {
  amzDate: string;
  dateStamp: string;
  region: string;
  service: string;
  credentialScope: string;
}

/**
 * Sign a request with the SigV4 `Authorization` header scheme. Returns the
 * headers to send: a copy of the input headers plus `host`, `x-amz-date`,
 * `x-amz-security-token` (when the credential carries a session token), and
 * `authorization`. Signing is local; the function does not send a network
 * request.
 */
export function signAwsSigV4Request(input: AwsSigV4SignInput): Headers {
  const scope = createSigningScope(input.now ?? new Date(), input.region, input.service ?? defaultAwsServiceName);
  const headers = new Headers(input.headers);
  headers.set("host", input.url.host);
  headers.set("x-amz-date", scope.amzDate);
  if (input.credential.sessionToken) {
    headers.set("x-amz-security-token", input.credential.sessionToken);
  }
  const canonicalHeaders = buildCanonicalHeaders(headers);
  const signedHeaders = Object.keys(canonicalHeaders).join(";");
  const canonicalRequest = [
    input.method,
    input.url.pathname,
    input.url.search.slice(1),
    formatCanonicalHeaders(canonicalHeaders),
    signedHeaders,
    input.payloadHash,
  ].join("\n");
  const signature = signCanonicalRequest(input.credential.secretAccessKey, scope, canonicalRequest);
  headers.set(
    "authorization",
    `AWS4-HMAC-SHA256 Credential=${input.credential.accessKeyId}/${scope.credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  );
  return headers;
}

/**
 * Build an AWS SigV4 query-string presigned URL. Signing is local; the function
 * does not send a network request.
 */
export function createAwsSigV4PresignedUrl(input: AwsSigV4PresignInput): string {
  const scope = createSigningScope(input.now ?? new Date(), input.region, input.service ?? defaultAwsServiceName);
  const url = new URL(input.url.href);
  const headers = new Headers();
  for (const [key, value] of Object.entries(input.headers ?? {})) {
    if (!value) {
      continue;
    }
    headers.set(key, value);
  }
  headers.set("host", url.host);
  const canonicalHeaders = buildCanonicalHeaders(headers);
  const signedHeaders = Object.keys(canonicalHeaders).join(";");
  const query = new URLSearchParams();
  query.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  query.set("X-Amz-Credential", `${input.credential.accessKeyId}/${scope.credentialScope}`);
  query.set("X-Amz-Date", scope.amzDate);
  query.set("X-Amz-Expires", String(input.expiresSeconds));
  query.set("X-Amz-SignedHeaders", signedHeaders);
  if (input.credential.sessionToken) {
    query.set("X-Amz-Security-Token", input.credential.sessionToken);
  }
  const canonicalQuery = canonicalizeSearchParams(query);
  const canonicalRequest = [
    input.method,
    url.pathname,
    canonicalQuery,
    formatCanonicalHeaders(canonicalHeaders),
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const signature = signCanonicalRequest(input.credential.secretAccessKey, scope, canonicalRequest);
  // Append the signature to the canonical query text instead of going through
  // `url.searchParams`, whose setter re-serializes as form-urlencoded and would
  // diverge from the signed bytes for `~`, space, and `*`.
  url.search = `${canonicalQuery}&X-Amz-Signature=${signature}`;
  return url.toString();
}

/**
 * Encode a value with the RFC 3986 rules AWS SigV4 uses for canonical query
 * strings and S3 object-key segments.
 */
export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value)
    .replaceAll("!", "%21")
    .replaceAll("'", "%27")
    .replaceAll("(", "%28")
    .replaceAll(")", "%29")
    .replaceAll("*", "%2A");
}

/**
 * Encode an S3 object key, preserving `/` as a path delimiter.
 */
export function encodeS3ObjectKey(value: string): string {
  return value
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

/**
 * Encode query parameters and sort them by code point, the byte order AWS SigV4
 * canonical requests require.
 */
export function canonicalizeSearchParams(searchParams: URLSearchParams): string {
  const entries = Array.from(searchParams.entries()).map(([key, value]) => ({
    key: encodeRfc3986(key),
    value: encodeRfc3986(value),
  }));
  entries.sort((left, right) => {
    if (left.key === right.key) {
      return compareCodePoints(left.value, right.value);
    }
    return compareCodePoints(left.key, right.key);
  });
  return entries.map((entry) => `${entry.key}=${entry.value}`).join("&");
}

/**
 * Lowercase header names, collapse whitespace in header values, and sort the
 * headers by code point for a SigV4 canonical request.
 */
export function buildCanonicalHeaders(headers: Headers): Record<string, string> {
  const entries = Array.from(headers.entries()).map(([key, value]) => ({
    key: key.toLowerCase(),
    value: collapseHeaderWhitespace(value),
  }));
  entries.sort((left, right) => compareCodePoints(left.key, right.key));
  return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
}

/**
 * Format canonical headers as `name:value` lines terminated by a blank line.
 */
function formatCanonicalHeaders(headers: Record<string, string>): string {
  return `${Object.entries(headers)
    .map(([key, value]) => `${key}:${value}`)
    .join("\n")}\n`;
}

/**
 * Format a timestamp as the AWS `yyyyMMddTHHmmssZ` amz-date value.
 */
function formatAmzDate(value: Date): string {
  const year = String(value.getUTCFullYear()).padStart(4, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const seconds = String(value.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * SHA-256 hex digest used by SigV4 payload and string-to-sign hashes.
 */
export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Derive the AWS SigV4 signing key for a date, region, and service.
 */
function getAwsSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function createSigningScope(now: Date, region: string, service: string): AwsSigV4SigningScope {
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  return {
    amzDate,
    dateStamp,
    region,
    service,
    credentialScope: `${dateStamp}/${region}/${service}/aws4_request`,
  };
}

function signCanonicalRequest(secretAccessKey: string, scope: AwsSigV4SigningScope, canonicalRequest: string): string {
  const stringToSign = ["AWS4-HMAC-SHA256", scope.amzDate, scope.credentialScope, sha256Hex(canonicalRequest)].join(
    "\n",
  );
  return hmacHex(getAwsSigningKey(secretAccessKey, scope.dateStamp, scope.region, scope.service), stringToSign);
}

function hmacSha256(key: string | Buffer, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer, value: string): string {
  return createHmac("sha256", key).update(value).digest("hex");
}

function collapseHeaderWhitespace(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

/**
 * SigV4 sorts canonical headers and query parameters by byte order, so compare
 * code points instead of using the locale/ICU dependent `localeCompare`.
 */
function compareCodePoints(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}
