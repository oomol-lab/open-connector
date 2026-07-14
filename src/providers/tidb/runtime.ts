import type { CredentialValidationResult } from "../../core/types.ts";
import type { TiDBActionName } from "./actions.ts";

import { createHash, randomBytes } from "node:crypto";
import {
  optionalInteger as asOptionalInteger,
  optionalString as asOptionalString,
  stringArray as asStringArray,
} from "../../core/cast.ts";
import { providerFetch, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const tidbApiBaseUrlByFamily = {
  starter_essential: "https://serverless.tidbapi.com/v1beta1",
  dedicated: "https://dedicated.tidbapi.com/v1beta1",
  iam: "https://iam.tidbapi.com/v1beta1",
} as const;

export type TiDBApiFamily = keyof Omit<typeof tidbApiBaseUrlByFamily, "iam">;
export type TiDBProxyFamily = TiDBApiFamily | "iam";

type TiDBCredentialContext = {
  publicKey: string;
  privateKey: string;
  fetcher: typeof fetch;
};

type TiDBActionHandler = (input: Record<string, unknown>, context: TiDBCredentialContext) => Promise<unknown>;

type TiDBDigestChallenge = {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
};

type TiDBRequestInput = {
  family: TiDBProxyFamily;
  method?: string;
  path: string;
  query?: Array<[string, string | number | undefined]>;
  multiQuery?: Array<[string, string[] | undefined]>;
  context: TiDBCredentialContext;
  phase: "validate" | "execute";
};

export interface TiDBProxyRequestInput {
  family: TiDBProxyFamily;
  path: string;
  method: string;
  headers: Headers;
  publicKey: string;
  privateKey: string;
  fetcher: typeof fetch;
  query?: Record<string, string>;
  body?: BodyInit;
  signal?: AbortSignal;
}

type TiDBApiKeyPayload = {
  name?: unknown;
  accessKey?: unknown;
  displayName?: unknown;
  role?: unknown;
  secretKey?: unknown;
};

type TiDBClusterListPayload = {
  clusters?: unknown;
  nextPageToken?: unknown;
  totalSize?: unknown;
};

type TiDBRegionListPayload = {
  regions?: unknown;
  nextPageToken?: unknown;
  totalSize?: unknown;
};

type TiDBListPayload = {
  nextPageToken?: unknown;
  totalSize?: unknown;
};

export const tidbActionHandlers: Record<TiDBActionName, TiDBActionHandler> = {
  list_api_keys(input, context) {
    return tidbListApiKeys(input, context);
  },
  get_api_key(input, context) {
    return tidbGetApiKey(input, context);
  },
  list_audit_logs(input, context) {
    return tidbListAuditLogs(input, context);
  },
  list_clusters(input, context) {
    return tidbListClusters(input, context);
  },
  get_cluster(input, context) {
    return tidbGetCluster(input, context);
  },
  list_regions(input, context) {
    return tidbListRegions(input, context);
  },
  show_node_quota(_input, context) {
    return tidbShowNodeQuota(context);
  },
  show_cloud_providers(input, context) {
    return tidbShowCloudProviders(input, context);
  },
  get_region(input, context) {
    return tidbGetRegion(input, context);
  },
  list_node_specs(input, context) {
    return tidbListNodeSpecs(input, context);
  },
  get_node_spec(input, context) {
    return tidbGetNodeSpec(input, context);
  },
  list_imports(input, context) {
    return tidbListImports(input, context);
  },
  get_import(input, context) {
    return tidbGetImport(input, context);
  },
  list_exports(input, context) {
    return tidbListExports(input, context);
  },
  get_export(input, context) {
    return tidbGetExport(input, context);
  },
  list_branches(input, context) {
    return tidbListBranches(input, context);
  },
  get_branch(input, context) {
    return tidbGetBranch(input, context);
  },
} satisfies Record<TiDBActionName, TiDBActionHandler>;

export async function validateTiDBCredential(
  input: Record<string, string>,
  fetcher: typeof fetch = providerFetch,
): Promise<CredentialValidationResult> {
  const context = {
    publicKey: requireTiDBCredentialField(input.publicKey, "publicKey"),
    privateKey: requireTiDBCredentialField(input.privateKey, "privateKey"),
    fetcher,
  };
  const payload = await tidbRequest<{ apiKeys?: TiDBApiKeyPayload[] }>({
    family: "iam",
    path: "/apikeys",
    query: [["pageSize", 1]],
    context,
    phase: "validate",
  });
  const apiKey = payload.apiKeys?.[0];
  const accessKey = asOptionalString(apiKey?.accessKey) ?? context.publicKey;
  const displayName = asOptionalString(apiKey?.displayName);
  const role = asOptionalString(apiKey?.role);

  return {
    profile: {
      accountId: accessKey,
      displayName: displayName ?? accessKey,
      grantedScopes: role ? [role] : [],
    },
    grantedScopes: role ? [role] : [],
    metadata: {
      publicKey: accessKey,
      ...(role ? { role } : {}),
    },
  };
}

export function resolveTiDBProxyTarget(endpoint: string): { family: TiDBProxyFamily; path: string } {
  const [, family, ...pathSegments] = endpoint.split("/");
  if (!isTiDBProxyFamily(family)) {
    throw new ProviderRequestError(400, "tidb proxy endpoint must start with /iam, /dedicated, or /starter_essential");
  }
  if (pathSegments.length === 0) {
    throw new ProviderRequestError(400, "tidb proxy endpoint must include an API path");
  }
  return {
    family,
    path: `/${pathSegments.join("/")}`,
  };
}

function isTiDBProxyFamily(value: string | undefined): value is TiDBProxyFamily {
  return value === "iam" || value === "dedicated" || value === "starter_essential";
}

export async function requestTiDBProxy(input: TiDBProxyRequestInput): Promise<Response> {
  const method = input.method;
  const url = buildTiDBUrl({
    family: input.family,
    path: input.path,
    query: Object.entries(input.query ?? {}),
    context: {
      publicKey: input.publicKey,
      privateKey: input.privateKey,
      fetcher: input.fetcher,
    },
    phase: "execute",
  });
  const headers = new Headers(input.headers);
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }
  headers.set("user-agent", providerUserAgent);

  const initialResponse = await input.fetcher(url, {
    method,
    headers,
    body: input.body,
    signal: input.signal,
  });

  if (initialResponse.status !== 401) {
    return initialResponse;
  }

  const challenge = parseDigestChallenge(initialResponse.headers.get("www-authenticate"));
  if (!challenge) {
    return initialResponse;
  }

  const authorizedHeaders = new Headers(headers);
  authorizedHeaders.set(
    "authorization",
    buildDigestAuthorization({
      challenge,
      method,
      uri: buildDigestUri(url),
      username: input.publicKey,
      password: input.privateKey,
    }),
  );

  return input.fetcher(url, {
    method,
    headers: authorizedHeaders,
    body: input.body,
    signal: input.signal,
  });
}

async function tidbListApiKeys(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const payload = await tidbRequest<{
    apiKeys?: TiDBApiKeyPayload[];
    nextPageToken?: unknown;
  }>({
    family: "iam",
    path: "/apikeys",
    query: [
      ["projectId", asOptionalInteger(input.projectId)],
      ["pageSize", asOptionalInteger(input.pageSize)],
      ["pageToken", asOptionalString(input.pageToken)],
    ],
    context,
    phase: "execute",
  });

  return {
    apiKeys: (payload.apiKeys ?? []).map(normalizeTiDBApiKey),
    nextPageToken: normalizeTiDBNextPageToken(payload.nextPageToken),
  };
}

async function tidbGetApiKey(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const accessKey = requireTiDBCredentialField(input.accessKey, "accessKey");
  const payload = await tidbRequest<TiDBApiKeyPayload>({
    family: "iam",
    path: `/apikeys/${encodeURIComponent(accessKey)}`,
    context,
    phase: "execute",
  });

  return normalizeTiDBApiKey(payload);
}

async function tidbListAuditLogs(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const payload = await tidbRequest<TiDBListPayload & { auditLogs?: unknown }>({
    family: "iam",
    path: "/auditLogs",
    query: [
      ["pageSize", asOptionalInteger(input.pageSize)],
      ["pageToken", asOptionalString(input.pageToken)],
      ["startTime", asOptionalString(input.startTime)],
      ["endTime", asOptionalString(input.endTime)],
      ["auditEventTypes", asOptionalString(input.auditEventTypes)],
      ["keyword", asOptionalString(input.keyword)],
    ],
    context,
    phase: "execute",
  });

  return normalizeTiDBListPayload(payload, "auditLogs");
}

async function tidbListClusters(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const apiFamily = requireTiDBApiFamily(input.apiFamily);
  const payload = await tidbRequest<TiDBClusterListPayload>({
    family: apiFamily,
    path: "/clusters",
    query:
      apiFamily === "dedicated"
        ? [
            ["projectId", asOptionalString(input.projectId)],
            ["pageSize", asOptionalInteger(input.pageSize)],
            ["pageToken", asOptionalString(input.pageToken)],
            ["skip", asOptionalInteger(input.skip)],
          ]
        : [
            ["filter", asOptionalString(input.filter)],
            ["pageSize", asOptionalInteger(input.pageSize)],
            ["pageToken", asOptionalString(input.pageToken)],
            ["skip", asOptionalInteger(input.skip)],
          ],
    multiQuery:
      apiFamily === "dedicated"
        ? [
            ["clusterIds", optionalStringArray(input.clusterIds)],
            ["regionIds", optionalStringArray(input.regionIds)],
            ["clusterStates", optionalStringArray(input.clusterStates)],
          ]
        : undefined,
    context,
    phase: "execute",
  });

  return {
    clusters: Array.isArray(payload.clusters) ? payload.clusters : [],
    nextPageToken: normalizeTiDBNextPageToken(payload.nextPageToken),
    totalSize: asOptionalInteger(payload.totalSize) ?? null,
  };
}

async function tidbGetCluster(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const apiFamily = requireTiDBApiFamily(input.apiFamily);
  const clusterId = requireTiDBCredentialField(input.clusterId, "clusterId");

  return tidbRequest<unknown>({
    family: apiFamily,
    path: `/clusters/${encodeURIComponent(clusterId)}`,
    query: apiFamily === "starter_essential" ? [["view", asOptionalString(input.view)]] : undefined,
    context,
    phase: "execute",
  });
}

async function tidbListRegions(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const apiFamily = requireTiDBApiFamily(input.apiFamily);
  const payload = await tidbRequest<TiDBRegionListPayload>({
    family: apiFamily,
    path: "/regions",
    query:
      apiFamily === "dedicated"
        ? [
            ["cloudProvider", asOptionalString(input.cloudProvider)],
            ["projectId", asOptionalString(input.projectId)],
            ["pageSize", asOptionalInteger(input.pageSize)],
            ["pageToken", asOptionalString(input.pageToken)],
            ["skip", asOptionalInteger(input.skip)],
          ]
        : undefined,
    context,
    phase: "execute",
  });

  return {
    regions: Array.isArray(payload.regions) ? payload.regions : [],
    nextPageToken: normalizeTiDBNextPageToken(payload.nextPageToken),
    totalSize: asOptionalInteger(payload.totalSize) ?? null,
  };
}

async function tidbShowNodeQuota(context: TiDBCredentialContext) {
  const payload = await tidbRequest<{ componentQuotas?: unknown }>({
    family: "dedicated",
    path: "/clusters:showNodeQuota",
    context,
    phase: "execute",
  });

  return {
    componentQuotas: Array.isArray(payload.componentQuotas) ? payload.componentQuotas : [],
  };
}

async function tidbShowCloudProviders(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const payload = await tidbRequest<{ cloudProviders?: unknown }>({
    family: "dedicated",
    path: "/regions:showCloudProviders",
    query: [["projectId", asOptionalString(input.projectId)]],
    context,
    phase: "execute",
  });

  return {
    cloudProviders: Array.isArray(payload.cloudProviders) ? payload.cloudProviders : [],
  };
}

async function tidbGetRegion(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const regionId = requireTiDBCredentialField(input.regionId, "regionId");

  return tidbRequest<unknown>({
    family: "dedicated",
    path: `/regions/${encodeURIComponent(regionId)}`,
    query: [["projectId", asOptionalString(input.projectId)]],
    context,
    phase: "execute",
  });
}

async function tidbListNodeSpecs(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const regionId = requireTiDBCredentialField(input.regionId, "regionId");
  const payload = await tidbRequest<TiDBListPayload & { nodeSpecs?: unknown }>({
    family: "dedicated",
    path: `/regions/${encodeURIComponent(regionId)}/nodeSpecs`,
    query: [
      ["componentType", asOptionalString(input.componentType)],
      ["projectId", asOptionalString(input.projectId)],
      ["clusterId", asOptionalString(input.clusterId)],
      ["pageSize", asOptionalInteger(input.pageSize)],
      ["pageToken", asOptionalString(input.pageToken)],
      ["skip", asOptionalInteger(input.skip)],
    ],
    context,
    phase: "execute",
  });

  return normalizeTiDBListPayload(payload, "nodeSpecs");
}

async function tidbGetNodeSpec(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const regionId = requireTiDBCredentialField(input.regionId, "regionId");
  const componentType = requireTiDBCredentialField(input.componentType, "componentType");
  const nodeSpecKey = requireTiDBCredentialField(input.nodeSpecKey, "nodeSpecKey");

  return tidbRequest<unknown>({
    family: "dedicated",
    path: `/regions/${encodeURIComponent(regionId)}/componentTypes/${encodeURIComponent(
      componentType,
    )}/nodeSpecs/${encodeURIComponent(nodeSpecKey)}`,
    query: [
      ["projectId", asOptionalString(input.projectId)],
      ["clusterId", asOptionalString(input.clusterId)],
    ],
    context,
    phase: "execute",
  });
}

async function tidbListImports(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const apiFamily = requireTiDBApiFamily(input.apiFamily);
  const clusterId = requireTiDBCredentialField(input.clusterId, "clusterId");
  const payload = await tidbRequest<TiDBListPayload & { imports?: unknown }>({
    family: apiFamily,
    path: `/clusters/${encodeURIComponent(clusterId)}/imports`,
    query: buildTaskListQuery(input),
    context,
    phase: "execute",
  });

  return normalizeTiDBListPayload(payload, "imports");
}

async function tidbGetImport(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const apiFamily = requireTiDBApiFamily(input.apiFamily);
  const clusterId = requireTiDBCredentialField(input.clusterId, "clusterId");
  const importId = requireTiDBCredentialField(input.importId, "importId");

  return tidbRequest<unknown>({
    family: apiFamily,
    path: `/clusters/${encodeURIComponent(clusterId)}/imports/${encodeURIComponent(importId)}`,
    context,
    phase: "execute",
  });
}

async function tidbListExports(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const clusterId = requireTiDBCredentialField(input.clusterId, "clusterId");
  const payload = await tidbRequest<TiDBListPayload & { exports?: unknown }>({
    family: "starter_essential",
    path: `/clusters/${encodeURIComponent(clusterId)}/exports`,
    query: buildTaskListQuery(input),
    context,
    phase: "execute",
  });

  return normalizeTiDBListPayload(payload, "exports");
}

async function tidbGetExport(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const clusterId = requireTiDBCredentialField(input.clusterId, "clusterId");
  const exportId = requireTiDBCredentialField(input.exportId, "exportId");

  return tidbRequest<unknown>({
    family: "starter_essential",
    path: `/clusters/${encodeURIComponent(clusterId)}/exports/${encodeURIComponent(exportId)}`,
    context,
    phase: "execute",
  });
}

async function tidbListBranches(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const clusterId = requireTiDBCredentialField(input.clusterId, "clusterId");
  const payload = await tidbRequest<TiDBListPayload & { branches?: unknown }>({
    family: "starter_essential",
    path: `/clusters/${encodeURIComponent(clusterId)}/branches`,
    query: [
      ["pageSize", asOptionalInteger(input.pageSize)],
      ["pageToken", asOptionalString(input.pageToken)],
    ],
    context,
    phase: "execute",
  });

  return normalizeTiDBListPayload(payload, "branches");
}

async function tidbGetBranch(input: Record<string, unknown>, context: TiDBCredentialContext) {
  const clusterId = requireTiDBCredentialField(input.clusterId, "clusterId");
  const branchId = requireTiDBCredentialField(input.branchId, "branchId");

  return tidbRequest<unknown>({
    family: "starter_essential",
    path: `/clusters/${encodeURIComponent(clusterId)}/branches/${encodeURIComponent(branchId)}`,
    query: [["view", asOptionalString(input.view)]],
    context,
    phase: "execute",
  });
}

async function tidbRequest<T>(input: TiDBRequestInput): Promise<T> {
  const method = input.method ?? "GET";
  const url = buildTiDBUrl(input);
  const initialResponse = await input.context.fetcher(url.toString(), {
    method,
    headers: buildTiDBHeaders(),
  });

  if (initialResponse.status !== 401) {
    return parseTiDBResponse<T>(initialResponse, input.phase);
  }

  const challenge = parseDigestChallenge(initialResponse.headers.get("www-authenticate"));
  if (!challenge) {
    return parseTiDBResponse<T>(initialResponse, input.phase);
  }

  const response = await input.context.fetcher(url.toString(), {
    method,
    headers: {
      ...buildTiDBHeaders(),
      authorization: buildDigestAuthorization({
        challenge,
        method,
        uri: buildDigestUri(url),
        username: input.context.publicKey,
        password: input.context.privateKey,
      }),
    },
  });

  return parseTiDBResponse<T>(response, input.phase);
}

function buildTiDBUrl(input: TiDBRequestInput) {
  const url = new URL(`${tidbApiBaseUrlByFamily[input.family]}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  for (const [key, values] of input.multiQuery ?? []) {
    for (const value of values ?? []) {
      url.searchParams.append(key, value);
    }
  }
  return url;
}

function buildTiDBHeaders() {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

async function parseTiDBResponse<T>(response: Response, phase: "validate" | "execute") {
  if (response.ok) {
    return (await readTiDBJson(response)) as T;
  }

  const message = await readTiDBError(response);
  if (response.status === 429) {
    throw new ProviderRequestError(429, message);
  }
  if (phase === "validate" && response.status === 401) {
    throw new ProviderRequestError(400, message);
  }
  if (phase === "execute" && response.status === 401) {
    throw new ProviderRequestError(401, message);
  }
  if (response.status === 400) {
    throw new ProviderRequestError(400, message);
  }

  throw new ProviderRequestError(502, message);
}

async function readTiDBJson(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "tidb returned an invalid JSON response");
  }
}

async function readTiDBError(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return `tidb request failed with ${response.status}`;
  }

  try {
    const payload = JSON.parse(text) as { message?: unknown; code?: unknown; error?: unknown };
    const message =
      asOptionalString(payload.message) ??
      asOptionalString(payload.error) ??
      `tidb request failed with ${response.status}`;
    const code = asOptionalString(payload.code);
    return code ? `${message} (${code})` : message;
  } catch {
    return text;
  }
}

function parseDigestChallenge(header: string | null): TiDBDigestChallenge | null {
  if (!header?.toLowerCase().startsWith("digest ")) {
    return null;
  }

  const parameters = parseDigestParameters(header.slice("Digest ".length));
  const realm = parameters.realm;
  const nonce = parameters.nonce;
  if (!realm || !nonce) {
    return null;
  }

  return {
    realm,
    nonce,
    qop: parameters.qop,
    opaque: parameters.opaque,
    algorithm: parameters.algorithm,
  };
}

function parseDigestParameters(input: string) {
  const parameters: Record<string, string> = {};
  for (const part of splitDigestHeader(input)) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = part.slice(0, separatorIndex).trim();
    const rawValue = part.slice(separatorIndex + 1).trim();
    parameters[key] = unquoteDigestValue(rawValue);
  }

  return parameters;
}

function splitDigestHeader(input: string) {
  const parts: string[] = [];
  let current = "";
  let quoted = false;

  for (const character of input) {
    if (character === '"') {
      quoted = !quoted;
      current += character;
      continue;
    }
    if (character === "," && !quoted) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function unquoteDigestValue(input: string) {
  if (input.startsWith('"') && input.endsWith('"')) {
    return input.slice(1, -1).replaceAll('\\"', '"');
  }
  return input;
}

function buildDigestAuthorization(input: {
  challenge: TiDBDigestChallenge;
  method: string;
  uri: string;
  username: string;
  password: string;
}) {
  const algorithm = input.challenge.algorithm?.toUpperCase() ?? "MD5";
  if (algorithm !== "MD5") {
    throw new ProviderRequestError(502, `tidb digest algorithm is not supported: ${algorithm}`);
  }

  const qop = selectDigestQop(input.challenge.qop);
  const nc = "00000001";
  const cnonce = randomBytes(8).toString("hex");
  const ha1 = md5(`${input.username}:${input.challenge.realm}:${input.password}`);
  const ha2 = md5(`${input.method}:${input.uri}`);
  const response = qop
    ? md5(`${ha1}:${input.challenge.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${input.challenge.nonce}:${ha2}`);

  const parameters: Array<[string, string, boolean]> = [
    ["username", input.username, true],
    ["realm", input.challenge.realm, true],
    ["nonce", input.challenge.nonce, true],
    ["uri", input.uri, true],
    ["response", response, true],
  ];
  if (input.challenge.opaque) {
    parameters.push(["opaque", input.challenge.opaque, true]);
  }
  if (qop) {
    parameters.push(["qop", qop, false], ["nc", nc, false], ["cnonce", cnonce, true]);
  }
  if (input.challenge.algorithm) {
    parameters.push(["algorithm", input.challenge.algorithm, false]);
  }

  return `Digest ${parameters
    .map(([key, value, quoted]) => `${key}=${quoted ? `"${escapeDigestValue(value)}"` : value}`)
    .join(", ")}`;
}

function selectDigestQop(qop: string | undefined) {
  if (!qop) {
    return undefined;
  }

  const values = qop.split(",").map((value) => value.trim());
  return values.includes("auth") ? "auth" : undefined;
}

function buildDigestUri(url: URL) {
  return `${url.pathname}${url.search}`;
}

function md5(input: string) {
  return createHash("md5").update(input).digest("hex");
}

function escapeDigestValue(input: string) {
  return input.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function normalizeTiDBApiKey(payload: TiDBApiKeyPayload) {
  return {
    name: asOptionalString(payload.name) ?? null,
    accessKey: asOptionalString(payload.accessKey) ?? "",
    displayName: asOptionalString(payload.displayName) ?? null,
    role: asOptionalString(payload.role) ?? null,
    secretKey: asOptionalString(payload.secretKey) ?? null,
  };
}

function normalizeTiDBListPayload<TField extends string>(
  payload: TiDBListPayload & Partial<Record<TField, unknown>>,
  field: TField,
) {
  return {
    [field]: Array.isArray(payload[field]) ? payload[field] : [],
    nextPageToken: normalizeTiDBNextPageToken(payload.nextPageToken),
    totalSize: asOptionalInteger(payload.totalSize) ?? null,
  };
}

function normalizeTiDBNextPageToken(value: unknown) {
  const token = asOptionalString(value);
  return token ? token : null;
}

function buildTaskListQuery(input: Record<string, unknown>) {
  return [
    ["pageSize", asOptionalInteger(input.pageSize)],
    ["pageToken", asOptionalString(input.pageToken)],
    ["orderBy", asOptionalString(input.orderBy)],
  ] satisfies Array<[string, string | number | undefined]>;
}

function requireTiDBApiFamily(value: unknown): TiDBApiFamily {
  const apiFamily = asOptionalString(value);
  if (apiFamily === "starter_essential" || apiFamily === "dedicated") {
    return apiFamily;
  }

  throw new ProviderRequestError(400, "apiFamily must be starter_essential or dedicated");
}

function optionalStringArray(value: unknown) {
  if (value == null) {
    return undefined;
  }
  return asStringArray(value, "array value", (message) => new ProviderRequestError(400, message));
}

function requireTiDBCredentialField(value: unknown, name: string) {
  const resolved = asOptionalString(value);
  if (!resolved) {
    throw new ProviderRequestError(400, `${name} is required`);
  }
  return resolved;
}
