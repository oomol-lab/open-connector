import type { TransitFileWriter } from "../../../core/types.ts";
import type { FeishuJsonRequest } from "./client.ts";
import type { DownloadedFeishuSource } from "./media.ts";

import { compactObject, optionalNumber, optionalRecord } from "../../../core/cast.ts";
import {
  createProviderFetch,
  providerInputError,
  ProviderRequestError,
  providerResponseError,
} from "../../provider-runtime.ts";
import { requestFeishuMultipart, withFeishuRawResponse } from "./client.ts";
import {
  downloadFeishuSource,
  feishuSourceSizeBytes,
  readFeishuSourceBytes,
  requireInMemoryFeishuSource,
  storeFeishuTransitBytes,
  storeFeishuTransitResponse,
} from "./media.ts";

interface DomainMediaHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

export interface FeishuDomainMediaRuntimeDeps {
  readonly request: FeishuJsonRequest;
  readonly accessToken: string;
  readonly fetcher: typeof fetch;
  readonly transitFiles?: TransitFileWriter;
  readonly signal?: AbortSignal;
}

interface UploadTarget {
  readonly endpoint: "files" | "medias";
  readonly parentType: string;
  readonly parentNode: string;
  readonly extra?: string;
}

interface UploadSession {
  readonly uploadId: string;
  readonly blockSize: number;
  readonly blockNum: number;
}

const singlePartMaxBytes = 20 * 1024 * 1024;
const docsMediaMaxBytes = 2 * 1024 * 1024 * 1024;
const taskAttachmentMaxBytes = 50 * 1024 * 1024;
const minutesMediaMaxBytes = 2 * 1024 * 1024 * 1024;
const okrImageMaxBytes = 20 * 1024 * 1024;

export function createFeishuDomainMediaActionHandlers(
  deps: FeishuDomainMediaRuntimeDeps,
): Record<string, DomainMediaHandler> {
  return {
    upload_docs_media: (input) => uploadDocsMedia(input, deps),
    insert_docs_media: (input) => insertDocsMedia(input, deps),
    preview_docs_media: (input) => previewDocsMedia(input, deps),
    download_docs_media: (input) => downloadDocsMedia(input, deps),
    download_document_cover: (input) => downloadDocumentCover(input, deps),
    update_document_cover: (input) => updateDocumentCover(input, deps),
    delete_document_cover: (input) => deleteDocumentCover(input, deps.request),
    upload_slides_media: (input) => uploadSlidesMedia(input, deps),
    set_sheet_cell_image: (input) => setSheetCellImage(input, deps),
    get_slides_screenshots: (input) => getSlidesScreenshots(input, deps),
    render_slide_screenshot: (input) => renderSlideScreenshot(input, deps),
    upload_task_attachment: (input) => uploadTaskAttachment(input, deps),
    upload_okr_image: (input) => uploadOkrImage(input, deps),
    download_minutes_media: (input) => downloadMinutesMedia(input, deps),
    upload_minutes_media: (input) => uploadMinutesMedia(input, deps),
  };
}

async function uploadDocsMedia(input: Record<string, unknown>, deps: FeishuDomainMediaRuntimeDeps) {
  const source = await downloadSource(input, deps.fetcher, docsMediaMaxBytes, deps.signal);
  try {
    const documentId = optionalString(input.documentId);
    const result = await uploadDriveMedia(
      source,
      {
        endpoint: "medias",
        parentType: requireString(input.parentType, "parentType"),
        parentNode: requireString(input.parentNode, "parentNode"),
        extra: documentId ? JSON.stringify({ drive_route_token: documentId }) : undefined,
      },
      deps,
    );
    return {
      fileToken: result.fileToken,
      fileName: source.fileName,
      sizeBytes: feishuSourceSizeBytes(source),
    };
  } finally {
    await source.cleanup?.();
  }
}

async function insertDocsMedia(input: Record<string, unknown>, deps: FeishuDomainMediaRuntimeDeps) {
  const documentId = requireString(input.documentId, "documentId");
  const mediaType = requireMediaType(input.type);
  const source = await downloadSource(input, deps.fetcher, docsMediaMaxBytes, deps.signal);
  try {
    const rootData = await deps.request({
      path: `/docx/v1/documents/${segment(documentId)}/blocks/${segment(documentId)}`,
    });
    const root = optionalRecord(rootData.block);
    if (!root) {
      throw providerResponseError("Feishu document root response is missing block");
    }
    const parentBlockId = optionalString(root.block_id) ?? documentId;
    const index = Array.isArray(root.children) ? root.children.length : 0;
    const createData = await deps.request({
      method: "POST",
      path: `/docx/v1/documents/${segment(documentId)}/blocks/${segment(parentBlockId)}/children`,
      body: createDocsMediaBlock(mediaType, index, optionalString(input.fileView)),
    });
    const targets = readCreatedDocsMediaTargets(createData, mediaType);
    const rollback = () =>
      deps.request({
        method: "DELETE",
        path: `/docx/v1/documents/${segment(documentId)}/blocks/${segment(parentBlockId)}/children/batch_delete`,
        body: {
          start_index: index,
          end_index: index + 1,
        },
      });
    try {
      const uploaded = await uploadDriveMedia(
        source,
        {
          endpoint: "medias",
          parentType: mediaType === "file" ? "docx_file" : "docx_image",
          parentNode: targets.uploadParentNode,
          extra: JSON.stringify({ drive_route_token: documentId }),
        },
        deps,
      );
      await deps.request({
        method: "PATCH",
        path: `/docx/v1/documents/${segment(documentId)}/blocks/batch_update`,
        body: bindDocsMediaBlock(targets.replaceBlockId, mediaType, uploaded.fileToken, input),
      });
      return {
        documentId,
        blockId: targets.blockId,
        fileToken: uploaded.fileToken,
        type: mediaType,
      };
    } catch (error) {
      await rollback().catch(() => {});
      throw error;
    }
  } finally {
    await source.cleanup?.();
  }
}

async function previewDocsMedia(input: Record<string, unknown>, deps: FeishuDomainMediaRuntimeDeps) {
  const mediaToken = requireString(input.token, "token");
  return downloadFeishuRaw(
    {
      path: `/drive/v1/medias/${segment(mediaToken)}/preview_download`,
      query: { preview_type: "16" },
      preferredName: optionalString(input.fileName),
      fallbackName: mediaToken,
    },
    deps,
  );
}

async function downloadDocsMedia(input: Record<string, unknown>, deps: FeishuDomainMediaRuntimeDeps) {
  const mediaToken = requireString(input.token, "token");
  const type = optionalString(input.type) ?? "media";
  const path =
    type === "whiteboard"
      ? `/board/v1/whiteboards/${segment(mediaToken)}/download_as_image`
      : `/drive/v1/medias/${segment(mediaToken)}/download`;
  return downloadFeishuRaw(
    {
      path,
      preferredName: optionalString(input.fileName),
      fallbackName: type === "whiteboard" ? `${mediaToken}.png` : mediaToken,
      preferredMimeType: type === "whiteboard" ? "image/png" : undefined,
    },
    deps,
  );
}

async function downloadDocumentCover(input: Record<string, unknown>, deps: FeishuDomainMediaRuntimeDeps) {
  const documentId = requireString(input.documentId, "documentId");
  const cover = await getDocumentCover(documentId, deps.request);
  const coverToken = optionalString(cover.token);
  if (!coverToken) {
    throw providerInputError(`document ${documentId} has no cover`);
  }
  const file = await downloadFeishuRaw(
    {
      path: `/drive/v1/medias/${segment(coverToken)}/download`,
      preferredName: optionalString(input.fileName),
      fallbackName: "cover",
    },
    deps,
  );
  return { documentId, cover, file };
}

async function updateDocumentCover(input: Record<string, unknown>, deps: FeishuDomainMediaRuntimeDeps) {
  const documentId = requireString(input.documentId, "documentId");
  const source = await downloadSource(input, deps.fetcher, singlePartMaxBytes, deps.signal);
  if (!["image/gif", "image/jpeg", "image/png", "image/webp"].includes(source.mimeType)) {
    throw providerInputError("document covers support GIF, JPEG, PNG, or WebP images");
  }
  const uploaded = await uploadDriveMedia(
    source,
    {
      endpoint: "medias",
      parentType: "docx_image",
      parentNode: documentId,
      extra: JSON.stringify({ drive_route_token: documentId }),
    },
    deps,
  );
  const cover: Record<string, unknown> = { token: uploaded.fileToken };
  const offsetRatioX = optionalNumber(input.offsetRatioX);
  const offsetRatioY = optionalNumber(input.offsetRatioY);
  if (offsetRatioX != null) {
    cover.offset_ratio_x = offsetRatioX;
  }
  if (offsetRatioY != null) {
    cover.offset_ratio_y = offsetRatioY;
  }
  await deps.request({
    method: "PATCH",
    path: `/docx/v1/documents/${segment(documentId)}`,
    body: { update_cover: { cover } },
  });
  return {
    documentId,
    fileToken: uploaded.fileToken,
    cover,
    updated: true,
  };
}

async function deleteDocumentCover(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const documentId = requireString(input.documentId, "documentId");
  const previousCover = await getDocumentCover(documentId, request);
  if (!optionalString(previousCover.token)) {
    return {
      documentId,
      deleted: false,
      alreadyEmpty: true,
    };
  }
  await request({
    method: "PATCH",
    path: `/docx/v1/documents/${segment(documentId)}`,
    body: { update_cover: { cover: null } },
  });
  return {
    documentId,
    deleted: true,
    alreadyEmpty: false,
    previousCover,
  };
}

async function uploadSlidesMedia(input: Record<string, unknown>, deps: FeishuDomainMediaRuntimeDeps) {
  const presentationId = await resolveSlidesPresentation(input, deps.request);
  const source = await downloadSource(input, deps.fetcher, singlePartMaxBytes, deps.signal);
  if (!source.mimeType.startsWith("image/")) {
    throw providerInputError("fileUrl must point to an image");
  }
  const uploaded = await uploadDriveMedia(
    source,
    {
      endpoint: "medias",
      parentType: "slide_file",
      parentNode: presentationId,
    },
    deps,
    false,
  );
  return {
    presentationId,
    fileToken: uploaded.fileToken,
    fileName: source.fileName,
    sizeBytes: feishuSourceSizeBytes(source),
  };
}

async function getSlidesScreenshots(input: Record<string, unknown>, deps: FeishuDomainMediaRuntimeDeps) {
  const presentationId = requireString(input.presentationToken, "presentationToken");
  const slideIds = optionalStringArray(input.slideIds);
  const slideNumbers = optionalNumberArray(input.slideNumbers);
  const count = (slideIds?.length ?? 0) + (slideNumbers?.length ?? 0);
  if (count < 1 || count > 10) {
    throw providerInputError("select between one and ten slides");
  }
  const data = await deps.request({
    method: "POST",
    path: `/slides_ai/v1/xml_presentations/${segment(presentationId)}/slide_images`,
    body: compactObject({
      slide_ids: slideIds,
      slide_numbers: slideNumbers,
    }),
  });
  const items = Array.isArray(data.slide_images) ? data.slide_images : [];
  if (items.length === 0) {
    throw providerResponseError("Feishu Slides screenshot response is missing slide_images");
  }
  const screenshots = [];
  for (const [index, item] of items.entries()) {
    screenshots.push(
      await storeScreenshot(
        requireObject(item, `slide_images[${index}]`),
        `${presentationId}-slide-${index + 1}`,
        deps,
      ),
    );
  }
  return { presentationId, screenshots };
}

async function renderSlideScreenshot(input: Record<string, unknown>, deps: FeishuDomainMediaRuntimeDeps) {
  const data = await deps.request({
    method: "POST",
    path: "/slides_ai/v1/slide_image/render",
    body: { content: requireString(input.content, "content") },
  });
  const item = requireObject(data.slide_image, "slide_image");
  return {
    screenshot: await storeScreenshot(item, optionalString(input.fileName) ?? "rendered-slide", deps),
  };
}

async function uploadTaskAttachment(input: Record<string, unknown>, deps: FeishuDomainMediaRuntimeDeps) {
  const source = await downloadSource(input, deps.fetcher, taskAttachmentMaxBytes, deps.signal);
  const body = new FormData();
  body.set("resource_type", optionalString(input.resourceType) ?? "task");
  body.set("resource_id", requireString(input.resourceId, "resourceId"));
  setFormFile(body, "file", source);
  const userIdType = optionalString(input.userIdType) ?? "open_id";
  const data = await requestFeishuMultipart({
    accessToken: deps.accessToken,
    fetcher: deps.fetcher,
    signal: deps.signal,
    path: `/task/v2/attachments/upload?user_id_type=${encodeURIComponent(userIdType)}`,
    body,
  });
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    attachment: optionalRecord(items[0]) ?? {},
  };
}

async function setSheetCellImage(input: Record<string, unknown>, deps: FeishuDomainMediaRuntimeDeps) {
  const spreadsheetToken = requireString(input.spreadsheetToken, "spreadsheetToken");
  const range = normalizeSingleCellRange(requireString(input.range, "range"));
  const selector = requireSheetSelector(input);
  const source = await downloadFeishuSource(
    {
      sourceUrl: requireString(input.imageUrl, "imageUrl"),
      kind: "image",
      fileName: optionalString(input.fileName),
      fieldName: "imageUrl",
      maxBytes: singlePartMaxBytes,
    },
    deps.fetcher,
    deps.signal,
  );
  const dimensions = readImageDimensions(requireInMemoryFeishuSource(source));
  if (!dimensions.width || !dimensions.height) {
    throw providerInputError("imageUrl must return an image with valid dimensions");
  }
  const uploaded = await uploadDriveMedia(
    source,
    {
      endpoint: "medias",
      parentType: sheetImageParentType(spreadsheetToken),
      parentNode: spreadsheetToken,
    },
    deps,
  );
  const toolInput = {
    excel_id: spreadsheetToken,
    ...selector.toolInput,
    range,
    cells: [
      [
        {
          rich_text: [
            {
              type: "embed-image",
              text: "",
              image_token: uploaded.fileToken,
              image_width: dimensions.width,
              image_height: dimensions.height,
            },
          ],
        },
      ],
    ],
    allow_overwrite: input.allowOverwrite !== false,
  };
  const data = await deps.request({
    method: "POST",
    path: `/sheet_ai/v2/spreadsheets/${segment(spreadsheetToken)}/tools/invoke_write`,
    body: {
      tool_name: "set_cell_range",
      input: JSON.stringify(toolInput),
    },
  });
  return {
    spreadsheetToken,
    sheetId: selector.sheetId,
    sheetName: selector.sheetName,
    range,
    fileToken: uploaded.fileToken,
    fileName: source.fileName,
    width: dimensions.width,
    height: dimensions.height,
    result: parseSheetToolOutput(data.output),
  };
}

async function uploadOkrImage(input: Record<string, unknown>, deps: FeishuDomainMediaRuntimeDeps) {
  const targetId = requireString(input.targetId, "targetId");
  if (!isPositiveIntegerString(targetId)) {
    throw providerInputError("targetId must be a positive int64 string");
  }
  const targetType = requireString(input.targetType, "targetType");
  const targetTypeValue = targetType === "objective" ? 2 : targetType === "key_result" ? 3 : 0;
  if (targetTypeValue === 0) {
    throw providerInputError("targetType must be objective or key_result");
  }
  const source = await downloadSource(input, deps.fetcher, okrImageMaxBytes, deps.signal);
  try {
    if (!["image/bmp", "image/gif", "image/jpeg", "image/png"].includes(source.mimeType)) {
      throw providerInputError("OKR images support BMP, GIF, JPEG, or PNG");
    }
    const body = new FormData();
    body.set("target_id", targetId);
    body.set("target_type", String(targetTypeValue));
    setFormFile(body, "data", source);
    const data = await requestFeishuMultipart({
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      signal: deps.signal,
      path: "/okr/v1/images/upload",
      body,
    });
    return {
      fileToken: requireResponseString(data.file_token, "file_token"),
      url: optionalString(data.url),
      fileName: source.fileName,
      sizeBytes: feishuSourceSizeBytes(source),
    };
  } finally {
    await source.cleanup?.();
  }
}

async function downloadMinutesMedia(input: Record<string, unknown>, deps: FeishuDomainMediaRuntimeDeps) {
  const minuteToken = requireString(input.minuteToken, "minuteToken");
  const data = await deps.request({
    path: `/minutes/v1/minutes/${segment(minuteToken)}/media`,
  });
  const downloadUrl = requireResponseString(data.download_url, "download_url");
  const transit = requireTransit(deps);
  const guardedFetcher = createProviderFetch({ fetch: deps.fetcher });
  const response = await guardedFetcher(downloadUrl);
  if (!response.ok) {
    throw providerResponseError(`Minutes download failed with status ${response.status}`);
  }
  const mimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "application/octet-stream";
  const name = safeFileName(
    optionalString(input.fileName) ??
      contentDispositionFileName(response.headers.get("content-disposition")) ??
      `${minuteToken}.media`,
    `${minuteToken}.media`,
  );
  const file = await uploadResponseToTransit(response, name, mimeType, transit);
  return { minuteToken, file };
}

async function uploadMinutesMedia(input: Record<string, unknown>, deps: FeishuDomainMediaRuntimeDeps) {
  const source = await downloadSource(input, deps.fetcher, minutesMediaMaxBytes, deps.signal);
  try {
    validateMinutesFileName(source.fileName);
    const uploaded = await uploadDriveMedia(
      source,
      {
        endpoint: "files",
        parentType: "explorer",
        parentNode: optionalString(input.folderToken) ?? "",
      },
      deps,
    );
    const data = await deps.request({
      method: "POST",
      path: "/minutes/v1/minutes/upload",
      body: { file_token: uploaded.fileToken },
    });
    const minuteUrl = requireResponseString(data.minute_url, "minute_url");
    return {
      minuteToken: minuteTokenFromUrl(minuteUrl),
      minuteUrl,
      fileToken: uploaded.fileToken,
      fileName: source.fileName,
      sizeBytes: feishuSourceSizeBytes(source),
    };
  } finally {
    await source.cleanup?.();
  }
}

async function downloadSource(
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  maxBytes: number,
  signal?: AbortSignal,
) {
  return downloadFeishuSource(
    {
      sourceUrl: requireString(input.fileUrl, "fileUrl"),
      kind: "file",
      fileName: optionalString(input.fileName),
      fieldName: "fileUrl",
      maxBytes,
    },
    fetcher,
    signal,
  );
}

async function uploadDriveMedia(
  source: DownloadedFeishuSource,
  target: UploadTarget,
  deps: FeishuDomainMediaRuntimeDeps,
  allowMultipart = true,
) {
  const sizeBytes = feishuSourceSizeBytes(source);
  if (sizeBytes <= singlePartMaxBytes) {
    const bytes = await readFeishuSourceBytes(source);
    const body = new FormData();
    body.set("file_name", source.fileName);
    body.set("parent_type", target.parentType);
    body.set("parent_node", target.parentNode);
    body.set("size", String(sizeBytes));
    if (target.extra) {
      body.set("extra", target.extra);
    }
    setFormFile(body, "file", { ...source, bytes });
    const data = await requestFeishuMultipart({
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      signal: deps.signal,
      path: `/drive/v1/${target.endpoint}/upload_all`,
      body,
    });
    return {
      fileToken: requireResponseString(data.file_token, "file_token"),
    };
  }
  if (!allowMultipart) {
    throw providerInputError("Slides media upload is limited to 20 MB");
  }
  const prepareData = await deps.request({
    method: "POST",
    path: `/drive/v1/${target.endpoint}/upload_prepare`,
    body: compactObject({
      file_name: source.fileName,
      parent_type: target.parentType,
      parent_node: target.parentNode,
      size: sizeBytes,
      extra: target.extra,
    }),
  });
  const session = readUploadSession(prepareData, sizeBytes);
  for (let seq = 0; seq < session.blockNum; seq += 1) {
    const offset = seq * session.blockSize;
    const chunk = await readFeishuSourceBytes(source, offset, Math.min(offset + session.blockSize, sizeBytes));
    const body = new FormData();
    body.set("upload_id", session.uploadId);
    body.set("seq", String(seq));
    body.set("size", String(chunk.byteLength));
    setFormFile(body, "file", {
      bytes: chunk,
      fileName: source.fileName,
      mimeType: "application/octet-stream",
    });
    await requestFeishuMultipart({
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      signal: deps.signal,
      path: `/drive/v1/${target.endpoint}/upload_part`,
      body,
    });
  }
  const finishData = await deps.request({
    method: "POST",
    path: `/drive/v1/${target.endpoint}/upload_finish`,
    body: {
      upload_id: session.uploadId,
      block_num: session.blockNum,
    },
  });
  return {
    fileToken: requireResponseString(finishData.file_token, "file_token"),
  };
}

function readUploadSession(data: Record<string, unknown>, sizeBytes: number): UploadSession {
  const uploadId = requireResponseString(data.upload_id, "upload_id");
  const blockSize = optionalNumber(data.block_size);
  const blockNum = optionalNumber(data.block_num);
  if (
    !blockSize ||
    !blockNum ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(blockNum) ||
    Math.ceil(sizeBytes / blockSize) !== blockNum
  ) {
    throw providerResponseError("Feishu upload_prepare returned an invalid block plan");
  }
  return { uploadId, blockSize, blockNum };
}

async function downloadFeishuRaw(
  input: {
    readonly path: string;
    readonly query?: Readonly<Record<string, string>>;
    readonly preferredName?: string;
    readonly fallbackName: string;
    readonly preferredMimeType?: string;
  },
  deps: FeishuDomainMediaRuntimeDeps,
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
      const mimeType =
        input.preferredMimeType ??
        response.headers.get("content-type")?.split(";", 1)[0]?.trim() ??
        "application/octet-stream";
      const name = safeFileName(
        input.preferredName ??
          contentDispositionFileName(response.headers.get("content-disposition")) ??
          input.fallbackName,
        input.fallbackName,
      );
      return uploadResponseToTransit(response, name, mimeType, transit);
    },
  );
}

async function uploadResponseToTransit(
  response: Response,
  name: string,
  mimeType: string,
  transitFiles: TransitFileWriter,
) {
  try {
    return await storeFeishuTransitResponse(response, name, mimeType, transitFiles);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw providerResponseError(error instanceof Error ? error.message : "Feishu file transit upload failed");
  }
}

async function storeScreenshot(
  item: Record<string, unknown>,
  fallbackName: string,
  deps: FeishuDomainMediaRuntimeDeps,
) {
  const transit = requireTransit(deps);
  const formatCode = optionalNumber(item.format);
  const format = formatCode === 1 ? "png" : formatCode === 2 ? "jpeg" : undefined;
  if (!format) {
    throw providerResponseError(`unsupported Slides screenshot format ${formatCode ?? "missing"}`);
  }
  const encoded = requireResponseString(item.data, "slide image data");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(Buffer.from(encoded, "base64"));
  } catch {
    throw providerResponseError("invalid Slides screenshot Base64 data");
  }
  const mimeType = format === "png" ? "image/png" : "image/jpeg";
  const slideId = optionalString(item.slide_id);
  const slideNumber = optionalNumber(item.slide_number);
  const name = ensureImageExtension(safeFileName(slideId ?? fallbackName, fallbackName), format);
  const uploaded = await storeFeishuTransitBytes(bytes, name, mimeType, transit);
  return {
    slideId,
    slideNumber,
    format,
    ...uploaded,
  };
}

async function resolveSlidesPresentation(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requireString(input.presentationToken, "presentationToken");
  if (optionalString(input.presentationType) !== "wiki") {
    return token;
  }
  const data = await request({
    path: "/wiki/v2/spaces/get_node",
    query: { token },
  });
  const node = optionalRecord(data.node);
  if (!node || optionalString(node.obj_type) !== "slides") {
    throw providerInputError("Wiki node does not resolve to a Slides presentation");
  }
  return requireResponseString(node.obj_token, "node.obj_token");
}

async function getDocumentCover(documentId: string, request: FeishuJsonRequest) {
  const data = await request({
    path: `/docx/v1/documents/${segment(documentId)}`,
  });
  const document = optionalRecord(data.document);
  return optionalRecord(document?.cover) ?? optionalRecord(data.cover) ?? {};
}

function createDocsMediaBlock(type: "image" | "file", index: number, fileView?: string) {
  if (type === "image") {
    return {
      children: [{ block_type: 27, image: {} }],
      index,
    };
  }
  const viewTypes: Record<string, number> = { card: 1, preview: 2, inline: 3 };
  const viewType = fileView ? viewTypes[fileView] : undefined;
  return {
    children: [
      {
        block_type: 23,
        file: compactObject({ view_type: viewType }),
      },
    ],
    index,
  };
}

function readCreatedDocsMediaTargets(data: Record<string, unknown>, mediaType: "image" | "file") {
  const children = Array.isArray(data.children) ? data.children : [];
  const child = optionalRecord(children[0]);
  const blockId = child ? optionalString(child.block_id) : undefined;
  if (!child || !blockId) {
    throw providerResponseError("Feishu create block response is missing block_id");
  }
  let nestedId: string | undefined;
  if (mediaType === "file" && Array.isArray(child.children)) {
    nestedId = optionalString(child.children[0]);
  }
  return {
    blockId,
    uploadParentNode: nestedId ?? blockId,
    replaceBlockId: nestedId ?? blockId,
  };
}

function bindDocsMediaBlock(
  blockId: string,
  mediaType: "image" | "file",
  fileToken: string,
  input: Record<string, unknown>,
) {
  if (mediaType === "file") {
    return {
      requests: [{ block_id: blockId, replace_file: { token: fileToken } }],
    };
  }
  const alignments: Record<string, number> = { left: 1, center: 2, right: 3 };
  const align = optionalString(input.align);
  const caption = optionalString(input.caption);
  const replaceImage = compactObject({
    token: fileToken,
    align: align ? alignments[align] : undefined,
    caption: caption ? { content: caption } : undefined,
    width: optionalNumber(input.width),
    height: optionalNumber(input.height),
  });
  return {
    requests: [{ block_id: blockId, replace_image: replaceImage }],
  };
}

function setFormFile(body: FormData, field: string, source: DownloadedFeishuSource) {
  const bytes = requireInMemoryFeishuSource(source);
  body.set(field, new Blob([bytes.slice().buffer], { type: source.mimeType }), source.fileName);
}

interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

function readImageDimensions(bytes: Uint8Array): ImageDimensions {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength >= 24 && view.getUint32(0) === 0x89504e47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.byteLength >= 10 && String.fromCharCode(...bytes.subarray(0, 3)) === "GIF") {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (bytes.byteLength >= 4 && view.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 9 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      }
      if (length < 2) break;
      offset += length + 2;
    }
  }
  throw providerInputError("imageUrl must return a supported PNG, GIF, or JPEG image");
}

function requireTransit(deps: FeishuDomainMediaRuntimeDeps): TransitFileWriter {
  if (!deps.transitFiles) {
    throw new ProviderRequestError(400, "local transit file storage is not configured");
  }
  return deps.transitFiles;
}

function requireMediaType(value: unknown): "image" | "file" {
  if (value === "image" || value === "file") {
    return value;
  }
  throw providerInputError("type must be image or file");
}

function requireSheetSelector(input: Record<string, unknown>) {
  const sheetId = optionalString(input.sheetId);
  const sheetName = optionalString(input.sheetName);
  if (Boolean(sheetId) === Boolean(sheetName)) {
    throw providerInputError("provide exactly one of sheetId or sheetName");
  }
  return {
    sheetId,
    sheetName,
    toolInput: sheetId ? { sheet_id: sheetId } : { sheet_name: sheetName },
  };
}

function normalizeSingleCellRange(value: string) {
  const parts = value.trim().toUpperCase().split(":");
  if (parts.length > 2 || !parts[0] || (parts.length === 2 && parts[0] !== parts[1])) {
    throw providerInputError("range must identify exactly one cell");
  }
  const cell = parts[0];
  let index = 0;
  while (index < cell.length && cell.charCodeAt(index) >= 65 && cell.charCodeAt(index) <= 90) {
    index += 1;
  }
  if (index === 0 || index === cell.length || cell[index] === "0") {
    throw providerInputError("range must use A1 notation");
  }
  for (; index < cell.length; index += 1) {
    const code = cell.charCodeAt(index);
    if (code < 48 || code > 57) {
      throw providerInputError("range must use A1 notation");
    }
  }
  return cell;
}

function sheetImageParentType(spreadsheetToken: string) {
  return spreadsheetToken.startsWith("fake_office_") || spreadsheetToken.startsWith("local_office_")
    ? "office_sheet_file"
    : "sheet_image";
}

function parseSheetToolOutput(value: unknown) {
  if (typeof value !== "string") {
    return optionalRecord(value) ?? {};
  }
  if (!value) {
    return {};
  }
  try {
    return optionalRecord(JSON.parse(value)) ?? {};
  } catch {
    throw providerResponseError("Feishu set_cell_range returned invalid JSON output");
  }
}

function validateMinutesFileName(value: string) {
  const extension = fileExtension(value);
  const allowed = new Set([
    "wav",
    "mp3",
    "m4a",
    "aac",
    "ogg",
    "wma",
    "amr",
    "avi",
    "wmv",
    "mov",
    "mp4",
    "m4v",
    "mpeg",
    "flv",
  ]);
  if (!extension || !allowed.has(extension)) {
    throw providerInputError("Minutes source file has an unsupported audio or video extension");
  }
}

function minuteTokenFromUrl(value: string) {
  try {
    const parts = new URL(value).pathname.split("/").filter(Boolean);
    const index = parts.indexOf("minutes");
    return index >= 0 ? parts[index + 1] : undefined;
  } catch {
    return undefined;
  }
}

function isPositiveIntegerString(value: string) {
  if (!value || value[0] === "0") {
    return false;
  }
  for (const character of value) {
    if (character < "0" || character > "9") {
      return false;
    }
  }
  return true;
}

function requireObject(value: unknown, fieldName: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw providerResponseError(`Feishu response is missing ${fieldName}`);
  }
  return object;
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

function requireResponseString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value) {
    throw providerResponseError(`Feishu response is missing ${fieldName}`);
  }
  return value;
}

function optionalStringArray(value: unknown) {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw providerInputError("slideIds must be a string array");
  }
  return Array.from(new Set(value.map((item) => requireString(item, "slideIds item"))));
}

function optionalNumberArray(value: unknown) {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw providerInputError("slideNumbers must be an integer array");
  }
  const numbers = value.map((item) => {
    const number = optionalNumber(item);
    if (!number || !Number.isInteger(number) || number < 1) {
      throw providerInputError("slideNumbers items must be positive integers");
    }
    return number;
  });
  return Array.from(new Set(numbers));
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
    const raw = stripQuotes(part.slice(separator + 1).trim());
    if (key === "filename*") {
      const marker = raw.indexOf("''");
      const encoded = marker >= 0 ? raw.slice(marker + 2) : raw;
      try {
        return decodeURIComponent(encoded);
      } catch {
        return encoded;
      }
    } else if (key === "filename") {
      fallback = raw;
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

function fileExtension(value: string) {
  const name = safeFileName(value, "");
  const index = name.lastIndexOf(".");
  return index > 0 && index < name.length - 1 ? name.slice(index + 1).toLowerCase() : undefined;
}

function ensureImageExtension(name: string, format: "png" | "jpeg") {
  const extension = fileExtension(name);
  if (extension === format || (format === "jpeg" && (extension === "jpg" || extension === "jpeg"))) {
    return name;
  }
  return `${name}.${format === "jpeg" ? "jpg" : "png"}`;
}

function segment(value: string) {
  return encodeURIComponent(value);
}
