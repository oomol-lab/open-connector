import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { randomUUID } from "node:crypto";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { defineOAuthProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";
import {
  createComment,
  createPermission,
  createReply,
  deleteComment,
  deletePermission,
  deleteReply,
  deleteRevision,
  getAbout,
  getApp,
  getComment,
  getPermission,
  getReply,
  getRevision,
  listComments,
  listFileLabels,
  listPermissions,
  listReplies,
  listRevisions,
  modifyFileLabels,
  updateComment,
  updateFileRevisionMetadata,
  updatePermission,
  updateReply,
} from "./runtime-collaboration.ts";
import {
  asObject,
  asOptionalObject,
  asOptionalInteger,
  asStringArray,
  asStringRecord,
  compactObject,
  compactUnknownObject,
  googleJsonRequest,
  googleRequest,
  optionalBoolean,
  optionalNestedString,
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
const driveUploadApiBaseUrl = "https://www.googleapis.com/upload/drive/v3";
const driveFileFields = [
  "id",
  "name",
  "mimeType",
  "webViewLink",
  "createdTime",
  "modifiedTime",
  "size",
  "driveId",
  "parents",
  "owners(displayName,emailAddress,permissionId,photoLink)",
  "shared",
  "starred",
  "trashed",
].join(",");
const driveFields = [
  "id",
  "kind",
  "name",
  "hidden",
  "colorRgb",
  "createdTime",
  "orgUnitId",
  "themeId",
  "backgroundImageLink",
  "capabilities",
  "restrictions",
].join(",");
const changeListFields = `nextPageToken,newStartPageToken,changes(fileId,kind,changeType,removed,time,driveId,file(${driveFileFields}))`;
type ActionContext = OAuthProviderContext;

type ActionHandler = (input: Record<string, unknown>, context: ActionContext) => Promise<unknown>;

const googledriveActionHandlers: Record<string, ActionHandler> = {
  "files.list"(input, { accessToken, fetcher }) {
    return listFiles(input, accessToken, fetcher);
  },
  "files.get"(input, { accessToken, fetcher }) {
    return getFileMetadata(input, accessToken, fetcher);
  },
  "files.export"(input, context) {
    return exportFile(input, context);
  },
  "files.create"(input, { accessToken, fetcher }) {
    return createFile(input, accessToken, fetcher);
  },
  "files.emptyTrash"(input, { accessToken, fetcher }) {
    return emptyTrash(input, accessToken, fetcher);
  },
  "files.generateIds"(input, { accessToken, fetcher }) {
    return generateIds(input, accessToken, fetcher);
  },
  "files.update"(input, { accessToken, fetcher }) {
    return updateFile(input, accessToken, fetcher);
  },
  "permissions.create"(input, { accessToken, fetcher }) {
    return createPermission(input, accessToken, fetcher);
  },
  "permissions.get"(input, { accessToken, fetcher }) {
    return getPermission(input, accessToken, fetcher);
  },
  "permissions.list"(input, { accessToken, fetcher }) {
    return listPermissions(input, accessToken, fetcher);
  },
  "permissions.update"(input, { accessToken, fetcher }) {
    return updatePermission(input, accessToken, fetcher);
  },
  "permissions.delete"(input, { accessToken, fetcher }) {
    return deletePermission(input, accessToken, fetcher);
  },
  "comments.create"(input, { accessToken, fetcher }) {
    return createComment(input, accessToken, fetcher);
  },
  "comments.get"(input, { accessToken, fetcher }) {
    return getComment(input, accessToken, fetcher);
  },
  "comments.list"(input, { accessToken, fetcher }) {
    return listComments(input, accessToken, fetcher);
  },
  "comments.update"(input, { accessToken, fetcher }) {
    return updateComment(input, accessToken, fetcher);
  },
  "comments.delete"(input, { accessToken, fetcher }) {
    return deleteComment(input, accessToken, fetcher);
  },
  "replies.create"(input, { accessToken, fetcher }) {
    return createReply(input, accessToken, fetcher);
  },
  "replies.get"(input, { accessToken, fetcher }) {
    return getReply(input, accessToken, fetcher);
  },
  "replies.list"(input, { accessToken, fetcher }) {
    return listReplies(input, accessToken, fetcher);
  },
  "replies.update"(input, { accessToken, fetcher }) {
    return updateReply(input, accessToken, fetcher);
  },
  "replies.delete"(input, { accessToken, fetcher }) {
    return deleteReply(input, accessToken, fetcher);
  },
  "revisions.list"(input, { accessToken, fetcher }) {
    return listRevisions(input, accessToken, fetcher);
  },
  "revisions.get"(input, { accessToken, fetcher }) {
    return getRevision(input, accessToken, fetcher);
  },
  "revisions.delete"(input, { accessToken, fetcher }) {
    return deleteRevision(input, accessToken, fetcher);
  },
  "revisions.update"(input, { accessToken, fetcher }) {
    return updateFileRevisionMetadata(input, accessToken, fetcher);
  },
  "files.listLabels"(input, { accessToken, fetcher }) {
    return listFileLabels(input, accessToken, fetcher);
  },
  "files.modifyLabels"(input, { accessToken, fetcher }) {
    return modifyFileLabels(input, accessToken, fetcher);
  },
  "about.get"(input, { accessToken, fetcher }) {
    return getAbout(input, accessToken, fetcher);
  },
  "apps.get"(input, { accessToken, fetcher }) {
    return getApp(input, accessToken, fetcher);
  },
  "drives.create"(input, { accessToken, fetcher }) {
    return createDrive(input, accessToken, fetcher);
  },
  "drives.get"(input, { accessToken, fetcher }) {
    return getDrive(input, accessToken, fetcher);
  },
  "drives.list"(input, { accessToken, fetcher }) {
    return listDrives(input, accessToken, fetcher);
  },
  "drives.update"(input, { accessToken, fetcher }) {
    return updateDrive(input, accessToken, fetcher);
  },
  "drives.delete"(input, { accessToken, fetcher }) {
    return deleteDrive(input, accessToken, fetcher);
  },
  "drives.hide"(input, { accessToken, fetcher }) {
    return hideDrive(input, accessToken, fetcher);
  },
  "drives.unhide"(input, { accessToken, fetcher }) {
    return unhideDrive(input, accessToken, fetcher);
  },
  "changes.getStartPageToken"(input, { accessToken, fetcher }) {
    return getChangesStartPageToken(input, accessToken, fetcher);
  },
  "changes.list"(input, { accessToken, fetcher }) {
    return listChanges(input, accessToken, fetcher);
  },
  "accessproposals.list"(input, { accessToken, fetcher }) {
    return listAccessProposals(input, accessToken, fetcher);
  },
  "approvals.list"(input, { accessToken, fetcher }) {
    return listApprovals(input, accessToken, fetcher);
  },
  "files.copy"(input, { accessToken, fetcher }) {
    return copyFile(input, accessToken, fetcher);
  },
  "files.delete"(input, { accessToken, fetcher }) {
    return deleteFile(input, accessToken, fetcher);
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors("googledrive", googledriveActionHandlers);

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const profile = await googleJsonRequest<{
      emailAddress?: string;
      user?: { emailAddress?: string; displayName?: string };
    }>(`${driveApiBaseUrl}/about`, {
      accessToken: input.accessToken,
      fetcher,
      signal,
      query: { fields: "user,emailAddress" },
    });
    const emailAddress = profile.user?.emailAddress ?? profile.emailAddress;
    const displayName = profile.user?.displayName ?? emailAddress;
    return {
      profile: {
        accountId: emailAddress ?? "googledrive:oauth2",
        displayName: displayName ?? "Google Drive User",
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};

async function createDrive(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await googleJsonRequest<Record<string, unknown>>(`${driveApiBaseUrl}/drives`, {
    accessToken,
    fetcher,
    method: "POST",
    query: {
      requestId: pickOptionalString(input, "requestId") ?? randomUUID(),
      fields: driveFields,
    },
    body: buildDriveBody(input, { requireName: true }),
  });

  return normalizeDrive(payload);
}

async function getDrive(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await googleJsonRequest<Record<string, unknown>>(
    `${driveApiBaseUrl}/drives/${resolveDriveId(input)}`,
    {
      accessToken,
      fetcher,
      query: compactObject({
        fields: driveFields,
        useDomainAdminAccess: pickOptionalBoolean(input, "useDomainAdminAccess")?.toString(),
      }),
    },
  );

  return normalizeDrive(payload);
}

async function listDrives(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await googleJsonRequest<Record<string, unknown>>(`${driveApiBaseUrl}/drives`, {
    accessToken,
    fetcher,
    query: compactObject({
      q: pickOptionalString(input, "q"),
      pageSize: pickOptionalInteger(input, "pageSize")?.toString(),
      pageToken: pickOptionalString(input, "pageToken"),
      useDomainAdminAccess: pickOptionalBoolean(input, "useDomainAdminAccess")?.toString(),
      fields: `nextPageToken,drives(${driveFields})`,
    }),
  });
  const rawDrives = payload.drives;

  return {
    drives: Array.isArray(rawDrives) ? rawDrives.map((drive) => normalizeDrive(asObject(drive))) : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function updateDrive(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await googleJsonRequest<Record<string, unknown>>(
    `${driveApiBaseUrl}/drives/${resolveDriveId(input)}`,
    {
      accessToken,
      fetcher,
      method: "PATCH",
      query: compactObject({
        fields: driveFields,
        useDomainAdminAccess: pickOptionalBoolean(input, "useDomainAdminAccess")?.toString(),
      }),
      body: buildDriveBody(input),
    },
  );

  return normalizeDrive(payload);
}

async function deleteDrive(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const driveId = resolveDriveId(input);
  await googleRequest(`${driveApiBaseUrl}/drives/${driveId}`, {
    accessToken,
    fetcher,
    method: "DELETE",
    query: compactObject({
      useDomainAdminAccess: pickOptionalBoolean(input, "useDomainAdminAccess")?.toString(),
      allowItemDeletion: pickOptionalBoolean(input, "allowItemDeletion")?.toString(),
    }),
  });

  return {
    driveId,
    deleted: true,
  };
}

async function hideDrive(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  return changeDriveVisibility(input, "hide", accessToken, fetcher);
}

async function unhideDrive(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  return changeDriveVisibility(input, "unhide", accessToken, fetcher);
}

async function changeDriveVisibility(
  input: Record<string, unknown>,
  action: "hide" | "unhide",
  accessToken: string,
  fetcher: typeof fetch,
) {
  const payload = await googleJsonRequest<Record<string, unknown>>(
    `${driveApiBaseUrl}/drives/${resolveDriveId(input)}/${action}`,
    {
      accessToken,
      fetcher,
      method: "POST",
      query: compactObject({
        fields: driveFields,
        useDomainAdminAccess: pickOptionalBoolean(input, "useDomainAdminAccess")?.toString(),
      }),
    },
  );

  return normalizeDrive(payload);
}

async function getChangesStartPageToken(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const driveId = resolveOptionalDriveId(input);
  const payload = await googleJsonRequest<Record<string, unknown>>(`${driveApiBaseUrl}/changes/startPageToken`, {
    accessToken,
    fetcher,
    query: compactObject({
      driveId,
      supportsAllDrives: String(resolveChangesSupportsAllDrives(input, driveId)),
    }),
  });

  return {
    startPageToken: resolveRequiredString(payload, ["startPageToken"], "startPageToken is required"),
    kind: optionalString(payload.kind) ?? null,
  };
}

async function listChanges(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const driveId = resolveOptionalDriveId(input);
  const pageToken =
    pickOptionalString(input, "pageToken") ??
    (await getChangesStartPageToken(input, accessToken, fetcher)).startPageToken;
  const includeCorpusRemovals = pickOptionalBoolean(input, "includeCorpusRemovals");
  const payload = await googleJsonRequest<Record<string, unknown>>(`${driveApiBaseUrl}/changes`, {
    accessToken,
    fetcher,
    query: compactObject({
      pageToken,
      pageSize: pickOptionalInteger(input, "pageSize")?.toString(),
      driveId,
      spaces: optionalString(input.spaces),
      includeLabels: pickOptionalString(input, "includeLabels"),
      includeRemoved: (includeCorpusRemovals ? true : pickOptionalBoolean(input, "includeRemoved"))?.toString(),
      restrictToMyDrive: pickOptionalBoolean(input, "restrictToMyDrive")?.toString(),
      supportsAllDrives: String(resolveChangesSupportsAllDrives(input, driveId)),
      includeCorpusRemovals: includeCorpusRemovals?.toString(),
      includeItemsFromAllDrives: resolveChangesIncludeItemsFromAllDrives(input, driveId)?.toString(),
      includePermissionsForView: pickOptionalString(input, "includePermissionsForView"),
      fields: changeListFields,
    }),
  });

  return {
    changes: Array.isArray(payload.changes) ? payload.changes.map((change) => normalizeChange(asObject(change))) : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
    newStartPageToken: optionalString(payload.newStartPageToken) ?? null,
  };
}

async function listAccessProposals(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await googleJsonRequest<Record<string, unknown>>(
    `${driveApiBaseUrl}/files/${resolveFileId(input)}/accessproposals`,
    {
      accessToken,
      fetcher,
      query: compactObject({
        pageSize: pickOptionalInteger(input, "pageSize")?.toString(),
        pageToken: pickOptionalString(input, "pageToken"),
      }),
    },
  );

  return {
    accessProposals: Array.isArray(payload.accessProposals)
      ? payload.accessProposals.map((proposal) => normalizeAccessProposal(asObject(proposal)))
      : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function listApprovals(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await googleJsonRequest<Record<string, unknown>>(
    `${driveApiBaseUrl}/files/${resolveFileId(input)}/approvals`,
    {
      accessToken,
      fetcher,
      query: compactObject({
        pageSize: pickOptionalInteger(input, "pageSize")?.toString(),
        pageToken: pickOptionalString(input, "pageToken"),
      }),
    },
  );

  return {
    approvals: Array.isArray(payload.approvals)
      ? payload.approvals.map((approval) => normalizeApproval(asObject(approval)))
      : [],
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function listFiles(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await googleJsonRequest<Record<string, unknown>>(`${driveApiBaseUrl}/files`, {
    accessToken,
    fetcher,
    query: compactObject({
      corpora: optionalString(input.corpora),
      corpus: optionalString(input.corpus),
      driveId: optionalString(input.driveId),
      includeItemsFromAllDrives: optionalBoolean(input.includeItemsFromAllDrives)?.toString(),
      includeLabels: optionalString(input.includeLabels),
      includePermissionsForView: optionalString(input.includePermissionsForView),
      orderBy: optionalString(input.orderBy),
      pageToken: optionalString(input.pageToken),
      pageSize: asOptionalInteger(input.pageSize, "pageSize")?.toString(),
      q: optionalString(input.q),
      spaces: optionalString(input.spaces),
      supportsAllDrives: optionalBoolean(input.supportsAllDrives)?.toString(),
      teamDriveId: optionalString(input.teamDriveId),
      fields: `nextPageToken,files(${driveFileFields})`,
    }),
  });

  const files = Array.isArray(payload.files) ? payload.files : [];
  return {
    files: files.map((file) => normalizeDriveFile(asObject(file))),
    nextPageToken: optionalString(payload.nextPageToken) ?? null,
  };
}

async function getFileMetadata(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const includeSharedDrives = resolveSupportsAllDrives(input);
  const payload = await fetchDriveFile(resolveFileId(input), accessToken, fetcher, includeSharedDrives);
  return normalizeDriveFile(payload);
}

async function exportFile(input: Record<string, unknown>, context: ActionContext) {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "files.export requires local transit file storage.");
  }

  const fileId = resolveFileId(input);
  const requestedMimeType = resolveRequiredString(input, ["mimeType"], "mimeType is required");
  const response = await googleRequest(`${driveApiBaseUrl}/files/${fileId}/export`, {
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
    query: compactObject({
      mimeType: requestedMimeType,
      supportsAllDrives: String(resolveSupportsAllDrives(input)),
    }),
    timeoutMs: 300_000,
  });
  const mimeType = response.headers.get("content-type") ?? requestedMimeType;
  const extension = extensionForExportMimeType(mimeType);
  const name = `${fileId}${extension}`;
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: "Google Drive export",
    createError: (message) => new ProviderRequestError(413, message),
  });
  const upload = await context.transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: mimeType }));

  return {
    fileId,
    name,
    mimeType,
    sizeBytes: upload.sizeBytes,
    file: upload,
  };
}

async function createFile(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const metadata = buildDriveMetadata(input);
  const content = resolveUploadContent(input);
  if (!content) {
    return createDriveFile(metadata, accessToken, fetcher);
  }
  return uploadDriveFile(undefined, metadata, content, "POST", input, accessToken, fetcher);
}

async function copyFile(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const fileId = resolveFileId(input);
  const payload = await googleJsonRequest<Record<string, unknown>>(`${driveApiBaseUrl}/files/${fileId}/copy`, {
    accessToken,
    fetcher,
    method: "POST",
    query: {
      fields: driveFileFields,
      supportsAllDrives: String(resolveSupportsAllDrives(input)),
    },
    body: compactUnknownObject({
      ...buildDriveMetadata(input),
      name: optionalString(input.name),
    }),
  });

  return normalizeDriveFile(payload);
}

async function updateFile(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const fileId = resolveFileId(input);
  const metadata = buildDriveMetadata(input);
  const content = resolveUploadContent(input);
  if (content) {
    return uploadDriveFile(fileId, metadata, content, "PATCH", input, accessToken, fetcher);
  }
  return patchDriveFile(fileId, metadata, input, accessToken, fetcher);
}

async function emptyTrash(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  await googleRequest(`${driveApiBaseUrl}/files/trash`, {
    accessToken,
    fetcher,
    method: "DELETE",
    query: compactObject({
      driveId: optionalString(input.driveId),
    }),
  });

  return { success: true };
}

async function deleteFile(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const fileId = resolveFileId(input);
  await googleRequest(`${driveApiBaseUrl}/files/${fileId}`, {
    accessToken,
    fetcher,
    method: "DELETE",
    query: {
      supportsAllDrives: String(resolveSupportsAllDrives(input)),
    },
  });

  return {
    fileId,
    deleted: true,
  };
}

async function generateIds(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await googleJsonRequest<Record<string, unknown>>(`${driveApiBaseUrl}/files/generateIds`, {
    accessToken,
    fetcher,
    query: compactObject({
      count: asOptionalInteger(input.count, "count")?.toString(),
      space: optionalString(input.space),
      type: optionalString(input.type),
    }),
  });

  return {
    ids: Array.isArray(payload.ids) ? asStringArray(payload.ids) : [],
    space: String(payload.space ?? ""),
    kind: String(payload.kind ?? ""),
  };
}

async function createDriveFile(metadata: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await googleJsonRequest<Record<string, unknown>>(`${driveApiBaseUrl}/files`, {
    accessToken,
    fetcher,
    method: "POST",
    query: {
      fields: driveFileFields,
      supportsAllDrives: "true",
    },
    body: metadata,
  });

  return normalizeDriveFile(payload);
}

async function patchDriveFile(
  fileId: string,
  metadata: Record<string, unknown>,
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const payload = await googleJsonRequest<Record<string, unknown>>(`${driveApiBaseUrl}/files/${fileId}`, {
    accessToken,
    fetcher,
    method: "PATCH",
    query: compactObject({
      addParents: optionalString(input.addParents),
      removeParents: optionalString(input.removeParents),
      fields: driveFileFields,
      supportsAllDrives: String(resolveSupportsAllDrives(input)),
    }),
    body: metadata,
  });

  return normalizeDriveFile(payload);
}

async function uploadDriveFile(
  fileId: string | undefined,
  metadata: Record<string, unknown>,
  content: UploadContent,
  method: "POST" | "PATCH" | "PUT",
  input: Record<string, unknown>,
  accessToken: string,
  fetcher: typeof fetch,
) {
  const { body, contentType } = buildMultipartUploadBody(metadata, content);
  const path = fileId ? `/files/${fileId}` : "/files";
  const payload = await googleJsonRequest<Record<string, unknown>>(`${driveUploadApiBaseUrl}${path}`, {
    accessToken,
    fetcher,
    method,
    query: compactObject({
      uploadType: "multipart",
      addParents: optionalString(input.addParents),
      removeParents: optionalString(input.removeParents),
      fields: driveFileFields,
      supportsAllDrives: String(resolveSupportsAllDrives(input)),
    }),
    rawBody: body,
    headers: {
      "content-type": contentType,
    },
  });

  return normalizeDriveFile(payload);
}

async function fetchDriveFile(
  fileId: string,
  accessToken: string,
  fetcher: typeof fetch,
  includeSharedDrives: boolean,
) {
  return googleJsonRequest<Record<string, unknown>>(`${driveApiBaseUrl}/files/${fileId}`, {
    accessToken,
    fetcher,
    query: {
      fields: driveFileFields,
      supportsAllDrives: String(includeSharedDrives),
    },
  });
}

function extensionForExportMimeType(mimeType: string): string {
  const normalized = mimeType.split(";")[0]?.trim().toLowerCase();
  switch (normalized) {
    case "application/pdf":
      return ".pdf";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return ".docx";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return ".xlsx";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return ".pptx";
    case "text/plain":
      return ".txt";
    case "text/csv":
      return ".csv";
    case "text/html":
      return ".html";
    case "application/zip":
      return ".zip";
    default:
      return "";
  }
}

function normalizeDriveFile(payload: Record<string, unknown>) {
  return {
    id: String(payload.id ?? ""),
    name: String(payload.name ?? ""),
    mimeType: String(payload.mimeType ?? ""),
    webViewLink: optionalString(payload.webViewLink) ?? null,
    createdTime: optionalString(payload.createdTime) ?? null,
    modifiedTime: optionalString(payload.modifiedTime) ?? null,
    sizeBytes: parseSizeBytes(payload.size),
    driveId: optionalString(payload.driveId) ?? null,
    ...(Array.isArray(payload.parents) ? { parents: asStringArray(payload.parents) } : {}),
    ...(Array.isArray(payload.owners)
      ? {
          owners: payload.owners.map((owner) => ({
            displayName: optionalNestedString(owner as Record<string, unknown>, ["displayName"]) ?? null,
            emailAddress: optionalNestedString(owner as Record<string, unknown>, ["emailAddress"]) ?? null,
            permissionId: optionalNestedString(owner as Record<string, unknown>, ["permissionId"]) ?? null,
            photoLink: optionalNestedString(owner as Record<string, unknown>, ["photoLink"]) ?? null,
          })),
        }
      : {}),
    ...(typeof payload.shared === "boolean" ? { shared: payload.shared } : {}),
    ...(typeof payload.starred === "boolean" ? { starred: payload.starred } : {}),
    ...(typeof payload.trashed === "boolean" ? { trashed: payload.trashed } : {}),
  };
}

function resolveDriveId(input: Record<string, unknown>) {
  return resolveRequiredString(input, ["driveId"], "driveId is required");
}

function resolveOptionalDriveId(input: Record<string, unknown>) {
  return pickOptionalString(input, "driveId");
}

function resolveChangesSupportsAllDrives(input: Record<string, unknown>, driveId?: string) {
  return driveId ? true : resolveSupportsAllDrives(input);
}

function resolveChangesIncludeItemsFromAllDrives(input: Record<string, unknown>, driveId?: string) {
  if (driveId) {
    return true;
  }
  return pickOptionalBoolean(input, "includeItemsFromAllDrives");
}

type UploadContent = {
  mimeType: string;
  bytes: ArrayBuffer;
};

function buildDriveMetadata(input: Record<string, unknown>) {
  return compactUnknownObject({
    name: optionalString(input.name),
    mimeType: optionalString(input.mimeType),
    description: resolveOptionalDescription(input.description),
    parents: resolveParentIds(input),
    ...(typeof input.starred === "boolean" ? { starred: input.starred } : {}),
    ...(typeof input.trashed === "boolean" ? { trashed: input.trashed } : {}),
    ...(input.appProperties != null ? { appProperties: asStringRecord(input.appProperties) } : {}),
    ...(input.properties != null ? { properties: asStringRecord(input.properties) } : {}),
  });
}

function resolveParentIds(input: Record<string, unknown>) {
  if (Array.isArray(input.parents)) {
    return asStringArray(input.parents);
  }
  return undefined;
}

function resolveOptionalDescription(value: unknown) {
  if (value === "") {
    throw new ProviderRequestError(400, "description must not be empty");
  }
  return optionalString(value);
}

function buildDriveBody(input: Record<string, unknown>, options: { requireName?: boolean } = {}) {
  return compactUnknownObject({
    name: options.requireName ? resolveRequiredString(input, ["name"], "name is required") : optionalString(input.name),
    hidden: optionalBoolean(input.hidden),
    themeId: pickOptionalString(input, "themeId"),
    colorRgb: pickOptionalString(input, "colorRgb"),
    restrictions: normalizeDriveRestrictions(input.restrictions),
    backgroundImageFile: normalizeDriveBackgroundImageFile(input.backgroundImageFile),
  });
}

function normalizeDriveRestrictions(value: unknown) {
  const restrictions = asOptionalObject(value);
  if (!restrictions) {
    return undefined;
  }
  return compactUnknownObject({
    domainUsersOnly: optionalBoolean(restrictions.domainUsersOnly),
    driveMembersOnly: optionalBoolean(restrictions.driveMembersOnly),
    adminManagedRestrictions: optionalBoolean(restrictions.adminManagedRestrictions),
    copyRequiresWriterPermission: optionalBoolean(restrictions.copyRequiresWriterPermission),
    sharingFoldersRequiresOrganizerPermission: optionalBoolean(restrictions.sharingFoldersRequiresOrganizerPermission),
  });
}

function normalizeDriveBackgroundImageFile(value: unknown) {
  const backgroundImageFile = asOptionalObject(value);
  if (!backgroundImageFile) {
    return undefined;
  }

  return {
    id: resolveRequiredString(backgroundImageFile, ["id"], "backgroundImageFile.id is required"),
    width: Number(backgroundImageFile.width ?? 0),
    xCoordinate: Number(backgroundImageFile.xCoordinate ?? 0),
    yCoordinate: Number(backgroundImageFile.yCoordinate ?? 0),
  };
}

function resolveUploadContent(
  input: Record<string, unknown>,
  options: { required?: boolean; textOnly?: boolean } = {},
): UploadContent | undefined {
  const text = typeof input.text === "string" ? input.text : undefined;
  if (text != null) {
    return {
      mimeType: optionalString(input.mimeType) ?? "text/plain",
      bytes: toArrayBuffer(Buffer.from(text)),
    };
  }

  if (!options.textOnly) {
    const contentBase64 = optionalString(input.contentBase64);
    if (contentBase64) {
      return {
        mimeType: optionalString(input.mimeType) ?? "application/octet-stream",
        bytes: toArrayBuffer(Buffer.from(contentBase64, "base64")),
      };
    }
  }

  if (options.required) {
    throw new ProviderRequestError(400, "contentBase64 or text is required");
  }

  return undefined;
}

function buildMultipartUploadBody(metadata: Record<string, unknown>, content: UploadContent) {
  const boundary = `oomol-${Math.random().toString(16).slice(2)}`;
  const encoder = new TextEncoder();
  const body = new Blob([
    encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    ),
    encoder.encode(`--${boundary}\r\nContent-Type: ${content.mimeType}\r\n\r\n`),
    content.bytes,
    encoder.encode(`\r\n--${boundary}--`),
  ]);

  return {
    body,
    contentType: `multipart/related; boundary=${boundary}`,
  };
}

function toArrayBuffer(value: Uint8Array) {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function normalizeDrive(payload: Record<string, unknown>) {
  return compactUnknownObject({
    id: String(payload.id ?? ""),
    kind: optionalString(payload.kind) ?? null,
    name: String(payload.name ?? ""),
    hidden: optionalBoolean(payload.hidden),
    colorRgb: optionalString(payload.colorRgb) ?? null,
    createdTime: optionalString(payload.createdTime) ?? null,
    orgUnitId: optionalString(payload.orgUnitId) ?? null,
    themeId: optionalString(payload.themeId) ?? null,
    backgroundImageLink: optionalString(payload.backgroundImageLink) ?? null,
    capabilities: asOptionalObject(payload.capabilities),
    restrictions: asOptionalObject(payload.restrictions),
  });
}

function normalizeChange(payload: Record<string, unknown>) {
  return compactUnknownObject({
    id: buildStableChangeId(payload),
    kind: optionalString(payload.kind) ?? null,
    changeType: optionalString(payload.changeType) ?? null,
    removed: optionalBoolean(payload.removed),
    time: optionalString(payload.time) ?? null,
    fileId: optionalString(payload.fileId) ?? null,
    driveId: optionalString(payload.driveId) ?? null,
    file: asOptionalObject(payload.file) ? normalizeDriveFile(asOptionalObject(payload.file)!) : undefined,
  });
}

function buildStableChangeId(payload: Record<string, unknown>) {
  const explicitId = optionalString(payload.id) ?? optionalString(payload.changeId);
  if (explicitId) {
    return explicitId;
  }

  return [
    optionalString(payload.driveId) ?? "my-drive",
    optionalString(payload.fileId) ?? "unknown-file",
    optionalString(payload.time) ?? "unknown-time",
    optionalString(payload.changeType) ?? "unknown-change",
    optionalBoolean(payload.removed) ? "removed" : "present",
  ].join(":");
}

function normalizeAccessProposal(payload: Record<string, unknown>) {
  return compactUnknownObject({
    fileId: String(payload.fileId ?? ""),
    proposalId: String(payload.proposalId ?? payload.id ?? ""),
    createTime: optionalString(payload.createTime) ?? null,
    requestMessage: optionalString(payload.requestMessage) ?? null,
    recipientEmailAddress: optionalString(payload.recipientEmailAddress) ?? null,
    requesterEmailAddress: optionalString(payload.requesterEmailAddress) ?? null,
    rolesAndViews: Array.isArray(payload.rolesAndViews)
      ? payload.rolesAndViews.map((value) => normalizeRoleAndView(asObject(value)))
      : undefined,
  });
}

function normalizeRoleAndView(payload: Record<string, unknown>) {
  return {
    role: optionalString(payload.role) ?? null,
    view: optionalString(payload.view) ?? null,
  };
}

function normalizeApproval(payload: Record<string, unknown>) {
  return {
    fileId: String(payload.fileId ?? ""),
    approvalId: String(payload.approvalId ?? payload.id ?? ""),
    status: optionalString(payload.status) ?? null,
    createTime: optionalString(payload.createTime) ?? null,
    requestMessage: optionalString(payload.requestMessage) ?? null,
    requesterEmailAddress: optionalString(payload.requesterEmailAddress) ?? null,
  };
}
