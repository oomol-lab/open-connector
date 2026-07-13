import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, readProviderJsonBody, setSearchParams } from "../provider-runtime.ts";

export const fivetranApiBaseUrl = "https://api.fivetran.com";

export interface FivetranCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface FivetranContext extends FivetranCredentials {
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface FivetranPage {
  items: unknown[];
  nextCursor: string | null;
}

type FivetranActionHandler = (input: Record<string, unknown>, context: FivetranContext) => Promise<unknown>;

export const fivetranActionHandlers: Record<string, FivetranActionHandler> = {
  async list_transformation_projects(input, context) {
    const data = await fivetranGetData(
      "/v1/transformation-projects",
      paginationQuery(input),
      context,
      "list transformation projects",
    );
    const page = readFivetranPage(data, "transformation projects");
    return { projects: page.items, nextCursor: page.nextCursor };
  },
  async get_transformation_project(input, context) {
    const projectId = requiredString(input.projectId, "projectId");
    const project = await fivetranGetData(
      `/v1/transformation-projects/${encodeURIComponent(projectId)}`,
      {},
      context,
      "get transformation project",
    );
    return { project };
  },
  async list_log_services(input, context) {
    const data = await fivetranGetData("/v1/external-logging", paginationQuery(input), context, "list log services");
    const page = readFivetranPage(data, "log services");
    return { logServices: page.items, nextCursor: page.nextCursor };
  },
  async get_log_service(input, context) {
    const logId = requiredString(input.logId, "logId");
    const logService = await fivetranGetData(
      `/v1/external-logging/${encodeURIComponent(logId)}`,
      {},
      context,
      "get log service",
    );
    return { logService };
  },
  async list_hybrid_deployment_agents(input, context) {
    const data = await fivetranGetData(
      "/v1/hybrid-deployment-agents",
      {
        ...paginationQuery(input),
        groupId: optionalString(input.groupId),
      },
      context,
      "list hybrid deployment agents",
    );
    const page = readFivetranPage(data, "hybrid deployment agents");
    return { agents: page.items, nextCursor: page.nextCursor };
  },
  async get_hybrid_deployment_agent(input, context) {
    const agentId = requiredString(input.agentId, "agentId");
    const agent = await fivetranGetData(
      `/v1/hybrid-deployment-agents/${encodeURIComponent(agentId)}`,
      {},
      context,
      "get hybrid deployment agent",
    );
    return { agent };
  },
};

/** Validate a Fivetran key-secret pair and return its account identity. */
export async function validateFivetranCredential(
  credentials: FivetranCredentials,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const data = await fivetranGetData(
    "/v1/account/info",
    {},
    { ...credentials, fetcher, signal },
    "validate credentials",
  );
  const accountId = requiredString(
    data.account_id,
    "Fivetran account_id",
    (message) => new ProviderRequestError(502, message),
  );

  return {
    profile: {
      accountId,
      displayName: optionalString(data.account_name) ?? accountId,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: fivetranApiBaseUrl,
      validationEndpoint: "/v1/account/info",
    },
  };
}

function paginationQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  const limit = optionalInteger(input.limit);
  return {
    cursor: optionalString(input.cursor),
    limit: limit === undefined ? undefined : String(limit),
  };
}

async function fivetranGetData(
  path: string,
  query: Record<string, string | undefined>,
  context: FivetranContext,
  operation: string,
): Promise<Record<string, unknown>> {
  const payload = await requestFivetran(path, query, context, operation);
  const envelope = optionalRecord(payload);
  const data = optionalRecord(envelope?.data);
  if (!data) {
    throw new ProviderRequestError(502, `Fivetran ${operation} returned an invalid data envelope.`, payload);
  }
  return data;
}

async function requestFivetran(
  path: string,
  query: Record<string, string | undefined>,
  context: FivetranContext,
  operation: string,
): Promise<unknown> {
  const url = new URL(path, fivetranApiBaseUrl);
  setSearchParams(url, query);

  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${context.apiKey}:${context.apiSecret}`).toString("base64")}`,
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Fivetran ${operation} request failed: ${error.message}`
        : `Fivetran ${operation} request failed.`,
    );
  }

  const payload = await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: `Fivetran ${operation} returned invalid JSON.`,
    invalidJsonFallback: (text) => text,
  });
  if (!response.ok) {
    throw new ProviderRequestError(
      response.status,
      extractFivetranErrorMessage(payload) ?? `Fivetran ${operation} failed with HTTP ${response.status}.`,
      payload,
    );
  }
  return payload;
}

function readFivetranPage(data: Record<string, unknown>, resourceName: string): FivetranPage {
  if (!Array.isArray(data.items)) {
    throw new ProviderRequestError(502, `Fivetran ${resourceName} response is missing the items array.`, data);
  }
  return {
    items: data.items,
    nextCursor: optionalString(data.next_cursor) ?? null,
  };
}

function extractFivetranErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }
  const error = optionalRecord(payload);
  return optionalString(error?.message) ?? optionalString(error?.code);
}
