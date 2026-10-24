import type { ApiKeyProviderContext } from "./provider-executors.ts";

import { optionalRecord, optionalString, requiredString } from "../core/cast.ts";
import { readBoundedResponseBytes } from "../core/request.ts";
import {
  createProviderFetch,
  providerUserAgent,
  ProviderRequestError,
  providerInputError,
  isAbortLikeError,
  isAbortSignalError,
  runProviderRequest,
  readProviderErrorTextBody,
} from "./provider-runtime.ts";

export interface ProviderTransitFile {
  fileId: string;
  downloadUrl: string;
  sizeBytes: number;
  name: string;
  mimeType: string;
}

export interface ProviderInputFile {
  fileId: string;
  file: File;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

interface UploadSourceInput {
  url: string;
  fetcher: typeof fetch;
  fieldName: string;
  maximumBytes?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Download an upload source through public-only egress with a bounded body. */
export async function downloadUploadSource(
  input: UploadSourceInput,
): Promise<{ bytes: Uint8Array; contentType?: string }> {
  return runProviderRequest(
    { label: input.fieldName, timeoutMs: input.timeoutMs ?? 15_000, signal: input.signal },
    async (signal) => {
      const response = await createProviderFetch({ fetch: input.fetcher })(input.url, { signal });
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        throw providerInputError(`${input.fieldName} download failed with HTTP ${response.status}`);
      }
      const bytes = await readBoundedResponseBytes(response, {
        maxBytes: input.maximumBytes ?? 20 * 1024 * 1024,
        fieldName: input.fieldName,
        createError: providerInputError,
        signal,
      });
      return { bytes, contentType: response.headers.get("content-type") ?? undefined };
    },
  );
}

/**
 * Store a provider-hosted file in the local transit file service when enabled.
 */
export async function uploadProviderUrlToTransitFile(
  input: {
    url: string;
    name: string;
    source: string;
  },
  context: Pick<ApiKeyProviderContext, "fetcher" | "transitFiles" | "signal">,
): Promise<ProviderTransitFile | null> {
  if (!context.transitFiles) {
    return null;
  }
  const transitFiles = context.transitFiles;

  let response: Response;
  try {
    response = await context.fetcher(input.url, {
      headers: {
        accept: "*/*",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    if (isAbortLikeError(error) || isAbortSignalError(context.signal, error)) {
      throw new ProviderRequestError(504, `${input.source} transit download timed out`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `${input.source} transit download failed: ${error.message}`
        : `${input.source} transit download failed`,
    );
  }
  // An abort that lands after the response headers arrive rejects the body read
  // outside the fetch catch above, so map it here too.
  const readTransitBody = async <T>(read: () => Promise<T>): Promise<T> => {
    try {
      return await read();
    } catch (error) {
      if (isAbortLikeError(error) || isAbortSignalError(context.signal, error)) {
        throw new ProviderRequestError(504, `${input.source} transit download timed out`);
      }
      throw error;
    }
  };

  if (!response.ok) {
    const text = await readTransitBody(() =>
      readProviderErrorTextBody(response, `${input.source} error response`, context.signal),
    );
    throw new ProviderRequestError(
      response.status >= 500 ? 502 : response.status,
      text || `${input.source} transit download failed with HTTP ${response.status}`,
    );
  }

  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  const bytes = await readTransitBody(() =>
    readBoundedResponseBytes(response, {
      maxBytes: transitFiles.maxBytes,
      fieldName: input.name,
      createError: (message) => new ProviderRequestError(413, message),
      signal: context.signal,
    }),
  );
  const upload = await transitFiles.create(new File([Uint8Array.from(bytes)], input.name, { type: mimeType }));
  return {
    fileId: upload.fileId,
    downloadUrl: upload.downloadUrl,
    sizeBytes: upload.sizeBytes,
    name: input.name,
    mimeType,
  };
}

/**
 * Read a user-uploaded transit file reference from action input.
 */
export async function readTransitFileInput(
  input: unknown,
  context: Pick<ApiKeyProviderContext, "transitFiles">,
): Promise<ProviderInputFile> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  }

  const reference = optionalRecord(input);
  if (!reference) {
    throw new ProviderRequestError(400, "file must be a transit file reference.");
  }

  const fileId = requiredString(reference.fileId, "file.fileId", (message) => new ProviderRequestError(400, message));
  const stored = await context.transitFiles.read(fileId);
  const name = optionalString(reference.name) ?? stored.name;
  const mimeType = optionalString(reference.mimeType) ?? stored.mimeType;
  const file =
    name === stored.file.name && mimeType === stored.file.type
      ? stored.file
      : new File([await stored.file.arrayBuffer()], name, { type: mimeType });

  return {
    fileId,
    file,
    name,
    mimeType,
    sizeBytes: stored.sizeBytes,
  };
}
