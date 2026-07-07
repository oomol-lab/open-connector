import type { OAuthProviderContext } from "../provider-runtime.ts";
import type { TencentDocsActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const tencentDocsUserInfoUrl = "https://docs.qq.com/oauth/v2/userinfo";
export const tencentDocsApiBaseUrl: string = "https://docs.qq.com";

interface TencentDocsActionContext extends Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal"> {
  clientId: string;
  openID: string;
}

type TencentDocsEnvelope = {
  ret?: unknown;
  msg?: unknown;
  data?: unknown;
};

type TencentDocsActionHandler = (input: Record<string, unknown>, context: TencentDocsActionContext) => Promise<unknown>;

export const tencentDocsActionHandlers: Record<TencentDocsActionName, TencentDocsActionHandler> = {
  get_current_user(_input, { accessToken, fetcher }) {
    return tencentDocsGetCurrentUser(accessToken, fetcher);
  },
  create_file(input, context) {
    return tencentDocsCreateFile(input, context);
  },
  get_file_metadata(input, context) {
    return tencentDocsGetFileMetadata(input, context);
  },
  rename_file(input, context) {
    return tencentDocsRenameFile(input, context);
  },
  list_folder(input, context) {
    return tencentDocsListFolder(input, context);
  },
  search_files(input, context) {
    return tencentDocsSearchFiles(input, context);
  },
  start_export(input, context) {
    return tencentDocsStartExport(input, context);
  },
  get_export_progress(input, context) {
    return tencentDocsGetExportProgress(input, context);
  },
  convert_file_id(input, context) {
    return tencentDocsConvertFileId(input, context);
  },
  get_sheet_range(input, context) {
    return tencentDocsGetSheetRange(input, context);
  },
  batch_update_sheet(input, context) {
    return tencentDocsBatchUpdateSheet(input, context);
  },
  get_doc_content(input, context) {
    return tencentDocsGetDocContent(input, context);
  },
  batch_update_doc(input, context) {
    return tencentDocsBatchUpdateDoc(input, context);
  },
  list_smartsheet_sheets(input, context) {
    return tencentDocsListSmartsheetSheets(input, context);
  },
  update_form_collection_deadline(input, context) {
    return tencentDocsUpdateFormCollectionDeadline(input, context);
  },
  generate_form_result(input, context) {
    return tencentDocsGenerateFormResult(input, context);
  },
};

async function tencentDocsGetCurrentUser(accessToken: string, fetcher: typeof fetch) {
  const user = await fetchTencentDocsUser(accessToken, fetcher);
  return {
    ret: 0,
    msg: "Succeed",
    user: normalizeTencentDocsUser(user),
  };
}

async function fetchTencentDocsUser(accessToken: string, fetcher: typeof fetch) {
  const url = new URL(tencentDocsUserInfoUrl);
  url.searchParams.set("access_token", accessToken);
  const envelope = await requestTencentDocsOAuthEnvelope(url, fetcher);
  return requireRecord(envelope.data, "tencent_docs userinfo response data");
}

async function tencentDocsCreateFile(input: Record<string, unknown>, context: TencentDocsActionContext) {
  const envelope = await requestTencentDocsOpenApi(
    {
      path: "/openapi/drive/v2/files",
      method: "POST",
      form: compactObject({
        title: String(input.title),
        type: String(input.type),
        templateID: optionalString(input.templateID),
        templateVersion: optionalString(input.templateVersion),
        folderID: optionalString(input.folderID),
        ext: optionalString(input.ext),
      }),
    },
    context,
  );
  return {
    ret: normalizeTencentDocsRet(envelope.ret),
    msg: normalizeTencentDocsMsg(envelope.msg),
    file: normalizeTencentDocsFile(requireRecord(envelope.data, "tencent_docs create_file data")),
  };
}

async function tencentDocsGetFileMetadata(input: Record<string, unknown>, context: TencentDocsActionContext) {
  const envelope = await requestTencentDocsOpenApi(
    {
      path: `/openapi/drive/v2/files/${encodeURIComponent(String(input.fileID))}/metadata`,
      method: "GET",
    },
    context,
  );
  return {
    ret: normalizeTencentDocsRet(envelope.ret),
    msg: normalizeTencentDocsMsg(envelope.msg),
    file: normalizeTencentDocsFile(requireRecord(envelope.data, "tencent_docs file metadata data")),
  };
}

async function tencentDocsRenameFile(input: Record<string, unknown>, context: TencentDocsActionContext) {
  const envelope = await requestTencentDocsOpenApi(
    {
      path: `/openapi/drive/v2/files/${encodeURIComponent(String(input.fileID))}`,
      method: "PATCH",
      form: {
        title: String(input.title),
      },
    },
    context,
  );
  return {
    ret: normalizeTencentDocsRet(envelope.ret),
    msg: normalizeTencentDocsMsg(envelope.msg),
  };
}

async function tencentDocsListFolder(input: Record<string, unknown>, context: TencentDocsActionContext) {
  const folderID = optionalString(input.folderID);
  const envelope = await requestTencentDocsOpenApi(
    {
      path: `/openapi/drive/v2/folders${folderID ? `/${encodeURIComponent(folderID)}` : ""}`,
      method: "GET",
      query: compactObject({
        sortType: optionalString(input.sortType),
        asc: optionalInteger(input.asc),
        start: optionalInteger(input.start),
        limit: optionalInteger(input.limit),
      }),
    },
    context,
  );
  const data = requireRecord(envelope.data, "tencent_docs list_folder data");
  return {
    ret: normalizeTencentDocsRet(envelope.ret),
    msg: normalizeTencentDocsMsg(envelope.msg),
    next: normalizeNullableInteger(data.next),
    items: normalizeTencentDocsFileList(data.list),
    raw: data,
  };
}

async function tencentDocsSearchFiles(input: Record<string, unknown>, context: TencentDocsActionContext) {
  const envelope = await requestTencentDocsOpenApi(
    {
      path: "/openapi/drive/v2/search",
      method: "GET",
      query: compactObject({
        searchKey: String(input.searchKey),
        searchType: String(input.searchType),
        resultType: optionalString(input.resultType),
        folderID: optionalString(input.folderID),
        offset: optionalInteger(input.offset),
        size: optionalInteger(input.size),
        sortType: optionalString(input.sortType),
        asc: optionalInteger(input.asc),
        byOwnership: optionalInteger(input.byOwnership),
        fileTypes: optionalString(input.fileTypes),
      }),
    },
    context,
  );
  const data = requireRecord(envelope.data, "tencent_docs search_files data");
  return {
    ret: normalizeTencentDocsRet(envelope.ret),
    msg: normalizeTencentDocsMsg(envelope.msg),
    next: normalizeNullableInteger(data.next),
    total: normalizeNullableInteger(data.total),
    hasMore: normalizeNullableBoolean(data.hasMore),
    items: normalizeTencentDocsFileList(data.list),
    raw: data,
  };
}

async function tencentDocsStartExport(input: Record<string, unknown>, context: TencentDocsActionContext) {
  const fileID = String(input.fileID);
  const envelope = await requestTencentDocsOpenApi(
    {
      path: `/openapi/drive/v2/files/${encodeURIComponent(fileID)}/async-export`,
      method: "POST",
      form: compactObject({
        exportType: optionalString(input.exportType),
      }),
    },
    context,
  );
  const data = requireRecord(envelope.data, "tencent_docs start_export data");
  const operationID = requireString(data.operationID, "tencent_docs export response missing operationID");
  return {
    ret: normalizeTencentDocsRet(envelope.ret),
    msg: normalizeTencentDocsMsg(envelope.msg),
    fileID,
    operationID,
    exportHandle: createTencentDocsExportHandle(fileID, operationID),
  };
}

async function tencentDocsGetExportProgress(input: Record<string, unknown>, context: TencentDocsActionContext) {
  const exportInput = resolveTencentDocsExportProgressInput(input);
  const envelope = await requestTencentDocsOpenApi(
    {
      path: `/openapi/drive/v2/files/${encodeURIComponent(exportInput.fileID)}/export-progress`,
      method: "GET",
      query: {
        operationID: exportInput.operationID,
      },
    },
    context,
  );
  const data = requireRecord(envelope.data, "tencent_docs export_progress data");
  const progress = normalizeRequiredInteger(data.progress, "tencent_docs export progress");
  return {
    ret: normalizeTencentDocsRet(envelope.ret),
    msg: normalizeTencentDocsMsg(envelope.msg),
    status: progress >= 100 ? "succeeded" : "running",
    progress,
    url: optionalString(data.url) ?? null,
    raw: data,
  };
}

async function tencentDocsConvertFileId(input: Record<string, unknown>, context: TencentDocsActionContext) {
  const envelope = await requestTencentDocsOpenApi(
    {
      path: "/openapi/drive/v2/util/converter",
      method: "GET",
      query: {
        type: optionalInteger(input.type) ?? 0,
        value: String(input.value),
      },
    },
    context,
  );
  const data = requireRecord(envelope.data, "tencent_docs convert_file_id data");
  return {
    ret: normalizeTencentDocsRet(envelope.ret),
    msg: normalizeTencentDocsMsg(envelope.msg),
    fileID: optionalString(data.fileID) ?? null,
    encodedID: optionalString(data.encodedID) ?? null,
    raw: data,
  };
}

async function tencentDocsGetSheetRange(input: Record<string, unknown>, context: TencentDocsActionContext) {
  const envelope = await requestTencentDocsOpenApi(
    {
      path: `/openapi/spreadsheet/v3/files/${encodeURIComponent(
        String(input.fileID),
      )}/${encodeURIComponent(String(input.sheetID))}/${encodeURIComponent(String(input.range))}`,
      method: "GET",
    },
    context,
  );
  const data = requireRecord(envelope.data ?? envelope, "tencent_docs get_sheet_range data");
  const envelopeRecord = optionalRecord(envelope);
  const gridData = requireRecord(data.gridData, "tencent_docs get_sheet_range gridData");
  return {
    ret: normalizeTencentDocsRet(envelope.ret ?? data.code),
    msg: normalizeTencentDocsMsg(envelope.msg ?? envelopeRecord?.message ?? data.message),
    gridData,
    raw: data,
  };
}

async function tencentDocsBatchUpdateSheet(input: Record<string, unknown>, context: TencentDocsActionContext) {
  const envelope = await requestTencentDocsOpenApi(
    {
      path: `/openapi/spreadsheet/v3/files/${encodeURIComponent(String(input.fileID))}/batchUpdate`,
      method: "POST",
      json: {
        requests: input.requests,
      },
    },
    context,
  );
  const raw = requireRecord(envelope.data ?? envelope, "tencent_docs batch_update_sheet data");
  const envelopeRecord = optionalRecord(envelope);
  return {
    ret: normalizeTencentDocsRet(envelope.ret ?? raw.code),
    msg: normalizeTencentDocsMsg(envelope.msg ?? envelopeRecord?.message ?? raw.message),
    responses: normalizeRecordArray(raw.responses),
    raw,
  };
}

async function tencentDocsGetDocContent(input: Record<string, unknown>, context: TencentDocsActionContext) {
  const envelope = await requestTencentDocsOpenApi(
    {
      path: `/openapi/doc/v3/${encodeURIComponent(String(input.fileID))}`,
      method: "GET",
    },
    context,
  );
  const data = requireRecord(envelope.data ?? envelope, "tencent_docs get_doc_content data");
  const envelopeRecord = optionalRecord(envelope);
  return {
    ret: normalizeTencentDocsRet(envelope.ret ?? data.code),
    msg: normalizeTencentDocsMsg(envelope.msg ?? envelopeRecord?.message ?? data.message),
    document: requireRecord(data.document, "tencent_docs get_doc_content document"),
    version: normalizeRequiredInteger(data.version, "tencent_docs document version"),
    raw: data,
  };
}

async function tencentDocsBatchUpdateDoc(input: Record<string, unknown>, context: TencentDocsActionContext) {
  const body = compactObject({
    requests: input.requests,
    version: optionalInteger(input.version),
  });
  const envelope = await requestTencentDocsOpenApi(
    {
      path: `/openapi/doc/v3/${encodeURIComponent(String(input.fileID))}:batchUpdate`,
      method: "POST",
      json: body,
    },
    context,
  );
  const raw = optionalRecord(envelope.data) ?? requireRecord(envelope, "tencent_docs batch_update_doc data");
  const envelopeRecord = optionalRecord(envelope);
  return {
    ret: normalizeTencentDocsRet(envelope.ret ?? raw.code),
    msg: normalizeTencentDocsMsg(envelope.msg ?? envelopeRecord?.message ?? raw.message),
    raw,
  };
}

async function tencentDocsListSmartsheetSheets(input: Record<string, unknown>, context: TencentDocsActionContext) {
  const envelope = await requestTencentDocsOpenApi(
    {
      path: `/openapi/smartbook/v2/files/${encodeURIComponent(String(input.fileID))}/sheets`,
      method: "GET",
    },
    context,
  );
  const data = requireRecord(envelope.data, "tencent_docs list_smartsheet_sheets data");
  return {
    ret: normalizeTencentDocsRet(envelope.ret),
    msg: normalizeTencentDocsMsg(envelope.msg),
    sheets: normalizeTencentDocsSmartsheetSheets(data.getSheet),
    raw: data,
  };
}

async function tencentDocsUpdateFormCollectionDeadline(
  input: Record<string, unknown>,
  context: TencentDocsActionContext,
) {
  const envelope = await requestTencentDocsOpenApi(
    {
      path: `/openapi/drive/v2/forms/${encodeURIComponent(String(input.formID))}/release`,
      method: "PUT",
      form: compactObject({
        endTime: input.endTime === undefined ? undefined : String(optionalInteger(input.endTime) ?? 0),
      }),
    },
    context,
  );
  return {
    ret: normalizeTencentDocsRet(envelope.ret),
    msg: normalizeTencentDocsMsg(envelope.msg),
  };
}

async function tencentDocsGenerateFormResult(input: Record<string, unknown>, context: TencentDocsActionContext) {
  const envelope = await requestTencentDocsOpenApi(
    {
      path: `/openapi/drive/v2/forms/${encodeURIComponent(String(input.formID))}/result`,
      method: "POST",
      form: {},
    },
    context,
  );
  return {
    ret: normalizeTencentDocsRet(envelope.ret),
    msg: normalizeTencentDocsMsg(envelope.msg),
    file: normalizeTencentDocsFile(requireRecord(envelope.data, "tencent_docs generate_form_result data")),
  };
}

async function requestTencentDocsOpenApi(
  input: {
    path: string;
    method: "GET" | "POST" | "PATCH" | "PUT";
    query?: Record<string, string | number | undefined>;
    form?: Record<string, string | undefined>;
    json?: Record<string, unknown>;
  },
  context: TencentDocsActionContext,
) {
  const url = new URL(input.path, tencentDocsApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    accept: "application/json",
    "Access-Token": context.accessToken,
    "Client-Id": context.clientId,
    "Open-Id": context.openID,
  });

  let body: BodyInit | undefined;
  if (input.form) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
    body = new URLSearchParams();
    for (const [key, value] of Object.entries(input.form)) {
      if (value !== undefined) {
        body.set(key, value);
      }
    }
  } else if (input.json) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(input.json);
  }

  const response = await context.fetcher(url.toString(), {
    method: input.method,
    headers,
    ...(body ? { body } : {}),
  });
  const envelope = await parseTencentDocsJson<TencentDocsEnvelope>(response, "openapi");
  assertTencentDocsEnvelopeSuccess(envelope, response.status);
  return envelope;
}

async function requestTencentDocsOAuthEnvelope(url: URL, fetcher: typeof fetch) {
  const response = await fetcher(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });
  const envelope = await parseTencentDocsJson<TencentDocsEnvelope>(response, "oauth");
  assertTencentDocsEnvelopeSuccess(envelope, response.status);
  return envelope;
}

async function parseTencentDocsJson<T>(response: Response, context: string) {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw mapTencentDocsHttpError(response.status, `tencent_docs ${context} returned invalid JSON`);
  }

  if (!response.ok) {
    throw mapTencentDocsHttpError(response.status, extractTencentDocsErrorMessage(payload));
  }

  return payload as T;
}

function assertTencentDocsEnvelopeSuccess(envelope: TencentDocsEnvelope, status: number) {
  const envelopeRecord = optionalRecord(envelope);
  if (
    envelopeRecord &&
    envelopeRecord.ret === undefined &&
    envelopeRecord.code === undefined &&
    envelopeRecord.msg === undefined &&
    envelopeRecord.message === undefined
  ) {
    return;
  }

  const ret = normalizeTencentDocsRet(envelope.ret ?? envelopeRecord?.code);
  if (ret === 0) {
    return;
  }

  const message =
    normalizeTencentDocsMsg(envelope.msg ?? envelopeRecord?.message) || `tencent_docs API returned ret ${ret}`;
  throw mapTencentDocsBusinessError(ret, message, status);
}

function mapTencentDocsBusinessError(ret: number, message: string, status: number) {
  if (ret === 37019 || ret === 10313 || ret === 10303 || ret === 10302) {
    return new ProviderRequestError(401, message);
  }
  if (ret === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function mapTencentDocsHttpError(status: number, message: string) {
  if (status === 400) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function extractTencentDocsErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  return (
    optionalString(record?.message) ??
    optionalString(record?.msg) ??
    optionalString(record?.error_description) ??
    optionalString(record?.error) ??
    "tencent_docs request failed"
  );
}

function normalizeTencentDocsUser(input: Record<string, unknown>) {
  return {
    openID: requireString(input.openID, "tencent docs user missing openID"),
    nick: optionalString(input.nick) ?? null,
    avatar: optionalString(input.avatar) ?? null,
    source: optionalString(input.source) ?? null,
    bindSource: optionalString(input.bindSource) ?? null,
    unionID: optionalString(input.unionID) ?? null,
    raw: input,
  };
}

function normalizeTencentDocsFile(input: Record<string, unknown>) {
  return {
    ID: requireString(input.ID, "tencent_docs file missing ID"),
    title: optionalString(input.title) ?? null,
    type: optionalString(input.type) ?? null,
    url: optionalString(input.url) ?? null,
    status: optionalString(input.status) ?? null,
    isCreator: normalizeNullableBoolean(input.isCreator),
    isOwner: normalizeNullableBoolean(input.isOwner),
    createTime: normalizeNullableInteger(input.createTime),
    creatorName: optionalString(input.creatorName) ?? null,
    ownerName: optionalString(input.ownerName) ?? null,
    ownerID: optionalString(input.ownerID) ?? null,
    lastModifyTime: normalizeNullableInteger(input.lastModifyTime),
    lastModifyName: optionalString(input.lastModifyName) ?? null,
    lastBrowseTime: normalizeNullableInteger(input.lastBrowseTime),
    starred: normalizeNullableBoolean(input.starred),
    pinned: normalizeNullableBoolean(input.pinned),
    fileSource: optionalString(input.fileSource) ?? null,
    highlight: optionalString(input.highlight) ?? null,
    raw: input,
  };
}

function normalizeTencentDocsFileList(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "tencent_docs response missing list array");
  }

  return value.map((item) => normalizeTencentDocsFile(requireRecord(item, "tencent_docs list item")));
}

function normalizeRecordArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => requireRecord(item, "tencent_docs response array item"));
}

function normalizeTencentDocsSmartsheetSheets(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "tencent_docs response missing getSheet array");
  }

  return value.map((item) => {
    const sheet = requireRecord(item, "tencent_docs smartsheet sheet item");
    return {
      sheetID: requireString(sheet.sheetID, "tencent_docs smartsheet sheet missing sheetID"),
      title: optionalString(sheet.title) ?? null,
      isVisible: normalizeNullableBoolean(sheet.isVisible ?? sheet.isVibile),
      rowCount: normalizeNullableInteger(sheet.rowCount),
      columnCount: normalizeNullableInteger(sheet.columnCount),
      raw: sheet,
    };
  });
}

function createTencentDocsExportHandle(fileID: string, operationID: string) {
  return JSON.stringify({ fileID, operationID });
}

function resolveTencentDocsExportProgressInput(input: Record<string, unknown>) {
  const exportHandle = optionalString(input.exportHandle);
  if (exportHandle) {
    return parseTencentDocsExportHandle(exportHandle);
  }

  return {
    fileID: requireActionInputString(input.fileID, "fileID"),
    operationID: requireActionInputString(input.operationID, "operationID"),
  };
}

function parseTencentDocsExportHandle(exportHandle: string) {
  let payload: unknown;
  try {
    payload = JSON.parse(exportHandle);
  } catch {
    throw new ProviderRequestError(400, "tencent_docs exportHandle must be returned by start_export");
  }

  const record = optionalRecord(payload);
  const fileID = optionalString(record?.fileID);
  const operationID = optionalString(record?.operationID);
  if (!fileID || !operationID) {
    throw new ProviderRequestError(400, "tencent_docs exportHandle must include fileID and operationID");
  }

  return { fileID, operationID };
}

function normalizeTencentDocsRet(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

function normalizeTencentDocsMsg(value: unknown) {
  return optionalString(value) ?? "";
}

function normalizeRequiredInteger(value: unknown, fieldName: string) {
  const parsed = typeof value === "number" || (typeof value === "string" && value.trim() !== "") ? Number(value) : NaN;
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `${fieldName} must be an integer`);
  }
  return parsed;
}

function normalizeNullableInteger(value: unknown) {
  if (value == null) {
    return null;
  }
  return normalizeRequiredInteger(value, "tencent_docs integer field");
}

function normalizeNullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function requireString(value: unknown, message: string) {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, message);
  }
  return stringValue;
}

function requireActionInputString(value: unknown, fieldName: string) {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `tencent_docs ${fieldName} is required`);
  }
  return stringValue;
}

function requireRecord(value: unknown, message: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value as Record<string, unknown>;
}
