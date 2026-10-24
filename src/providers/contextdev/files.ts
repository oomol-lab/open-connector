import type { TransitFileWriter } from "../../core/types.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { downloadUploadSource } from "../provider-files.ts";
import {
  requiredResponseRecord,
  ProviderRequestError,
  providerResponseError,
  providerInputError,
} from "../provider-runtime.ts";
export async function downloadParseFile(
  fileUrl: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const file = await downloadUploadSource({
    url: fileUrl,
    fetcher,
    signal,
    fieldName: "fileUrl",
    maximumBytes: 50 * 1024 * 1024,
  });
  if (!file.bytes.length) throw providerInputError("fileUrl returned an empty file");
  return file.bytes;
}
export async function storeScrapeFiles(
  payload: Record<string, unknown>,
  transitFiles?: TransitFileWriter,
): Promise<Record<string, unknown>> {
  for (const kind of ["screenshot", "bytes"] as const) {
    const output = optionalRecord(payload[kind]);
    if (output?.success !== true) continue;
    if (!transitFiles)
      throw new ProviderRequestError(
        500,
        "Context.dev binary outputs require file transit and execution context",
        undefined,
        "provider_error",
      );
    let encoded: string | undefined;
    let mimeType: string | undefined;
    let original: Record<string, unknown> = {};
    if (kind === "screenshot") {
      const data = optionalString(output.data);
      const separator = data?.indexOf(";base64,") ?? -1;
      if (data?.startsWith("data:image/") && separator > 0) {
        mimeType = data.slice(5, separator);
        encoded = data.slice(separator + 8);
      }
    } else {
      original = requiredResponseRecord(output.data, "Context.dev bytes data");
      encoded = optionalString(original.base64);
      mimeType = optionalString(original.contentType);
    }
    if (encoded === undefined || !mimeType) throw providerResponseError(`Invalid Context.dev ${kind} data`);
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.toString("base64").replaceAll("=", "") !== encoded.replaceAll("=", ""))
      throw providerResponseError(`Invalid Context.dev ${kind} base64`);
    const extension =
      kind === "screenshot" && ["image/png", "image/jpeg", "image/webp"].includes(mimeType) ? mimeType.slice(6) : "bin";
    const file = await transitFiles.create(new File([bytes], `contextdev-${kind}.${extension}`, { type: mimeType }));
    const { base64: _base64, ...metadata } = original;
    output.data = { ...metadata, url: file.downloadUrl, mimeType };
  }
  return payload;
}
