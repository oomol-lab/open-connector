import type { QueryValue } from "../../core/request.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  compactObject,
  looseArray,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { jsonObject, queryParams } from "../../core/request.ts";
import {
  providerInputError,
  runProviderRequest,
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
} from "../provider-runtime.ts";

export const vercelApiBaseUrl = "https://api.vercel.com";

interface VercelUser {
  id: string;
  username?: string;
  email?: string;
  name?: string;
}

interface VercelTeam {
  id: string;
  slug?: string;
  name?: string;
  createdAt?: number;
  updatedAt?: number;
}

type VercelActionHandler = (input: VercelActionInput, context: VercelActionContext) => Promise<unknown>;

export interface VercelTeamScope {
  teamId?: string;
  slug?: string;
}

export interface VercelActionContext extends VercelTeamScope {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

/**
 * Stored credential values passed to the Vercel credential validator.
 */
export interface VercelCredentialValidationInput {
  apiKey: string;
  values: Record<string, string>;
}

/**
 * Transport fields shared by the team-resolution helpers.
 */
interface VercelTeamLookupOptions {
  apiKey: string;
  fetcher: typeof fetch;
  mode: "validate" | "execute";
}

type VercelActionInput = Record<string, unknown>;

export const vercelActionHandlers: ProviderActionHandlers<"vercel", VercelActionHandler> = {
  create_git_deployment(input, context) {
    return vercelCreateGitDeployment(input, context);
  },
  redeploy_deployment(input, context) {
    return vercelRedeployDeployment(input, context);
  },
  upload_deployment_file_from_url(input, context) {
    return vercelUploadDeploymentFileFromUrl(input, context);
  },
  create_file_deployment(input, context) {
    return vercelCreateFileDeployment(input, context);
  },
  list_deployment_files(input, context) {
    return vercelListDeploymentFiles(input, context);
  },
  get_deployment_file_contents(input, context) {
    return vercelGetDeploymentFileContents(input, context);
  },
  list_deployment_aliases(input, context) {
    return vercelListDeploymentAliases(input, context);
  },
  assign_deployment_alias(input, context) {
    return vercelAssignDeploymentAlias(input, context);
  },
  update_deployment_integration_action(input, context) {
    return vercelUpdateDeploymentIntegrationAction(input, context);
  },
  cancel_deployment(input, context) {
    return vercelCancelDeployment(input, context);
  },
  delete_deployment(input, context) {
    return vercelDeleteDeployment(input, context);
  },
  promote_deployment(input, context) {
    return vercelPromoteDeployment(input, context);
  },
  rollback_deployment(input, context) {
    return vercelRollbackDeployment(input, context);
  },
  get_latest_deployment_promotion_aliases(input, context) {
    return vercelGetLatestDeploymentPromotionAliases(input, context);
  },
  update_deployment_rollback_description(input, context) {
    return vercelUpdateDeploymentRollbackDescription(input, context);
  },
  get_auth_user(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetAuthUser(input, context);
  },
  list_teams(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelListTeams(input, context);
  },
  get_team(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetTeam(input, context);
  },
  list_projects(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelListProjects(input, context);
  },
  get_project(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetProject(input, context);
  },
  create_project(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelCreateProject(input, context);
  },
  update_project(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelUpdateProject(input, context);
  },
  list_deployments(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelListDeployments(input, context);
  },
  get_deployment(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetDeployment(input, context);
  },
  get_deployment_events(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetDeploymentEvents(input, context);
  },
  get_runtime_logs(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetRuntimeLogs(input, context);
  },
  list_project_envs(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelListProjectEnvs(input, context);
  },
  create_project_env(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelCreateProjectEnv(input, context);
  },
  update_project_env(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelUpdateProjectEnv(input, context);
  },
  delete_project_env(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelDeleteProjectEnv(input, context);
  },
  list_project_domains(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelListProjectDomains(input, context);
  },
  get_project_domain(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetProjectDomain(input, context);
  },
  add_project_domain(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelAddProjectDomain(input, context);
  },
  verify_project_domain(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelVerifyProjectDomain(input, context);
  },
  get_domain_config(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetDomainConfig(input, context);
  },
  list_webhooks(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelListWebhooks(input, context);
  },
  get_webhook(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelGetWebhook(input, context);
  },
  create_webhook(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelCreateWebhook(input, context);
  },
  delete_webhook(input: VercelActionInput, context: VercelActionContext): Promise<unknown> {
    return vercelDeleteWebhook(input, context);
  },
};

export async function validateVercelCredential(
  input: VercelCredentialValidationInput,
  fetcher: typeof fetch,
): Promise<{
  profile: {
    accountId: string;
    displayName: string;
  };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const teamScope = readVercelTeamScope(input.values);
  const user = await requestVercelJson<VercelUserResponse>({
    path: "/v2/user",
    apiKey: input.apiKey,
    fetcher,
    mode: "validate",
  }).then((payload) => normalizeVercelUser(payload));

  const team =
    teamScope.teamId || teamScope.slug ? await validateVercelTeam(input.apiKey, fetcher, teamScope) : undefined;

  return {
    profile: {
      accountId: team?.id ?? user.id,
      displayName: team ? (team.name ?? team.slug ?? userLabel(user)) : userLabel(user),
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: team ? `/v2/teams/${team.id}` : "/v2/user",
      userId: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      teamId: team?.id,
      teamSlug: team?.slug,
      teamName: team?.name,
    }),
  };
}

/**
 * Read optional Vercel `teamId` or `slug` from credential extra fields or action input.
 *
 * Vercel accepts either query parameter, so this connector requires exactly one to keep a
 * contradictory pair from silently resolving to whichever team the API happens to prefer.
 */
export function readVercelTeamScope(source: Record<string, unknown> | undefined): VercelTeamScope {
  const teamId = optionalString(source?.teamId);
  const slug = optionalString(source?.slug);
  if (teamId && slug) {
    throw new ProviderRequestError(400, "teamId and slug cannot both be provided");
  }
  return compactObject({ teamId, slug });
}

const vercelTeamListPageSize = 100;
const vercelTeamListMaxPages = 20;

async function validateVercelTeam(
  apiKey: string,
  fetcher: typeof fetch,
  teamScope: VercelTeamScope,
): Promise<VercelTeam> {
  const teamId = await resolveVercelTeamId({
    teamScope,
    apiKey,
    fetcher,
    mode: "validate",
  });
  return requestVercelTeamById({
    teamId,
    apiKey,
    fetcher,
    mode: "validate",
  });
}

interface VercelTeamIdResolutionOptions extends VercelTeamLookupOptions {
  teamScope: VercelTeamScope;
}

async function resolveVercelTeamId(options: VercelTeamIdResolutionOptions): Promise<string> {
  if (options.teamScope.teamId) {
    return options.teamScope.teamId;
  }
  if (!options.teamScope.slug) {
    throw new ProviderRequestError(400, "teamId or slug is required");
  }
  return findTeamIdBySlug({
    slug: options.teamScope.slug,
    apiKey: options.apiKey,
    fetcher: options.fetcher,
    mode: options.mode,
  });
}

interface VercelTeamSlugLookupOptions extends VercelTeamLookupOptions {
  slug: string;
}

async function findTeamIdBySlug(options: VercelTeamSlugLookupOptions): Promise<string> {
  let until: number | undefined;

  for (let page = 0; page < vercelTeamListMaxPages; page += 1) {
    const payload = await requestVercelJson<{
      teams?: unknown[];
      pagination?: { next?: unknown };
    }>({
      path: "/v2/teams",
      apiKey: options.apiKey,
      fetcher: options.fetcher,
      mode: options.mode,
      query: queryParams({
        limit: vercelTeamListPageSize,
        until,
      }),
    });

    if (!Array.isArray(payload.teams)) {
      throw new ProviderRequestError(502, "vercel team list response is missing teams");
    }

    for (const item of payload.teams) {
      const team = optionalRecord(item);
      if (optionalString(team?.slug) !== options.slug) {
        continue;
      }
      const teamId = optionalString(team?.id);
      if (!teamId) {
        throw new ProviderRequestError(502, "vercel team response is missing id");
      }
      return teamId;
    }

    const next = optionalNumber(optionalRecord(payload.pagination)?.next);
    if (next == null || payload.teams.length === 0) {
      throw new ProviderRequestError(400, "vercel team slug was not found");
    }
    until = next;
  }

  // A non-null `pagination.next` after the last page means the scan stopped short of the
  // whole team list, so the slug may well exist; do not report it as a bad slug.
  throw new ProviderRequestError(
    400,
    `vercel team list was not fully scanned within ${vercelTeamListMaxPages} pages; set teamId instead of slug`,
  );
}

interface VercelTeamByIdOptions extends VercelTeamLookupOptions {
  teamId: string;
}

async function requestVercelTeamById(options: VercelTeamByIdOptions): Promise<VercelTeam> {
  const payload = await requestVercelJson<VercelTeamResponse>({
    path: `/v2/teams/${encodeURIComponent(options.teamId)}`,
    apiKey: options.apiKey,
    fetcher: options.fetcher,
    mode: options.mode,
    notFoundAsInvalidInput: true,
  });
  return normalizeVercelTeam(payload);
}

function resolveTeamScope(input: VercelActionInput, context: VercelActionContext): VercelTeamScope {
  const fromInput = readVercelTeamScope(input);
  if (fromInput.teamId || fromInput.slug) {
    return fromInput;
  }
  return readVercelTeamScope({ teamId: context.teamId, slug: context.slug });
}

function teamQuery(
  input: VercelActionInput,
  context: VercelActionContext,
  extra: Record<string, QueryValue> = {},
): Record<string, string> {
  const teamScope = resolveTeamScope(input, context);
  return queryParams({
    ...extra,
    teamId: teamScope.teamId,
    slug: teamScope.slug,
  });
}

async function vercelGetAuthUser(_input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<VercelUserResponse>({
    path: "/v2/user",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
  });

  return {
    user: normalizeVercelUser(payload),
  };
}

async function vercelListTeams(input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<{
    teams?: unknown[];
    pagination?: unknown;
  }>({
    path: "/v2/teams",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: queryParams({
      limit: optionalNumber(input.limit),
      since: optionalNumber(input.since),
    }),
  });

  return compactObject({
    teams: looseArray(payload.teams).map((team) => normalizeVercelTeam(team as VercelTeamResponse)),
    pagination: optionalRecord(payload.pagination),
  });
}

async function vercelGetTeam(input: VercelActionInput, context: VercelActionContext) {
  const teamId = await resolveVercelTeamId({
    teamScope: resolveTeamScope(input, context),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
  });

  return {
    team: await requestVercelTeamById({
      teamId,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      mode: "execute",
    }),
  };
}

async function vercelListProjects(input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<{
    projects?: unknown[];
    pagination?: unknown;
  }>({
    path: "/v10/projects",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: teamQuery(input, context, {
      limit: optionalNumber(input.limit),
      since: optionalNumber(input.since),
      until: optionalNumber(input.until),
      repoUrl: optionalString(input.repoUrl),
    }),
  });

  return compactObject({
    projects: looseArray(payload.projects).map((project) => mapProject(project)),
    pagination: optionalRecord(payload.pagination),
  });
}

async function vercelGetProject(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: teamQuery(input, context),
    notFoundAsInvalidInput: true,
  });

  return {
    project: mapProject(payload),
  };
}

async function vercelCreateProject(input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: "/v11/projects",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    query: teamQuery(input, context),
    body: jsonObject({
      name: optionalString(input.name),
      framework: optionalString(input.framework),
      rootDirectory: optionalString(input.rootDirectory),
      nodeVersion: optionalString(input.nodeVersion),
      buildCommand: optionalString(input.buildCommand),
      devCommand: optionalString(input.devCommand),
      installCommand: optionalString(input.installCommand),
      outputDirectory: optionalString(input.outputDirectory),
      directoryListing: optionalBoolean(input.directoryListing),
      publicSource: optionalBoolean(input.publicSource),
      gitForkProtection: optionalBoolean(input.gitForkProtection),
    }),
  });

  return {
    project: mapProject(payload),
  };
}

async function vercelUpdateProject(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "PATCH",
    query: teamQuery(input, context),
    body: jsonObject({
      name: optionalString(input.name),
      framework: optionalString(input.framework),
      rootDirectory: optionalString(input.rootDirectory),
      nodeVersion: optionalString(input.nodeVersion),
      buildCommand: optionalString(input.buildCommand),
      devCommand: optionalString(input.devCommand),
      installCommand: optionalString(input.installCommand),
      outputDirectory: optionalString(input.outputDirectory),
      directoryListing: optionalBoolean(input.directoryListing),
      publicSource: optionalBoolean(input.publicSource),
      gitForkProtection: optionalBoolean(input.gitForkProtection),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    project: mapProject(payload),
  };
}

async function vercelListDeployments(input: VercelActionInput, context: VercelActionContext) {
  rejectConflictingDeploymentProjectFilters(input);

  const payload = await requestVercelJson<{
    deployments?: unknown[];
    pagination?: unknown;
  }>({
    path: "/v7/deployments",
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    query: compactObject({
      app: optionalString(input.app),
      limit: toQueryString(optionalNumber(input.limit)),
      projectId: optionalString(input.projectId),
      projectIds: normalizeStringArray(input.projectIds),
      since: toQueryString(optionalNumber(input.since)),
      until: toQueryString(optionalNumber(input.until)),
      target: optionalString(input.target),
      state: toCommaSeparatedString(input.states),
      users: toCommaSeparatedString(input.userIds),
      rollbackCandidate: toQueryBoolean(optionalBoolean(input.rollbackCandidate)),
      branch: optionalString(input.branch),
      sha: optionalString(input.sha),
    }),
  });
  return compactObject({
    deployments: looseArray(payload.deployments).map((deployment) => mapDeployment(deployment)),
    pagination: optionalRecord(payload.pagination),
  });
}

async function vercelGetDeployment(input: VercelActionInput, context: VercelActionContext) {
  const idOrUrl = requireString(input.idOrUrl, "idOrUrl");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v13/deployments/${encodeURIComponent(idOrUrl)}`,
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    query: compactObject({
      withGitRepoInfo: toQueryBoolean(optionalBoolean(input.withGitRepoInfo)),
    }),
    notFoundAsInvalidInput: true,
  });
  return {
    deployment: mapDeployment(payload),
  };
}

async function vercelGetDeploymentEvents(input: VercelActionInput, context: VercelActionContext) {
  const idOrUrl = requireString(input.idOrUrl, "idOrUrl");
  const payload = await requestVercelJson<unknown>({
    path: `/v3/deployments/${encodeURIComponent(idOrUrl)}/events`,
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    query: compactObject({
      builds: toQueryFlag(optionalBoolean(input.builds)),
      delimiter: toQueryFlag(optionalBoolean(input.delimiter)),
      direction: optionalString(input.direction),
      limit: toQueryString(optionalNumber(input.limit)),
      name: optionalString(input.buildId),
      since: toQueryString(optionalNumber(input.since)),
      statusCode: optionalString(input.statusCode),
      until: toQueryString(optionalNumber(input.until)),
    }),
    notFoundAsInvalidInput: true,
  });
  return {
    events: normalizeArrayPayload(payload, "events").map((event) => mapDeploymentEvent(event)),
  };
}

async function vercelGetRuntimeLogs(input: VercelActionInput, context: VercelActionContext) {
  const projectId = requireString(input.projectId, "projectId");
  const deploymentId = requireString(input.deploymentId, "deploymentId");
  const payload = await requestVercelJson<unknown>({
    path: `/v1/projects/${encodeURIComponent(projectId)}/deployments/${encodeURIComponent(deploymentId)}/runtime-logs`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: teamQuery(input, context),
    notFoundAsInvalidInput: true,
  });

  return {
    logs: normalizeArrayPayload(payload, "logs").map((log) => mapRuntimeLog(log)),
  };
}

async function vercelListProjectEnvs(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const payload = await requestVercelJson<{ envs?: unknown[] }>({
    path: `/v10/projects/${encodeURIComponent(idOrName)}/env`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: teamQuery(input, context, {
      customEnvironmentId: optionalString(input.customEnvironmentId),
      gitBranch: optionalString(input.gitBranch),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    envs: normalizeArrayPayload(payload, "envs").map((env) => mapEnv(env)),
  };
}

async function vercelCreateProjectEnv(input: VercelActionInput, context: VercelActionContext) {
  rejectSensitiveDevelopmentConflict(input);
  const idOrName = requireString(input.idOrName, "idOrName");
  const payload = await requestVercelJson<unknown>({
    path: `/v10/projects/${encodeURIComponent(idOrName)}/env`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    query: teamQuery(input, context),
    body: jsonObject({
      key: optionalString(input.key),
      value: optionalString(input.value),
      type: optionalString(input.type),
      target: normalizeStringArray(input.target),
      gitBranch: optionalString(input.gitBranch),
      comment: optionalString(input.comment),
      customEnvironmentIds: normalizeStringArray(input.customEnvironmentIds),
    }),
  });

  return {
    envs: normalizeArrayPayload(payload, "envs").map((env) => mapEnv(env)),
  };
}

async function vercelUpdateProjectEnv(input: VercelActionInput, context: VercelActionContext) {
  rejectSensitiveDevelopmentConflict(input);
  const idOrName = requireString(input.idOrName, "idOrName");
  const id = requireString(input.id, "id");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}/env/${encodeURIComponent(id)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "PATCH",
    query: teamQuery(input, context),
    body: jsonObject({
      key: optionalString(input.key),
      value: optionalString(input.value),
      type: optionalString(input.type),
      target: normalizeStringArray(input.target),
      gitBranch: optionalString(input.gitBranch),
      comment: optionalString(input.comment),
      customEnvironmentIds: normalizeStringArray(input.customEnvironmentIds),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    env: mapEnv(payload),
  };
}

async function vercelDeleteProjectEnv(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const id = requireString(input.id, "id");
  const payload = await requestVercelJson<unknown>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}/env/${encodeURIComponent(id)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "DELETE",
    query: teamQuery(input, context),
    notFoundAsInvalidInput: true,
  });

  return {
    envs: normalizeArrayPayload(payload, "envs").map((env) => mapEnv(env)),
  };
}

async function vercelListProjectDomains(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const payload = await requestVercelJson<{
    domains?: unknown[];
    pagination?: unknown;
  }>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}/domains`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: teamQuery(input, context, {
      limit: optionalNumber(input.limit),
      since: optionalNumber(input.since),
      until: optionalNumber(input.until),
      gitBranch: optionalString(input.gitBranch),
      customEnvironmentId: optionalString(input.customEnvironmentId),
    }),
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    domains: normalizeArrayPayload(payload, "domains").map((domain) => mapDomain(domain)),
    pagination: optionalRecord(payload.pagination),
  });
}

async function vercelGetProjectDomain(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const domain = requireString(input.domain, "domain");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}/domains/${encodeURIComponent(domain)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: teamQuery(input, context),
    notFoundAsInvalidInput: true,
  });

  return {
    domain: mapDomain(payload),
  };
}

async function vercelAddProjectDomain(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v10/projects/${encodeURIComponent(idOrName)}/domains`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    query: teamQuery(input, context),
    body: jsonObject({
      name: optionalString(input.name),
      redirect: optionalString(input.redirect),
      gitBranch: optionalString(input.gitBranch),
      customEnvironmentId: optionalString(input.customEnvironmentId),
    }),
    notFoundAsInvalidInput: true,
  });

  return {
    domain: mapDomain(payload),
  };
}

async function vercelVerifyProjectDomain(input: VercelActionInput, context: VercelActionContext) {
  const idOrName = requireString(input.idOrName, "idOrName");
  const domain = requireString(input.domain, "domain");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}/domains/${encodeURIComponent(domain)}/verify`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    query: teamQuery(input, context),
    notFoundAsInvalidInput: true,
  });

  return {
    domain: mapDomain(payload),
  };
}

async function vercelGetDomainConfig(input: VercelActionInput, context: VercelActionContext) {
  const domain = requireString(input.domain, "domain");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v6/domains/${encodeURIComponent(domain)}/config`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: teamQuery(input, context),
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    configuredBy: optionalString(payload.configuredBy),
    acceptedChallenges: normalizeStringArray(payload.acceptedChallenges),
    misconfigured: optionalBoolean(payload.misconfigured),
    recommendedNameServers: normalizeStringArray(payload.recommendedNameServers),
  });
}

async function vercelListWebhooks(input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<{ webhooks?: unknown[] }>({
    path: "/v1/webhooks",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: teamQuery(input, context),
  });

  return {
    webhooks: normalizeArrayPayload(payload, "webhooks").map((webhook) => mapWebhook(webhook)),
  };
}

async function vercelGetWebhook(input: VercelActionInput, context: VercelActionContext) {
  const id = requireString(input.id, "id");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v1/webhooks/${encodeURIComponent(id)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    query: teamQuery(input, context),
    notFoundAsInvalidInput: true,
  });

  return {
    webhook: mapWebhook(payload),
  };
}

async function vercelCreateWebhook(input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: "/v1/webhooks",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    query: teamQuery(input, context),
    body: jsonObject({
      url: optionalString(input.url),
      events: normalizeStringArray(input.events),
      projectIds: normalizeStringArray(input.projectIds),
    }),
  });

  return {
    webhook: mapWebhook(payload),
  };
}

async function vercelDeleteWebhook(input: VercelActionInput, context: VercelActionContext) {
  const id = requireString(input.id, "id");
  await requestVercelNoContent({
    path: `/v1/webhooks/${encodeURIComponent(id)}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    mode: "execute",
    method: "DELETE",
    query: teamQuery(input, context),
    notFoundAsInvalidInput: true,
  });

  return { deleted: true };
}

interface VercelRequestOptions {
  signal?: AbortSignal;
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  mode: "validate" | "execute";
  method?: string;
  query?: Record<string, string | readonly string[] | undefined>;
  scope?: VercelTeamScope;
  rawBody?: BodyInit;
  headers?: HeadersInit;
  responseBody?: "json" | "none";
  includeTeamScope?: boolean;
  body?: Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
}

interface VercelUserResponse {
  user?: {
    id?: unknown;
    username?: unknown;
    email?: unknown;
    name?: unknown;
  };
  id?: unknown;
  username?: unknown;
  email?: unknown;
  name?: unknown;
}

interface VercelTeamResponse {
  team?: {
    id?: unknown;
    slug?: unknown;
    name?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

async function requestVercelJson<T>(options: VercelRequestOptions): Promise<T> {
  const response = await requestVercel(options);

  if (!response.ok) {
    throw await mapVercelError(response, options.mode, options.notFoundAsInvalidInput ?? false);
  }

  if (options.responseBody === "none") {
    await response.body?.cancel();
    return undefined as T;
  }
  if (response.status === 204) {
    throw new ProviderRequestError(502, "vercel returned 204 No Content for a JSON request");
  }

  const text = await response.text();
  if (!text.trim()) {
    throw new ProviderRequestError(502, "vercel returned an empty response");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderRequestError(502, "vercel returned an invalid JSON response");
  }
}

async function requestVercelNoContent(options: VercelRequestOptions & { method: "DELETE" }): Promise<void> {
  const response = await requestVercel(options);

  if (response.status === 204) {
    return;
  }

  if (!response.ok) {
    throw await mapVercelError(response, options.mode, options.notFoundAsInvalidInput ?? false);
  }

  throw new ProviderRequestError(502, "vercel returned a response body for a no-content request");
}

async function requestVercel(options: VercelRequestOptions): Promise<Response> {
  const url = buildVercelUrl(options.path, {
    ...options.query,
    ...(options.includeTeamScope === false ? {} : options.scope),
  });

  try {
    return await options.fetcher(url, {
      signal: options.signal,
      method: options.method ?? "GET",
      headers: vercelHeaders(options.apiKey, options.body !== undefined, options.headers),
      body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      ...(options.rawBody instanceof ReadableStream ? { duplex: "half" } : {}),
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "vercel request failed");
  }
}

function buildVercelUrl(path: string, query?: Record<string, string | readonly string[] | undefined>) {
  const url = new URL(path, vercelApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else if (value !== undefined) {
      url.searchParams.set(key, value as string);
    }
  }
  return url.toString();
}

function vercelHeaders(apiKey: string, hasJsonBody: boolean, additional?: HeadersInit) {
  const headers = new Headers(additional);
  headers.set("authorization", `Bearer ${apiKey}`);
  headers.set("user-agent", providerUserAgent);
  if (hasJsonBody && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function mapVercelError(
  response: Response,
  mode: "validate" | "execute",
  notFoundAsInvalidInput: boolean,
): Promise<ProviderRequestError> {
  const error = await readVercelError(response);

  if (response.status === 400 || response.status === 409) {
    return new ProviderRequestError(400, error.message, error);
  }
  if (response.status === 401) {
    return new ProviderRequestError(response.status, error.message, error, "provider_error");
  }
  if ((response.status === 404 || response.status === 410) && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, error.message, error);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, error.message, error);
  }
  if (response.status === 403 || response.status >= 500) {
    return new ProviderRequestError(response.status, error.message, error);
  }

  return new ProviderRequestError(response.status || 502, error.message, error);
}

async function readVercelError(response: Response): Promise<{
  code: string;
  message: string;
}> {
  try {
    const payload = (await response.json()) as {
      error?: {
        code?: unknown;
        message?: unknown;
      };
      message?: unknown;
      code?: unknown;
    };

    return {
      code:
        typeof payload.error?.code === "string"
          ? payload.error.code
          : typeof payload.code === "string"
            ? payload.code
            : "provider_error",
      message:
        typeof payload.error?.message === "string"
          ? payload.error.message
          : typeof payload.message === "string"
            ? payload.message
            : `vercel request failed with ${response.status}`,
    };
  } catch {
    const message = (await response.text().catch(() => "")) || `vercel request failed with ${response.status}`;
    return {
      code: "provider_error",
      message,
    };
  }
}

function normalizeVercelUser(payload: VercelUserResponse): VercelUser {
  const user = payload.user ?? payload;
  const id = optionalString(user.id);
  if (!id) {
    throw new ProviderRequestError(502, "vercel user response is missing id");
  }

  return {
    id,
    username: optionalString(user.username),
    email: optionalString(user.email),
    name: optionalString(user.name),
  };
}

function normalizeVercelTeam(payload: VercelTeamResponse): VercelTeam {
  const team = payload.team ?? payload;
  const id = optionalString(team.id);
  if (!id) {
    throw new ProviderRequestError(502, "vercel team response is missing id");
  }

  return {
    id,
    slug: optionalString(team.slug),
    name: optionalString(team.name),
    createdAt: optionalNumber(team.createdAt),
    updatedAt: optionalNumber(team.updatedAt),
  };
}

function userLabel(user: VercelUser): string {
  return user.name ?? user.username ?? user.id;
}

function mapProject(value: unknown): Record<string, unknown> {
  const project = requiredResponseRecord(value, "project");
  return compactObject({
    id: requireString(project.id, "project.id"),
    name: requireString(project.name, "project.name"),
    accountId: optionalString(project.accountId),
    framework: optionalString(project.framework),
    nodeVersion: optionalString(project.nodeVersion),
    createdAt: optionalNumber(project.createdAt),
    updatedAt: optionalNumber(project.updatedAt),
    link: optionalRecord(project.link),
    latestDeployments: Array.isArray(project.latestDeployments)
      ? project.latestDeployments.map((deployment) => mapDeployment(deployment))
      : undefined,
  });
}

function mapDeployment(value: unknown) {
  const deployment = requiredResponseRecord(value, "deployment");
  return compactObject({
    id: requireString(deployment.id ?? deployment.uid, "deployment.id or deployment.uid"),
    name: optionalString(deployment.name),
    url: optionalString(deployment.url),
    state: optionalString(deployment.state),
    readyState: optionalString(deployment.readyState),
    target: optionalString(deployment.target),
    createdAt: optionalNumber(deployment.createdAt),
    ready: optionalNumber(deployment.ready),
    projectId: optionalString(deployment.projectId),
    creator: optionalRecord(deployment.creator),
    meta: optionalRecord(deployment.meta),
    alias: Array.isArray(deployment.alias)
      ? deployment.alias.filter((alias): alias is string => typeof alias === "string")
      : undefined,
  });
}

function mapDeploymentEvent(value: unknown): {
  created: number;
  type: string;
  payload: Record<string, unknown>;
} {
  const event = requiredResponseRecord(value, "deployment event");
  return {
    created: requireNumber(event.created, "event.created"),
    type: requireString(event.type, "event.type"),
    payload: requiredResponseRecord(event.payload, "event.payload"),
  };
}

function mapRuntimeLog(value: unknown): Record<string, unknown> {
  const log = requiredResponseRecord(value, "runtime log");
  return compactObject({
    timestampInMs: requireNumber(log.timestampInMs, "log.timestampInMs"),
    level: requireString(log.level, "log.level"),
    message: requireString(log.message, "log.message"),
    source: requireString(log.source, "log.source"),
    requestMethod: optionalString(log.requestMethod),
    requestPath: optionalString(log.requestPath),
    responseStatusCode: optionalNumber(log.responseStatusCode),
  });
}

function mapEnv(value: unknown): Record<string, unknown> {
  const env = requiredResponseRecord(value, "env");
  return compactObject({
    id: requireString(env.id, "env.id"),
    key: requireString(env.key, "env.key"),
    type: requireString(env.type, "env.type"),
    target: normalizeStringArray(env.target),
    gitBranch: optionalString(env.gitBranch),
    createdAt: optionalNumber(env.createdAt),
    updatedAt: optionalNumber(env.updatedAt),
    comment: optionalString(env.comment),
  });
}

function mapDomain(value: unknown): Record<string, unknown> {
  const domain = requiredResponseRecord(value, "domain");
  return compactObject({
    name: requireString(domain.name, "domain.name"),
    apexName: optionalString(domain.apexName),
    verified: optionalBoolean(domain.verified),
    verification: Array.isArray(domain.verification)
      ? domain.verification
          .map((item) => optionalRecord(item))
          .filter((item): item is Record<string, unknown> => item !== undefined)
      : undefined,
    redirect: domain.redirect === null ? null : optionalString(domain.redirect),
    gitBranch: optionalString(domain.gitBranch),
    customEnvironmentId: optionalString(domain.customEnvironmentId),
  });
}

function mapWebhook(value: unknown): Record<string, unknown> {
  const webhook = requiredResponseRecord(value, "webhook");
  return compactObject({
    id: requireString(webhook.id, "webhook.id"),
    url: requireString(webhook.url, "webhook.url"),
    events: normalizeStringArray(webhook.events),
    projectIds: normalizeStringArray(webhook.projectIds),
    teamId: optionalString(webhook.teamId),
    createdAt: optionalNumber(webhook.createdAt),
    updatedAt: optionalNumber(webhook.updatedAt),
  });
}

function normalizeArrayPayload(payload: unknown, key: string): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = optionalRecord(payload);
  const value = record?.[key];
  return looseArray(value);
}

function normalizeStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function requireString(value: unknown, label: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${label} must be a string`);
  }
  return stringValue;
}

function requireNumber(value: unknown, label: string): number {
  const numberValue = optionalNumber(value);
  if (numberValue === undefined) {
    throw new ProviderRequestError(502, `${label} must be a number`);
  }
  return numberValue;
}

function rejectSensitiveDevelopmentConflict(input: VercelActionInput): void {
  if (input.type === "sensitive" && Array.isArray(input.target) && input.target.includes("development")) {
    throw new ProviderRequestError(400, "sensitive env does not support development target");
  }
}

async function vercelCreateGitDeployment(input: VercelActionInput, context: VercelActionContext) {
  validateDeploymentGitSource(input);

  const gitProvider = requireString(input.gitProvider, "gitProvider");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: "/v13/deployments",
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    query: deploymentSubmissionQuery(input),
    body: compactObject({
      ...deploymentSubmissionBody(input),
      gitSource: buildVercelGitSource(gitProvider, input),
      gitAccessToken: optionalString(input.gitAccessToken),
      gitMetadata: optionalRecord(input.gitMetadata),
    }),
  });
  return { deployment: mapDeployment(payload) };
}

async function vercelRedeployDeployment(input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: "/v13/deployments",
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    query: deploymentSubmissionQuery(input),
    body: compactObject({
      ...deploymentSubmissionBody(input),
      deploymentId: optionalString(input.deploymentId),
      withLatestCommit: optionalBoolean(input.withLatestCommit),
    }),
  });
  return { deployment: mapDeployment(payload) };
}

async function vercelUploadDeploymentFileFromUrl(input: VercelActionInput, context: VercelActionContext) {
  return runProviderRequest(
    { label: "Vercel file upload", signal: context.signal, timeoutMs: 300_000 },
    async (signal) => {
      validateOptionalUploadDigest(input);

      const fileUrl = requireString(input.fileUrl, "fileUrl");
      const suppliedSha = optionalString(input.sha);
      const suppliedSize = optionalNumber(input.size);
      const hasSuppliedMetadata = suppliedSha !== undefined && suppliedSize !== undefined;
      if (suppliedSize !== undefined && suppliedSize > vercelConnectorMaxDeploymentFileBytes) {
        throw new ProviderRequestError(
          413,
          `size exceeds the Connector deployment upload safety limit of ${vercelConnectorMaxDeploymentFileBytes} bytes`,
          undefined,
          "invalid_input",
        );
      }
      const staged = hasSuppliedMetadata
        ? undefined
        : await stageRemoteDeploymentFile(fileUrl, context.fetcher, signal);
      const metadata = staged
        ? { sha: staged.sha, size: staged.size }
        : { sha: requireSha1(suppliedSha ?? ""), size: suppliedSize ?? 0 };
      const sourceResponse = staged ? undefined : await context.fetcher(fileUrl, { signal });
      if (sourceResponse && (!sourceResponse.ok || !sourceResponse.body)) {
        await sourceResponse.body?.cancel().catch(() => undefined);
        throw new ProviderRequestError(
          502,
          `Vercel upload source download failed with HTTP ${sourceResponse.status}`,
          undefined,
          "provider_error",
        );
      }
      const declaredSourceLength = sourceResponse?.headers.get("content-length");
      const declaredSourceBytes =
        declaredSourceLength === undefined || declaredSourceLength === null ? undefined : Number(declaredSourceLength);
      if (
        sourceResponse?.body &&
        declaredSourceBytes !== undefined &&
        Number.isFinite(declaredSourceBytes) &&
        declaredSourceBytes !== metadata.size
      ) {
        await sourceResponse.body.cancel().catch(() => undefined);
        throw new ProviderRequestError(
          400,
          `fileUrl content-length ${declaredSourceBytes} does not match size ${metadata.size}`,
          undefined,
          "invalid_input",
        );
      }
      const stagedReadStream = staged ? createReadStream(staged.filePath) : undefined;
      const rawBody: BodyInit | undefined = stagedReadStream
        ? (Readable.toWeb(stagedReadStream) as unknown as BodyInit)
        : sourceResponse?.body
          ? createSizeCheckedUploadBody(sourceResponse.body, metadata.size)
          : undefined;
      try {
        await requestVercelJson({
          path: "/v2/files",
          apiKey: context.apiKey,
          scope: resolveTeamScope(input, context),
          fetcher: context.fetcher,
          signal,
          mode: "execute",
          method: "POST",
          rawBody,
          headers: {
            "content-length": String(metadata.size),
            "content-type": "application/octet-stream",
            "x-vercel-digest": metadata.sha,
          },
          responseBody: "none",
        });
        return metadata;
      } finally {
        stagedReadStream?.destroy();
        await sourceResponse?.body?.cancel().catch(() => undefined);
        await staged?.cleanup();
      }
    },
  );
}

async function vercelCreateFileDeployment(input: VercelActionInput, context: VercelActionContext) {
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: "/v13/deployments",
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    query: deploymentSubmissionQuery(input),
    body: compactObject({
      ...deploymentSubmissionBody(input),
      files: normalizeDeploymentFileReferences(input.files),
    }),
  });
  return { deployment: mapDeployment(payload) };
}

async function vercelListDeploymentFiles(input: VercelActionInput, context: VercelActionContext) {
  const deploymentId = requireString(input.deploymentId, "deploymentId");
  const payload = await requestVercelJson<unknown>({
    path: `/v6/deployments/${encodeURIComponent(deploymentId)}/files`,
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });
  return {
    files: normalizeArrayPayload(payload, "files").map((file) => mapDeploymentFile(file)),
  };
}

async function vercelGetDeploymentFileContents(input: VercelActionInput, context: VercelActionContext) {
  const deploymentId = requireString(input.deploymentId, "deploymentId");
  const fileId = requireString(input.fileId, "fileId");
  const response = await requestVercelResponse({
    path: `/v8/deployments/${encodeURIComponent(deploymentId)}/files/${encodeURIComponent(fileId)}`,
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    query: compactObject({ path: optionalString(input.path) }),
    notFoundAsInvalidInput: true,
  });
  return { contentBase64: await readDeploymentFileBase64(response) };
}

async function vercelListDeploymentAliases(input: VercelActionInput, context: VercelActionContext) {
  const deploymentId = requireString(input.deploymentId, "deploymentId");
  const payload = await requestVercelJson<{
    aliases?: unknown[];
  }>({
    path: `/v2/deployments/${encodeURIComponent(deploymentId)}/aliases`,
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });
  return {
    aliases: looseArray(payload.aliases).map((alias) => mapDeploymentAlias(alias)),
  };
}

async function vercelAssignDeploymentAlias(input: VercelActionInput, context: VercelActionContext) {
  const deploymentId = requireString(input.deploymentId, "deploymentId");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v2/deployments/${encodeURIComponent(deploymentId)}/aliases`,
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    body: compactObject({
      alias: optionalString(input.alias),
      redirect: input.redirect === null ? null : optionalString(input.redirect),
    }),
    notFoundAsInvalidInput: true,
  });
  return { alias: mapDeploymentAlias(payload) };
}

async function vercelUpdateDeploymentIntegrationAction(input: VercelActionInput, context: VercelActionContext) {
  validateIntegrationStatusUrl(input);

  const deploymentId = requireString(input.deploymentId, "deploymentId");
  const integrationConfigurationId = requireString(input.integrationConfigurationId, "integrationConfigurationId");
  const resourceId = requireString(input.resourceId, "resourceId");
  const action = requireString(input.action, "action");
  await requestVercelJson({
    path: `/v1/deployments/${encodeURIComponent(deploymentId)}/integrations/${encodeURIComponent(integrationConfigurationId)}/resources/${encodeURIComponent(resourceId)}/actions/${encodeURIComponent(action)}`,
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    method: "PATCH",
    body: compactObject({
      status: optionalString(input.status),
      statusText: optionalString(input.statusText),
      statusUrl: optionalString(input.statusUrl),
      outcomes: Array.isArray(input.outcomes) ? input.outcomes : undefined,
    }),
    responseBody: "none",
    notFoundAsInvalidInput: true,
    includeTeamScope: false,
  });
  return { success: true, deploymentId, action };
}

function deploymentSubmissionBody(input: Record<string, unknown>) {
  return compactObject({
    name: optionalString(input.name),
    project: optionalString(input.project),
    target: optionalString(input.target),
    customEnvironmentSlugOrId: optionalString(input.customEnvironmentSlugOrId),
    buildMachine: optionalString(input.buildMachine),
    monorepoManager: optionalString(input.monorepoManager),
    meta: optionalRecord(input.meta),
    projectSettings: optionalRecord(input.projectSettings),
  });
}

function buildVercelGitSource(gitProvider: string, input: Record<string, unknown>) {
  const repositoryId = optionalString(input.repositoryId);
  const repositoryOwner = optionalString(input.repositoryOwner);
  const repositoryName = optionalString(input.repositoryName);
  const common = compactObject({
    type: gitProvider,
    ref: optionalString(input.ref),
    sha: optionalString(input.sha),
  });
  if (gitProvider === "gitlab") {
    return { ...common, projectId: repositoryId };
  }
  if (gitProvider === "bitbucket") {
    return repositoryId
      ? compactObject({
          ...common,
          repoUuid: repositoryId,
          workspaceUuid: optionalString(input.workspaceUuid),
        })
      : { ...common, owner: repositoryOwner, slug: repositoryName };
  }
  if (gitProvider === "github" || gitProvider === "github-limited") {
    return repositoryId
      ? { ...common, repoId: repositoryId }
      : { ...common, org: repositoryOwner, repo: repositoryName };
  }
  return compactObject({
    ...common,
    repoId: repositoryId,
    owner: gitProvider === "cursor-origin" ? repositoryOwner : undefined,
    repo: gitProvider === "cursor-origin" ? repositoryName : undefined,
  });
}

async function vercelCancelDeployment(input: VercelActionInput, context: VercelActionContext) {
  const deploymentId = requireString(input.deploymentId, "deploymentId");
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v12/deployments/${encodeURIComponent(deploymentId)}/cancel`,
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    method: "PATCH",
    notFoundAsInvalidInput: true,
  });
  return { deployment: mapDeployment(payload) };
}

async function vercelDeleteDeployment(input: VercelActionInput, context: VercelActionContext) {
  validateDeploymentDeletionTarget(input);

  const deploymentId = optionalString(input.deploymentId);
  const deploymentUrl = optionalString(input.url);
  const expectedDeploymentId = optionalString(input.expectedDeploymentId);
  if ((deploymentId === undefined) === (deploymentUrl === undefined)) {
    throw new ProviderRequestError(400, "Configure exactly one of deploymentId or url", undefined, "invalid_input");
  }
  let stableDeploymentId = deploymentId;
  if (deploymentUrl) {
    if (!expectedDeploymentId) {
      throw new ProviderRequestError(400, "url deletion requires expectedDeploymentId", undefined, "invalid_input");
    }
    const resolved = await requestVercelJson<Record<string, unknown>>({
      path: `/v13/deployments/${encodeURIComponent(deploymentUrl)}`,
      apiKey: context.apiKey,
      scope: resolveTeamScope(input, context),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    const resolvedDeploymentId = requireString(resolved.id ?? resolved.uid, "resolved deployment.id or deployment.uid");
    if (resolvedDeploymentId !== expectedDeploymentId) {
      throw new ProviderRequestError(
        409,
        `url resolved to ${resolvedDeploymentId}, expected ${expectedDeploymentId}`,
        undefined,
        "invalid_input",
      );
    }
    stableDeploymentId = resolvedDeploymentId;
  }
  const payload = await requestVercelJson<Record<string, unknown>>({
    path: `/v13/deployments/${encodeURIComponent(stableDeploymentId ?? "")}`,
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    method: "DELETE",
    notFoundAsInvalidInput: true,
  });
  return {
    deploymentId: requireString(payload.uid, "deployment.uid"),
    state: requireString(payload.state, "deployment.state"),
  };
}

async function vercelPromoteDeployment(input: VercelActionInput, context: VercelActionContext) {
  const projectId = requireString(input.projectId, "projectId");
  const deploymentId = requireString(input.deploymentId, "deploymentId");
  const response = await requestVercelResponse({
    path: `/v10/projects/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(deploymentId)}`,
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    notFoundAsInvalidInput: true,
  });
  return { accepted: true, statusCode: response.status, projectId, deploymentId };
}

async function vercelRollbackDeployment(input: VercelActionInput, context: VercelActionContext) {
  const projectId = requireString(input.projectId, "projectId");
  const deploymentId = requireString(input.deploymentId, "deploymentId");
  await requestVercelJson({
    path: `/v1/projects/${encodeURIComponent(projectId)}/rollback/${encodeURIComponent(deploymentId)}`,
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    method: "POST",
    query: compactObject({
      description: optionalString(input.description),
    }),
    responseBody: "none",
    notFoundAsInvalidInput: true,
  });
  return { success: true, projectId, deploymentId };
}

async function vercelGetLatestDeploymentPromotionAliases(input: VercelActionInput, context: VercelActionContext) {
  const projectId = requireString(input.projectId, "projectId");
  const payload = await requestVercelJson<{
    aliases?: unknown[];
    pagination?: unknown;
  }>({
    path: `/v1/projects/${encodeURIComponent(projectId)}/promote/aliases`,
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    query: compactObject({
      limit: toQueryString(optionalNumber(input.limit)),
      since: toQueryString(optionalNumber(input.since)),
      until: toQueryString(optionalNumber(input.until)),
      failedOnly: toQueryBoolean(optionalBoolean(input.failedOnly)),
    }),
    notFoundAsInvalidInput: true,
  });
  return compactObject({
    aliases: looseArray(payload.aliases).map((alias) => mapPromotionAlias(alias)),
    pagination: optionalRecord(payload.pagination),
  });
}

async function vercelUpdateDeploymentRollbackDescription(input: VercelActionInput, context: VercelActionContext) {
  const projectId = requireString(input.projectId, "projectId");
  const deploymentId = requireString(input.deploymentId, "deploymentId");
  await requestVercelJson({
    path: `/v1/projects/${encodeURIComponent(projectId)}/rollback/${encodeURIComponent(deploymentId)}/update-description`,
    apiKey: context.apiKey,
    scope: resolveTeamScope(input, context),
    fetcher: context.fetcher,
    mode: "execute",
    method: "PATCH",
    body: { description: optionalString(input.description) },
    responseBody: "none",
    includeTeamScope: false,
  });
  return { success: true, projectId, deploymentId };
}

function deploymentSubmissionQuery(input: Record<string, unknown>) {
  return compactObject({
    forceNew: toQueryFlag(optionalBoolean(input.forceNew)),
    skipAutoDetectionConfirmation: toQueryFlag(optionalBoolean(input.skipAutoDetectionConfirmation)),
  });
}

function mapDeploymentFile(value: unknown): Record<string, unknown> {
  const file = requiredResponseRecord(value, "deployment file");
  return compactObject({
    name: requireString(file.name, "deployment file.name"),
    type: requireString(file.type, "deployment file.type"),
    mode: requireNumber(file.mode, "deployment file.mode"),
    uid: optionalString(file.uid),
    contentType: optionalString(file.contentType),
    children: Array.isArray(file.children) ? file.children.map((child) => mapDeploymentFile(child)) : undefined,
  });
}

function mapDeploymentAlias(value: unknown) {
  const alias = requiredResponseRecord(value, "deployment alias");
  return compactObject({
    uid: requireString(alias.uid, "deployment alias.uid"),
    alias: requireString(alias.alias, "deployment alias.alias"),
    created: requireString(alias.created, "deployment alias.created"),
    redirect: alias.redirect === null ? null : optionalString(alias.redirect),
    oldDeploymentId: alias.oldDeploymentId === null ? null : optionalString(alias.oldDeploymentId),
    protectionBypass: optionalRecord(alias.protectionBypass),
  });
}

function mapPromotionAlias(value: unknown) {
  const alias = requiredResponseRecord(value, "promotion alias");
  return {
    id: requireString(alias.id, "promotion alias.id"),
    alias: requireString(alias.alias, "promotion alias.alias"),
    status: requireString(alias.status, "promotion alias.status"),
  };
}

function normalizeDeploymentFileReferences(value: unknown) {
  return looseArray(value).map((item, index) => {
    const file = requiredResponseRecord(item, `files[${index}]`);
    return {
      file: requireString(file.path, `files[${index}].path`),
      sha: requireSha1(requireString(file.sha, `files[${index}].sha`)),
      size: requireNumber(file.size, `files[${index}].size`),
    };
  });
}

async function stageRemoteDeploymentFile(fileUrl: string, fetcher: typeof fetch, signal: AbortSignal) {
  const response = await fetcher(fileUrl, { signal });
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderRequestError(
      502,
      `Vercel upload source download failed with HTTP ${response.status}`,
      undefined,
      "provider_error",
    );
  }
  const declaredSize = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredSize) && declaredSize > vercelConnectorMaxDeploymentFileBytes) {
    await response.body.cancel().catch(() => undefined);
    throw new ProviderRequestError(
      413,
      `fileUrl exceeds the Connector deployment upload safety limit of ${vercelConnectorMaxDeploymentFileBytes} bytes`,
      undefined,
      "invalid_input",
    );
  }
  const directory = await mkdtemp(join(tmpdir(), "oomol-connector-vercel-"));
  const filePath = join(directory, "deployment-file");
  const hasher = createHash("sha1");
  let size = 0;
  let completed = false;
  const chunks = async function* () {
    for await (const chunk of response.body!) {
      size += chunk.byteLength;
      if (size > vercelConnectorMaxDeploymentFileBytes) {
        throw new ProviderRequestError(
          413,
          `fileUrl exceeds the Connector deployment upload safety limit of ${vercelConnectorMaxDeploymentFileBytes} bytes`,
          undefined,
          "invalid_input",
        );
      }
      hasher.update(chunk);
      yield chunk;
    }
    completed = true;
  };
  try {
    const destination = createWriteStream(filePath, { flags: "wx" });
    const closed = new Promise<void>((resolve) => destination.once("close", resolve));
    try {
      await pipeline(Readable.from(chunks()), destination, { signal });
    } finally {
      if (!destination.destroyed) destination.destroy();
      await closed;
    }
    return {
      filePath,
      sha: hasher.digest("hex"),
      size,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  } finally {
    if (!completed) {
      await response.body.cancel().catch(() => undefined);
    }
  }
}

function createSizeCheckedUploadBody(body: ReadableStream<Uint8Array>, expectedBytes: number): BodyInit {
  let receivedBytes = 0;
  const chunks = async function* () {
    for await (const chunk of body) {
      receivedBytes += chunk.byteLength;
      if (receivedBytes > expectedBytes) {
        throw new ProviderRequestError(
          400,
          `fileUrl returned more than the declared size of ${expectedBytes} bytes`,
          undefined,
          "invalid_input",
        );
      }
      yield chunk;
    }
    if (receivedBytes !== expectedBytes) {
      throw new ProviderRequestError(
        400,
        `fileUrl returned ${receivedBytes} bytes, expected ${expectedBytes}`,
        undefined,
        "invalid_input",
      );
    }
  };
  return Readable.toWeb(Readable.from(chunks())) as unknown as BodyInit;
}

function requireSha1(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.length !== 40) {
    throw new ProviderRequestError(400, "sha must be a 40-character SHA-1 digest", undefined, "invalid_input");
  }
  for (const character of normalized) {
    const code = character.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLowerHex = code >= 97 && code <= 102;
    if (!isDigit && !isLowerHex) {
      throw new ProviderRequestError(400, "sha must be a 40-character SHA-1 digest", undefined, "invalid_input");
    }
  }
  return normalized;
}

async function readDeploymentFileBase64(response: Response) {
  const text = await readDeploymentFileResponseText(response);
  if (!text) {
    throw new ProviderRequestError(502, "Vercel deployment file response is empty", undefined, "provider_error");
  }
  try {
    const payload = JSON.parse(text) as unknown;
    if (typeof payload === "string") {
      return payload;
    }
    const object = optionalRecord(payload);
    const content = optionalString(object?.content) ?? optionalString(object?.data);
    if (content !== undefined) {
      return content;
    }
  } catch {
    return text;
  }
  throw new ProviderRequestError(
    502,
    "Vercel deployment file response is missing base64 content",
    undefined,
    "provider_error",
  );
}

async function readDeploymentFileResponseText(response: Response) {
  const declaredBytes = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > vercelMaxDeploymentFileContentResponseBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderRequestError(
      413,
      `Vercel deployment file response exceeds ${vercelMaxDeploymentFileContentResponseBytes} bytes`,
      undefined,
      "invalid_input",
    );
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }
  const decoder = new TextDecoder();
  let text = "";
  let receivedBytes = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) {
      break;
    }
    receivedBytes += next.value.byteLength;
    if (receivedBytes > vercelMaxDeploymentFileContentResponseBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ProviderRequestError(
        413,
        `Vercel deployment file response exceeds ${vercelMaxDeploymentFileContentResponseBytes} bytes`,
        undefined,
        "invalid_input",
      );
    }
    text += decoder.decode(next.value, { stream: true });
  }
  return text + decoder.decode();
}

function toQueryString(value: number | undefined) {
  return value === undefined ? undefined : String(value);
}

function toQueryFlag(value: boolean | undefined) {
  return value === undefined ? undefined : value ? "1" : "0";
}

function toQueryBoolean(value: boolean | undefined) {
  return value === undefined ? undefined : String(value);
}

function toCommaSeparatedString(value: unknown) {
  const items = normalizeStringArray(value);
  return items && items.length > 0 ? items.join(",") : undefined;
}

const vercelConnectorMaxDeploymentFileBytes = 1024 * 1024 * 1024;
const vercelMaxDeploymentFileContentResponseBytes = 16 * 1024 * 1024;

async function requestVercelResponse(options: VercelRequestOptions): Promise<Response> {
  const response = await requestVercel(options);
  if (!response.ok) throw await mapVercelError(response, options.mode, options.notFoundAsInvalidInput ?? false);
  return response;
}

function rejectConflictingDeploymentProjectFilters(value: { projectId?: string; projectIds?: string[] }) {
  if (value.projectId && value.projectIds) {
    throw providerInputError("projectId and projectIds cannot be used together");
  }
}
function validateDeploymentGitSource(value: {
  gitProvider?: string;
  repositoryId?: string;
  repositoryOwner?: string;
  repositoryName?: string;
  ref?: string;
  sha?: string;
}) {
  const hasRepositoryId = Boolean(value.repositoryId);
  const hasRepositoryName = Boolean(value.repositoryOwner && value.repositoryName);
  if (value.gitProvider === "vercel") {
    if (!hasRepositoryId || !value.sha) {
      throw providerInputError("vercel git source requires repositoryId and sha");
    }
    return;
  }
  if (!value.ref) {
    throw providerInputError(`${value.gitProvider ?? "git"} source requires ref`);
  }
  if (value.gitProvider === "github" || value.gitProvider === "github-limited") {
    if (hasRepositoryId === hasRepositoryName) {
      throw providerInputError(
        "github source requires exactly one of repositoryId or repositoryOwner + repositoryName",
      );
    }
    return;
  }
  if (value.gitProvider === "bitbucket") {
    if (hasRepositoryId === hasRepositoryName) {
      throw providerInputError(
        "bitbucket source requires exactly one of repositoryId or repositoryOwner + repositoryName",
      );
    }
    return;
  }
  if (!hasRepositoryId) {
    throw providerInputError(`${value.gitProvider ?? "git"} source requires repositoryId`);
  }
}
function validateOptionalUploadDigest(value: { sha?: string; size?: number }) {
  if (Boolean(value.sha) !== (value.size !== undefined)) {
    throw providerInputError("sha and size must be supplied together or both omitted");
  }
}
function validateIntegrationStatusUrl(value: { statusUrl?: string }) {
  if (!value.statusUrl || value.statusUrl.startsWith("sso:")) {
    return;
  }
  try {
    const url = new URL(value.statusUrl);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return;
    }
  } catch {}
  throw providerInputError("statusUrl must use HTTP, HTTPS, or SSO");
}
function validateDeploymentDeletionTarget(value: {
  deploymentId?: string;
  url?: string;
  expectedDeploymentId?: string;
}) {
  if (value.url && !value.expectedDeploymentId) {
    throw providerInputError("url deletion requires expectedDeploymentId");
  }
  if (value.deploymentId && value.expectedDeploymentId) {
    throw providerInputError("expectedDeploymentId is only valid with url");
  }
}
