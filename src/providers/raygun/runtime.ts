import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { RaygunActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const asOptionalInteger = optionalInteger;
const asOptionalString = optionalString;

type RaygunQueryValue = string | number | boolean | readonly string[] | undefined;
type RaygunContext = {
  apiKey: string;
  fetcher: typeof fetch;
};
type RaygunActionHandler = (input: Record<string, unknown>, context: RaygunContext) => Promise<unknown>;

interface RaygunRequestInput {
  path: string;
  method?: string;
  query?: Record<string, RaygunQueryValue>;
  body?: Record<string, unknown>;
}

export const raygunApiBaseUrl = "https://api.raygun.com/v3";
const validationEndpoint = "/applications";
const deploymentFields = [
  "version",
  "ownerName",
  "emailAddress",
  "comment",
  "scmIdentifier",
  "scmType",
  "deployedAt",
] as const;

export const raygunActionHandlers: ProviderActionHandlers<"raygun", RaygunActionHandler> = {
  async list_applications(input, context) {
    const response = await raygunRequest(
      {
        path: "/applications",
        query: buildListQuery(input),
      },
      context,
    );
    return normalizeListResponse(response, "applications");
  },
  async get_application(input, context) {
    const applicationIdentifier = readRequiredString(input.applicationIdentifier, "applicationIdentifier");
    const response = await raygunRequest(
      {
        path: `/applications/${encodePathSegment(applicationIdentifier)}`,
      },
      context,
    );
    return { application: normalizeObject(response.payload, "Raygun application") };
  },
  async list_deployments(input, context) {
    const applicationIdentifier = readRequiredString(input.applicationIdentifier, "applicationIdentifier");
    const response = await raygunRequest(
      {
        path: `/applications/${encodePathSegment(applicationIdentifier)}/deployments`,
        query: buildListQuery(input),
      },
      context,
    );
    return normalizeListResponse(response, "deployments");
  },
  async get_latest_deployment(input, context) {
    const applicationIdentifier = readRequiredString(input.applicationIdentifier, "applicationIdentifier");
    const response = await raygunRequest(
      {
        path: `/applications/${encodePathSegment(applicationIdentifier)}/deployments/latest`,
      },
      context,
    );
    return { deployment: normalizeObject(response.payload, "Raygun deployment") };
  },
  async get_deployment(input, context) {
    const response = await raygunRequest(
      {
        path: buildDeploymentPath(input),
      },
      context,
    );
    return { deployment: normalizeObject(response.payload, "Raygun deployment") };
  },
  async create_deployment(input, context) {
    const applicationIdentifier = readRequiredString(input.applicationIdentifier, "applicationIdentifier");
    const response = await raygunRequest(
      {
        path: `/applications/${encodePathSegment(applicationIdentifier)}/deployments`,
        method: "POST",
        body: compactObject(pickDeploymentBody(input, "create")),
      },
      context,
    );
    return { deployment: normalizeObject(response.payload, "Raygun deployment") };
  },
  async update_deployment(input, context) {
    const body = compactObject(pickDeploymentBody(input, "update"));
    if (Object.keys(body).length === 0) {
      throw new ProviderRequestError(400, "at least one deployment field is required");
    }
    const response = await raygunRequest(
      {
        path: buildDeploymentPath(input),
        method: "PATCH",
        body,
      },
      context,
    );
    return { deployment: normalizeObject(response.payload, "Raygun deployment") };
  },
  async delete_deployment(input, context) {
    const applicationIdentifier = readRequiredString(input.applicationIdentifier, "applicationIdentifier");
    const deploymentIdentifier = readRequiredString(input.deploymentIdentifier, "deploymentIdentifier");
    await raygunRequest(
      {
        path: buildDeploymentPath(input),
        method: "DELETE",
      },
      context,
    );
    return {
      applicationIdentifier,
      deploymentIdentifier,
      deleted: true,
    };
  },
  async list_error_groups(input, context) {
    const applicationIdentifier = readRequiredString(input.applicationIdentifier, "applicationIdentifier");
    const response = await raygunRequest(
      {
        path: `/applications/${encodePathSegment(applicationIdentifier)}/error-groups`,
        query: buildListQuery(input),
      },
      context,
    );
    return normalizeListResponse(response, "errorGroups");
  },
  async get_error_group(input, context) {
    const applicationIdentifier = readRequiredString(input.applicationIdentifier, "applicationIdentifier");
    const errorGroupIdentifier = readRequiredString(input.errorGroupIdentifier, "errorGroupIdentifier");
    const response = await raygunRequest(
      {
        path: `/applications/${encodePathSegment(applicationIdentifier)}/error-groups/${encodePathSegment(errorGroupIdentifier)}`,
      },
      context,
    );
    return { errorGroup: normalizeObject(response.payload, "Raygun error group") };
  },
};

export async function validateRaygunCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = input.apiKey;
  const response = await raygunRequest(
    {
      path: validationEndpoint,
      query: {
        count: 1,
      },
    },
    {
      apiKey,
      fetcher,
    },
  );
  const applications = normalizeArray(response.payload, "Raygun applications");
  const firstApplication = applications[0];
  const firstApplicationName =
    firstApplication && typeof firstApplication === "object" && !Array.isArray(firstApplication)
      ? asOptionalString((firstApplication as Record<string, unknown>).name)
      : undefined;

  return {
    profile: {
      accountId: "raygun",
      displayName: firstApplicationName ? `Raygun PAT ()` : "Raygun Personal Access Token",
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: raygunApiBaseUrl,
      validationEndpoint,
      accessibleApplicationCount: response.totalCount,
    },
  };
}

export async function executeRaygunAction(
  input: { apiKey: string; actionName: RaygunActionName; input: Record<string, unknown> } & {
    actionName: RaygunActionName;
    input: Record<string, unknown>;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const handler = raygunActionHandlers[input.actionName];
  if (!handler) {
    throw new ProviderRequestError(400, `unknown Raygun action: ${input.actionName}`);
  }

  return handler(input.input, {
    apiKey: input.apiKey,
    fetcher,
  });
}

async function raygunRequest(input: RaygunRequestInput, context: RaygunContext) {
  let response: Response;
  let payload: unknown;

  try {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${context.apiKey}`,
      "user-agent": providerUserAgent,
    };
    if (input.body) {
      headers["content-type"] = "application/json";
    }

    response = await context.fetcher(buildRaygunUrl(input), {
      method: input.method ?? "GET",
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
    payload = await readRaygunPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Raygun request failed: ${error.message}` : "Raygun request failed",
    );
  }

  if (!response.ok) {
    throw createRaygunError(response.status, payload);
  }

  return {
    payload,
    totalCount: readIntegerHeader(response.headers, "x-raygun-total-count"),
    links: parseLinkHeader(response.headers.get("link")),
  };
}

function buildRaygunUrl(input: RaygunRequestInput) {
  const url = new URL(`${raygunApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      url.searchParams.set(key, value.join(","));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function buildListQuery(input: Record<string, unknown>) {
  return compactObject({
    count: asOptionalInteger(input.count),
    offset: asOptionalInteger(input.offset),
    orderBy: readOptionalStringArray(input.orderBy),
  });
}

function buildDeploymentPath(input: Record<string, unknown>) {
  const applicationIdentifier = readRequiredString(input.applicationIdentifier, "applicationIdentifier");
  const deploymentIdentifier = readRequiredString(input.deploymentIdentifier, "deploymentIdentifier");
  return `/applications/${encodePathSegment(applicationIdentifier)}/deployments/${encodePathSegment(deploymentIdentifier)}`;
}

function pickDeploymentBody(input: Record<string, unknown>, mode: "create" | "update") {
  const body: Record<string, unknown> = {};
  for (const field of deploymentFields) {
    if (input[field] !== undefined) {
      body[field] = input[field];
    }
  }
  if (mode === "create" && body.version === undefined) {
    throw new ProviderRequestError(400, "version is required");
  }
  return body;
}

function normalizeListResponse(
  response: { payload: unknown; totalCount?: number; links: Record<string, string> },
  outputKey: string,
) {
  const items = normalizeArray(response.payload, `Raygun ${outputKey}`);
  return {
    [outputKey]: items,
    pagination: compactObject({
      totalCount: response.totalCount,
      count: items.length,
      links: Object.keys(response.links).length > 0 ? response.links : undefined,
    }),
  };
}

async function readRaygunPayload(response: Response) {
  if (response.status === 204) {
    return null;
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Raygun response was not valid JSON");
  }
}

function createRaygunError(status: number, payload: unknown) {
  const message = extractRaygunErrorMessage(payload) ?? `Raygun request failed with status ${status}`;
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function extractRaygunErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  return (
    asOptionalString(record.detail) ??
    asOptionalString(record.title) ??
    asOptionalString(record.message) ??
    asOptionalString(record.error)
  );
}

function normalizeArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} response must be an array`);
  }
  return value.map((item) => normalizeObject(item, label));
}

function normalizeObject(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} response must be an object`);
  }
  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readOptionalStringArray(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "array input is required");
  }
  return value.map((item) => String(item));
}

function readIntegerHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseLinkHeader(value: string | null) {
  const links: Record<string, string> = {};
  if (!value) {
    return links;
  }
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    const urlEnd = trimmed.indexOf(">");
    const relIndex = trimmed.indexOf('rel="');
    if (!trimmed.startsWith("<") || urlEnd <= 1 || relIndex === -1) {
      continue;
    }
    const relStart = relIndex + 'rel="'.length;
    const relEnd = trimmed.indexOf('"', relStart);
    if (relEnd === -1) {
      continue;
    }
    links[trimmed.slice(relStart, relEnd)] = trimmed.slice(1, urlEnd);
  }
  return links;
}
