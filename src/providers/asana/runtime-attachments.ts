import type { TransitFileRead } from "../../core/types.ts";
import type { AsanaActionHandler, AsanaContext } from "./runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  asanaInvalidInputError,
  asanaPathGid,
  buildAsanaFieldsQuery,
  buildAsanaPaginationQuery,
  deleteAsanaResource,
  getAsanaResource,
  listAsanaResources,
  requestAsana,
} from "./runtime.ts";

const maxAttachmentBytes = 100 * 1024 * 1024;
const defaultAttachmentFields = [
  "name",
  "resource_subtype",
  "connected_to_app",
  "created_at",
  "download_url",
  "host",
  "parent",
  "parent.name",
  "parent.resource_subtype",
  "permanent_url",
  "size",
  "view_url",
];

export const attachmentActionHandlers: Record<string, AsanaActionHandler> = {
  get_attachment(input, context) {
    return getAsanaResource(
      `/attachments/${asanaPathGid(input.attachmentId, "attachmentId")}`,
      buildAsanaFieldsQuery(input, defaultAttachmentFields),
      "attachment",
      context,
    );
  },

  delete_attachment(input, context) {
    return deleteAsanaResource(`/attachments/${asanaPathGid(input.attachmentId, "attachmentId")}`, context, true);
  },

  list_attachments(input, context) {
    return listAsanaResources(
      "/attachments",
      {
        parent: requiredString(input.parentId, "parentId", asanaInvalidInputError),
        ...buildAsanaPaginationQuery(input, defaultAttachmentFields),
      },
      "attachments",
      context,
    );
  },

  create_attachment(input, context) {
    const fileId = optionalString(input.fileId);
    const externalUrl = optionalString(input.externalUrl);
    if (!!fileId === !!externalUrl) {
      throw asanaInvalidInputError("Exactly one of fileId or externalUrl must be provided.");
    }
    return externalUrl
      ? createExternalAttachment(input, externalUrl, context)
      : createTransitFileAttachment(input, requiredString(input.fileId, "fileId", asanaInvalidInputError), context);
  },
};

async function createExternalAttachment(
  input: Record<string, unknown>,
  externalUrl: string,
  context: AsanaContext,
): Promise<Record<string, unknown>> {
  const url = assertPublicHttpUrl(externalUrl, {
    fieldName: "externalUrl",
    createError: asanaInvalidInputError,
  });
  if (url.username || url.password) {
    throw asanaInvalidInputError("externalUrl must not include credentials.");
  }

  const formData = new FormData();
  formData.set("parent", requiredString(input.parentId, "parentId", asanaInvalidInputError));
  formData.set("resource_subtype", "external");
  formData.set("url", url.toString());
  formData.set("name", requiredString(input.name, "name", asanaInvalidInputError));
  return uploadAsanaAttachment(formData, input, context);
}

async function createTransitFileAttachment(
  input: Record<string, unknown>,
  fileId: string,
  context: AsanaContext,
): Promise<Record<string, unknown>> {
  if (!context.transitFiles) {
    throw asanaInvalidInputError("Transit file storage is not enabled.");
  }

  let stored: TransitFileRead;
  try {
    stored = await context.transitFiles.read(fileId);
  } catch (error) {
    throw mapTransitFileReadError(error, fileId);
  }
  if (Math.max(stored.sizeBytes, stored.file.size) > maxAttachmentBytes) {
    throw new ProviderRequestError(413, `fileId exceeds Asana's ${maxAttachmentBytes}-byte attachment limit.`);
  }

  const formData = new FormData();
  formData.set("parent", requiredString(input.parentId, "parentId", asanaInvalidInputError));
  formData.set("file", await normalizedTransitFile(stored), encodeURIComponent(stored.name));
  return uploadAsanaAttachment(formData, input, context);
}

/**
 * Send one attachment create request. Asana documents `multipart/form-data` as
 * the only accepted encoding for `POST /attachments`, for both uploaded files
 * and external resource URLs, so this never uses the JSON data envelope.
 */
async function uploadAsanaAttachment(
  formData: FormData,
  input: Record<string, unknown>,
  context: AsanaContext,
): Promise<Record<string, unknown>> {
  const payload = await requestAsana({
    path: "/attachments",
    context,
    method: "POST",
    query: buildAsanaFieldsQuery(input, defaultAttachmentFields),
    body: formData,
    wrapData: false,
  });
  return {
    attachment: requiredRecord(payload.data, "attachment", (message) => new ProviderRequestError(502, message)),
  };
}

function mapTransitFileReadError(error: unknown, fileId: string): ProviderRequestError {
  const details = optionalRecord(error);
  const status = error instanceof ProviderRequestError ? error.status : optionalInteger(details?.status);
  const code = optionalString(details?.code);
  if (status === 404 || code === "file_not_found") {
    return asanaInvalidInputError(`Transit file ${fileId} was not found.`);
  }
  if (status === 413) {
    return new ProviderRequestError(413, "Transit file storage rejected the file as too large.");
  }
  return new ProviderRequestError(502, "Transit file storage read failed.");
}

async function normalizedTransitFile(stored: TransitFileRead): Promise<File> {
  if (stored.file.name === stored.name && stored.file.type === stored.mimeType) {
    return stored.file;
  }
  return new File([await stored.file.arrayBuffer()], stored.name, { type: stored.mimeType });
}
