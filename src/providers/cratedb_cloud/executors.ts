import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "cratedb_cloud";
const cratedbCloudApiBaseUrl = "https://console.cratedb.cloud";
const cratedbCloudRequestBaseUrl = `${cratedbCloudApiBaseUrl}/`;
const cratedbCloudValidationPath = "/api/v2/users/me/";
const cratedbCloudMaxResponseBytes = 10 * 1024 * 1024;

type CratedbCloudRequestPhase = "validate" | "execute";
interface CratedbCloudContext {
  key: string;
  apiSecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
type CratedbCloudActionHandler = (input: Record<string, unknown>, context: CratedbCloudContext) => Promise<unknown>;

export const cratedbCloudActionHandlers: ProviderActionHandlers<"cratedb_cloud", CratedbCloudActionHandler> = {
  async get_current_user(_input, context) {
    const payload = await requestCratedbCloudJsonForAction({
      context,
      path: cratedbCloudValidationPath,
    });
    return { user: normalizeUser(payload) };
  },
  async list_organizations(_input, context) {
    const payload = await requestCratedbCloudJsonForAction({
      context,
      path: "/api/v2/organizations/",
    });
    return {
      organizations: readArrayPayload(payload, "CrateDB Cloud organizations response").map((item) =>
        normalizeOrganization(item),
      ),
    };
  },
  async get_organization(input, context) {
    const id = requireInputString(input.id, "id");
    const payload = await requestCratedbCloudJsonForAction({
      context,
      path: `/api/v2/organizations/${encodeURIComponent(id)}/`,
    });
    return { organization: normalizeOrganization(payload) };
  },
  async list_projects(input, context) {
    const organizationId = trimOptionalString(input.organizationId);
    const path = organizationId
      ? `/api/v2/organizations/${encodeURIComponent(organizationId)}/projects/`
      : "/api/v2/projects/";
    const payload = await requestCratedbCloudJsonForAction({ context, path });
    return {
      projects: readArrayPayload(payload, "CrateDB Cloud projects response").map((item) => normalizeProject(item)),
    };
  },
  async get_project(input, context) {
    const id = requireInputString(input.id, "id");
    const payload = await requestCratedbCloudJsonForAction({
      context,
      path: `/api/v2/projects/${encodeURIComponent(id)}/`,
    });
    return { project: normalizeProject(payload) };
  },
  async list_clusters(input, context) {
    const organizationId = trimOptionalString(input.organizationId);
    const path = organizationId
      ? `/api/v2/organizations/${encodeURIComponent(organizationId)}/clusters/`
      : "/api/v2/clusters/";
    const payload = await requestCratedbCloudJsonForAction({
      context,
      path,
      query: compactObject({
        project_id: trimOptionalString(input.projectId),
      }),
    });
    return {
      clusters: readArrayPayload(payload, "CrateDB Cloud clusters response").map((item) => normalizeCluster(item)),
    };
  },
  async get_cluster(input, context) {
    const id = requireInputString(input.id, "id");
    const payload = await requestCratedbCloudJsonForAction({
      context,
      path: `/api/v2/clusters/${encodeURIComponent(id)}/`,
    });
    return { cluster: normalizeCluster(payload) };
  },
  async list_regions(input, context) {
    const organizationId = trimOptionalString(input.organizationId);
    const path = organizationId
      ? `/api/v2/organizations/${encodeURIComponent(organizationId)}/regions/`
      : "/api/v2/regions/";
    const payload = await requestCratedbCloudJsonForAction({ context, path });
    return {
      regions: readArrayPayload(payload, "CrateDB Cloud regions response").map((item) => normalizeRegion(item)),
    };
  },
  async list_products(input, context) {
    const payload = await requestCratedbCloudJsonForAction({
      context,
      path: "/api/v2/products/",
      query: compactObject({
        kind: trimOptionalString(input.kind),
      }),
    });
    return {
      products: readArrayPayload(payload, "CrateDB Cloud products response")
        .map((item) => normalizeProduct(item))
        .filter((product) => product.raw.deprecated !== true),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<CratedbCloudContext>({
  service,
  handlers: cratedbCloudActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<CratedbCloudContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      key: requireCratedbCloudKey(credential.values.key),
      apiSecret: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: cratedbCloudApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    headers.set(
      "authorization",
      buildCratedbCloudAuthorizationHeader(requireCratedbCloudKey(credential.values.key), credential.apiKey),
    );
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const key = requireCratedbCloudKey(input.values.key);
    const payload = await requestCratedbCloudJson({
      method: "GET",
      path: cratedbCloudValidationPath,
      key,
      apiSecret: input.apiKey,
      phase: "validate",
      fetcher,
      signal,
    });
    const user = normalizeUser(payload);
    return {
      profile: {
        accountId: user.uid ?? user.email ?? key,
        displayName: user.name ?? user.email ?? user.username ?? "CrateDB Cloud API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: cratedbCloudApiBaseUrl,
        validationEndpoint: cratedbCloudValidationPath,
        key,
        uid: user.uid ?? undefined,
        email: user.email ?? undefined,
        username: user.username ?? undefined,
        organizationId: user.organizationId ?? undefined,
      }),
    };
  },
};

async function requestCratedbCloudJsonForAction(input: {
  context: CratedbCloudContext;
  path: string;
  query?: Record<string, string | undefined>;
}) {
  return requestCratedbCloudJson({
    method: "GET",
    path: input.path,
    key: input.context.key,
    apiSecret: input.context.apiSecret,
    query: input.query,
    phase: "execute",
    fetcher: input.context.fetcher,
    signal: input.context.signal,
  });
}

async function requestCratedbCloudJson(input: {
  method: "GET";
  path: string;
  key: string;
  apiSecret: string;
  query?: Record<string, string | undefined>;
  phase: CratedbCloudRequestPhase;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}) {
  const url = new URL(input.path.startsWith("/") ? input.path.slice(1) : input.path, cratedbCloudRequestBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.signal);
  try {
    const response = await input.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: buildCratedbCloudAuthorizationHeader(input.key, input.apiSecret),
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readCratedbCloudPayload(response);
    if (!response.ok) {
      throw createCratedbCloudError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "CrateDB Cloud request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `CrateDB Cloud request failed: ${error.message}` : "CrateDB Cloud request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

export function buildCratedbCloudAuthorizationHeader(key: string, apiSecret: string) {
  return `Basic ${Buffer.from(`${key}:${apiSecret}`, "utf8").toString("base64")}`;
}

function normalizeUser(value: unknown) {
  const record = requireRecord(value, "CrateDB Cloud user response");
  return {
    uid: nullableTrimmedString(record.uid) ?? nullableTrimmedString(record.id),
    email: nullableTrimmedString(record.email),
    username: nullableTrimmedString(record.username),
    name: nullableTrimmedString(record.name),
    organizationId: nullableTrimmedString(record.organization_id),
    status: nullableTrimmedString(record.status),
    isSuperuser: nullableBoolean(record.is_superuser),
    idp: nullableTrimmedString(record.idp),
    raw: record,
  };
}

function normalizeOrganization(value: unknown) {
  const record = requireRecord(value, "CrateDB Cloud organization");
  return {
    id: readRequiredString(record.id, "organization.id"),
    name: nullableTrimmedString(record.name),
    planType: nullableTrimmedString(record.plan_type),
    raw: record,
  };
}

function normalizeProject(value: unknown) {
  const record = requireRecord(value, "CrateDB Cloud project");
  return {
    id: readRequiredString(record.id, "project.id"),
    name: nullableTrimmedString(record.name),
    region: nullableTrimmedString(record.region),
    organizationId: nullableTrimmedString(record.organization_id),
    backupLocation: record.backup_location ?? null,
    raw: record,
  };
}

function normalizeCluster(value: unknown) {
  const record = requireRecord(value, "CrateDB Cloud cluster");
  return {
    id: readRequiredString(record.id, "cluster.id"),
    name: nullableTrimmedString(record.name),
    numNodes: nullableInteger(record.num_nodes),
    crateVersion: nullableTrimmedString(record.crate_version),
    projectId: nullableTrimmedString(record.project_id),
    username: nullableTrimmedString(record.username),
    suspended: nullableBoolean(record.suspended),
    fqdn: nullableTrimmedString(record.fqdn),
    url: nullableTrimmedString(record.url),
    channel: nullableTrimmedString(record.channel),
    raw: record,
  };
}

function normalizeRegion(value: unknown) {
  const record = requireRecord(value, "CrateDB Cloud region");
  return {
    name: readRequiredString(record.name, "region.name"),
    description: nullableTrimmedString(record.description),
    organizationId: nullableTrimmedString(record.organization_id),
    isEdgeRegion: nullableBoolean(record.is_edge_region),
    status: nullableTrimmedString(record.status),
    raw: record,
  };
}

function normalizeProduct(value: unknown) {
  const record = requireRecord(value, "CrateDB Cloud product");
  const specs = optionalRecord(record.specs);
  return {
    kind: nullableTrimmedString(record.kind),
    name: readRequiredString(record.name, "product.name"),
    tier: nullableTrimmedString(record.tier),
    description: nullableTrimmedString(record.description),
    scaleSummary: nullableTrimmedString(record.scale_summary),
    vcpuCores: nullableNumber(specs?.cpu_cores),
    ramBytes: nullableNumber(specs?.ram_bytes),
    minStorageBytes: nullableNumber(specs?.storage_minimum_bytes),
    maxStorageBytes: nullableNumber(specs?.storage_maximum_bytes),
    pricePerDtuMinute: nullableNumber(record.price_per_dtu_minute),
    raw: record,
  };
}

async function readCratedbCloudPayload(response: Response) {
  const text = await readProviderTextBody(response, "CrateDB Cloud response", cratedbCloudMaxResponseBytes);
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createCratedbCloudError(status: number, payload: unknown, phase: CratedbCloudRequestPhase) {
  const message = extractCratedbCloudErrorMessage(payload) ?? `CrateDB Cloud request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && [400, 401, 402, 403].includes(status)) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && [401, 402, 403].includes(status)) {
    return new ProviderRequestError(401, message);
  }

  if (phase === "execute" && [400, 404, 405, 409].includes(status)) {
    return new ProviderRequestError(status, message);
  }

  return new ProviderRequestError(status >= 500 || status < 400 ? 502 : status, message);
}

function extractCratedbCloudErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return trimOptionalString(record.message) ?? trimOptionalString(record.error) ?? trimOptionalString(record.detail);
}

function readArrayPayload(value: unknown, label: string) {
  if (Array.isArray(value)) {
    return value;
  }

  const record = requireRecord(value, label);
  for (const key of ["data", "items", "results"]) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      return nested;
    }
  }

  throw new ProviderRequestError(502, `${label} did not return an array`);
}

function requireRecord(value: unknown, label: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} did not return an object`);
  }
  return record;
}

function requireInputString(value: unknown, fieldName: string) {
  const trimmed = trimOptionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return trimmed;
}

function readRequiredString(value: unknown, fieldName: string) {
  const trimmed = trimOptionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return trimmed;
}

function requireCratedbCloudKey(value: unknown) {
  const key = trimOptionalString(value);
  if (!key) {
    throw new ProviderRequestError(400, "key is required");
  }
  return key;
}

function trimOptionalString(value: unknown) {
  return optionalString(value)?.trim() || undefined;
}

function nullableTrimmedString(value: unknown) {
  return trimOptionalString(value) ?? null;
}

function nullableBoolean(value: unknown) {
  return optionalBoolean(value) ?? null;
}

function nullableNumber(value: unknown) {
  return optionalNumber(value) ?? null;
}

function nullableInteger(value: unknown) {
  const number = optionalNumber(value);
  return number == null ? null : Math.trunc(number);
}
