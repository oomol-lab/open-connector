import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { providerInputError, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface CloudinaryContext {
  apiKey: string;
  apiSecret: string;
  cloudName: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type CloudinaryRequestPhase = "validate" | "execute";

const cloudinaryApiBaseUrl = "https://api.cloudinary.com/v1_1";

export const cloudinaryActionHandlers: ProviderActionHandlers<
  "cloudinary",
  ProviderRuntimeHandler<CloudinaryContext>
> = {
  upload_asset(input, context) {
    return uploadAsset(input, context);
  },
  update_asset(input, context) {
    return updateAsset(input, context);
  },
  rename_asset(input, context) {
    return renameAsset(input, context);
  },
  list_assets(input, context) {
    return listAssets(input, context);
  },
  get_asset(input, context) {
    return getAsset(input, context);
  },
};

export async function validateCloudinaryCredential(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const credential = resolveCloudinaryCredential(values);
  const url = new URL("resources/image/upload", buildCloudinaryBaseUrl(credential.cloudName));
  url.searchParams.set("max_results", "1");
  await requestCloudinaryJson(
    url,
    {
      method: "GET",
      headers: cloudinaryHeaders(credential),
      signal,
    },
    fetcher,
    "validate",
  );
  return {
    profile: {
      accountId: `cloudinary:${credential.cloudName}`,
      displayName: `Cloudinary ${credential.cloudName}`,
    },
    grantedScopes: [],
    metadata: {
      cloudName: credential.cloudName,
      apiBaseUrl: cloudinaryApiBaseUrl,
      validationEndpoint: "/resources/image/upload",
    },
  };
}

async function uploadAsset(input: Record<string, unknown>, context: CloudinaryContext): Promise<unknown> {
  const resourceType = readCloudinaryResourceType(input, "image");
  const url = new URL(`${resourceType}/upload`, buildCloudinaryBaseUrl(context.cloudName));
  const formData = new FormData();
  formData.set("file", readCloudinaryUploadSource(input));
  appendCloudinaryCommonUploadFields(formData, input);
  const payload = await requestCloudinaryJson(
    url,
    {
      method: "POST",
      headers: cloudinaryHeaders(context),
      body: formData,
      signal: context.signal,
    },
    context.fetcher,
    "execute",
  );
  return {
    asset: normalizeCloudinaryAsset(payload),
  };
}

async function updateAsset(input: Record<string, unknown>, context: CloudinaryContext): Promise<unknown> {
  if (input.displayName === undefined && input.assetFolder === undefined && input.tags === undefined) {
    throw new ProviderRequestError(400, "at least one of displayName, assetFolder, or tags is required");
  }
  const resourceType = readCloudinaryResourceType(input, "image");
  const url = new URL(`${resourceType}/explicit`, buildCloudinaryBaseUrl(context.cloudName));
  const formData = new FormData();
  formData.set("public_id", requiredString(input.publicId, "publicId", providerInputError));
  appendOptionalFormField(formData, "display_name", optionalString(input.displayName));
  appendOptionalFormField(formData, "asset_folder", optionalString(input.assetFolder));
  appendOptionalStringList(formData, "tags", input.tags);
  const payload = await requestCloudinaryJson(
    url,
    {
      method: "POST",
      headers: cloudinaryHeaders(context),
      body: formData,
      signal: context.signal,
    },
    context.fetcher,
    "execute",
  );
  return {
    asset: normalizeCloudinaryAsset(payload),
  };
}

async function renameAsset(input: Record<string, unknown>, context: CloudinaryContext): Promise<unknown> {
  const resourceType = readCloudinaryResourceType(input, "image");
  const url = new URL(`${resourceType}/rename`, buildCloudinaryBaseUrl(context.cloudName));
  const formData = new FormData();
  formData.set("from_public_id", requiredString(input.fromPublicId, "fromPublicId", providerInputError));
  formData.set("to_public_id", requiredString(input.toPublicId, "toPublicId", providerInputError));
  const payload = await requestCloudinaryJson(
    url,
    {
      method: "POST",
      headers: cloudinaryHeaders(context),
      body: formData,
      signal: context.signal,
    },
    context.fetcher,
    "execute",
  );
  return {
    asset: normalizeCloudinaryAsset(payload),
  };
}

async function listAssets(input: Record<string, unknown>, context: CloudinaryContext): Promise<unknown> {
  const resourceType = readCloudinaryResourceType(input, "image");
  const url = new URL(`resources/${resourceType}/upload`, buildCloudinaryBaseUrl(context.cloudName));
  appendOptionalQuery(url, "prefix", optionalString(input.prefix));
  appendOptionalQuery(url, "max_results", readOptionalStringifiedInteger(input.maxResults));
  appendOptionalQuery(url, "next_cursor", optionalString(input.nextCursor));
  appendOptionalQuery(url, "direction", optionalString(input.direction));
  appendOptionalBooleanQuery(url, "tags", input.includeTags);
  appendOptionalBooleanQuery(url, "context", input.includeContext);
  const payload = await requestCloudinaryJson(
    url,
    {
      method: "GET",
      headers: cloudinaryHeaders(context),
      signal: context.signal,
    },
    context.fetcher,
    "execute",
  );
  const record = readCloudinaryRecord(payload, "Cloudinary list assets response");
  const resources = Array.isArray(record.resources) ? record.resources : undefined;
  if (!resources) {
    throw new ProviderRequestError(502, "Cloudinary list assets response missing resources");
  }
  return {
    assets: resources.map((resource) => normalizeCloudinaryAsset(resource)),
    nextCursor: optionalString(record.next_cursor) ?? null,
  };
}

async function getAsset(input: Record<string, unknown>, context: CloudinaryContext): Promise<unknown> {
  const assetId = requiredString(input.assetId, "assetId", providerInputError);
  const url = new URL(`resources/${encodeURIComponent(assetId)}`, buildCloudinaryBaseUrl(context.cloudName));
  const payload = await requestCloudinaryJson(
    url,
    {
      method: "GET",
      headers: cloudinaryHeaders(context),
      signal: context.signal,
    },
    context.fetcher,
    "execute",
  );
  return {
    asset: normalizeCloudinaryAsset(payload),
  };
}

async function requestCloudinaryJson(
  url: URL,
  init: RequestInit,
  fetcher: typeof fetch,
  phase: CloudinaryRequestPhase,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Cloudinary request failed: ${error.message}` : "Cloudinary request failed",
    );
  }
  const payload = await readCloudinaryPayload(response);
  if (!response.ok) {
    throw createCloudinaryError(response.status, payload, phase, response.statusText || "Cloudinary request failed");
  }
  return payload;
}

function resolveCloudinaryCredential(values: Record<string, string>): {
  apiKey: string;
  apiSecret: string;
  cloudName: string;
} {
  return {
    apiKey: requiredString(values.apiKey, "apiKey", providerInputError),
    apiSecret: requiredString(values.apiSecret, "apiSecret", providerInputError),
    cloudName: requiredString(values.cloudName, "cloudName", providerInputError),
  };
}

function buildCloudinaryBaseUrl(cloudName: string): string {
  return `${cloudinaryApiBaseUrl}/${encodeURIComponent(cloudName)}/`;
}

function cloudinaryHeaders(input: Pick<CloudinaryContext, "apiKey" | "apiSecret">): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${input.apiKey}:${input.apiSecret}`).toString("base64")}`,
    "user-agent": providerUserAgent,
  };
}

async function readCloudinaryPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createCloudinaryError(
  status: number,
  payload: unknown,
  phase: CloudinaryRequestPhase,
  fallbackMessage: string,
): ProviderRequestError {
  const message = extractCloudinaryErrorMessage(payload) ?? fallbackMessage;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 400 || status === 404 || status === 409)) {
    return new ProviderRequestError(status === 409 ? 409 : 400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function extractCloudinaryErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return (
    optionalString(error?.message) ??
    optionalString(record?.message) ??
    (typeof payload === "string" && payload.trim() ? payload : undefined)
  );
}

function normalizeCloudinaryAsset(payload: unknown): Record<string, unknown> {
  const record = readCloudinaryRecord(payload, "Cloudinary asset response");
  const assetId = optionalString(record.asset_id);
  const publicId = optionalString(record.public_id);
  const resourceType = optionalString(record.resource_type);
  const deliveryType = optionalString(record.type);
  const createdAt = optionalString(record.created_at);
  if (!assetId || !publicId || !resourceType || !deliveryType || !createdAt) {
    throw new ProviderRequestError(502, "Cloudinary asset response missing required fields");
  }
  return {
    assetId,
    publicId,
    version: optionalInteger(record.version),
    versionId: optionalString(record.version_id),
    signature: optionalString(record.signature),
    format: optionalString(record.format),
    resourceType,
    deliveryType,
    createdAt,
    bytes: optionalInteger(record.bytes),
    width: optionalInteger(record.width),
    height: optionalInteger(record.height),
    assetFolder: optionalString(record.asset_folder),
    displayName: optionalString(record.display_name),
    tags: Array.isArray(record.tags) ? record.tags.map((value) => String(value)) : undefined,
    context: optionalRecord(record.context),
    url: optionalString(record.url),
    secureUrl: optionalString(record.secure_url),
  };
}

function readCloudinaryRecord(payload: unknown, label: string): Record<string, unknown> {
  try {
    return requiredRecord(payload, label, (message) => new ProviderRequestError(502, message));
  } catch {
    throw new ProviderRequestError(502, `${label} is not an object`);
  }
}

function readCloudinaryResourceType(input: Record<string, unknown>, fallback: "image" | "video" | "raw"): string {
  const resourceType = optionalString(input.resourceType);
  if (!resourceType) {
    return fallback;
  }
  if (resourceType === "image" || resourceType === "video" || resourceType === "raw") {
    return resourceType;
  }
  throw new ProviderRequestError(400, "resourceType must be image, video, or raw");
}

function readCloudinaryUploadSource(input: Record<string, unknown>): string {
  const fileUrl = optionalString(input.fileUrl);
  const fileDataUri = optionalString(input.fileDataUri);
  const sourceCount = [fileUrl != null, fileDataUri != null].filter(Boolean).length;
  if (sourceCount !== 1) {
    throw new ProviderRequestError(400, "exactly one of fileUrl or fileDataUri is required");
  }
  if (fileUrl) {
    return assertPublicHttpUrl(fileUrl, {
      fieldName: "fileUrl",
      createError: (message) => new ProviderRequestError(400, message),
    }).toString();
  }
  return fileDataUri!;
}

function appendCloudinaryCommonUploadFields(formData: FormData, input: Record<string, unknown>): void {
  appendOptionalFormField(formData, "public_id", optionalString(input.publicId));
  appendOptionalFormField(formData, "display_name", optionalString(input.displayName));
  appendOptionalFormField(formData, "asset_folder", optionalString(input.assetFolder));
  appendOptionalStringList(formData, "tags", input.tags);
}

function appendOptionalFormField(formData: FormData, name: string, value?: string): void {
  if (value) {
    formData.set(name, value);
  }
}

function appendOptionalStringList(formData: FormData, name: string, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }
  const items = value.map((item) => optionalString(item)).filter((item): item is string => typeof item === "string");
  if (items.length > 0) {
    formData.set(name, items.join(","));
  }
}

function appendOptionalQuery(url: URL, name: string, value?: string): void {
  if (value) {
    url.searchParams.set(name, value);
  }
}

function appendOptionalBooleanQuery(url: URL, name: string, value: unknown): void {
  if (typeof value === "boolean") {
    url.searchParams.set(name, value ? "true" : "false");
  }
}

function readOptionalStringifiedInteger(value: unknown): string | undefined {
  const integer = optionalInteger(value);
  return integer === undefined ? undefined : String(integer);
}
