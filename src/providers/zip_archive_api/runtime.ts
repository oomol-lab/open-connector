import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler, ProviderTransitFile } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalString, requiredString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { providerInputError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const apiBaseUrl = "https://api.archiveapi.com";
const maxExtractionResponseBytes = 512 * 1024 * 1024;
const maxExtractedFiles = 1_000;

export const zipArchiveApiActionHandlers: ProviderActionHandlers<
  "zip_archive_api",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  compress_files(input, context) {
    return compressFiles(input, context);
  },
  extract_archive(input, context) {
    return extractArchive(input, context);
  },
};

async function compressFiles(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const response = await requestArchiveApi(
    "/zip",
    {
      files: input.fileUrls,
      ...compactObject({
        archiveName: optionalString(input.archiveName),
        password: optionalString(input.password),
        compressionLevel: optionalInteger(input.compressionLevel),
      }),
    },
    context,
  );
  const transitFiles = requireTransitFiles(context);
  const name = readContentDispositionFileName(response.headers) ?? "archive.zip";
  const mimeType = response.headers.get("content-type") ?? "application/zip";
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: transitFiles.maxBytes,
    fieldName: name,
    createError: (message) => new ProviderRequestError(413, message),
  });
  return { file: await storeFile(new File([Uint8Array.from(bytes)], name, { type: mimeType }), context) };
}

async function extractArchive(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const response = await requestArchiveApi(
    "/extract",
    compactObject({
      file: requiredString(input.fileUrl, "fileUrl", providerInputError),
      password: optionalString(input.password),
    }),
    context,
    "multipart/form-data",
  );
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new ProviderRequestError(
      502,
      `ArchiveAPI returned an unexpected extraction content type: ${contentType || "missing"}`,
    );
  }
  const transitFiles = requireTransitFiles(context);
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: Math.min(maxExtractionResponseBytes, transitFiles.maxBytes * maxExtractedFiles),
    fieldName: "ArchiveAPI extraction response",
    createError: (message) => new ProviderRequestError(413, message),
  });
  const formData = await new Response(Uint8Array.from(bytes), { headers: { "content-type": contentType } }).formData();
  const files: ProviderTransitFile[] = [];
  for (const value of formData.values()) {
    if (!(value instanceof File)) continue;
    if (files.length >= maxExtractedFiles)
      throw new ProviderRequestError(413, `ArchiveAPI extraction exceeds the ${maxExtractedFiles} file limit`);
    if (value.size > transitFiles.maxBytes)
      throw new ProviderRequestError(413, `${value.name} exceeds the transit file size limit`);
    files.push(await storeFile(value, context));
  }
  if (files.length === 0) throw new ProviderRequestError(502, "ArchiveAPI extracted no files");
  return { files };
}

async function requestArchiveApi(
  path: string,
  body: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  accept = "application/zip, application/octet-stream",
): Promise<Response> {
  const url = new URL(path, apiBaseUrl);
  url.searchParams.set("secret", context.apiKey);
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "POST",
      headers: { accept, "content-type": "application/json", "user-agent": providerUserAgent },
      body: JSON.stringify(body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ArchiveAPI request failed: ${error.message}` : "ArchiveAPI request failed",
    );
  }
  if (!response.ok) throw await createArchiveApiError(response);
  return response;
}

async function storeFile(file: File, context: ApiKeyProviderContext): Promise<ProviderTransitFile> {
  const stored = await requireTransitFiles(context).create(file);
  return {
    fileId: stored.fileId,
    downloadUrl: stored.downloadUrl,
    sizeBytes: stored.sizeBytes,
    name: stored.name,
    mimeType: stored.mimeType,
  };
}

function requireTransitFiles(context: ApiKeyProviderContext) {
  if (!context.transitFiles) throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  return context.transitFiles;
}

function readContentDispositionFileName(headers: Headers): string | undefined {
  const value = headers.get("content-disposition");
  if (!value) return undefined;
  for (const part of value.split(";").slice(1)) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim().toLowerCase() !== "filename") continue;
    const raw = part.slice(separator + 1).trim();
    return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  }
  return undefined;
}

async function createArchiveApiError(response: Response): Promise<ProviderRequestError> {
  const text = await response.text().catch(() => "");
  let message = text.trim() || response.statusText || "ArchiveAPI request failed";
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    message =
      optionalString(payload.message) ?? optionalString(payload.error) ?? optionalString(payload.detail) ?? message;
  } catch {}
  const status =
    response.status === 429
      ? 429
      : response.status === 401 || response.status === 403
        ? 401
        : response.status < 500
          ? 400
          : 502;
  return new ProviderRequestError(status, message);
}
