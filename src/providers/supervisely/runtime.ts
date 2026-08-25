import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, nullableInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const superviselyApiBaseUrl = "https://app.supervisely.com/public/api/v3";

type SuperviselyMode = "validate" | "execute";
type SuperviselyActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const superviselyActionHandlers: ProviderActionHandlers<"supervisely", SuperviselyActionHandler> = {
  async get_current_user(_input, context) {
    const user = requireRecord(
      await requestSupervisely(context.apiKey, "users.me", {}, context.fetcher, "execute", context.signal),
      "Supervisely user response",
    );
    return { user, raw: user };
  },
  async list_teams(input, context) {
    return normalizeListResponse(
      await requestSupervisely(
        context.apiKey,
        "teams.list",
        buildCommonListBody(input),
        context.fetcher,
        "execute",
        context.signal,
      ),
    );
  },
  async list_workspaces(input, context) {
    return normalizeListResponse(
      await requestSupervisely(
        context.apiKey,
        "workspaces.list",
        buildCommonListBody(input, { teamId: input.teamId }),
        context.fetcher,
        "execute",
        context.signal,
      ),
    );
  },
  async list_projects(input, context) {
    return normalizeListResponse(
      await requestSupervisely(
        context.apiKey,
        "projects.list",
        buildCommonListBody(input, { workspaceId: input.workspaceId }),
        context.fetcher,
        "execute",
        context.signal,
      ),
    );
  },
  async get_project(input, context) {
    const project = requireRecord(
      await requestSupervisely(
        context.apiKey,
        "projects.info",
        { id: input.id },
        context.fetcher,
        "execute",
        context.signal,
      ),
      "Supervisely project response",
    );
    return { project, raw: project };
  },
  async list_datasets(input, context) {
    return normalizeListResponse(
      await requestSupervisely(
        context.apiKey,
        "datasets.list",
        buildCommonListBody(input, { projectId: input.projectId }),
        context.fetcher,
        "execute",
        context.signal,
      ),
    );
  },
  async get_dataset(input, context) {
    const dataset = requireRecord(
      await requestSupervisely(
        context.apiKey,
        "datasets.info",
        { id: input.id },
        context.fetcher,
        "execute",
        context.signal,
      ),
      "Supervisely dataset response",
    );
    return { dataset, raw: dataset };
  },
};

export async function validateSuperviselyCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = requireRecord(
    await requestSupervisely(input.apiKey, "users.me", {}, fetcher, "validate", signal),
    "Supervisely user response",
  );
  const userId = readOptionalNumberOrString(user.id);
  const login = optionalString(user.login);
  const email = optionalString(user.email);
  const name = optionalString(user.name) ?? optionalString(user.fullName);

  return {
    profile: {
      accountId: userId,
      displayName: email ?? login ?? name ?? "Supervisely API Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: superviselyApiBaseUrl,
      validationEndpoint: "/users.me",
      userId,
      login,
      email,
      name,
    },
  };
}

function buildCommonListBody(
  input: Record<string, unknown>,
  requiredFields: Record<string, unknown> = {},
): Record<string, unknown> {
  return compactObject({
    ...requiredFields,
    page: input.page,
    per_page: input.perPage,
    sort: input.sort,
    sort_order: input.sortOrder,
    filter: input.filter,
    pagination_mode: input.paginationMode,
    after: input.after,
  });
}

async function requestSupervisely(
  apiKey: string,
  method: string,
  body: Record<string, unknown>,
  fetcher: typeof fetch,
  mode: SuperviselyMode,
  signal?: AbortSignal,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(new URL(`${superviselyApiBaseUrl}/${method}`), {
      method: "POST",
      headers: superviselyHeaders(apiKey),
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Supervisely request failed: ${error.message}` : "Supervisely request failed",
    );
  }

  if (!response.ok) {
    throw await createSuperviselyError(response, mode);
  }
  return readSuperviselyJson(response, "invalid Supervisely response");
}

function superviselyHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

async function createSuperviselyError(response: Response, mode: SuperviselyMode): Promise<ProviderRequestError> {
  const message = await readSuperviselyErrorMessage(response);
  if (response.status === 429) return new ProviderRequestError(429, message);
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : response.status, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

async function readSuperviselyJson(response: Response, message: string): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, message);
  }
}

async function readSuperviselyErrorMessage(response: Response): Promise<string> {
  const fallback = `Supervisely request failed with ${response.status}`;
  const text = await response.text();
  if (!text.trim()) return fallback;
  let record: Record<string, unknown> | undefined;
  try {
    record = optionalRecord(JSON.parse(text));
  } catch {
    return text.trim();
  }
  const firstDetail = Array.isArray(record?.details) ? optionalRecord(record.details[0]) : undefined;
  return (
    optionalString(firstDetail?.message) ?? optionalString(record?.message) ?? optionalString(record?.error) ?? fallback
  );
}

function normalizeListResponse(payload: unknown): Record<string, unknown> {
  const record = requireRecord(payload, "Supervisely list response");
  return {
    total: nullableInteger(record.total) ?? null,
    perPage: nullableInteger(record.perPage) ?? null,
    pagesCount: nullableInteger(record.pagesCount) ?? null,
    items: Array.isArray(record.entities) ? record.entities : [],
    raw: record,
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `invalid ${label}`);
  return record;
}

function readOptionalNumberOrString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return optionalString(value);
}
