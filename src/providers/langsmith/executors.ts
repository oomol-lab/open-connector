import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { LangSmithActionName } from "./actions.ts";

import {
  compactObject,
  nullableInteger,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "langsmith";
const langSmithWorkspacesPath = "/api/v1/workspaces";
const defaultLangSmithRegion = "us";

type LangSmithRegion = "us" | "eu" | "apac" | "aws_us";
type LangSmithRequestPhase = "validate" | "execute";
type LangSmithActionHandler = (input: Record<string, unknown>, context: LangSmithActionContext) => Promise<unknown>;

interface LangSmithActionContext {
  apiKey: string;
  apiBaseUrl: string;
  workspaceId?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface LangSmithRequestInput {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  context: LangSmithActionContext;
  phase: LangSmithRequestPhase;
}

const langSmithRegionBaseUrls: Record<LangSmithRegion, string> = {
  us: "https://api.smith.langchain.com",
  eu: "https://eu.api.smith.langchain.com",
  apac: "https://apac.api.smith.langchain.com",
  aws_us: "https://aws.api.smith.langchain.com",
};

export const langSmithActionHandlers: Record<LangSmithActionName, LangSmithActionHandler> = {
  list_workspaces(input, context) {
    return listLangSmithWorkspaces(input, context);
  },
  list_projects(input, context) {
    return listLangSmithProjects(input, context);
  },
  get_project(input, context) {
    return getLangSmithProject(input, context);
  },
  create_project(input, context) {
    return createLangSmithProject(input, context);
  },
  list_datasets(input, context) {
    return listLangSmithDatasets(input, context);
  },
  get_dataset(input, context) {
    return getLangSmithDataset(input, context);
  },
  create_dataset(input, context) {
    return createLangSmithDataset(input, context);
  },
  list_examples(input, context) {
    return listLangSmithExamples(input, context);
  },
  get_example(input, context) {
    return getLangSmithExample(input, context);
  },
  create_example(input, context) {
    return createLangSmithExample(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<LangSmithActionContext>({
  service,
  handlers: langSmithActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<LangSmithActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: readLangSmithApiBaseUrl(credential.values.region ?? credential.metadata.region),
      workspaceId: readOptionalTrimmedString(credential.values.workspaceId ?? credential.metadata.workspaceId),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return readLangSmithApiBaseUrl(credential.values.region ?? credential.metadata.region);
  },
  auth: { type: "api_key_header", name: "X-Api-Key" },
  customizeRequest(input) {
    let region = input.url.searchParams.get("region");
    if (region != null) {
      let regionBaseUrl = new URL(readLangSmithApiBaseUrl(region));
      input.url.protocol = regionBaseUrl.protocol;
      input.url.host = regionBaseUrl.host;
      input.url.searchParams.delete("region");
    }

    const workspaceId =
      input.credential?.authType === "api_key"
        ? readOptionalTrimmedString(input.credential.values.workspaceId ?? input.credential.metadata.workspaceId)
        : undefined;
    if (workspaceId) {
      input.headers.set("X-Tenant-Id", workspaceId);
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const region = readLangSmithRegion(input.values.region);
    const apiBaseUrl = langSmithRegionBaseUrls[region];
    const workspaceId = readOptionalTrimmedString(input.values.workspaceId);
    const context: LangSmithActionContext = {
      apiKey: input.apiKey,
      apiBaseUrl,
      workspaceId,
      fetcher,
      signal,
    };
    const payload = await requestLangSmithJson({
      path: langSmithWorkspacesPath,
      context,
      phase: "validate",
    });
    const workspaces = ensureObjectArray(payload, "LangSmith workspace list");
    const workspaceName = readFirstWorkspaceName(workspaces);

    return {
      profile: {
        accountId: workspaceId ? `langsmith:workspace:${workspaceId}` : "langsmith:api_key",
        displayName: workspaceName ?? "LangSmith API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl,
        region,
        workspaceId,
        validationEndpoint: langSmithWorkspacesPath,
        workspaceCount: workspaces.length,
      }),
    };
  },
};

async function listLangSmithWorkspaces(
  input: Record<string, unknown>,
  context: LangSmithActionContext,
): Promise<unknown> {
  const payload = await requestLangSmithJson({
    path: langSmithWorkspacesPath,
    query: compactObject({
      include_deleted: optionalBoolean(input.include_deleted),
      data_plane_id: optionalString(input.data_plane_id),
    }),
    context,
    phase: "execute",
  });

  return {
    workspaces: ensureObjectArray(payload, "LangSmith workspace list").map(normalizeWorkspace),
  };
}

async function listLangSmithProjects(
  input: Record<string, unknown>,
  context: LangSmithActionContext,
): Promise<unknown> {
  const payload = await requestLangSmithJson({
    path: "/api/v1/sessions",
    query: compactObject({
      name: optionalString(input.name),
      name_contains: optionalString(input.name_contains),
      include_stats: optionalBoolean(input.include_stats),
      sort_by_desc: optionalBoolean(input.sort_by_desc),
      offset: optionalNumber(input.offset),
      limit: optionalNumber(input.limit),
    }),
    context,
    phase: "execute",
  });

  return {
    projects: ensureObjectArray(payload, "LangSmith project list").map(normalizeProject),
  };
}

async function getLangSmithProject(input: Record<string, unknown>, context: LangSmithActionContext): Promise<unknown> {
  const payload = await requestLangSmithJson({
    path: `/api/v1/sessions/${encodeURIComponent(String(input.projectId))}`,
    query: compactObject({
      include_stats: optionalBoolean(input.include_stats),
    }),
    context,
    phase: "execute",
  });

  return {
    project: normalizeProject(ensureObject(payload, "LangSmith project")),
  };
}

async function createLangSmithProject(
  input: Record<string, unknown>,
  context: LangSmithActionContext,
): Promise<unknown> {
  const payload = await requestLangSmithJson({
    method: "POST",
    path: "/api/v1/sessions",
    query: compactObject({
      upsert: optionalBoolean(input.upsert),
    }),
    body: compactObject({
      name: optionalString(input.name),
      description: optionalString(input.description),
      start_time: optionalString(input.start_time),
      end_time: optionalString(input.end_time),
      extra: input.extra,
      default_dataset_id: optionalString(input.default_dataset_id),
      reference_dataset_id: optionalString(input.reference_dataset_id),
    }),
    context,
    phase: "execute",
  });

  return {
    project: normalizeProject(ensureObject(payload, "LangSmith created project")),
  };
}

async function listLangSmithDatasets(
  input: Record<string, unknown>,
  context: LangSmithActionContext,
): Promise<unknown> {
  const payload = await requestLangSmithJson({
    path: "/api/v1/datasets",
    query: compactObject({
      name: optionalString(input.name),
      name_contains: optionalString(input.name_contains),
      data_type: optionalString(input.data_type),
      offset: optionalNumber(input.offset),
      limit: optionalNumber(input.limit),
    }),
    context,
    phase: "execute",
  });

  return {
    datasets: ensureObjectArray(payload, "LangSmith dataset list").map(normalizeDataset),
  };
}

async function getLangSmithDataset(input: Record<string, unknown>, context: LangSmithActionContext): Promise<unknown> {
  const payload = await requestLangSmithJson({
    path: `/api/v1/datasets/${encodeURIComponent(String(input.datasetId))}`,
    context,
    phase: "execute",
  });

  return {
    dataset: normalizeDataset(ensureObject(payload, "LangSmith dataset")),
  };
}

async function createLangSmithDataset(
  input: Record<string, unknown>,
  context: LangSmithActionContext,
): Promise<unknown> {
  const payload = await requestLangSmithJson({
    method: "POST",
    path: "/api/v1/datasets",
    body: compactObject({
      name: optionalString(input.name),
      description: optionalString(input.description),
      data_type: optionalString(input.data_type),
      inputs_schema_definition: input.inputs_schema_definition,
      outputs_schema_definition: input.outputs_schema_definition,
      metadata: input.metadata,
      externally_managed: optionalBoolean(input.externally_managed),
    }),
    context,
    phase: "execute",
  });

  return {
    dataset: normalizeDataset(ensureObject(payload, "LangSmith created dataset")),
  };
}

async function listLangSmithExamples(
  input: Record<string, unknown>,
  context: LangSmithActionContext,
): Promise<unknown> {
  const payload = await requestLangSmithJson({
    path: "/api/v1/examples",
    query: compactObject({
      dataset: optionalString(input.datasetId),
      full_text_contains: input.full_text_contains,
      as_of: optionalString(input.as_of),
      offset: optionalNumber(input.offset),
      limit: optionalNumber(input.limit),
    }),
    context,
    phase: "execute",
  });

  return {
    examples: ensureObjectArray(payload, "LangSmith example list").map(normalizeExample),
  };
}

async function getLangSmithExample(input: Record<string, unknown>, context: LangSmithActionContext): Promise<unknown> {
  const payload = await requestLangSmithJson({
    path: `/api/v1/examples/${encodeURIComponent(String(input.exampleId))}`,
    query: compactObject({
      dataset: optionalString(input.datasetId),
      as_of: optionalString(input.as_of),
    }),
    context,
    phase: "execute",
  });

  return {
    example: normalizeExample(ensureObject(payload, "LangSmith example")),
  };
}

async function createLangSmithExample(
  input: Record<string, unknown>,
  context: LangSmithActionContext,
): Promise<unknown> {
  const payload = await requestLangSmithJson({
    method: "POST",
    path: "/api/v1/examples",
    body: compactObject({
      dataset_id: optionalString(input.datasetId),
      inputs: input.inputs,
      outputs: input.outputs,
      metadata: input.metadata,
      split: input.split,
      id: optionalString(input.id),
      created_at: optionalString(input.created_at),
    }),
    context,
    phase: "execute",
  });

  return {
    example: normalizeExample(ensureObject(payload, "LangSmith created example")),
  };
}

async function requestLangSmithJson(input: LangSmithRequestInput): Promise<unknown> {
  const url = new URL(input.path, input.context.apiBaseUrl);
  appendQuery(url, input.query);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildLangSmithHeaders(input.context, input.body != null),
      body: input.body != null ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
    payload = await readLangSmithPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `langsmith request failed: ${error.message}` : "langsmith request failed",
    );
  }

  if (!response.ok) {
    throw createLangSmithError(response, payload, input.phase);
  }

  return payload;
}

function buildLangSmithHeaders(context: LangSmithActionContext, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "X-Api-Key": context.apiKey,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  if (context.workspaceId) {
    headers["X-Tenant-Id"] = context.workspaceId;
  }
  return headers;
}

function appendQuery(url: URL, query: Record<string, unknown> | undefined): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) {
          url.searchParams.append(key, String(item));
        }
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

async function readLangSmithPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function createLangSmithError(
  response: Response,
  payload: unknown,
  phase: LangSmithRequestPhase,
): ProviderRequestError {
  const message = extractLangSmithErrorMessage(payload) ?? response.statusText;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }

  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractLangSmithErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.detail) ??
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.title)
  );
}

function normalizeWorkspace(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(value.id ?? ""),
    organization_id: optionalString(value.organization_id) ?? null,
    display_name: optionalString(value.display_name) ?? "",
    is_personal: value.is_personal === true,
    is_deleted: value.is_deleted === true,
    tenant_handle: optionalString(value.tenant_handle) ?? null,
    data_plane_url: optionalString(value.data_plane_url) ?? null,
    raw: value,
  };
}

function normalizeProject(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(value.id ?? ""),
    tenant_id: String(value.tenant_id ?? ""),
    name: optionalString(value.name) ?? null,
    description: optionalString(value.description) ?? null,
    start_time: optionalString(value.start_time) ?? null,
    end_time: optionalString(value.end_time) ?? null,
    run_count: nullableInteger(value.run_count) ?? null,
    error_rate: optionalNumber(value.error_rate) ?? null,
    default_dataset_id: optionalString(value.default_dataset_id) ?? null,
    reference_dataset_id: optionalString(value.reference_dataset_id) ?? null,
    raw: value,
  };
}

function normalizeDataset(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(value.id ?? ""),
    tenant_id: String(value.tenant_id ?? ""),
    name: optionalString(value.name) ?? "",
    description: optionalString(value.description) ?? null,
    data_type: optionalString(value.data_type) ?? null,
    created_at: optionalString(value.created_at) ?? null,
    modified_at: optionalString(value.modified_at) ?? null,
    example_count: nullableInteger(value.example_count) ?? null,
    session_count: nullableInteger(value.session_count) ?? null,
    metadata: normalizeNullableObject(value.metadata),
    raw: value,
  };
}

function normalizeExample(value: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(value.id ?? ""),
    dataset_id: String(value.dataset_id ?? ""),
    name: optionalString(value.name) ?? null,
    created_at: optionalString(value.created_at) ?? null,
    modified_at: optionalString(value.modified_at) ?? null,
    inputs: normalizeObject(value.inputs),
    outputs: normalizeNullableObject(value.outputs),
    metadata: normalizeNullableObject(value.metadata),
    raw: value,
  };
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function normalizeNullableObject(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }
  return normalizeObject(value);
}

function ensureObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} response is not an object`);
  }
  return record;
}

function ensureObjectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} response is not an array`);
  }
  return value.map((item) => ensureObject(item, label));
}

function readFirstWorkspaceName(workspaces: Array<Record<string, unknown>>): string | undefined {
  for (const workspace of workspaces) {
    const name = optionalString(workspace.display_name);
    if (name) {
      return name;
    }
  }
  return undefined;
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  return optionalString(value);
}

function readLangSmithApiBaseUrl(value: unknown): string {
  return langSmithRegionBaseUrls[readLangSmithRegion(value)];
}

function readLangSmithRegion(value: unknown): LangSmithRegion {
  let region = readOptionalTrimmedString(value) ?? defaultLangSmithRegion;
  if (region === "aws") {
    region = "aws_us";
  }
  if (region === "us" || region === "eu" || region === "apac" || region === "aws_us") {
    return region;
  }

  throw new ProviderRequestError(400, "langsmith region must be one of us, eu, apac, or aws_us");
}
