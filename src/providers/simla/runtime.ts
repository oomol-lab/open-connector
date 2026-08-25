import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const simlaValidationPath = "/api/credentials";

type SimlaRequestMode = "validate" | "execute";
interface SimlaContext extends ApiKeyProviderContext {
  apiBaseUrl: string;
}
type SimlaActionHandler = (input: Record<string, unknown>, context: SimlaContext) => Promise<unknown>;

interface SimlaRequestOptions {
  apiKey: string;
  apiBaseUrl: string;
  path: string;
  fetcher: typeof fetch;
  mode: SimlaRequestMode;
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  form?: Record<string, string>;
  notFoundAsInvalidInput?: boolean;
  signal?: AbortSignal;
}

export const simlaActionHandlers: ProviderActionHandlers<"simla", SimlaActionHandler> = {
  list_orders(input, context) {
    return listOrders(input, context);
  },
  get_order(input, context) {
    return getOrder(input, context);
  },
  create_order(input, context) {
    return createOrder(input, context);
  },
  edit_order(input, context) {
    return editOrder(input, context);
  },
  get_order_statuses(input, context) {
    return getOrderStatuses(input, context);
  },
  list_customers(input, context) {
    return listCustomers(input, context);
  },
  get_customer(input, context) {
    return getCustomer(input, context);
  },
  create_customer(input, context) {
    return createCustomer(input, context);
  },
  edit_customer(input, context) {
    return editCustomer(input, context);
  },
};

export async function validateSimlaCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiBaseUrl = normalizeSimlaApiBaseUrl(values.apiBaseUrl);
  const payload = await requestSimlaJson({
    apiKey,
    apiBaseUrl,
    path: simlaValidationPath,
    fetcher,
    mode: "validate",
    signal,
  });
  const scopes = readStringArray(payload.scopes);
  const sitesAvailable = readStringArray(payload.sitesAvailable);

  return {
    profile: {
      accountId: `simla:${new URL(apiBaseUrl).host}`,
      displayName: buildAccountLabel(apiBaseUrl, sitesAvailable),
    },
    grantedScopes: scopes,
    metadata: compactObject({
      apiBaseUrl,
      validationEndpoint: simlaValidationPath,
      siteAccess: optionalString(payload.siteAccess),
      sitesAvailable,
      scopes,
    }),
  };
}

export function normalizeSimlaApiBaseUrl(input?: string): string {
  const raw = input?.trim();
  if (!raw) {
    throw new ProviderRequestError(400, "apiBaseUrl is required");
  }

  const parsed = assertPublicHttpUrl(raw, {
    fieldName: "apiBaseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (parsed.protocol !== "https:") {
    throw new ProviderRequestError(400, "apiBaseUrl must use https");
  }

  parsed.hash = "";
  parsed.search = "";
  const pathname = trimTrailingSlash(parsed.pathname);
  if (pathname === "/api" || pathname === "/api/v5") {
    parsed.pathname = "/";
  } else if (pathname.endsWith("/api/v5")) {
    parsed.pathname = pathname.slice(0, pathname.length - "/api/v5".length) || "/";
  } else if (pathname.endsWith("/api")) {
    parsed.pathname = pathname.slice(0, pathname.length - "/api".length) || "/";
  } else {
    parsed.pathname = pathname || "/";
  }

  const normalizedPath = trimTrailingSlash(parsed.pathname);
  return normalizedPath && normalizedPath !== "/" ? `${parsed.origin}${normalizedPath}` : parsed.origin;
}

async function listOrders(input: Record<string, unknown>, context: SimlaContext): Promise<unknown> {
  const payload = await requestSimlaJson({
    ...buildRequestBase(context),
    path: "/api/v5/orders",
    query: buildListQuery(input),
  });

  return {
    success: readSuccess(payload),
    orders: readObjectArray(payload.orders, "orders"),
    pagination: readLooseObject(payload.pagination, "pagination"),
    raw: payload,
  };
}

async function getOrder(input: Record<string, unknown>, context: SimlaContext): Promise<unknown> {
  const payload = await requestSimlaJson({
    ...buildRequestBase(context),
    path: `/api/v5/orders/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
    query: buildLookupQuery(input),
    notFoundAsInvalidInput: true,
  });

  return {
    success: readSuccess(payload),
    order: readLooseObject(payload.order, "order"),
    raw: payload,
  };
}

async function createOrder(input: Record<string, unknown>, context: SimlaContext): Promise<unknown> {
  const payload = await requestSimlaJson({
    ...buildRequestBase(context),
    path: "/api/v5/orders/create",
    method: "POST",
    form: {
      ...buildOptionalSiteForm(input),
      order: JSON.stringify(readLooseObject(input.order, "order")),
    },
  });

  return {
    success: readSuccess(payload),
    id: readPositiveInteger(payload.id, "id"),
    raw: payload,
  };
}

async function editOrder(input: Record<string, unknown>, context: SimlaContext): Promise<unknown> {
  const payload = await requestSimlaJson({
    ...buildRequestBase(context),
    path: `/api/v5/orders/${encodeURIComponent(readRequiredString(input.id, "id"))}/edit`,
    method: "POST",
    form: {
      ...buildLookupForm(input),
      order: JSON.stringify(readLooseObject(input.order, "order")),
    },
    notFoundAsInvalidInput: true,
  });

  return {
    success: readSuccess(payload),
    id: readOptionalPositiveInteger(payload.id, "id"),
    raw: payload,
  };
}

async function getOrderStatuses(input: Record<string, unknown>, context: SimlaContext): Promise<unknown> {
  const ids = readOptionalArray(input.ids, "ids");
  const externalIds = readOptionalArray(input.externalIds, "externalIds");
  if (!ids?.length && !externalIds?.length) {
    throw new ProviderRequestError(400, "ids or externalIds is required");
  }

  const payload = await requestSimlaJson({
    ...buildRequestBase(context),
    path: "/api/v5/orders/statuses",
    query: {
      ids,
      externalIds,
    },
  });

  return {
    success: readSuccess(payload),
    orders: readObjectArray(payload.orders, "orders"),
    raw: payload,
  };
}

async function listCustomers(input: Record<string, unknown>, context: SimlaContext): Promise<unknown> {
  const payload = await requestSimlaJson({
    ...buildRequestBase(context),
    path: "/api/v5/customers",
    query: buildListQuery(input),
  });

  return {
    success: readSuccess(payload),
    customers: readObjectArray(payload.customers, "customers"),
    pagination: readLooseObject(payload.pagination, "pagination"),
    raw: payload,
  };
}

async function getCustomer(input: Record<string, unknown>, context: SimlaContext): Promise<unknown> {
  const payload = await requestSimlaJson({
    ...buildRequestBase(context),
    path: `/api/v5/customers/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
    query: buildLookupQuery(input),
    notFoundAsInvalidInput: true,
  });

  return {
    success: readSuccess(payload),
    customer: readLooseObject(payload.customer, "customer"),
    raw: payload,
  };
}

async function createCustomer(input: Record<string, unknown>, context: SimlaContext): Promise<unknown> {
  const payload = await requestSimlaJson({
    ...buildRequestBase(context),
    path: "/api/v5/customers/create",
    method: "POST",
    form: {
      ...buildOptionalSiteForm(input),
      customer: JSON.stringify(readLooseObject(input.customer, "customer")),
    },
  });

  return {
    success: readSuccess(payload),
    id: readPositiveInteger(payload.id, "id"),
    raw: payload,
  };
}

async function editCustomer(input: Record<string, unknown>, context: SimlaContext): Promise<unknown> {
  const payload = await requestSimlaJson({
    ...buildRequestBase(context),
    path: `/api/v5/customers/${encodeURIComponent(readRequiredString(input.id, "id"))}/edit`,
    method: "POST",
    form: {
      ...buildLookupForm(input),
      customer: JSON.stringify(readLooseObject(input.customer, "customer")),
    },
    notFoundAsInvalidInput: true,
  });

  return {
    success: readSuccess(payload),
    id: readOptionalPositiveInteger(payload.id, "id"),
    raw: payload,
  };
}

function buildRequestBase(context: SimlaContext): Omit<SimlaRequestOptions, "path"> {
  return {
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    fetcher: context.fetcher,
    mode: "execute",
    signal: context.signal,
  };
}

async function requestSimlaJson(input: SimlaRequestOptions): Promise<Record<string, unknown>> {
  const response = await simlaFetch(input);
  if (response.ok) {
    return readJsonObject(response);
  }

  const payload = await readOptionalJsonObject(response);
  throw mapSimlaError({
    status: response.status,
    payload,
    mode: input.mode,
    notFoundAsInvalidInput: input.notFoundAsInvalidInput,
  });
}

async function simlaFetch(input: SimlaRequestOptions): Promise<Response> {
  const url = buildSimlaUrl(input.apiBaseUrl, input.path);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url.searchParams, key, value);
  }

  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "X-API-KEY": input.apiKey,
  });
  let body: URLSearchParams | undefined;
  if (input.form) {
    body = new URLSearchParams(input.form);
    headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
  }

  try {
    return await input.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers,
      body,
      redirect: "manual",
      signal: input.signal,
    });
  } catch (error) {
    throw mapSimlaTransportError(error);
  }
}

function buildSimlaUrl(apiBaseUrl: string, path: string): URL {
  const base = apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`;
  const relative = path.startsWith("/") ? path.slice(1) : path;
  return new URL(relative, base);
}

function buildListQuery(input: Record<string, unknown>): Record<string, unknown> {
  return {
    limit: input.limit,
    page: input.page,
    filter: optionalRecord(input.filter),
  };
}

function buildLookupQuery(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    by: optionalString(input.by),
    site: optionalString(input.site),
  });
}

function buildLookupForm(input: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(buildLookupQuery(input)).map(([key, value]) => [key, String(value)]));
}

function buildOptionalSiteForm(input: Record<string, unknown>): Record<string, string> {
  const site = optionalString(input.site);
  const form: Record<string, string> = {};
  if (site) {
    form.site = site;
  }
  return form;
}

function appendQueryValue(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendQueryValue(params, `${key}[]`, item);
    }
    return;
  }

  const record = optionalRecord(value);
  if (record) {
    for (const [childKey, childValue] of Object.entries(record)) {
      appendQueryValue(params, `${key}[${childKey}]`, childValue);
    }
    return;
  }

  params.append(key, String(value));
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return optionalRecord(JSON.parse(text)) ?? {};
  } catch {
    throw new ProviderRequestError(502, "simla returned invalid JSON");
  }
}

async function readOptionalJsonObject(response: Response): Promise<Record<string, unknown>> {
  try {
    return await readJsonObject(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      return {};
    }
    throw error;
  }
}

function mapSimlaTransportError(error: unknown): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "simla request failed";
  return new ProviderRequestError(isTimeoutError(error) ? 504 : 502, message);
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    error.message.toLowerCase().includes("timeout") ||
    error.message.toLowerCase().includes("timed out")
  );
}

function mapSimlaError(input: {
  status: number;
  payload: Record<string, unknown>;
  mode: SimlaRequestMode;
  notFoundAsInvalidInput?: boolean;
}): ProviderRequestError {
  const message = extractSimlaErrorMessage(input.payload) ?? `simla request failed with status ${input.status}`;

  if (input.status === 429 || input.status === 503) {
    return new ProviderRequestError(429, message);
  }
  if (input.status === 404 && input.notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }
  if (input.status === 401 || input.status === 403) {
    return new ProviderRequestError(input.mode === "validate" ? 400 : 401, message);
  }
  if (input.status >= 400 && input.status < 500) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(502, message);
}

function extractSimlaErrorMessage(payload: Record<string, unknown>): string | undefined {
  const errorMsg = optionalString(payload.errorMsg);
  if (errorMsg) {
    return errorMsg;
  }
  const error = optionalString(payload.error);
  if (error) {
    return error;
  }
  const message = optionalString(payload.message);
  if (message) {
    return message;
  }

  const errors = Array.isArray(payload.errors) ? payload.errors : undefined;
  const firstError = errors?.[0];
  if (typeof firstError === "string") {
    return firstError;
  }
  return optionalString(optionalRecord(firstError)?.message);
}

function readSuccess(payload: Record<string, unknown>): boolean {
  if (typeof payload.success !== "boolean") {
    throw new ProviderRequestError(502, "simla returned an invalid success field");
  }
  return payload.success;
}

function readLooseObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `simla returned an invalid ${fieldName} field`);
  }
  return record;
}

function readObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `simla returned an invalid ${fieldName} field`);
  }
  return value.map((item, index) => readLooseObject(item, `${fieldName}[${index}]`));
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readOptionalArray(value: unknown, fieldName: string): unknown[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value;
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProviderRequestError(502, `simla returned an invalid ${fieldName} field`);
  }
  return parsed;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | null {
  if (value == null) {
    return null;
  }
  return readPositiveInteger(value, fieldName);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function buildAccountLabel(apiBaseUrl: string, sitesAvailable: string[]): string {
  const host = new URL(apiBaseUrl).host;
  if (sitesAvailable.length === 1) {
    return `${host} (${sitesAvailable[0]})`;
  }
  return host;
}

function trimTrailingSlash(value: string): string {
  let output = value;
  while (output.length > 1 && output.endsWith("/")) {
    output = output.slice(0, -1);
  }
  return output;
}
