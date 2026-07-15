import type { OAuthProviderContext } from "../provider-runtime.ts";
import type { FeishuActionName } from "./actions.ts";

import { optionalObjectArray, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const feishuOpenBaseUrl = "https://open.feishu.cn/open-apis";

type FeishuActionContext = Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal">;
type FeishuActionHandler = (input: Record<string, unknown>, context: FeishuActionContext) => Promise<unknown>;

interface FeishuEnvelope {
  code?: unknown;
  msg?: unknown;
  data?: unknown;
}

export const feishuActionHandlers: Record<FeishuActionName, FeishuActionHandler> = {
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
  const documentId = requiredDocumentId(input);
  const data = await feishuApiGet({
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
  const documentId = requiredDocumentId(input);
  const lang = optionalScalarString(input.lang);
  const data = await feishuApiGet({
    path: `/docx/v1/documents/${encodeURIComponent(documentId)}/raw_content`,
    query: compactQuery([["lang", lang]]),
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
  const documentId = requiredDocumentId(input);
  const data = await feishuApiGet({
    path: `/docx/v1/documents/${encodeURIComponent(documentId)}/blocks`,
    query: compactQuery([
      ["page_size", optionalScalarString(input.pageSize)],
      ["page_token", optionalString(input.pageToken)],
      ["document_revision_id", optionalScalarString(input.documentRevisionId)],
      ["user_id_type", optionalString(input.userIdType)],
    ]),
    context,
  });
  return {
    items: optionalObjectArray(data.items) ?? [],
    pageToken: optionalString(data.page_token) ?? null,
    hasMore: typeof data.has_more === "boolean" ? data.has_more : null,
  };
}

/**
 * Fetch the authorized user's profile from Feishu's user_info endpoint.
 *
 * Shared by the get_current_user action and the OAuth credential validator so
 * the identity call has a single owner.
 */
export async function fetchFeishuUserInfo(input: {
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  return feishuApiGet({
    path: "/authen/v1/user_info",
    context: { accessToken: input.accessToken, fetcher: input.fetcher, signal: input.signal },
  });
}

/**
 * Authenticated GET against the Feishu Open Platform, returning the response
 * `data` object. Owns Bearer auth, envelope parsing, and error mapping for
 * every Feishu read in this provider.
 */
async function feishuApiGet(input: {
  path: string;
  query?: Array<[string, string]>;
  context: FeishuActionContext;
}): Promise<Record<string, unknown>> {
  const url = new URL(`${feishuOpenBaseUrl}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    url.searchParams.set(key, value);
  }

  const response = await input.context.fetcher(url, {
    method: "GET",
    headers: { authorization: `Bearer ${input.context.accessToken}` },
    signal: input.context.signal,
  });

  const rawText = await response.text();
  let envelope: FeishuEnvelope;
  try {
    envelope = JSON.parse(rawText) as FeishuEnvelope;
  } catch {
    throw new ProviderRequestError(502, "invalid Feishu JSON response");
  }

  const code = typeof envelope.code === "number" ? envelope.code : 0;
  if (!response.ok || code !== 0) {
    const message = optionalString(envelope.msg) ?? `Feishu request failed (HTTP ${response.status}).`;
    const status =
      response.status === 401 ? 401 : response.status >= 400 && response.status < 500 ? response.status : 502;
    throw new ProviderRequestError(status, code ? `Feishu ${code}: ${message}` : message);
  }

  return optionalRecord(envelope.data) ?? {};
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

function requiredDocumentId(input: Record<string, unknown>): string {
  return requiredString(input.documentId, "documentId", (message) => new ProviderRequestError(400, message));
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
