import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { BearerProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import {
  compactObject,
  nullableString,
  optionalBoolean,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredRawString,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import { jsonObject, readBoundedResponseBytes } from "../../core/request.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readTransitFileInput,
} from "../provider-runtime.ts";
import { supabaseProviderScopes } from "./scopes.ts";

const supabaseApiBaseUrl = "https://api.supabase.com/v1";
const supabaseProjectHostSuffix = ".supabase.co";
const supabaseStorageAuthenticatedObjectPath = "/storage/v1/object/authenticated";
const projectStatuses = new Set([
  "ACTIVE_HEALTHY",
  "ACTIVE_UNHEALTHY",
  "COMING_UP",
  "GOING_DOWN",
  "INACTIVE",
  "INIT_FAILED",
  "REMOVED",
  "RESTARTING",
  "UNKNOWN",
  "UPGRADING",
  "PAUSING",
  "RESTORING",
  "RESTORE_FAILED",
  "PAUSE_FAILED",
  "RESIZING",
]);
const apiKeyTypes = new Set(["legacy", "publishable", "secret", "unknown"]);

type SupabaseActionInput = Record<string, unknown>;
type SupabaseActionHandler = (input: SupabaseActionInput, context: BearerProviderContext) => Promise<unknown>;
type SupabaseRequestPhase = "validate" | "execute";

interface SupabaseOrganizationSummary {
  id: string;
  name: string;
  slug?: string | null;
}

interface SupabaseRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | string[] | undefined>;
  body?: unknown;
  responseMode?: "json" | "optional_json";
}

export const supabaseActionHandlers: ProviderActionHandlers<"supabase", SupabaseActionHandler> = {
  list_organizations(_input, context) {
    return supabaseListOrganizations(context);
  },
  get_organization(input, context) {
    return supabaseGetOrganization(input, context);
  },
  list_organization_members(input, context) {
    return supabaseListOrganizationMembers(input, context);
  },
  list_organization_projects(input, context) {
    return supabaseListOrganizationProjects(input, context);
  },
  list_projects(_input, context) {
    return supabaseListProjects(context);
  },
  get_project(input, context) {
    return supabaseGetProject(input, context);
  },
  list_available_regions(input, context) {
    return supabaseListAvailableRegions(input, context);
  },
  get_project_health(input, context) {
    return supabaseGetProjectHealth(input, context);
  },
  list_project_api_keys(input, context) {
    return supabaseListProjectApiKeys(input, context);
  },
  get_project_api_key(input, context) {
    return supabaseGetProjectApiKey(input, context);
  },
  create_project_api_key(input, context) {
    return supabaseCreateProjectApiKey(input, context);
  },
  update_project_api_key(input, context) {
    return supabaseUpdateProjectApiKey(input, context);
  },
  delete_project_api_key(input, context) {
    return supabaseDeleteProjectApiKey(input, context);
  },
  list_project_secrets(input, context) {
    return supabaseListProjectSecrets(input, context);
  },
  upsert_project_secrets(input, context) {
    return supabaseUpsertProjectSecrets(input, context);
  },
  delete_project_secrets(input, context) {
    return supabaseDeleteProjectSecrets(input, context);
  },
  generate_typescript_types(input, context) {
    return supabaseGenerateTypescriptTypes(input, context);
  },
  run_read_only_query(input, context) {
    return supabaseRunReadOnlyQuery(input, context);
  },
  list_storage_buckets(input, context) {
    return supabaseListStorageBuckets(input, context);
  },
  download_storage_object(input, context) {
    return supabaseDownloadStorageObject(input, context);
  },
  upload_storage_object(input, context) {
    return supabaseUploadStorageObject(input, context);
  },
  list_edge_functions(input, context) {
    return supabaseListEdgeFunctions(input, context);
  },
  get_edge_function(input, context) {
    return supabaseGetEdgeFunction(input, context);
  },
};

export async function validateSupabaseCredential(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
    grantedScopes: string[];
  };
  metadata: Record<string, unknown>;
}> {
  const organizations = sortOrganizations(
    normalizeOrganizationList(
      await requestSupabaseJson({
        accessToken,
        fetcher,
        signal,
        phase: "validate",
        path: "/organizations",
      }),
    ),
  );
  const subject = readJwtSubject(accessToken);

  return {
    profile: {
      accountId: subject ?? buildSupabaseAccountFingerprint(organizations, accessToken),
      displayName: buildSupabaseAccountLabel(organizations),
      grantedScopes: supabaseProviderScopes,
    },
    metadata: {
      validationEndpoint: "/organizations",
      organizationCount: organizations.length,
      organizations,
      identitySource: subject
        ? "jwt_sub"
        : organizations.length > 0
          ? "organization_fingerprint"
          : "access_token_fingerprint",
    },
  };
}

export async function validateSupabaseOAuthCredential(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
    grantedScopes: string[];
  };
  metadata: Record<string, unknown>;
}> {
  const profile = requiredRecord(
    await requestSupabaseJson({
      accessToken,
      fetcher,
      signal,
      phase: "validate",
      path: "/profile",
    }),
    "profile",
    providerMalformedError,
  );
  const gotrueId = requiredString(profile.gotrue_id, "profile.gotrue_id", providerMalformedError);
  const username = optionalString(profile.username);
  const primaryEmail = optionalString(profile.primary_email);

  return {
    profile: {
      accountId: gotrueId,
      displayName: username || primaryEmail || "Supabase User",
      grantedScopes: supabaseProviderScopes,
    },
    metadata: compactObject({
      validationEndpoint: "/profile",
      gotrueId,
      username,
      primaryEmail,
    }),
  };
}

async function supabaseListOrganizations(context: BearerProviderContext): Promise<unknown> {
  return {
    organizations: normalizeOrganizationList(await requestSupabaseJson({ path: "/organizations", context })),
  };
}

async function supabaseGetOrganization(input: SupabaseActionInput, context: BearerProviderContext): Promise<unknown> {
  const organizationSlug = requiredString(input.organizationSlug, "organizationSlug", providerInputError);
  const organization = await requestSupabaseJson({
    path: `/organizations/${encodeURIComponent(organizationSlug)}`,
    context,
  });

  return {
    organization: normalizeOrganizationDetail(organization),
  };
}

async function supabaseListOrganizationMembers(
  input: SupabaseActionInput,
  context: BearerProviderContext,
): Promise<unknown> {
  const organizationSlug = requiredString(input.organizationSlug, "organizationSlug", providerInputError);
  const members = await requestSupabaseJson({
    path: `/organizations/${encodeURIComponent(organizationSlug)}/members`,
    context,
  });

  return {
    members: normalizeOrganizationMemberList(members),
  };
}

async function supabaseListOrganizationProjects(
  input: SupabaseActionInput,
  context: BearerProviderContext,
): Promise<unknown> {
  const organizationSlug = requiredString(input.organizationSlug, "organizationSlug", providerInputError);
  return normalizeOrganizationProjectsResponse(
    await requestSupabaseJson({
      path: `/organizations/${encodeURIComponent(organizationSlug)}/projects`,
      context,
      query: {
        offset: optionalNumber(input.offset),
        limit: optionalNumber(input.limit),
        search: optionalString(input.search),
        sort: optionalString(input.sort),
        statuses: Array.isArray(input.statuses) ? input.statuses.map(String).join(",") : undefined,
      },
    }),
  );
}

async function supabaseListProjects(context: BearerProviderContext): Promise<unknown> {
  return {
    projects: normalizeProjectSummaryList(await requestSupabaseJson({ path: "/projects", context })),
  };
}

async function supabaseGetProject(input: SupabaseActionInput, context: BearerProviderContext): Promise<unknown> {
  const projectRef = readProjectRef(input);
  const project = await requestSupabaseJson({
    path: `/projects/${encodeURIComponent(projectRef)}`,
    context,
  });

  return {
    project: normalizeProjectDetail(project),
  };
}

async function supabaseListAvailableRegions(
  input: SupabaseActionInput,
  context: BearerProviderContext,
): Promise<unknown> {
  return {
    regions: requiredRecord(
      await requestSupabaseJson({
        path: "/projects/available-regions",
        context,
        query: {
          organization_slug: optionalString(input.organizationSlug),
          continent: optionalString(input.continent),
          desired_instance_size: optionalString(input.desiredInstanceSize),
        },
      }),
      "regions",
      providerMalformedError,
    ),
  };
}

async function supabaseGetProjectHealth(input: SupabaseActionInput, context: BearerProviderContext): Promise<unknown> {
  const projectRef = readProjectRef(input);
  return {
    services: normalizeHealthServiceList(
      await requestSupabaseJson({
        path: `/projects/${encodeURIComponent(projectRef)}/health`,
        context,
        query: {
          services: Array.isArray(input.services) ? input.services.map(String) : undefined,
          timeout_ms: optionalNumber(input.timeoutMs),
        },
      }),
    ),
  };
}

async function supabaseListProjectApiKeys(
  input: SupabaseActionInput,
  context: BearerProviderContext,
): Promise<unknown> {
  const projectRef = readProjectRef(input);
  return {
    apiKeys: normalizeApiKeyListPayload(
      await requestSupabaseJson({
        path: `/projects/${encodeURIComponent(projectRef)}/api-keys`,
        context,
        query: {
          reveal: input.reveal === true ? true : undefined,
        },
      }),
    ),
  };
}

async function supabaseGetProjectApiKey(input: SupabaseActionInput, context: BearerProviderContext): Promise<unknown> {
  const projectRef = readProjectRef(input);
  const apiKeyId = requiredString(input.apiKeyId, "apiKeyId", providerInputError);
  return {
    apiKey: normalizeApiKeyRecord(
      await requestSupabaseJson({
        path: `/projects/${encodeURIComponent(projectRef)}/api-keys/${encodeURIComponent(apiKeyId)}`,
        context,
        query: {
          reveal: input.reveal === true ? true : undefined,
        },
      }),
    ),
  };
}

async function supabaseCreateProjectApiKey(
  input: SupabaseActionInput,
  context: BearerProviderContext,
): Promise<unknown> {
  const projectRef = readProjectRef(input);
  const type = optionalString(input.type);
  if (input.secretJwtTemplate !== undefined && type !== "secret") {
    throw providerInputError("secretJwtTemplate is only supported for secret API keys");
  }

  return {
    apiKey: normalizeApiKeyRecord(
      await requestSupabaseJson({
        method: "POST",
        path: `/projects/${encodeURIComponent(projectRef)}/api-keys`,
        context,
        query: {
          reveal: input.reveal === true ? true : undefined,
        },
        body: jsonObject({
          name: optionalString(input.name),
          type,
          description: optionalRawString(input.description),
          secret_jwt_template: optionalRecord(input.secretJwtTemplate),
        }),
      }),
    ),
  };
}

async function supabaseUpdateProjectApiKey(
  input: SupabaseActionInput,
  context: BearerProviderContext,
): Promise<unknown> {
  const projectRef = readProjectRef(input);
  const apiKeyId = requiredString(input.apiKeyId, "apiKeyId", providerInputError);
  if (input.name === undefined && input.description === undefined && input.secretJwtTemplate === undefined) {
    throw providerInputError("Provide at least one field to update: name, description, or secretJwtTemplate.");
  }

  return {
    apiKey: normalizeApiKeyRecord(
      await requestSupabaseJson({
        method: "PATCH",
        path: `/projects/${encodeURIComponent(projectRef)}/api-keys/${encodeURIComponent(apiKeyId)}`,
        context,
        query: {
          reveal: input.reveal === true ? true : undefined,
        },
        body: jsonObject({
          name: optionalString(input.name),
          description:
            typeof input.description === "string" || input.description === null ? input.description : undefined,
          secret_jwt_template:
            input.secretJwtTemplate === null ? null : (optionalRecord(input.secretJwtTemplate) ?? undefined),
        }),
      }),
    ),
  };
}

async function supabaseDeleteProjectApiKey(
  input: SupabaseActionInput,
  context: BearerProviderContext,
): Promise<unknown> {
  const projectRef = readProjectRef(input);
  const apiKeyId = requiredString(input.apiKeyId, "apiKeyId", providerInputError);
  return {
    apiKey: normalizeApiKeyRecord(
      await requestSupabaseJson({
        method: "DELETE",
        path: `/projects/${encodeURIComponent(projectRef)}/api-keys/${encodeURIComponent(apiKeyId)}`,
        context,
        query: {
          reveal: input.reveal === true ? true : undefined,
          was_compromised: optionalBoolean(input.wasCompromised),
          reason: optionalString(input.reason),
        },
      }),
    ),
  };
}

async function supabaseListProjectSecrets(
  input: SupabaseActionInput,
  context: BearerProviderContext,
): Promise<unknown> {
  const projectRef = readProjectRef(input);
  return {
    secrets: normalizeSecretList(
      await requestSupabaseJson({
        path: `/projects/${encodeURIComponent(projectRef)}/secrets`,
        context,
      }),
    ),
  };
}

async function supabaseUpsertProjectSecrets(
  input: SupabaseActionInput,
  context: BearerProviderContext,
): Promise<unknown> {
  const projectRef = readProjectRef(input);
  await requestSupabaseJson({
    method: "POST",
    path: `/projects/${encodeURIComponent(projectRef)}/secrets`,
    context,
    body: normalizeSecretInputList(input.secrets),
    responseMode: "optional_json",
  });

  return {
    success: true,
  };
}

async function supabaseDeleteProjectSecrets(
  input: SupabaseActionInput,
  context: BearerProviderContext,
): Promise<unknown> {
  const projectRef = readProjectRef(input);
  await requestSupabaseJson({
    method: "DELETE",
    path: `/projects/${encodeURIComponent(projectRef)}/secrets`,
    context,
    body: stringArray(input.names, "names", providerInputError),
    responseMode: "optional_json",
  });

  return {
    success: true,
  };
}

async function supabaseGenerateTypescriptTypes(
  input: SupabaseActionInput,
  context: BearerProviderContext,
): Promise<unknown> {
  const projectRef = readProjectRef(input);
  const payload = requiredRecord(
    await requestSupabaseJson({
      path: `/projects/${encodeURIComponent(projectRef)}/types/typescript`,
      context,
      query: {
        included_schemas: Array.isArray(input.includedSchemas)
          ? input.includedSchemas.map(String).join(",")
          : undefined,
      },
    }),
    "typescript",
    providerMalformedError,
  );

  return {
    typescript: requiredString(payload.types, "typescript.types", providerMalformedError),
  };
}

async function supabaseRunReadOnlyQuery(input: SupabaseActionInput, context: BearerProviderContext): Promise<unknown> {
  const projectRef = readProjectRef(input);
  const result = await requestSupabaseJson({
    method: "POST",
    path: `/projects/${encodeURIComponent(projectRef)}/database/query/read-only`,
    context,
    body: jsonObject({
      query: optionalRawString(input.query),
      parameters: Array.isArray(input.parameters) ? input.parameters : undefined,
    }),
    responseMode: "optional_json",
  });

  return {
    result: result ?? null,
  };
}

async function supabaseListStorageBuckets(
  input: SupabaseActionInput,
  context: BearerProviderContext,
): Promise<unknown> {
  const projectRef = readProjectRef(input);
  return {
    buckets: normalizeRecordList(
      await requestSupabaseJson({
        path: `/projects/${encodeURIComponent(projectRef)}/storage/buckets`,
        context,
      }),
      "storage buckets",
    ),
  };
}

async function supabaseDownloadStorageObject(
  input: SupabaseActionInput,
  context: BearerProviderContext,
): Promise<unknown> {
  if (!context.transitFiles) {
    throw providerInputError("supabase download_storage_object requires local transit file storage");
  }

  const projectRef = readStorageProjectRef(input);
  const bucketId = readStorageBucketId(input);
  const objectPath = requiredRawString(input.objectPath, "objectPath", providerInputError);
  if (objectPath.length === 0) {
    throw providerInputError("objectPath must not be empty");
  }
  if (objectPath.startsWith("/")) {
    throw providerInputError("objectPath must not start with a slash");
  }
  if (objectPath.split("/").some((segment) => segment === "." || segment === "..")) {
    throw providerInputError("objectPath must not contain . or .. path segments");
  }

  const storageKey = await resolveSupabaseStorageKey(input, projectRef, context, "download");
  const url = new URL(
    `https://${projectRef}${supabaseProjectHostSuffix}${supabaseStorageAuthenticatedObjectPath}/${encodeURIComponent(bucketId)}/${encodeStorageObjectPath(objectPath)}`,
  );
  const headers: Record<string, string> = {
    accept: "*/*",
    apikey: storageKey.value,
    "user-agent": providerUserAgent,
  };
  if (storageKey.authorizationBearer) {
    headers.authorization = `Bearer ${storageKey.value}`;
  }

  const response = await context.fetcher(url, { headers, signal: context.signal });
  if (!response.ok) {
    const bytes = await readBoundedResponseBytes(response, {
      maxBytes: 64 * 1024,
      fieldName: "Supabase Storage error response",
      createError: (message) => new ProviderRequestError(413, message),
    });
    throw createSupabaseError(response, parseSupabaseStorageError(bytes), "execute");
  }

  const name = optionalString(input.fileName) ?? defaultStorageObjectName(objectPath);
  const mimeType = optionalString(response.headers.get("content-type")) ?? "application/octet-stream";
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: "Supabase Storage download",
    createError: (message) => new ProviderRequestError(413, message),
  });
  const file = await context.transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: mimeType }));

  return {
    fileId: `${bucketId}/${objectPath}`,
    name,
    mimeType,
    sizeBytes: file.sizeBytes,
    file,
  };
}

async function supabaseUploadStorageObject(
  input: SupabaseActionInput,
  context: BearerProviderContext,
): Promise<unknown> {
  if (!context.transitFiles) {
    throw providerInputError("supabase upload_storage_object requires local transit file storage");
  }
  const projectRef = readStorageProjectRef(input);
  const bucketId = readStorageBucketId(input);
  const objectPath = requiredRawString(input.objectPath, "objectPath", providerInputError);
  if (objectPath.length === 0) {
    throw providerInputError("objectPath must not be empty");
  }
  if (objectPath.startsWith("/")) {
    throw providerInputError("objectPath must not start with a slash");
  }
  if (objectPath.split("/").some((segment) => segment === "." || segment === "..")) {
    throw providerInputError("objectPath must not contain . or .. path segments");
  }
  const source = await readTransitFileInput(input.file, context);
  if (source.sizeBytes > context.transitFiles.maxBytes) {
    throw new ProviderRequestError(413, `Supabase Storage upload exceeds ${context.transitFiles.maxBytes} bytes`);
  }
  const mime = optionalString(input.contentType) ?? optionalString(source.mimeType) ?? "application/octet-stream";
  const storageKey = await resolveSupabaseStorageKey(input, projectRef, context, "upload");
  const upsert = optionalBoolean(input.upsert) ?? false;
  const method = "POST";
  const url = new URL(
    `https://${projectRef}${supabaseProjectHostSuffix}/storage/v1/object/${encodeURIComponent(bucketId)}/${encodeStorageObjectPath(objectPath)}`,
  );
  const headers: Record<string, string> = {
    apikey: storageKey.value,
    "content-type": mime,
    "user-agent": providerUserAgent,
  };
  if (storageKey.authorizationBearer) {
    headers.authorization = `Bearer ${storageKey.value}`;
  }
  if (upsert) {
    headers["x-upsert"] = "true";
  }
  const cacheControl = optionalString(input.cacheControl);
  if (cacheControl) {
    headers["cache-control"] = cacheControl;
  }
  const body = source.file;
  const response = await context.fetcher(url, {
    method,
    headers,
    body,
    signal: context.signal,
  });
  if (!response.ok) {
    const bytes = await readBoundedResponseBytes(response, {
      maxBytes: 64 * 1024,
      fieldName: "Supabase Storage upload error response",
      createError: (message) => new ProviderRequestError(413, message),
    });
    throw createSupabaseError(response, parseSupabaseStorageError(bytes), "execute");
  }
  return {
    bucketId,
    objectPath,
    fileId: `${bucketId}/${objectPath}`,
    name: defaultStorageObjectName(objectPath),
    mimeType: mime,
    sizeBytes: source.sizeBytes,
    etag: response.headers.get("etag") ?? null,
  };
}

interface SupabaseStorageKey {
  value: string;
  authorizationBearer: boolean;
}

async function resolveSupabaseStorageKey(
  input: SupabaseActionInput,
  projectRef: string,
  context: BearerProviderContext,
  operation: "download" | "upload",
): Promise<SupabaseStorageKey> {
  const apiKeyId = optionalString(input.apiKeyId);
  const payload = await requestSupabaseJson({
    path: apiKeyId
      ? `/projects/${encodeURIComponent(projectRef)}/api-keys/${encodeURIComponent(apiKeyId)}`
      : `/projects/${encodeURIComponent(projectRef)}/api-keys`,
    context,
    query: { reveal: true },
  });
  const records = apiKeyId ? [normalizeApiKeyRecord(payload)] : normalizeApiKeyListPayload(payload);
  for (const record of records) {
    const value = optionalString(record.apiKey);
    const type = optionalString(record.type);
    const name = optionalString(record.name);
    if (value && (type === "secret" || value.startsWith("sb_secret_"))) {
      return { value, authorizationBearer: false };
    }
    if (value && type === "legacy" && name === "service_role") {
      return { value, authorizationBearer: true };
    }
  }

  throw providerInputError(
    apiKeyId
      ? "The selected Supabase API key is not an elevated secret or legacy service_role key."
      : `Supabase Storage ${operation} requires a revealed secret or legacy service_role project API key.`,
  );
}

function readStorageBucketId(input: SupabaseActionInput): string {
  const bucketId = requiredString(input.bucketId, "bucketId", providerInputError);
  if (/^\.+$/.test(bucketId)) {
    throw providerInputError("bucketId must not be a . or .. path segment");
  }
  return bucketId;
}

function readStorageProjectRef(input: SupabaseActionInput): string {
  const projectRef = readProjectRef(input);
  if (!/^[a-z0-9]+$/.test(projectRef)) {
    throw providerInputError("projectRef must contain only lowercase letters and numbers");
  }
  return projectRef;
}

function encodeStorageObjectPath(objectPath: string): string {
  return objectPath.split("/").map(encodeURIComponent).join("/");
}

function defaultStorageObjectName(objectPath: string): string {
  return objectPath.split("/").findLast((segment) => segment.length > 0) ?? "supabase-object";
}

function parseSupabaseStorageError(bytes: Uint8Array): unknown {
  const body = new TextDecoder().decode(bytes).trim();
  if (!body) {
    return null;
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return { message: body };
  }
}

async function supabaseListEdgeFunctions(input: SupabaseActionInput, context: BearerProviderContext): Promise<unknown> {
  const projectRef = readProjectRef(input);
  return {
    functions: normalizeRecordList(
      await requestSupabaseJson({
        path: `/projects/${encodeURIComponent(projectRef)}/functions`,
        context,
      }),
      "edge functions",
    ),
  };
}

async function supabaseGetEdgeFunction(input: SupabaseActionInput, context: BearerProviderContext): Promise<unknown> {
  const projectRef = readProjectRef(input);
  const functionSlug = requiredString(input.functionSlug, "functionSlug", providerInputError);
  return {
    function: requiredRecord(
      await requestSupabaseJson({
        path: `/projects/${encodeURIComponent(projectRef)}/functions/${encodeURIComponent(functionSlug)}`,
        context,
      }),
      "edge function",
      providerMalformedError,
    ),
  };
}

async function requestSupabaseJson(options: {
  accessToken?: string;
  context?: BearerProviderContext;
  fetcher?: typeof fetch;
  signal?: AbortSignal;
  phase?: SupabaseRequestPhase;
  method?: SupabaseRequestOptions["method"];
  path: string;
  query?: SupabaseRequestOptions["query"];
  body?: unknown;
  responseMode?: SupabaseRequestOptions["responseMode"];
}): Promise<unknown> {
  const accessToken = options.accessToken ?? options.context?.accessToken;
  const fetcher = options.fetcher ?? options.context?.fetcher;
  if (!accessToken || !fetcher) {
    throw new ProviderRequestError(401, "supabase credentials are required");
  }

  const url = new URL(`${supabaseApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    response = await fetcher(url, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers: supabaseHeaders(accessToken, Boolean(options.body)),
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal ?? options.context?.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `supabase request failed: ${error.message}` : "supabase request failed",
    );
  }

  const body = await response.text().catch(() => "");
  const payload = parseJsonBody(body, options.responseMode === "optional_json");
  if (!response.ok) {
    throw createSupabaseError(response, payload, options.phase ?? "execute");
  }

  if (payload === null && options.responseMode !== "optional_json") {
    throw new ProviderRequestError(502, "malformed supabase response: empty body");
  }

  return payload;
}

function supabaseHeaders(accessToken: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function parseJsonBody(body: string, allowEmpty: boolean): unknown {
  if (!body.trim()) {
    return allowEmpty ? null : undefined;
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ProviderRequestError(502, "malformed supabase json response");
  }
}

function createSupabaseError(response: Response, payload: unknown, phase: SupabaseRequestPhase): ProviderRequestError {
  const detail = optionalRecord(payload);
  const code = detail ? (optionalString(detail.code) ?? optionalString(detail.error)) : undefined;
  const message = detail
    ? (optionalString(detail.message) ??
      optionalString(detail.msg) ??
      optionalString(detail.error_description) ??
      `supabase request failed with ${response.status}`)
    : `supabase request failed with ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, detail);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, detail);
  }
  if ([400, 404, 409, 422].includes(response.status)) {
    return new ProviderRequestError(
      400,
      code === "invalid_grant" ? "supabase grant is invalid or expired" : message,
      detail,
    );
  }

  return new ProviderRequestError(response.status, message, detail);
}

function normalizeOrganizationList(payload: unknown): SupabaseOrganizationSummary[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "malformed supabase organizations response", payload);
  }

  return payload.map((item) => normalizeOrganization(item));
}

function sortOrganizations(organizations: SupabaseOrganizationSummary[]): SupabaseOrganizationSummary[] {
  return [...organizations].sort((left, right) => {
    const byId = left.id.localeCompare(right.id);
    return byId !== 0 ? byId : left.name.localeCompare(right.name);
  });
}

function buildSupabaseAccountFingerprint(organizations: SupabaseOrganizationSummary[], accessToken: string): string {
  const fingerprintSource =
    organizations.length > 0 ? organizations.map((organization) => organization.id).join("|") : `token:${accessToken}`;

  return `orgs:${createHash("sha256").update(fingerprintSource).digest("hex").slice(0, 16)}`;
}

function normalizeOrganization(payload: unknown): SupabaseOrganizationSummary {
  const item = requiredRecord(payload, "organization", providerMalformedError);

  return {
    id: requiredString(item.id, "organization.id", providerMalformedError),
    name: requiredString(item.name, "organization.name", providerMalformedError),
    slug: nullableString(item.slug),
  };
}

function normalizeOrganizationDetail(payload: unknown): Record<string, unknown> {
  const item = requiredRecord(payload, "organization", providerMalformedError);

  return compactObject({
    ...item,
    id: requiredString(item.id, "organization.id", providerMalformedError),
    name: requiredString(item.name, "organization.name", providerMalformedError),
    plan: optionalString(item.plan),
  });
}

function normalizeOrganizationMemberList(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "malformed supabase organization members response", payload);
  }

  return payload.map((entry) => normalizeOrganizationMember(entry));
}

function normalizeOrganizationMember(payload: unknown): Record<string, unknown> {
  const item = requiredRecord(payload, "member", providerMalformedError);

  return compactObject({
    ...item,
    userId: requiredString(item.user_id, "member.user_id", providerMalformedError),
    userName: requiredString(item.user_name, "member.user_name", providerMalformedError),
    email: optionalString(item.email),
    roleName: requiredString(item.role_name, "member.role_name", providerMalformedError),
    mfaEnabled: readBoolean(item.mfa_enabled, "member.mfa_enabled"),
  });
}

function normalizeOrganizationProjectsResponse(payload: unknown): Record<string, unknown> {
  const item = requiredRecord(payload, "organization projects", providerMalformedError);
  if (!Array.isArray(item.projects)) {
    throw new ProviderRequestError(502, "malformed supabase organization projects response", payload);
  }

  return {
    projects: item.projects.map((entry) => normalizeOrganizationProject(entry)),
    pagination: normalizePagination(item.pagination),
  };
}

function normalizeOrganizationProject(payload: unknown): Record<string, unknown> {
  const item = requiredRecord(payload, "organization project", providerMalformedError);

  return compactObject({
    ...item,
    ref: requiredString(item.ref, "organizationProject.ref", providerMalformedError),
    name: requiredString(item.name, "organizationProject.name", providerMalformedError),
    cloudProvider: optionalString(item.cloud_provider),
    region: requiredString(item.region, "organizationProject.region", providerMalformedError),
    isBranch: optionalBoolean(item.is_branch),
    status:
      normalizeProjectStatus(requiredString(item.status, "organizationProject.status", providerMalformedError)) ??
      "UNKNOWN",
    insertedAt: optionalString(item.inserted_at),
    databases: Array.isArray(item.databases)
      ? item.databases.map((entry) => requiredRecord(entry, "database", providerMalformedError))
      : undefined,
  });
}

function normalizePagination(payload: unknown): Record<string, unknown> {
  const item = requiredRecord(payload, "pagination", providerMalformedError);

  return {
    count: readNumber(item.count, "pagination.count"),
    limit: readNumber(item.limit, "pagination.limit"),
    offset: readNumber(item.offset, "pagination.offset"),
  };
}

function normalizeProjectSummaryList(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "malformed supabase projects response", payload);
  }

  return payload.map((item) => normalizeProjectSummary(item));
}

function normalizeProjectSummary(payload: unknown): Record<string, unknown> {
  const item = requiredRecord(payload, "project", providerMalformedError);

  return {
    id: requiredString(item.id, "project.id", providerMalformedError),
    organizationId: requiredString(item.organization_id, "project.organization_id", providerMalformedError),
    name: requiredString(item.name, "project.name", providerMalformedError),
    region: requiredString(item.region, "project.region", providerMalformedError),
    status: normalizeProjectStatus(optionalString(item.status)),
    createdAt: requiredString(item.created_at, "project.created_at", providerMalformedError),
    database: normalizeProjectDatabaseSummary(item.database),
  };
}

function normalizeProjectDetail(payload: unknown): Record<string, unknown> {
  const item = requiredRecord(payload, "project", providerMalformedError);

  return {
    id: requiredString(item.id, "project.id", providerMalformedError),
    ref: requiredString(item.ref, "project.ref", providerMalformedError),
    organizationId: requiredString(item.organization_id, "project.organization_id", providerMalformedError),
    organizationSlug: requiredString(item.organization_slug, "project.organization_slug", providerMalformedError),
    name: requiredString(item.name, "project.name", providerMalformedError),
    region: requiredString(item.region, "project.region", providerMalformedError),
    status: normalizeProjectStatus(requiredString(item.status, "project.status", providerMalformedError)) ?? "UNKNOWN",
    createdAt: requiredString(item.created_at, "project.created_at", providerMalformedError),
    database: normalizeProjectDatabaseDetail(item.database),
  };
}

function normalizeProjectDatabaseSummary(payload: unknown): Record<string, unknown> | undefined {
  if (payload == null) {
    return undefined;
  }

  const item = requiredRecord(payload, "project.database", providerMalformedError);
  return compactObject({
    host: optionalString(item.host),
    version: optionalString(item.version),
    postgresEngine: nullableString(item.postgres_engine),
    releaseChannel: nullableString(item.release_channel),
  });
}

function normalizeProjectDatabaseDetail(payload: unknown): Record<string, unknown> {
  const item = requiredRecord(payload, "project.database", providerMalformedError);

  return {
    host: requiredString(item.host, "project.database.host", providerMalformedError),
    version: requiredString(item.version, "project.database.version", providerMalformedError),
    postgresEngine: nullableString(item.postgres_engine),
    releaseChannel: nullableString(item.release_channel),
  };
}

function normalizeApiKeyListPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => normalizeApiKeyRecord(item));
  }

  const item = requiredRecord(payload, "api keys", providerMalformedError);
  if (!Array.isArray(item.details)) {
    throw new ProviderRequestError(502, "malformed supabase api key list response", payload);
  }

  return item.details.map((entry) => normalizeApiKeyRecord(entry));
}

function normalizeApiKeyRecord(payload: unknown): Record<string, unknown> {
  const item = requiredRecord(payload, "api key", providerMalformedError);

  return compactObject({
    id: requiredString(item.id, "apiKey.id", providerMalformedError),
    name: requiredString(item.name, "apiKey.name", providerMalformedError),
    type: normalizeApiKeyType(requiredString(item.type, "apiKey.type", providerMalformedError)),
    prefix: requiredString(item.prefix, "apiKey.prefix", providerMalformedError),
    hash: requiredString(item.hash, "apiKey.hash", providerMalformedError),
    description: nullableString(item.description),
    apiKey: optionalString(item.api_key),
    insertedAt: optionalString(item.inserted_at),
    updatedAt: optionalString(item.updated_at),
    secretJwtTemplate: item.secret_jwt_template === null ? null : optionalRecord(item.secret_jwt_template),
  });
}

function normalizeSecretInputList(payload: unknown): Array<Record<string, string>> {
  if (!Array.isArray(payload)) {
    throw providerInputError("supabase secrets input must be an array");
  }

  return payload.map((entry) => {
    const item = requiredRecord(entry, "secret", providerInputError);
    return {
      name: requiredString(item.name, "secret.name", providerInputError),
      value: requiredString(item.value, "secret.value", providerInputError),
    };
  });
}

function normalizeSecretList(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "malformed supabase secrets response", payload);
  }

  return payload.map((entry) => normalizeSecret(entry));
}

function normalizeSecret(payload: unknown): Record<string, unknown> {
  const item = requiredRecord(payload, "secret", providerMalformedError);

  return compactObject({
    name: requiredString(item.name, "secret.name", providerMalformedError),
    value: optionalString(item.value),
    updatedAt: optionalString(item.updated_at),
  });
}

function normalizeHealthServiceList(payload: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "malformed supabase project health response", payload);
  }

  return payload.map((entry) => normalizeHealthService(entry));
}

function normalizeHealthService(payload: unknown): Record<string, unknown> {
  const item = requiredRecord(payload, "health", providerMalformedError);

  return compactObject({
    ...item,
    name: requiredString(item.name, "health.name", providerMalformedError),
    healthy: readBoolean(item.healthy, "health.healthy"),
    status: requiredString(item.status, "health.status", providerMalformedError),
    error: optionalString(item.error),
    info: item.info === null ? null : optionalRecord(item.info),
  });
}

function normalizeRecordList(payload: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `malformed supabase ${label} response`, payload);
  }

  return payload.map((entry) => requiredRecord(entry, label, providerMalformedError));
}

function normalizeProjectStatus(value: string | undefined): string | undefined {
  if (value == null) {
    return undefined;
  }

  return projectStatuses.has(value) ? value : "UNKNOWN";
}

function normalizeApiKeyType(value: string): string {
  return apiKeyTypes.has(value) ? value : "unknown";
}

function readProjectRef(input: SupabaseActionInput): string {
  return requiredString(input.projectRef, "projectRef", providerInputError);
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw providerMalformedError(`missing ${field}`);
  }

  return value;
}

function readNumber(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw providerMalformedError(`missing ${field}`);
  }

  return parsed;
}

function readJwtSubject(accessToken: string): string | null {
  const parts = accessToken.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as {
      sub?: unknown;
    };

    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

function buildSupabaseAccountLabel(organizations: SupabaseOrganizationSummary[]): string {
  if (organizations.length === 0) {
    return "Supabase OAuth";
  }

  const firstName = organizations[0]!.name;
  return organizations.length === 1
    ? `Supabase (${firstName})`
    : `Supabase (${firstName} +${organizations.length - 1})`;
}

function providerMalformedError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `malformed supabase response: ${message}`);
}
