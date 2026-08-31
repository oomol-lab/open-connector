import type { TransitFileWriter } from "../../../core/types.ts";
import type { FeishuJsonRequest } from "./client.ts";
import type { DownloadedFeishuSource } from "./media.ts";

import { optionalNumber, optionalRecord } from "../../../core/cast.ts";
import { providerInputError, ProviderRequestError, providerResponseError } from "../../provider-runtime.ts";
import { requestFeishuMultipart, withFeishuRawResponse } from "./client.ts";
import {
  downloadFeishuSource,
  feishuSourceSizeBytes,
  readFeishuSourceBytes,
  storeFeishuTransitResponse,
} from "./media.ts";

interface FeishuFileActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

export interface FeishuFileRuntimeDeps {
  readonly request: FeishuJsonRequest;
  readonly accessToken: string;
  readonly fetcher: typeof fetch;
  readonly transitFiles?: TransitFileWriter;
  readonly signal?: AbortSignal;
}

interface MultipartUploadInput {
  readonly source: DownloadedFeishuSource;
  readonly endpoint: "files" | "medias";
  readonly parentType: string;
  readonly parentNode: string;
  readonly extra?: string;
  readonly existingFileToken?: string;
}

interface MultipartUploadSession {
  readonly uploadId: string;
  readonly blockSize: number;
  readonly blockNum: number;
}

interface BaseAttachmentItem {
  readonly fieldId: string;
  readonly fileToken: string;
  readonly name: string;
  readonly mimeType?: string;
  readonly size?: number;
  readonly extraInfo?: string;
}

const singlePartMaxBytes = 20 * 1024 * 1024;
const driveUploadMaxBytes = 2 * 1024 * 1024 * 1024;
const baseAttachmentMaxBytes = 2 * 1024 * 1024 * 1024;
const importDownloadMaxBytes = 800 * 1024 * 1024;

export function createFeishuFileActionHandlers(deps: FeishuFileRuntimeDeps): Record<string, FeishuFileActionHandler> {
  return {
    upload_drive_file(input) {
      return uploadDriveFile(input, deps);
    },
    download_drive_file(input) {
      return downloadDriveFile(input, deps);
    },
    download_message_resource(input) {
      return downloadMessageResource(input, deps);
    },
    submit_drive_export(input) {
      return submitDriveExport(input, deps.request);
    },
    get_drive_export(input) {
      return getDriveExport(input, deps.request);
    },
    download_drive_export(input) {
      return downloadDriveExport(input, deps);
    },
    submit_drive_import(input) {
      return submitDriveImport(input, deps);
    },
    get_drive_import(input) {
      return getDriveImport(input, deps.request);
    },
    upload_base_attachments(input) {
      return uploadBaseAttachments(input, deps);
    },
    download_base_attachments(input) {
      return downloadBaseAttachments(input, deps);
    },
    remove_base_attachments(input) {
      return removeBaseAttachments(input, deps.request);
    },
  };
}

async function uploadDriveFile(input: Record<string, unknown>, deps: FeishuFileRuntimeDeps) {
  const folderToken = optionalString(input.folderToken);
  const wikiToken = optionalString(input.wikiToken);
  if (folderToken && wikiToken) {
    throw providerInputError("folderToken and wikiToken are mutually exclusive");
  }
  const source = await downloadFeishuSource(
    {
      sourceUrl: requireString(input.fileUrl, "fileUrl"),
      kind: "file",
      fileName: optionalString(input.fileName),
      fieldName: "fileUrl",
      maxBytes: driveUploadMaxBytes,
    },
    deps.fetcher,
    deps.signal,
  );
  try {
    const result = await uploadDriveBytes(
      {
        source,
        endpoint: "files",
        parentType: wikiToken ? "wiki" : "explorer",
        parentNode: wikiToken ?? folderToken ?? "",
        existingFileToken: optionalString(input.existingFileToken),
      },
      deps,
    );
    return {
      fileToken: result.fileToken,
      fileName: source.fileName,
      sizeBytes: feishuSourceSizeBytes(source),
      version: result.version,
    };
  } finally {
    await source.cleanup?.();
  }
}

async function downloadDriveFile(input: Record<string, unknown>, deps: FeishuFileRuntimeDeps) {
  const fileToken = requireString(input.fileToken, "fileToken");
  return downloadRawFile(
    {
      path: `/drive/v1/files/${segment(fileToken)}/download`,
      fallbackName: fileToken,
      preferredName: optionalString(input.fileName),
    },
    deps,
  );
}

async function downloadMessageResource(input: Record<string, unknown>, deps: FeishuFileRuntimeDeps) {
  const messageId = requireString(input.messageId, "messageId");
  const fileKey = requireString(input.fileKey, "fileKey");
  const type = requireMessageResourceType(input.type);
  return downloadRawFile(
    {
      path: `/im/v1/messages/${segment(messageId)}/resources/${segment(fileKey)}`,
      query: { type },
      fallbackName: fileKey,
      preferredName: optionalString(input.fileName),
    },
    deps,
  );
}

async function submitDriveExport(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requireString(input.token, "token");
  const type = requireString(input.type, "type");
  const fileExtension = requireString(input.fileExtension, "fileExtension");
  const subId = optionalString(input.subId);
  validateExportCombination(type, fileExtension, subId, input.onlySchema === true);
  const body: Record<string, unknown> = {
    token,
    type,
    file_extension: fileExtension,
  };
  if (subId) {
    body.sub_id = subId;
  }
  if (input.onlySchema === true) {
    body.only_schema = true;
  }
  const data = await request({
    method: "POST",
    path: "/drive/v1/export_tasks",
    body,
  });
  const ticket = requireResponseString(data.ticket, "ticket");
  return {
    ticket,
    sourceToken: token,
    exportHandle: JSON.stringify({ ticket, sourceToken: token }),
  };
}

function validateExportCombination(type: string, extension: string, subId: string | undefined, onlySchema: boolean) {
  const allowedExtensions: Readonly<Record<string, readonly string[]>> = {
    doc: ["docx", "pdf"],
    docx: ["docx", "pdf"],
    sheet: ["xlsx", "csv"],
    bitable: ["xlsx", "csv", "base"],
    slides: ["pptx", "pdf"],
  };
  if (
    !allowedExtensions[type]?.includes(extension) ||
    (extension === "csv") !== Boolean(subId) ||
    (onlySchema && (type !== "bitable" || extension !== "base"))
  ) {
    throw providerInputError("the selected document type and export format are not compatible");
  }
}

async function getDriveExport(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const reference = readExportReference(input);
  const data = await request({
    path: `/drive/v1/export_tasks/${segment(reference.ticket)}`,
    query: { token: reference.sourceToken },
  });
  const result = optionalRecord(data.result) ?? data;
  const jobStatus = optionalNumber(result.job_status) ?? 0;
  const fileToken = optionalString(result.file_token);
  return {
    ticket: reference.ticket,
    status: normalizeTaskStatus(jobStatus, Boolean(fileToken)),
    jobStatus,
    fileToken,
    fileName: optionalString(result.file_name),
    fileExtension: optionalString(result.file_extension),
    type: optionalString(result.type),
    fileSize: optionalNumber(result.file_size),
    errorMessage: optionalString(result.job_error_msg),
    raw: result,
  };
}

async function downloadDriveExport(input: Record<string, unknown>, deps: FeishuFileRuntimeDeps) {
  const fileToken = requireString(input.fileToken, "fileToken");
  return downloadRawFile(
    {
      path: `/drive/v1/export_tasks/file/${segment(fileToken)}/download`,
      fallbackName: fileToken,
      preferredName: optionalString(input.fileName),
    },
    deps,
  );
}

async function submitDriveImport(input: Record<string, unknown>, deps: FeishuFileRuntimeDeps) {
  const source = await downloadFeishuSource(
    {
      sourceUrl: requireString(input.fileUrl, "fileUrl"),
      kind: "file",
      fileName: optionalString(input.fileName),
      fieldName: "fileUrl",
      maxBytes: importDownloadMaxBytes,
    },
    deps.fetcher,
    deps.signal,
  );
  try {
    const extension = normalizeExtension(optionalString(input.fileExtension)) ?? extensionFromFileName(source.fileName);
    if (!extension) {
      throw providerInputError("fileExtension is required when the source file name has no extension");
    }
    const type = requireString(input.type, "type");
    validateImportCombination(extension, type, feishuSourceSizeBytes(source));
    const extra = JSON.stringify({
      obj_type: type,
      file_extension: extension,
    });
    const upload = await uploadDriveBytes(
      {
        source: {
          ...source,
          fileName: ensureFileExtension(source.fileName, extension),
        },
        endpoint: "medias",
        parentType: "ccm_import_open",
        parentNode: "",
        extra,
      },
      deps,
    );
    const targetName = optionalString(input.name) ?? fileNameWithoutExtension(source.fileName) ?? "Untitled";
    const body: Record<string, unknown> = {
      file_extension: extension,
      file_token: upload.fileToken,
      type,
      file_name: targetName,
      point: {
        mount_type: 1,
        mount_key: optionalString(input.folderToken) ?? "",
      },
    };
    const targetToken = optionalString(input.targetToken);
    if (targetToken) {
      if (type !== "bitable") {
        throw providerInputError("targetToken is only supported when type is bitable");
      }
      body.token = targetToken;
    }
    const data = await deps.request({
      method: "POST",
      path: "/drive/v1/import_tasks",
      body,
    });
    return {
      ticket: requireResponseString(data.ticket, "ticket"),
      uploadedFileToken: upload.fileToken,
      fileName: source.fileName,
      fileExtension: extension,
      type,
    };
  } finally {
    await source.cleanup?.();
  }
}

async function getDriveImport(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const ticket = requireString(input.ticket, "ticket");
  const data = await request({
    path: `/drive/v1/import_tasks/${segment(ticket)}`,
  });
  const result = optionalRecord(data.result) ?? data;
  const jobStatus = optionalNumber(result.job_status) ?? 0;
  const token = optionalString(result.token);
  return {
    ticket,
    status: normalizeTaskStatus(jobStatus, Boolean(token)),
    jobStatus,
    type: optionalString(result.type),
    token,
    url: optionalString(result.url),
    errorMessage: optionalString(result.job_error_msg),
    extra: result.extra,
    raw: result,
  };
}

async function uploadBaseAttachments(input: Record<string, unknown>, deps: FeishuFileRuntimeDeps) {
  const appToken = requireString(input.appToken, "appToken");
  const tableId = requireString(input.tableId, "tableId");
  const recordId = requireString(input.recordId, "recordId");
  const field = await requireBaseAttachmentField(input, deps.request);
  const files = requireObjectArray(input.files, "files");
  const attachments: Array<{
    fileToken: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
  }> = [];
  for (const [index, item] of files.entries()) {
    const source = await downloadFeishuSource(
      {
        sourceUrl: requireString(item.fileUrl, `files[${index}].fileUrl`),
        kind: "file",
        fileName: optionalString(item.fileName),
        fieldName: `files[${index}].fileUrl`,
        maxBytes: baseAttachmentMaxBytes,
      },
      deps.fetcher,
      deps.signal,
    );
    try {
      const uploaded = await uploadDriveBytes(
        {
          source,
          endpoint: "medias",
          parentType: "bitable_file",
          parentNode: appToken,
        },
        deps,
      );
      attachments.push({
        fileToken: uploaded.fileToken,
        name: source.fileName,
        mimeType: source.mimeType,
        sizeBytes: feishuSourceSizeBytes(source),
      });
    } finally {
      await source.cleanup?.();
    }
  }
  const raw = await deps.request({
    method: "POST",
    path: `${baseTablePath(appToken, tableId)}/append_attachments`,
    body: singleCellAttachmentsBody(
      recordId,
      field.fieldId,
      attachments.map((attachment) => ({ file_token: attachment.fileToken })),
    ),
  });
  return { attachments, raw };
}

async function downloadBaseAttachments(input: Record<string, unknown>, deps: FeishuFileRuntimeDeps) {
  const appToken = requireString(input.appToken, "appToken");
  const tableId = requireString(input.tableId, "tableId");
  const recordId = requireString(input.recordId, "recordId");
  const data = await deps.request({
    method: "POST",
    path: `${baseTablePath(appToken, tableId)}/get_attachments`,
    body: { record_id_list: [recordId] },
  });
  const attachments = readBaseAttachmentItems(data, recordId);
  const requestedTokens = optionalStringArray(input.fileTokens);
  const selected = requestedTokens
    ? requestedTokens.map((token) => {
        const item = attachments.find((attachment) => attachment.fileToken === token);
        if (!item) {
          throw providerInputError(`attachment file token ${token} was not found in Base record ${recordId}`);
        }
        return item;
      })
    : attachments;
  if (selected.length === 0) {
    throw providerInputError(`Base record ${recordId} has no attachments`);
  }
  const files = [];
  for (const item of selected) {
    const file = await downloadRawFile(
      {
        path: `/drive/v1/medias/${segment(item.fileToken)}/download`,
        query: item.extraInfo ? { extra: item.extraInfo } : undefined,
        fallbackName: item.fileToken,
        preferredName: item.name,
        preferredMimeType: item.mimeType,
      },
      deps,
    );
    files.push({
      fieldId: item.fieldId,
      fileToken: item.fileToken,
      ...file,
    });
  }
  return { files };
}

async function removeBaseAttachments(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const appToken = requireString(input.appToken, "appToken");
  const tableId = requireString(input.tableId, "tableId");
  const recordId = requireString(input.recordId, "recordId");
  const field = await requireBaseAttachmentField(input, request);
  const fileTokens = requireStringArray(input.fileTokens, "fileTokens");
  const raw = await request({
    method: "POST",
    path: `${baseTablePath(appToken, tableId)}/remove_attachments`,
    body: singleCellAttachmentsBody(
      recordId,
      field.fieldId,
      fileTokens.map((fileToken) => ({ file_token: fileToken })),
    ),
  });
  return {
    removedFileTokens: fileTokens,
    raw,
  };
}

async function uploadDriveBytes(input: MultipartUploadInput, deps: FeishuFileRuntimeDeps) {
  if (feishuSourceSizeBytes(input.source) <= singlePartMaxBytes) {
    return uploadDriveBytesSinglePart(input, deps);
  } else {
    return uploadDriveBytesMultipart(input, deps);
  }
}

async function uploadDriveBytesSinglePart(input: MultipartUploadInput, deps: FeishuFileRuntimeDeps) {
  const bytes = await readFeishuSourceBytes(input.source);
  const body = new FormData();
  body.set("file_name", input.source.fileName);
  body.set("parent_type", input.parentType);
  body.set("parent_node", input.parentNode);
  body.set("size", String(bytes.byteLength));
  if (input.extra) {
    body.set("extra", input.extra);
  }
  if (input.existingFileToken) {
    body.set("file_token", input.existingFileToken);
  }
  body.set("file", new Blob([bytes.slice().buffer], { type: input.source.mimeType }), input.source.fileName);
  const data = await requestFeishuMultipart({
    accessToken: deps.accessToken,
    fetcher: deps.fetcher,
    signal: deps.signal,
    path: `/drive/v1/${input.endpoint}/upload_all`,
    body,
  });
  return readUploadResult(data, "upload_all");
}

async function uploadDriveBytesMultipart(input: MultipartUploadInput, deps: FeishuFileRuntimeDeps) {
  const sizeBytes = feishuSourceSizeBytes(input.source);
  const prepareBody: Record<string, unknown> = {
    file_name: input.source.fileName,
    parent_type: input.parentType,
    parent_node: input.parentNode,
    size: sizeBytes,
  };
  if (input.extra) {
    prepareBody.extra = input.extra;
  }
  if (input.existingFileToken) {
    prepareBody.file_token = input.existingFileToken;
  }
  const prepareData = await deps.request({
    method: "POST",
    path: `/drive/v1/${input.endpoint}/upload_prepare`,
    body: prepareBody,
  });
  const session = readMultipartUploadSession(prepareData, sizeBytes);
  for (let seq = 0; seq < session.blockNum; seq += 1) {
    const offset = seq * session.blockSize;
    const chunk = await readFeishuSourceBytes(input.source, offset, Math.min(offset + session.blockSize, sizeBytes));
    const partBody = new FormData();
    partBody.set("upload_id", session.uploadId);
    partBody.set("seq", String(seq));
    partBody.set("size", String(chunk.byteLength));
    partBody.set("file", new Blob([chunk.slice().buffer], { type: "application/octet-stream" }), input.source.fileName);
    await requestFeishuMultipart({
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      signal: deps.signal,
      path: `/drive/v1/${input.endpoint}/upload_part`,
      body: partBody,
    });
  }
  const finishData = await deps.request({
    method: "POST",
    path: `/drive/v1/${input.endpoint}/upload_finish`,
    body: {
      upload_id: session.uploadId,
      block_num: session.blockNum,
    },
  });
  return readUploadResult(finishData, "upload_finish");
}

function readMultipartUploadSession(data: Record<string, unknown>, totalBytes: number): MultipartUploadSession {
  const uploadId = requireResponseString(data.upload_id, "upload_id");
  const blockSize = optionalNumber(data.block_size);
  const blockNum = optionalNumber(data.block_num);
  if (
    !Number.isInteger(blockSize) ||
    !Number.isInteger(blockNum) ||
    !blockSize ||
    blockSize <= 0 ||
    !blockNum ||
    blockNum <= 0
  ) {
    throw providerResponseError("upload_prepare returned an invalid block plan");
  }
  if (Math.ceil(totalBytes / blockSize) !== blockNum) {
    throw providerResponseError("upload_prepare returned an inconsistent block plan");
  }
  return { uploadId, blockSize, blockNum };
}

function readUploadResult(data: Record<string, unknown>, phase: string) {
  return {
    fileToken: requireResponseString(data.file_token, `${phase}.file_token`),
    version: optionalString(data.version) ?? optionalString(data.data_version),
  };
}

async function downloadRawFile(
  input: {
    readonly path: string;
    readonly query?: Readonly<Record<string, string>>;
    readonly fallbackName: string;
    readonly preferredName?: string;
    readonly preferredMimeType?: string;
  },
  deps: FeishuFileRuntimeDeps,
) {
  const transit = requireFileTransit(deps);
  return withFeishuRawResponse(
    {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      signal: deps.signal,
      path: input.path,
      query: input.query,
    },
    async (response) => {
      const mimeType =
        input.preferredMimeType ??
        response.headers.get("content-type")?.split(";", 1)[0]?.trim() ??
        "application/octet-stream";
      const name = safeFileName(
        input.preferredName ??
          readContentDispositionFileName(response.headers.get("content-disposition")) ??
          input.fallbackName,
        input.fallbackName,
      );
      try {
        return await storeFeishuTransitResponse(response, name, mimeType, transit);
      } catch (error) {
        throw new ProviderRequestError(
          502,
          error instanceof Error ? error.message : "Feishu file transit upload failed",
        );
      }
    },
  );
}

function requireFileTransit(deps: FeishuFileRuntimeDeps): TransitFileWriter {
  if (!deps.transitFiles) {
    throw new ProviderRequestError(400, "local transit file storage is not configured");
  }
  return deps.transitFiles;
}

async function requireBaseAttachmentField(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const appToken = requireString(input.appToken, "appToken");
  const tableId = requireString(input.tableId, "tableId");
  const requestedFieldId = requireString(input.fieldId, "fieldId");
  const data = await request({
    path: `${baseTablePath(appToken, tableId)}/fields/${segment(requestedFieldId)}`,
  });
  const field = optionalRecord(data.field) ?? data;
  const type = optionalString(field.type)?.trim().toLowerCase();
  const uiType = optionalString(field.ui_type)?.trim().toLowerCase();
  if (type !== "attachment" && type !== "17" && uiType !== "attachment") {
    throw providerInputError(`Base field ${requestedFieldId} is not an attachment field`);
  }
  return {
    fieldId: optionalString(field.field_id) ?? optionalString(field.id) ?? requestedFieldId,
  };
}

function readBaseAttachmentItems(data: Record<string, unknown>, recordId: string): BaseAttachmentItem[] {
  const attachments = optionalRecord(data.attachments);
  const record = attachments ? optionalRecord(attachments[recordId]) : undefined;
  if (!record) {
    return [];
  }
  const result: BaseAttachmentItem[] = [];
  const seen = new Set<string>();
  for (const [fieldId, rawItems] of Object.entries(record)) {
    if (!Array.isArray(rawItems)) {
      continue;
    }
    for (const rawItem of rawItems) {
      const item = optionalRecord(rawItem);
      const fileToken = item ? optionalString(item.file_token) : undefined;
      if (!item || !fileToken || seen.has(fileToken)) {
        continue;
      }
      seen.add(fileToken);
      result.push({
        fieldId,
        fileToken,
        name: optionalString(item.name) ?? fileToken,
        mimeType: optionalString(item.mime_type),
        size: optionalNumber(item.size),
        extraInfo: optionalString(item.extra_info),
      });
    }
  }
  return result;
}

function singleCellAttachmentsBody(recordId: string, fieldId: string, items: readonly Record<string, unknown>[]) {
  return {
    attachments: {
      [recordId]: {
        [fieldId]: items,
      },
    },
  };
}

function readExportReference(input: Record<string, unknown>) {
  const exportHandle = optionalString(input.exportHandle);
  if (exportHandle) {
    try {
      const parsed = optionalRecord(JSON.parse(exportHandle) as unknown);
      if (parsed) {
        return {
          ticket: requireString(parsed.ticket, "exportHandle.ticket"),
          sourceToken: requireString(parsed.sourceToken, "exportHandle.sourceToken"),
        };
      }
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        throw error;
      }
    }
    throw providerInputError("exportHandle is invalid");
  }
  return {
    ticket: requireString(input.ticket, "ticket"),
    sourceToken: requireString(input.sourceToken, "sourceToken"),
  };
}

function normalizeTaskStatus(jobStatus: number, hasResult: boolean) {
  if (jobStatus === 0 && hasResult) {
    return "succeeded";
  }
  if (jobStatus === 0 || jobStatus === 1 || jobStatus === 2) {
    return "running";
  }
  return "failed";
}

function validateImportCombination(extension: string, type: string, sizeBytes: number) {
  const allowed: Record<string, readonly string[]> = {
    docx: ["docx", "doc", "txt", "md", "mark", "markdown", "html"],
    sheet: ["xlsx", "xls", "csv"],
    bitable: ["xlsx", "csv", "base"],
    slides: ["pptx"],
  };
  if (!allowed[type]?.includes(extension)) {
    throw providerInputError(`.${extension} cannot be imported as ${type}`);
  }
  let maxBytes = singlePartMaxBytes;
  if (extension === "docx" || extension === "doc") {
    maxBytes = 600 * 1024 * 1024;
  } else if (extension === "pptx") {
    maxBytes = 500 * 1024 * 1024;
  } else if (extension === "xlsx") {
    maxBytes = 800 * 1024 * 1024;
  } else if (extension === "csv" && type === "bitable") {
    maxBytes = 100 * 1024 * 1024;
  }
  if (sizeBytes > maxBytes) {
    throw providerInputError(`.${extension} import exceeds ${maxBytes} bytes for ${type}`);
  }
}

function normalizeExtension(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  return value.startsWith(".") ? value.slice(1).toLowerCase() : value.toLowerCase();
}

function extensionFromFileName(fileName: string) {
  const safeName = safeFileName(fileName, "");
  const index = safeName.lastIndexOf(".");
  return index > 0 && index < safeName.length - 1 ? safeName.slice(index + 1).toLowerCase() : undefined;
}

function ensureFileExtension(fileName: string, extension: string) {
  return extensionFromFileName(fileName) === extension
    ? fileName
    : `${fileNameWithoutExtension(fileName) ?? fileName}.${extension}`;
}

function fileNameWithoutExtension(fileName: string) {
  const safeName = safeFileName(fileName, "");
  const index = safeName.lastIndexOf(".");
  return index > 0 ? safeName.slice(0, index) : safeName || undefined;
}

function baseTablePath(appToken: string, tableId: string) {
  return `/base/v3/bases/${segment(appToken)}/tables/${segment(tableId)}`;
}

function segment(value: string) {
  return encodeURIComponent(value);
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw providerInputError(`${fieldName} is required`);
  }
  return value.trim();
}

function requireMessageResourceType(value: unknown): "image" | "file" {
  if (value === "image" || value === "file") {
    return value;
  }
  throw providerInputError("type must be image or file");
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireResponseString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value) {
    throw providerResponseError(`Feishu response is missing ${fieldName}`);
  }
  return value;
}

function requireObjectArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw providerInputError(`${fieldName} must be a non-empty array`);
  }
  return value.map((item, index) => {
    const object = optionalRecord(item);
    if (!object) {
      throw providerInputError(`${fieldName}[${index}] must be an object`);
    }
    return object;
  });
}

function requireStringArray(value: unknown, fieldName: string) {
  const values = optionalStringArray(value);
  if (!values || values.length === 0) {
    throw providerInputError(`${fieldName} must be a non-empty string array`);
  }
  return values;
}

function optionalStringArray(value: unknown) {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw providerInputError("fileTokens must be a string array");
  }
  const values = value.map((item) => requireString(item, "fileTokens item"));
  return Array.from(new Set(values));
}

function readContentDispositionFileName(value: string | null) {
  if (!value) {
    return undefined;
  }
  let fallback: string | undefined;
  for (const part of value.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    const key = part.slice(0, separatorIndex).trim().toLowerCase();
    const rawValue = stripWrappingQuotes(part.slice(separatorIndex + 1).trim());
    if (key === "filename*") {
      const encodedIndex = rawValue.indexOf("''");
      const encodedValue = encodedIndex >= 0 ? rawValue.slice(encodedIndex + 2) : rawValue;
      try {
        return decodeURIComponent(encodedValue);
      } catch {
        return encodedValue;
      }
    }
    if (key === "filename") {
      fallback = rawValue;
    }
  }
  return fallback;
}

function stripWrappingQuotes(value: string) {
  return value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"' ? value.slice(1, -1) : value;
}

function safeFileName(value: string, fallback: string) {
  const name = value.replaceAll("\\", "/").split("/").at(-1)?.trim();
  return name && name !== "." && name !== ".." ? name : fallback;
}
