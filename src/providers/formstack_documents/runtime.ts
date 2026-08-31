import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

export interface FormstackDocumentsContext {
  values: Record<string, string>;
  fetcher: typeof fetch;
}

export const formstackDocumentsApiBaseUrl = "https://www.webmerge.me/api";
const requestTimeoutMs = 60_000;

interface Credentials {
  apiKey: string;
  apiSecret: string;
}
type RequestPhase = "validate" | "execute";
export const formstackDocumentsActionHandlers: ProviderActionHandlers<
  "formstack_documents",
  ProviderRuntimeHandler<FormstackDocumentsContext>
> = {
  async list_documents(input, context) {
    const payload = await request({
      credentials: readCredentials(context.values),
      path: "/documents",
      method: "GET",
      fetcher: context.fetcher,
      phase: "execute",
      operation: "list documents",
      query: {
        search: optionalString(input.search),
        folder: optionalString(input.folder),
      },
    });
    return { documents: requireArray(payload, "documents") };
  },
  async get_document(input, context) {
    return { document: await requestDocument(input, context, "get document") };
  },
  async get_document_fields(input, context) {
    const documentId = requiredInputString(input.document_id, "document_id");
    const payload = await request({
      credentials: readCredentials(context.values),
      path: `/documents/${encodeURIComponent(documentId)}/fields`,
      method: "GET",
      fetcher: context.fetcher,
      phase: "execute",
      operation: "get document fields",
      query: { attributes: input.attributes === true ? "1" : undefined },
    });
    return { fields: requireArray(payload, "fields") };
  },
  async create_document(input, context) {
    validateCreateDocumentInput(input);
    const payload = await request({
      credentials: readCredentials(context.values),
      path: "/documents",
      method: "POST",
      fetcher: context.fetcher,
      phase: "execute",
      operation: "create document",
      body: compactObject(input),
    });
    return { document: requireObject(payload, "document") };
  },
  async update_document(input, context) {
    validateUpdateDocumentInput(input);
    const documentId = requiredInputString(input.document_id, "document_id");
    const { document_id: _documentId, ...body } = input;
    const payload = await request({
      credentials: readCredentials(context.values),
      path: `/documents/${encodeURIComponent(documentId)}`,
      method: "PUT",
      fetcher: context.fetcher,
      phase: "execute",
      operation: "update document",
      body: compactObject(body),
    });
    return { document: requireObject(payload, "document") };
  },
  async copy_document(input, context) {
    const documentId = requiredInputString(input.document_id, "document_id");
    const payload = await request({
      credentials: readCredentials(context.values),
      path: `/documents/${encodeURIComponent(documentId)}/copy`,
      method: "POST",
      fetcher: context.fetcher,
      phase: "execute",
      operation: "copy document",
      body: { name: input.name },
    });
    return { document: requireObject(payload, "document") };
  },
  async delete_document(input, context) {
    const documentId = requiredInputString(input.document_id, "document_id");
    const payload = await request({
      credentials: readCredentials(context.values),
      path: `/documents/${encodeURIComponent(documentId)}`,
      method: "DELETE",
      fetcher: context.fetcher,
      phase: "execute",
      operation: "delete document",
    });
    const result = requireObject(payload, "delete document");
    return {
      deleted: result.success === 1 || result.success === "1" || result.success === true,
      document_id: documentId,
    };
  },
};

export async function validateFormstackDocumentsCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ profile: { displayName: string }; grantedScopes: string[] }> {
  const payload = await request({
    credentials: readCredentials(input),
    path: "/documents",
    method: "GET",
    fetcher,
    phase: "validate",
    operation: "validate credentials",
    query: { search: "__oomol_connector_validation__" },
  });
  requireArray(payload, "credential validation");
  return {
    profile: { displayName: "Formstack Documents API Key" },
    grantedScopes: [],
  };
}
async function requestDocument(input: Record<string, unknown>, context: FormstackDocumentsContext, operation: string) {
  const documentId = requiredInputString(input.document_id, "document_id");
  return requireObject(
    await request({
      credentials: readCredentials(context.values),
      path: `/documents/${encodeURIComponent(documentId)}`,
      method: "GET",
      fetcher: context.fetcher,
      phase: "execute",
      operation,
    }),
    "document",
  );
}

async function request(options: {
  credentials: Credentials;
  path: string;
  method: string;
  fetcher: typeof fetch;
  phase: RequestPhase;
  operation: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(`${formstackDocumentsApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {}))
    if (value !== undefined) url.searchParams.set(key, value);
  const timeout = createProviderTimeout(undefined, requestTimeoutMs);
  try {
    const response = await options.fetcher(url, {
      method: options.method,
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${options.credentials.apiKey}:${options.credentials.apiSecret}`).toString("base64")}`,
        ...(options.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: timeout.signal,
    });
    const text = await response.text();
    const payload = response.ok ? parseJson(text, options.operation) : parseErrorPayload(text);
    if (!response.ok) {
      const authError = response.status === 401 || response.status === 403;
      throw new ProviderRequestError(
        authError && options.phase === "validate" ? 400 : response.status,
        extractError(payload) ?? `Formstack Documents ${options.operation} failed with HTTP ${response.status}.`,
        payload,
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || (error instanceof DOMException && error.name === "AbortError")) {
      throw new ProviderRequestError(504, `Formstack Documents ${options.operation} request timed out.`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Formstack Documents ${options.operation} request failed: ${error.message}`
        : `Formstack Documents ${options.operation} request failed.`,
    );
  } finally {
    timeout.cleanup();
  }
}

function readCredentials(values: Record<string, string>): Credentials {
  return {
    apiKey: requiredInputString(values.apiKey, "apiKey"),
    apiSecret: requiredInputString(values.apiSecret, "apiSecret"),
  };
}

function validateCreateDocumentInput(input: Record<string, unknown>): void {
  if (input.type === "html") {
    if (typeof input.html !== "string") {
      throw new ProviderRequestError(400, "html is required when type is html");
    }
    if (input.file_url !== undefined) {
      throw new ProviderRequestError(400, "file_url cannot be used when type is html");
    }
    return;
  }
  if (typeof input.file_url !== "string") {
    throw new ProviderRequestError(400, "file_url is required for non-HTML document types");
  }
  if (input.html !== undefined) {
    throw new ProviderRequestError(400, "html can only be used when type is html");
  }
}

function validateUpdateDocumentInput(input: Record<string, unknown>): void {
  if (Object.keys(input).every((key) => key === "document_id")) {
    throw new ProviderRequestError(400, "At least one document field must be provided");
  }
}
function requireArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value))
    throw new ProviderRequestError(502, `Formstack Documents ${name} response must be an array.`, value);
  return value;
}
function requireObject(value: unknown, name: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(502, `Formstack Documents ${name} response must be an object.`, value);
  return object;
}
function parseJson(text: string, operation: string): unknown {
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, `Formstack Documents ${operation} returned invalid JSON.`);
  }
}

function parseErrorPayload(text: string): unknown {
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
function extractError(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload || undefined;
  const object = optionalRecord(payload);
  return optionalString(object?.message) ?? optionalString(object?.error);
}
