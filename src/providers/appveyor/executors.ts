import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "appveyor";
const appveyorApiBaseUrl = "https://ci.appveyor.com";
const appveyorValidationPath = "/projects";

type AppveyorRequestPhase = "validate" | "execute";

interface AppveyorActionContext extends ApiKeyProviderContext {
  accountName?: string;
}

type AppveyorActionHandler = (input: Record<string, unknown>, context: AppveyorActionContext) => Promise<unknown>;

export const appveyorActionHandlers: ProviderActionHandlers<"appveyor", AppveyorActionHandler> = {
  async get_projects(input, context) {
    const projects = await appveyorGetJson({
      context,
      accountName: resolveAccountName(input, context),
      path: "/projects",
      phase: "execute",
    });

    const normalizedProjects = arrayPayload(projects);
    return {
      projects: normalizedProjects,
      count: normalizedProjects.length,
    };
  },

  async get_environments(input, context) {
    const environments = await appveyorGetJson({
      context,
      accountName: resolveAccountName(input, context),
      path: "/environments",
      phase: "execute",
    });

    const normalizedEnvironments = arrayPayload(environments);
    return {
      environments: normalizedEnvironments,
      count: normalizedEnvironments.length,
    };
  },

  async get_users(input, context) {
    const users = await appveyorGetJson({
      context,
      accountName: resolveAccountName(input, context),
      path: "/users",
      phase: "execute",
    });

    const normalizedUsers = arrayPayload(users);
    return {
      users: normalizedUsers,
      count: normalizedUsers.length,
    };
  },

  async get_roles(input, context) {
    const roles = await appveyorGetJson({
      context,
      accountName: resolveAccountName(input, context),
      path: "/roles",
      phase: "execute",
    });

    const normalizedRoles = arrayPayload(roles);
    return {
      roles: normalizedRoles,
      count: normalizedRoles.length,
    };
  },

  async get_role(input, context) {
    const role = await appveyorGetJson({
      context,
      accountName: resolveAccountName(input, context),
      path: `/roles/${encodeURIComponent(requirePositiveInteger(input.roleId, "roleId"))}`,
      phase: "execute",
    });

    return {
      role: objectPayload(role),
    };
  },

  async get_build_artifacts(input, context) {
    const artifacts = await appveyorGetJson({
      context,
      accountName: resolveAccountName(input, context),
      path: `/buildjobs/${encodeURIComponent(requiredString(input.jobId, "jobId", providerInputError))}/artifacts`,
      phase: "execute",
    });

    const normalizedArtifacts = arrayPayload(artifacts);
    return {
      artifacts: normalizedArtifacts,
      count: normalizedArtifacts.length,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AppveyorActionContext>({
  service,
  handlers: appveyorActionHandlers,
  async createContext(context, fetcher): Promise<AppveyorActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      accountName: readOptionalNonEmptyString(credential.values.accountName),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const accountName = readOptionalNonEmptyString(input.values.accountName);
    const payload = await appveyorGetJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      accountName,
      path: appveyorValidationPath,
      phase: "validate",
    });
    const projects = arrayPayload(payload);
    const firstProject = optionalRecord(projects[0]);
    const resolvedAccountName = accountName ?? optionalString(firstProject?.accountName);

    return {
      profile: {
        accountId: resolvedAccountName,
        displayName: resolvedAccountName ? `AppVeyor ${resolvedAccountName}` : "AppVeyor API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: appveyorApiBaseUrl,
        validationEndpoint: buildAppveyorApiPath(appveyorValidationPath, accountName),
        accountName: resolvedAccountName,
        projectCount: projects.length,
      }),
    };
  },
};

async function appveyorGetJson(input: {
  context: Pick<AppveyorActionContext, "apiKey" | "fetcher" | "signal">;
  accountName?: string;
  path: string;
  phase: AppveyorRequestPhase;
}): Promise<unknown> {
  let response: Response;
  try {
    response = await input.context.fetcher(
      new URL(buildAppveyorApiPath(input.path, input.accountName), appveyorApiBaseUrl),
      {
        method: "GET",
        headers: appveyorHeaders(input.context.apiKey),
        signal: input.context.signal,
      },
    );
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `appveyor request failed: ${error.message}` : "appveyor request failed",
    );
  }

  const payload = await readAppveyorPayload(response);
  if (!response.ok) {
    throw createAppveyorError(response, payload, input.phase);
  }

  return payload;
}

function buildAppveyorApiPath(path: string, accountName?: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedAccountName = readOptionalNonEmptyString(accountName);
  if (!normalizedAccountName) {
    return `/api${normalizedPath}`;
  }

  return `/api/account/${encodeURIComponent(normalizedAccountName)}${normalizedPath}`;
}

function appveyorHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function readAppveyorPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createAppveyorError(response: Response, payload: unknown, phase: AppveyorRequestPhase): ProviderRequestError {
  const message = extractAppveyorErrorMessage(payload) ?? response.statusText ?? "appveyor request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && [400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractAppveyorErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.Message) ??
    optionalString(record.error) ??
    optionalString(record.Error)
  );
}

function resolveAccountName(input: Record<string, unknown>, context: AppveyorActionContext): string | undefined {
  return readOptionalNonEmptyString(input.accountName) ?? context.accountName;
}

function arrayPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => objectPayload(item));
  }

  const record = optionalRecord(payload);
  if (!record) {
    return [];
  }

  for (const key of ["projects", "environments", "users", "roles", "artifacts"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.map((item) => objectPayload(item));
    }
  }

  return [];
}

function objectPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "appveyor returned a non-object response", payload);
  }

  return record;
}

function requirePositiveInteger(value: unknown, fieldName: string): string {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }

  return String(value);
}

function readOptionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
