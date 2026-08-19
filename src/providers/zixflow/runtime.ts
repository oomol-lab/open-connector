import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { compactJson, encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const zixflowApiBaseUrl = "https://api.zixflow.com/api/v1";

const zixflowValidationPath = "/workspace-members";
const zixflowDefaultRequestTimeoutMs = 30_000;

type ZixflowRequestPhase = "validate" | "execute";
type ZixflowActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface ZixflowRequestOptions {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  phase: ZixflowRequestPhase;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

export const zixflowActionHandlers: ProviderActionHandlers<"zixflow", ZixflowActionHandler> = {
  list_collections(_input, context) {
    return requestZixflowWrapped(context, "/collections", "execute", "collections");
  },
  get_collection(input, context) {
    return requestZixflowWrapped(
      context,
      `/collections/${encodePathSegment(requiredString(input.collectionId, "collectionId", badInput))}`,
      "execute",
      "collection",
    );
  },
  query_collection_records(input, context) {
    return requestZixflowWrapped(
      context,
      `/collection-records/${encodePathSegment(requiredString(input.collectionId, "collectionId", badInput))}/query`,
      "execute",
      "records",
      "POST",
      buildQueryBody(input),
    );
  },
  get_collection_record(input, context) {
    return requestZixflowWrapped(
      context,
      `/collection-records/${encodePathSegment(requiredString(input.collectionId, "collectionId", badInput))}/${encodePathSegment(requiredString(input.recordId, "recordId", badInput))}`,
      "execute",
      "record",
    );
  },
  create_collection_record(input, context) {
    return createDynamicItem(input, context, "collection-records", "collectionId", "record");
  },
  update_collection_record(input, context) {
    return requestZixflowStatus(
      context,
      `/collection-records/${encodePathSegment(requiredString(input.collectionId, "collectionId", badInput))}/${encodePathSegment(requiredString(input.recordId, "recordId", badInput))}`,
      "execute",
      "PATCH",
      requiredRecord(input.record, "record", badInput),
    );
  },
  delete_collection_record(input, context) {
    return requestZixflowStatus(
      context,
      `/collection-records/${encodePathSegment(requiredString(input.collectionId, "collectionId", badInput))}/${encodePathSegment(requiredString(input.recordId, "recordId", badInput))}`,
      "execute",
      "DELETE",
    );
  },
  list_lists(_input, context) {
    return requestZixflowWrapped(context, "/lists", "execute", "lists");
  },
  get_list(input, context) {
    return requestZixflowWrapped(
      context,
      `/lists/${encodePathSegment(requiredString(input.listId, "listId", badInput))}`,
      "execute",
      "list",
    );
  },
  query_list_entries(input, context) {
    return requestZixflowWrapped(
      context,
      `/list-entries/${encodePathSegment(requiredString(input.listId, "listId", badInput))}/query`,
      "execute",
      "entries",
      "POST",
      buildQueryBody(input),
    );
  },
  get_list_entry(input, context) {
    return requestZixflowWrapped(
      context,
      `/list-entries/${encodePathSegment(requiredString(input.listId, "listId", badInput))}/${encodePathSegment(requiredString(input.entryId, "entryId", badInput))}`,
      "execute",
      "entry",
    );
  },
  create_list_entry(input, context) {
    return createDynamicItem(input, context, "list-entries", "listId", "entry");
  },
  update_list_entry(input, context) {
    return requestZixflowStatus(
      context,
      `/list-entries/${encodePathSegment(requiredString(input.listId, "listId", badInput))}/${encodePathSegment(requiredString(input.entryId, "entryId", badInput))}`,
      "execute",
      "PATCH",
      requiredRecord(input.entry, "entry", badInput),
    );
  },
  delete_list_entry(input, context) {
    return requestZixflowStatus(
      context,
      `/list-entries/${encodePathSegment(requiredString(input.listId, "listId", badInput))}/${encodePathSegment(requiredString(input.entryId, "entryId", badInput))}`,
      "execute",
      "DELETE",
    );
  },
  list_workspace_members(_input, context) {
    return requestZixflowWrapped(context, "/workspace-members", "execute", "members");
  },
  get_workspace_member(input, context) {
    return requestZixflowWrapped(
      context,
      `/workspace-members/${encodePathSegment(requiredString(input.memberId, "memberId", badInput))}`,
      "execute",
      "member",
    );
  },
};

export async function validateZixflowCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const result = await requestZixflowWrapped({ apiKey, fetcher, signal }, zixflowValidationPath, "validate", "members");
  const members = Array.isArray(result.members) ? result.members : [];
  const firstMember = members.find(optionalRecord);
  const memberId = firstMember?._id === undefined ? undefined : String(firstMember._id);
  const memberName = optionalString(firstMember?.name);
  const memberEmail = optionalString(firstMember?.email);

  return {
    profile: {
      accountId: memberId ? `zixflow:member:${memberId}` : "zixflow",
      displayName: memberName ?? memberEmail ?? "Zixflow API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: zixflowValidationPath,
      memberId,
      memberName,
      memberEmail,
      memberCount: members.length,
    }),
  };
}

async function createDynamicItem(
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  family: "collection-records" | "list-entries",
  parentKey: "collectionId" | "listId",
  outputKey: "record" | "entry",
): Promise<Record<string, unknown>> {
  const payload = await requestZixflowRaw({
    context,
    path: `/${family}/${encodePathSegment(requiredString(input[parentKey], parentKey, badInput))}`,
    phase: "execute",
    method: "POST",
    body: requiredRecord(input[outputKey], outputKey, badInput),
  });

  const itemId = payload._id === undefined ? undefined : String(payload._id);
  return compactObject({
    status: readStatus(payload),
    message: readMessage(payload),
    [outputKey === "record" ? "recordId" : "entryId"]: itemId,
    [outputKey]: optionalRecord(payload.data) ?? {},
  });
}

async function requestZixflowWrapped(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  phase: ZixflowRequestPhase,
  outputKey: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
): Promise<Record<string, unknown>> {
  const payload = await requestZixflowRaw({ context, path, phase, method, body });
  return {
    status: readStatus(payload),
    message: readMessage(payload),
    [outputKey]: payload.data,
  };
}

async function requestZixflowStatus(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  phase: ZixflowRequestPhase,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
): Promise<Record<string, unknown>> {
  const payload = await requestZixflowRaw({ context, path, phase, method, body });
  return {
    status: readStatus(payload),
    message: readMessage(payload),
  };
}

async function requestZixflowRaw(input: ZixflowRequestOptions): Promise<Record<string, unknown>> {
  const response = await fetchZixflow(input);
  const payload = await readZixflowPayload(response);

  if (!response.ok) {
    throw createZixflowError(response, payload, input.phase);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Zixflow returned a non-object JSON payload", payload);
  }

  if (record.status === false) {
    throw new ProviderRequestError(input.phase === "validate" ? 400 : 502, readMessage(record), record);
  }

  return record;
}

async function fetchZixflow(input: ZixflowRequestOptions): Promise<Response> {
  const timeout = createProviderTimeout(input.context.signal, zixflowDefaultRequestTimeoutMs);
  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${input.context.apiKey}`,
      "user-agent": providerUserAgent,
    };
    const init: RequestInit = {
      method: input.method ?? "GET",
      headers,
      signal: timeout.signal,
    };

    if (input.body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(input.body);
    }

    return await input.context.fetcher(new URL(`${zixflowApiBaseUrl}${input.path}`), init);
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Zixflow request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Zixflow request failed: ${error.message}` : "Zixflow request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readZixflowPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Zixflow returned invalid JSON");
  }
}

function createZixflowError(response: Response, payload: unknown, phase: ZixflowRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message = record ? readMessage(record) : `Zixflow request failed with ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 409, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function buildQueryBody(input: Record<string, unknown>): unknown {
  return compactJson({
    filter: optionalRecord(input.filter),
    sort: Array.isArray(input.sort) ? input.sort : undefined,
    limit: input.limit,
    offset: input.offset,
  });
}

function readStatus(payload: Record<string, unknown>): boolean {
  return typeof payload.status === "boolean" ? payload.status : true;
}

function readMessage(payload: Record<string, unknown>): string {
  return typeof payload.message === "string" ? payload.message : "success";
}

function badInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
