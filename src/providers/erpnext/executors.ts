import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ErpnextActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "erpnext";
const erpnextLoggedUserMethod = "frappe.auth.get_logged_user";
const erpnextGetCountMethod = "frappe.client.get_count";
const erpnextGetValueMethod = "frappe.client.get_value";
const erpnextSetValueMethod = "frappe.client.set_value";

type ErpnextRequestPhase = "validate" | "execute";

interface ErpnextActionContext {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface ErpnextRequestOptions {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  fetcher: typeof fetch;
  phase: ErpnextRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, string | undefined>;
  body?: unknown;
}

type ErpnextActionHandler = (input: Record<string, unknown>, context: ErpnextActionContext) => Promise<unknown>;

const erpnextActionHandlers: Record<ErpnextActionName, ErpnextActionHandler> = {
  async get_logged_user(_input, context) {
    const payload = await requestErpnext({
      ...context,
      path: buildMethodPath(erpnextLoggedUserMethod),
      method: "GET",
      phase: "execute",
    });

    return {
      user: readRequiredMessageString(payload, "ERPNext get_logged_user response"),
    };
  },
  async list_documents(input, context) {
    const payload = await requestErpnext({
      ...context,
      path: buildResourcePath(readRequiredString(input.doctype, "doctype")),
      method: "GET",
      query: compactObject({
        fields: encodeOptionalJson(input.fields),
        filters: encodeOptionalJson(input.filters),
        order_by: optionalString(input.order_by),
        limit_start: readOptionalIntegerString(input.start),
        limit_page_length: readOptionalIntegerString(input.page_length),
      }),
      phase: "execute",
    });

    return {
      documents: readRequiredDataArray(payload, "ERPNext list_documents response"),
    };
  },
  async get_document(input, context) {
    const payload = await requestErpnext({
      ...context,
      path: buildDocumentPath(readRequiredString(input.doctype, "doctype"), readRequiredString(input.name, "name")),
      method: "GET",
      phase: "execute",
    });

    return {
      document: readRequiredDataObject(payload, "ERPNext get_document response"),
    };
  },
  async create_document(input, context) {
    const payload = await requestErpnext({
      ...context,
      path: buildResourcePath(readRequiredString(input.doctype, "doctype")),
      method: "POST",
      body: readRequiredInputObject(input.data, "data"),
      phase: "execute",
    });

    return {
      document: readRequiredDataObject(payload, "ERPNext create_document response"),
    };
  },
  async update_document(input, context) {
    const payload = await requestErpnext({
      ...context,
      path: buildDocumentPath(readRequiredString(input.doctype, "doctype"), readRequiredString(input.name, "name")),
      method: "PUT",
      body: readRequiredInputObject(input.fields, "fields"),
      phase: "execute",
    });

    return {
      document: readRequiredDataObject(payload, "ERPNext update_document response"),
    };
  },
  async delete_document(input, context) {
    await requestErpnext({
      ...context,
      path: buildDocumentPath(readRequiredString(input.doctype, "doctype"), readRequiredString(input.name, "name")),
      method: "DELETE",
      phase: "execute",
    });

    return {
      ok: true,
    };
  },
  async get_document_count(input, context) {
    const payload = await requestErpnext({
      ...context,
      path: buildMethodPath(erpnextGetCountMethod),
      method: "GET",
      query: compactObject({
        doctype: readRequiredString(input.doctype, "doctype"),
        filters: encodeOptionalJson(input.filters),
      }),
      phase: "execute",
    });

    return {
      count: readRequiredMessageInteger(payload, "ERPNext get_document_count response"),
    };
  },
  async get_document_value(input, context) {
    assertExactlyOneNameOrFilters(input);
    const payload = await requestErpnext({
      ...context,
      path: buildMethodPath(erpnextGetValueMethod),
      method: "GET",
      query: compactObject({
        doctype: readRequiredString(input.doctype, "doctype"),
        name: optionalString(input.name),
        filters: encodeOptionalJson(input.filters),
        fieldname: encodeFieldNames(input.fieldname),
      }),
      phase: "execute",
    });

    return {
      value: readRequiredMessageValue(payload, "ERPNext get_document_value response"),
    };
  },
  async set_document_value(input, context) {
    const payload = await requestErpnext({
      ...context,
      path: buildMethodPath(erpnextSetValueMethod),
      method: "POST",
      body: {
        doctype: readRequiredString(input.doctype, "doctype"),
        name: readRequiredString(input.name, "name"),
        fieldname: readRequiredString(input.fieldname, "fieldname"),
        value: input.value,
      },
      phase: "execute",
    });

    return {
      document: readRequiredDocumentFromMethodResult(payload, "ERPNext set_document_value response"),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ErpnextActionContext>({
  service,
  handlers: erpnextActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ErpnextActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiSecret: readRequiredString(credential.values.apiSecret, "apiSecret"),
      baseUrl: normalizeBaseUrl(
        optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const baseUrl = normalizeBaseUrl(
      optionalString(credential.values.baseUrl) ?? optionalString(credential.metadata.baseUrl),
    );
    const apiSecret = readRequiredString(credential.values.apiSecret, "apiSecret");
    const url = createProviderProxyUrl(baseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `token ${credential.apiKey}:${apiSecret}`);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const baseUrl = normalizeBaseUrl(input.values.baseUrl);
    const apiSecret = readRequiredString(input.values.apiSecret, "apiSecret");
    const payload = await requestErpnext({
      baseUrl,
      apiKey: input.apiKey,
      apiSecret,
      path: buildMethodPath(erpnextLoggedUserMethod),
      method: "GET",
      fetcher,
      signal,
      phase: "validate",
    });
    const user = readRequiredMessageString(payload, "ERPNext validation response");

    return {
      profile: {
        accountId: user,
        displayName: user,
      },
      grantedScopes: [],
      metadata: {
        baseUrl,
        validationEndpoint: buildMethodPath(erpnextLoggedUserMethod),
        user,
      },
    };
  },
};

async function requestErpnext(input: ErpnextRequestOptions): Promise<unknown> {
  const url = buildUrl(input.baseUrl, input.path, input.query);
  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: buildHeaders(input.apiKey, input.apiSecret, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `ERPNext request failed for ${url}: ${error.message}`
        : `ERPNext request failed for ${url}`,
    );
  }

  const payload = await readErpnextPayload(response);
  if (!response.ok) {
    throw createErpnextError(response.status, payload, input.phase);
  }
  return payload;
}

function normalizeBaseUrl(value: unknown): string {
  const raw = optionalString(value);
  if (!raw) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }

  const url = assertPublicHttpUrl(raw, {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "baseUrl must use HTTPS");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "baseUrl must not include username or password");
  }

  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/+$/, "");
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(path.startsWith("/") ? path.slice(1) : path, `${baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function buildHeaders(apiKey: string, apiSecret: string, hasBody: boolean): Headers {
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `token ${apiKey}:${apiSecret}`,
    "User-Agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

function buildResourcePath(doctype: string): string {
  return `/api/resource/${encodeURIComponent(doctype)}`;
}

function buildDocumentPath(doctype: string, name: string): string {
  return `${buildResourcePath(doctype)}/${encodeURIComponent(name)}`;
}

function buildMethodPath(methodName: string): string {
  return `/api/method/${methodName}`;
}

async function readErpnextPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      message: text,
    };
  }
}

function createErpnextError(status: number, payload: unknown, phase: ErpnextRequestPhase): ProviderRequestError {
  const message = extractErpnextErrorMessage(payload) ?? `ERPNext request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message);
  }
  if (status === 400 || status === 404 || status === 409 || status === 417 || status === 422) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function extractErpnextErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const directMessage =
    optionalString(record.exception) ??
    optionalString(record.exc_type) ??
    optionalString(record._error_message) ??
    optionalString(record.message);
  if (directMessage) {
    return directMessage;
  }

  return parseServerMessages(optionalString(record._server_messages));
}

function parseServerMessages(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return undefined;
    }
    const firstMessage = parsed[0];
    if (typeof firstMessage === "string") {
      try {
        const nested = JSON.parse(firstMessage) as unknown;
        return optionalString(optionalRecord(nested)?.message);
      } catch {
        return optionalString(firstMessage);
      }
    }
  } catch {
    return value;
  }

  return undefined;
}

function readRequiredDataArray(payload: unknown, context: string): Array<Record<string, unknown>> {
  const data = optionalRecord(payload)?.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, `${context} did not include a data array`);
  }
  return data.map((item) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, `${context} contained a non-object document`);
    }
    return record;
  });
}

function readRequiredDataObject(payload: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(optionalRecord(payload)?.data);
  if (!record) {
    throw new ProviderRequestError(502, `${context} did not include a data object`);
  }
  return record;
}

function readRequiredMessageString(payload: unknown, context: string): string {
  const message = optionalRecord(payload)?.message;
  if (typeof message !== "string" || !message.trim()) {
    throw new ProviderRequestError(502, `${context} did not include a message string`);
  }
  return message;
}

function readRequiredMessageInteger(payload: unknown, context: string): number {
  const message = optionalRecord(payload)?.message;
  if (!Number.isInteger(message)) {
    throw new ProviderRequestError(502, `${context} did not include an integer message`);
  }
  return message as number;
}

function readRequiredMessageValue(payload: unknown, context: string): unknown {
  const record = optionalRecord(payload);
  if (!record || !Object.hasOwn(record, "message")) {
    throw new ProviderRequestError(502, `${context} did not include a message value`);
  }
  return record.message;
}

function readRequiredDocumentFromMethodResult(payload: unknown, context: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${context} did not include an object payload`);
  }

  const docs = record.docs;
  if (Array.isArray(docs) && docs.length > 0) {
    const firstDocument = optionalRecord(docs[0]);
    if (firstDocument) {
      return firstDocument;
    }
  }

  const messageDocument = optionalRecord(record.message);
  if (messageDocument) {
    return messageDocument;
  }

  throw new ProviderRequestError(502, `${context} did not include a document`);
}

function encodeOptionalJson(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return JSON.stringify(value);
}

function encodeFieldNames(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  throw new ProviderRequestError(400, "fieldname must be a string or string array");
}

function assertExactlyOneNameOrFilters(input: Record<string, unknown>): void {
  const hasName = optionalString(input.name) !== undefined;
  const hasFilters = input.filters !== undefined;
  if (hasName === hasFilters) {
    throw new ProviderRequestError(400, "Provide exactly one of name or filters");
  }
}

function readRequiredString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function readRequiredInputObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return record;
}

function readOptionalIntegerString(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined;
  }
  return String(value);
}
