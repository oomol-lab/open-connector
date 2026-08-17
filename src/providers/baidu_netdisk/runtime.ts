import type { TransitFileWriter } from "../../core/types.ts";

import { compactObject, optionalInteger, optionalString, requiredRawString, requiredString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { providerFetch, ProviderRequestError, readProviderTextBody } from "../provider-runtime.ts";

const baiduPanBaseUrl = "https://pan.baidu.com";
const losslessIntegerKeys = new Set(["fs_id", "fsid", "pid", "uk", "request_id", "cursor"]);

type BaiduRequestPhase = "read" | "write";

interface BaiduNetdiskRequestContext {
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface BaiduNetdiskDownloadContext extends BaiduNetdiskRequestContext {
  transitFiles?: TransitFileWriter;
}

export interface BaiduNetdiskAccount {
  accountId: string;
  accountLabel: string;
  avatarUrl: string | null;
  membership: "free" | "vip" | "svip" | null;
  providerMetadata: Record<string, unknown>;
}

export function parseBaiduNetdiskJson(
  text: string,
  message = "baidu_netdisk returned invalid JSON",
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(stringifyBaiduLosslessIntegers(text));
  } catch {
    throw new ProviderRequestError(502, message);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value as Record<string, unknown>;
}

export async function fetchBaiduNetdiskAccount(
  accessToken: string,
  fetcher: typeof fetch,
): Promise<BaiduNetdiskAccount> {
  const url = new URL("/rest/2.0/xpan/nas", baiduPanBaseUrl);
  url.searchParams.set("method", "uinfo");
  url.searchParams.set("vip_version", "v2");
  const payload = await requestBaiduNetdiskApi(url, accessToken, fetcher, "read");
  const accountId = requireLosslessId(payload.uk, "uk");
  const netdiskName = optionalString(payload.netdisk_name);
  const baiduName = optionalString(payload.baidu_name);
  return {
    accountId,
    accountLabel: netdiskName ?? baiduName ?? accountId,
    avatarUrl: optionalString(payload.avatar_url) ?? null,
    membership: normalizeMembership(payload.vip_type),
    providerMetadata: compactObject({ uk: accountId, netdiskName, baiduName }),
  };
}

export async function getBaiduNetdiskQuota(context: BaiduNetdiskRequestContext): Promise<Record<string, unknown>> {
  const url = new URL("/api/quota", baiduPanBaseUrl);
  url.searchParams.set("checkfree", "1");
  url.searchParams.set("checkexpire", "1");
  const payload = await requestBaiduNetdiskApi(url, context.accessToken, context.fetcher, "read", {
    signal: context.signal,
  });
  const totalBytes = requireInteger(payload.total, "total");
  const usedBytes = requireInteger(payload.used, "used");
  return {
    totalBytes,
    usedBytes,
    remainingBytes: Math.max(totalBytes - usedBytes, 0),
    freeQuotaBytes: requireInteger(payload.free, "free"),
    expiresWithinSevenDays: payload.expire === true,
  };
}

export async function downloadBaiduNetdiskFile(
  input: Record<string, unknown>,
  context: BaiduNetdiskDownloadContext,
): Promise<Record<string, unknown>> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "baidu_netdisk download_file requires local transit file storage");
  }

  const requestedFsId = requiredString(input.fsId, "fsId", (message) => new ProviderRequestError(400, message));
  if (!/^\d+$/u.test(requestedFsId)) {
    throw new ProviderRequestError(400, "fsId must be a decimal string");
  }

  const metadataUrl = new URL("/rest/2.0/xpan/multimedia", baiduPanBaseUrl);
  metadataUrl.searchParams.set("method", "filemetas");
  metadataUrl.searchParams.set("dlink", "1");
  metadataUrl.searchParams.set("fsids", `[${requestedFsId}]`);
  const metadataPayload = await requestBaiduNetdiskApi(metadataUrl, context.accessToken, context.fetcher, "read", {
    signal: context.signal,
  });
  const metadata = readDownloadMetadata(metadataPayload, requestedFsId);
  if (metadata.sizeBytes > context.transitFiles.maxBytes) {
    throw new ProviderRequestError(
      413,
      `Baidu Netdisk file exceeds local transit limit of ${context.transitFiles.maxBytes} bytes`,
    );
  }

  const downloadUrl = readBaiduDownloadUrl(metadata.downloadUrl);
  downloadUrl.searchParams.set("access_token", context.accessToken);
  const response = await providerFetch(downloadUrl, {
    headers: {
      accept: "*/*",
      "user-agent": "pan.baidu.com",
    },
    signal: context.signal,
  });
  if (!response.ok) {
    const message = await readProviderTextBody(response, "Baidu Netdisk download error", 1024 * 1024).catch(() => "");
    throw new ProviderRequestError(
      response.status >= 500 ? 502 : response.status,
      message || `baidu_netdisk download failed with HTTP ${response.status}`,
    );
  }

  const mimeType = optionalString(response.headers.get("content-type")) ?? "application/octet-stream";
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: "Baidu Netdisk download",
    createError: (message) => new ProviderRequestError(413, message),
  });
  const file = await context.transitFiles.create(new File([Uint8Array.from(bytes)], metadata.name, { type: mimeType }));

  return {
    fileId: metadata.fileId,
    name: metadata.name,
    mimeType,
    sizeBytes: file.sizeBytes,
    file,
  };
}

interface BaiduDownloadMetadata {
  fileId: string;
  name: string;
  sizeBytes: number;
  downloadUrl: string;
}

function readDownloadMetadata(payload: Record<string, unknown>, requestedFsId: string): BaiduDownloadMetadata {
  if (!Array.isArray(payload.list) || payload.list.length !== 1) {
    throw new ProviderRequestError(502, "baidu_netdisk download metadata is missing the requested file");
  }
  const item = payload.list[0];
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new ProviderRequestError(502, "baidu_netdisk download metadata is malformed");
  }
  const metadata = item as Record<string, unknown>;
  if (metadata.isdir === 1) {
    throw new ProviderRequestError(400, "baidu_netdisk download_file requires a file fsId");
  }
  const fileId = requireLosslessId(metadata.fs_id, "list[0].fs_id");
  if (fileId !== requestedFsId) {
    throw new ProviderRequestError(502, "baidu_netdisk returned metadata for a different file");
  }
  const name = requiredRawString(metadata.filename, "filename", (message) => new ProviderRequestError(502, message));
  if (name.length === 0) {
    throw new ProviderRequestError(502, "baidu_netdisk download metadata filename must not be empty");
  }
  const sizeBytes = requireInteger(metadata.size, "list[0].size");
  const downloadUrl = requiredString(metadata.dlink, "dlink", (message) => new ProviderRequestError(502, message));
  return { fileId, name, sizeBytes, downloadUrl };
}

function readBaiduDownloadUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderRequestError(502, "baidu_netdisk returned an invalid download URL");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    !(
      hostname === "baidu.com" ||
      hostname.endsWith(".baidu.com") ||
      hostname === "baidupcs.com" ||
      hostname.endsWith(".baidupcs.com")
    )
  ) {
    throw new ProviderRequestError(502, "baidu_netdisk returned an untrusted download URL");
  }
  return url;
}

export function normalizeBaiduNetdiskError(
  errno: number | undefined,
  status: number,
  requestId: unknown,
  phase: BaiduRequestPhase,
): ProviderRequestError {
  const details = compactObject({
    providerCode: errno,
    requestId: typeof requestId === "string" ? requestId : undefined,
  });
  if (status === 429 || errno === 20012 || errno === 31034)
    return new ProviderRequestError(429, "baidu_netdisk rate limit exceeded", details);
  if (errno === -6 || errno === 31045)
    return new ProviderRequestError(401, "baidu_netdisk credential expired", details);
  if (errno === 31024 || (errno === -7 && phase === "read"))
    return new ProviderRequestError(403, "baidu_netdisk permission is missing", details);
  if (errno === 20013 || errno === 20015)
    return new ProviderRequestError(503, "baidu_netdisk application permission is not configured", details);
  if (errno === 20011)
    return new ProviderRequestError(503, "baidu_netdisk test application user limit was reached", details);
  if ([2, 31023, 31062, 31064, 31364, 31365].includes(errno ?? Number.NaN) || (errno === -7 && phase === "write"))
    return new ProviderRequestError(400, "baidu_netdisk rejected the input", details);
  if (errno === -8 || errno === 31061)
    return new ProviderRequestError(409, "baidu_netdisk target already exists", details);
  if (errno === -3 || errno === -9 || errno === 31066)
    return new ProviderRequestError(404, "baidu_netdisk item was not found", details);
  if (errno === -10) return new ProviderRequestError(507, "baidu_netdisk storage is full", details);
  if (errno === 111)
    return new ProviderRequestError(409, "baidu_netdisk has a conflicting file management task", details);
  return new ProviderRequestError(502, "baidu_netdisk request failed", details);
}

async function requestBaiduNetdiskApi(
  url: URL,
  accessToken: string,
  fetcher: typeof fetch,
  phase: BaiduRequestPhase,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  url.searchParams.set("access_token", accessToken);
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      headers: {
        "user-agent": "pan.baidu.com",
        accept: "application/json",
        ...Object.fromEntries(new Headers(init.headers).entries()),
      },
    });
  } catch {
    throw new ProviderRequestError(502, "baidu_netdisk request failed");
  }
  const payload = parseBaiduNetdiskJson(await response.text());
  const errno = optionalInteger(payload.errno ?? payload.error_no ?? payload.error_code);
  if (!response.ok || (errno != null && errno !== 0)) {
    throw normalizeBaiduNetdiskError(errno, response.status, payload.request_id, phase);
  }
  return payload;
}

function stringifyBaiduLosslessIntegers(text: string): string {
  const ranges: Array<[number, number]> = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '"') continue;
    const keyStart = index;
    const keyEnd = findJsonStringEnd(text, keyStart + 1);
    if (keyEnd < 0) return text;
    index = keyEnd;
    const colonIndex = skipJsonWhitespace(text, keyEnd + 1);
    if (text[colonIndex] !== ":") continue;
    let key: unknown;
    try {
      key = JSON.parse(text.slice(keyStart, keyEnd + 1));
    } catch {
      return text;
    }
    if (typeof key !== "string" || !losslessIntegerKeys.has(key)) continue;
    const valueStart = skipJsonWhitespace(text, colonIndex + 1);
    let valueEnd = valueStart;
    while (isDecimalDigit(text[valueEnd])) valueEnd += 1;
    if (
      valueEnd === valueStart ||
      (text[valueStart] === "0" && valueEnd > valueStart + 1) ||
      !isJsonPropertyDelimiter(text, valueEnd)
    )
      continue;
    ranges.push([valueStart, valueEnd]);
  }
  let output = "";
  let offset = 0;
  for (const [start, end] of ranges) {
    output += `${text.slice(offset, start)}"${text.slice(start, end)}"`;
    offset = end;
  }
  return output + text.slice(offset);
}

function findJsonStringEnd(text: string, start: number): number {
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "\\") index += 1;
    else if (text[index] === '"') return index;
  }
  return -1;
}

function skipJsonWhitespace(text: string, start: number): number {
  let index = start;
  while (text[index] === " " || text[index] === "\t" || text[index] === "\n" || text[index] === "\r") index += 1;
  return index;
}

function isDecimalDigit(value: string | undefined): boolean {
  return value != null && value >= "0" && value <= "9";
}

function isJsonPropertyDelimiter(text: string, start: number): boolean {
  const delimiter = text[skipJsonWhitespace(text, start)];
  return delimiter === "," || delimiter === "}";
}

function requireLosslessId(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new ProviderRequestError(502, `baidu_netdisk response is missing ${fieldName}`);
}

function requireInteger(value: unknown, fieldName: string): number {
  const integer = optionalInteger(value);
  if (integer == null) throw new ProviderRequestError(502, `baidu_netdisk response is missing ${fieldName}`);
  return integer;
}

function normalizeMembership(value: unknown): "free" | "vip" | "svip" | null {
  if (value === 0) return "free";
  if (value === 1) return "vip";
  if (value === 2) return "svip";
  return null;
}
