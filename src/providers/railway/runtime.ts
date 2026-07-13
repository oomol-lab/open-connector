import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { RailwayActionName } from "./actions.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { objectPayload, requestJson } from "../http-json-runtime.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const railwayApiBaseUrl = "https://backboard.railway.com";
const railwayGraphqlPath = "/graphql/v2";

export interface RailwayActionContext extends ApiKeyProviderContext {
  workspaceId?: string;
}

interface RailwayGraphqlError {
  message?: string;
  path?: Array<string | number>;
}

interface RailwayConnection<T> {
  edges?: Array<{ node?: T | null }>;
}

interface RailwayProject {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  services?: RailwayConnection<Record<string, unknown>>;
  environments?: RailwayConnection<Record<string, unknown>>;
}

interface RailwayDeployment {
  id: string;
  status: string;
  createdAt?: string;
  url?: string | null;
  staticUrl?: string | null;
  canRedeploy?: boolean;
  canRollback?: boolean;
  meta?: Record<string, unknown>;
}

type RailwayActionHandler = ProviderRuntimeHandler<RailwayActionContext>;

export function createRailwayContext(
  values: Record<string, string>,
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): RailwayActionContext {
  return {
    apiKey,
    workspaceId: optionalString(values.workspaceId),
    fetcher,
    signal,
  };
}

export const railwayActionHandlers: Record<RailwayActionName, RailwayActionHandler> = {
  async list_projects(_input, context) {
    const data = context.workspaceId
      ? await railwayGraphql<{ projects?: RailwayConnection<RailwayProject> }>(
          context,
          `query workspaceProjects($workspaceId: String!) {
            projects(workspaceId: $workspaceId) {
              edges { node { id name description createdAt updatedAt } }
            }
          }`,
          { workspaceId: context.workspaceId },
        )
      : await railwayGraphql<{ projects?: RailwayConnection<RailwayProject> }>(
          context,
          `query projects {
            projects {
              edges { node { id name description createdAt updatedAt } }
            }
          }`,
        );

    return { projects: connectionNodes(data.projects) };
  },

  async get_project(input, context) {
    const data = await railwayGraphql<{ project?: RailwayProject }>(
      context,
      `query project($id: String!) {
        project(id: $id) {
          id
          name
          description
          createdAt
          services { edges { node { id name icon } } }
          environments { edges { node { id name } } }
        }
      }`,
      { id: inputString(input, "projectId") },
    );
    const project = requireGraphqlValue(data.project, "Railway project was not returned");
    return {
      project: {
        id: project.id,
        name: project.name,
        description: project.description ?? null,
        createdAt: project.createdAt,
        services: connectionNodes(project.services),
        environments: connectionNodes(project.environments),
      },
    };
  },

  async get_service_instance(input, context) {
    const data = await railwayGraphql<{ serviceInstance?: Record<string, unknown> }>(
      context,
      `query serviceInstance($serviceId: String!, $environmentId: String!) {
        serviceInstance(serviceId: $serviceId, environmentId: $environmentId) {
          id
          serviceName
          startCommand
          buildCommand
          rootDirectory
          healthcheckPath
          region
          numReplicas
          restartPolicyType
          restartPolicyMaxRetries
          latestDeployment { id status createdAt url staticUrl }
        }
      }`,
      {
        serviceId: inputString(input, "serviceId"),
        environmentId: inputString(input, "environmentId"),
      },
    );
    return {
      serviceInstance: requireGraphqlValue(data.serviceInstance, "Railway service instance was not returned"),
    };
  },

  async list_deployments(input, context) {
    const data = await railwayGraphql<{ deployments?: RailwayConnection<RailwayDeployment> }>(
      context,
      `query deployments($input: DeploymentListInput!, $first: Int) {
        deployments(input: $input, first: $first) {
          edges { node { id status createdAt url staticUrl } }
        }
      }`,
      {
        input: {
          projectId: inputString(input, "projectId"),
          serviceId: inputString(input, "serviceId"),
          environmentId: inputString(input, "environmentId"),
        },
        first: optionalInteger(input.limit) ?? 20,
      },
    );
    return { deployments: connectionNodes(data.deployments) };
  },

  async get_deployment(input, context) {
    const data = await railwayGraphql<{ deployment?: RailwayDeployment }>(
      context,
      `query deployment($id: String!) {
        deployment(id: $id) {
          id status createdAt url staticUrl meta canRedeploy canRollback
        }
      }`,
      { id: inputString(input, "deploymentId") },
    );
    return { deployment: requireGraphqlValue(data.deployment, "Railway deployment was not returned") };
  },

  async get_deployment_logs(input, context) {
    const data = await railwayGraphql<{ deploymentLogs?: Array<Record<string, unknown>> }>(
      context,
      `query deploymentLogs(
        $deploymentId: String!
        $limit: Int
        $filter: String
        $startDate: DateTime
        $endDate: DateTime
      ) {
        deploymentLogs(
          deploymentId: $deploymentId
          limit: $limit
          filter: $filter
          startDate: $startDate
          endDate: $endDate
        ) {
          timestamp message severity
        }
      }`,
      compactObject({
        deploymentId: inputString(input, "deploymentId"),
        limit: optionalInteger(input.limit) ?? 500,
        filter: optionalString(input.filter),
        startDate: optionalString(input.startDate),
        endDate: optionalString(input.endDate),
      }),
    );
    return { logs: data.deploymentLogs ?? [] };
  },

  async deploy_service(input, context) {
    const data = await railwayGraphql<{ serviceInstanceDeployV2?: string }>(
      context,
      `mutation serviceInstanceDeployV2($serviceId: String!, $environmentId: String!, $commitSha: String) {
        serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha)
      }`,
      compactObject({
        serviceId: inputString(input, "serviceId"),
        environmentId: inputString(input, "environmentId"),
        commitSha: optionalString(input.commitSha),
      }),
    );
    return {
      deploymentId: requireGraphqlValue(data.serviceInstanceDeployV2, "Railway deployment ID was not returned"),
    };
  },

  async upsert_variable(input, context) {
    const data = await railwayGraphql<{ variableUpsert?: boolean }>(
      context,
      `mutation variableUpsert($input: VariableUpsertInput!) {
        variableUpsert(input: $input)
      }`,
      {
        input: compactObject({
          projectId: inputString(input, "projectId"),
          environmentId: inputString(input, "environmentId"),
          serviceId: optionalString(input.serviceId),
          name: inputString(input, "name"),
          value: inputRawString(input, "value"),
          skipDeploys: optionalBoolean(input.skipDeploys),
        }),
      },
    );
    return {
      updated: requireGraphqlValue(data.variableUpsert, "Railway variable update result was not returned"),
    };
  },

  async rollback_deployment(input, context) {
    const data = await railwayGraphql<{ deploymentRollback?: RailwayDeployment }>(
      context,
      `mutation deploymentRollback($id: String!) {
        deploymentRollback(id: $id) { id status createdAt url staticUrl }
      }`,
      { id: inputString(input, "deploymentId") },
    );
    return {
      deployment: requireGraphqlValue(data.deploymentRollback, "Railway rollback deployment was not returned"),
    };
  },
};

export async function validateRailwayCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createRailwayContext(values, apiKey, fetcher, signal);
  if (context.workspaceId) {
    const data = await railwayGraphql<{ workspace?: { id?: string; name?: string } }>(
      context,
      `query workspace($workspaceId: String!) {
        workspace(workspaceId: $workspaceId) { id name }
      }`,
      { workspaceId: context.workspaceId },
      "validate",
    );
    const workspace = requireGraphqlValue(data.workspace, "Railway workspace was not returned");
    return {
      profile: {
        accountId: workspace.id ?? context.workspaceId,
        displayName: workspace.name ?? context.workspaceId,
      },
      grantedScopes: [],
      metadata: { tokenType: "workspace", workspaceId: context.workspaceId },
    };
  }

  const data = await railwayGraphql<{ me?: { id?: string; name?: string; email?: string } }>(
    context,
    `query currentUser { me { id name email } }`,
    undefined,
    "validate",
  );
  const user = requireGraphqlValue(data.me, "Railway account was not returned");
  const accountId = user.id ?? user.email;
  if (!accountId) {
    throw new ProviderRequestError(502, "Railway account identity was not returned");
  }
  return {
    profile: {
      accountId,
      displayName: user.name ?? user.email ?? accountId,
    },
    grantedScopes: [],
    metadata: { tokenType: "account" },
  };
}

async function railwayGraphql<T extends Record<string, unknown>>(
  context: RailwayActionContext,
  query: string,
  variables?: Record<string, unknown>,
  phase: "validate" | "execute" = "execute",
): Promise<T> {
  const payload = await requestJson({
    providerName: "Railway",
    baseUrl: railwayApiBaseUrl,
    path: railwayGraphqlPath,
    fetcher: context.fetcher,
    signal: context.signal,
    headers: { authorization: `Bearer ${context.apiKey}` },
    body: variables ? { query, variables } : { query },
    phase,
  });
  const envelope = objectPayload(payload, "Railway GraphQL API");
  const errors = (Array.isArray(envelope.errors) ? objectArray(envelope.errors, "errors") : [])
    .map((error) => toRailwayGraphqlError(error))
    .filter((error): error is RailwayGraphqlError => error !== undefined);
  if (errors.length > 0) {
    const message =
      errors
        .map((error) => error.message)
        .filter(Boolean)
        .join("; ") || "Railway GraphQL request failed";
    throw new ProviderRequestError(400, message, errors);
  }
  const data = optionalRecord(envelope.data);
  if (!data) {
    throw new ProviderRequestError(502, "Railway GraphQL response did not include data", payload);
  }
  return data as T;
}

function toRailwayGraphqlError(value: Record<string, unknown>): RailwayGraphqlError | undefined {
  const message = optionalString(value.message);
  if (!message) {
    return undefined;
  }
  const path = Array.isArray(value.path)
    ? value.path.filter((part): part is string | number => typeof part === "string" || typeof part === "number")
    : undefined;
  return { message, path };
}

function connectionNodes<T>(connection: RailwayConnection<T> | undefined): T[] {
  return (connection?.edges ?? []).flatMap((edge) => (edge.node ? [edge.node] : []));
}

function inputString(input: Record<string, unknown>, key: string): string {
  const value = requiredString(input[key], key, (message) => new ProviderRequestError(400, message));
  return value.trim();
}

function inputRawString(input: Record<string, unknown>, key: string): string {
  const value = optionalRawString(input[key]);
  if (value === undefined) {
    throw new ProviderRequestError(400, `${key} is required.`);
  }
  return value;
}

function requireGraphqlValue<T>(value: T | null | undefined, message: string): T {
  if (value === undefined || value === null) {
    throw new ProviderRequestError(502, message);
  }
  return value;
}
