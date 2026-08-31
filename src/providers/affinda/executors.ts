import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  defineProviderExecutors,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "affinda";
const affindaDefaultApiBaseUrl = "https://api.affinda.com";
const affindaOfficialApiBaseUrls = new Set([
  affindaDefaultApiBaseUrl,
  "https://api.us1.affinda.com",
  "https://api.eu1.affinda.com",
]);
const affindaOrganizationsPath = "/v3/organizations";
const affindaWorkspacesPath = "/v3/workspaces";
const affindaDocumentTypesPath = "/v3/document_types";
const affindaDocumentsPath = "/v3/documents";

type AffindaRequestPhase = "validate" | "execute";

interface AffindaActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AffindaActionHandler = (input: Record<string, unknown>, context: AffindaActionContext) => Promise<unknown>;

export const affindaActionHandlers: ProviderActionHandlers<"affinda", AffindaActionHandler> = {
  async list_organizations(_input, context) {
    const payload = await requestAffindaJson({
      path: affindaOrganizationsPath,
      context,
      phase: "execute",
    });
    return { organizations: readAffindaArray(payload, "organizations") };
  },

  async list_workspaces(input, context) {
    const payload = await requestAffindaJson({
      path: affindaWorkspacesPath,
      query: {
        organization: optionalString(input.organization),
        name: optionalString(input.name),
      },
      context,
      phase: "execute",
    });
    return { workspaces: readAffindaArray(payload, "workspaces") };
  },

  async list_document_types(input, context) {
    const payload = await requestAffindaJson({
      path: affindaDocumentTypesPath,
      query: {
        organization: optionalString(input.organization),
        workspace: optionalString(input.workspace),
      },
      context,
      phase: "execute",
    });
    return { documentTypes: readAffindaArray(payload, "document types") };
  },

  async create_document_from_url(input, context) {
    validateCreateDocumentInput(input);
    const payload = await requestAffindaJson({
      path: affindaDocumentsPath,
      method: "POST",
      body: buildCreateDocumentFormData(input),
      context,
      phase: "execute",
    });
    return { document: readAffindaObject(payload, "document") };
  },

  async list_documents(input, context) {
    const payload = readAffindaObject(
      await requestAffindaJson({
        path: affindaDocumentsPath,
        query: buildListDocumentsQuery(input),
        context,
        phase: "execute",
      }),
      "document page",
    );
    const documents = readAffindaArray(payload.results, "documents");
    if (typeof payload.count !== "number") {
      throw new ProviderRequestError(502, "Affinda document page missing count");
    }
    return {
      documents,
      count: payload.count,
      next: readNullableString(payload.next),
      previous: readNullableString(payload.previous),
    };
  },

  async get_document(input, context) {
    const identifier = requiredString(input.identifier, "identifier", providerInputError);
    const payload = await requestAffindaJson({
      path: `${affindaDocumentsPath}/${encodePathSegment(identifier)}`,
      query: {
        compact: optionalBoolean(input.compact),
      },
      context,
      phase: "execute",
    });
    return { document: readAffindaObject(payload, "document") };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AffindaActionContext>({
  service,
  handlers: affindaActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AffindaActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveAffindaApiBaseUrl(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiBaseUrl = resolveAffindaApiBaseUrl(input.values);
    const organizations = readAffindaArray(
      await requestAffindaJson({
        path: affindaOrganizationsPath,
        context: {
          apiKey: input.apiKey,
          apiBaseUrl,
          fetcher,
          signal,
        },
        phase: "validate",
      }),
      "organizations",
    );
    const primaryOrganization = optionalRecord(organizations[0]);
    const primaryOrganizationId = optionalString(primaryOrganization?.identifier);
    const primaryOrganizationName = optionalString(primaryOrganization?.name);

    return {
      profile: {
        accountId: primaryOrganizationId,
        displayName: primaryOrganizationName ?? "Affinda API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl,
        organizationCount: organizations.length,
        primaryOrganizationId,
        primaryOrganizationName,
        validationEndpoint: affindaOrganizationsPath,
      }),
    };
  },
};

function validateCreateDocumentInput(input: Record<string, unknown>): void {
  if (input.deleteAfterParse === true && input.wait === false) {
    throw new ProviderRequestError(400, "deleteAfterParse is only compatible with wait true.");
  }
}

function buildListDocumentsQuery(input: Record<string, unknown>): Record<string, unknown> {
  return {
    offset: input.offset,
    limit: input.limit,
    workspace: optionalString(input.workspace),
    state: optionalString(input.state),
    tags: Array.isArray(input.tags) ? input.tags : undefined,
    search: optionalString(input.search),
    include_data: optionalBoolean(input.includeData),
    failed: optionalBoolean(input.failed),
    ready: optionalBoolean(input.ready),
    validatable: optionalBoolean(input.validatable),
    custom_identifier: optionalString(input.customIdentifier),
    compact: optionalBoolean(input.compact),
  };
}

function buildCreateDocumentFormData(input: Record<string, unknown>): FormData {
  const formData = new FormData();
  appendFormString(formData, "url", optionalString(input.url));
  appendFormString(formData, "workspace", optionalString(input.workspace));
  appendFormString(formData, "documentType", optionalString(input.documentType));
  appendFormBoolean(formData, "wait", optionalBoolean(input.wait));
  appendFormString(formData, "customIdentifier", optionalString(input.customIdentifier));
  appendFormString(formData, "fileName", optionalString(input.fileName));
  appendFormString(formData, "expiryTime", optionalString(input.expiryTime));
  appendFormString(formData, "language", optionalString(input.language));
  appendFormBoolean(formData, "rejectDuplicates", optionalBoolean(input.rejectDuplicates));
  appendFormBoolean(formData, "lowPriority", optionalBoolean(input.lowPriority));
  appendFormBoolean(formData, "compact", optionalBoolean(input.compact));
  appendFormBoolean(formData, "deleteAfterParse", optionalBoolean(input.deleteAfterParse));
  appendFormBoolean(formData, "enableValidationTool", optionalBoolean(input.enableValidationTool));
  appendFormBoolean(formData, "useOcr", optionalBoolean(input.useOcr));
  appendFormString(formData, "llmHint", optionalString(input.llmHint));
  return formData;
}

function appendFormString(formData: FormData, key: string, value: string | undefined): void {
  if (value !== undefined) {
    formData.set(key, value);
  }
}

function appendFormBoolean(formData: FormData, key: string, value: boolean | undefined): void {
  if (value !== undefined) {
    formData.set(key, String(value));
  }
}

async function requestAffindaJson(input: {
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: BodyInit;
  context: AffindaActionContext;
  phase: AffindaRequestPhase;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(buildAffindaUrl(input.context.apiBaseUrl, input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildAffindaHeaders(input.context.apiKey, input.body),
      body: input.body,
      signal: input.context.signal,
    });
    payload = await readAffindaPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Affinda request failed: ${error.message}` : "Affinda request failed",
    );
  }

  if (!response.ok) {
    throw createAffindaHttpError(response, payload, input.phase);
  }
  return payload;
}

function buildAffindaUrl(baseUrl: string, path: string, query?: Record<string, unknown>): URL {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    appendAffindaQueryValue(url, key, value);
  }
  return url;
}

function appendAffindaQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      appendAffindaQueryValue(url, key, item);
    }
    return;
  }
  if (typeof value === "string" && value.length === 0) {
    return;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    url.searchParams.append(key, String(value));
  }
}

function buildAffindaHeaders(apiKey: string, body?: BodyInit): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
    ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}),
  };
}

async function readAffindaPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Affinda returned invalid JSON");
  }
}

function createAffindaHttpError(
  response: Response,
  payload: unknown,
  phase: AffindaRequestPhase,
): ProviderRequestError {
  const message = extractAffindaErrorMessage(payload) ?? response.statusText ?? "Affinda request failed";
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 400 && phase === "execute") {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractAffindaErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const errors = Array.isArray(record?.errors) ? record.errors : undefined;
  const firstError = optionalRecord(errors?.[0]);
  return (
    optionalString(firstError?.detail) ??
    optionalString(firstError?.message) ??
    optionalString(record?.detail) ??
    optionalString(record?.message) ??
    optionalString(record?.error)
  );
}

function readAffindaArray(payload: unknown, label: string): unknown[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `Affinda ${label} response was not an array`);
  }
  return payload;
}

function readAffindaObject(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `Affinda ${label} response was not an object`);
  }
  return record;
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return optionalString(value) ?? null;
}

function resolveAffindaApiBaseUrl(input: Record<string, unknown> | undefined): string {
  const rawBaseUrl = optionalString(input?.apiBaseUrl);
  if (!rawBaseUrl) {
    return affindaDefaultApiBaseUrl;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new ProviderRequestError(400, "apiBaseUrl must be an official Affinda API URL");
  }

  if (
    parsed.protocol !== "https:" ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new ProviderRequestError(400, "apiBaseUrl must be an official Affinda API URL");
  }

  const normalized = parsed.origin;
  if (!affindaOfficialApiBaseUrls.has(normalized)) {
    throw new ProviderRequestError(400, "apiBaseUrl must be an official Affinda API URL");
  }
  return normalized;
}
