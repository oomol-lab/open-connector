import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../../core/types.ts";
import type { HarvestActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { harvestOAuthScopes } from "./scopes.ts";

const service = "harvest";
const harvestApiBaseUrl = "https://api.harvestapp.com";
const harvestAccountsUrl = "https://id.getharvest.com/api/v2/accounts";
const harvestValidationPath = "/v2/users/me";
const harvestRequestTimeoutMs = 30_000;

type HarvestRequestMode = "validate" | "execute";
type HarvestActionHandler = (input: Record<string, unknown>, context: HarvestActionContext) => Promise<unknown>;

interface HarvestActionContext {
  accessToken: string;
  accountId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface HarvestRequestOptions {
  accountId: string;
  accessToken: string;
  path: string;
  fetcher: typeof fetch;
  mode: HarvestRequestMode;
  signal?: AbortSignal;
  method?: string;
  query?: URLSearchParams;
  body?: unknown;
}

interface HarvestLinks {
  first: string | null;
  next: string | null;
  previous: string | null;
  last: string | null;
}

interface HarvestPagination {
  per_page: number;
  total_pages: number;
  total_entries: number;
  next_page: number | null;
  previous_page: number | null;
  page: number;
  links?: HarvestLinks;
}

export const harvestActionHandlers: Record<HarvestActionName, HarvestActionHandler> = {
  get_current_user(_input, context) {
    return getCurrentUser(context);
  },
  list_clients(input, context) {
    return listClients(input, context);
  },
  get_client(input, context) {
    return getClient(input, context);
  },
  list_projects(input, context) {
    return listProjects(input, context);
  },
  get_project(input, context) {
    return getProject(input, context);
  },
  list_tasks(input, context) {
    return listTasks(input, context);
  },
  get_task(input, context) {
    return getTask(input, context);
  },
  list_project_task_assignments(input, context) {
    return listProjectTaskAssignments(input, context);
  },
  list_time_entries(input, context) {
    return listTimeEntries(input, context);
  },
  get_time_entry(input, context) {
    return getTimeEntry(input, context);
  },
  create_time_entry(input, context) {
    return createTimeEntry(input, context);
  },
  update_time_entry(input, context) {
    return updateTimeEntry(input, context);
  },
  restart_time_entry(input, context) {
    return restartTimeEntry(input, context);
  },
  stop_time_entry(input, context) {
    return stopTimeEntry(input, context);
  },
  delete_time_entry(input, context) {
    return deleteTimeEntry(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<HarvestActionContext>({
  service,
  handlers: harvestActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<HarvestActionContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType === "api_key") {
      return {
        accessToken: credential.apiKey,
        accountId: requireHarvestAccountId(credential.values.accountId ?? credential.metadata.accountId),
        fetcher,
        signal: context.signal,
      };
    }
    if (credential?.authType === "oauth2") {
      return {
        accessToken: credential.accessToken,
        accountId: requireHarvestAccountId(credential.metadata.accountId),
        fetcher,
        signal: context.signal,
      };
    }

    throw new ProviderRequestError(401, "Configure Harvest OAuth or API key credentials first.");
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await context.getCredential(service);
    const auth = readHarvestProxyAuth(credential);
    const url = createProviderProxyUrl(harvestApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Bearer ${auth.accessToken}`);
    headers.set("harvest-account-id", auth.accountId);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw createHarvestError(response.status, parseHarvestPayload(text), text);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "harvest request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const accountId = requireHarvestAccountId(input.values.accountId);
    const payload = await requestHarvestJson<Record<string, unknown>>({
      accountId,
      accessToken: input.apiKey,
      path: harvestValidationPath,
      fetcher,
      signal,
      mode: "validate",
    });

    return harvestCredentialValidation(accountId, payload);
  },
  async oauth2(input, { fetcher, signal }) {
    const accountProfile = await fetchHarvestCurrentAccount(input, fetcher, signal);
    return {
      profile: {
        accountId: accountProfile.userId,
        displayName: accountProfile.accountLabel,
      },
      grantedScopes: mapHarvestGrantedScopes(normalizeHarvestProviderScopes(input.metadata.scope, harvestOAuthScopes)),
      metadata: accountProfile.metadata,
    };
  },
};

function readHarvestProxyAuth(credential: ResolvedCredential | undefined): { accessToken: string; accountId: string } {
  if (credential?.authType === "api_key") {
    return {
      accessToken: credential.apiKey,
      accountId: requireHarvestAccountId(credential.values.accountId ?? credential.metadata.accountId),
    };
  }
  if (credential?.authType === "oauth2") {
    return {
      accessToken: credential.accessToken,
      accountId: requireHarvestAccountId(credential.metadata.accountId),
    };
  }

  throw new ProviderRequestError(401, "Configure Harvest OAuth or API key credentials first.");
}

async function getCurrentUser(context: HarvestActionContext): Promise<unknown> {
  const payload = await requestHarvestJson<Record<string, unknown>>({
    ...context,
    path: harvestValidationPath,
    mode: "execute",
  });

  return {
    user: requireObjectPayload(payload, "harvest current user response"),
  };
}

async function listClients(input: Record<string, unknown>, context: HarvestActionContext): Promise<unknown> {
  const payload = await requestHarvestJson<Record<string, unknown>>({
    ...context,
    path: "/v2/clients",
    query: buildQueryParams({
      is_active: optionalBoolean(input.isActive),
      updated_since: optionalString(input.updatedSince),
      page: optionalInteger(input.page),
      per_page: optionalInteger(input.perPage),
    }),
    mode: "execute",
  });

  return {
    clients: requireNamedArray(payload, "clients", "harvest clients list response"),
    pagination: extractPagination(payload),
  };
}

async function getClient(input: Record<string, unknown>, context: HarvestActionContext): Promise<unknown> {
  const clientId = requireHarvestId(input.clientId, "clientId");
  const payload = await requestHarvestJson<Record<string, unknown>>({
    ...context,
    path: `/v2/clients/${clientId}`,
    mode: "execute",
  });

  return {
    client: requireObjectPayload(payload, "harvest client response"),
  };
}

async function listProjects(input: Record<string, unknown>, context: HarvestActionContext): Promise<unknown> {
  const payload = await requestHarvestJson<Record<string, unknown>>({
    ...context,
    path: "/v2/projects",
    query: buildQueryParams({
      is_active: optionalBoolean(input.isActive),
      client_id: optionalInteger(input.clientId),
      updated_since: optionalString(input.updatedSince),
      page: optionalInteger(input.page),
      per_page: optionalInteger(input.perPage),
    }),
    mode: "execute",
  });

  return {
    projects: requireNamedArray(payload, "projects", "harvest projects list response"),
    pagination: extractPagination(payload),
  };
}

async function getProject(input: Record<string, unknown>, context: HarvestActionContext): Promise<unknown> {
  const projectId = requireHarvestId(input.projectId, "projectId");
  const payload = await requestHarvestJson<Record<string, unknown>>({
    ...context,
    path: `/v2/projects/${projectId}`,
    mode: "execute",
  });

  return {
    project: requireObjectPayload(payload, "harvest project response"),
  };
}

async function listTasks(input: Record<string, unknown>, context: HarvestActionContext): Promise<unknown> {
  const payload = await requestHarvestJson<Record<string, unknown>>({
    ...context,
    path: "/v2/tasks",
    query: buildQueryParams({
      is_active: optionalBoolean(input.isActive),
      updated_since: optionalString(input.updatedSince),
      page: optionalInteger(input.page),
      per_page: optionalInteger(input.perPage),
    }),
    mode: "execute",
  });

  return {
    tasks: requireNamedArray(payload, "tasks", "harvest tasks list response"),
    pagination: extractPagination(payload),
  };
}

async function getTask(input: Record<string, unknown>, context: HarvestActionContext): Promise<unknown> {
  const taskId = requireHarvestId(input.taskId, "taskId");
  const payload = await requestHarvestJson<Record<string, unknown>>({
    ...context,
    path: `/v2/tasks/${taskId}`,
    mode: "execute",
  });

  return {
    task: requireObjectPayload(payload, "harvest task response"),
  };
}

async function listProjectTaskAssignments(
  input: Record<string, unknown>,
  context: HarvestActionContext,
): Promise<unknown> {
  const projectId = requireHarvestId(input.projectId, "projectId");
  const payload = await requestHarvestJson<Record<string, unknown>>({
    ...context,
    path: `/v2/projects/${projectId}/task_assignments`,
    query: buildQueryParams({
      is_active: optionalBoolean(input.isActive),
      updated_since: optionalString(input.updatedSince),
      page: optionalInteger(input.page),
      per_page: optionalInteger(input.perPage),
    }),
    mode: "execute",
  });

  return {
    task_assignments: requireNamedArray(payload, "task_assignments", "harvest project task assignments response"),
    pagination: extractPagination(payload),
  };
}

async function listTimeEntries(input: Record<string, unknown>, context: HarvestActionContext): Promise<unknown> {
  assertDateRange(input);
  const payload = await requestHarvestJson<Record<string, unknown>>({
    ...context,
    path: "/v2/time_entries",
    query: buildQueryParams({
      user_id: optionalInteger(input.userId),
      client_id: optionalInteger(input.clientId),
      project_id: optionalInteger(input.projectId),
      task_id: optionalInteger(input.taskId),
      from: optionalString(input.from),
      to: optionalString(input.to),
      is_running: optionalBoolean(input.isRunning),
      updated_since: optionalString(input.updatedSince),
      page: optionalInteger(input.page),
      per_page: optionalInteger(input.perPage),
    }),
    mode: "execute",
  });

  return {
    time_entries: requireNamedArray(payload, "time_entries", "harvest time entries list response"),
    pagination: extractPagination(payload),
  };
}

async function getTimeEntry(input: Record<string, unknown>, context: HarvestActionContext): Promise<unknown> {
  const timeEntryId = requireHarvestId(input.timeEntryId, "timeEntryId");
  const payload = await requestHarvestJson<Record<string, unknown>>({
    ...context,
    path: `/v2/time_entries/${timeEntryId}`,
    mode: "execute",
  });

  return {
    time_entry: requireObjectPayload(payload, "harvest time entry response"),
  };
}

async function createTimeEntry(input: Record<string, unknown>, context: HarvestActionContext): Promise<unknown> {
  assertDurationMode(input);
  const payload = await requestHarvestJson<Record<string, unknown>>({
    ...context,
    path: "/v2/time_entries",
    method: "POST",
    body: buildCreateTimeEntryBody(input),
    mode: "execute",
  });

  return {
    time_entry: requireObjectPayload(payload, "harvest time entry creation response"),
  };
}

async function updateTimeEntry(input: Record<string, unknown>, context: HarvestActionContext): Promise<unknown> {
  assertDurationMode(input);
  assertHasTimeEntryUpdate(input);
  const timeEntryId = requireHarvestId(input.timeEntryId, "timeEntryId");
  const payload = await requestHarvestJson<Record<string, unknown>>({
    ...context,
    path: `/v2/time_entries/${timeEntryId}`,
    method: "PATCH",
    body: buildUpdateTimeEntryBody(input),
    mode: "execute",
  });

  return {
    time_entry: requireObjectPayload(payload, "harvest time entry update response"),
  };
}

async function restartTimeEntry(input: Record<string, unknown>, context: HarvestActionContext): Promise<unknown> {
  const timeEntryId = requireHarvestId(input.timeEntryId, "timeEntryId");
  const payload = await requestHarvestJson<Record<string, unknown>>({
    ...context,
    path: `/v2/time_entries/${timeEntryId}/restart`,
    method: "PATCH",
    mode: "execute",
  });

  return {
    time_entry: requireObjectPayload(payload, "harvest restarted time entry response"),
  };
}

async function stopTimeEntry(input: Record<string, unknown>, context: HarvestActionContext): Promise<unknown> {
  const timeEntryId = requireHarvestId(input.timeEntryId, "timeEntryId");
  const payload = await requestHarvestJson<Record<string, unknown>>({
    ...context,
    path: `/v2/time_entries/${timeEntryId}/stop`,
    method: "PATCH",
    mode: "execute",
  });

  return {
    time_entry: requireObjectPayload(payload, "harvest stopped time entry response"),
  };
}

async function deleteTimeEntry(input: Record<string, unknown>, context: HarvestActionContext): Promise<unknown> {
  const timeEntryId = requireHarvestId(input.timeEntryId, "timeEntryId");
  await requestHarvest({
    ...context,
    path: `/v2/time_entries/${timeEntryId}`,
    method: "DELETE",
    mode: "execute",
  });

  return {
    deleted: true,
  };
}

function buildCreateTimeEntryBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    user_id: optionalInteger(input.userId),
    project_id: requireHarvestId(input.projectId, "projectId"),
    task_id: requireHarvestId(input.taskId, "taskId"),
    spent_date: requireHarvestString(input.spentDate, "spentDate"),
    hours: typeof input.hours === "number" ? input.hours : undefined,
    started_time: optionalString(input.startedTime),
    ended_time: optionalString(input.endedTime),
    notes: input.notes === undefined ? undefined : String(input.notes),
    external_reference: optionalRecord(input.externalReference),
  });
}

function buildUpdateTimeEntryBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    project_id: optionalInteger(input.projectId),
    task_id: optionalInteger(input.taskId),
    spent_date: optionalString(input.spentDate),
    hours: typeof input.hours === "number" ? input.hours : undefined,
    started_time: optionalString(input.startedTime),
    ended_time: optionalString(input.endedTime),
    notes: input.notes === undefined ? undefined : String(input.notes),
    external_reference: optionalRecord(input.externalReference),
  });
}

async function requestHarvestJson<T>(input: HarvestRequestOptions): Promise<T> {
  const response = await requestHarvest(input);
  return response.payload as T;
}

async function requestHarvest(input: HarvestRequestOptions): Promise<{ payload: unknown; text: string }> {
  const url = new URL(input.path, harvestApiBaseUrl);
  if (input.query) {
    url.search = input.query.toString();
  }

  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${input.accessToken}`,
    "Harvest-Account-Id": input.accountId,
    "User-Agent": providerUserAgent,
  });

  let body: string | undefined;
  if (input.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(input.body);
  }

  const timeoutSignal = AbortSignal.timeout(harvestRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body,
      signal,
    });
    const text = await response.text();
    const payload = parseHarvestPayload(text);

    if (!response.ok) {
      throw createHarvestError(response.status, payload, text);
    }

    return {
      payload,
      text,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "harvest request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `harvest request failed: ${error.message}` : "harvest request failed",
    );
  }
}

async function fetchHarvestCurrentAccount(
  credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  userId: string;
  accountLabel: string;
  metadata: Record<string, unknown>;
}> {
  const accountsPayload = await requestHarvestAccounts(credential.accessToken, fetcher, signal);
  const accountsResponse = requireObjectPayload(accountsPayload, "harvest accounts response");
  const accounts = readHarvestAccounts(accountsResponse);
  const defaultAccount = selectDefaultHarvestAccount(accounts);
  const accountId = requireHarvestResponseAccountId(defaultAccount.id);
  const payload = await requestHarvestJson<Record<string, unknown>>({
    accountId,
    accessToken: credential.accessToken,
    path: harvestValidationPath,
    fetcher,
    signal,
    mode: "validate",
  });

  const user = requireObjectPayload(payload, "harvest current user response");
  const accountUser = optionalRecord(accountsResponse.user);
  const userId = String(requireHarvestResponseId(user.id ?? accountUser?.id, "user.id"));
  const firstName = optionalString(user.first_name) ?? optionalString(accountUser?.first_name);
  const lastName = optionalString(user.last_name) ?? optionalString(accountUser?.last_name);
  const email = optionalString(user.email) ?? optionalString(accountUser?.email);
  const accountLabel = [firstName, lastName].filter(Boolean).join(" ").trim() || email || "Harvest User";

  return {
    userId,
    accountLabel,
    metadata: compactObject({
      apiBaseUrl: harvestApiBaseUrl,
      accountId,
      defaultAccountId: accountId,
      validationEndpoint: harvestValidationPath,
      userId: Number(userId),
      firstName,
      lastName,
      email,
      timezone: optionalString(user.timezone),
      accounts: accounts.map((account) =>
        compactObject({
          id: requireHarvestResponseAccountId(account.id),
          name: optionalString(account.name) ?? requireHarvestResponseAccountId(account.id),
          product: optionalString(account.product),
          isActive: typeof account.is_active === "boolean" ? account.is_active : undefined,
        }),
      ),
    }),
  };
}

async function requestHarvestAccounts(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(harvestRequestTimeoutMs);
  const resolvedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await fetcher(harvestAccountsUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": providerUserAgent,
      },
      signal: resolvedSignal,
    });
    const text = await response.text();
    const payload = parseHarvestPayload(text);
    if (!response.ok) {
      throw createHarvestError(response.status, payload, text);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "harvest account discovery timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `harvest account discovery failed: ${error.message}`
        : "harvest account discovery failed",
    );
  }
}

function harvestCredentialValidation(
  accountId: string,
  payload: Record<string, unknown>,
): Awaited<ReturnType<NonNullable<CredentialValidators["apiKey"]>>> {
  const user = requireObjectPayload(payload, "harvest current user response");
  const userId = requireHarvestResponseId(user.id, "user.id");
  const firstName = optionalString(user.first_name);
  const lastName = optionalString(user.last_name);
  const email = optionalString(user.email);
  const accountLabel = [firstName, lastName].filter(Boolean).join(" ").trim() || email || "Harvest User";

  return {
    profile: {
      accountId: String(userId),
      displayName: accountLabel,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: harvestApiBaseUrl,
      accountId,
      validationEndpoint: harvestValidationPath,
      userId,
      firstName,
      lastName,
      email,
      timezone: optionalString(user.timezone),
    }),
  };
}

function createHarvestError(status: number, payload: unknown, text: string): ProviderRequestError {
  const message = extractHarvestErrorMessage(payload) ?? (text || `harvest request failed with status ${status}`);
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, { status, payload });
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function readHarvestAccounts(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(payload.accounts)) {
    throw new ProviderRequestError(502, "harvest accounts response is missing accounts");
  }

  const accounts = payload.accounts
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item != null)
    .filter((item) => {
      const product = optionalString(item.product);
      return product == null || product === "harvest";
    });

  if (accounts.length === 0) {
    throw new ProviderRequestError(502, "harvest oauth account list is empty");
  }

  return accounts;
}

function selectDefaultHarvestAccount(accounts: Array<Record<string, unknown>>): Record<string, unknown> {
  const selected =
    accounts.find((account) => typeof account.is_default === "boolean" && account.is_default) ??
    accounts.find((account) => typeof account.is_active === "boolean" && account.is_active) ??
    accounts[0];
  if (!selected) {
    throw new ProviderRequestError(502, "harvest oauth account list is empty");
  }
  return selected;
}

function normalizeHarvestProviderScopes(value: unknown, fallback: string[]): string[] {
  if (value == null || value === "") {
    return [...fallback];
  }
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, "scope must be a non-empty string");
  }

  return [
    ...new Set(
      value
        .replaceAll(",", " ")
        .split(" ")
        .map((scope) => scope.trim())
        .filter(Boolean),
    ),
  ];
}

function mapHarvestGrantedScopes(providerScopes: string[]): string[] {
  const hasHarvestAccess = providerScopes.some(
    (scope) => scope === "all" || scope === "harvest:all" || scope.startsWith("harvest:"),
  );

  return hasHarvestAccess ? ["harvest.read", "harvest.write"] : [];
}

function parseHarvestPayload(text: string): unknown {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function buildQueryParams(input: Record<string, string | number | boolean | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  return params;
}

function extractPagination(payload: Record<string, unknown>): HarvestPagination {
  const linksObject = optionalRecord(payload.links);
  const links = linksObject
    ? {
        first: linksObject.first == null ? null : requireHarvestResponseString(linksObject.first, "links.first"),
        next: linksObject.next == null ? null : requireHarvestResponseString(linksObject.next, "links.next"),
        previous:
          linksObject.previous == null ? null : requireHarvestResponseString(linksObject.previous, "links.previous"),
        last: linksObject.last == null ? null : requireHarvestResponseString(linksObject.last, "links.last"),
      }
    : undefined;

  return compactObject({
    per_page: requireHarvestResponsePositiveInteger(payload.per_page, "per_page"),
    total_pages: requireHarvestResponsePositiveInteger(payload.total_pages, "total_pages"),
    total_entries: requireHarvestResponseNonNegativeInteger(payload.total_entries, "total_entries"),
    next_page: payload.next_page == null ? null : requireHarvestResponsePositiveInteger(payload.next_page, "next_page"),
    previous_page:
      payload.previous_page == null
        ? null
        : requireHarvestResponsePositiveInteger(payload.previous_page, "previous_page"),
    page: requireHarvestResponsePositiveInteger(payload.page, "page"),
    links,
  }) as HarvestPagination;
}

function requireNamedArray(payload: Record<string, unknown>, key: string, label: string): unknown[] {
  const value = payload[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} is missing ${key}`);
  }
  return value;
}

function requireObjectPayload(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}

function requireHarvestAccountId(value: unknown): string {
  return String(requireHarvestPositiveInteger(value, "accountId"));
}

function requireHarvestId(value: unknown, fieldName: string): number {
  return requireHarvestPositiveInteger(value, fieldName);
}

function requireHarvestString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  }
  return parsed;
}

function requireHarvestPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function requireHarvestResponseString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `${fieldName} must be a non-empty string`);
  }
  return parsed;
}

function requireHarvestResponsePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(502, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function requireHarvestResponseNonNegativeInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ProviderRequestError(502, `${fieldName} must be a non-negative integer`);
  }
  return parsed;
}

function requireHarvestResponseAccountId(value: unknown): string {
  return String(requireHarvestResponsePositiveInteger(value, "accountId"));
}

function requireHarvestResponseId(value: unknown, fieldName: string): number {
  return requireHarvestResponsePositiveInteger(value, fieldName);
}

function extractHarvestErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["error", "message", "description"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }

  for (const key of ["errors", "base"]) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }
    const first = value.find((item) => typeof item === "string");
    if (typeof first === "string" && first.trim()) {
      return first.trim();
    }
  }

  return undefined;
}

function assertDurationMode(input: Record<string, unknown>): void {
  if (input.hours !== undefined && (input.startedTime !== undefined || input.endedTime !== undefined)) {
    throw new ProviderRequestError(400, "hours cannot be combined with startedTime or endedTime.");
  }
}

function assertHasTimeEntryUpdate(input: Record<string, unknown>): void {
  const updateFields = [
    "projectId",
    "taskId",
    "spentDate",
    "hours",
    "startedTime",
    "endedTime",
    "notes",
    "externalReference",
  ];
  if (!updateFields.some((field) => input[field] !== undefined)) {
    throw new ProviderRequestError(400, "At least one time entry field must be provided.");
  }
}

function assertDateRange(input: Record<string, unknown>): void {
  const from = optionalString(input.from);
  const to = optionalString(input.to);
  if (from && to && from > to) {
    throw new ProviderRequestError(400, "to must be on or after from.");
  }
}

function isAbortLikeError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    String((error as { name?: unknown }).name) === "AbortError"
  );
}
