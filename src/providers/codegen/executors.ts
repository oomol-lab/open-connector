import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "codegen";
const codegenApiBaseUrl = "https://api.codegen.com";
const codegenValidationPath = "/v1/users/me";
const codegenDefaultRequestTimeoutMs = 30_000;

type CodegenPhase = "validate" | "execute";
type CodegenActionContext = ApiKeyProviderContext & {
  organizationId?: string;
  metadata: Record<string, unknown>;
};
type CodegenActionHandler = (input: Record<string, unknown>, context: CodegenActionContext) => Promise<unknown>;

export const codegenActionHandlers: ProviderActionHandlers<"codegen", CodegenActionHandler> = {
  async get_current_user(_input, context) {
    const user = await requestCodegenJson({
      apiKey: context.apiKey,
      method: "GET",
      path: "/v1/users/me",
      phase: "execute",
      context,
    });
    return {
      user: requireProviderObject(user, "Codegen current user response"),
    };
  },
  async list_organizations(input, context) {
    const payload = await requestCodegenJson({
      apiKey: context.apiKey,
      method: "GET",
      path: buildPathWithQuery("/v1/organizations", input, ["skip", "limit"]),
      phase: "execute",
      context,
    });
    return normalizePage(payload, "organizations", "Codegen organizations response");
  },
  async list_repositories(input, context) {
    const orgId = resolveOrganizationId(input, context);
    const payload = await requestCodegenJson({
      apiKey: context.apiKey,
      method: "GET",
      path: buildPathWithQuery(`/v1/organizations/${orgId}/repos`, input, ["skip", "limit"]),
      phase: "execute",
      context,
    });
    return normalizePage(payload, "repositories", "Codegen repositories response");
  },
  async list_users(input, context) {
    const orgId = resolveOrganizationId(input, context);
    const payload = await requestCodegenJson({
      apiKey: context.apiKey,
      method: "GET",
      path: buildPathWithQuery(`/v1/organizations/${orgId}/users`, input, ["skip", "limit"]),
      phase: "execute",
      context,
    });
    return normalizePage(payload, "users", "Codegen users response");
  },
  async list_agent_runs(input, context) {
    const orgId = resolveOrganizationId(input, context);
    const payload = await requestCodegenJson({
      apiKey: context.apiKey,
      method: "GET",
      path: buildPathWithQuery(`/v1/organizations/${orgId}/agent/runs`, input, [
        "user_id",
        "source_type",
        "skip",
        "limit",
      ]),
      phase: "execute",
      context,
    });
    return normalizePage(payload, "agent_runs", "Codegen agent runs response");
  },
  async get_agent_run(input, context) {
    const orgId = resolveOrganizationId(input, context);
    const agentRunId = readRequiredPositiveInteger(input.agent_run_id, "agent_run_id");
    const payload = await requestCodegenJson({
      apiKey: context.apiKey,
      method: "GET",
      path: `/v1/organizations/${orgId}/agent/run/${agentRunId}`,
      phase: "execute",
      context,
    });
    return {
      agent_run: requireProviderObject(payload, "Codegen agent run response"),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<CodegenActionContext>({
  service,
  handlers: codegenActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CodegenActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const providerContext: CodegenActionContext = {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      organizationId:
        optionalString(credential.metadata.organizationId) ?? optionalString(credential.values.organizationId),
      metadata: credential.metadata,
    };
    if (context.transitFiles) {
      providerContext.transitFiles = context.transitFiles;
    }
    return providerContext;
  },
  fallbackMessage: "Codegen request failed",
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiKey = input.apiKey;
    const organizationId = readRequiredPositiveInteger(input.values.organizationId, "organizationId");
    const context: ApiKeyProviderContext = { apiKey, fetcher, signal };
    const userPayload = await requestCodegenJson({
      apiKey,
      method: "GET",
      path: codegenValidationPath,
      phase: "validate",
      context,
    });
    const organizationsPayload = await requestCodegenJson({
      apiKey,
      method: "GET",
      path: "/v1/organizations?limit=100",
      phase: "validate",
      context,
    });

    const user = requireProviderObject(userPayload, "Codegen current user response");
    const organization = await findCodegenOrganization({
      apiKey,
      organizationId,
      firstPagePayload: organizationsPayload,
      context,
    });
    if (!organization) {
      throw new ProviderRequestError(400, "organizationId is not available for this Codegen API token");
    }

    const organizationName = optionalString(organization.name) ?? String(organizationId);
    const userId = optionalInteger(user.id);
    const githubUsername = optionalString(user.github_username);

    return {
      profile: {
        accountId: String(organizationId),
        displayName: `Codegen (${organizationName})`,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: codegenApiBaseUrl,
        organizationId: String(organizationId),
        organizationName,
        userId,
        githubUsername,
        validationEndpoint: codegenValidationPath,
      },
    };
  },
};

async function findCodegenOrganization(input: {
  apiKey: string;
  organizationId: number;
  firstPagePayload: unknown;
  context: ApiKeyProviderContext;
}): Promise<Record<string, unknown> | undefined> {
  const pageLimit = 100;
  const firstPage = readOrganizationPage(input.firstPagePayload);
  const firstPageMatch = firstPage.items.find((item) => optionalInteger(item.id) === input.organizationId);
  if (firstPageMatch || firstPage.items.length >= firstPage.total) {
    return firstPageMatch;
  }

  for (let skip = pageLimit; skip < firstPage.total; skip += pageLimit) {
    const payload = await requestCodegenJson({
      apiKey: input.apiKey,
      method: "GET",
      path: `/v1/organizations?limit=${pageLimit}&skip=${skip}`,
      phase: "validate",
      context: input.context,
    });
    const page = readOrganizationPage(payload);
    const organization = page.items.find((item) => optionalInteger(item.id) === input.organizationId);
    if (organization || page.items.length === 0) {
      return organization;
    }
  }

  return undefined;
}

function readOrganizationPage(payload: unknown): { items: Array<Record<string, unknown>>; total: number } {
  const label = "Codegen organizations response";
  const body = requireProviderObject(payload, label);
  return {
    items: readPageItems(body, label),
    total: readRequiredInteger(body.total, `${label} total`),
  };
}

async function requestCodegenJson(input: {
  apiKey: string;
  method: "GET";
  path: string;
  phase: CodegenPhase;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, codegenDefaultRequestTimeoutMs);

  try {
    const response = await input.context.fetcher(new URL(input.path, codegenApiBaseUrl), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readCodegenPayload(response);

    if (!response.ok) {
      throw createCodegenError(response.status, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Codegen request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Codegen request failed: ${error.message}` : "Codegen request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildPathWithQuery(path: string, input: Record<string, unknown>, allowedParams: readonly string[]): string {
  const url = new URL(path, codegenApiBaseUrl);
  for (const key of allowedParams) {
    const value = input[key];
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

function normalizePage(payload: unknown, itemKey: string, label: string): Record<string, unknown> {
  const body = requireProviderObject(payload, label);
  return {
    [itemKey]: readPageItems(body, label),
    pagination: {
      total: readRequiredInteger(body.total, `${label} total`),
      page: readRequiredInteger(body.page, `${label} page`),
      size: readRequiredInteger(body.size, `${label} size`),
      pages: readRequiredInteger(body.pages, `${label} pages`),
    },
  };
}

function readPageItems(payload: unknown, label: string): Array<Record<string, unknown>> {
  const body = requireProviderObject(payload, label);
  if (!Array.isArray(body.items)) {
    throw new ProviderRequestError(502, `${label} items is invalid`);
  }
  return body.items.map((item, index) => requireProviderObject(item, `${label} item ${index + 1}`));
}

async function readCodegenPayload(response: Response): Promise<unknown> {
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

function createCodegenError(status: number, payload: unknown, phase: CodegenPhase): ProviderRequestError {
  const message = extractCodegenErrorMessage(payload) ?? `Codegen request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractCodegenErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const message = optionalString(body.message);
  if (message) {
    return message;
  }

  const detail = body.detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => optionalString(optionalRecord(item)?.msg))
      .filter((item): item is string => Boolean(item));
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  return optionalString(body.error);
}

function resolveOrganizationId(input: Record<string, unknown>, context: CodegenActionContext): number {
  return readRequiredPositiveInteger(
    input.org_id ?? context.metadata.organizationId ?? context.organizationId,
    "org_id",
  );
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${fieldName} is invalid`);
  }
  return value;
}

function requireProviderObject(value: unknown, label: string): Record<string, unknown> {
  return requiredRecord(value, label, (message) => new ProviderRequestError(502, message));
}
