import type { TransitFileWriter } from "../../../core/types.ts";
import type { FeishuJsonRequest } from "./client.ts";

import { optionalRecord } from "../../../core/cast.ts";
import { providerInputError, ProviderRequestError, providerResponseError } from "../../provider-runtime.ts";
import { withFeishuRawResponse } from "./client.ts";
import { storeFeishuTransitResponse } from "./media.ts";

interface DriveAdvancedHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

export interface FeishuDriveAdvancedRuntimeDeps {
  readonly request: FeishuJsonRequest;
  readonly accessToken: string;
  readonly fetcher: typeof fetch;
  readonly transitFiles?: TransitFileWriter;
  readonly signal?: AbortSignal;
}

interface PermissionTarget {
  readonly token: string;
  readonly type: string;
}

interface DrivePreviewCandidate {
  readonly type: string;
  readonly typeCode: string;
  readonly status: string;
  readonly statusCode: string;
  readonly downloadable: boolean;
  readonly reason?: string;
  readonly raw: Record<string, unknown>;
}

interface DriveCoverSpec {
  readonly previewType: string;
  readonly busType?: string;
  readonly platform?: string;
  readonly width?: string;
  readonly height?: string;
  readonly policy?: string;
}

const permissionTargetTypes = new Set(["doc", "sheet", "file", "wiki", "bitable", "docx", "mindnote", "slides"]);
const urlTypeMarkers: readonly (readonly [string, string])[] = [
  ["/wiki/", "wiki"],
  ["/docx/", "docx"],
  ["/sheets/", "sheet"],
  ["/base/", "bitable"],
  ["/bitable/", "bitable"],
  ["/file/", "file"],
  ["/mindnote/", "mindnote"],
  ["/slides/", "slides"],
  ["/doc/", "doc"],
];
const previewTypeMetadata: Readonly<Record<string, { readonly type: string; readonly aliases?: readonly string[] }>> = {
  "0": { type: "pdf" },
  "1": { type: "png", aliases: ["image"] },
  "2": { type: "pages" },
  "3": { type: "video" },
  "4": { type: "mp4_360p" },
  "5": { type: "mp4_480p" },
  "6": { type: "mp4_720p" },
  "7": { type: "jpg", aliases: ["image"] },
  "8": { type: "html" },
  "9": { type: "pdf_lin" },
  "10": { type: "xod" },
  "11": { type: "jpg_lin", aliases: ["image"] },
  "12": { type: "png_lin", aliases: ["image"] },
  "13": { type: "archive" },
  "14": { type: "text" },
  "15": { type: "pdf_part" },
  "16": { type: "source_file", aliases: ["source"] },
  "17": { type: "video_meta" },
  "18": { type: "wps" },
  "19": { type: "split_png", aliases: ["image"] },
  "20": { type: "media_result" },
  "21": { type: "mime" },
  "22": { type: "spilt_img_txt" },
  "23": { type: "mp4_1080p" },
  "24": { type: "image_meta" },
  "25": { type: "doc_part" },
  "26": { type: "watermark_pdf" },
  "27": { type: "file_watermark" },
};
const previewStatusMetadata: Readonly<Record<string, { readonly status: string; readonly reason?: string }>> = {
  "0": { status: "ready" },
  "1": { status: "processing", reason: "Preview is still processing." },
  "2": { status: "failed", reason: "Preview generation failed." },
  "3": { status: "failed_not_retry", reason: "Preview generation failed and will not retry." },
  "4": { status: "invalid_extension", reason: "The file extension is invalid." },
  "5": { status: "file_too_large", reason: "The file is too large for this preview." },
  "6": { status: "empty_file", reason: "The file is empty." },
  "7": { status: "not_supported", reason: "The preview type is not supported." },
  "8": { status: "invalid_preview_type", reason: "The preview type is invalid." },
  "9": { status: "needs_password", reason: "The preview requires a password." },
  "10": { status: "invalid_file", reason: "The file is invalid." },
  "11": { status: "too_many_pages", reason: "The file has too many pages." },
};
const driveCoverSpecs: Readonly<Record<string, DriveCoverSpec>> = {
  default: { previewType: "1", busType: "cover", platform: "pc" },
  icon: { previewType: "1", busType: "icon" },
  grid: { previewType: "1", busType: "grid" },
  small: { previewType: "1", busType: "small_graph", platform: "pc" },
  middle: { previewType: "1", busType: "middle" },
  big: { previewType: "1", busType: "big", platform: "mobile" },
  square: { previewType: "1", width: "360", height: "360", policy: "near" },
};

export function createFeishuDriveAdvancedActionHandlers(
  deps: FeishuDriveAdvancedRuntimeDeps,
): Record<string, DriveAdvancedHandler> {
  return {
    create_drive_shortcut: (input) => createDriveShortcut(input, deps.request),
    list_drive_versions: (input) => listDriveVersions(input, deps.request),
    get_drive_version: (input) => getDriveVersion(input, deps),
    list_drive_previews: (input) => listDrivePreviews(input, deps.request),
    download_drive_preview: (input) => downloadDrivePreview(input, deps),
    download_drive_cover: (input) => downloadDriveCover(input, deps),
    revert_drive_version: (input) => revertDriveVersion(input, deps.request),
    delete_drive_version: (input) => deleteDriveVersion(input, deps.request),
    apply_drive_permission: (input) => applyDrivePermission(input, deps.request),
    list_drive_secure_labels: (input) => listDriveSecureLabels(input, deps.request),
    update_drive_secure_label: (input) => updateDriveSecureLabel(input, deps.request),
  };
}

async function createDriveShortcut(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const fileToken = requireString(input.fileToken, "fileToken");
  const type = requireString(input.type, "type");
  const folderToken = requireString(input.folderToken, "folderToken");
  const raw = await request({
    method: "POST",
    path: "/drive/v1/files/create_shortcut",
    body: {
      parent_token: folderToken,
      refer_entity: {
        refer_token: fileToken,
        refer_type: type,
      },
    },
  });
  const shortcut = optionalRecord(raw.succ_shortcut_node);
  return {
    created: true,
    sourceFileToken: fileToken,
    sourceType: type,
    folderToken,
    shortcutToken: optionalString(shortcut?.token),
    url: optionalString(shortcut?.url),
    title: optionalString(shortcut?.name),
    raw,
  };
}

async function listDriveVersions(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const fileToken = requireString(input.fileToken, "fileToken");
  const pageSize = optionalInteger(input.pageSize) ?? 20;
  if (pageSize < 1 || pageSize > 200) {
    throw providerInputError("pageSize must be between 1 and 200");
  }
  const cursor = optionalString(input.cursor);
  if (cursor) {
    requireNumericString(cursor, "cursor");
  }
  const data = await request({
    path: `/drive/v1/files/${segment(fileToken)}/history`,
    query: {
      only_tag: true,
      page_size: pageSize,
      last_edit_time: cursor,
    },
  });
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const versions = rawItems
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item != null)
    .map(normalizeDriveVersion)
    .filter((item): item is NonNullable<typeof item> => item != null);
  const hasMore = data.has_more === true;
  const lastItem = optionalRecord(rawItems.at(-1));
  return {
    versions,
    hasMore,
    nextCursor: hasMore && lastItem ? stringValue(lastItem.edit_time) : undefined,
  };
}

async function getDriveVersion(input: Record<string, unknown>, deps: FeishuDriveAdvancedRuntimeDeps) {
  const fileToken = requireString(input.fileToken, "fileToken");
  const version = requireNumericString(requireString(input.version, "version"), "version");
  const file = await downloadDriveArtifact(
    {
      path: `/drive/v1/files/${segment(fileToken)}/download`,
      query: { version },
      fallbackName: fileToken,
      preferredName: optionalString(input.fileName),
    },
    deps,
  );
  return { fileToken, version, file };
}

async function listDrivePreviews(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const fileToken = requireString(input.fileToken, "fileToken");
  const requestedVersion = optionalString(input.version);
  if (requestedVersion) {
    requireNumericString(requestedVersion, "version");
  }
  const data = await request({
    method: "POST",
    path: `/drive/v1/medias/${segment(fileToken)}/preview_result`,
    body: requestedVersion ? { version: requestedVersion } : undefined,
  });
  return {
    fileToken,
    version: requestedVersion ?? stringValue(data.version),
    candidates: normalizePreviewCandidates(data),
  };
}

async function downloadDrivePreview(input: Record<string, unknown>, deps: FeishuDriveAdvancedRuntimeDeps) {
  const fileToken = requireString(input.fileToken, "fileToken");
  const previewType = normalizePreviewType(requireString(input.previewType, "previewType"));
  const listed = await listDrivePreviews(input, deps.request);
  const candidate = selectPreviewCandidate(listed.candidates, previewType);
  if (!candidate) {
    const available = listed.candidates.map((item) => item.type).join(", ");
    throw providerInputError(
      available
        ? `previewType ${previewType} is unavailable; available types: ${available}`
        : `previewType ${previewType} is unavailable`,
    );
  }
  if (!candidate.downloadable) {
    throw providerInputError(
      candidate.reason ?? `previewType ${candidate.type} is not ready (${candidate.status || candidate.statusCode})`,
    );
  }
  const version = optionalString(input.version) ?? listed.version;
  const query: Record<string, string> = { preview_type: candidate.typeCode };
  if (version) {
    query.version = version;
  }
  const file = await downloadDriveArtifact(
    {
      path: `/drive/v1/medias/${segment(fileToken)}/preview_download`,
      query,
      fallbackName: `${fileToken}-${candidate.type}`,
      preferredName: optionalString(input.fileName),
    },
    deps,
  );
  return {
    fileToken,
    previewType: candidate.type,
    previewTypeCode: candidate.typeCode,
    version,
    file,
  };
}

async function downloadDriveCover(input: Record<string, unknown>, deps: FeishuDriveAdvancedRuntimeDeps) {
  const fileToken = requireString(input.fileToken, "fileToken");
  const specName = requireString(input.spec, "spec");
  const spec = driveCoverSpecs[specName];
  if (!spec) {
    throw providerInputError(`unsupported Drive cover spec: ${specName}`);
  }
  const version = optionalString(input.version);
  if (version) {
    requireNumericString(version, "version");
  }
  const query: Record<string, string | undefined> = {
    preview_type: spec.previewType,
    bus_type: spec.busType,
    platform: spec.platform,
    width: spec.width,
    height: spec.height,
    policy: spec.policy,
    version,
  };
  const file = await downloadDriveArtifact(
    {
      path: `/drive/v1/medias/${segment(fileToken)}/preview_download`,
      query,
      fallbackName: `${fileToken}-${specName}.png`,
      preferredName: optionalString(input.fileName),
    },
    deps,
  );
  return { fileToken, spec: specName, file };
}

async function revertDriveVersion(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const fileToken = requireString(input.fileToken, "fileToken");
  const version = requireNumericString(requireString(input.version, "version"), "version");
  await request({
    method: "POST",
    path: `/drive/v1/files/${segment(fileToken)}/revert`,
    body: { version },
  });
  return { fileToken, version, reverted: true };
}

async function deleteDriveVersion(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const fileToken = requireString(input.fileToken, "fileToken");
  const version = requireNumericString(requireString(input.version, "version"), "version");
  await request({
    method: "POST",
    path: `/drive/v1/files/${segment(fileToken)}/version_del`,
    body: { version },
  });
  return { fileToken, version, deleted: true };
}

async function applyDrivePermission(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const target = resolvePermissionTarget(input);
  const permission = requireString(input.permission, "permission");
  const remark = optionalString(input.remark);
  const raw = await request({
    method: "POST",
    path: `/drive/v1/permissions/${segment(target.token)}/members/apply`,
    query: { type: target.type },
    body: remark ? { perm: permission, remark } : { perm: permission },
  });
  return {
    targetToken: target.token,
    targetType: target.type,
    permission,
    raw,
  };
}

async function listDriveSecureLabels(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const pageSize = optionalInteger(input.pageSize) ?? 10;
  if (pageSize < 1 || pageSize > 10) {
    throw providerInputError("pageSize must be between 1 and 10");
  }
  const data = await request({
    path: "/drive/v2/my_secure_labels",
    query: {
      page_size: pageSize,
      page_token: optionalString(input.pageToken),
      lang: optionalString(input.language),
    },
  });
  return {
    items: Array.isArray(data.items) ? data.items : [],
    hasMore: data.has_more === true,
    pageToken: optionalString(data.page_token),
    raw: data,
  };
}

async function updateDriveSecureLabel(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const target = resolvePermissionTarget(input);
  const labelId = requireNumericString(requireString(input.labelId, "labelId"), "labelId");
  const raw = await request({
    method: "PATCH",
    path: `/drive/v2/files/${segment(target.token)}/secure_label`,
    query: { type: target.type },
    body: { id: labelId },
  });
  return {
    targetToken: target.token,
    targetType: target.type,
    labelId,
    updated: true,
    raw,
  };
}

function normalizeDriveVersion(raw: Record<string, unknown>) {
  const version = optionalString(raw.version);
  if (!version) {
    return undefined;
  }
  const actionType = optionalInteger(raw.type);
  return {
    version,
    name: optionalString(raw.name),
    editedAt: stringValue(raw.edit_time),
    editedBy: optionalString(raw.edit_user_id),
    sizeBytes: optionalInteger(raw.size),
    actionType: actionType == null ? undefined : versionActionType(actionType),
    isDeleted: typeof raw.is_deleted === "boolean" ? raw.is_deleted : undefined,
    tag: optionalInteger(raw.tag),
    raw,
  };
}

function normalizePreviewCandidates(data: Record<string, unknown>): DrivePreviewCandidate[] {
  const items = Array.isArray(data.preview_results) ? data.preview_results : [];
  const result: DrivePreviewCandidate[] = [];
  for (const item of items) {
    const raw = optionalRecord(item);
    if (!raw) {
      continue;
    }
    const typeCode = stringValue(raw.preview_type) ?? stringValue(raw.type_code) ?? stringValue(raw.type) ?? "";
    const statusCode = stringValue(raw.preview_status) ?? stringValue(raw.status_code) ?? stringValue(raw.status) ?? "";
    const typeMetadata = previewTypeMetadata[typeCode];
    const statusMetadata = previewStatusMetadata[statusCode];
    const reason =
      optionalString(raw.reason) ??
      optionalString(raw.status_msg) ??
      optionalString(raw.message) ??
      statusMetadata?.reason;
    result.push({
      type: typeMetadata?.type ?? (typeCode ? `unknown_${typeCode}` : "unknown"),
      typeCode,
      status: statusMetadata?.status ?? "unknown",
      statusCode,
      downloadable: statusCode === "0",
      reason: statusCode === "0" ? undefined : reason,
      raw,
    });
  }
  return result;
}

function selectPreviewCandidate(candidates: readonly DrivePreviewCandidate[], requested: string) {
  const exact = candidates.find(
    (candidate) =>
      candidate.type === requested ||
      candidate.typeCode === requested ||
      candidate.type.replaceAll("_", "") === requested.replaceAll("_", ""),
  );
  if (exact) {
    return exact;
  }
  const aliasMatches = candidates.filter((candidate) =>
    previewTypeMetadata[candidate.typeCode]?.aliases?.includes(requested),
  );
  return aliasMatches.find((candidate) => candidate.downloadable) ?? aliasMatches[0];
}

function normalizePreviewType(value: string) {
  return value.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

async function downloadDriveArtifact(
  input: {
    readonly path: string;
    readonly query?: Readonly<Record<string, string | undefined>>;
    readonly fallbackName: string;
    readonly preferredName?: string;
  },
  deps: FeishuDriveAdvancedRuntimeDeps,
) {
  const transit = requireTransit(deps);
  return withFeishuRawResponse(
    {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      signal: deps.signal,
      path: input.path,
      query: input.query,
    },
    async (response) => {
      const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "application/octet-stream";
      const name = safeFileName(
        input.preferredName ??
          contentDispositionFileName(response.headers.get("content-disposition")) ??
          input.fallbackName,
        input.fallbackName,
      );
      try {
        return await storeFeishuTransitResponse(response, name, mimeType, transit);
      } catch (error) {
        throw providerResponseError(error instanceof Error ? error.message : "Drive artifact transit upload failed");
      }
    },
  );
}

function versionActionType(value: number) {
  if (value === 1) {
    return "upload";
  } else if (value === 2) {
    return "rename";
  } else if (value === 3) {
    return "delete_version";
  } else if (value === 4) {
    return "revert";
  } else {
    return `type_${value}`;
  }
}

function resolvePermissionTarget(input: Record<string, unknown>): PermissionTarget {
  const raw = requireString(input.token, "token");
  const explicitType = optionalString(input.type);
  let token = raw;
  let inferredType: string | undefined;
  if (raw.includes("://")) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw providerInputError("token must be a valid Feishu URL or bare token");
    }
    for (const [marker, type] of urlTypeMarkers) {
      const markerIndex = url.pathname.indexOf(marker);
      if (markerIndex < 0) {
        continue;
      }
      const tokenStart = markerIndex + marker.length;
      const tokenEnd = url.pathname.indexOf("/", tokenStart);
      token = tokenEnd < 0 ? url.pathname.slice(tokenStart) : url.pathname.slice(tokenStart, tokenEnd);
      inferredType = type;
      break;
    }
    if (!token || token === raw) {
      throw providerInputError("could not infer a Drive token from the provided URL");
    }
  }
  const type = explicitType ?? inferredType;
  if (!type) {
    throw providerInputError("type is required when token is a bare token");
  }
  if (!permissionTargetTypes.has(type)) {
    throw providerInputError(`unsupported Drive target type: ${type}`);
  }
  return { token, type };
}

function requireTransit(deps: FeishuDriveAdvancedRuntimeDeps): TransitFileWriter {
  if (!deps.transitFiles) {
    throw new ProviderRequestError(400, "local transit file storage is not configured");
  }
  return deps.transitFiles;
}

function requireNumericString(value: string, fieldName: string) {
  if (value.length > 19) {
    throw providerInputError(`${fieldName} must contain at most 19 digits`);
  }
  for (const character of value) {
    if (character < "0" || character > "9") {
      throw providerInputError(`${fieldName} must be numeric`);
    }
  }
  return value;
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw providerInputError(`${fieldName} is required`);
  }
  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function stringValue(value: unknown) {
  if (typeof value === "string" && value) {
    return value;
  }
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function contentDispositionFileName(value: string | null) {
  if (!value) {
    return undefined;
  }
  let fallback: string | undefined;
  for (const part of value.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const key = part.slice(0, separator).trim().toLowerCase();
    const rawValue = stripQuotes(part.slice(separator + 1).trim());
    if (key === "filename*") {
      const marker = rawValue.indexOf("''");
      const encoded = marker >= 0 ? rawValue.slice(marker + 2) : rawValue;
      try {
        return decodeURIComponent(encoded);
      } catch {
        return encoded;
      }
    } else if (key === "filename") {
      fallback = rawValue;
    }
  }
  return fallback;
}

function stripQuotes(value: string) {
  return value.length >= 2 && value[0] === '"' && value.at(-1) === '"' ? value.slice(1, -1) : value;
}

function safeFileName(value: string, fallback: string) {
  const name = value.replaceAll("\\", "/").split("/").at(-1)?.trim();
  return name && name !== "." && name !== ".." ? name : fallback;
}

function segment(value: string) {
  return encodeURIComponent(value);
}
