import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, requiredInputString } from "../provider-runtime.ts";

export const terraformApiBaseUrl = "https://app.terraform.io/api/v2";

const terraformValidationPath = "/account/details";

type TerraformMode = "validate" | "execute";
type TerraformActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface TerraformRequestOptions {
  path: string;
  mode: TerraformMode;
  query?: Record<string, string | undefined>;
}

export const terraformActionHandlers: ProviderActionHandlers<"terraform", TerraformActionHandler> = {
  async get_account_details(_input, context) {
    const payload = await requestTerraformJson(
      {
        path: terraformValidationPath,
        mode: "execute",
      },
      context,
    );
    return {
      user: readSingleResource(payload, "user"),
    };
  },

  async list_organizations(input, context) {
    const payload = await requestTerraformJson(
      {
        path: "/organizations",
        mode: "execute",
        query: paginationQuery(input),
      },
      context,
    );
    return {
      organizations: readResourceList(payload, "organizations"),
      ...readCollectionEnvelope(payload),
    };
  },

  async get_organization(input, context) {
    const organizationName = requiredInputString(input.organizationName, "organizationName");
    const payload = await requestTerraformJson(
      {
        path: `/organizations/${encodeURIComponent(organizationName)}`,
        mode: "execute",
      },
      context,
    );
    return {
      organization: readSingleResource(payload, "organization"),
      included: readIncludedResources(payload),
    };
  },

  async list_workspaces(input, context) {
    const organizationName = requiredInputString(input.organizationName, "organizationName");
    const payload = await requestTerraformJson(
      {
        path: `/organizations/${encodeURIComponent(organizationName)}/workspaces`,
        mode: "execute",
        query: paginationQuery(input),
      },
      context,
    );
    return {
      workspaces: readResourceList(payload, "workspaces"),
      ...readCollectionEnvelope(payload),
    };
  },

  async get_workspace_by_id(input, context) {
    const workspaceId = requiredInputString(input.workspaceId, "workspaceId");
    const payload = await requestTerraformJson(
      {
        path: `/workspaces/${encodeURIComponent(workspaceId)}`,
        mode: "execute",
      },
      context,
    );
    return {
      workspace: readSingleResource(payload, "workspace"),
      included: readIncludedResources(payload),
    };
  },

  async get_workspace_by_name(input, context) {
    const organizationName = requiredInputString(input.organizationName, "organizationName");
    const workspaceName = requiredInputString(input.workspaceName, "workspaceName");
    const payload = await requestTerraformJson(
      {
        path: `/organizations/${encodeURIComponent(organizationName)}/workspaces/${encodeURIComponent(workspaceName)}`,
        mode: "execute",
      },
      context,
    );
    return {
      workspace: readSingleResource(payload, "workspace"),
      included: readIncludedResources(payload),
    };
  },

  async list_workspace_runs(input, context) {
    const workspaceId = requiredInputString(input.workspaceId, "workspaceId");
    const payload = await requestTerraformJson(
      {
        path: `/workspaces/${encodeURIComponent(workspaceId)}/runs`,
        mode: "execute",
        query: {
          ...paginationQuery(input),
          "filter[operation]": commaSeparated(input.operations),
          "filter[status]": commaSeparated(input.statuses),
          "filter[status_group]": optionalString(input.statusGroup),
          "filter[source]": commaSeparated(input.sources),
        },
      },
      context,
    );
    return {
      runs: readResourceList(payload, "runs"),
      ...readCollectionEnvelope(payload),
    };
  },

  async get_run(input, context) {
    const runId = requiredInputString(input.runId, "runId");
    const payload = await requestTerraformJson(
      {
        path: `/runs/${encodeURIComponent(runId)}`,
        mode: "execute",
      },
      context,
    );
    return {
      run: readSingleResource(payload, "run"),
      included: readIncludedResources(payload),
    };
  },
};

export async function validateTerraformCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestTerraformJson(
    {
      path: terraformValidationPath,
      mode: "validate",
    },
    { apiKey, fetcher, signal },
  );
  const user = readSingleResource(payload, "user");
  const userId = optionalString(user.id) ?? "terraform-api-token";
  const attributes = optionalRecord(user.attributes);
  const email = optionalString(attributes?.email);
  const username = optionalString(attributes?.username);

  return {
    profile: {
      accountId: userId,
      displayName: username ?? email ?? "Terraform API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: terraformApiBaseUrl,
      validationEndpoint: terraformValidationPath,
      userId,
      username,
      email,
    }),
  };
}

async function requestTerraformJson(
  options: TerraformRequestOptions,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const url = new URL(`${terraformApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const response = await context.fetcher(url, {
    method: "GET",
    headers: {
      accept: "application/vnd.api+json",
      authorization: `Bearer ${context.apiKey}`,
      "content-type": "application/vnd.api+json",
      "user-agent": providerUserAgent,
    },
    signal: context.signal,
  });
  const payload = await readTerraformPayload(response);

  if (!response.ok) {
    throw mapTerraformError(response.status, payload, options.mode);
  }

  return requireObjectPayload(payload);
}

async function readTerraformPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      errors: [
        {
          detail: text,
        },
      ],
    };
  }
}

function mapTerraformError(status: number, payload: unknown, mode: TerraformMode): ProviderRequestError {
  const message = readTerraformErrorMessage(payload) ?? `Terraform API request failed with status ${status}`;
  if (status === 401) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function readTerraformErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  const errors = body && Array.isArray(body.errors) ? body.errors : undefined;
  const firstError = errors?.find((error) => optionalRecord(error));
  const firstErrorObject = optionalRecord(firstError);
  return (
    optionalString(firstErrorObject?.detail) ?? optionalString(firstErrorObject?.title) ?? optionalString(body?.message)
  );
}

function requireObjectPayload(payload: unknown): Record<string, unknown> {
  const body = optionalRecord(payload);
  if (!body) {
    throw new ProviderRequestError(502, "Terraform returned an invalid JSON:API payload", payload);
  }
  return body;
}

function readSingleResource(payload: Record<string, unknown>, fieldName: string): Record<string, unknown> {
  const data = optionalRecord(payload.data);
  if (!data) {
    throw new ProviderRequestError(502, `Terraform returned an invalid ${fieldName} payload`, payload);
  }
  return normalizeResource(data, fieldName);
}

function readResourceList(payload: Record<string, unknown>, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, `Terraform returned an invalid ${fieldName} list payload`, payload);
  }
  return payload.data.map((item) => normalizeResource(item, fieldName));
}

function readCollectionEnvelope(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    links: optionalRecord(payload.links) ?? null,
    meta: optionalRecord(payload.meta) ?? null,
    included: readIncludedResources(payload),
  };
}

function readIncludedResources(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(payload.included)) {
    return [];
  }
  return payload.included.map((item) => normalizeResource(item, "included resource"));
}

function normalizeResource(value: unknown, fieldName: string): Record<string, unknown> {
  const resource = optionalRecord(value);
  const id = optionalString(resource?.id);
  const type = optionalString(resource?.type);
  if (!resource || !id || !type) {
    throw new ProviderRequestError(502, `Terraform returned an invalid ${fieldName} resource`, value);
  }

  return {
    id,
    type,
    attributes: optionalRecord(resource.attributes) ?? {},
    relationships: optionalRecord(resource.relationships) ?? null,
    links: optionalRecord(resource.links) ?? null,
  };
}

function paginationQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    "page[number]": optionalPositiveIntegerString(input.pageNumber, "pageNumber"),
    "page[size]": optionalPositiveIntegerString(input.pageSize, "pageSize"),
  };
}

function optionalPositiveIntegerString(value: unknown, fieldName: string): string | undefined {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    return undefined;
  }
  if (parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return String(parsed);
}

function commaSeparated(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value.map((item) => String(item).trim()).filter((item) => item !== "");
  return values.length > 0 ? values.join(",") : undefined;
}
