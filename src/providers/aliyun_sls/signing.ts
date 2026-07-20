import { createHash, createHmac } from "node:crypto";

export interface AliyunSlsSigningCredential {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken?: string;
}

export interface SignAliyunSlsRequestInput {
  method: string;
  path: string;
  credential: AliyunSlsSigningCredential;
  date: Date;
  query?: Record<string, string>;
  headers?: HeadersInit;
  bodyBytes?: Uint8Array;
}

export interface SignedAliyunSlsRequest {
  headers: Headers;
  bodyBytes: Uint8Array;
  canonicalString: string;
  signature: string;
  contentMd5?: string;
}

export const aliyunSlsApiVersion = "0.6.0";
export const aliyunSlsSignatureMethod = "hmac-sha1";

/** Sign the exact bytes and request fields that will be sent to Simple Log Service. */
export function signAliyunSlsRequest(input: SignAliyunSlsRequestInput): SignedAliyunSlsRequest {
  const bodyBytes = input.bodyBytes ?? new Uint8Array();
  const headers = new Headers(input.headers);
  const date = input.date.toUTCString();
  headers.set("date", date);
  headers.delete("x-log-date");
  headers.set("x-log-apiversion", aliyunSlsApiVersion);
  headers.set("x-log-signaturemethod", aliyunSlsSignatureMethod);
  headers.set("x-log-bodyrawsize", String(bodyBytes.byteLength));

  if (input.credential.securityToken) {
    headers.set("x-acs-security-token", input.credential.securityToken);
  } else {
    headers.delete("x-acs-security-token");
  }

  let contentMd5: string | undefined;
  if (bodyBytes.byteLength > 0) {
    contentMd5 = createHash("md5").update(bodyBytes).digest("hex").toUpperCase();
    headers.set("content-md5", contentMd5);
  } else {
    headers.delete("content-md5");
  }

  const canonicalString = buildAliyunSlsCanonicalString({
    method: input.method,
    path: input.path,
    query: input.query,
    headers,
  });
  const signature = createHmac("sha1", input.credential.accessKeySecret)
    .update(canonicalString, "utf8")
    .digest("base64");
  headers.set("authorization", `LOG ${input.credential.accessKeyId}:${signature}`);
  // Official V1 SDKs add this after signing as a fallback for proxies that drop Date.
  headers.set("x-log-date", date);

  const result: SignedAliyunSlsRequest = {
    headers,
    bodyBytes,
    canonicalString,
    signature,
  };
  if (contentMd5) result.contentMd5 = contentMd5;
  return result;
}

export interface BuildAliyunSlsCanonicalStringInput {
  method: string;
  path: string;
  query?: Record<string, string>;
  headers: Headers;
}

/** Build the SLS v1 canonical message without URL-encoding query values. */
export function buildAliyunSlsCanonicalString(input: BuildAliyunSlsCanonicalStringInput): string {
  const method = input.method.toUpperCase();
  const contentMd5 = input.headers.get("content-md5") ?? "";
  const contentType = input.headers.get("content-type") ?? "";
  const date = input.headers.get("date") ?? "";
  const canonicalHeaders = [...input.headers.entries()]
    .filter(([name]) => isAliyunSlsCanonicalHeader(name))
    .sort(([left], [right]) => compareAscii(left, right))
    .map(([name, value]) => `${name.toLowerCase()}:${value.trim()}\n`)
    .join("");
  const canonicalResource = buildAliyunSlsCanonicalResource(input.path, input.query);
  return `${method}\n${contentMd5}\n${contentType}\n${date}\n${canonicalHeaders}${canonicalResource}`;
}

export function buildAliyunSlsCanonicalResource(path: string, query?: Record<string, string>): string {
  const entries = Object.entries(query ?? {}).sort(([left], [right]) => compareAscii(left, right));
  if (entries.length === 0) {
    return path;
  }
  return `${path}?${entries.map(([key, value]) => `${key}=${value}`).join("&")}`;
}

export function aliyunSlsUtf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function isAliyunSlsCanonicalHeader(name: string): boolean {
  const normalized = name.toLowerCase();
  return normalized.startsWith("x-log-") || normalized.startsWith("x-acs-");
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
