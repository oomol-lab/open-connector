import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  base64Bytes,
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { defineProviderExecutors, providerInputError, ProviderRequestError } from "../provider-runtime.ts";

const service = "crowdin";
const crowdinUserUrl = "https://api.crowdin.com/api/v2/user";
const crowdinPublicApiBaseUrl = "https://api.crowdin.com/api/v2";
const crowdinGrantedScopes = ["crowdin.projects.read", "crowdin.source.read", "crowdin.source.write"];

interface CrowdinActionContext {
  accessToken: string;
  fetcher: typeof fetch;
  providerMetadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

type CrowdinActionHandler = (input: Record<string, unknown>, context: CrowdinActionContext) => Promise<unknown>;

export const crowdinActionHandlers: ProviderActionHandlers<"crowdin", CrowdinActionHandler> = {
  list_projects(input, context) {
    return crowdinListProjects(input, context);
  },
  list_branches(input, context) {
    return crowdinListBranches(input, context);
  },
  create_branch(input, context) {
    return crowdinCreateBranch(input, context);
  },
  list_directories(input, context) {
    assertOnlyOneLocation(input);
    return crowdinListDirectories(input, context);
  },
  create_directory(input, context) {
    assertOnlyOneLocation(input);
    return crowdinCreateDirectory(input, context);
  },
  list_files(input, context) {
    assertOnlyOneLocation(input);
    return crowdinListFiles(input, context);
  },
  upload_file(input, context) {
    assertOnlyOneLocation(input);
    return crowdinUploadFile(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<CrowdinActionContext>({
  service,
  handlers: crowdinActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CrowdinActionContext> {
    const credential = await context.getCredential(service);
    const accessToken = readBearerToken(credential);
    return {
      accessToken,
      fetcher,
      signal: context.signal,
      providerMetadata:
        credential?.authType === "api_key" || credential?.authType === "oauth2" ? credential.metadata : undefined,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const profile = await fetchCrowdinCurrentAccount(input.apiKey, fetcher, signal);
    return {
      ...profile,
      grantedScopes: [...crowdinGrantedScopes],
    };
  },
  async oauth2(input, { fetcher, signal }) {
    return fetchCrowdinCurrentAccount(input.accessToken, fetcher, signal);
  },
};

async function crowdinListProjects(input: Record<string, unknown>, context: CrowdinActionContext): Promise<unknown> {
  const payload = requireObject(
    await crowdinRequest(context, {
      path: "/projects",
      query: {
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
      },
    }),
    "malformed crowdin response: projects payload",
  );
  const projects = toCrowdinDataArray(payload.data).map(toCrowdinProjectSummary);
  const pagination = toCrowdinPagination(payload.pagination, {
    offset: optionalInteger(input.offset),
    limit: optionalInteger(input.limit),
  });
  return { projects, pagination };
}

async function crowdinListBranches(input: Record<string, unknown>, context: CrowdinActionContext): Promise<unknown> {
  const projectId = requirePositiveInteger(input.projectId, "projectId");
  const payload = requireObject(
    await crowdinRequest(context, {
      path: `/projects/${projectId}/branches`,
      query: {
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        name: optionalString(input.name),
      },
    }),
    "malformed crowdin response: branches payload",
  );
  return {
    branches: toCrowdinDataArray(payload.data).map(toCrowdinBranchSummary),
    pagination: toCrowdinPagination(payload.pagination, {
      offset: optionalInteger(input.offset),
      limit: optionalInteger(input.limit),
    }),
  };
}

async function crowdinCreateBranch(input: Record<string, unknown>, context: CrowdinActionContext): Promise<unknown> {
  const projectId = requirePositiveInteger(input.projectId, "projectId");
  const payload = await crowdinRequest(context, {
    method: "POST",
    path: `/projects/${projectId}/branches`,
    body: compactObject({
      name: requiredString(input.name, "name", providerInputError),
      title: optionalString(input.title),
      exportPattern: optionalString(input.exportPattern),
      priority: optionalInteger(input.priority),
    }),
  });
  return toCrowdinBranchSummary(payload);
}

async function crowdinListDirectories(input: Record<string, unknown>, context: CrowdinActionContext): Promise<unknown> {
  const projectId = requirePositiveInteger(input.projectId, "projectId");
  const payload = requireObject(
    await crowdinRequest(context, {
      path: `/projects/${projectId}/directories`,
      query: buildLocationQuery(input),
    }),
    "malformed crowdin response: directories payload",
  );
  return {
    directories: toCrowdinDataArray(payload.data).map(toCrowdinDirectorySummary),
    pagination: toCrowdinPagination(payload.pagination, {
      offset: optionalInteger(input.offset),
      limit: optionalInteger(input.limit),
    }),
  };
}

async function crowdinCreateDirectory(input: Record<string, unknown>, context: CrowdinActionContext): Promise<unknown> {
  const projectId = requirePositiveInteger(input.projectId, "projectId");
  const payload = await crowdinRequest(context, {
    method: "POST",
    path: `/projects/${projectId}/directories`,
    body: compactObject({
      name: requiredString(input.name, "name", providerInputError),
      branchId: optionalInteger(input.branchId),
      directoryId: optionalInteger(input.directoryId),
      title: optionalString(input.title),
      exportPattern: optionalString(input.exportPattern),
      priority: optionalInteger(input.priority),
    }),
  });
  return toCrowdinDirectorySummary(payload);
}

async function crowdinListFiles(input: Record<string, unknown>, context: CrowdinActionContext): Promise<unknown> {
  const projectId = requirePositiveInteger(input.projectId, "projectId");
  const payload = requireObject(
    await crowdinRequest(context, {
      path: `/projects/${projectId}/files`,
      query: buildLocationQuery(input),
    }),
    "malformed crowdin response: files payload",
  );
  return {
    files: toCrowdinDataArray(payload.data).map(toCrowdinFileSummary),
    pagination: toCrowdinPagination(payload.pagination, {
      offset: optionalInteger(input.offset),
      limit: optionalInteger(input.limit),
    }),
  };
}

async function crowdinUploadFile(input: Record<string, unknown>, context: CrowdinActionContext): Promise<unknown> {
  const projectId = requirePositiveInteger(input.projectId, "projectId");
  const name = requiredString(input.name, "name", providerInputError);
  const storagePayload = requireObject(
    await crowdinRequest(context, {
      method: "POST",
      path: "/storages",
      contentType: optionalString(input.contentType) ?? "application/octet-stream",
      headers: { "crowdin-api-file-name": name },
      body: base64Bytes(input.contentBase64, "contentBase64", providerInputError),
    }),
    "malformed crowdin response: storage payload",
  );
  const storageId = requirePositiveInteger(toCrowdinDataItem(storagePayload).id, "storageId");
  const payload = await crowdinRequest(context, {
    method: "POST",
    path: `/projects/${projectId}/files`,
    body: compactObject({
      storageId,
      name,
      branchId: optionalInteger(input.branchId),
      directoryId: optionalInteger(input.directoryId),
      title: optionalString(input.title),
      context: optionalString(input.context),
      type: optionalString(input.type),
      parserVersion: optionalString(input.parserVersion),
      importOptions: optionalRecord(input.importOptions),
      exportOptions: optionalRecord(input.exportOptions),
    }),
  });
  return {
    storageId,
    file: toCrowdinFileSummary(payload),
  };
}

function buildLocationQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return {
    branchId: optionalInteger(input.branchId),
    directoryId: optionalInteger(input.directoryId),
    filter: optionalString(input.filter),
    recursion: optionalBoolean(input.recursion),
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
  };
}

async function fetchCrowdinCurrentAccount(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const response = await fetcher(crowdinUserUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal,
  });
  await assertCrowdinResponse(response);
  return parseCrowdinCurrentAccount((await response.json()) as Record<string, unknown>);
}

function parseCrowdinCurrentAccount(payload: Record<string, unknown>): CredentialValidationResult {
  const data = optionalRecord(payload.data) ?? payload;
  const organization = optionalRecord(payload.organization) ?? optionalRecord(data.organization);
  const organizationDomain =
    normalizeCrowdinOrganizationSlug(optionalString(organization?.domain)) ??
    normalizeCrowdinOrganizationSlug(optionalString(organization?.name));
  const accountId = asAccountId(data.id);
  if (accountId == null) {
    throw new ProviderRequestError(502, "malformed crowdin current account: id");
  }
  return {
    profile: {
      accountId,
      displayName:
        optionalString(data.username) ?? optionalString(data.fullName) ?? optionalString(data.login) ?? accountId,
    },
    metadata: {
      organizationDomain,
    },
  };
}

async function crowdinRequest(
  context: CrowdinActionContext,
  request: {
    method?: "GET" | "POST";
    path: string;
    query?: Record<string, string | number | boolean | null | undefined>;
    body?: Record<string, unknown> | Uint8Array;
    contentType?: string;
    headers?: Record<string, string>;
  },
): Promise<unknown> {
  const url = new URL(`${resolveCrowdinApiBaseUrl(context.providerMetadata, context.accessToken)}${request.path}`);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  const body = buildCrowdinRequestBody(request.body);
  const response = await context.fetcher(url.toString(), {
    method: request.method ?? "GET",
    headers: {
      authorization: `Bearer ${context.accessToken}`,
      accept: "application/json",
      ...((request.contentType ??
      (request.body != null && !(request.body instanceof Uint8Array) ? "application/json; charset=utf-8" : undefined))
        ? { "content-type": request.contentType ?? "application/json; charset=utf-8" }
        : {}),
      ...(request.headers ?? {}),
    },
    body,
    signal: context.signal,
  });
  await assertCrowdinResponse(response);
  return (await response.json()) as unknown;
}

function buildCrowdinRequestBody(body: Record<string, unknown> | Uint8Array | undefined): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (body instanceof Uint8Array) return Uint8Array.from(body).buffer;
  return JSON.stringify(body);
}

async function assertCrowdinResponse(response: Response): Promise<void> {
  if (response.ok) return;
  const message = (await response.text().catch(() => "")) || `crowdin request failed with ${response.status}`;
  throw new ProviderRequestError(response.status, message);
}

function resolveCrowdinApiBaseUrl(providerMetadata?: Record<string, unknown>, accessToken?: string): string {
  const organizationDomain =
    normalizeCrowdinOrganizationSlug(optionalString(providerMetadata?.organizationDomain)) ??
    extractOrganizationDomainFromToken(accessToken);
  return organizationDomain ? `https://${organizationDomain}.api.crowdin.com/api/v2` : crowdinPublicApiBaseUrl;
}

function toCrowdinProjectSummary(value: unknown): Record<string, unknown> {
  const source = toCrowdinDataItem(value);
  return {
    projectId: requirePositiveInteger(source.id, "projectId"),
    name: requireProviderString(source.name, "name"),
    identifier: requireProviderString(source.identifier, "identifier"),
    sourceLanguageId: requireProviderString(source.sourceLanguageId, "sourceLanguageId"),
    targetLanguageIds: Array.isArray(source.targetLanguageIds) ? source.targetLanguageIds.map(String) : [],
    createdAt: requireProviderString(source.createdAt, "createdAt"),
    updatedAt: requireProviderString(source.updatedAt, "updatedAt"),
  };
}

function toCrowdinBranchSummary(value: unknown): Record<string, unknown> {
  const source = toCrowdinDataItem(value);
  return {
    branchId: requirePositiveInteger(source.id, "branchId"),
    projectId: requirePositiveInteger(source.projectId, "projectId"),
    name: requireProviderString(source.name, "name"),
    title: optionalString(source.title) ?? null,
    exportPattern: optionalString(source.exportPattern) ?? null,
    priority: optionalInteger(source.priority) ?? null,
    createdAt: requireProviderString(source.createdAt, "createdAt"),
    updatedAt: requireProviderString(source.updatedAt, "updatedAt"),
  };
}

function toCrowdinDirectorySummary(value: unknown): Record<string, unknown> {
  const source = toCrowdinDataItem(value);
  return {
    directoryId: requirePositiveInteger(source.id, "directoryId"),
    projectId: requirePositiveInteger(source.projectId, "projectId"),
    branchId: optionalInteger(source.branchId) ?? null,
    parentId: optionalInteger(source.directoryId) ?? null,
    name: requireProviderString(source.name, "name"),
    title: optionalString(source.title) ?? null,
    exportPattern: optionalString(source.exportPattern) ?? null,
    priority: optionalInteger(source.priority) ?? null,
    createdAt: requireProviderString(source.createdAt, "createdAt"),
    updatedAt: requireProviderString(source.updatedAt, "updatedAt"),
  };
}

function toCrowdinFileSummary(value: unknown): Record<string, unknown> {
  const source = toCrowdinDataItem(value);
  return {
    fileId: requirePositiveInteger(source.id, "fileId"),
    projectId: requirePositiveInteger(source.projectId, "projectId"),
    branchId: optionalInteger(source.branchId) ?? null,
    directoryId: optionalInteger(source.directoryId) ?? null,
    name: requireProviderString(source.name, "name"),
    title: optionalString(source.title) ?? null,
    context: optionalString(source.context) ?? null,
    type: requireProviderString(source.type, "type"),
    path: requireProviderString(source.path, "path"),
    status: requireProviderString(source.status, "status"),
    createdAt: requireProviderString(source.createdAt, "createdAt"),
    updatedAt: requireProviderString(source.updatedAt, "updatedAt"),
  };
}

function toCrowdinDataArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(502, "malformed crowdin response: data must be an array");
  return value;
}

function toCrowdinDataItem(value: unknown): Record<string, unknown> {
  const body = requireObject(value, "malformed crowdin data item");
  return optionalRecord(body.data) ?? body;
}

function toCrowdinPagination(
  value: unknown,
  fallback: { offset: number | undefined; limit: number | undefined },
): Record<string, number> {
  const body = optionalRecord(value);
  return {
    offset: optionalInteger(body?.offset) ?? fallback.offset ?? 0,
    limit: optionalInteger(body?.limit) ?? fallback.limit ?? 25,
  };
}

function readBearerToken(credential: ResolvedCredential | undefined): string {
  if (credential?.authType === "oauth2") return credential.accessToken;
  if (credential?.authType === "api_key") return credential.apiKey;
  throw new ProviderRequestError(401, "Configure crowdin OAuth or API key credentials first.");
}

function assertOnlyOneLocation(input: Record<string, unknown>): void {
  if (input.branchId != null && input.directoryId != null) {
    throw new ProviderRequestError(400, "branchId and directoryId cannot both be provided");
  }
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, message);
  return record;
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function requireProviderString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new ProviderRequestError(502, `malformed crowdin response: ${fieldName}`);
}

function asAccountId(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function normalizeCrowdinOrganizationSlug(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized) ? normalized : undefined;
}

function extractOrganizationDomainFromToken(accessToken: string | undefined): string | undefined {
  if (!accessToken) return undefined;
  const [, payloadSegment] = accessToken.split(".");
  if (!payloadSegment) return undefined;
  try {
    const payload = optionalRecord(JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf-8")));
    return normalizeCrowdinOrganizationSlug(optionalString(payload?.organization_domain));
  } catch {
    return undefined;
  }
}
