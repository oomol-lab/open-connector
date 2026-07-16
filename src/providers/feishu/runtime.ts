import type { OAuthProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalObjectArray, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, readProviderJsonBody } from "../provider-runtime.ts";

const feishuOpenBaseUrl = "https://open.feishu.cn/open-apis";

// Feishu returns HTTP 200 with a non-zero `code` for most failures, so map the
// well-known auth codes to their real meaning instead of a generic 502. This
// provider only uses user_access_token, so the credential set is the
// user-token invalid/expired/malformed codes (not the tenant/app-token ones);
// codes verified against Feishu's generic error-code reference.
const feishuCredentialErrorCodes = new Set([20005, 20006, 99991661, 99991668, 99991671, 99991677]);
const feishuScopeErrorCodes = new Set([99991679]);

type FeishuActionContext = Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal">;
type FeishuActionHandler = (input: Record<string, unknown>, context: FeishuActionContext) => Promise<unknown>;

export interface FetchFeishuUserInfoInput {
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface FeishuApiRequestInput {
  method?: "GET" | "POST";
  path: string;
  query?: Array<[string, string]>;
  body?: Record<string, unknown>;
  context: FeishuActionContext;
}

export const feishuActionHandlers: Record<string, FeishuActionHandler> = {
  get_current_user(_input, context) {
    return feishuGetCurrentUser(context);
  },
  get_document(input, context) {
    return feishuGetDocument(input, context);
  },
  get_document_content(input, context) {
    return feishuGetDocumentContent(input, context);
  },
  list_document_blocks(input, context) {
    return feishuListDocumentBlocks(input, context);
  },
  list_bitable_tables(input, context) {
    return feishuListBitableTables(input, context);
  },
  list_bitable_fields(input, context) {
    return feishuListBitableFields(input, context);
  },
  search_bitable_records(input, context) {
    return feishuSearchBitableRecords(input, context);
  },
};

async function feishuGetCurrentUser(context: FeishuActionContext): Promise<Record<string, unknown>> {
  const data = await fetchFeishuUserInfo({
    accessToken: context.accessToken,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  return normalizeFeishuUser(data);
}

async function feishuGetDocument(
  input: Record<string, unknown>,
  context: FeishuActionContext,
): Promise<Record<string, unknown>> {
  const documentId = requiredFeishuId(input.documentId, "documentId");
  const data = await feishuApiRequest({
    path: `/docx/v1/documents/${encodeURIComponent(documentId)}`,
    context,
  });
  const document = optionalRecord(data.document) ?? {};
  return {
    documentId: optionalString(document.document_id) ?? documentId,
    revisionId: typeof document.revision_id === "number" ? document.revision_id : null,
    title: optionalString(document.title) ?? null,
    raw: document,
  };
}

async function feishuGetDocumentContent(
  input: Record<string, unknown>,
  context: FeishuActionContext,
): Promise<Record<string, unknown>> {
  const documentId = requiredFeishuId(input.documentId, "documentId");
  const data = await feishuApiRequest({
    path: `/docx/v1/documents/${encodeURIComponent(documentId)}/raw_content`,
    query: compactQuery([["lang", optionalScalarString(input.lang)]]),
    context,
  });
  return {
    documentId,
    content: optionalString(data.content) ?? "",
  };
}

async function feishuListDocumentBlocks(
  input: Record<string, unknown>,
  context: FeishuActionContext,
): Promise<Record<string, unknown>> {
  const documentId = requiredFeishuId(input.documentId, "documentId");
  const data = await feishuApiRequest({
    path: `/docx/v1/documents/${encodeURIComponent(documentId)}/blocks`,
    query: compactQuery([
      ["page_size", optionalScalarString(input.pageSize)],
      ["page_token", optionalString(input.pageToken)],
      ["document_revision_id", optionalScalarString(input.documentRevisionId)],
      ["user_id_type", optionalString(input.userIdType)],
    ]),
    context,
  });
  return normalizeFeishuPage(data);
}

async function feishuListBitableTables(
  input: Record<string, unknown>,
  context: FeishuActionContext,
): Promise<Record<string, unknown>> {
  const appToken = requiredFeishuId(input.appToken, "appToken");
  const data = await feishuApiRequest({
    path: `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables`,
    query: compactQuery([
      ["page_size", optionalScalarString(input.pageSize)],
      ["page_token", optionalString(input.pageToken)],
    ]),
    context,
  });
  return normalizeFeishuPage(data);
}

async function feishuListBitableFields(
  input: Record<string, unknown>,
  context: FeishuActionContext,
): Promise<Record<string, unknown>> {
  const appToken = requiredFeishuId(input.appToken, "appToken");
  const tableId = requiredFeishuId(input.tableId, "tableId");
  const data = await feishuApiRequest({
    path: `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`,
    query: compactQuery([
      ["view_id", optionalString(input.viewId)],
      ["page_size", optionalScalarString(input.pageSize)],
      ["page_token", optionalString(input.pageToken)],
    ]),
    context,
  });
  return normalizeFeishuPage(data);
}

async function feishuSearchBitableRecords(
  input: Record<string, unknown>,
  context: FeishuActionContext,
): Promise<Record<string, unknown>> {
  const appToken = requiredFeishuId(input.appToken, "appToken");
  const tableId = requiredFeishuId(input.tableId, "tableId");
  const body = compactObject({
    view_id: optionalString(input.viewId),
    field_names: optionalStringArray(input.fieldNames),
    filter: optionalRecord(input.filter),
    sort: Array.isArray(input.sort) ? input.sort : undefined,
  });
  const data = await feishuApiRequest({
    method: "POST",
    path: `/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/search`,
    query: compactQuery([
      ["page_size", optionalScalarString(input.pageSize)],
      ["page_token", optionalString(input.pageToken)],
      ["user_id_type", optionalString(input.userIdType)],
    ]),
    body,
    context,
  });
  return normalizeFeishuPage(data);
}

/**
 * Fetch the authorized user's profile from Feishu's user_info endpoint.
 *
 * Shared by the get_current_user action and the OAuth credential validator so
 * the identity call has a single owner.
 */
export async function fetchFeishuUserInfo(input: FetchFeishuUserInfoInput): Promise<Record<string, unknown>> {
  return feishuApiRequest({
    path: "/authen/v1/user_info",
    context: { accessToken: input.accessToken, fetcher: input.fetcher, signal: input.signal },
  });
}

/**
 * Authenticated request against the Feishu Open Platform, returning the
 * response `data` object. Owns Bearer auth, envelope parsing, and error
 * mapping for every Feishu read in this provider.
 */
async function feishuApiRequest(input: FeishuApiRequestInput): Promise<Record<string, unknown>> {
  const url = new URL(`${feishuOpenBaseUrl}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = { authorization: `Bearer ${input.context.accessToken}` };
  const init: RequestInit = {
    method: input.method ?? "GET",
    headers,
    signal: input.context.signal,
  };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json; charset=utf-8";
    init.body = JSON.stringify(input.body);
  }

  const response = await input.context.fetcher(url, init);

  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: "invalid Feishu JSON response",
  });
  const envelope = optionalRecord(payload);
  if (!envelope) {
    throw new ProviderRequestError(502, "invalid Feishu JSON response");
  }

  if (typeof envelope.code !== "number") {
    throw new ProviderRequestError(502, "invalid Feishu response: missing numeric code.");
  }

  const code = envelope.code;
  if (!response.ok || code !== 0) {
    const message = optionalString(envelope.msg) ?? `Feishu request failed (HTTP ${response.status}).`;
    const status = mapFeishuErrorStatus(response.status, code);
    throw new ProviderRequestError(status, code ? `Feishu ${code}: ${message}` : message);
  }

  const data = optionalRecord(envelope.data);
  if (!data) {
    throw new ProviderRequestError(502, "invalid Feishu response: missing data object.");
  }
  return data;
}

function normalizeFeishuUser(data: Record<string, unknown>): Record<string, unknown> {
  return {
    openId: optionalString(data.open_id) ?? null,
    unionId: optionalString(data.union_id) ?? null,
    userId: optionalString(data.user_id) ?? null,
    name: optionalString(data.name) ?? null,
    enName: optionalString(data.en_name) ?? null,
    email: optionalString(data.email) ?? null,
    avatarUrl: optionalString(data.avatar_url) ?? null,
    tenantKey: optionalString(data.tenant_key) ?? null,
    raw: data,
  };
}

/**
 * Normalize a Feishu paginated list response (`items` / `page_token` /
 * `has_more` / `total`) shared by the docx blocks and Bitable list reads.
 */
function normalizeFeishuPage(data: Record<string, unknown>): Record<string, unknown> {
  return {
    items: optionalObjectArray(data.items) ?? [],
    pageToken: optionalString(data.page_token) ?? null,
    hasMore: typeof data.has_more === "boolean" ? data.has_more : null,
    total: typeof data.total === "number" ? data.total : null,
  };
}

function mapFeishuErrorStatus(httpStatus: number, code: number): number {
  if (httpStatus === 401 || feishuCredentialErrorCodes.has(code)) {
    return 401;
  }
  if (httpStatus === 403 || feishuScopeErrorCodes.has(code)) {
    return 403;
  }
  if (httpStatus >= 400 && httpStatus < 500) {
    return httpStatus;
  }
  return 502;
}

function requiredFeishuId(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  return items.length > 0 ? items : undefined;
}

function optionalScalarString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function compactQuery(pairs: Array<[string, string | undefined]>): Array<[string, string]> {
  return pairs.filter((entry): entry is [string, string] => entry[1] !== undefined);
}
