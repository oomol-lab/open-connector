import type { TransitFileWriter } from "../../core/types.ts";

import { optionalRecord, requiredString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

interface MarketDumpContext {
  apiKey: string;
  fetcher: typeof fetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

type MarketDumpGet = (
  path: string,
  query: Record<string, string | number | undefined>,
  context: MarketDumpContext,
) => Promise<unknown>;

const mimeType = "application/vnd.apache.parquet";
const timeoutMs = 10 * 60 * 1_000;

export function createMarketDumpHandlers(
  get: MarketDumpGet,
): Record<string, (input: Record<string, unknown>, context: MarketDumpContext) => Promise<unknown>> {
  return {
    export_full_market_daily_history(_input, context) {
      return exportMarketDump(
        get,
        "/api/dump/market-dumps/daily-k/download-url",
        "tonghuashun-a-share-daily-k-10y.parquet",
        context,
      );
    },
    export_recent_market_daily_history(_input, context) {
      return exportMarketDump(
        get,
        "/api/dump/market-dumps/daily-k-10d/download-url",
        "tonghuashun-a-share-daily-k-10d.parquet",
        context,
      );
    },
    export_market_adjustment_factors(_input, context) {
      return exportMarketDump(
        get,
        "/api/dump/market-dumps/adjustment-factors/download-url",
        "tonghuashun-a-share-adjustment-factors.parquet",
        context,
      );
    },
  };
}

async function exportMarketDump(get: MarketDumpGet, path: string, name: string, context: MarketDumpContext) {
  if (!context.transitFiles) throw new ProviderRequestError(500, "market dump export requires local transit storage");
  const signed = optionalRecord(await get(path, {}, context));
  if (!signed) throw new ProviderRequestError(502, "market dump signing response must be an object");
  const sourceUrl = requiredString(signed.presigned_url, "presigned_url", providerOutput);
  const sourceExpiresAt = requiredDateTime(signed.presigned_url_expires_at, "presigned_url_expires_at");
  const url = parseHttpsUrl(sourceUrl, "presigned_url");
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeout]) : timeout;
  const response = await context.fetcher(url, {
    headers: { accept: mimeType },
    signal,
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderRequestError(502, `market dump download failed with HTTP ${response.status}`);
  }
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: "market dump",
    createError: (message) => new ProviderRequestError(502, message),
  });
  validateParquetEnvelope(bytes);
  const stored = await context.transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: mimeType }));
  return {
    file: {
      fileId: stored.fileId,
      downloadUrl: stored.downloadUrl,
      sizeBytes: bytes.byteLength,
      name,
      mimeType,
    },
    sourceExpiresAt,
  };
}

function validateParquetEnvelope(bytes: Uint8Array): void {
  const magic = [0x50, 0x41, 0x52, 0x31];
  const hasHeader = magic.every((byte, index) => bytes[index] === byte);
  const hasFooter = magic.every((byte, index) => bytes[bytes.byteLength - 4 + index] === byte);
  if (bytes.byteLength < 13 || !hasHeader || !hasFooter) {
    throw new ProviderRequestError(502, "market dump does not have a valid Parquet envelope");
  }
  const footer = bytes.subarray(bytes.byteLength - 8, bytes.byteLength - 4);
  const metadataLength = (footer[0]! | (footer[1]! << 8) | (footer[2]! << 16) | (footer[3]! << 24)) >>> 0;
  if (metadataLength === 0 || metadataLength > bytes.byteLength - 12) {
    throw new ProviderRequestError(502, "market dump does not have valid Parquet metadata bounds");
  }
}

function requiredDateTime(value: unknown, field: string): string {
  const text = requiredString(value, field, providerOutput);
  if (!Number.isFinite(Date.parse(text))) throw new ProviderRequestError(502, `${field} must be an ISO 8601 date-time`);
  return text;
}

function parseHttpsUrl(value: string, field: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderRequestError(502, `${field} must be a valid URL`);
  }
  if (url.protocol !== "https:") throw new ProviderRequestError(502, `${field} must use HTTPS`);
  return url;
}

function providerOutput(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
