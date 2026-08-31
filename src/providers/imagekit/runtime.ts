import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const imagekitApiBaseUrl = "https://api.imagekit.io";

type ImagekitRequestPhase = "validate" | "execute";

interface ImagekitActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface ImagekitRequestInput {
  path: string;
  apiKey: string;
  method: string;
  fetcher: typeof fetch;
  phase: ImagekitRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}

type ImagekitActionHandler = (input: Record<string, unknown>, context: ImagekitActionContext) => Promise<unknown>;

export const imagekitActionHandlers: ProviderActionHandlers<"imagekit", ImagekitActionHandler> = {
  list_assets(input, context) {
    return listImagekitAssets(input, context);
  },
  get_file_details(input, context) {
    return getImagekitFileDetails(input, context);
  },
  get_uploaded_file_metadata(input, context) {
    return getImagekitUploadedFileMetadata(input, context);
  },
  get_remote_file_metadata(input, context) {
    return getImagekitRemoteFileMetadata(input, context);
  },
  delete_file(input, context) {
    return deleteImagekitFile(input, context);
  },
  purge_cache(input, context) {
    return purgeImagekitCache(input, context);
  },
  get_purge_status(input, context) {
    return getImagekitPurgeStatus(input, context);
  },
};

export async function validateImagekitCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await imagekitGetJson({
    path: "/v1/files",
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
    phase: "validate",
    query: {
      limit: "1",
    },
  });
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "ImageKit list assets response must be an array", payload);
  }

  return {
    profile: {
      accountId: "api_key",
      displayName: "ImageKit API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: imagekitApiBaseUrl,
      validationEndpoint: "/v1/files",
    },
  };
}

async function listImagekitAssets(input: Record<string, unknown>, context: ImagekitActionContext): Promise<unknown> {
  const payload = await imagekitGetJson({
    path: "/v1/files",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query: compactObject({
      path: optionalString(input.path),
      searchQuery: optionalString(input.searchQuery),
      fileType: optionalString(input.fileType),
      sort: optionalString(input.sort),
      limit: stringifyOptionalInteger(optionalInteger(input.limit)),
      skip: stringifyOptionalInteger(optionalInteger(input.skip)),
    }),
  });
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "ImageKit list assets response must be an array", payload);
  }

  return { assets: payload };
}

async function getImagekitFileDetails(
  input: Record<string, unknown>,
  context: ImagekitActionContext,
): Promise<unknown> {
  const payload = await imagekitGetJson({
    path: `/v1/files/${encodeURIComponent(requireImagekitString(input.fileId, "fileId"))}/details`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const asset = optionalRecord(payload);
  if (!asset) {
    throw new ProviderRequestError(502, "ImageKit file details response must be an object", payload);
  }

  return { asset };
}

async function getImagekitUploadedFileMetadata(
  input: Record<string, unknown>,
  context: ImagekitActionContext,
): Promise<unknown> {
  return {
    metadata: await getImagekitMetadata(
      `/v1/files/${encodeURIComponent(requireImagekitString(input.fileId, "fileId"))}/metadata`,
      context,
    ),
  };
}

async function getImagekitRemoteFileMetadata(
  input: Record<string, unknown>,
  context: ImagekitActionContext,
): Promise<unknown> {
  return {
    metadata: await getImagekitMetadata("/v1/metadata", context, {
      url: requireImagekitString(input.url, "url"),
    }),
  };
}

async function getImagekitMetadata(
  path: string,
  context: ImagekitActionContext,
  query?: Record<string, string | undefined>,
): Promise<Record<string, unknown>> {
  const payload = await imagekitGetJson({
    path,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    query,
  });
  const metadata = optionalRecord(payload);
  if (!metadata) {
    throw new ProviderRequestError(502, "ImageKit metadata response must be an object", payload);
  }
  return metadata;
}

async function deleteImagekitFile(input: Record<string, unknown>, context: ImagekitActionContext): Promise<unknown> {
  await imagekitRequest({
    path: `/v1/files/${encodeURIComponent(requireImagekitString(input.fileId, "fileId"))}`,
    apiKey: context.apiKey,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return { deleted: true };
}

async function purgeImagekitCache(input: Record<string, unknown>, context: ImagekitActionContext): Promise<unknown> {
  const payload = await imagekitRequest({
    path: "/v1/files/purge",
    apiKey: context.apiKey,
    method: "POST",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: {
      url: requireImagekitString(input.url, "url"),
    },
  });
  const requestId = optionalString(optionalRecord(payload)?.requestId);
  if (!requestId) {
    throw new ProviderRequestError(502, "ImageKit purge cache response did not include requestId", payload);
  }

  return { requestId };
}

async function getImagekitPurgeStatus(
  input: Record<string, unknown>,
  context: ImagekitActionContext,
): Promise<unknown> {
  const payload = await imagekitGetJson({
    path: `/v1/files/purge/${encodeURIComponent(requireImagekitString(input.requestId, "requestId"))}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const status = optionalString(optionalRecord(payload)?.status);
  if (status !== "Pending" && status !== "Completed") {
    throw new ProviderRequestError(502, "ImageKit purge status response did not include a valid status", payload);
  }

  return { status };
}

async function imagekitGetJson(input: Omit<ImagekitRequestInput, "method" | "body">): Promise<unknown> {
  return imagekitRequest({ ...input, method: "GET" });
}

async function imagekitRequest(input: ImagekitRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal);
  let response: Response;
  try {
    response = await input.fetcher(buildImagekitUrl(input.path, input.query), {
      method: input.method,
      headers: imagekitHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "ImageKit request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ImageKit request failed: ${error.message}` : "ImageKit request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readImagekitPayload(response);
  if (!response.ok) {
    throw createImagekitError(response, payload, input.phase);
  }
  return payload;
}

function buildImagekitUrl(path: string, query: Record<string, string | undefined> = {}): URL {
  const url = new URL(path, imagekitApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function imagekitHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readImagekitPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "ImageKit returned invalid JSON", text);
  }
}

function createImagekitError(response: Response, payload: unknown, phase: ImagekitRequestPhase): ProviderRequestError {
  const message = optionalString(optionalRecord(payload)?.message) ?? response.statusText;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, `ImageKit request failed: ${message}`, payload);
  }

  return new ProviderRequestError(response.status, `ImageKit request failed: ${message}`, payload);
}

function requireImagekitString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function stringifyOptionalInteger(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}
