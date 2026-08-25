import { optionalRecord, optionalString, compactObject } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const planetScaleApiBaseUrl = "https://api.planetscale.com/v1/";

interface PlanetScaleCredentialInput {
  apiKey?: string;
  serviceTokenId?: string;
  values?: Record<string, string>;
  providerMetadata?: Record<string, unknown>;
}

function requireApiKey(input: PlanetScaleCredentialInput): string {
  const value = optionalString(input.apiKey);
  if (!value) throw new ProviderRequestError(400, "apiKey is required");
  return value;
}

interface PlanetScaleEndpoint {
  method: "GET" | "POST" | "DELETE";
  path: (input: Record<string, unknown>) => string[];
  query?: (input: Record<string, unknown>) => Record<string, unknown>;
  body?: (input: Record<string, unknown>) => Record<string, unknown>;
}

const endpointByActionName: Record<string, PlanetScaleEndpoint> = {
  list_organizations: {
    method: "GET",
    path: () => ["organizations"],
    query: listQuery,
  },
  get_organization: {
    method: "GET",
    path: (input) => ["organizations", readRequiredString(input.organization, "organization")],
  },
  list_databases: {
    method: "GET",
    path: (input) => ["organizations", readRequiredString(input.organization, "organization"), "databases"],
    query: (input) => ({ q: input.query, ...listQuery(input) }),
  },
  get_database: {
    method: "GET",
    path: databasePath,
  },
  create_database: {
    method: "POST",
    path: (input) => ["organizations", readRequiredString(input.organization, "organization"), "databases"],
    body: (input) => ({
      name: input.name,
      kind: input.kind,
      region: input.region,
      cluster_size: input.clusterSize,
      replicas: input.replicas,
      major_version: input.majorVersion,
    }),
  },
  delete_database: {
    method: "DELETE",
    path: databasePath,
  },
  list_branches: {
    method: "GET",
    path: (input) => [...databasePath(input), "branches"],
    query: (input) => ({
      q: input.query,
      production: input.production,
      safe_migrations: input.safeMigrations,
      order: input.order,
      ...listQuery(input),
    }),
  },
  get_branch: {
    method: "GET",
    path: branchPath,
  },
  create_branch: {
    method: "POST",
    path: (input) => [...databasePath(input), "branches"],
    body: (input) => ({
      name: input.name,
      parent_branch: input.parentBranch,
      region: input.region,
      deletion_protected: input.deletionProtected,
    }),
  },
  delete_branch: {
    method: "DELETE",
    path: branchPath,
    query: (input) => ({ delete_descendants: input.deleteDescendants }),
  },
};

export async function validatePlanetScaleCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ providerAccountId: string | undefined; accountLabel: string; providerMetadata: Record<string, unknown> }> {
  const apiKey = requireApiKey(input).trim();
  const serviceTokenId = optionalString(input.serviceTokenId)?.trim();
  if (!serviceTokenId) {
    throw new ProviderRequestError(400, "serviceTokenId is required");
  }

  const organizations = await requestPlanetScale("list_organizations", {}, `${serviceTokenId}:${apiKey}`, fetcher);
  const firstOrganization = firstDataRecord(organizations);
  const organizationId = optionalString(firstOrganization?.id);
  const organizationName = optionalString(firstOrganization?.name);

  return {
    providerAccountId: organizationId,
    accountLabel: organizationName ?? "PlanetScale Service Token",
    providerMetadata: {
      apiBaseUrl: planetScaleApiBaseUrl,
      serviceTokenId,
      organizationId,
      organizationName,
    },
  };
}

export function executePlanetScaleAction(
  actionName: string,
  input: Record<string, unknown>,
  credential: PlanetScaleCredentialInput,
  fetcher: typeof fetch,
): Promise<unknown> {
  const apiKey = requireApiKey(credential).trim();
  const serviceTokenId = readServiceTokenId(credential);
  return requestPlanetScale(actionName, input, `${serviceTokenId}:${apiKey}`, fetcher);
}

async function requestPlanetScale(
  actionName: string,
  input: Record<string, unknown>,
  authorization: string,
  fetcher: typeof fetch,
) {
  const endpoint = endpointByActionName[actionName];
  const url = new URL(endpoint.path(input).map(encodeURIComponent).join("/"), planetScaleApiBaseUrl);
  for (const [name, value] of Object.entries(compactObject(endpoint.query?.(input) ?? {}))) {
    url.searchParams.set(name, String(value));
  }

  let response: Response;
  try {
    response = await fetcher(url, {
      method: endpoint.method,
      headers: {
        accept: "application/json",
        authorization,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: endpoint.body ? JSON.stringify(compactObject(endpoint.body(input))) : undefined,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `PlanetScale request failed: ${error.message}` : "PlanetScale request failed",
    );
  }

  const text = await response.text().catch(() => "");
  const payload = parseJson(text);
  if (!response.ok) {
    throw createPlanetScaleError(response.status, payload);
  }
  if (endpoint.method == "DELETE") {
    return { deleted: true };
  }
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "PlanetScale returned an invalid JSON response");
  }
  return record;
}

function databasePath(input: Record<string, unknown>) {
  return [
    "organizations",
    readRequiredString(input.organization, "organization"),
    "databases",
    readRequiredString(input.database, "database"),
  ];
}

function branchPath(input: Record<string, unknown>) {
  return [...databasePath(input), "branches", readRequiredString(input.branch, "branch")];
}

function listQuery(input: Record<string, unknown>) {
  return { page: input.page, per_page: input.perPage };
}

function readServiceTokenId(input: PlanetScaleCredentialInput) {
  const serviceTokenId =
    optionalString(input.values?.serviceTokenId)?.trim() ??
    optionalString(input.providerMetadata?.serviceTokenId)?.trim() ??
    optionalString(input.serviceTokenId)?.trim();
  if (!serviceTokenId) {
    throw new ProviderRequestError(400, "serviceTokenId is required");
  }
  return serviceTokenId;
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value != "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function firstDataRecord(payload: unknown) {
  const data = optionalRecord(payload)?.data;
  return Array.isArray(data) ? optionalRecord(data[0]) : undefined;
}

function parseJson(text: string) {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function createPlanetScaleError(status: number, payload: unknown) {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `PlanetScale request failed with HTTP ${status}`;
  if (status == 401) {
    return new ProviderRequestError(status, message);
  }
  if (status == 403) {
    return new ProviderRequestError(status, message);
  }
  if (status == 429) {
    return new ProviderRequestError(status, message);
  }
  if (status == 400 || status == 404 || status == 409 || status == 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}
