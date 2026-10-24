import type { TransitFileUpload } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { readBoundedResponseBytes, storeResponseInTransit } from "../../core/request.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  runProviderRequest,
} from "../provider-runtime.ts";

export function requireSansanTransit(context: ApiKeyProviderContext): void {
  if (!context.transitFiles) throw new ProviderRequestError(501, "Sansan downloads require transit file storage");
}

export async function downloadSansanSource(
  url: string,
  fieldName: string,
  context: ApiKeyProviderContext,
  jpeg = false,
): Promise<Uint8Array> {
  return runProviderRequest({ label: "Sansan source download", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(url, { signal });
    if (!response.ok) throw new ProviderRequestError(response.status, `Cannot download ${fieldName}`);
    const bytes = await readBoundedResponseBytes(response, {
      maxBytes: jpeg ? 5 * 1024 * 1024 : 20 * 1024 * 1024,
      fieldName,
      createError: providerInputError,
      signal,
    });
    if (!bytes.length) throw providerInputError(`${fieldName} is empty`);
    if (jpeg && (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff))
      throw providerInputError(`${fieldName} must contain a JPEG image`);
    return bytes;
  });
}

interface SansanMultipart {
  body: Uint8Array<ArrayBuffer>;
  headers: Record<string, string>;
}

export async function encodeSansanMultipart(form: FormData): Promise<SansanMultipart> {
  // Organization imports require a trailing CRLF and an explicit Content-Length.
  const response = new Response(form);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const hasCrLf = bytes.at(-2) === 13 && bytes.at(-1) === 10;
  const body = hasCrLf ? bytes : new Uint8Array(bytes.length + 2);
  if (!hasCrLf) {
    body.set(bytes);
    body.set([13, 10], bytes.length);
  }
  return {
    body,
    headers: { "content-type": response.headers.get("content-type")!, "content-length": String(body.byteLength) },
  };
}

export function uploadSansanDownload(
  response: Response,
  name: string,
  mimeType: string,
  context: ApiKeyProviderContext,
): Promise<TransitFileUpload> {
  requireSansanTransit(context);
  return storeResponseInTransit(response, context.transitFiles!, {
    name,
    mimeType: response.headers.get("content-type") || mimeType,
    fieldName: "Sansan download",
    createError: providerResponseError,
    signal: context.signal,
  });
}
