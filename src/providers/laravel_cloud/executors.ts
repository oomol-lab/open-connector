import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "laravel_cloud";
const laravelCloudApiBaseUrl = "https://cloud.laravel.com/api";

type JsonObject = Record<string, unknown>;
type LaravelCloudActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface LaravelCloudRequest {
  path: string;
  search?: URLSearchParams;
}

interface NormalizedOrganization extends JsonObject {
  id: string;
  name: string | null;
  slug: string | null;
}

export const laravelCloudActionHandlers: ProviderActionHandlers<"laravel_cloud", LaravelCloudActionHandler> = {
  async get_organization(_input, context) {
    const payload = await requestLaravelCloud({ path: "/meta/organization" }, context);
    return {
      organization: normalizeOrganization(readObject(payload.data)),
    };
  },
  async list_regions(_input, context) {
    const payload = await requestLaravelCloud({ path: "/meta/regions" }, context);
    return {
      regions: readArray(payload.data).map(normalizeRegion),
    };
  },
  async list_applications(input, context) {
    const search = buildSearchParams(input, {
      name: "filter[name]",
      region: "filter[region]",
      slug: "filter[slug]",
    });
    addInclude(search, input.include);
    const payload = await requestLaravelCloud({ path: "/applications", search }, context);
    return {
      applications: readArray(payload.data).map(normalizeApplication),
      links: optionalRecord(payload.links) ?? null,
      meta: optionalRecord(payload.meta) ?? null,
      included: readOptionalArray(payload.included),
    };
  },
  async get_application(input, context) {
    const search = new URLSearchParams();
    addInclude(search, input.include);
    const payload = await requestLaravelCloud(
      {
        path: `/applications/${encodeURIComponent(requiredInputString(input.applicationId, "applicationId"))}`,
        search,
      },
      context,
    );
    return {
      application: normalizeApplication(readObject(payload.data)),
      included: readOptionalArray(payload.included),
    };
  },
  async list_environments(input, context) {
    const search = buildSearchParams(input, {
      name: "filter[name]",
      status: "filter[status]",
      slug: "filter[slug]",
    });
    addInclude(search, input.include);
    const payload = await requestLaravelCloud(
      {
        path: `/applications/${encodeURIComponent(requiredInputString(input.applicationId, "applicationId"))}/environments`,
        search,
      },
      context,
    );
    return {
      environments: readArray(payload.data).map(normalizeEnvironment),
      links: optionalRecord(payload.links) ?? null,
      meta: optionalRecord(payload.meta) ?? null,
      included: readOptionalArray(payload.included),
    };
  },
  async get_environment(input, context) {
    const search = new URLSearchParams();
    addInclude(search, input.include);
    const payload = await requestLaravelCloud(
      {
        path: `/environments/${encodeURIComponent(requiredInputString(input.environmentId, "environmentId"))}`,
        search,
      },
      context,
    );
    return {
      environment: normalizeEnvironment(readObject(payload.data)),
      included: readOptionalArray(payload.included),
    };
  },
  async list_deployments(input, context) {
    const search = buildSearchParams(input, {
      status: "filter[status]",
      branchName: "filter[branch_name]",
      commitHash: "filter[commit_hash]",
    });
    addInclude(search, input.include);
    const payload = await requestLaravelCloud(
      {
        path: `/environments/${encodeURIComponent(requiredInputString(input.environmentId, "environmentId"))}/deployments`,
        search,
      },
      context,
    );
    return {
      deployments: readArray(payload.data).map(normalizeDeployment),
      links: optionalRecord(payload.links) ?? null,
      meta: optionalRecord(payload.meta) ?? null,
      included: readOptionalArray(payload.included),
    };
  },
  async get_deployment(input, context) {
    const search = new URLSearchParams();
    addInclude(search, input.include);
    const payload = await requestLaravelCloud(
      { path: `/deployments/${encodeURIComponent(requiredInputString(input.deploymentId, "deploymentId"))}`, search },
      context,
    );
    return {
      deployment: normalizeDeployment(readObject(payload.data)),
      included: readOptionalArray(payload.included),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, laravelCloudActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateLaravelCloudCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};

async function validateLaravelCloudCredential(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<CredentialValidationResult> {
  const payload = await requestLaravelCloud({ path: "/meta/organization" }, context);
  const organization = normalizeOrganization(readObject(payload.data));
  const label = organization.name ?? organization.slug ?? "Laravel Cloud Account";

  return {
    profile: {
      accountId: `laravel_cloud:organization:${organization.id}`,
      displayName: label,
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/meta/organization",
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
    },
  };
}

async function requestLaravelCloud(
  request: LaravelCloudRequest,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<JsonObject> {
  const url = new URL(`${laravelCloudApiBaseUrl}${request.path}`);
  if (request.search) {
    for (const [key, value] of request.search) {
      url.searchParams.append(key, value);
    }
  }

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Laravel Cloud request failed: ${error.message}` : "Laravel Cloud request failed",
    );
  }

  const payload = await readJsonObject(response);
  if (!response.ok) {
    throw mapLaravelCloudError(response, payload);
  }

  return payload;
}

async function readJsonObject(response: Response): Promise<JsonObject> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return readObject(JSON.parse(text) as unknown);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Laravel Cloud returned invalid JSON");
  }
}

function mapLaravelCloudError(response: Response, payload: JsonObject): ProviderRequestError {
  const message =
    optionalString(payload.message) ??
    optionalString(payload.error) ??
    `Laravel Cloud API request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function buildSearchParams(input: Record<string, unknown>, mapping: Record<string, string>): URLSearchParams {
  const search = new URLSearchParams();
  for (const [inputKey, queryKey] of Object.entries(mapping)) {
    const value = optionalString(input[inputKey]);
    if (value) {
      search.set(queryKey, value);
    }
  }
  return search;
}

function addInclude(search: URLSearchParams, include: unknown): void {
  if (Array.isArray(include) && include.length > 0) {
    search.set("include", include.map(String).join(","));
  }
}

function normalizeOrganization(resource: JsonObject): NormalizedOrganization {
  const attributes = optionalRecord(resource.attributes) ?? {};
  return {
    id: readResponseString(resource.id, "organization.id"),
    type: optionalString(resource.type) ?? "organizations",
    name: optionalString(attributes.name) ?? null,
    slug: optionalString(attributes.slug) ?? null,
    raw: resource,
  };
}

function normalizeRegion(value: unknown): JsonObject {
  const region = readObject(value);
  return {
    region: readResponseString(region.region, "region.region"),
    label: readResponseString(region.label, "region.label"),
    flag: readResponseString(region.flag, "region.flag"),
    raw: region,
  };
}

function normalizeApplication(value: unknown): JsonObject {
  const resource = readObject(value);
  const attributes = optionalRecord(resource.attributes) ?? {};
  return {
    id: readResponseString(resource.id, "application.id"),
    type: optionalString(resource.type) ?? "applications",
    name: optionalString(attributes.name) ?? null,
    slug: optionalString(attributes.slug) ?? null,
    region: optionalString(attributes.region) ?? null,
    slackChannel: optionalString(attributes.slack_channel) ?? null,
    avatarUrl: optionalString(attributes.avatar_url) ?? null,
    createdAt: optionalString(attributes.created_at) ?? null,
    repository: optionalRecord(attributes.repository) ?? null,
    relationships: optionalRecord(resource.relationships) ?? null,
    raw: resource,
  };
}

function normalizeEnvironment(value: unknown): JsonObject {
  const resource = readObject(value);
  const attributes = optionalRecord(resource.attributes) ?? {};
  return {
    id: readResponseString(resource.id, "environment.id"),
    type: optionalString(resource.type) ?? "environments",
    name: optionalString(attributes.name) ?? null,
    slug: optionalString(attributes.slug) ?? null,
    status: optionalString(attributes.status) ?? null,
    vanityDomain: optionalString(attributes.vanity_domain) ?? null,
    phpMajorVersion: optionalString(attributes.php_major_version) ?? null,
    nodeVersion: optionalString(attributes.node_version) ?? null,
    buildCommand: optionalString(attributes.build_command) ?? null,
    deployCommand: optionalString(attributes.deploy_command) ?? null,
    usesOctane: optionalBoolean(attributes.uses_octane) ?? null,
    usesPushToDeploy: optionalBoolean(attributes.uses_push_to_deploy) ?? null,
    usesDeployHook: optionalBoolean(attributes.uses_deploy_hook) ?? null,
    createdAt: optionalString(attributes.created_at) ?? null,
    relationships: optionalRecord(resource.relationships) ?? null,
    links: optionalRecord(resource.links) ?? null,
    raw: resource,
  };
}

function normalizeDeployment(value: unknown): JsonObject {
  const resource = readObject(value);
  const attributes = optionalRecord(resource.attributes) ?? {};
  return {
    id: readResponseString(resource.id, "deployment.id"),
    type: optionalString(resource.type) ?? "deployments",
    status: optionalString(attributes.status) ?? null,
    branchName: optionalString(attributes.branch_name) ?? null,
    commitHash: optionalString(attributes.commit_hash) ?? null,
    commitMessage: optionalString(attributes.commit_message) ?? null,
    commitAuthor: optionalString(attributes.commit_author) ?? null,
    failureReason: optionalString(attributes.failure_reason) ?? null,
    phpMajorVersion: optionalString(attributes.php_major_version) ?? null,
    buildCommand: optionalString(attributes.build_command) ?? null,
    nodeVersion: optionalString(attributes.node_version) ?? null,
    usesOctane: optionalBoolean(attributes.uses_octane) ?? null,
    startedAt: optionalString(attributes.started_at) ?? null,
    finishedAt: optionalString(attributes.finished_at) ?? null,
    relationships: optionalRecord(resource.relationships) ?? null,
    links: optionalRecord(resource.links) ?? null,
    raw: resource,
  };
}

function readArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  throw new ProviderRequestError(502, "Laravel Cloud response data must be an array");
}

function readOptionalArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function readObject(value: unknown): JsonObject {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as JsonObject;
  }
  throw new ProviderRequestError(502, "Laravel Cloud response data must be an object");
}

function readResponseString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, () => new ProviderRequestError(502, `${fieldName} is missing`));
}
