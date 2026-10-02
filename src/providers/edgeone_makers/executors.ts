import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { compactObject, looseArray, optionalRecord, optionalString, recordOrEmpty } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
const edgeOneMakersApiBaseUrls = {
  china: "https://pages-api.cloud.tencent.com/v1",
  global: "https://pages-api.edgeone.ai/v1",
} as const;
type EdgeOneMakersRegion = keyof typeof edgeOneMakersApiBaseUrls;
type RequestPhase = "validate" | "execute";
interface ActionContext {
  apiKey: string;
  region: EdgeOneMakersRegion;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
type ActionHandler = (input: Record<string, unknown>, context: ActionContext) => Promise<unknown>;
const edgeOneMakersActionHandlers: Record<string, ActionHandler> = {
  async list_projects(input, context) {
    const page = readOptionalInteger(input.page, "page") ?? 0;
    const pageSize = readOptionalInteger(input.pageSize, "pageSize") ?? 20;
    const filters = [
      ...(Array.isArray(input.projectIds) ? [{ Name: "ProjectId", Values: input.projectIds.map(String) }] : []),
      ...[
        ["Name", optionalString(input.name)],
        ["Status", optionalString(input.status)],
        ["Provider", optionalString(input.provider)],
      ]
        .filter((entry): entry is [string, string] => entry[1] !== undefined)
        .map(([Name, value]) => ({ Name, Values: [value] })),
    ];
    const order = optionalRecord(input.order);
    const payload = await makersRequest({
      action: "DescribePagesProjects",
      body: compactObject({
        Offset: page,
        Limit: pageSize,
        Filters: filters.length > 0 ? filters : undefined,
        OrderBy: order?.field === "createdOn" ? "CreatedOn" : order?.field === "modifiedOn" ? "ModifiedOn" : undefined,
        OrderType: order?.direction === "asc" ? "ASC" : order?.direction === "desc" ? "DESC" : undefined,
      }),
      ...context,
    });
    const projects = looseArray(payload.Projects).map(normalizeProject);
    const total = readResponseCount(payload.TotalCount, projects.length);
    return {
      projects,
      page,
      pageSize,
      total,
      hasNext: (page + 1) * pageSize < total,
    };
  },
  async get_project(input, context) {
    return { project: normalizeProject(await fetchProjectRecord(input, context)) };
  },
  async update_project(input, context) {
    const projectId = requiredInputString(input.projectId, "projectId");
    await makersRequest({
      action: "ModifyPagesProject",
      body: compactObject({
        ProjectId: projectId,
        Name: optionalString(input.name),
        RootDir: optionalString(input.rootDir),
        OutputDir: optionalString(input.outputDir),
        BuildCmd: optionalString(input.buildCmd),
        InstallCmd: optionalString(input.installCmd),
        Framework: optionalString(input.framework),
        NodejsVersion: optionalString(input.nodejsVersion),
      }),
      ...context,
    });
    return { projectId };
  },
  async delete_project(input, context) {
    const projectId = requiredInputString(input.projectId, "projectId");
    await makersRequest({
      action: "DeletePagesProject",
      body: { ProjectId: projectId },
      ...context,
    });
    return { projectId };
  },
  async trigger_deployment_webhook(input, context) {
    const webhookUrl = requiredInputString(input.webhookUrl, "webhookUrl");
    const guardedFetch = context.fetcher;
    return runProviderRequest(
      { label: "EdgeOne Makers deployment webhook", signal: context.signal },
      async (signal) => {
        const response = await guardedFetch(webhookUrl, { method: "POST", signal });
        if (!response.ok) {
          throw new ProviderRequestError(
            response.status,
            `EdgeOne Makers deployment webhook returned HTTP ${response.status}`,
            undefined,
            "provider_error",
          );
        }
        await response.body?.cancel().catch(() => undefined);
        return { triggered: true as const, status: response.status };
      },
    );
  },
  async list_deployments(input, context) {
    const projectId = requiredInputString(input.projectId, "projectId");
    const page = readOptionalInteger(input.page, "page") ?? 0;
    const pageSize = readOptionalInteger(input.pageSize, "pageSize") ?? 20;
    const filters = [
      ...(Array.isArray(input.status) ? [{ Name: "Status", Values: input.status.map(String) }] : []),
      ...(typeof input.startTime === "string" && typeof input.endTime === "string"
        ? [{ Name: "StartTime", Values: [input.startTime, input.endTime] }]
        : []),
      ...(Array.isArray(input.repoBranches) ? [{ Name: "RepoBranch", Values: input.repoBranches.map(String) }] : []),
    ];
    const order = optionalRecord(input.order);
    const payload = await makersRequest({
      action: "DescribePagesDeployments",
      body: compactObject({
        ProjectId: projectId,
        Offset: page,
        Limit: pageSize,
        Filters: filters.length > 0 ? filters : undefined,
        OrderBy: order?.field === "createdOn" ? "CreatedOn" : order?.field === "modifiedOn" ? "ModifiedOn" : undefined,
        OrderType: order?.direction === "asc" ? "Asc" : order?.direction === "desc" ? "Desc" : undefined,
      }),
      ...context,
    });
    const deployments = looseArray(payload.Deployments).map(normalizeDeployment);
    const total = readResponseCount(payload.TotalCount, deployments.length);
    return {
      deployments,
      page,
      pageSize,
      total,
      hasNext: (page + 1) * pageSize < total,
    };
  },
  async get_deployment(input, context) {
    const projectId = requiredInputString(input.projectId, "projectId");
    const deploymentId = requiredInputString(input.deploymentId, "deploymentId");
    const payload = await makersRequest({
      action: "DescribePagesDeployments",
      body: { ProjectId: projectId, DeploymentIds: [deploymentId], Offset: 0, Limit: 1 },
      ...context,
    });
    const record = looseArray(payload.Deployments)[0] ?? payload.Deployment;
    if (!record) {
      throw new ProviderRequestError(
        404,
        `EdgeOne Makers deployment ${deploymentId} was not found`,
        undefined,
        "provider_error",
      );
    }
    const deployment = normalizeDeployment(record);
    if (deployment.status === "Success") {
      deployment.previewUrl = await resolveAccessUrl(deployment, context);
    }
    return { deployment };
  },
  async get_deployment_log(input, context) {
    const payload = await makersRequest({
      action: "DescribePagesDeploymentLog",
      body: {
        ProjectId: requiredInputString(input.projectId, "projectId"),
        DeploymentId: requiredInputString(input.deploymentId, "deploymentId"),
      },
      ...context,
    });
    return { logUrl: requirePayloadString(payload.LogUrl, "LogUrl") };
  },
  async list_environment_variables(input, context) {
    const payload = await makersRequest({
      action: "DescribePagesProjectEnvs",
      body: { ProjectId: requiredInputString(input.projectId, "projectId") },
      ...context,
    });
    return {
      envVars: looseArray(payload.EnvVars).map((value) => {
        const item = recordOrEmpty(value);
        return compactObject({
          key: String(item.Key ?? ""),
          value: String(item.Value ?? ""),
          comment: optionalString(item.Comment),
        });
      }),
    };
  },
  async set_environment_variables(input, context) {
    const projectId = requiredInputString(input.projectId, "projectId");
    const envVars = readEnvVars(input.envVars);
    const existing = await makersRequest({
      action: "DescribePagesProjectEnvs",
      body: { ProjectId: projectId },
      ...context,
    });
    const idsByKey = new Map(
      looseArray(existing.EnvVars).map((value) => {
        const item = recordOrEmpty(value);
        return [String(item.Key ?? ""), item.Id] as const;
      }),
    );
    await makersRequest({
      action: "ModifyPagesProjectEnvs",
      body: {
        ProjectId: projectId,
        EnvVars: envVars.map((envVar) => toBackendEnvVar(envVar, idsByKey.get(envVar.key))),
      },
      ...context,
    });
    return { projectId };
  },
  async delete_environment_variables(input, context) {
    const projectId = requiredInputString(input.projectId, "projectId");
    await makersRequest({
      action: "DeletePagesProjectEnvs",
      body: { ProjectId: projectId, EnvVars: readStringArray(input.keys, "keys") },
      ...context,
    });
    return { projectId };
  },
};
async function fetchProjectRecord(input: Record<string, unknown>, context: ActionContext) {
  const projectId = requiredInputString(input.projectId, "projectId");
  const payload = await makersRequest({
    action: "DescribePagesProjects",
    body: {
      Filters: [{ Name: "ProjectId", Values: [projectId] }],
      Offset: 0,
      Limit: 1,
    },
    ...context,
  });
  const record = looseArray(payload.Projects).find((value) => optionalRecord(value)?.ProjectId === projectId);
  if (!record) {
    throw new ProviderRequestError(
      404,
      `EdgeOne Makers project ${projectId} was not found`,
      undefined,
      "provider_error",
    );
  }
  return requiredResponseRecord(record, "EdgeOne Makers project");
}
async function makersRequest(input: {
  action: string;
  body: Record<string, unknown>;
  apiKey: string;
  region: EdgeOneMakersRegion;
  fetcher: typeof fetch;
  phase?: RequestPhase;
  signal?: AbortSignal;
}) {
  return runProviderRequest({ label: "EdgeOne Makers", signal: input.signal }, async (signal) => {
    const response = await input.fetcher(edgeOneMakersApiBaseUrls[input.region], {
      method: "POST",
      redirect: "manual",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({ Action: input.action, ...input.body }),
      signal,
    });
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    if (raw) {
      try {
        body = recordOrEmpty(JSON.parse(raw));
      } catch {
        throw new ProviderRequestError(502, "EdgeOne Makers returned malformed JSON", undefined, "provider_error");
      }
    }
    const data = optionalRecord(body.Data);
    const payload = optionalRecord(data?.Response) ?? {};
    const nestedError = optionalRecord(payload.Error);
    const topCode = body.Code;
    const successCode = topCode === 0 || topCode === "0";
    if (!response.ok || !successCode || nestedError) {
      throw mapResponseError(nestedError ?? body, response.status, input.phase ?? "execute");
    }
    return payload;
  });
}
function mapResponseError(error: Record<string, unknown>, status: number, phase: RequestPhase) {
  const code = error.Code == null ? null : String(error.Code);
  const message = optionalString(error.Message) ?? `EdgeOne Makers request failed with HTTP ${status}`;
  if (code === "105") {
    return phase === "validate"
      ? new ProviderRequestError(400, message, undefined, "invalid_input")
      : new ProviderRequestError(401, message);
  }
  if (code === "110" || status === 429) {
    return new ProviderRequestError(429, message, undefined, "rate_limited");
  }
  if (code?.includes("Invalid")) {
    return new ProviderRequestError(400, message, undefined, "invalid_input");
  }
  return new ProviderRequestError(status >= 400 ? status : 502, message, undefined, "provider_error");
}
async function resolveAccessUrl(deployment: ReturnType<typeof normalizeDeployment>, context: ActionContext) {
  const project = await fetchProjectRecord({ projectId: deployment.projectId }, context);
  if (deployment.env === "Production") {
    const customDomains = looseArray(project.CustomDomains);
    const passedDomain = customDomains.find((value) => optionalRecord(value)?.Status === "Pass");
    const domain = optionalString(optionalRecord(passedDomain)?.Domain);
    if (domain) return normalizeHttpsUrl(domain);
  }
  const rawHost = deployment.env === "Production" ? optionalString(project.PresetDomain) : deployment.previewUrl;
  if (!rawHost) {
    throw new ProviderRequestError(
      502,
      "EdgeOne Makers deployment succeeded without an access URL",
      undefined,
      "provider_error",
    );
  }
  const url = normalizeHttpsUrl(rawHost);
  if (project.IsTld === 1) return url;
  const host = new URL(url).hostname;
  const tokenPayload = await makersRequest({
    action: "DescribePagesEncipherToken",
    body: { Text: host },
    ...context,
  });
  const token = requirePayloadString(tokenPayload.Token, "Token");
  const timestamp = tokenPayload.Timestamp;
  if (timestamp == null || timestamp === "") {
    throw new ProviderRequestError(
      502,
      "EdgeOne Makers access URL token response is incomplete",
      undefined,
      "provider_error",
    );
  }
  const signed = new URL(url);
  signed.searchParams.set("eo_token", token);
  signed.searchParams.set("eo_time", String(timestamp));
  return signed.toString();
}
function normalizeProject(value: unknown) {
  const project = recordOrEmpty(value);
  return compactObject({
    projectId: String(project.ProjectId ?? ""),
    name: String(project.Name ?? ""),
    status: String(project.Status ?? ""),
    area:
      project.Area === "mainland" || project.Area === "overseas" || project.Area === "global"
        ? project.Area
        : undefined,
    presetDomain: optionalString(project.PresetDomain),
    createdOn: String(project.CreatedOn ?? ""),
    modifiedOn: String(project.ModifiedOn ?? ""),
  });
}
function normalizeDeployment(value: unknown) {
  const deployment = recordOrEmpty(value);
  return compactObject({
    deploymentId: String(deployment.DeploymentId ?? ""),
    projectId: String(deployment.ProjectId ?? ""),
    env: deployment.Env === "Preview" ? ("Preview" as const) : ("Production" as const),
    status: optionalString(deployment.Status),
    previewUrl: optionalString(deployment.PreviewUrl),
    code: optionalString(deployment.Code),
    createdOn: optionalString(deployment.CreatedOn),
    modifiedOn: optionalString(deployment.ModifiedOn),
  });
}
function readRegion(values: Record<string, unknown> | undefined): EdgeOneMakersRegion {
  const region = values?.region;
  if (region === "china" || region === "global") return region;
  throw new ProviderRequestError(400, "region must be china or global", undefined, "invalid_input");
}
function readOptionalInteger(value: unknown, fieldName: string) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-negative integer`, undefined, "invalid_input");
  }
  return Number(value);
}
function readResponseCount(value: unknown, fallback: number) {
  const count = Number(value ?? fallback);
  if (!Number.isInteger(count) || count < 0) {
    throw new ProviderRequestError(502, "EdgeOne Makers returned an invalid count", undefined, "provider_error");
  }
  return count;
}
function readStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) {
    throw new ProviderRequestError(400, `${fieldName} must contain non-empty strings`, undefined, "invalid_input");
  }
  if (new Set(value).size !== value.length) {
    throw new ProviderRequestError(400, `${fieldName} must not contain duplicates`, undefined, "invalid_input");
  }
  return value;
}
function readEnvVars(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "envVars must be a non-empty array", undefined, "invalid_input");
  }
  const envVars = value.map((entry) => {
    const record = optionalRecord(entry);
    if (!record) throw new ProviderRequestError(400, "envVars must contain objects", undefined, "invalid_input");
    return {
      key: requiredInputString(record.key, "envVars key"),
      value: typeof record.value === "string" ? record.value : String(record.value ?? ""),
      comment: optionalString(record.comment),
    };
  });
  if (new Set(envVars.map(({ key }) => key)).size !== envVars.length) {
    throw new ProviderRequestError(400, "envVars must not contain duplicate keys", undefined, "invalid_input");
  }
  return envVars;
}
function toBackendEnvVar(
  envVar: {
    key: string;
    value: string;
    comment?: string;
  },
  id?: unknown,
) {
  return compactObject({
    Key: envVar.key,
    Value: envVar.value,
    Comment: envVar.comment,
    Id: id,
  });
}
function requirePayloadString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `EdgeOne Makers response is missing ${fieldName}`, undefined, "provider_error");
  }
  return value;
}
function normalizeHttpsUrl(value: string) {
  const candidate = value.includes("://") ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return `https://${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    throw new ProviderRequestError(502, "EdgeOne Makers returned an invalid URL", undefined, "provider_error");
  }
}

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "edgeone_makers",
  handlers: edgeOneMakersActionHandlers,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "edgeone_makers");
    return {
      apiKey: credential.apiKey,
      region: readRegion({ ...credential.metadata, ...credential.values }),
      fetcher,
      signal: context.signal,
    };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const region = readRegion(input);
    await makersRequest({
      action: "DescribePagesProjects",
      body: { Offset: 0, Limit: 1 },
      apiKey: input.apiKey,
      region,
      fetcher,
      signal,
      phase: "validate",
    });
    return {
      profile: { displayName: region === "china" ? "EdgeOne Makers China" : "EdgeOne Makers Global" },
      grantedScopes: [],
      metadata: { region, apiBaseUrl: edgeOneMakersApiBaseUrls[region] },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "edgeone_makers",
  async baseUrl(context) {
    const c = await requireApiKeyCredential(context, "edgeone_makers");
    return edgeOneMakersApiBaseUrls[readRegion({ ...c.metadata, ...c.values })];
  },
  allowedOrigins: Object.values(edgeOneMakersApiBaseUrls),
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
