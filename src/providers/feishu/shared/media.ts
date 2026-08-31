import type { TransitFileUpload, TransitFileWriter } from "../../../core/types.ts";
import type { FeishuActionRuntimeContext } from "./client.ts";

import { optionalString } from "../../../core/cast.ts";
import {
  createProviderFetch,
  createProviderTimeout,
  providerUserAgent,
  ProviderRequestError,
} from "../../provider-runtime.ts";
import { requestFeishuMultipart } from "./client.ts";

export interface UploadFeishuMediaInput {
  readonly sourceUrl: string;
  readonly kind: "image" | "file";
  readonly fileType?: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream";
  readonly fileName?: string;
  readonly fieldName: string;
  readonly maxBytes?: number;
}

export interface DownloadedFeishuSource {
  readonly bytes?: Uint8Array;
  readonly sizeBytes?: number;
  readonly fileName: string;
  readonly mimeType: string;
  readonly cleanup?: () => Promise<void>;
}

export function feishuSourceSizeBytes(source: DownloadedFeishuSource): number {
  if (!source.bytes) {
    throw new ProviderRequestError(502, "downloaded Feishu source is missing file content");
  }
  return source.bytes.byteLength;
}

export function requireInMemoryFeishuSource(source: DownloadedFeishuSource): Uint8Array {
  if (!source.bytes) {
    throw new ProviderRequestError(502, "downloaded Feishu source is not available in memory");
  }
  return source.bytes;
}

export async function readFeishuSourceBytes(
  source: DownloadedFeishuSource,
  start: number = 0,
  end: number = feishuSourceSizeBytes(source),
): Promise<Uint8Array> {
  return requireInMemoryFeishuSource(source).slice(start, end);
}

const defaultMaxBytes = 30 * 1024 * 1024;
const maximumBufferedSourceBytes = 100 * 1024 * 1024;

export async function uploadFeishuMedia(
  input: UploadFeishuMediaInput,
  context: FeishuActionRuntimeContext,
): Promise<string> {
  const source = await downloadFeishuSource(input, context.fetcher, context.signal);
  try {
    const bytes = requireInMemoryFeishuSource(source);
    const body = new FormData();
    if (input.kind === "image") {
      body.set("image_type", "message");
      body.set("image", new Blob([bytes.slice().buffer], { type: source.mimeType }), source.fileName);
      const data = await requestFeishuMultipart({
        accessToken: context.accessToken,
        fetcher: context.fetcher,
        signal: context.signal,
        path: "/im/v1/images",
        body,
      });
      const imageKey = optionalString(data.image_key);
      if (!imageKey) {
        throw new ProviderRequestError(502, "Feishu image upload response is missing image_key");
      }
      return imageKey;
    } else {
      body.set("file_type", input.fileType ?? "stream");
      body.set("file_name", input.fileName ?? source.fileName);
      body.set("file", new Blob([bytes.slice().buffer], { type: source.mimeType }), source.fileName);
      const data = await requestFeishuMultipart({
        accessToken: context.accessToken,
        fetcher: context.fetcher,
        signal: context.signal,
        path: "/im/v1/files",
        body,
      });
      const fileKey = optionalString(data.file_key);
      if (!fileKey) {
        throw new ProviderRequestError(502, "Feishu file upload response is missing file_key");
      }
      return fileKey;
    }
  } finally {
    await source.cleanup?.();
  }
}

export async function downloadFeishuSource(
  input: UploadFeishuMediaInput,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<DownloadedFeishuSource> {
  const canonicalUrl = input.sourceUrl;
  const guardedFetcher = createProviderFetch({ fetch: fetcher });
  const maxBytes = Math.min(input.maxBytes ?? defaultMaxBytes, maximumBufferedSourceBytes);
  const timeout = createProviderTimeout(signal);
  try {
    const response = await guardedFetcher(canonicalUrl, {
      headers: { "user-agent": providerUserAgent },
      signal: timeout.signal,
    });
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status,
        `Failed to fetch ${input.fieldName}: ${response.status} ${response.statusText}`.trim(),
      );
    }
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    const contentLength = parseContentLength(response.headers.get("content-length"));
    if (contentLength != null && contentLength > maxBytes) {
      await response.body?.cancel().catch(() => {});
      throw sourceTooLargeError(input.fieldName, maxBytes);
    }
    const fileName = input.fileName ?? inferFileName(canonicalUrl);
    const bytes = await readLimitedBytes(response, maxBytes, input.fieldName);
    return {
      bytes,
      sizeBytes: bytes.byteLength,
      fileName,
      mimeType: contentType || "application/octet-stream",
    };
  } finally {
    timeout.cleanup();
  }
}

export async function storeFeishuTransitResponse(
  response: Response,
  name: string,
  mimeType: string,
  transitFiles: TransitFileWriter,
): Promise<TransitFileUpload> {
  const bytes = await readLimitedBytes(response, transitFiles.maxBytes, "Feishu download");
  return storeFeishuTransitBytes(bytes, name, mimeType, transitFiles);
}

export async function storeFeishuTransitBytes(
  bytes: Uint8Array,
  name: string,
  mimeType: string,
  transitFiles: TransitFileWriter,
): Promise<TransitFileUpload> {
  if (bytes.byteLength > transitFiles.maxBytes) {
    throw new ProviderRequestError(413, `Feishu file exceeds local transit limit of ${transitFiles.maxBytes} bytes`);
  }
  return transitFiles.create(new File([bytes.slice().buffer], name, { type: mimeType }));
}

async function readLimitedBytes(response: Response, maxBytes: number, fieldName: string) {
  if (!response.body) {
    throw new ProviderRequestError(400, `${fieldName} returned an empty body`);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      size += result.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw sourceTooLargeError(fieldName, maxBytes);
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseContentLength(value: string | null) {
  if (value == null) {
    return undefined;
  }
  const sizeBytes = Number(value);
  return Number.isSafeInteger(sizeBytes) && sizeBytes >= 0 ? sizeBytes : undefined;
}

function sourceTooLargeError(fieldName: string, maxBytes: number) {
  return new ProviderRequestError(400, `${fieldName} exceeds ${maxBytes} bytes`);
}

function inferFileName(rawUrl: string) {
  const segment = new URL(rawUrl).pathname.split("/").filter(Boolean).at(-1);
  if (!segment) {
    return "file.bin";
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
