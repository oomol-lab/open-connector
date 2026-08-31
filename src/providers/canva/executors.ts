import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { defineOAuthProviderExecutors, providerInputError, ProviderRequestError } from "../provider-runtime.ts";

const service = "canva";
const canvaApiBaseUrl = "https://api.canva.com/rest";

type CanvaActionHandler = (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<unknown>;

interface CanvaUserIdentity {
  userId?: string;
  teamId?: string;
}

/** Build Canva executors for one regional OAuth service and API base URL. */
export function createCanvaExecutors(service: string, apiBaseUrl: string): ProviderExecutors {
  return defineOAuthProviderExecutors(service, createCanvaActionHandlers(apiBaseUrl));
}

export const executors: ProviderExecutors = createCanvaExecutors(service, canvaApiBaseUrl);

/** Build Canva credential validators for one regional OAuth API base URL. */
export function createCanvaCredentialValidators(apiBaseUrl: string): CredentialValidators {
  return {
    async oauth2(input, { fetcher, signal }) {
      const account = await canvaJsonRequest(
        "GET",
        "/v1/users/me",
        {
          accessToken: input.accessToken,
          tokenType: input.tokenType,
          fetcher,
          signal,
        },
        apiBaseUrl,
      );
      const identity = readCanvaUserIdentity(account);
      if (!identity.userId) {
        throw new ProviderRequestError(502, "canva current user response is missing user id");
      }
      return {
        profile: {
          accountId: identity.userId,
          displayName: identity.userId,
        },
        grantedScopes: readCanvaGrantedScopes(input.metadata.scope),
        metadata: compactObject({
          apiBaseUrl,
          validationEndpoint: "/v1/users/me",
          userId: identity.userId,
          teamId: identity.teamId,
        }),
      };
    },
  };
}

export const credentialValidators: CredentialValidators = createCanvaCredentialValidators(canvaApiBaseUrl);

function createCanvaActionHandlers(apiBaseUrl: string): ProviderActionHandlers<"canva", CanvaActionHandler> {
  return {
    get_current_user(_input, context) {
      return getCurrentUser(context, apiBaseUrl);
    },
    list_designs(input, context) {
      return listDesigns(input, context, apiBaseUrl);
    },
    get_design(input, context) {
      return getDesign(input, context, apiBaseUrl);
    },
    create_design(input, context) {
      return createDesign(input, context, apiBaseUrl);
    },
    list_folder_items(input, context) {
      return listFolderItems(input, context, apiBaseUrl);
    },
    create_folder(input, context) {
      return createFolder(input, context, apiBaseUrl);
    },
    move_folder_item(input, context) {
      return moveFolderItem(input, context, apiBaseUrl);
    },
    get_asset(input, context) {
      return getAsset(input, context, apiBaseUrl);
    },
    get_design_export_formats(input, context) {
      return getDesignExportFormats(input, context, apiBaseUrl);
    },
    create_design_export_job(input, context) {
      return createDesignExportJob(input, context, apiBaseUrl);
    },
    get_design_export_job(input, context) {
      return getDesignExportJob(input, context, apiBaseUrl);
    },
    create_url_asset_upload_job(input, context) {
      return createUrlAssetUploadJob(input, context, apiBaseUrl);
    },
    get_url_asset_upload_job(input, context) {
      return getUrlAssetUploadJob(input, context, apiBaseUrl);
    },
  };
}

async function getCurrentUser(context: OAuthProviderContext, apiBaseUrl: string) {
  const account = await canvaJsonRequest("GET", "/v1/users/me", context, apiBaseUrl);
  const profile = await canvaJsonRequest("GET", "/v1/users/me/profile", context, apiBaseUrl);
  return normalizeCurrentUser(account, profile);
}

async function listDesigns(input: Record<string, unknown>, context: OAuthProviderContext, apiBaseUrl: string) {
  const url = new URL(`${apiBaseUrl}/v1/designs`);
  appendQuery(url, "query", optionalString(input.query));
  appendQuery(url, "continuation", optionalString(input.continuation));
  appendQuery(url, "ownership", optionalString(input.ownership));
  appendQuery(url, "sort_by", optionalString(input.sortBy));
  appendQuery(url, "limit", optionalIntegerString(input.limit));
  const payload = await canvaJsonRequest("GET", url.toString(), context, apiBaseUrl);
  return {
    designs: readObjectArray(payload.items).map(mapCanvaDesign),
    continuation: optionalString(payload.continuation) ?? null,
  };
}

async function getDesign(input: Record<string, unknown>, context: OAuthProviderContext, apiBaseUrl: string) {
  const designId = requireCanvaString(input.designId, "canva designId");
  const payload = await canvaJsonRequest("GET", `/v1/designs/${encodeURIComponent(designId)}`, context, apiBaseUrl);
  return { design: mapCanvaDesign(requiredRecord(payload.design, "design", providerInputError)) };
}

async function createDesign(input: Record<string, unknown>, context: OAuthProviderContext, apiBaseUrl: string) {
  const payload = await canvaJsonRequest("POST", "/v1/designs", context, apiBaseUrl, mapCreateDesignBody(input));
  return { design: mapCanvaDesign(requiredRecord(payload.design, "design", providerInputError)) };
}

async function listFolderItems(input: Record<string, unknown>, context: OAuthProviderContext, apiBaseUrl: string) {
  const folderId = requireCanvaString(input.folderId, "canva folderId");
  const url = new URL(`${apiBaseUrl}/v1/folders/${encodeURIComponent(folderId)}/items`);
  appendQuery(url, "continuation", optionalString(input.continuation));
  appendQuery(url, "limit", optionalIntegerString(input.limit));
  appendQuery(url, "item_types", optionalStringList(input.itemTypes));
  appendQuery(url, "sort_by", optionalString(input.sortBy));
  appendQuery(url, "pin_status", optionalString(input.pinStatus));
  const payload = await canvaJsonRequest("GET", url.toString(), context, apiBaseUrl);
  return {
    items: readObjectArray(payload.items).map(mapFolderItem),
    continuation: optionalString(payload.continuation) ?? null,
  };
}

async function createFolder(input: Record<string, unknown>, context: OAuthProviderContext, apiBaseUrl: string) {
  const payload = await canvaJsonRequest("POST", "/v1/folders", context, apiBaseUrl, {
    name: requireCanvaString(input.name, "canva folder name"),
    parent_folder_id: requireCanvaString(input.parentFolderId, "canva parentFolderId"),
  });
  return { folder: mapCanvaFolder(requiredRecord(payload.folder, "folder", providerInputError)) };
}

async function moveFolderItem(input: Record<string, unknown>, context: OAuthProviderContext, apiBaseUrl: string) {
  const itemId = requireCanvaString(input.itemId, "canva itemId");
  const toFolderId = requireCanvaString(input.toFolderId, "canva toFolderId");
  await canvaJsonRequest(
    "POST",
    "/v1/folders/move",
    context,
    apiBaseUrl,
    {
      item_id: itemId,
      to_folder_id: toFolderId,
    },
    true,
  );
  return { moved: true, itemId, toFolderId };
}

async function getAsset(input: Record<string, unknown>, context: OAuthProviderContext, apiBaseUrl: string) {
  const assetId = requireCanvaString(input.assetId, "canva assetId");
  const payload = await canvaJsonRequest("GET", `/v1/assets/${encodeURIComponent(assetId)}`, context, apiBaseUrl);
  return { asset: mapCanvaAsset(requiredRecord(payload.asset, "asset", providerInputError)) };
}

async function getDesignExportFormats(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
  apiBaseUrl: string,
) {
  const designId = requireCanvaString(input.designId, "canva designId");
  const payload = await canvaJsonRequest(
    "GET",
    `/v1/designs/${encodeURIComponent(designId)}/export-formats`,
    context,
    apiBaseUrl,
  );
  return { formats: readObjectArray(payload.formats) };
}

async function createDesignExportJob(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
  apiBaseUrl: string,
) {
  const payload = await canvaJsonRequest("POST", "/v1/exports", context, apiBaseUrl, {
    design_id: requireCanvaString(input.designId, "canva designId"),
    format: mapExportFormat(requiredRecord(input.format, "format", providerInputError)),
  });
  return { job: mapExportJob(requiredRecord(payload.job, "job", providerInputError)) };
}

async function getDesignExportJob(input: Record<string, unknown>, context: OAuthProviderContext, apiBaseUrl: string) {
  const exportId = requireCanvaString(input.exportId, "canva exportId");
  const payload = await canvaJsonRequest("GET", `/v1/exports/${encodeURIComponent(exportId)}`, context, apiBaseUrl);
  return { job: mapExportJob(requiredRecord(payload.job, "job", providerInputError)) };
}

async function createUrlAssetUploadJob(
  input: Record<string, unknown>,
  context: OAuthProviderContext,
  apiBaseUrl: string,
) {
  const payload = await canvaJsonRequest("POST", "/v1/url-asset-uploads", context, apiBaseUrl, {
    name: requireCanvaString(input.name, "canva asset name"),
    url: requireCanvaString(input.url, "canva asset url"),
  });
  return { job: mapAssetUploadJob(requiredRecord(payload.job, "job", providerInputError)) };
}

async function getUrlAssetUploadJob(input: Record<string, unknown>, context: OAuthProviderContext, apiBaseUrl: string) {
  const jobId = requireCanvaString(input.jobId, "canva asset upload jobId");
  const payload = await canvaJsonRequest(
    "GET",
    `/v1/url-asset-uploads/${encodeURIComponent(jobId)}`,
    context,
    apiBaseUrl,
  );
  return { job: mapAssetUploadJob(requiredRecord(payload.job, "job", providerInputError)) };
}

async function canvaJsonRequest(
  method: "GET" | "POST",
  pathOrUrl: string,
  context: OAuthProviderContext,
  apiBaseUrl: string,
  body?: Record<string, unknown>,
  allowNoContent = false,
) {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${apiBaseUrl}${pathOrUrl}`;
  const response = await context.fetcher(url, {
    method,
    headers: {
      authorization: `${context.tokenType ?? "Bearer"} ${context.accessToken}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: context.signal,
  });
  if (response.status === 204 && allowNoContent) return {};
  const payload = await readJsonRecord(response);
  if (!response.ok) throw normalizeHttpError(response.status, payload, "canva request failed");
  return payload;
}

async function readJsonRecord(response: Response) {
  try {
    return requiredRecord(await response.json(), "canva response", providerInputError);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(502, "canva response is not valid JSON");
  }
}

function normalizeHttpError(status: number, payload: Record<string, unknown>, fallbackMessage: string) {
  const errorObject = optionalRecord(payload.error);
  const message =
    optionalString(payload.message) ??
    optionalString(payload.error_description) ??
    optionalString(errorObject?.message) ??
    fallbackMessage;
  if (status === 400) return new ProviderRequestError(400, message, payload);
  if (status === 401 || status === 403) return new ProviderRequestError(status, message, payload);
  if (status === 404) return new ProviderRequestError(404, message, payload);
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function normalizeCurrentUser(accountPayload: Record<string, unknown>, profilePayload: Record<string, unknown>) {
  const identity = readCanvaUserIdentity(accountPayload);
  const profile = optionalRecord(profilePayload.profile) ?? {};
  return {
    userId: identity.userId ?? requireCanvaString(accountPayload.id, "canva user id"),
    teamId: identity.teamId ?? null,
    displayName: optionalString(profile.display_name) ?? optionalString(profile.displayName) ?? null,
  };
}

function readCanvaUserIdentity(accountPayload: Record<string, unknown>): CanvaUserIdentity {
  const teamUser = optionalRecord(accountPayload.team_user) ?? optionalRecord(accountPayload.user) ?? {};
  return {
    userId:
      optionalString(teamUser.user_id) ??
      optionalString(teamUser.userId) ??
      optionalString(teamUser.id) ??
      optionalString(accountPayload.id),
    teamId: optionalString(teamUser.team_id) ?? optionalString(teamUser.teamId),
  };
}

function readCanvaGrantedScopes(value: unknown): string[] {
  const scope = optionalString(value);
  return scope ? [...new Set(scope.split(/[\s,]+/u).filter(Boolean))] : [];
}

function mapCanvaDesign(payload: Record<string, unknown>) {
  const urls = optionalRecord(payload.urls) ?? {};
  const thumbnail = optionalRecord(payload.thumbnail) ?? {};
  const owner = optionalRecord(payload.owner) ?? {};
  return {
    id: requireCanvaString(payload.id, "canva design id"),
    title: optionalString(payload.title) ?? null,
    editUrl: optionalString(urls.edit_url) ?? optionalString(urls.editUrl) ?? null,
    viewUrl: optionalString(urls.view_url) ?? optionalString(urls.viewUrl) ?? null,
    thumbnailUrl: optionalString(thumbnail.url) ?? null,
    thumbnailWidth: optionalNumber(thumbnail.width) ?? null,
    thumbnailHeight: optionalNumber(thumbnail.height) ?? null,
    ownerUserId: optionalString(owner.user_id) ?? optionalString(owner.userId) ?? null,
    ownerTeamId: optionalString(owner.team_id) ?? optionalString(owner.teamId) ?? null,
    createdAt: unixSecondsToIso(payload.created_at ?? payload.createdAt),
    updatedAt: unixSecondsToIso(payload.updated_at ?? payload.updatedAt),
  };
}

function mapCanvaFolder(payload: Record<string, unknown>) {
  const thumbnail = optionalRecord(payload.thumbnail) ?? {};
  const name = optionalString(payload.name) ?? null;
  return {
    id: requireCanvaString(payload.id, "canva folder id"),
    name,
    title: optionalString(payload.title) ?? name,
    url: optionalString(payload.url) ?? null,
    thumbnailUrl: optionalString(thumbnail.url) ?? null,
    thumbnailWidth: optionalNumber(thumbnail.width) ?? null,
    thumbnailHeight: optionalNumber(thumbnail.height) ?? null,
    createdAt: unixSecondsToIso(payload.created_at ?? payload.createdAt),
    updatedAt: unixSecondsToIso(payload.updated_at ?? payload.updatedAt),
  };
}

function mapExportJob(payload: Record<string, unknown>) {
  const error = optionalRecord(payload.error) ?? {};
  return {
    id: requireCanvaString(payload.id, "canva export job id"),
    status: requireCanvaString(payload.status, "canva export job status"),
    urls: readStringArray(payload.urls),
    errorCode: optionalString(error.code) ?? null,
    errorMessage: optionalString(error.message) ?? null,
  };
}

function mapAssetUploadJob(payload: Record<string, unknown>) {
  const error = optionalRecord(payload.error) ?? {};
  const asset = optionalRecord(payload.asset);
  return {
    id: requireCanvaString(payload.id, "canva asset upload job id"),
    status: requireCanvaString(payload.status, "canva asset upload job status"),
    asset: asset ? mapCanvaAsset(asset) : null,
    errorCode: optionalString(error.code) ?? null,
    errorMessage: optionalString(error.message) ?? null,
  };
}

function mapCanvaAsset(payload: Record<string, unknown>) {
  const thumbnail = optionalRecord(payload.thumbnail) ?? {};
  const owner = optionalRecord(payload.owner) ?? {};
  const metadata = optionalRecord(payload.metadata);
  return {
    id: requireCanvaString(payload.id, "canva asset id"),
    type: optionalString(payload.type) ?? null,
    name: optionalString(payload.name) ?? null,
    tags: readStringArray(payload.tags),
    thumbnailUrl: optionalString(thumbnail.url) ?? null,
    thumbnailWidth: optionalNumber(thumbnail.width) ?? null,
    thumbnailHeight: optionalNumber(thumbnail.height) ?? null,
    ownerUserId: optionalString(owner.user_id) ?? optionalString(owner.userId) ?? null,
    ownerTeamId: optionalString(owner.team_id) ?? optionalString(owner.teamId) ?? null,
    createdAt: unixSecondsToIso(payload.created_at ?? payload.createdAt),
    updatedAt: unixSecondsToIso(payload.updated_at ?? payload.updatedAt),
    importStatus: mapImportStatus(payload.import_status ?? payload.importStatus),
    metadata: metadata ? mapAssetMetadata(metadata) : null,
  };
}

function mapImportStatus(value: unknown) {
  const payload = optionalRecord(value);
  if (!payload) return null;
  const error = optionalRecord(payload.error) ?? {};
  return {
    state: requireCanvaString(payload.state, "canva import status state"),
    errorCode: optionalString(error.code) ?? null,
    errorMessage: optionalString(error.message) ?? null,
  };
}

function mapAssetMetadata(payload: Record<string, unknown>) {
  return {
    type: optionalString(payload.type) ?? null,
    width: optionalNumber(payload.width) ?? null,
    height: optionalNumber(payload.height) ?? null,
    duration: optionalNumber(payload.duration) ?? null,
    smartTags: readStringArray(payload.smart_tags ?? payload.smartTags),
  };
}

function mapFolderItem(payload: Record<string, unknown>) {
  const type = requireCanvaString(payload.type, "canva folder item type");
  if (type === "folder") {
    const folder = mapCanvaFolder(requiredRecord(payload.folder, "folder", providerInputError));
    return { type, ...folder };
  }
  if (type === "design") {
    const design = requiredRecord(payload.design, "design", providerInputError);
    const thumbnail = optionalRecord(design.thumbnail) ?? {};
    return {
      type,
      id: requireCanvaString(design.id, "canva folder design id"),
      name: null,
      title: optionalString(design.title) ?? null,
      url: optionalString(design.url) ?? null,
      thumbnailUrl: optionalString(thumbnail.url) ?? null,
      thumbnailWidth: optionalNumber(thumbnail.width) ?? null,
      thumbnailHeight: optionalNumber(thumbnail.height) ?? null,
      createdAt: unixSecondsToIso(design.created_at ?? design.createdAt),
      updatedAt: unixSecondsToIso(design.updated_at ?? design.updatedAt),
    };
  }
  if (type === "image") {
    const image = requiredRecord(payload.image, "image", providerInputError);
    const thumbnail = optionalRecord(image.thumbnail) ?? {};
    const name = optionalString(image.name) ?? null;
    return {
      type,
      id: requireCanvaString(image.id, "canva folder image id"),
      name,
      title: name,
      url: null,
      thumbnailUrl: optionalString(thumbnail.url) ?? null,
      thumbnailWidth: optionalNumber(thumbnail.width) ?? null,
      thumbnailHeight: optionalNumber(thumbnail.height) ?? null,
      createdAt: unixSecondsToIso(image.created_at ?? image.createdAt),
      updatedAt: unixSecondsToIso(image.updated_at ?? image.updatedAt),
    };
  }
  throw new ProviderRequestError(502, `unsupported canva folder item type: ${type}`);
}

function mapExportFormat(format: Record<string, unknown>) {
  return compactObject({
    type: requireCanvaString(format.type, "canva export format type"),
    size: optionalString(format.size),
    pages: Array.isArray(format.pages) ? format.pages : undefined,
    export_quality: optionalString(format.exportQuality),
    width: optionalNumber(format.width),
    height: optionalNumber(format.height),
    quality: format.quality,
    lossless: typeof format.lossless === "boolean" ? format.lossless : undefined,
    transparent_background:
      typeof format.transparentBackground === "boolean" ? format.transparentBackground : undefined,
    as_single_image: typeof format.asSingleImage === "boolean" ? format.asSingleImage : undefined,
  });
}

function mapCreateDesignBody(input: Record<string, unknown>) {
  const type = optionalString(input.type) ?? "type_and_asset";
  if (type === "type_and_asset") {
    const designType = input.designType
      ? mapDesignType(requiredRecord(input.designType, "designType", providerInputError))
      : undefined;
    const assetId = optionalString(input.assetId);
    if (!designType && !assetId)
      throw new ProviderRequestError(400, "designType or assetId is required for canva.create_design");
    return compactObject({
      type,
      design_type: designType,
      asset_id: assetId,
      title: optionalString(input.title),
    });
  }
  if (type === "design") {
    return compactObject({
      type,
      design_id: requireCanvaString(input.designId, "canva designId"),
      page_numbers: Array.isArray(input.pageNumbers) ? input.pageNumbers : undefined,
    });
  }
  if (type === "brand_template") {
    return compactObject({
      type,
      brand_template_id: requireCanvaString(input.brandTemplateId, "canva brandTemplateId"),
      page_numbers: Array.isArray(input.pageNumbers) ? input.pageNumbers : undefined,
    });
  }
  throw new ProviderRequestError(400, `unsupported canva create_design type: ${type}`);
}

function mapDesignType(input: Record<string, unknown>) {
  const type = requireCanvaString(input.type, "canva design type");
  if (type === "preset") return { type, name: requireCanvaString(input.name, "canva preset design type name") };
  if (type === "custom") return { type, width: input.width, height: input.height };
  throw new ProviderRequestError(400, `unsupported canva design type: ${type}`);
}

function appendQuery(url: URL, key: string, value: string | undefined) {
  if (value) url.searchParams.set(key, value);
}

function optionalStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(",") : undefined;
}

function optionalIntegerString(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? String(value) : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireCanvaString(value: unknown, fieldName: string) {
  return requiredString(value, fieldName, providerInputError);
}

function readObjectArray(value: unknown) {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = optionalRecord(item);
        return record ? [record] : [];
      })
    : [];
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function unixSecondsToIso(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}
