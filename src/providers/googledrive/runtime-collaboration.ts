import { googleJsonRequest, googleRequest } from "../google-runtime.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  asObject,
  asOptionalObject,
  asStringArray,
  asStringRecordOrUndefined,
  compactObject,
  compactUnknownObject,
  optionalBoolean,
  optionalString,
  parseSizeBytes,
  pickOptionalBoolean,
  pickOptionalInteger,
  pickOptionalString,
  resolveFileId,
  resolveRequiredString,
  resolveSupportsAllDrives,
} from "./runtime-shared.ts";

const driveApiBaseUrl = "https://www.googleapis.com/drive/v3";
const permissionFields = [
  "id",
  "kind",
  "role",
  "type",
  "domain",
  "deleted",
  "photoLink",
  "displayName",
  "emailAddress",
  "pendingOwner",
  "expirationTime",
  "allowFileDiscovery",
  "permissionDetails(role,inherited,inheritedFrom,permissionType)",
].join(",");
const replyFields = [
  "id",
  "kind",
  "action",
  "author(me,kind,displayName,emailAddress,permissionId,photoLink)",
  "content",
  "deleted",
  "createdTime",
  "htmlContent",
  "modifiedTime",
].join(",");
const commentFields = [
  "id",
  "kind",
  "anchor",
  "author(me,kind,displayName,emailAddress,permissionId,photoLink)",
  "content",
  "deleted",
  "resolved",
  "createdTime",
  "htmlContent",
  "modifiedTime",
  "quotedFileContent",
  `replies(${replyFields})`,
].join(",");
const revisionFields = [
  "id",
  "kind",
  "size",
  "mimeType",
  "published",
  "exportLinks",
  "keepForever",
  "md5Checksum",
  "publishAuto",
  "modifiedTime",
  "publishedLink",
  "originalFilename",
  "lastModifyingUser(me,kind,displayName,emailAddress,permissionId,photoLink)",
  "publishedOutsideDomain",
].join(",");

export async function createPermission(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const fileId = resolveFileId(input);
  const payload = await googleJsonRequest<Record<string, unknown>>(`${driveApiBaseUrl}/files/${fileId}/permissions`, {
    accessToken,
    fetcher,
    method: "POST",
    query: compactObject({
      fields: permissionFields,
      sendNotificationEmail: optionalBoolean(input.send_notification_email)?.toString(),
      emailMessage: optionalString(input.email_message),
      moveToNewOwnersRoot: optionalBoolean(input.move_to_new_owners_root)?.toString(),
      transferOwnership: optionalBoolean(input.transfer_ownership)?.toString(),
      supportsAllDrives: String(resolveSupportsAllDrives(input)),
      useDomainAdminAccess: optionalBoolean(input.useDomainAdminAccess)?.toString(),
    }),
    body: compactUnknownObject({
      type: optionalString(input.type),
      role: optionalString(input.role),
      emailAddress: pickOptionalString(input, "emailAddress"),
      domain: optionalString(input.domain),
      allowFileDiscovery: optionalBoolean(input.allow_file_discovery),
      expirationTime: optionalString(input.expiration_time),
    }),
  });

  return normalizePermission(payload);
}

export async function getPermission(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(permissionUrl(input), {
    accessToken,
    fetcher,
    query: compactObject({
      fields: optionalString(input.fields) ?? permissionFields,
      supportsAllDrives: String(resolveSupportsAllDrives(input)),
      useDomainAdminAccess: pickOptionalBoolean(input, "useDomainAdminAccess")?.toString(),
    }),
  });

  return normalizePermission(payload);
}

export async function listPermissions(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(
    `${driveApiBaseUrl}/files/${resolveFileId(input)}/permissions`,
    {
      accessToken,
      fetcher,
      query: compactObject({
        fields: optionalString(input.fields) ?? `nextPageToken,permissions(${permissionFields})`,
        pageSize: pickOptionalInteger(input, "pageSize")?.toString(),
        pageToken: pickOptionalString(input, "pageToken"),
        supportsAllDrives: String(resolveSupportsAllDrives(input)),
        useDomainAdminAccess: pickOptionalBoolean(input, "useDomainAdminAccess")?.toString(),
        includePermissionsForView: pickOptionalString(input, "includePermissionsForView"),
      }),
    },
  );

  return {
    permissions: Array.isArray(payload.permissions)
      ? payload.permissions.map((permission) => normalizePermission(asObject(permission)))
      : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

export async function updatePermission(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(permissionUrl(input), {
    accessToken,
    fetcher,
    method: "PATCH",
    query: compactObject({
      fields: permissionFields,
      removeExpiration: optionalBoolean(input.removeExpiration)?.toString(),
      transferOwnership: optionalBoolean(input.transferOwnership)?.toString(),
      supportsAllDrives: String(resolveSupportsAllDrives(input)),
      useDomainAdminAccess: optionalBoolean(input.useDomainAdminAccess)?.toString(),
      enforceExpansiveAccess: optionalBoolean(input.enforceExpansiveAccess)?.toString(),
    }),
    body: buildUpdatePermissionBody(input),
  });

  return normalizePermission(payload);
}

export async function deletePermission(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const fileId = resolveFileId(input);
  const permissionId = resolvePermissionId(input);
  await googleRequest(`${driveApiBaseUrl}/files/${fileId}/permissions/${permissionId}`, {
    accessToken,
    fetcher,
    method: "DELETE",
    query: compactObject({
      supportsAllDrives: String(resolveSupportsAllDrives(input)),
      useDomainAdminAccess: pickOptionalBoolean(input, "useDomainAdminAccess")?.toString(),
    }),
  });

  return {
    fileId,
    permissionId,
    deleted: true,
  };
}

export async function createComment(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(commentsUrl(input), {
    accessToken,
    fetcher,
    method: "POST",
    query: {
      fields: commentFields,
    },
    body: buildCommentBody(input),
  });

  return normalizeComment(payload);
}

export async function getComment(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(commentUrl(input), {
    accessToken,
    fetcher,
    query: compactObject({
      fields: commentFields,
      includeDeleted: pickOptionalBoolean(input, "includeDeleted")?.toString(),
    }),
  });

  return normalizeComment(payload);
}

export async function listComments(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(commentsUrl(input), {
    accessToken,
    fetcher,
    query: compactObject({
      fields: optionalString(input.fields) ?? `nextPageToken,comments(${commentFields})`,
      pageSize: pickOptionalInteger(input, "pageSize")?.toString(),
      pageToken: pickOptionalString(input, "pageToken"),
      includeDeleted: pickOptionalBoolean(input, "includeDeleted")?.toString(),
      startModifiedTime: pickOptionalString(input, "startModifiedTime"),
    }),
  });

  return {
    comments: Array.isArray(payload.comments)
      ? payload.comments.map((comment) => normalizeComment(asObject(comment)))
      : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

export async function updateComment(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(commentUrl(input), {
    accessToken,
    fetcher,
    method: "PATCH",
    query: {
      fields: optionalString(input.fields) ?? commentFields,
    },
    body: buildCommentBody(input),
  });

  return normalizeComment(payload);
}

export async function deleteComment(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const fileId = resolveFileId(input);
  const commentId = resolveCommentId(input);
  await googleRequest(`${driveApiBaseUrl}/files/${fileId}/comments/${commentId}`, {
    accessToken,
    fetcher,
    method: "DELETE",
  });

  return {
    fileId,
    commentId,
    deleted: true,
  };
}

export async function createReply(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(repliesUrl(input), {
    accessToken,
    fetcher,
    method: "POST",
    query: {
      fields: optionalString(input.fields) ?? replyFields,
    },
    body: buildReplyBody(input),
  });

  return normalizeReply(payload);
}

export async function getReply(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(replyUrl(input), {
    accessToken,
    fetcher,
    query: compactObject({
      fields: replyFields,
      includeDeleted: pickOptionalBoolean(input, "includeDeleted")?.toString(),
    }),
  });

  return normalizeReply(payload);
}

export async function listReplies(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(repliesUrl(input), {
    accessToken,
    fetcher,
    query: compactObject({
      fields: optionalString(input.fields) ?? `nextPageToken,replies(${replyFields})`,
      pageSize: pickOptionalInteger(input, "pageSize")?.toString(),
      pageToken: pickOptionalString(input, "pageToken"),
      includeDeleted: pickOptionalBoolean(input, "includeDeleted")?.toString(),
    }),
  });

  return {
    replies: Array.isArray(payload.replies) ? payload.replies.map((reply) => normalizeReply(asObject(reply))) : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

export async function updateReply(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(replyUrl(input), {
    accessToken,
    fetcher,
    method: "PATCH",
    query: {
      fields: optionalString(input.fields) ?? replyFields,
    },
    body: buildReplyBody(input),
  });

  return normalizeReply(payload);
}

export async function deleteReply(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const fileId = resolveFileId(input);
  const commentId = resolveCommentId(input);
  const replyId = resolveReplyId(input);
  await googleRequest(`${driveApiBaseUrl}/files/${fileId}/comments/${commentId}/replies/${replyId}`, {
    accessToken,
    fetcher,
    method: "DELETE",
  });

  return {
    fileId,
    commentId,
    replyId,
    deleted: true,
  };
}

export async function listRevisions(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(
    `${driveApiBaseUrl}/files/${resolveFileId(input)}/revisions`,
    {
      accessToken,
      fetcher,
      query: compactObject({
        fields: `nextPageToken,revisions(${revisionFields})`,
        pageSize: pickOptionalInteger(input, "pageSize")?.toString(),
        pageToken: pickOptionalString(input, "pageToken"),
        supportsAllDrives: String(resolveSupportsAllDrives(input)),
      }),
    },
  );

  return {
    revisions: Array.isArray(payload.revisions)
      ? payload.revisions.map((revision) => normalizeRevision(asObject(revision)))
      : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

export async function getRevision(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(revisionUrl(input), {
    accessToken,
    fetcher,
    query: compactObject({
      fields: revisionFields,
      acknowledgeAbuse: pickOptionalBoolean(input, "acknowledgeAbuse")?.toString(),
    }),
  });

  return normalizeRevision(payload);
}

export async function updateFileRevisionMetadata(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(revisionUrl(input), {
    accessToken,
    fetcher,
    method: "PATCH",
    query: {
      fields: revisionFields,
    },
    body: buildRevisionMetadataBody(input),
  });

  return normalizeRevision(payload);
}

export async function deleteRevision(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const fileId = resolveFileId(input);
  const revisionId = resolveRevisionId(input);
  await googleRequest(`${driveApiBaseUrl}/files/${fileId}/revisions/${revisionId}`, {
    accessToken,
    fetcher,
    method: "DELETE",
  });

  return {
    fileId,
    revisionId,
    deleted: true,
  };
}

export async function listFileLabels(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(
    `${driveApiBaseUrl}/files/${resolveFileId(input)}/listLabels`,
    {
      accessToken,
      fetcher,
      query: compactObject({
        pageToken: pickOptionalString(input, "pageToken"),
        maxResults: pickOptionalInteger(input, "maxResults")?.toString(),
      }),
    },
  );

  return {
    labels: Array.isArray(payload.labels) ? payload.labels.map((label) => normalizeLabel(asObject(label))) : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

export async function modifyFileLabels(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const payload = await googleJsonRequest<Record<string, unknown>>(
    `${driveApiBaseUrl}/files/${resolveFileId(input)}/modifyLabels`,
    {
      accessToken,
      fetcher,
      method: "POST",
      body: {
        labelModifications: buildLabelModifications(input),
      },
    },
  );

  return {
    modifiedLabels: Array.isArray(payload.modifiedLabels)
      ? payload.modifiedLabels.map((label) => normalizeLabel(asObject(label)))
      : [],
  };
}

export async function getAbout(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  return googleJsonRequest<Record<string, unknown>>(`${driveApiBaseUrl}/about`, {
    accessToken,
    fetcher,
    query: {
      fields: optionalString(input.fields) ?? "*",
    },
  });
}

export async function getApp(
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  return googleJsonRequest<Record<string, unknown>>(
    `${driveApiBaseUrl}/apps/${resolveRequiredString(input, ["appId"], "appId is required")}`,
    {
      accessToken,
      fetcher,
    },
  );
}

function permissionUrl(input: Record<string, unknown>) {
  return `${driveApiBaseUrl}/files/${resolveFileId(input)}/permissions/${resolvePermissionId(input)}`;
}

function commentsUrl(input: Record<string, unknown>) {
  return `${driveApiBaseUrl}/files/${resolveFileId(input)}/comments`;
}

function commentUrl(input: Record<string, unknown>) {
  return `${commentsUrl(input)}/${resolveCommentId(input)}`;
}

function repliesUrl(input: Record<string, unknown>) {
  return `${commentUrl(input)}/replies`;
}

function replyUrl(input: Record<string, unknown>) {
  return `${repliesUrl(input)}/${resolveReplyId(input)}`;
}

function revisionUrl(input: Record<string, unknown>) {
  return `${driveApiBaseUrl}/files/${resolveFileId(input)}/revisions/${resolveRevisionId(input)}`;
}

function buildUpdatePermissionBody(input: Record<string, unknown>) {
  const permission = asOptionalObject(input.permission);
  return compactUnknownObject({
    role: permission ? optionalString(permission.role) : undefined,
    expirationTime: permission ? optionalString(permission.expirationTime) : undefined,
  });
}

function buildCommentBody(input: Record<string, unknown>) {
  const quotedFileContent = buildQuotedFileContent(input);
  return compactUnknownObject({
    content: optionalString(input.content),
    anchor: typeof input.anchor === "string" ? input.anchor : undefined,
    ...(quotedFileContent ? { quotedFileContent } : {}),
  });
}

function buildQuotedFileContent(input: Record<string, unknown>) {
  const value = typeof input.quoted_file_content_value === "string" ? input.quoted_file_content_value : undefined;
  const mimeType = optionalString(input.quoted_file_content_mime_type);
  if (!value && !mimeType) {
    return undefined;
  }
  return compactUnknownObject({
    value,
    mimeType,
  });
}

function buildReplyBody(input: Record<string, unknown>) {
  return compactUnknownObject({
    action: optionalString(input.action),
    content: optionalString(input.content),
  });
}

function buildRevisionMetadataBody(input: Record<string, unknown>) {
  return compactUnknownObject({
    published: pickOptionalBoolean(input, "published"),
    publishAuto: pickOptionalBoolean(input, "publishAuto"),
    keepForever: pickOptionalBoolean(input, "keepForever"),
    publishedOutsideDomain: pickOptionalBoolean(input, "publishedOutsideDomain"),
  });
}

function buildLabelModifications(input: Record<string, unknown>) {
  if (!Array.isArray(input.labelModifications)) {
    throw new ProviderRequestError(400, "labelModifications is required");
  }

  return input.labelModifications.map((item) => {
    const value = asObject(item);
    return compactUnknownObject({
      labelId: resolveRequiredString(value, ["labelId"], "labelId is required"),
      removeLabel: optionalBoolean(value.removeLabel),
      fieldModifications: Array.isArray(value.fieldModifications)
        ? value.fieldModifications.map((fieldModification) =>
            normalizeLabelFieldModification(asObject(fieldModification)),
          )
        : undefined,
    });
  });
}

function normalizeLabelFieldModification(value: Record<string, unknown>) {
  return compactUnknownObject({
    fieldId: resolveRequiredString(value, ["fieldId"], "fieldId is required"),
    unsetValues: optionalBoolean(value.unsetValues),
    setDateValues: Array.isArray(value.setDateValues) ? asStringArray(value.setDateValues) : undefined,
    setTextValues: Array.isArray(value.setTextValues) ? asStringArray(value.setTextValues) : undefined,
    setUserValues: Array.isArray(value.setUserValues) ? asStringArray(value.setUserValues) : undefined,
    setIntegerValues: Array.isArray(value.setIntegerValues) ? asStringArray(value.setIntegerValues) : undefined,
    setSelectionValues: Array.isArray(value.setSelectionValues) ? asStringArray(value.setSelectionValues) : undefined,
  });
}

function normalizePermission(payload: Record<string, unknown>) {
  return {
    id: String(payload.id ?? ""),
    kind: optionalString(payload.kind) ?? null,
    role: optionalString(payload.role) ?? null,
    type: optionalString(payload.type) ?? null,
    domain: optionalString(payload.domain) ?? null,
    deleted: optionalBoolean(payload.deleted),
    photoLink: optionalString(payload.photoLink) ?? null,
    displayName: optionalString(payload.displayName) ?? null,
    emailAddress: optionalString(payload.emailAddress) ?? null,
    pendingOwner: optionalBoolean(payload.pendingOwner),
    expirationTime: optionalString(payload.expirationTime) ?? null,
    allowFileDiscovery: optionalBoolean(payload.allowFileDiscovery),
    ...(Array.isArray(payload.permissionDetails)
      ? {
          permissionDetails: payload.permissionDetails.map((detail) => normalizePermissionDetail(asObject(detail))),
        }
      : {}),
  };
}

function normalizePermissionDetail(payload: Record<string, unknown>) {
  return {
    role: optionalString(payload.role) ?? null,
    inherited: optionalBoolean(payload.inherited),
    inheritedFrom: optionalString(payload.inheritedFrom) ?? null,
    permissionType: optionalString(payload.permissionType) ?? null,
  };
}

function normalizeComment(payload: Record<string, unknown>) {
  return compactUnknownObject({
    id: String(payload.id ?? ""),
    kind: optionalString(payload.kind) ?? null,
    anchor: optionalString(payload.anchor) ?? null,
    author: asOptionalObject(payload.author) ? normalizeDriveUser(asOptionalObject(payload.author)!) : undefined,
    content: optionalString(payload.content) ?? null,
    deleted: optionalBoolean(payload.deleted),
    resolved: optionalBoolean(payload.resolved),
    createdTime: optionalString(payload.createdTime) ?? null,
    htmlContent: optionalString(payload.htmlContent) ?? null,
    modifiedTime: optionalString(payload.modifiedTime) ?? null,
    quotedFileContent: asOptionalObject(payload.quotedFileContent),
    replies: Array.isArray(payload.replies)
      ? payload.replies.map((reply) => normalizeReply(asObject(reply)))
      : undefined,
  });
}

function normalizeReply(payload: Record<string, unknown>) {
  return compactUnknownObject({
    id: String(payload.id ?? ""),
    kind: optionalString(payload.kind) ?? null,
    action: optionalString(payload.action),
    author: asOptionalObject(payload.author) ? normalizeDriveUser(asOptionalObject(payload.author)!) : undefined,
    content: optionalString(payload.content) ?? null,
    deleted: optionalBoolean(payload.deleted),
    createdTime: optionalString(payload.createdTime) ?? null,
    htmlContent: optionalString(payload.htmlContent) ?? null,
    modifiedTime: optionalString(payload.modifiedTime) ?? null,
  });
}

function normalizeRevision(payload: Record<string, unknown>) {
  return compactUnknownObject({
    id: String(payload.id ?? ""),
    kind: optionalString(payload.kind) ?? null,
    mimeType: optionalString(payload.mimeType) ?? null,
    modifiedTime: optionalString(payload.modifiedTime) ?? null,
    sizeBytes: parseSizeBytes(payload.size),
    published: optionalBoolean(payload.published),
    keepForever: optionalBoolean(payload.keepForever),
    publishAuto: optionalBoolean(payload.publishAuto),
    publishedOutsideDomain: optionalBoolean(payload.publishedOutsideDomain),
    publishedLink: optionalString(payload.publishedLink) ?? null,
    originalFilename: optionalString(payload.originalFilename) ?? null,
    md5Checksum: optionalString(payload.md5Checksum) ?? null,
    lastModifyingUser: asOptionalObject(payload.lastModifyingUser)
      ? normalizeDriveUser(asOptionalObject(payload.lastModifyingUser)!)
      : undefined,
    exportLinks: asStringRecordOrUndefined(payload.exportLinks),
  });
}

function normalizeLabel(payload: Record<string, unknown>) {
  return {
    id: String(payload.id ?? ""),
    kind: optionalString(payload.kind) ?? null,
    revisionId: String(payload.revisionId ?? ""),
    fields: normalizeLabelFields(payload.fields),
  };
}

function normalizeLabelFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      normalizeLabelFieldValue(asObject(child)),
    ]),
  );
}

function normalizeLabelFieldValue(payload: Record<string, unknown>) {
  return compactUnknownObject({
    valueType: String(payload.valueType ?? ""),
    text: Array.isArray(payload.text) ? asStringArray(payload.text) : undefined,
    integer: Array.isArray(payload.integer) ? payload.integer.map((item) => Number(item)) : undefined,
    selection: Array.isArray(payload.selection) ? asStringArray(payload.selection) : undefined,
    dateString: Array.isArray(payload.dateString) ? asStringArray(payload.dateString) : undefined,
    user: Array.isArray(payload.user) ? payload.user.map((item) => normalizeDriveUser(asObject(item))) : undefined,
  });
}

function normalizeDriveUser(payload: Record<string, unknown>) {
  return compactUnknownObject({
    me: optionalBoolean(payload.me),
    kind: optionalString(payload.kind) ?? null,
    displayName: optionalString(payload.displayName) ?? null,
    emailAddress: optionalString(payload.emailAddress) ?? null,
    permissionId: optionalString(payload.permissionId) ?? null,
    photoLink: optionalString(payload.photoLink) ?? null,
  });
}

function resolvePermissionId(input: Record<string, unknown>) {
  return resolveRequiredString(input, ["permissionId"], "permissionId is required");
}

function resolveCommentId(input: Record<string, unknown>) {
  return resolveRequiredString(input, ["commentId"], "commentId is required");
}

function resolveReplyId(input: Record<string, unknown>) {
  return resolveRequiredString(input, ["replyId"], "replyId is required");
}

function resolveRevisionId(input: Record<string, unknown>) {
  return resolveRequiredString(input, ["revisionId"], "revisionId is required");
}
