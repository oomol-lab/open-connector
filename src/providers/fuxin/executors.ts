import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  TransitFileWriter,
} from "../../core/types.ts";
import type { FuxinActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { basename } from "node:path";
import { stringify as stringifyQuery } from "node:querystring";
import {
  compactObject,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalScalarString,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  defineProviderExecutors,
  normalizeProviderProxyEndpoint,
  normalizeProviderProxyHeaders,
  normalizeProviderProxyQuery,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "fuxin";
const fuxinApiBaseUrl = "https://servicesapi.foxitsoftware.cn/api/";
const fuxinMaxSourceBytes = 100 * 1024 * 1024;
const fuxinSourceDownloadTimeoutMs = 120_000;
const fuxinRequestTimeoutMs = 120_000;
const fuxinBinaryMimeTypeFallback = "application/octet-stream";

type FuxinRequestPhase = "validate" | "execute";
type FuxinQueryValue = string | number | boolean | undefined;
type FuxinActionHandler = (input: Record<string, unknown>, context: FuxinActionContext) => Promise<unknown>;

interface FuxinActionContext {
  clientId: string;
  secret: string;
  fetcher: typeof fetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

interface FuxinRequestInput {
  method: "GET" | "POST";
  path: string;
  clientId: string;
  secret: string;
  fetcher: typeof fetch;
  phase: FuxinRequestPhase;
  signParams?: Record<string, FuxinQueryValue>;
  queryParams?: Record<string, FuxinQueryValue>;
  formData?: FormData;
  signal?: AbortSignal;
}

interface FuxinResolvedSource {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

interface FuxinDocumentSourceInput {
  input: Record<string, unknown>;
  formData: FormData;
  signParams: Record<string, FuxinQueryValue>;
  context: FuxinActionContext;
  docIdField: string;
  fileField: string;
  binaryField: string;
  fallbackBaseName: string;
}

export const fuxinActionHandlers: Record<FuxinActionName, FuxinActionHandler> = {
  upload_file(input, context) {
    return fuxinUploadFile(input, context);
  },
  get_task(input, context) {
    return fuxinGetTask(input, context);
  },
  download_file(input, context) {
    return fuxinDownloadFile(input, context);
  },
  get_user_stock(_input, context) {
    return fuxinGetUserStock(context);
  },
  create_pdf_from_document(input, context) {
    return fuxinCreatePdfFromDocument(input, context);
  },
  create_pdf_from_html(input, context) {
    return fuxinCreatePdfFromHtml(input, context);
  },
  convert_document(input, context) {
    return fuxinConvertDocument(input, context);
  },
  compare_documents(input, context) {
    return fuxinCompareDocuments(input, context);
  },
  protect_document(input, context) {
    return fuxinProtectDocument(input, context);
  },
  manipulate_document_pages(input, context) {
    return fuxinManipulateDocumentPages(input, context);
  },
  merge_documents(input, context) {
    return fuxinMergeDocuments(input, context);
  },
  split_document(input, context) {
    return fuxinSplitDocument(input, context);
  },
  compress_document(input, context) {
    return fuxinCompressDocument(input, context);
  },
  remove_password_from_document(input, context) {
    return fuxinRemovePasswordFromDocument(input, context);
  },
  linearize_document(input, context) {
    return fuxinLinearizeDocument(input, context);
  },
  flatten_document(input, context) {
    return fuxinFlattenDocument(input, context);
  },
  extract_document(input, context) {
    return fuxinExtractDocument(input, context);
  },
  get_pages_basic_info(input, context) {
    return fuxinGetPagesBasicInfo(input, context);
  },
  check_pages_are_scanned(input, context) {
    return fuxinCheckPagesAreScanned(input, context);
  },
  ocr_document(input, context) {
    return fuxinOcrDocument(input, context);
  },
  convert_office_document_to_images(input, context) {
    return fuxinConvertOfficeDocumentToImages(input, context);
  },
  watermark_document(input, context) {
    return fuxinWatermarkDocument(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<FuxinActionContext>({
  service,
  handlers: fuxinActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FuxinActionContext> {
    const credential = await requireCustomCredential(context, service);
    const actionContext: FuxinActionContext = {
      clientId: requireFuxinField(credential.values.clientId, "clientId"),
      secret: requireFuxinField(credential.values.secret, "secret"),
      fetcher,
      signal: context.signal,
    };
    if (context.transitFiles) {
      actionContext.transitFiles = context.transitFiles;
    }
    return actionContext;
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireCustomCredential(context, service);
    const clientId = requireFuxinField(credential.values.clientId, "clientId");
    const secret = requireFuxinField(credential.values.secret, "secret");
    const endpoint = normalizeProviderProxyEndpoint(input.endpoint);
    const query = normalizeProviderProxyQuery(input.query);
    const bodyParams = readFuxinProxyParams(input.body);
    const sn = buildFuxinSn(
      {
        clientId,
        ...query,
        ...bodyParams,
      },
      secret,
    );
    const url = new URL(normalizeFuxinPath(endpoint), fuxinApiBaseUrl);
    appendFuxinQueryParam(url, "clientId", clientId);
    appendFuxinQueryParam(url, "sn", sn);
    for (const [key, value] of Object.entries(query)) {
      appendFuxinQueryParam(url, key, value);
    }

    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await providerFetch(url, init);
    if (!response.ok) {
      const payload = await readFuxinPayload(response);
      throw normalizeFuxinError(response, payload, "execute");
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Foxit Cloud API request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const context: FuxinActionContext = {
      clientId: requireFuxinField(input.values.clientId, "clientId"),
      secret: requireFuxinField(input.values.secret, "secret"),
      fetcher,
      signal,
    };
    const stock = await fuxinGetUserStock(context, "validate");

    return {
      profile: {
        accountId: context.clientId,
        displayName: `Foxit Cloud API - ${context.clientId}`,
      },
      grantedScopes: [],
      metadata: {
        clientId: context.clientId,
        validationEndpoint: "/user/stock",
        stock,
      },
    };
  },
};

async function fuxinUploadFile(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  const fileInput = requireInputObject(input.file, "file");
  const fileUrl = optionalString(fileInput.url);

  if (fileUrl) {
    const data = await fuxinRequestData({
      method: "POST",
      path: "/file/upload",
      clientId: context.clientId,
      secret: context.secret,
      fetcher: context.fetcher,
      phase: "execute",
      signParams: {
        fileUrl,
      },
      queryParams: {
        fileUrl,
      },
      formData: new FormData(),
      signal: context.signal,
    });

    return normalizeFuxinUploadResult(data);
  }

  const uploadSource = await resolveFuxinMultipartSource(fileInput, context, {
    fallbackBaseName: "foxit-upload",
  });
  const formData = new FormData();
  formData.set(
    "file",
    new File([toBlobPart(uploadSource.bytes)], uploadSource.fileName, { type: uploadSource.mimeType }),
  );

  const data = await fuxinRequestData({
    method: "POST",
    path: "/file/upload",
    clientId: context.clientId,
    secret: context.secret,
    fetcher: context.fetcher,
    phase: "execute",
    formData,
    signal: context.signal,
  });

  return normalizeFuxinUploadResult(data);
}

async function fuxinGetTask(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  const taskId = requireFuxinField(input.taskId, "taskId");
  const envelope = await fuxinRequestEnvelope({
    method: "GET",
    path: "/task",
    clientId: context.clientId,
    secret: context.secret,
    fetcher: context.fetcher,
    phase: "execute",
    signParams: {
      taskId,
    },
    queryParams: {
      taskId,
    },
    signal: context.signal,
  });

  const payload = optionalRecord(envelope.payload);
  const code = optionalInteger(payload?.code);
  if (!payload || code == null) {
    throw new ProviderRequestError(502, "malformed fuxin task response", envelope.payload);
  }
  if (envelope.response.ok && code === 0) {
    return normalizeFuxinTaskStatus(payload.data, null);
  }

  const detail = extractFuxinDetail(payload.data);
  if (detail?.toLowerCase().includes("task is running")) {
    return normalizeFuxinTaskStatus(null, detail);
  }

  throw normalizeFuxinError(envelope.response, envelope.payload, "execute");
}

async function fuxinDownloadFile(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(503, "Transit file storage is not enabled.");
  }

  const docId = requireFuxinField(input.docId, "docId");
  const fileName = optionalString(input.fileName);

  const response = await fuxinRequestBinary({
    method: "GET",
    path: "/download",
    clientId: context.clientId,
    secret: context.secret,
    fetcher: context.fetcher,
    phase: "execute",
    signParams: compactObject({
      docId,
      fileName,
    }),
    queryParams: compactObject({
      docId,
      fileName,
    }),
    signal: context.signal,
  });

  const bytes = await response.arrayBuffer();
  const mimeType = normalizeMimeType(response.headers.get("content-type")) ?? fuxinBinaryMimeTypeFallback;
  const resolvedFileName =
    fileName ??
    readDispositionFileName(response.headers.get("content-disposition")) ??
    buildDefaultFileName("foxit-download", mimeType);
  const upload = await context.transitFiles.create(new File([bytes], resolvedFileName, { type: mimeType }));

  return {
    file: {
      name: resolvedFileName,
      mimetype: mimeType,
      downloadUrl: upload.downloadUrl,
    },
    contentLength: bytes.byteLength,
  };
}

async function fuxinGetUserStock(
  context: Pick<FuxinActionContext, "clientId" | "secret" | "fetcher" | "signal">,
  phase: FuxinRequestPhase = "execute",
): Promise<unknown> {
  const data = await fuxinRequestData({
    method: "GET",
    path: "/user/stock",
    clientId: context.clientId,
    secret: context.secret,
    fetcher: context.fetcher,
    phase,
    signal: context.signal,
  });

  return normalizeFuxinUserStock(data);
}

async function fuxinCreatePdfFromDocument(
  input: Record<string, unknown>,
  context: FuxinActionContext,
): Promise<unknown> {
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = {
    format: requireFuxinField(input.inputFormat, "inputFormat"),
  };
  formData.set("format", String(signParams.format));

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "docId",
    fileField: "file",
    binaryField: "inputDocument",
    fallbackBaseName: "foxit-input",
  });

  return submitFuxinTask(context, "/document/create", signParams, formData);
}

async function fuxinCreatePdfFromHtml(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  const format = requireFuxinField(input.format, "format");
  const configString = stringifyJsonField(input.config);
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = {
    format,
  };
  formData.set("format", format);

  if (format === "url") {
    const url = requireFuxinField(input.url, "url");
    signParams.url = url;
    formData.set("url", url);
  } else {
    await appendFuxinDocumentSource({
      input,
      formData,
      signParams,
      context,
      docIdField: "docId",
      fileField: "file",
      binaryField: "inputDocument",
      fallbackBaseName: "foxit-html",
    });
  }

  if (configString) {
    signParams.config = configString;
    formData.set("config", configString);
  }

  return submitFuxinTask(context, "/document/createFromHtml", signParams, formData);
}

async function fuxinConvertDocument(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  const outputFormat = requireFuxinField(input.outputFormat, "outputFormat");
  const imageConfigString = stringifyJsonField(input.imageConfig);
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = {
    format: outputFormat,
  };
  formData.set("format", outputFormat);

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "docId",
    fileField: "file",
    binaryField: "inputDocument",
    fallbackBaseName: "foxit-pdf",
  });

  if (imageConfigString) {
    signParams.config = imageConfigString;
    formData.set("config", imageConfigString);
  }

  return submitFuxinTask(context, "/document/convert", signParams, formData);
}

async function fuxinCompareDocuments(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  const resultType = optionalString(input.resultType) ?? "json";
  const compareType = optionalString(input.compareType) ?? "all";
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = {
    resultType,
    compareType,
  };

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "baseDocId",
    fileField: "baseFile",
    binaryField: "inputBaseDocument",
    fallbackBaseName: "foxit-compare-base",
  });
  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "compareDocId",
    fileField: "compareFile",
    binaryField: "inputCompareDocument",
    fallbackBaseName: "foxit-compare-target",
  });

  formData.set("resultType", resultType);
  formData.set("compareType", compareType);

  return submitFuxinTask(context, "/document/compare", signParams, formData);
}

async function fuxinProtectDocument(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  const passwordProtectionString = stringifyJsonField(input.passwordProtection);
  if (!passwordProtectionString) {
    throw new ProviderRequestError(400, "passwordProtection is required");
  }
  const permissionString = stringifyStringArrayField(input.permission);
  const encryptionAlgorithm = requireFuxinField(input.encryptionAlgorithm, "encryptionAlgorithm");
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = compactObject({
    passwordProtection: passwordProtectionString,
    permission: permissionString,
    encryptionAlgorithm,
  });

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "docId",
    fileField: "file",
    binaryField: "inputDocument",
    fallbackBaseName: "foxit-pdf",
  });

  formData.set("passwordProtection", passwordProtectionString);
  if (permissionString) {
    formData.set("permission", permissionString);
  }
  formData.set("encryptionAlgorithm", encryptionAlgorithm);

  return submitFuxinTask(context, "/document/protect", signParams, formData);
}

async function fuxinManipulateDocumentPages(
  input: Record<string, unknown>,
  context: FuxinActionContext,
): Promise<unknown> {
  const configString = stringifyJsonArrayField(input.config);
  if (!configString) {
    throw new ProviderRequestError(400, "config is required");
  }
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = {
    config: configString,
  };

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "docId",
    fileField: "file",
    binaryField: "inputDocument",
    fallbackBaseName: "foxit-pdf",
  });

  formData.set("config", configString);

  return submitFuxinTask(context, "/document/manipulation", signParams, formData);
}

async function fuxinMergeDocuments(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  const docIds = Array.isArray(input.docIds) ? input.docIds.map((value) => requireFuxinField(value, "docIds")) : [];
  const configString = stringifyJsonField(input.config);
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = {};

  if (docIds.length > 0) {
    const docIdsString = JSON.stringify(docIds);
    signParams.docIds = docIdsString;
    formData.set("docIds", docIdsString);
  } else {
    const zipFile = requireInputObject(input.zipFile, "zipFile");
    const uploadSource = await resolveFuxinMultipartSource(zipFile, context, {
      fallbackBaseName: "foxit-merge",
      fallbackMimeType: "application/zip",
    });
    formData.set(
      "inputZipDocument",
      new File([toBlobPart(uploadSource.bytes)], uploadSource.fileName, { type: uploadSource.mimeType }),
    );
  }

  if (configString) {
    signParams.config = configString;
    formData.set("config", configString);
  }

  return submitFuxinTask(context, "/document/combine", signParams, formData);
}

async function fuxinSplitDocument(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  const configString = JSON.stringify({
    pageCount: requirePositiveInteger(input.pageCount, "pageCount"),
  });
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = {
    config: configString,
  };
  formData.set("config", configString);

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "docId",
    fileField: "file",
    binaryField: "inputDocument",
    fallbackBaseName: "foxit-pdf",
  });

  return submitFuxinTask(context, "/document/split", signParams, formData);
}

async function fuxinCompressDocument(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  const compressionLevel = requireFuxinField(input.compressionLevel, "compressionLevel");
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = {
    compressionLevel,
  };
  formData.set("compressionLevel", compressionLevel);

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "docId",
    fileField: "file",
    binaryField: "inputDocument",
    fallbackBaseName: "foxit-pdf",
  });

  return submitFuxinTask(context, "/document/compress", signParams, formData);
}

async function fuxinRemovePasswordFromDocument(
  input: Record<string, unknown>,
  context: FuxinActionContext,
): Promise<unknown> {
  const password = requireFuxinField(input.password, "password");
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = {
    password,
  };
  formData.set("password", password);

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "docId",
    fileField: "file",
    binaryField: "inputDocument",
    fallbackBaseName: "foxit-pdf",
  });

  return submitFuxinTask(context, "/document/removePassword", signParams, formData);
}

async function fuxinLinearizeDocument(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = {};

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "docId",
    fileField: "file",
    binaryField: "inputDocument",
    fallbackBaseName: "foxit-pdf",
  });

  return submitFuxinTask(context, "/document/linearize", signParams, formData);
}

async function fuxinFlattenDocument(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  const pageRange = optionalString(input.pageRange);
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = compactObject({
    pageRange,
  });

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "docId",
    fileField: "file",
    binaryField: "inputDocument",
    fallbackBaseName: "foxit-pdf",
  });

  if (pageRange) {
    formData.set("pageRange", pageRange);
  }

  return submitFuxinTask(context, "/document/flatten", signParams, formData);
}

async function fuxinExtractDocument(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  const mode = requireFuxinField(input.mode, "mode");
  const pageRange = optionalString(input.pageRange);
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = compactObject({
    mode,
    pageRange,
  });
  formData.set("mode", mode);
  if (pageRange) {
    formData.set("pageRange", pageRange);
  }

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "docId",
    fileField: "file",
    binaryField: "inputDocument",
    fallbackBaseName: "foxit-pdf",
  });

  return submitFuxinTask(context, "/document/extract", signParams, formData);
}

async function fuxinGetPagesBasicInfo(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  return fuxinSubmitPageInspectionTask(input, context, "/document/pagesBasicInfo");
}

async function fuxinCheckPagesAreScanned(
  input: Record<string, unknown>,
  context: FuxinActionContext,
): Promise<unknown> {
  return fuxinSubmitPageInspectionTask(input, context, "/document/pagesIsScanned");
}

async function fuxinSubmitPageInspectionTask(
  input: Record<string, unknown>,
  context: FuxinActionContext,
  path: "/document/pagesBasicInfo" | "/document/pagesIsScanned",
): Promise<unknown> {
  const pageRange = optionalString(input.pageRange);
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = compactObject({
    pageRange,
  });

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "docId",
    fileField: "file",
    binaryField: "inputDocument",
    fallbackBaseName: "foxit-pdf",
  });

  if (pageRange) {
    formData.set("pageRange", pageRange);
  }

  return submitFuxinTask(context, path, signParams, formData);
}

async function fuxinOcrDocument(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  const lang = optionalString(input.lang) ?? "eng";
  const outputFormat = optionalString(input.outputFormat) ?? "text";
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = {
    lang,
    outputFormat,
  };

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "docId",
    fileField: "file",
    binaryField: "inputDocument",
    fallbackBaseName: "foxit-ocr",
  });

  formData.set("lang", lang);
  formData.set("outputFormat", outputFormat);

  return submitFuxinTask(context, "/document/ocr", signParams, formData);
}

async function fuxinConvertOfficeDocumentToImages(
  input: Record<string, unknown>,
  context: FuxinActionContext,
): Promise<unknown> {
  const format = requireFuxinField(input.format, "format");
  const dpi = optionalInteger(input.dpi);
  const destImgSuffix = optionalString(input.destImgSuffix);
  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = compactObject({
    format,
    dpi,
    destImgSuffix,
  });

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "docId",
    fileField: "file",
    binaryField: "inputDocument",
    fallbackBaseName: "foxit-office",
  });

  formData.set("format", format);
  if (dpi !== undefined) {
    formData.set("dpi", String(dpi));
  }
  if (destImgSuffix) {
    formData.set("destImgSuffix", destImgSuffix);
  }

  return submitFuxinTask(context, "/document/office2image", signParams, formData);
}

async function fuxinWatermarkDocument(input: Record<string, unknown>, context: FuxinActionContext): Promise<unknown> {
  const type = optionalString(input.type) ?? "textObject";
  const scaleX = optionalNumber(input.scaleX) ?? 1;
  const scaleY = optionalNumber(input.scaleY) ?? 1;
  const position = optionalInteger(input.position);
  const offsetX = optionalNumber(input.offsetX);
  const offsetY = optionalNumber(input.offsetY);
  const flagOnTopOfPage = optionalInteger(input.flagOnTopOfPage);
  const flagNoPrint = optionalInteger(input.flagNoPrint);
  const flagInvisible = optionalInteger(input.flagInvisible);
  const rotation = optionalNumber(input.rotation);
  const opacity = optionalInteger(input.opacity);
  const pageRange = optionalString(input.pageRange);
  const fontString = stringifyJsonField(input.font);

  if (type === "textObject" && !fontString) {
    throw new ProviderRequestError(400, "font is required when type is textObject");
  }

  const formData = new FormData();
  const signParams: Record<string, FuxinQueryValue> = compactObject({
    pageRange,
    type,
    position,
    offsetX,
    offsetY,
    flagOnTopOfPage,
    flagNoPrint,
    flagInvisible,
    scaleX,
    scaleY,
    rotation,
    opacity,
    font: fontString,
  });

  await appendFuxinDocumentSource({
    input,
    formData,
    signParams,
    context,
    docIdField: "docId",
    fileField: "file",
    binaryField: "inputDocument",
    fallbackBaseName: "foxit-pdf",
  });

  if (pageRange) {
    formData.set("pageRange", pageRange);
  }
  formData.set("type", type);
  formData.set("scaleX", String(scaleX));
  formData.set("scaleY", String(scaleY));

  setOptionalFormDataNumber(formData, "position", position);
  setOptionalFormDataNumber(formData, "offsetX", offsetX);
  setOptionalFormDataNumber(formData, "offsetY", offsetY);
  setOptionalFormDataNumber(formData, "flagOnTopOfPage", flagOnTopOfPage);
  setOptionalFormDataNumber(formData, "flagNoPrint", flagNoPrint);
  setOptionalFormDataNumber(formData, "flagInvisible", flagInvisible);
  setOptionalFormDataNumber(formData, "rotation", rotation);
  setOptionalFormDataNumber(formData, "opacity", opacity);
  if (fontString) {
    formData.set("font", fontString);
  }

  const imageDocId = optionalString(input.imageDocId);
  if (imageDocId) {
    signParams.imageDocId = imageDocId;
    formData.set("imageDocId", imageDocId);
  } else if (type === "imageObject") {
    const imageFile = requireInputObject(input.imageFile, "imageFile");
    const uploadSource = await resolveFuxinMultipartSource(imageFile, context, {
      fallbackBaseName: "foxit-watermark",
    });
    formData.set(
      "watermarkImage",
      new File([toBlobPart(uploadSource.bytes)], uploadSource.fileName, { type: uploadSource.mimeType }),
    );
  }

  return submitFuxinTask(context, "/document/watermark", signParams, formData);
}

async function submitFuxinTask(
  context: FuxinActionContext,
  path: string,
  signParams: Record<string, FuxinQueryValue>,
  formData: FormData,
): Promise<unknown> {
  const data = await fuxinRequestData({
    method: "POST",
    path,
    clientId: context.clientId,
    secret: context.secret,
    fetcher: context.fetcher,
    phase: "execute",
    signParams,
    formData,
    signal: context.signal,
  });

  return normalizeFuxinTaskSubmission(data);
}

async function appendFuxinDocumentSource(input: FuxinDocumentSourceInput): Promise<void> {
  const docId = optionalString(input.input[input.docIdField]);
  if (docId) {
    input.signParams[input.docIdField] = docId;
    input.formData.set(input.docIdField, docId);
    return;
  }

  const fileInput = requireInputObject(input.input[input.fileField], input.fileField);
  const uploadSource = await resolveFuxinMultipartSource(fileInput, input.context, {
    fallbackBaseName: input.fallbackBaseName,
  });
  input.formData.set(
    input.binaryField,
    new File([toBlobPart(uploadSource.bytes)], uploadSource.fileName, { type: uploadSource.mimeType }),
  );
}

async function resolveFuxinMultipartSource(
  input: Record<string, unknown>,
  context: Pick<FuxinActionContext, "fetcher" | "signal">,
  options: {
    fallbackBaseName: string;
    fallbackMimeType?: string;
  },
): Promise<FuxinResolvedSource> {
  const fileUrl = optionalString(input.url);
  const contentBase64 = optionalString(input.contentBase64);
  const inputName = optionalString(input.name);
  const inputMimeType = normalizeMimeType(optionalString(input.mimetype));

  if (fileUrl && contentBase64) {
    throw new ProviderRequestError(400, "Provide file.url or file.contentBase64, not both");
  }
  if (!fileUrl && !contentBase64) {
    throw new ProviderRequestError(400, "file.url or file.contentBase64 is required");
  }

  if (fileUrl) {
    const url = assertPublicHttpUrl(fileUrl, {
      fieldName: "file.url",
      createError: (message) => new ProviderRequestError(400, message),
    });
    const timeoutSignal = AbortSignal.timeout(fuxinSourceDownloadTimeoutMs);
    const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;
    const response = await fetchFuxinSource(context.fetcher, url, signal, timeoutSignal);
    const contentLengthHeader = response.headers.get("content-length");
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
    if (contentLength != null && Number.isFinite(contentLength) && contentLength > fuxinMaxSourceBytes) {
      throw new ProviderRequestError(400, "source file exceeds the 100 MB Foxit limit");
    }
    const bytes = await readResponseBytesWithinLimit(
      response,
      fuxinMaxSourceBytes,
      "source file exceeds the 100 MB Foxit limit",
    );
    const responseMimeType =
      normalizeMimeType(response.headers.get("content-type")) ??
      inputMimeType ??
      options.fallbackMimeType ??
      fuxinBinaryMimeTypeFallback;

    return {
      bytes,
      fileName: resolveUploadFileName({
        providedName: inputName,
        sourceUrl: fileUrl,
        mimeType: responseMimeType,
        fallbackBaseName: options.fallbackBaseName,
      }),
      mimeType: responseMimeType,
    };
  }

  const bytes = decodeBase64File(contentBase64 ?? "", "file.contentBase64");
  if (bytes.byteLength > fuxinMaxSourceBytes) {
    throw new ProviderRequestError(400, "source file exceeds the 100 MB Foxit limit");
  }

  const mimeType = inputMimeType ?? options.fallbackMimeType ?? fuxinBinaryMimeTypeFallback;
  return {
    bytes,
    fileName: resolveUploadFileName({
      providedName: inputName,
      mimeType,
      fallbackBaseName: options.fallbackBaseName,
    }),
    mimeType,
  };
}

async function fetchFuxinSource(
  fetcher: typeof fetch,
  url: URL,
  signal: AbortSignal,
  timeoutSignal: AbortSignal,
): Promise<Response> {
  try {
    const response = await fetcher(url, {
      headers: {
        accept: "*/*",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status >= 500 ? 502 : response.status,
        `failed to fetch multipart source: ${response.status} ${response.statusText}`.trim(),
      );
    }
    return response;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new ProviderRequestError(504, "failed to fetch multipart source: request timed out", error);
    }
    const message = error instanceof Error ? error.message : "failed to fetch multipart source";
    throw new ProviderRequestError(502, message, error);
  }
}

async function fuxinRequestData(input: FuxinRequestInput): Promise<unknown> {
  const envelope = await fuxinRequestEnvelope(input);
  if (!envelope.response.ok) {
    throw normalizeFuxinError(envelope.response, envelope.payload, input.phase);
  }

  const payload = optionalRecord(envelope.payload);
  const code = optionalInteger(payload?.code);
  if (!payload || code == null) {
    throw new ProviderRequestError(502, "malformed fuxin response", envelope.payload);
  }
  if (code !== 0) {
    throw normalizeFuxinError(envelope.response, envelope.payload, input.phase);
  }

  return payload.data;
}

async function fuxinRequestBinary(input: FuxinRequestInput): Promise<Response> {
  const url = buildFuxinRequestUrl(input);
  const response = await sendFuxinRequest(url, input);
  if (!response.ok) {
    const payload = await readFuxinPayload(response);
    throw normalizeFuxinError(response, payload, input.phase);
  }

  return response;
}

async function fuxinRequestEnvelope(input: FuxinRequestInput): Promise<{ response: Response; payload: unknown }> {
  const url = buildFuxinRequestUrl(input);
  const response = await sendFuxinRequest(url, input);
  return {
    response,
    payload: await readFuxinPayload(response),
  };
}

function buildFuxinRequestUrl(input: FuxinRequestInput): URL {
  const sn = buildFuxinSn(
    compactObject({
      clientId: input.clientId,
      ...(input.signParams ?? {}),
    }),
    input.secret,
  );

  const url = new URL(normalizeFuxinPath(input.path), fuxinApiBaseUrl);
  appendFuxinQueryParam(url, "clientId", input.clientId);
  appendFuxinQueryParam(url, "sn", sn);
  for (const [key, value] of Object.entries(input.queryParams ?? {})) {
    appendFuxinQueryParam(url, key, value);
  }
  return url;
}

async function sendFuxinRequest(url: URL, input: FuxinRequestInput): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(fuxinRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
  try {
    return await input.fetcher(url, {
      method: input.method,
      headers: {
        "user-agent": providerUserAgent,
      },
      body: input.formData,
      signal,
    });
  } catch (error) {
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new ProviderRequestError(504, `fuxin ${input.path} request timed out`, error);
    }
    const message = error instanceof Error ? error.message : "fuxin request failed";
    throw new ProviderRequestError(502, message || "fuxin request failed", error);
  }
}

function normalizeFuxinUploadResult(data: unknown): unknown {
  const record = requireResponseObject(data, "data");
  const fileName = optionalString(record.filename) ?? optionalString(record.fileName);
  const docId = optionalString(record.docid) ?? optionalString(record.docId);
  const fileSize = optionalInteger(record.filesize) ?? optionalInteger(record.fileSize);

  if (!fileName || !docId || fileSize == null) {
    throw new ProviderRequestError(502, "malformed fuxin upload response", data);
  }

  return {
    fileName,
    docId,
    fileSize,
  };
}

function normalizeFuxinTaskSubmission(data: unknown): unknown {
  const record = requireResponseObject(data, "data");
  const taskInfo = optionalRecord(record.taskInfo);
  const detail = optionalRecord(record.detail);
  const taskId = optionalString(taskInfo?.taskId) ?? optionalString(taskInfo?.taskid);

  if (!taskId) {
    throw new ProviderRequestError(502, "malformed fuxin task submission response", data);
  }

  return {
    taskId,
    checkParams: Array.isArray(detail?.checkParams) ? detail.checkParams : null,
  };
}

function normalizeFuxinTaskStatus(data: unknown, runningDetail: string | null): unknown {
  const record = optionalRecord(data);
  const taskInfo = optionalRecord(record?.taskInfo);
  const pagesIsScannedResultRecord = optionalRecord(taskInfo?.pagesIsScannedResult);
  const pagesInfo = Array.isArray(taskInfo?.pagesInfo)
    ? taskInfo.pagesInfo.map((item) => normalizeFuxinPageInfo(item))
    : null;
  const percentage = optionalInteger(taskInfo?.percentage) ?? null;
  const detail = runningDetail ?? extractFuxinDetail(record) ?? null;

  return {
    docId: optionalString(taskInfo?.docId) ?? optionalString(taskInfo?.docid) ?? null,
    percentage,
    isRunning: runningDetail !== null || (percentage != null && percentage < 100),
    detail,
    pagesIsScannedResult: pagesIsScannedResultRecord
      ? Object.fromEntries(Object.entries(pagesIsScannedResultRecord).filter(([, value]) => typeof value === "boolean"))
      : null,
    pagesInfo,
  };
}

function normalizeFuxinPageInfo(value: unknown): unknown {
  const record = requireResponseObject(value, "pagesInfo[]");
  return {
    pageIndex: optionalInteger(record.pageIndex) ?? 0,
    rotation: optionalInteger(record.rotation) ?? null,
    width: optionalNumber(record.width) ?? null,
    height: optionalNumber(record.height) ?? null,
  };
}

function normalizeFuxinUserStock(data: unknown): unknown {
  const record = requireResponseObject(data, "data");
  return {
    serviceApiStock: normalizeFuxinStock(record.serviceApiStock),
    embedApiStock: normalizeFuxinStock(record.embedApiStock),
  };
}

function normalizeFuxinStock(value: unknown): unknown {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }

  return {
    totalNum: optionalInteger(record.totalNum) ?? null,
    usedNum: optionalInteger(record.usedNum) ?? null,
    remainNum: optionalInteger(record.remainNum) ?? null,
    expireTime: optionalInteger(record.expireTime) ?? null,
    type: optionalInteger(record.type) ?? null,
  };
}

function buildFuxinSn(input: Record<string, FuxinQueryValue>, secret: string): string {
  const sortedEntries = Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  const canonical = stringifyQuery(Object.fromEntries(sortedEntries)).split("%20").join("+");
  return createHash("md5").update(`${canonical}&sk=${secret}`).digest("hex");
}

function readFuxinProxyParams(input: unknown): Record<string, string> {
  const record = optionalRecord(input);
  if (!record) {
    return {};
  }

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    const resolved = optionalScalarString(value);
    if (resolved !== undefined) {
      output[key] = resolved;
    }
  }
  return output;
}

function appendFuxinQueryParam(url: URL, key: string, value: FuxinQueryValue): void {
  if (value !== undefined) {
    url.searchParams.set(key, String(value));
  }
}

function normalizeFuxinPath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

async function readFuxinPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      msg: text,
    };
  }
}

function normalizeFuxinError(response: Response, payload: unknown, phase: FuxinRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const code = optionalInteger(record?.code);
  const message =
    (optionalString(record?.msg) ?? extractFuxinDetail(record?.data) ?? response.statusText) || "fuxin request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (code === 600020 || response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (code === 600000 || code === 600001 || response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function extractFuxinDetail(value: unknown): string | null {
  const record = optionalRecord(value);
  if (record && typeof record.detail === "string") {
    return record.detail;
  }
  return typeof value === "string" ? value : null;
}

function stringifyJsonField(value: unknown): string | undefined {
  const record = optionalRecord(value);
  return record ? JSON.stringify(record) : undefined;
}

function stringifyJsonArrayField(value: unknown): string | undefined {
  return Array.isArray(value) ? JSON.stringify(value) : undefined;
}

function stringifyStringArrayField(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return JSON.stringify(value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item)));
}

async function readResponseBytesWithinLimit(
  response: Response,
  maxBytes: number,
  errorMessage: string,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new ProviderRequestError(400, errorMessage);
    }
    return bytes;
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }
    totalBytes += chunk.value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel(errorMessage);
      throw new ProviderRequestError(400, errorMessage);
    }
    chunks.push(chunk.value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

function decodeBase64File(value: string, fieldName: string): Uint8Array {
  if (!value) {
    throw new ProviderRequestError(400, `${fieldName} must not be empty`);
  }

  try {
    const buffer = Buffer.from(value, "base64");
    if (buffer.byteLength === 0) {
      throw new Error("empty");
    }
    if (trimBase64Padding(buffer.toString("base64")) !== trimBase64Padding(value)) {
      throw new Error("mismatch");
    }
    return Uint8Array.from(buffer);
  } catch {
    throw new ProviderRequestError(400, `${fieldName} must be valid base64`);
  }
}

function trimBase64Padding(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "=") {
    end -= 1;
  }
  return value.slice(0, end);
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function requireFuxinField(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed == null || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function requireInputObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return record;
}

function requireResponseObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `malformed fuxin response: ${fieldName}`, value);
  }
  return record;
}

function normalizeMimeType(value: string | null | undefined): string | undefined {
  const normalized = value?.split(";")[0]?.trim();
  return normalized || undefined;
}

function resolveUploadFileName(input: {
  providedName?: string;
  sourceUrl?: string;
  mimeType: string;
  fallbackBaseName: string;
}): string {
  if (input.providedName) {
    return input.providedName;
  }

  if (input.sourceUrl) {
    try {
      const candidate = basename(new URL(input.sourceUrl).pathname);
      if (candidate && candidate !== "/") {
        return candidate;
      }
    } catch {}
  }

  return buildDefaultFileName(input.fallbackBaseName, input.mimeType);
}

function buildDefaultFileName(baseName: string, mimeType: string): string {
  const suffix = mimeTypeToSuffix(mimeType);
  return suffix ? `${baseName}.${suffix}` : baseName;
}

function mimeTypeToSuffix(mimeType: string): string | null {
  const normalized = normalizeMimeType(mimeType);
  if (!normalized) {
    return null;
  }
  const subtype = normalized.split("/")[1];
  if (!subtype) {
    return null;
  }
  return (
    subtype
      .split("+")[0]
      ?.replace(/[^a-z0-9]/gi, "")
      .toLowerCase() || null
  );
}

function readDispositionFileName(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1] ?? "");
    } catch {}
  }

  const quoted = /filename="([^"]+)"/i.exec(value);
  if (quoted?.[1]) {
    return quoted[1];
  }

  const bare = /filename=([^;]+)/i.exec(value);
  return bare?.[1]?.trim();
}

function setOptionalFormDataNumber(formData: FormData, key: string, value: number | undefined): void {
  if (value !== undefined) {
    formData.set(key, String(value));
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
