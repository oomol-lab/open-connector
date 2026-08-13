import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { BearerProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineBearerProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "attio";
const attioApiBaseUrl = "https://api.attio.com";
const attioSelfPath = "/v2/self";

type AttioRequestPhase = "validate" | "execute";
type AttioActionHandler = (input: Record<string, unknown>, context: BearerProviderContext) => Promise<unknown>;

export const attioActionHandlers: Record<string, AttioActionHandler> = {
  identify(_input, context) {
    return executeIdentify(context);
  },
  list_objects(_input, context) {
    return executeListObjects(context);
  },
  get_object(input, context) {
    return executeGetObject(input, context);
  },
  list_attributes(input, context) {
    return executeListAttributes(input, context);
  },
  list_records(input, context) {
    return executeListRecords(input, context);
  },
  get_record(input, context) {
    return executeGetRecord(input, context);
  },
  create_record(input, context) {
    return executeCreateRecord(input, context);
  },
  upsert_record(input, context) {
    return executeUpsertRecord(input, context);
  },
  update_record(input, context) {
    return executeUpdateRecord(input, context);
  },
  delete_record(input, context) {
    return executeDeleteRecord(input, context);
  },
};

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, attioActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAttioCredential(input.apiKey, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }) {
    return validateAttioCredential(input.accessToken, fetcher, signal);
  },
};

async function validateAttioCredential(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await attioRequest(attioSelfPath, {
    context: {
      accessToken,
      fetcher,
      signal,
    },
    method: "GET",
    phase: "validate",
  });
  const meta = optionalRecord(payload) ?? {};
  if (meta.active !== true) {
    throw new ProviderRequestError(400, "Attio token is inactive");
  }

  const workspaceName = optionalString(meta.workspace_name);
  const workspaceId = optionalString(meta.workspace_id);
  return {
    profile: {
      accountId: workspaceId,
      displayName: workspaceName ? `Attio ${workspaceName}` : "Attio Access Token",
    },
    grantedScopes: parseScopes(meta.scope),
    metadata: compactObject({
      apiBaseUrl: attioApiBaseUrl,
      validationEndpoint: attioSelfPath,
      workspaceId,
      workspaceName,
      workspaceSlug: optionalString(meta.workspace_slug),
    }),
  };
}

async function executeIdentify(context: BearerProviderContext): Promise<Record<string, unknown>> {
  const payload = await attioRequest(attioSelfPath, {
    context,
    method: "GET",
    phase: "execute",
  });
  const meta = optionalRecord(payload) ?? {};

  return {
    active: meta.active === true,
    workspaceId: optionalString(meta.workspace_id) ?? null,
    workspaceName: optionalString(meta.workspace_name) ?? null,
    workspaceSlug: optionalString(meta.workspace_slug) ?? null,
    scope: optionalString(meta.scope) ?? null,
    raw: meta,
  };
}

async function executeListObjects(context: BearerProviderContext): Promise<Record<string, unknown>> {
  const payload = await attioRequest("/v2/objects", {
    context,
    method: "GET",
    phase: "execute",
  });

  return { objects: readDataArray(payload) };
}

async function executeGetObject(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await attioRequest(`/v2/objects/${encodePath(input.object)}`, {
    context,
    method: "GET",
    phase: "execute",
  });

  return { object: readDataObject(payload) };
}

async function executeListAttributes(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const searchParams = paginationSearchParams(input);
  const showArchived = input.showArchived;
  if (typeof showArchived === "boolean") {
    searchParams.set("show_archived", String(showArchived));
  }

  const payload = await attioRequest(`/v2/${encodePath(input.target)}/${encodePath(input.identifier)}/attributes`, {
    context,
    method: "GET",
    phase: "execute",
    searchParams,
  });

  return {
    attributes: readDataArray(payload),
    pagination: readPagination(payload),
  };
}

async function executeListRecords(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  if (input.filter !== undefined && input.filterViewId !== undefined) {
    throw new ProviderRequestError(400, "filter and filterViewId cannot be used together");
  }

  const body = compactObject({
    filter: optionalRecord(input.filter),
    filter_view_id: optionalString(input.filterViewId),
    sorts: Array.isArray(input.sorts) ? input.sorts : undefined,
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
  });

  const payload = await attioRequest(`/v2/objects/${encodePath(input.object)}/records/query`, {
    context,
    method: "POST",
    phase: "execute",
    body,
  });

  return {
    records: readDataArray(payload),
    pagination: readPagination(payload),
  };
}

async function executeGetRecord(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await attioRequest(recordPath(input), {
    context,
    method: "GET",
    phase: "execute",
  });

  return { record: readDataObject(payload) };
}

async function executeCreateRecord(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await attioRequest(`/v2/objects/${encodePath(input.object)}/records`, {
    context,
    method: "POST",
    phase: "execute",
    body: recordValuesBody(input),
  });

  return { record: readDataObject(payload) };
}

async function executeUpsertRecord(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const searchParams = new URLSearchParams();
  searchParams.set("matching_attribute", String(input.matchingAttribute));

  const payload = await attioRequest(`/v2/objects/${encodePath(input.object)}/records`, {
    context,
    method: "PUT",
    phase: "execute",
    searchParams,
    body: recordValuesBody(input),
  });

  return { record: readDataObject(payload) };
}

async function executeUpdateRecord(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const method = input.mode === "overwrite_multiselect" ? "PUT" : "PATCH";
  const payload = await attioRequest(recordPath(input), {
    context,
    method,
    phase: "execute",
    body: recordValuesBody(input),
  });

  return { record: readDataObject(payload) };
}

async function executeDeleteRecord(
  input: Record<string, unknown>,
  context: BearerProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await attioRequest(recordPath(input), {
    context,
    method: "DELETE",
    phase: "execute",
  });

  return { deleted: true, raw: payload };
}

async function attioRequest(
  path: string,
  input: {
    context: Pick<BearerProviderContext, "accessToken" | "fetcher" | "signal">;
    method: string;
    phase: AttioRequestPhase;
    searchParams?: URLSearchParams;
    body?: Record<string, unknown>;
  },
): Promise<unknown> {
  const url = new URL(path, attioApiBaseUrl);
  if (input.searchParams) {
    for (const [key, value] of input.searchParams) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: input.method,
      headers: attioHeaders(input.context.accessToken, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
    payload = await readAttioPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `Attio request failed: ${error.message}` : "Attio request failed",
    );
  }

  if (!response.ok) {
    throw createAttioError(response, payload, input.phase);
  }

  return payload;
}

function attioHeaders(accessToken: string, hasBody: boolean): Record<string, string> {
  return compactObject({
    Authorization: `Bearer ${accessToken}`,
    accept: "application/json",
    "content-type": hasBody ? "application/json" : undefined,
    "user-agent": providerUserAgent,
  }) as Record<string, string>;
}

async function readAttioPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (response.ok) {
      throw new ProviderRequestError(
        502,
        error instanceof Error ? `Attio returned malformed JSON: ${error.message}` : "Attio returned malformed JSON",
      );
    }

    return text;
  }
}

function createAttioError(response: Response, payload: unknown, phase: AttioRequestPhase): ProviderRequestError {
  const message = extractAttioErrorMessage(payload) ?? response.statusText ?? "Attio request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractAttioErrorMessage(payload: unknown): string | undefined {
  const data = optionalRecord(payload);
  if (!data) {
    return typeof payload === "string" && payload ? payload : undefined;
  }

  const message = optionalString(data.message);
  if (message) {
    return message;
  }

  const error = data.error;
  if (typeof error === "string" && error) {
    return error;
  }

  if (Array.isArray(data.errors)) {
    return optionalString(optionalRecord(data.errors[0])?.message);
  }

  return undefined;
}

function readDataObject(payload: unknown): Record<string, unknown> | null {
  return optionalRecord(optionalRecord(payload)?.data) ?? null;
}

function readDataArray(payload: unknown): unknown[] {
  const data = optionalRecord(payload)?.data;
  return Array.isArray(data) ? data : [];
}

function readPagination(payload: unknown): Record<string, unknown> | null {
  const root = optionalRecord(payload);
  const pagination = optionalRecord(root?.pagination) ?? root;
  const limit = optionalInteger(pagination?.limit);
  const offset = optionalInteger(pagination?.offset);
  if (limit === undefined && offset === undefined) {
    return null;
  }

  return compactObject({ limit, offset });
}

function paginationSearchParams(input: Record<string, unknown>): URLSearchParams {
  const searchParams = new URLSearchParams();
  const limit = optionalInteger(input.limit);
  const offset = optionalInteger(input.offset);
  if (limit !== undefined) {
    searchParams.set("limit", String(limit));
  }
  if (offset !== undefined) {
    searchParams.set("offset", String(offset));
  }
  return searchParams;
}

function recordValuesBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    data: {
      values: optionalRecord(input.values) ?? {},
    },
  };
}

function recordPath(input: Record<string, unknown>): string {
  return `/v2/objects/${encodePath(input.object)}/records/${encodePath(input.recordId)}`;
}

function encodePath(value: unknown): string {
  return encodeURIComponent(String(value));
}

function parseScopes(value: unknown): string[] {
  if (typeof value !== "string") {
    return [];
  }

  return value.split(" ").filter((scope) => scope.length > 0);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
