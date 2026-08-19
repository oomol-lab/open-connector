import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlerSubset } from "../provider-runtime.ts";

import { nullableString, optionalRecord, optionalString, compactObject } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { dopplerApiBaseUrl, dopplerRequest, readArray, readObject } from "./runtime.shared.ts";

interface DopplerProjectActionContext {
  accessToken: string;
  fetcher: typeof fetch;
}

type DopplerProjectActionHandler = (
  input: Record<string, unknown>,
  context: DopplerProjectActionContext,
) => Promise<unknown>;

export const dopplerProjectActionHandlers: ProviderActionHandlerSubset<"doppler", DopplerProjectActionHandler> = {
  get_auth_me(_input, context) {
    return dopplerGetAuthMe(context.accessToken, context.fetcher);
  },
  list_projects(input, context) {
    return dopplerListProjects(input, context.accessToken, context.fetcher);
  },
  get_project(input, context) {
    return dopplerGetProject(input, context.accessToken, context.fetcher);
  },
  create_project(input, context) {
    return dopplerCreateProject(input, context.accessToken, context.fetcher);
  },
  update_project(input, context) {
    return dopplerUpdateProject(input, context.accessToken, context.fetcher);
  },
  delete_project(input, context) {
    return dopplerDeleteProject(input, context.accessToken, context.fetcher);
  },
  list_environments(input, context) {
    return dopplerListEnvironments(input, context.accessToken, context.fetcher);
  },
  get_environment(input, context) {
    return dopplerGetEnvironment(input, context.accessToken, context.fetcher);
  },
  create_environment(input, context) {
    return dopplerCreateEnvironment(input, context.accessToken, context.fetcher);
  },
  update_environment(input, context) {
    return dopplerUpdateEnvironment(input, context.accessToken, context.fetcher);
  },
  delete_environment(input, context) {
    return dopplerDeleteEnvironment(input, context.accessToken, context.fetcher);
  },
  list_configs(input, context) {
    return dopplerListConfigs(input, context.accessToken, context.fetcher);
  },
  get_config(input, context) {
    return dopplerGetConfig(input, context.accessToken, context.fetcher);
  },
  create_config(input, context) {
    return dopplerCreateConfig(input, context.accessToken, context.fetcher);
  },
  update_config(input, context) {
    return dopplerUpdateConfig(input, context.accessToken, context.fetcher);
  },
  delete_config(input, context) {
    return dopplerDeleteConfig(input, context.accessToken, context.fetcher);
  },
  clone_config(input, context) {
    return dopplerCloneConfig(input, context.accessToken, context.fetcher);
  },
  set_config_inheritable(input, context) {
    return dopplerSetConfigInheritable(input, context.accessToken, context.fetcher);
  },
};

export async function validateDopplerCredential(
  accessToken: string,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const token = await fetchCurrentToken(accessToken, fetcher, "validate");
  const tokenSlug = optionalString(token.slug);
  const tokenPreview = optionalString(token.token_preview);

  const providerAccountId = tokenSlug ?? tokenPreview ?? extractPrincipalSlug(token.principal);
  if (!providerAccountId) {
    throw new ProviderRequestError(502, "malformed Doppler response: token identifier");
  }

  return {
    profile: {
      accountId: providerAccountId,
      displayName: buildTokenLabel(token),
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: dopplerApiBaseUrl,
      validationEndpoint: "/v3/me",
      tokenType: optionalString(token.type),
      tokenSlug,
      tokenPreview,
      principal: optionalRecord(token.principal),
      workplace: optionalRecord(token.workplace),
    },
  };
}

async function dopplerGetAuthMe(accessToken: string, fetcher: typeof fetch) {
  return normalizeToken(await fetchCurrentToken(accessToken, fetcher, "execute"));
}

async function dopplerListProjects(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/projects",
      query: {
        page: asOptionalNumber(input.page),
        per_page: asOptionalNumber(input.perPage),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "projects list");
  const projects = readArray(record.projects, "projects list");

  return compactObject({
    page: asOptionalNumber(record.page),
    projects: projects.map((project) => normalizeProject(readObject(project, "project"))),
  });
}

async function dopplerGetProject(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const project = asRequiredString(input.project, "project");
  const payload = await dopplerRequest(
    accessToken,
    {
      path: `/v3/projects/${encodeURIComponent(project)}`,
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "project");
  const projectPayload = readObject(record.project ?? payload, "project");

  return {
    project: normalizeProject(projectPayload),
  };
}

async function dopplerCreateProject(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: "/v3/projects",
      body: compactObject({
        name: asRequiredInputString(input.name, "name"),
        description: optionalString(input.description),
      }),
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "created project");

  return {
    project: normalizeProject(readObject(record.project, "project")),
  };
}

async function dopplerUpdateProject(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: "/v3/projects/project",
      body: compactObject({
        project: asRequiredInputString(input.project, "project"),
        name: asRequiredInputString(input.name, "name"),
        description: optionalString(input.description),
      }),
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "updated project");

  return {
    project: normalizeProject(readObject(record.project, "project")),
  };
}

async function dopplerDeleteProject(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "DELETE",
      path: "/v3/projects/project",
      body: {
        project: asRequiredInputString(input.project, "project"),
      },
    },
    fetcher,
    "execute",
  );

  return normalizeSuccessResult(payload);
}

async function dopplerListEnvironments(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/environments",
      query: {
        project: asRequiredInputString(input.project, "project"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "environments list");
  const environments = readArray(record.environments, "environments list");

  return compactObject({
    page: asOptionalNumber(record.page),
    environments: environments.map((environment) => normalizeEnvironment(readObject(environment, "environment"))),
  });
}

async function dopplerGetEnvironment(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/environments/environment",
      query: {
        project: asRequiredInputString(input.project, "project"),
        environment: asRequiredInputString(input.environment, "environment"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "environment");

  return {
    environment: normalizeEnvironment(readObject(record.environment, "environment")),
  };
}

async function dopplerCreateEnvironment(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: "/v3/environments",
      query: {
        project: asRequiredInputString(input.project, "project"),
      },
      body: compactObject({
        name: asRequiredInputString(input.name, "name"),
        slug: asRequiredInputString(input.slug, "slug"),
        personal_configs: asOptionalBoolean(input.personalConfigs),
      }),
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "created environment");

  return {
    environment: normalizeEnvironment(readObject(record.environment, "environment")),
  };
}

async function dopplerUpdateEnvironment(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "PUT",
      path: "/v3/environments/environment",
      query: {
        project: asRequiredInputString(input.project, "project"),
        environment: asRequiredInputString(input.environment, "environment"),
      },
      body: compactObject({
        name: optionalString(input.name),
        slug: optionalString(input.slug),
        personal_configs: asOptionalBoolean(input.personalConfigs),
      }),
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "updated environment");

  return {
    environment: normalizeEnvironment(readObject(record.environment, "environment")),
  };
}

async function dopplerDeleteEnvironment(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "DELETE",
      path: "/v3/environments/environment",
      query: {
        project: asRequiredInputString(input.project, "project"),
        environment: asRequiredInputString(input.environment, "environment"),
      },
    },
    fetcher,
    "execute",
  );

  return normalizeSuccessResult(payload);
}

async function dopplerListConfigs(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/configs",
      query: {
        project: asRequiredString(input.project, "project"),
        environment: optionalString(input.environment),
        page: asOptionalNumber(input.page),
        per_page: asOptionalNumber(input.perPage),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "configs list");
  const configs = readArray(record.configs, "configs list");

  return compactObject({
    page: asOptionalNumber(record.page),
    configs: configs.map((config) => normalizeConfig(readObject(config, "config"))),
  });
}

async function dopplerGetConfig(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const config = asRequiredString(input.config, "config");
  const payload = await dopplerRequest(
    accessToken,
    {
      path: `/v3/configs/${encodeURIComponent(config)}`,
      query: {
        project: asRequiredString(input.project, "project"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "config");
  const configPayload = readObject(record.config ?? payload, "config");

  return {
    config: normalizeConfig(configPayload),
  };
}

async function dopplerCreateConfig(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: "/v3/configs",
      body: {
        project: asRequiredInputString(input.project, "project"),
        environment: asRequiredInputString(input.environment, "environment"),
        name: asRequiredInputString(input.name, "name"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "created config");

  return {
    config: normalizeConfig(readObject(record.config, "config")),
  };
}

async function dopplerUpdateConfig(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: "/v3/configs/config",
      body: {
        project: asRequiredInputString(input.project, "project"),
        config: asRequiredInputString(input.config, "config"),
        name: asRequiredInputString(input.name, "name"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "updated config");

  return {
    config: normalizeConfig(readObject(record.config, "config")),
  };
}

async function dopplerDeleteConfig(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "DELETE",
      path: "/v3/configs/config",
      query: {
        project: asRequiredInputString(input.project, "project"),
        config: asRequiredInputString(input.config, "config"),
      },
    },
    fetcher,
    "execute",
  );

  return normalizeSuccessResult(payload);
}

async function dopplerCloneConfig(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: "/v3/configs/config/clone",
      body: {
        project: asRequiredInputString(input.project, "project"),
        config: asRequiredInputString(input.config, "config"),
        name: asRequiredInputString(input.name, "name"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "cloned config");

  return {
    config: normalizeConfig(readObject(record.config, "config")),
  };
}

async function dopplerSetConfigInheritable(input: Record<string, unknown>, accessToken: string, fetcher: typeof fetch) {
  const payload = await dopplerRequest(
    accessToken,
    {
      method: "POST",
      path: "/v3/configs/config/inheritable",
      body: {
        project: asRequiredInputString(input.project, "project"),
        config: asRequiredInputString(input.config, "config"),
        inheritable: asRequiredBoolean(input.inheritable, "inheritable"),
      },
    },
    fetcher,
    "execute",
  );
  const record = readObject(payload, "config inheritable");

  return {
    success: asOptionalBoolean(record.success) ?? true,
    config: normalizeConfig(readObject(record.config, "config")),
  };
}

async function fetchCurrentToken(accessToken: string, fetcher: typeof fetch, phase: "validate" | "execute") {
  const payload = await dopplerRequest(
    accessToken,
    {
      path: "/v3/me",
    },
    fetcher,
    phase,
  );

  return readObject(payload, "current token");
}

function normalizeToken(record: Record<string, unknown>) {
  return compactObject({
    slug: optionalString(record.slug),
    name: nullableString(record.name),
    type: asRequiredString(record.type, "type"),
    createdAt: optionalString(record.created_at),
    lastSeenAt: nullableString(record.last_seen_at),
    tokenPreview: optionalString(record.token_preview),
    principal: optionalRecord(record.principal),
    workplace: optionalRecord(record.workplace),
  });
}

function normalizeProject(record: Record<string, unknown>) {
  return compactObject({
    id: optionalString(record.id),
    name: optionalString(record.name),
    slug: optionalString(record.slug),
    description: nullableString(record.description),
    createdAt: optionalString(record.created_at),
  });
}

function normalizeEnvironment(record: Record<string, unknown>) {
  return compactObject({
    id: optionalString(record.id),
    name: optionalString(record.name),
    project: optionalString(record.project),
    initialFetchAt: nullableString(record.initial_fetch_at),
    createdAt: optionalString(record.created_at),
  });
}

function normalizeConfig(record: Record<string, unknown>) {
  return compactObject({
    name: optionalString(record.name),
    slug: optionalString(record.slug),
    project: optionalString(record.project),
    environment: optionalString(record.environment),
    root: asOptionalBoolean(record.root),
    locked: asOptionalBoolean(record.locked),
    inherits: optionalStringArray(record.inherits),
    inheritedBy: optionalStringArray(record.inherited_by),
    inheriting: asOptionalBoolean(record.inheriting),
    inheritable: asOptionalBoolean(record.inheritable),
    createdAt: optionalString(record.created_at),
    initialFetchAt: nullableString(record.initial_fetch_at),
    lastFetchAt: nullableString(record.last_fetch_at),
  });
}

function normalizeSuccessResult(payload: unknown) {
  const record = optionalRecord(payload);
  return {
    success: record ? (asOptionalBoolean(record.success) ?? true) : true,
  };
}

function buildTokenLabel(record: Record<string, unknown>) {
  return (
    optionalString(record.name) ??
    extractPrincipalSlug(record.principal) ??
    optionalString(optionalRecord(record.workplace)?.name) ??
    optionalString(record.token_preview) ??
    "Doppler Token"
  );
}

function extractPrincipalSlug(value: unknown) {
  const principal = optionalRecord(value);
  return principal ? optionalString(principal.slug) : undefined;
}

function asRequiredString(value: unknown, fieldName: string) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `malformed Doppler response: ${fieldName}`);
  }
  return parsed;
}

function asRequiredInputString(value: unknown, fieldName: string) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function asRequiredBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function asOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function asOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function optionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined);
}
