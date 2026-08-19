import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const pinataApiBaseUrl = "https://api.pinata.cloud";
const pinataV3BaseUrl = `${pinataApiBaseUrl}/v3`;
const pinataValidationPath = "/data/testAuthentication";

type PinataRequestPhase = "validate" | "execute";
type PinataActionContext = ApiKeyProviderContext;
type PinataActionHandler = (input: Record<string, unknown>, context: PinataActionContext) => Promise<unknown>;

interface PinataRequestOptions {
  apiKey: string;
  path: string;
  method?: string;
  query?: URLSearchParams;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: PinataRequestPhase;
  notFoundAsInvalidInput?: boolean;
}

export const pinataActionHandlers: ProviderActionHandlers<"pinata", PinataActionHandler> = {
  list_files(input, context) {
    return listFiles(input, context);
  },
  get_file(input, context) {
    return getFile(input, context);
  },
  update_file(input, context) {
    return updateFile(input, context);
  },
  delete_file(input, context) {
    return deleteFile(input, context);
  },
  pin_by_cid(input, context) {
    return pinByCid(input, context);
  },
  query_pin_requests(input, context) {
    return queryPinRequests(input, context);
  },
  list_groups(input, context) {
    return listGroups(input, context);
  },
  get_group(input, context) {
    return getGroup(input, context);
  },
  create_group(input, context) {
    return createGroup(input, context);
  },
  update_group(input, context) {
    return updateGroup(input, context);
  },
  add_file_to_group(input, context) {
    return addFileToGroup(input, context);
  },
  remove_file_from_group(input, context) {
    return removeFileFromGroup(input, context);
  },
};

export async function validatePinataCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestPinataJson({
    apiKey,
    path: pinataValidationPath,
    fetcher,
    signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: "pinata-api-key",
      displayName: "Pinata API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: pinataValidationPath,
      validationMessage: optionalString(optionalRecord(payload)?.message),
      credentialHelpUrl: "https://app.pinata.cloud/developers/api-keys",
    }),
  };
}

async function listFiles(input: Record<string, unknown>, context: PinataActionContext): Promise<unknown> {
  const payload = await requestPinataJson({
    apiKey: context.apiKey,
    path: `/files/${encodeURIComponent(requiredInputString(input.network, "network"))}`,
    query: buildListFilesQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const data = requireObject(extractData(payload), "Pinata file list data");
  return {
    files: readArray(data.files).map(normalizeFile),
    nextPageToken: optionalString(data.next_page_token) ?? null,
    raw: data,
  };
}

async function getFile(input: Record<string, unknown>, context: PinataActionContext): Promise<unknown> {
  const payload = await requestPinataJson({
    apiKey: context.apiKey,
    path: `/files/${encodeURIComponent(requiredInputString(input.network, "network"))}/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { file: normalizeFile(requireObject(extractData(payload), "Pinata file data")) };
}

async function updateFile(input: Record<string, unknown>, context: PinataActionContext): Promise<unknown> {
  const payload = await requestPinataJson({
    apiKey: context.apiKey,
    path: `/files/${encodeURIComponent(requiredInputString(input.network, "network"))}/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
    method: "PUT",
    body: compactObject({
      name: optionalString(input.name),
      keyvalues: optionalRecord(input.keyvalues),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { file: normalizeFile(requireObject(extractData(payload), "Pinata file data")) };
}

async function deleteFile(input: Record<string, unknown>, context: PinataActionContext): Promise<unknown> {
  const payload = await requestPinataJson({
    apiKey: context.apiKey,
    path: `/files/${encodeURIComponent(requiredInputString(input.network, "network"))}/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { ok: true, raw: requireObject(payload, "Pinata delete file response") };
}

async function pinByCid(input: Record<string, unknown>, context: PinataActionContext): Promise<unknown> {
  const payload = await requestPinataJson({
    apiKey: context.apiKey,
    path: "/files/public/pin_by_cid",
    method: "POST",
    body: compactObject({
      cid: requiredInputString(input.cid, "cid"),
      name: optionalString(input.name),
      group_id: optionalString(input.groupId),
      keyvalues: optionalRecord(input.keyvalues),
      host_nodes: readOptionalStringArray(input.hostNodes),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    pinRequest: normalizePinRequest(requireObject(extractData(payload), "Pinata pin request data")),
  };
}

async function queryPinRequests(input: Record<string, unknown>, context: PinataActionContext): Promise<unknown> {
  const payload = await requestPinataJson({
    apiKey: context.apiKey,
    path: "/files/public/pin_by_cid",
    query: buildQuery(
      {
        order: input.order,
        status: input.status,
        cid: input.cid,
        limit: input.limit,
        pageToken: input.pageToken,
      },
      [],
    ),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const data = requireObject(extractData(payload), "Pinata pin request list data");
  return {
    pinRequests: readArray(data.jobs).map(normalizePinRequest),
    nextPageToken: optionalString(data.next_page_token) ?? null,
    raw: data,
  };
}

async function listGroups(input: Record<string, unknown>, context: PinataActionContext): Promise<unknown> {
  const payload = await requestPinataJson({
    apiKey: context.apiKey,
    path: `/groups/${encodeURIComponent(requiredInputString(input.network, "network"))}`,
    query: buildQuery(
      {
        name: input.name,
        isPublic: input.isPublic,
        limit: input.limit,
        pageToken: input.pageToken,
      },
      [["isPublic", "isPublic"]],
    ),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const data = requireObject(extractData(payload), "Pinata group list data");
  return {
    groups: readArray(data.groups).map(normalizeGroup),
    nextPageToken: optionalString(data.next_page_token) ?? null,
    raw: data,
  };
}

async function getGroup(input: Record<string, unknown>, context: PinataActionContext): Promise<unknown> {
  const payload = await requestPinataJson({
    apiKey: context.apiKey,
    path: groupPath(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { group: normalizeGroup(requireObject(extractData(payload), "Pinata group data")) };
}

async function createGroup(input: Record<string, unknown>, context: PinataActionContext): Promise<unknown> {
  const payload = await requestPinataJson({
    apiKey: context.apiKey,
    path: `/groups/${encodeURIComponent(requiredInputString(input.network, "network"))}`,
    method: "POST",
    body: compactObject({
      name: requiredInputString(input.name, "name"),
      is_public: optionalBoolean(input.isPublic),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { group: normalizeGroup(requireObject(extractData(payload), "Pinata group data")) };
}

async function updateGroup(input: Record<string, unknown>, context: PinataActionContext): Promise<unknown> {
  const payload = await requestPinataJson({
    apiKey: context.apiKey,
    path: groupPath(input),
    method: "PUT",
    body: compactObject({
      name: optionalString(input.name),
      is_public: optionalBoolean(input.isPublic),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { group: normalizeGroup(requireObject(extractData(payload), "Pinata group data")) };
}

async function addFileToGroup(input: Record<string, unknown>, context: PinataActionContext): Promise<unknown> {
  const payload = await requestPinataJson({
    apiKey: context.apiKey,
    path: `${groupPath(input)}/ids/${encodeURIComponent(requiredInputString(input.fileId, "fileId"))}`,
    method: "PUT",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { ok: true, raw: requireObject(payload, "Pinata add file to group response") };
}

async function removeFileFromGroup(input: Record<string, unknown>, context: PinataActionContext): Promise<unknown> {
  const payload = await requestPinataJson({
    apiKey: context.apiKey,
    path: `${groupPath(input)}/ids/${encodeURIComponent(requiredInputString(input.fileId, "fileId"))}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
  return { ok: true, raw: requireObject(payload, "Pinata remove file from group response") };
}

async function requestPinataJson(input: PinataRequestOptions): Promise<unknown> {
  const baseUrl = input.path === pinataValidationPath ? pinataApiBaseUrl : pinataV3BaseUrl;
  const url = new URL(`${baseUrl}${input.path}`);
  if (input.query) {
    for (const [key, value] of input.query) {
      url.searchParams.append(key, value);
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: pinataHeaders(input.apiKey, input.body !== undefined),
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Pinata request failed: ${error.message}` : "Pinata request failed",
    );
  }

  if (!response.ok) {
    throw await toPinataError(response, input.phase, input.notFoundAsInvalidInput === true);
  }

  if (response.status === 204) {
    return {};
  }

  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Pinata returned invalid JSON");
  }
}

function buildListFilesQuery(input: Record<string, unknown>): URLSearchParams {
  const query = buildQuery(
    {
      name: input.name,
      group: input.group,
      mimeType: input.mimeType,
      cid: input.cid,
      cidPending: input.cidPending,
      limit: input.limit,
      order: input.order,
      pageToken: input.pageToken,
    },
    [
      ["mimeType", "mimeType"],
      ["cidPending", "cidPending"],
    ],
  );
  const metadata = optionalRecord(input.metadata);
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value == "string") {
        query.set(`metadata[${key}]`, value);
      }
    }
  }
  return query;
}

function buildQuery(input: Record<string, unknown>, aliases: readonly [string, string][]): URLSearchParams {
  const query = new URLSearchParams();
  const aliasMap = new Map(aliases);
  for (const [key, value] of Object.entries(input)) {
    if (value == null) {
      continue;
    }
    const queryKey = aliasMap.get(key) ?? key;
    if (typeof value == "string" || typeof value == "number" || typeof value == "boolean") {
      query.set(queryKey, String(value));
    }
  }
  return query;
}

function groupPath(input: Record<string, unknown>): string {
  return `/groups/${encodeURIComponent(requiredInputString(input.network, "network"))}/${encodeURIComponent(
    requiredInputString(input.groupId ?? input.id, "groupId"),
  )}`;
}

function pinataHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function toPinataError(
  response: Response,
  phase: PinataRequestPhase,
  notFoundAsInvalidInput: boolean,
): Promise<ProviderRequestError> {
  const payload = await readPinataErrorPayload(response);
  const message = readErrorMessage(payload) ?? `Pinata request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(404, message, payload);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

async function readPinataErrorPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload == "string") {
    return payload;
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  const direct = optionalString(object.message) ?? optionalString(object.error) ?? optionalString(object.reason);
  if (direct) {
    return direct;
  }
  const nested = optionalRecord(object.error);
  return optionalString(nested?.message) ?? optionalString(nested?.reason);
}

function extractData(payload: unknown): unknown {
  const object = requireObject(payload, "Pinata response");
  return "data" in object ? object.data : object;
}

function normalizeFile(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "Pinata file");
  return {
    id: requireOutputString(record.id, "file id"),
    name: requireOutputString(record.name, "file name"),
    cid: optionalString(record.cid) ?? null,
    size: optionalNumber(record.size) ?? null,
    numberOfFiles: optionalNumber(record.number_of_files) ?? null,
    mimeType: optionalString(record.mime_type) ?? null,
    groupId: optionalString(record.group_id) ?? null,
    keyvalues: optionalRecord(record.keyvalues) ?? null,
    createdAt: optionalString(record.created_at) ?? null,
    raw: record,
  };
}

function normalizeGroup(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "Pinata group");
  return {
    id: requireOutputString(record.id, "group id"),
    name: requireOutputString(record.name, "group name"),
    isPublic: optionalBoolean(record.is_public ?? record.public) ?? null,
    createdAt: optionalString(record.created_at) ?? null,
    raw: record,
  };
}

function normalizePinRequest(value: unknown): Record<string, unknown> {
  const record = requireObject(value, "Pinata pin request");
  return {
    id: requireOutputString(record.id, "pin request id"),
    cid: requireOutputString(record.cid, "pin request cid"),
    name: optionalString(record.name) ?? null,
    status: optionalString(record.status) ?? null,
    keyvalues: optionalRecord(record.keyvalues) ?? null,
    groupId: optionalString(record.group_id) ?? null,
    hostNodes: readOptionalStringArray(record.host_nodes ?? record.hose_nodes) ?? [],
    dateQueued: optionalString(record.date_queued) ?? null,
    raw: record,
  };
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${label} must be an object`, value);
  }
  return object;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requireOutputString(value: unknown, label: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `Pinata ${label} is missing`);
  }
  return parsed;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  return Array.isArray(value) ? value.filter((item) => typeof item == "string") : undefined;
}
