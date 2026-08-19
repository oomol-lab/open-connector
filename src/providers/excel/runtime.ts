import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject } from "../../core/cast.ts";
import { getProviderActionHandler, ProviderRequestError } from "../provider-runtime.ts";
import { emptyWorkbookBytes, excelWorkbookMimeType } from "./workbook-template.ts";

const graphBaseUrl = "https://graph.microsoft.com/v1.0";
const graphHost = "graph.microsoft.com";
const defaultWorkbookExtensions = [".xlsx", ".xlsm", ".xlsb"] as const;
const excelUploadChunkSizeBytes = 10 * 1024 * 1024;
const excelCreateWorkbookSelectFields = [
  "id",
  "name",
  "webUrl",
  "createdDateTime",
  "lastModifiedDateTime",
  "size",
  "file",
  "folder",
  "workbook",
  "parentReference",
] as const;

type ExcelRuntimeDeps = {
  accessToken: string;
  fetcher: typeof fetch;
};

export interface ExcelActionInvocation {
  actionName: string;
  input: Record<string, unknown>;
  accessToken: string;
}

type ExcelActionHandler = (input: Record<string, unknown>, deps: ExcelRuntimeDeps) => Promise<unknown>;

type ExcelRequestInput = {
  accessToken: string;
  fetcher: typeof fetch;
  method?: string;
  query?: Record<string, string | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: BodyInit;
  sessionId?: string;
  allowStatuses?: number[];
};

type ExcelGraphCollection<T> = {
  value?: T;
  "@odata.nextLink"?: unknown;
} & Record<string, unknown>;

type ExcelErrorPayload = {
  error?: {
    code?: unknown;
    message?: unknown;
    innerError?: unknown;
  };
  message?: unknown;
};

type ExcelUploadSession = {
  uploadUrl: string;
  expirationDateTime: string | null;
  nextExpectedRanges: string[];
};

class ExcelProviderRequestError extends ProviderRequestError {
  constructor(_code: string, message: string, status = 500) {
    super(status, message);
  }
}

const excelCreateSessionRetryableStatus = 504;
const excelCreateSessionAcceptedStatus = 202;
const excelCreateSessionMaxRequestAttempts = 3;
const excelCreateSessionMaxPollAttempts = 8;
const excelCreateSessionBaseDelayMs = 500;
const excelCreateSessionPollDelayMs = 1_000;

export const excelActionHandlers: ProviderActionHandlers<"excel", ExcelActionHandler> = {
  create_workbook(input, deps) {
    return createWorkbook(input, deps);
  },
  search_files(input, deps) {
    return searchFiles(input, deps);
  },
  list_drive_item_children(input, deps) {
    return listDriveItemChildren(input, deps);
  },
  create_session(input, deps) {
    return createSession(input, deps);
  },
  get_workbook(input, deps) {
    return getWorkbook(input, deps);
  },
  list_worksheets(input, deps) {
    return listWorksheets(input, deps);
  },
  get_worksheet(input, deps) {
    return getWorksheet(input, deps);
  },
  add_worksheet(input, deps) {
    return addWorksheet(input, deps);
  },
  update_worksheet(input, deps) {
    return updateWorksheet(input, deps);
  },
  delete_worksheet(input, deps) {
    return deleteWorksheet(input, deps);
  },
  get_range(input, deps) {
    return getRange(input, deps);
  },
  get_worksheet_used_range(input, deps) {
    return getWorksheetUsedRange(input, deps);
  },
  update_range(input, deps) {
    return updateRange(input, deps);
  },
  clear_range(input, deps) {
    return clearRange(input, deps);
  },
  insert_range(input, deps) {
    return insertRange(input, deps);
  },
  merge_cells(input, deps) {
    return mergeCells(input, deps);
  },
  sort_range(input, deps) {
    return sortRange(input, deps);
  },
  list_tables(input, deps) {
    return listTables(input, deps);
  },
  add_table(input, deps) {
    return addTable(input, deps);
  },
  update_table(input, deps) {
    return updateTable(input, deps);
  },
  convert_table_to_range(input, deps) {
    return convertTableToRange(input, deps);
  },
  list_table_rows(input, deps) {
    return listTableRows(input, deps);
  },
  add_table_row(input, deps) {
    return addTableRow(input, deps);
  },
  delete_table_row(input, deps) {
    return deleteTableRow(input, deps);
  },
  list_table_columns(input, deps) {
    return listTableColumns(input, deps);
  },
  get_table_column(input, deps) {
    return getTableColumn(input, deps);
  },
  add_table_column(input, deps) {
    return addTableColumn(input, deps);
  },
  delete_table_column(input, deps) {
    return deleteTableColumn(input, deps);
  },
  apply_table_filter(input, deps) {
    return applyTableFilter(input, deps);
  },
  clear_table_filter(input, deps) {
    return clearTableFilter(input, deps);
  },
  apply_table_sort(input, deps) {
    return applyTableSort(input, deps);
  },
};

export async function executeExcelAction(input: ExcelActionInvocation, fetcher: typeof fetch): Promise<unknown> {
  const handler = getProviderActionHandler(excelActionHandlers, input.actionName);
  if (!handler) {
    throw new ExcelProviderRequestError("invalid_input", `unknown excel action: ${input.actionName}`, 400);
  }

  return handler(input.input, {
    accessToken: input.accessToken,
    fetcher,
  });
}

export async function excelJsonRequest<T>(path: string, input: ExcelRequestInput): Promise<T> {
  const response = await excelRequest(path, input);
  return readJsonResponse<T>(response, `excel response for ${path}`);
}

async function excelRequest(path: string, input: ExcelRequestInput) {
  const target = buildExcelUrl(path, input.query);
  const hasJsonBody = input.body !== undefined;
  const hasRawBody = input.rawBody !== undefined;
  const method = (input.method ?? (hasJsonBody || hasRawBody ? "POST" : "GET")).toUpperCase();
  const headers: Record<string, string> = {
    authorization: `Bearer ${input.accessToken}`,
    ...(input.sessionId ? { "workbook-session-id": input.sessionId } : {}),
    ...(input.headers ?? {}),
  };

  if (hasJsonBody && hasRawBody) {
    throw new ExcelProviderRequestError("invalid_input", "excel request must not include both body and rawBody", 400);
  }
  if ((method === "GET" || method === "HEAD") && (hasJsonBody || hasRawBody)) {
    throw new ExcelProviderRequestError("invalid_input", `excel ${method} request must not include a body`, 400);
  }

  const response = await input.fetcher(target.toString(), {
    method,
    headers:
      hasJsonBody && !hasContentTypeHeader(headers)
        ? {
            ...headers,
            "content-type": "application/json",
          }
        : headers,
    ...(hasJsonBody ? { body: JSON.stringify(input.body) } : {}),
    ...(hasRawBody ? { body: input.rawBody } : {}),
  });

  if (!response.ok && !input.allowStatuses?.includes(response.status)) {
    await assertExcelResponse(response);
  }
  return response;
}

function buildExcelUrl(path: string, query?: Record<string, string | undefined>) {
  const target = new URL(path, `${graphBaseUrl}/`);
  if (target.hostname !== graphHost) {
    throw new ExcelProviderRequestError("invalid_input", "excel request must target graph.microsoft.com", 400);
  }

  for (const [key, value] of Object.entries(query ?? {})) {
    if (!value) {
      continue;
    }
    target.searchParams.set(key, value);
  }

  return target;
}

function hasContentTypeHeader(headers: Record<string, string>) {
  return Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
}

export async function assertExcelResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const { code, message } = await extractExcelError(response);

  if (response.status === 400) {
    throw new ExcelProviderRequestError("invalid_input", message, 400);
  }
  if (response.status === 401) {
    throw new ExcelProviderRequestError("credential_expired", message, 409);
  }
  if (response.status === 403 && isScopeError(code, message)) {
    throw new ExcelProviderRequestError("scope_missing", message, 403);
  }
  if (response.status === 403) {
    throw new ExcelProviderRequestError("provider_error", message, 403);
  }
  if (response.status === 404) {
    throw new ExcelProviderRequestError("invalid_input", message, 400);
  }
  if (response.status === 429) {
    throw new ExcelProviderRequestError("rate_limited", message, 429);
  }

  throw new ExcelProviderRequestError("provider_error", message, response.status);
}

async function extractExcelError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return {
      code: "",
      message: `excel request failed with status ${response.status}`,
    };
  }

  try {
    const payload = JSON.parse(text) as ExcelErrorPayload;
    const code = readOptionalString(payload.error?.code) ?? "";
    const message =
      readOptionalString(payload.error?.message) ??
      readOptionalString(payload.message) ??
      `excel request failed with status ${response.status}`;
    return { code, message };
  } catch {
    return {
      code: "",
      message: text,
    };
  }
}

function isScopeError(code: string, message: string) {
  const normalizedCode = code.toLowerCase();
  const normalizedMessage = message.toLowerCase();
  return (
    normalizedCode.includes("accessdenied") ||
    normalizedCode.includes("forbidden") ||
    normalizedMessage.includes("insufficient privileges") ||
    normalizedMessage.includes("scope")
  );
}

async function searchFiles(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const query = requireString(input.query, "query");
  const driveId = readOptionalString(input.driveId);
  const path = `${buildDriveRootPath(driveId)}/search(q='${encodeOdataFunctionStringArgument(query)}')`;
  const payload = asObject(
    await excelJsonRequest<ExcelGraphCollection<unknown[]>>(path, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      query: {
        $top: formatOptionalNumber(input.top),
      },
    }),
  );

  const extensions = normalizeExtensions(input.fileExtensions);
  const items = readCollectionItems(payload.value).filter((item) => matchesWorkbookExtensions(item, extensions));

  return {
    items,
    nextLink: readNextLink(payload),
  };
}

async function createWorkbook(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const driveId = readAliasedString(input, ["driveId", "drive_id"]);
  const normalizedPath = normalizeWorkbookCreatePath(requireAliasedString(input, ["path"]), "path");
  const targetPath = buildDrivePathFromSegments([...normalizedPath.folderSegments, normalizedPath.fileName], driveId);
  const existingItem = await fetchOptionalDriveItem(targetPath, deps);
  if (existingItem) {
    throw new ExcelProviderRequestError("invalid_input", `path already exists: ${normalizedPath.normalizedPath}`, 400);
  }

  const parentItemId = await ensureFolderPathExists(normalizedPath.folderSegments, driveId, deps);
  const createdItem = await createWorkbookFile(
    {
      driveId,
      parentItemId,
      fileName: normalizedPath.fileName,
      pathLabel: normalizedPath.normalizedPath,
    },
    deps,
  );
  const itemId = requireString(createdItem.id, "id");
  const worksheetPlan = resolveCreateWorkbookWorksheetPlan(input);

  if (!worksheetPlan.requiresInitialization) {
    return createdItem;
  }

  try {
    await initializeWorkbookContents(
      {
        driveId,
        itemId,
        worksheetNames: worksheetPlan.worksheetNames,
        worksheetData: worksheetPlan.worksheetData,
      },
      deps,
    );

    return await fetchDriveItemMetadata(buildDriveItemPath(itemId, driveId), deps);
  } catch (error) {
    await deleteDriveItem(itemId, driveId, deps).catch(() => undefined);
    throw error;
  }
}

async function listDriveItemChildren(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const driveId = readOptionalString(input.driveId);
  const itemId = readOptionalString(input.itemId);
  const path = itemId ? `${buildDriveItemPath(itemId, driveId)}/children` : `${buildDriveRootPath(driveId)}/children`;

  const payload = asObject(
    await excelJsonRequest<ExcelGraphCollection<unknown[]>>(path, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      query: compactObject({
        $top: formatOptionalNumber(input.top),
        $select: formatOptionalStringArray(input.select),
      }),
    }),
  );

  return {
    items: readCollectionItems(payload.value),
    nextLink: readNextLink(payload),
  };
}

async function initializeWorkbookContents(
  input: {
    driveId?: string;
    itemId: string;
    worksheetNames: string[];
    worksheetData: Record<string, unknown[][]>;
  },
  deps: ExcelRuntimeDeps,
) {
  const session = asObject(
    await createWorkbookSession(buildWorkbookPathFromItemId(input.itemId, input.driveId), true, deps),
  );
  const sessionId = requireString(session.id, "sessionId");
  const worksheets = await readWorkbookWorksheets(input.itemId, input.driveId, sessionId, deps);

  await ensureWorkbookWorksheets(
    {
      driveId: input.driveId,
      itemId: input.itemId,
      sessionId,
      existingWorksheets: worksheets,
      worksheetNames: input.worksheetNames,
    },
    deps,
  );

  for (const worksheetName of input.worksheetNames) {
    const values = input.worksheetData[worksheetName];
    if (!values) {
      continue;
    }

    const normalizedValues = normalizeWorksheetValues(values);
    if (normalizedValues.length === 0 || normalizedValues[0]?.length === 0) {
      continue;
    }

    await excelJsonRequest<Record<string, unknown>>(
      buildWorksheetRangePathByIds(
        input.itemId,
        input.driveId,
        worksheetName,
        buildMatrixRangeAddress(normalizedValues),
      ),
      {
        accessToken: deps.accessToken,
        fetcher: deps.fetcher,
        method: "PATCH",
        sessionId,
        body: {
          values: normalizedValues,
        },
      },
    );
  }
}

async function ensureWorkbookWorksheets(
  input: {
    driveId?: string;
    itemId: string;
    sessionId: string;
    existingWorksheets: Record<string, unknown>[];
    worksheetNames: string[];
  },
  deps: ExcelRuntimeDeps,
) {
  if (input.worksheetNames.length === 0) {
    return;
  }

  const firstWorksheet = input.existingWorksheets[0];
  if (firstWorksheet) {
    const firstWorksheetName = requireString(firstWorksheet.name, "worksheet.name");
    const firstWorksheetId = readOptionalString(firstWorksheet.id) ?? firstWorksheetName;
    const firstTargetName = input.worksheetNames[0];
    if (firstWorksheetName !== firstTargetName) {
      await excelJsonRequest<Record<string, unknown>>(
        `${buildWorkbookPathFromItemId(input.itemId, input.driveId)}/worksheets/${encodeURIComponent(firstWorksheetId)}`,
        {
          accessToken: deps.accessToken,
          fetcher: deps.fetcher,
          method: "PATCH",
          sessionId: input.sessionId,
          body: {
            name: firstTargetName,
          },
        },
      );
    }
  } else {
    await excelJsonRequest<Record<string, unknown>>(
      `${buildWorkbookPathFromItemId(input.itemId, input.driveId)}/worksheets/add`,
      {
        accessToken: deps.accessToken,
        fetcher: deps.fetcher,
        method: "POST",
        sessionId: input.sessionId,
        body: {
          name: input.worksheetNames[0],
        },
      },
    );
  }

  for (const worksheetName of input.worksheetNames.slice(1)) {
    await excelJsonRequest<Record<string, unknown>>(
      `${buildWorkbookPathFromItemId(input.itemId, input.driveId)}/worksheets/add`,
      {
        accessToken: deps.accessToken,
        fetcher: deps.fetcher,
        method: "POST",
        sessionId: input.sessionId,
        body: {
          name: worksheetName,
        },
      },
    );
  }
}

async function readWorkbookWorksheets(
  itemId: string,
  driveId: string | undefined,
  sessionId: string,
  deps: ExcelRuntimeDeps,
) {
  const payload = asObject(
    await excelJsonRequest<ExcelGraphCollection<unknown[]>>(
      `${buildWorkbookPathFromItemId(itemId, driveId)}/worksheets`,
      {
        accessToken: deps.accessToken,
        fetcher: deps.fetcher,
        sessionId,
      },
    ),
  );

  return readCollectionItems(payload.value);
}

async function createWorkbookFile(
  input: {
    driveId?: string;
    parentItemId: string;
    fileName: string;
    pathLabel: string;
  },
  deps: ExcelRuntimeDeps,
) {
  const response = await excelRequest(
    `${buildDriveItemPath(input.parentItemId, input.driveId)}:/${encodeURIComponent(input.fileName)}:/createUploadSession`,
    {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "POST",
      body: {
        item: {
          "@microsoft.graph.conflictBehavior": "fail",
          name: input.fileName,
        },
      },
      allowStatuses: [409],
    },
  );

  if (response.status === 409) {
    throw new ExcelProviderRequestError("invalid_input", `path already exists: ${input.pathLabel}`, 400);
  }

  const session = asUploadSession(
    await readJsonObjectResponse(response, "excel create workbook upload session response"),
  );
  return uploadSessionBytes(session.uploadUrl, emptyWorkbookBytes, deps.fetcher);
}

async function uploadSessionBytes(uploadUrl: string, bytes: Uint8Array, fetcher: typeof fetch) {
  if (bytes.byteLength <= 0) {
    throw new ExcelProviderRequestError("invalid_input", "file content must not be empty", 400);
  }

  let start = 0;
  while (start < bytes.byteLength) {
    const chunkSize = resolveUploadChunkSize(bytes.byteLength - start);
    const endExclusive = Math.min(start + chunkSize, bytes.byteLength);
    const chunk = bytes.subarray(start, endExclusive);
    const response = await fetcher(uploadUrl, {
      method: "PUT",
      headers: {
        "content-length": String(chunk.byteLength),
        "content-range": `bytes ${start}-${endExclusive - 1}/${bytes.byteLength}`,
        "content-type": excelWorkbookMimeType,
      },
      body: toArrayBuffer(chunk),
    });

    if (response.status === 200 || response.status === 201) {
      return asObject(await readJsonResponse<Record<string, unknown>>(response, "excel upload session final response"));
    }

    if (response.status !== 202) {
      throw await buildUploadSessionError(response);
    }

    const progress = asObject(
      await readJsonResponse<Record<string, unknown>>(response, "excel upload session progress"),
    );
    const nextStart = readUploadSessionNextStart(progress);
    start = nextStart ?? endExclusive;
  }

  throw new ExcelProviderRequestError(
    "provider_error",
    "excel upload session finished without a final drive item response",
    502,
  );
}

async function fetchDriveItemMetadata(path: string, deps: ExcelRuntimeDeps) {
  return asObject(
    await excelJsonRequest<Record<string, unknown>>(path, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      query: {
        $select: excelCreateWorkbookSelectFields.join(","),
      },
    }),
  );
}

async function deleteDriveItem(itemId: string, driveId: string | undefined, deps: ExcelRuntimeDeps) {
  await excelRequest(buildDriveItemPath(itemId, driveId), {
    accessToken: deps.accessToken,
    fetcher: deps.fetcher,
    method: "DELETE",
    allowStatuses: [404],
  });
}

async function fetchOptionalDriveItem(path: string, deps: ExcelRuntimeDeps) {
  const response = await excelRequest(path, {
    accessToken: deps.accessToken,
    fetcher: deps.fetcher,
    query: {
      $select: excelCreateWorkbookSelectFields.join(","),
    },
    allowStatuses: [404],
  });
  if (response.status === 404) {
    return null;
  }

  return asObject(await readJsonResponse<Record<string, unknown>>(response, `excel response for ${path}`));
}

async function ensureFolderPathExists(folderSegments: string[], driveId: string | undefined, deps: ExcelRuntimeDeps) {
  if (folderSegments.length === 0) {
    return getRootItemId(driveId, deps);
  }

  let currentItem = await fetchDriveItemMetadata(buildDriveRootPath(driveId), deps);
  const currentSegments: string[] = [];

  for (const segment of folderSegments) {
    currentSegments.push(segment);
    const existingItem = await fetchOptionalDriveItem(buildDrivePathFromSegments(currentSegments, driveId), deps);
    if (existingItem) {
      if (!isFolderDriveItem(existingItem)) {
        throw new ExcelProviderRequestError("invalid_input", `folder path segment "${segment}" points to a file`, 400);
      }
      currentItem = existingItem;
      continue;
    }

    const response = await excelRequest(
      `${buildDriveItemPath(requireString(currentItem.id, "parent.id"), driveId)}/children`,
      {
        accessToken: deps.accessToken,
        fetcher: deps.fetcher,
        method: "POST",
        body: {
          name: segment,
          folder: {},
          "@microsoft.graph.conflictBehavior": "fail",
        },
        allowStatuses: [409],
      },
    );
    if (response.status === 409) {
      const conflictedItem = await fetchOptionalDriveItem(buildDrivePathFromSegments(currentSegments, driveId), deps);
      if (!conflictedItem) {
        throw new ExcelProviderRequestError(
          "provider_error",
          `excel folder creation conflict could not be resolved for "${segment}"`,
          502,
        );
      }
      if (!isFolderDriveItem(conflictedItem)) {
        throw new ExcelProviderRequestError("invalid_input", `folder path segment "${segment}" points to a file`, 400);
      }
      currentItem = conflictedItem;
      continue;
    }

    currentItem = asObject(await readJsonObjectResponse(response, "excel folder creation response"));
  }

  return requireString(currentItem.id, "folder.id");
}

async function getRootItemId(driveId: string | undefined, deps: ExcelRuntimeDeps) {
  const root = await fetchDriveItemMetadata(buildDriveRootPath(driveId), deps);
  if (!isFolderDriveItem(root)) {
    throw new ExcelProviderRequestError("provider_error", "excel drive root is not a folder", 502);
  }
  return requireString(root.id, "root.id");
}

function asUploadSession(value: Record<string, unknown>) {
  return {
    uploadUrl: requireString(value.uploadUrl, "uploadUrl"),
    expirationDateTime: readOptionalString(value.expirationDateTime) ?? null,
    nextExpectedRanges: readOptionalStringArray(value.nextExpectedRanges) ?? [],
  } satisfies ExcelUploadSession;
}

async function buildUploadSessionError(response: Response) {
  const { message } = await extractExcelError(response);
  if (response.status === 400 || response.status === 409 || response.status === 412) {
    return new ExcelProviderRequestError("invalid_input", message, 400);
  }
  if (response.status === 404) {
    return new ExcelProviderRequestError("provider_error", "excel upload session expired", 404);
  }
  if (response.status === 416) {
    return new ExcelProviderRequestError("provider_error", message || "invalid upload byte range", 416);
  }
  if (response.status === 429) {
    return new ExcelProviderRequestError("rate_limited", message, 429);
  }
  if (response.status === 507) {
    return new ExcelProviderRequestError("provider_error", message, 507);
  }
  return new ExcelProviderRequestError("provider_error", message, response.status);
}

function resolveUploadChunkSize(remainingBytes: number) {
  if (remainingBytes <= excelUploadChunkSizeBytes) {
    return remainingBytes;
  }
  return excelUploadChunkSizeBytes;
}

function readUploadSessionNextStart(value: Record<string, unknown>) {
  const nextExpectedRanges = readOptionalStringArray(value.nextExpectedRanges);
  const firstRange = nextExpectedRanges?.[0];
  if (!firstRange) {
    return undefined;
  }

  const dashIndex = firstRange.indexOf("-");
  const startText = dashIndex >= 0 ? firstRange.slice(0, dashIndex) : firstRange;
  if (!startText) {
    return undefined;
  }

  const parsed = Number(startText);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function toArrayBuffer(bytes: Uint8Array) {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer;
  }

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function createSession(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const persistChanges = readOptionalBoolean(input.persistChanges) ?? true;
  const payload = asObject(await createWorkbookSession(buildWorkbookPath(input), persistChanges, deps));

  return {
    sessionId: requireString(payload.id, "sessionId"),
    persistChanges,
  };
}

async function createWorkbookSession(workbookPath: string, persistChanges: boolean, deps: ExcelRuntimeDeps) {
  for (let attempt = 0; attempt < excelCreateSessionMaxRequestAttempts; attempt += 1) {
    const response = await excelRequest(`${workbookPath}/createSession`, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "POST",
      headers: {
        Prefer: "respond-async",
      },
      body: { persistChanges },
      allowStatuses: [excelCreateSessionRetryableStatus],
    });

    if (response.status === excelCreateSessionRetryableStatus) {
      if (attempt === excelCreateSessionMaxRequestAttempts - 1) {
        await assertExcelResponse(response);
      }
      await delay(readRetryDelayMs(response.headers, attempt, excelCreateSessionBaseDelayMs));
      continue;
    }

    return resolveCreateSessionResponse(response, deps);
  }

  throw new ExcelProviderRequestError("provider_error", "excel create session exhausted retry attempts", 504);
}

async function resolveCreateSessionResponse(response: Response, deps: ExcelRuntimeDeps) {
  if (response.status === excelCreateSessionAcceptedStatus) {
    const location = readOptionalString(response.headers.get("Location"));
    if (!location) {
      throw new ExcelProviderRequestError(
        "provider_error",
        "excel create session accepted response is missing Location header",
        502,
      );
    }
    return pollCreateSession(location, deps);
  }

  return readJsonObjectResponse(response, "excel create session response");
}

async function pollCreateSession(location: string, deps: ExcelRuntimeDeps) {
  let statusUrl = location;

  for (let attempt = 0; attempt < excelCreateSessionMaxPollAttempts; attempt += 1) {
    const response = await excelRequest(statusUrl, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      headers: {
        Prefer: "respond-async",
      },
      allowStatuses: [excelCreateSessionRetryableStatus],
    });

    if (response.status === excelCreateSessionRetryableStatus) {
      if (attempt === excelCreateSessionMaxPollAttempts - 1) {
        await assertExcelResponse(response);
      }
      await delay(readRetryDelayMs(response.headers, attempt, excelCreateSessionBaseDelayMs));
      continue;
    }

    const payload = await readJsonObjectResponse(response, "excel create session status response");
    const status = readOptionalString(payload.status)?.toLowerCase();

    if (!status) {
      if (readOptionalString(payload.id)) {
        return payload;
      }
      throw new ExcelProviderRequestError(
        "provider_error",
        "excel create session status response is missing both status and id",
        502,
      );
    }

    if (status === "succeeded") {
      const resourceLocation = readOptionalString(payload.resourceLocation);
      if (resourceLocation) {
        return readCreateSessionResource(resourceLocation, deps);
      }
      if (readOptionalString(payload.id)) {
        return payload;
      }
      throw new ExcelProviderRequestError(
        "provider_error",
        "excel create session succeeded response is missing both resourceLocation and id",
        502,
      );
    }

    if (status === "failed") {
      throw buildExcelOperationError(payload, "excel create session failed");
    }

    const nextStatusUrl = readOptionalString(response.headers.get("Location"));
    if (nextStatusUrl) {
      statusUrl = nextStatusUrl;
    }
    await delay(readRetryDelayMs(response.headers, attempt, excelCreateSessionPollDelayMs));
  }

  throw new ExcelProviderRequestError("provider_error", "excel create session timed out", 504);
}

async function readCreateSessionResource(location: string, deps: ExcelRuntimeDeps) {
  for (let attempt = 0; attempt < excelCreateSessionMaxRequestAttempts; attempt += 1) {
    const response = await excelRequest(location, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      allowStatuses: [excelCreateSessionRetryableStatus],
    });

    if (response.status === excelCreateSessionRetryableStatus) {
      if (attempt === excelCreateSessionMaxRequestAttempts - 1) {
        await assertExcelResponse(response);
      }
      await delay(readRetryDelayMs(response.headers, attempt, excelCreateSessionBaseDelayMs));
      continue;
    }

    return readJsonObjectResponse(response, "excel create session resource response");
  }

  throw new ExcelProviderRequestError("provider_error", "excel create session resource retry failed", 504);
}

async function getWorkbook(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const payload = asObject(
    await excelJsonRequest<Record<string, unknown>>(buildWorkbookPath(input), {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      sessionId: readOptionalString(input.sessionId),
      query: {
        $expand: formatOptionalStringArray(input.expand),
      },
    }),
  );

  return {
    workbook: payload,
  };
}

async function listWorksheets(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const payload = asObject(
    await excelJsonRequest<ExcelGraphCollection<unknown[]>>(`${buildWorkbookPath(input)}/worksheets`, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      sessionId: readOptionalString(input.sessionId),
    }),
  );

  return {
    worksheets: readCollectionItems(payload.value),
    nextLink: readNextLink(payload),
  };
}

async function getWorksheet(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const payload = asObject(
    await excelJsonRequest<Record<string, unknown>>(
      `${buildWorkbookPath(input)}/worksheets/${encodeURIComponent(requireString(input.worksheetId, "worksheetId"))}`,
      {
        accessToken: deps.accessToken,
        fetcher: deps.fetcher,
        sessionId: readOptionalString(input.sessionId),
      },
    ),
  );

  return {
    worksheet: payload,
  };
}

async function addWorksheet(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const payload = asObject(
    await excelJsonRequest<Record<string, unknown>>(`${buildWorkbookPath(input)}/worksheets/add`, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "POST",
      sessionId: readOptionalString(input.sessionId),
      body: compactObject({
        name: readOptionalString(input.name),
      }),
    }),
  );

  return {
    worksheet: payload,
  };
}

async function updateWorksheet(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const body = requireNonEmptyMutationBody(
    {
      name: readOptionalString(input.name),
      position: readOptionalNumber(input.position),
      visibility: readOptionalString(input.visibility),
    },
    "At least one worksheet field must be provided.",
  );
  const payload = asObject(
    await excelJsonRequest<Record<string, unknown>>(
      `${buildWorkbookPath(input)}/worksheets/${encodeURIComponent(requireString(input.worksheetId, "worksheetId"))}`,
      {
        accessToken: deps.accessToken,
        fetcher: deps.fetcher,
        method: "PATCH",
        sessionId: readOptionalString(input.sessionId),
        body,
      },
    ),
  );

  return {
    worksheet: payload,
  };
}

async function deleteWorksheet(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  await excelRequest(
    `${buildWorkbookPath(input)}/worksheets/${encodeURIComponent(requireString(input.worksheetId, "worksheetId"))}`,
    {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "DELETE",
      sessionId: readOptionalString(input.sessionId),
    },
  );

  return { success: true as const };
}

async function getRange(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const payload = asObject(
    await excelJsonRequest<Record<string, unknown>>(buildWorksheetRangePath(input), {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      sessionId: readOptionalString(input.sessionId),
    }),
  );

  return {
    range: payload,
  };
}

async function getWorksheetUsedRange(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const payload = asObject(
    await excelJsonRequest<Record<string, unknown>>(buildWorksheetUsedRangePath(input), {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      sessionId: readOptionalString(input.sessionId),
    }),
  );

  return {
    range: payload,
  };
}

async function updateRange(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const body = requireNonEmptyMutationBody(
    {
      values: readOptionalMatrix(input.values),
      formulas: readOptionalMatrix(input.formulas),
      formulasLocal: readOptionalMatrix(input.formulasLocal),
      formulasR1C1: readOptionalMatrix(input.formulasR1C1),
      numberFormat: readOptionalMatrix(input.numberFormat),
      rowHidden: readOptionalBoolean(input.rowHidden),
      columnHidden: readOptionalBoolean(input.columnHidden),
    },
    "At least one range mutation field must be provided.",
  );
  const payload = asObject(
    await excelJsonRequest<Record<string, unknown>>(buildWorksheetRangePath(input), {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "PATCH",
      sessionId: readOptionalString(input.sessionId),
      body,
    }),
  );

  return {
    range: payload,
  };
}

async function clearRange(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  await excelRequest(`${buildWorksheetRangePath(input)}/clear`, {
    accessToken: deps.accessToken,
    fetcher: deps.fetcher,
    method: "POST",
    sessionId: readOptionalString(input.sessionId),
    body: compactObject({
      applyTo: readOptionalString(input.applyTo),
    }),
  });

  return { success: true as const };
}

async function insertRange(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const payload = asObject(
    await excelJsonRequest<Record<string, unknown>>(`${buildWorksheetRangePath(input)}/insert`, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "POST",
      sessionId: readOptionalString(input.sessionId),
      body: {
        shift: requireString(input.shift, "shift"),
      },
    }),
  );

  return {
    range: payload,
  };
}

async function mergeCells(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  await excelRequest(`${buildWorksheetRangePath(input)}/merge`, {
    accessToken: deps.accessToken,
    fetcher: deps.fetcher,
    method: "POST",
    sessionId: readOptionalString(input.sessionId),
    body: compactObject({
      across: readOptionalBoolean(input.across),
    }),
  });

  return { success: true as const };
}

async function sortRange(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  await excelRequest(`${buildWorksheetRangePath(input)}/sort/apply`, {
    accessToken: deps.accessToken,
    fetcher: deps.fetcher,
    method: "POST",
    sessionId: readOptionalString(input.sessionId),
    body: compactObject({
      fields: readObjectArray(input.fields),
      matchCase: readOptionalBoolean(input.matchCase),
      hasHeaders: readOptionalBoolean(input.hasHeaders),
      orientation: readOptionalString(input.orientation),
      method: readOptionalString(input.method),
    }),
  });

  return { success: true as const };
}

async function listTables(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const worksheetId = readOptionalString(input.worksheetId);
  const path = worksheetId
    ? `${buildWorkbookPath(input)}/worksheets/${encodeURIComponent(worksheetId)}/tables`
    : `${buildWorkbookPath(input)}/tables`;

  const payload = asObject(
    await excelJsonRequest<ExcelGraphCollection<unknown[]>>(path, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      sessionId: readOptionalString(input.sessionId),
    }),
  );

  return {
    tables: readCollectionItems(payload.value),
    nextLink: readNextLink(payload),
  };
}

async function addTable(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const worksheetId = readOptionalString(input.worksheetId);
  const path = worksheetId
    ? `${buildWorkbookPath(input)}/worksheets/${encodeURIComponent(worksheetId)}/tables/add`
    : `${buildWorkbookPath(input)}/tables/add`;
  const payload = asObject(
    await excelJsonRequest<Record<string, unknown>>(path, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "POST",
      sessionId: readOptionalString(input.sessionId),
      body: {
        address: requireString(input.address, "address"),
        hasHeaders: requireBoolean(input.hasHeaders, "hasHeaders"),
      },
    }),
  );

  return {
    table: payload,
  };
}

async function updateTable(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const body = requireNonEmptyMutationBody(
    {
      name: readOptionalString(input.name),
      style: readOptionalString(input.style),
      showTotals: readOptionalBoolean(input.showTotals),
      showHeaders: readOptionalBoolean(input.showHeaders),
    },
    "At least one table field must be provided.",
  );
  const payload = asObject(
    await excelJsonRequest<Record<string, unknown>>(buildTablePath(input), {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "PATCH",
      sessionId: readOptionalString(input.sessionId),
      body,
    }),
  );

  return {
    table: payload,
  };
}

async function convertTableToRange(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const payload = asObject(
    await excelJsonRequest<Record<string, unknown>>(`${buildTablePath(input)}/convertToRange`, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "POST",
      sessionId: readOptionalString(input.sessionId),
    }),
  );

  return {
    range: payload,
  };
}

async function listTableRows(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const payload = asObject(
    await excelJsonRequest<ExcelGraphCollection<unknown[]>>(`${buildTablePath(input)}/rows`, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      sessionId: readOptionalString(input.sessionId),
    }),
  );

  return {
    rows: readCollectionItems(payload.value),
    nextLink: readNextLink(payload),
  };
}

async function addTableRow(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const payload = asObject(
    await excelJsonRequest<Record<string, unknown>>(`${buildTablePath(input)}/rows/add`, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "POST",
      sessionId: readOptionalString(input.sessionId),
      body: compactObject({
        index: readOptionalNumber(input.index),
        values: requireMatrix(input.values, "values"),
      }),
    }),
  );

  return {
    row: payload,
  };
}

async function deleteTableRow(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  await excelRequest(
    `${buildTablePath(input)}/rows/$/itemAt(index=${formatRequiredNumber(input.rowIndex, "rowIndex")})`,
    {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "DELETE",
      sessionId: readOptionalString(input.sessionId),
    },
  );

  return { success: true as const };
}

async function listTableColumns(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const payload = asObject(
    await excelJsonRequest<ExcelGraphCollection<unknown[]>>(`${buildTablePath(input)}/columns`, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      sessionId: readOptionalString(input.sessionId),
    }),
  );

  return {
    columns: readCollectionItems(payload.value),
    nextLink: readNextLink(payload),
  };
}

async function getTableColumn(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const payload = asObject(
    await excelJsonRequest<Record<string, unknown>>(
      `${buildTablePath(input)}/columns/${encodeURIComponent(requireString(input.columnId, "columnId"))}`,
      {
        accessToken: deps.accessToken,
        fetcher: deps.fetcher,
        sessionId: readOptionalString(input.sessionId),
      },
    ),
  );

  return {
    column: payload,
  };
}

async function addTableColumn(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  const payload = asObject(
    await excelJsonRequest<Record<string, unknown>>(`${buildTablePath(input)}/columns/add`, {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "POST",
      sessionId: readOptionalString(input.sessionId),
      body: compactObject({
        index: readOptionalNumber(input.index),
        values: readOptionalMatrix(input.values),
      }),
    }),
  );

  return {
    column: payload,
  };
}

async function deleteTableColumn(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  await excelRequest(
    `${buildTablePath(input)}/columns/${encodeURIComponent(requireString(input.columnId, "columnId"))}`,
    {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "DELETE",
      sessionId: readOptionalString(input.sessionId),
    },
  );

  return { success: true as const };
}

async function applyTableFilter(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  await excelRequest(
    `${buildTablePath(input)}/columns/${encodeURIComponent(requireString(input.columnId, "columnId"))}/filter/apply`,
    {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "POST",
      sessionId: readOptionalString(input.sessionId),
      body: {
        criteria: asObject(input.criteria),
      },
    },
  );

  return { success: true as const };
}

async function clearTableFilter(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  await excelRequest(
    `${buildTablePath(input)}/columns/${encodeURIComponent(requireString(input.columnId, "columnId"))}/filter/clear`,
    {
      accessToken: deps.accessToken,
      fetcher: deps.fetcher,
      method: "POST",
      sessionId: readOptionalString(input.sessionId),
    },
  );

  return { success: true as const };
}

async function applyTableSort(input: Record<string, unknown>, deps: ExcelRuntimeDeps) {
  await excelRequest(`${buildTablePath(input)}/sort/apply`, {
    accessToken: deps.accessToken,
    fetcher: deps.fetcher,
    method: "POST",
    sessionId: readOptionalString(input.sessionId),
    body: compactObject({
      fields: readObjectArray(input.fields),
      matchCase: readOptionalBoolean(input.matchCase),
      method: readOptionalString(input.method),
    }),
  });

  return { success: true as const };
}

function buildDriveRootPath(driveId?: string) {
  return `${buildDriveBasePath(driveId)}/root`;
}

function buildDriveBasePath(driveId?: string) {
  if (!driveId || driveId === "me") {
    return "me/drive";
  }
  return `drives/${encodeURIComponent(driveId)}`;
}

function buildDriveItemPath(itemId: string, driveId?: string) {
  return `${buildDriveBasePath(driveId)}/items/${encodeURIComponent(itemId)}`;
}

function buildDrivePathFromSegments(segments: string[], driveId?: string) {
  if (segments.length === 0) {
    return buildDriveRootPath(driveId);
  }

  return `${buildDriveBasePath(driveId)}/root:/${segments.map((segment) => encodeURIComponent(segment)).join("/")}:`;
}

function buildWorkbookPathFromItemId(itemId: string, driveId?: string) {
  return `${buildDriveItemPath(itemId, driveId)}/workbook`;
}

function buildWorkbookPath(input: Record<string, unknown>) {
  return buildWorkbookPathFromItemId(requireString(input.itemId, "itemId"), readOptionalString(input.driveId));
}

function buildWorksheetRangePath(input: Record<string, unknown>) {
  return buildWorksheetRangePathByIds(
    requireString(input.itemId, "itemId"),
    readOptionalString(input.driveId),
    requireString(input.worksheetId, "worksheetId"),
    requireString(input.address, "address"),
  );
}

function buildWorksheetUsedRangePath(input: Record<string, unknown>) {
  return `${buildWorkbookPath(input)}/worksheets/${encodeURIComponent(
    requireString(input.worksheetId, "worksheetId"),
  )}/usedRange(valuesOnly=${readOptionalBoolean(input.valuesOnly) === true ? "true" : "false"})`;
}

function buildTablePath(input: Record<string, unknown>) {
  return `${buildWorkbookPath(input)}/tables/${encodeURIComponent(requireString(input.tableId, "tableId"))}`;
}

function buildWorksheetRangePathByIds(
  itemId: string,
  driveId: string | undefined,
  worksheetId: string,
  address: string,
) {
  return `${buildWorkbookPathFromItemId(itemId, driveId)}/worksheets/${encodeURIComponent(
    worksheetId,
  )}/range(address='${encodeOdataFunctionStringArgument(address)}')`;
}

function readCollectionItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => asObject(item));
}

function readNextLink(payload: Record<string, unknown>) {
  return readOptionalString(payload["@odata.nextLink"]) ?? null;
}

async function readJsonObjectResponse(response: Response, label: string) {
  const payload = await readJsonResponse(response, label);
  const parsed = asObjectSafe(payload);
  if (!parsed) {
    throw new ExcelProviderRequestError("provider_error", `${label} must be a JSON object`, 502);
  }
  return parsed;
}

async function readJsonResponse<T>(response: Response, label: string) {
  try {
    return (await response.json()) as T;
  } catch (error) {
    const suffix = error instanceof Error && error.message ? `: ${error.message}` : "";
    throw new ExcelProviderRequestError(
      "provider_error",
      `${label} returned invalid JSON (status ${response.status})${suffix}`,
      502,
    );
  }
}

function buildExcelOperationError(payload: Record<string, unknown>, fallbackMessage: string) {
  const errorPayload = asObjectSafe(payload.error);
  const message = readOptionalString(errorPayload?.message) ?? readOptionalString(payload.message) ?? fallbackMessage;
  return new ExcelProviderRequestError("provider_error", message, 502);
}

function normalizeExtensions(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return [...defaultWorkbookExtensions];
  }

  const normalized = value
    .map((item) => readOptionalString(item))
    .filter((item): item is string => Boolean(item))
    .map((item) => {
      const trimmed = item.trim().toLowerCase();
      return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
    });

  return normalized.length > 0 ? normalized : [...defaultWorkbookExtensions];
}

function matchesWorkbookExtensions(item: Record<string, unknown>, extensions: string[]) {
  const name = readOptionalString(item.name)?.toLowerCase();
  if (!name) {
    return false;
  }
  if (asObjectSafe(item.file) == null) {
    return false;
  }
  return extensions.some((extension) => name.endsWith(extension));
}

function asObjectSafe(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asObject(value: unknown): Record<string, unknown> {
  const record = asObjectSafe(value);
  if (!record) {
    throw new ExcelProviderRequestError("provider_error", "excel value must be a JSON object", 502);
  }
  return record;
}

function isFolderDriveItem(item: Record<string, unknown>) {
  return asObjectSafe(item.folder) != null;
}

function normalizeWorkbookCreatePath(path: string, fieldName: string) {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new ExcelProviderRequestError("invalid_input", `${fieldName} must not be blank`, 400);
  }

  const rawPath = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  const segments = rawPath.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    throw new ExcelProviderRequestError("invalid_input", `${fieldName} must not contain empty path segments`, 400);
  }

  const fileName = segments.at(-1);
  if (!fileName) {
    throw new ExcelProviderRequestError("invalid_input", `${fieldName} must include a file name`, 400);
  }
  if (!fileName.toLowerCase().endsWith(".xlsx")) {
    throw new ExcelProviderRequestError("invalid_input", `${fieldName} must end with .xlsx`, 400);
  }

  const folderSegments = segments.slice(0, -1);
  return {
    folderSegments,
    fileName,
    normalizedPath: `/${segments.join("/")}`,
  };
}

function resolveCreateWorkbookWorksheetPlan(input: Record<string, unknown>) {
  const explicitWorksheetNames = readAliasedStringArray(input, ["worksheetNames", "worksheet_names"]) ?? [];
  const worksheetData = readAliasedWorksheetData(input, ["worksheetData", "worksheet_data"]) ?? {};
  const worksheetNames: string[] = [];
  const worksheetNameKeys = new Set<string>();

  for (const worksheetName of explicitWorksheetNames) {
    const normalizedName = normalizeWorksheetName(worksheetName, "worksheetNames");
    const worksheetKey = normalizeWorksheetKey(normalizedName);
    if (worksheetNameKeys.has(worksheetKey)) {
      throw new ExcelProviderRequestError("invalid_input", `worksheet name "${normalizedName}" is duplicated`, 400);
    }
    worksheetNameKeys.add(worksheetKey);
    worksheetNames.push(normalizedName);
  }

  for (const worksheetName of Object.keys(worksheetData)) {
    const worksheetKey = normalizeWorksheetKey(worksheetName);
    if (worksheetNameKeys.has(worksheetKey)) {
      continue;
    }
    worksheetNameKeys.add(worksheetKey);
    worksheetNames.push(worksheetName);
  }

  return {
    worksheetNames,
    worksheetData,
    requiresInitialization: worksheetNames.length > 0,
  };
}

function readAliasedWorksheetData(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (!(key in input)) {
      continue;
    }
    return requireWorksheetDataMap(input[key], key);
  }
  return undefined;
}

function requireWorksheetDataMap(value: unknown, fieldName: string) {
  const parsed = asObjectSafe(value);
  if (!parsed) {
    throw new ExcelProviderRequestError("invalid_input", `${fieldName} must be an object`, 400);
  }

  const normalized: Record<string, unknown[][]> = {};
  const worksheetKeys = new Set<string>();
  for (const [rawWorksheetName, rows] of Object.entries(parsed)) {
    const worksheetName = normalizeWorksheetName(rawWorksheetName, fieldName);
    const worksheetKey = normalizeWorksheetKey(worksheetName);
    if (worksheetKeys.has(worksheetKey)) {
      throw new ExcelProviderRequestError("invalid_input", `worksheet name "${worksheetName}" is duplicated`, 400);
    }
    worksheetKeys.add(worksheetKey);
    normalized[worksheetName] = requireMatrix(rows, `${fieldName}.${worksheetName}`);
  }

  return normalized;
}

function normalizeWorksheetName(value: string, fieldName: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ExcelProviderRequestError("invalid_input", `${fieldName} must not contain blank worksheet names`, 400);
  }
  return trimmed;
}

function normalizeWorksheetKey(value: string) {
  return value.toLowerCase();
}

function normalizeWorksheetValues(values: unknown[][]) {
  if (values.length === 0) {
    return [];
  }

  const columnCount = values.reduce((max, row) => Math.max(max, row.length), 0);
  if (columnCount === 0) {
    return [];
  }

  return values.map((row) => {
    const normalizedRow = [...row];
    while (normalizedRow.length < columnCount) {
      normalizedRow.push(null);
    }
    return normalizedRow;
  });
}

function buildMatrixRangeAddress(values: unknown[][]) {
  const rowCount = values.length;
  const columnCount = values[0]?.length ?? 0;
  if (rowCount === 0 || columnCount === 0) {
    throw new ExcelProviderRequestError("invalid_input", "worksheet data must include at least one cell", 400);
  }

  const lastCellAddress = `${toExcelColumnLabel(columnCount)}${rowCount}`;
  return lastCellAddress === "A1" ? "A1" : `A1:${lastCellAddress}`;
}

function toExcelColumnLabel(columnNumber: number) {
  let remaining = columnNumber;
  let label = "";

  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return label;
}

function escapeOdataString(value: string) {
  return value.replaceAll("'", "''");
}

function encodeOdataFunctionStringArgument(value: string) {
  return encodeURIComponent(escapeOdataString(value));
}

function readRetryDelayMs(headers: Headers, attempt: number, fallbackMs: number) {
  const retryAfter = headers.get("Retry-After");
  const retryAfterSeconds = retryAfter == null ? Number.NaN : Number.parseFloat(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1_000;
  }
  return fallbackMs * 2 ** attempt;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });
}

function formatOptionalNumber(value: unknown) {
  const parsed = readOptionalNumber(value);
  return parsed == null ? undefined : String(parsed);
}

function formatRequiredNumber(value: unknown, fieldName: string) {
  return String(requireNumber(value, fieldName));
}

function formatOptionalStringArray(value: unknown) {
  const parsed = readOptionalStringArray(value);
  if (!parsed || parsed.length === 0) {
    return undefined;
  }
  return parsed.join(",");
}

function readOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value.map((item) => readOptionalString(item)).filter((item): item is string => Boolean(item));

  return parsed.length > 0 ? parsed : undefined;
}

function readOptionalMatrix(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  return requireMatrix(value, "matrix");
}

function requireMatrix(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ExcelProviderRequestError("invalid_input", `${fieldName} must be a two-dimensional array`, 400);
  }
  if (!value.every((row) => Array.isArray(row))) {
    throw new ExcelProviderRequestError("invalid_input", `${fieldName} must be a two-dimensional array`, 400);
  }
  return value;
}

function requireString(value: unknown, fieldName: string) {
  const parsed = readOptionalString(value);
  if (!parsed) {
    throw new ExcelProviderRequestError("invalid_input", `${fieldName} is required`, 400);
  }
  return parsed;
}

function requireAliasedString(input: Record<string, unknown>, keys: string[]) {
  const parsed = readAliasedString(input, keys);
  if (!parsed) {
    throw new ExcelProviderRequestError("invalid_input", `${keys[0]} is required`, 400);
  }
  return parsed;
}

function readAliasedString(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readOptionalString(input[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function requireBoolean(value: unknown, fieldName: string) {
  const parsed = readOptionalBoolean(value);
  if (parsed == null) {
    throw new ExcelProviderRequestError("invalid_input", `${fieldName} is required`, 400);
  }
  return parsed;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireNumber(value: unknown, fieldName: string) {
  const parsed = readOptionalNumber(value);
  if (parsed == null) {
    throw new ExcelProviderRequestError("invalid_input", `${fieldName} is required`, 400);
  }
  return parsed;
}

function readAliasedStringArray(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = readOptionalStringArray(input[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function requireNonEmptyMutationBody(input: Record<string, unknown>, message: string): Record<string, unknown> {
  const body = compactObject(input);
  if (Object.keys(body).length === 0) {
    throw new ExcelProviderRequestError("invalid_input", message, 400);
  }
  return body;
}

function readObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ExcelProviderRequestError("invalid_input", "fields must be an array", 400);
  }
  return value.map((item) => asObject(item));
}
