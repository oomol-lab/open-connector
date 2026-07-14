import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";
import type { SnipeItActionName } from "./actions.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed, queryParams } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const snipeItValidationPath = "/users/me";
export const snipeItCredentialHelpUrl = "https://snipe-it.readme.io/docs/connecting-to-google-docs";

type SnipeItRequestMode = "validate" | "execute";
type QueryValue = string | number | boolean | undefined;
type SnipeItActionHandler = (input: Record<string, unknown>, context: SnipeItContext) => Promise<unknown>;

export interface SnipeItContext extends ApiKeyProviderContext {
  apiBaseUrl: string;
  instanceUrl: string;
}

interface SnipeItRequestOptions {
  context: Pick<SnipeItContext, "apiKey" | "apiBaseUrl" | "fetcher" | "signal">;
  path: string;
  mode: SnipeItRequestMode;
  query?: Record<string, QueryValue>;
}

export const snipeItActionHandlers: Record<SnipeItActionName, SnipeItActionHandler> = {
  async get_current_user(_input, context) {
    return {
      user: await requestSnipeItJson({
        context,
        path: snipeItValidationPath,
        mode: "execute",
      }),
    };
  },
  async list_hardware(input, context) {
    return normalizeListResponse(
      await requestSnipeItJson({
        context,
        path: "/hardware",
        query: buildHardwareQuery(input),
        mode: "execute",
      }),
      "hardware",
    );
  },
  async list_users(input, context) {
    return normalizeListResponse(
      await requestSnipeItJson({
        context,
        path: "/users",
        query: buildUsersQuery(input),
        mode: "execute",
      }),
      "users",
    );
  },
  async list_companies(input, context) {
    return normalizeListResponse(
      await requestSnipeItJson({
        context,
        path: "/companies",
        query: queryParams({
          name: optionalString(input.name),
        }),
        mode: "execute",
      }),
      "companies",
    );
  },
  async list_categories(input, context) {
    return normalizeListResponse(
      await requestSnipeItJson({
        context,
        path: "/categories",
        query: buildCategoriesQuery(input),
        mode: "execute",
      }),
      "categories",
    );
  },
  async list_status_labels(input, context) {
    return normalizeListResponse(
      await requestSnipeItJson({
        context,
        path: "/statuslabels",
        query: buildStatusLabelsQuery(input),
        mode: "execute",
      }),
      "statusLabels",
    );
  },
};

export function resolveSnipeItContext(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): SnipeItContext {
  const apiKey = requiredString(values.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const urls = resolveSnipeItUrls(values.instanceUrl);
  return {
    apiKey,
    fetcher,
    signal,
    instanceUrl: urls.instanceUrl,
    apiBaseUrl: urls.apiBaseUrl,
  };
}

export async function validateSnipeItCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = resolveSnipeItContext(values, fetcher, signal);
  const currentUser = await requestSnipeItJson({
    context,
    path: snipeItValidationPath,
    mode: "validate",
  });
  const user = optionalRecord(currentUser);

  return {
    profile: {
      accountId: `snipe_it:${context.instanceUrl}`,
      displayName: buildAccountLabel(user, context.instanceUrl),
    },
    grantedScopes: [],
    metadata: {
      instanceUrl: context.instanceUrl,
      apiBaseUrl: context.apiBaseUrl,
      validationEndpoint: snipeItValidationPath,
      credentialHelpUrl: snipeItCredentialHelpUrl,
      ...(readUserMetadata(user) ?? {}),
    },
  };
}

async function requestSnipeItJson(options: SnipeItRequestOptions): Promise<unknown> {
  const url = new URL(`${options.context.apiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await options.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${options.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: options.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Snipe-IT request failed: ${error.message}` : "Snipe-IT request failed",
    );
  }

  const payload = await readSnipeItPayload(response);
  if (!response.ok) {
    throw mapSnipeItError(response.status, payload, options.mode);
  }
  throwIfSnipeItPayloadError(payload);

  return payload;
}

async function readSnipeItPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Snipe-IT returned malformed JSON");
    }
    return {
      messages: text,
    };
  }
}

function mapSnipeItError(status: number, payload: unknown, mode: SnipeItRequestMode): ProviderRequestError {
  const message = readSnipeItErrorMessage(payload) ?? `Snipe-IT request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function throwIfSnipeItPayloadError(payload: unknown): void {
  const body = optionalRecord(payload);
  if (!body || body.status !== "error") {
    return;
  }

  throw new ProviderRequestError(400, readSnipeItErrorMessage(body) ?? "Snipe-IT returned an error");
}

function readSnipeItErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const messages = body.messages;
  if (typeof messages === "string" && messages.trim()) {
    return messages.trim();
  }
  if (Array.isArray(messages)) {
    const first = messages.find((item) => typeof item === "string" && item.trim());
    return typeof first === "string" ? first.trim() : undefined;
  }
  const messageObject = optionalRecord(messages);
  if (messageObject) {
    const firstValue = Object.values(messageObject).find((value) => {
      if (typeof value === "string" && value.trim()) {
        return true;
      }
      return Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim());
    });
    if (typeof firstValue === "string") {
      return firstValue.trim();
    }
    if (Array.isArray(firstValue)) {
      const first = firstValue.find((item) => typeof item === "string" && item.trim());
      return typeof first === "string" ? first.trim() : undefined;
    }
  }

  return undefined;
}

function normalizeListResponse(payload: unknown, outputKey: string): Record<string, unknown> {
  const body = optionalRecord(payload);
  if (!body || !Array.isArray(body.rows)) {
    throw new ProviderRequestError(502, `Snipe-IT returned an invalid ${outputKey} list payload`);
  }

  return {
    total: typeof body.total === "number" ? body.total : body.rows.length,
    [outputKey]: body.rows,
  };
}

function buildHardwareQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return {
    ...buildCommonListQuery(input),
    order_number: optionalString(input.orderNumber),
    model_id: optionalInteger(input.modelId),
    category_id: optionalInteger(input.categoryId),
    manufacturer_id: optionalInteger(input.manufacturerId),
    company_id: optionalInteger(input.companyId),
    location_id: optionalInteger(input.locationId),
    status: optionalString(input.status),
    status_id: optionalInteger(input.statusId),
    assigned_to: optionalInteger(input.assignedTo),
    assigned_type: optionalString(input.assignedType),
    filter: stringifyFilter(input.filter),
  };
}

function buildUsersQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return {
    ...buildCommonListQuery(input),
    first_name: optionalString(input.firstName),
    last_name: optionalString(input.lastName),
    username: optionalString(input.username),
    email: optionalString(input.email),
    employee_num: optionalString(input.employeeNum),
    state: optionalString(input.state),
    zip: optionalString(input.zip),
    country: optionalString(input.country),
    group_id: optionalInteger(input.groupId),
    department_id: optionalInteger(input.departmentId),
    company_id: optionalInteger(input.companyId),
    location_id: optionalInteger(input.locationId),
    deleted: optionalBoolean(input.deleted),
    all: optionalBoolean(input.all),
    ldap_import: optionalBoolean(input.ldapImport),
    assets_count: optionalInteger(input.assetsCount),
    licenses_count: optionalInteger(input.licensesCount),
    accessories_count: optionalInteger(input.accessoriesCount),
    consumables_count: optionalInteger(input.consumablesCount),
    remote: optionalBoolean(input.remote),
    vip: optionalBoolean(input.vip),
    start_date: optionalString(input.startDate),
    end_date: optionalString(input.endDate),
    filter: stringifyFilter(input.filter),
  };
}

function buildCategoriesQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return {
    ...buildCommonListQuery(input),
    name: optionalString(input.name),
    category_id: optionalInteger(input.categoryId),
    category_type: optionalString(input.categoryType),
    use_default_eula: optionalBoolean(input.useDefaultEula),
    require_acceptance: optionalBoolean(input.requireAcceptance),
    checkin_email: optionalBoolean(input.checkinEmail),
  };
}

function buildStatusLabelsQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return {
    ...buildCommonListQuery(input),
    name: optionalString(input.name),
    status_type: optionalString(input.statusType),
  };
}

function buildCommonListQuery(input: Record<string, unknown>): Record<string, QueryValue> {
  return {
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
    search: optionalString(input.search),
    sort: optionalString(input.sort),
    order: optionalString(input.order),
  };
}

function stringifyFilter(value: unknown): string | undefined {
  return value === undefined ? undefined : JSON.stringify(value);
}

function resolveSnipeItUrls(
  rawInstanceUrl: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): { instanceUrl: string; apiBaseUrl: string } {
  const instanceUrl = normalizeSnipeItInstanceUrl(rawInstanceUrl);
  assertPublicHttpUrl(instanceUrl, {
    fieldName: "instanceUrl",
    allowPrivateNetwork,
    createError: (message) => new ProviderRequestError(400, message),
  });
  return {
    instanceUrl,
    apiBaseUrl: `${instanceUrl}/api/v1`,
  };
}

function normalizeSnipeItInstanceUrl(rawInstanceUrl: unknown): string {
  const trimmed = optionalString(rawInstanceUrl);
  if (!trimmed) {
    throw new ProviderRequestError(400, "instanceUrl is required");
  }

  const withScheme = trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new ProviderRequestError(400, "instanceUrl must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "instanceUrl must use https");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "instanceUrl must not include URL credentials");
  }

  url.search = "";
  url.hash = "";
  url.pathname = normalizeInstancePath(url.pathname);
  return trimTrailingSlash(url.toString());
}

function normalizeInstancePath(pathname: string): string {
  const withoutTrailingSlash = trimTrailingSlash(pathname);
  if (!withoutTrailingSlash || withoutTrailingSlash === "/") {
    return "";
  }
  const apiPathSuffix = "/api/v1";
  if (withoutTrailingSlash.endsWith(apiPathSuffix)) {
    return trimTrailingSlash(withoutTrailingSlash.slice(0, -apiPathSuffix.length));
  }
  return withoutTrailingSlash;
}

function trimTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 1 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

function buildAccountLabel(user: Record<string, unknown> | undefined, instanceUrl: string): string {
  if (user) {
    const fullName = optionalString(user.name);
    if (fullName) {
      return fullName;
    }
    const username = optionalString(user.username);
    if (username) {
      return username;
    }
    const email = optionalString(user.email);
    if (email) {
      return email;
    }
  }

  return `Snipe-IT ${new URL(instanceUrl).hostname}`;
}

function readUserMetadata(user: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!user) {
    return undefined;
  }

  const metadata: Record<string, unknown> = {};
  const id = user.id;
  if (typeof id === "number" || typeof id === "string") {
    metadata.userId = id;
  }

  const username = optionalString(user.username);
  if (username) {
    metadata.username = username;
  }

  const email = optionalString(user.email);
  if (email) {
    metadata.email = email;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}
