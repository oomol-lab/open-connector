import type {
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "precoro";
const internationalBaseUrl = "https://api.precoro.com";
const usBaseUrl = "https://api.precoro.us";

interface PrecoroContext {
  apiKey: string;
  email: string;
  baseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type PrecoroActionHandler = (input: Record<string, unknown>, context: PrecoroContext) => Promise<unknown>;

export const precoroActionHandlers: ProviderActionHandlers<"precoro", PrecoroActionHandler> = {
  list_purchase_orders: (input: Record<string, unknown>, context: PrecoroContext) =>
    listPrecoroCollection("/purchaseorders", input, context, addPurchaseOrderFilters),
  get_purchase_order: (input: Record<string, unknown>, context: PrecoroContext) =>
    getPrecoroRecord("/purchaseorders", requiredInputString(input.idn, "idn"), "purchaseOrder", context),
  list_suppliers: (input: Record<string, unknown>, context: PrecoroContext) =>
    listPrecoroCollection("/suppliers", input, context, addCommonListFilters),
  get_supplier: (input: Record<string, unknown>, context: PrecoroContext) =>
    getPrecoroRecord("/suppliers", requiredInputString(input.id, "id"), "supplier", context),
  list_items: (input: Record<string, unknown>, context: PrecoroContext) =>
    listPrecoroCollection("/items", input, context, addCommonListFilters),
  get_item: (input: Record<string, unknown>, context: PrecoroContext) =>
    getPrecoroRecord("/items", requiredInputString(input.id, "id"), "item", context),
  list_users: (_input: Record<string, unknown>, context: PrecoroContext) =>
    listPrecoroCollection("/users", {}, context),
  list_warehouses: (_input: Record<string, unknown>, context: PrecoroContext) =>
    listPrecoroCollection("/warehouses", {}, context),
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: precoroActionHandlers,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<PrecoroContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      email: requiredString(credential.values.email, "email", (message) => new ProviderRequestError(401, message)),
      baseUrl: resolvePrecoroBaseUrl(credential.values.region),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => resolvePrecoroBaseUrl((await requireApiKeyCredential(context, service)).values.region),
  auth: { type: "api_key_header", name: "x-auth-token" },
  customizeRequest({ headers, credential }) {
    const apiCredential = credential as Extract<ResolvedCredential, { authType: "api_key" }>;
    headers.set(
      "email",
      requiredString(apiCredential.values.email, "email", (message) => new ProviderRequestError(401, message)),
    );
  },
});

async function listPrecoroCollection(
  path: string,
  input: Record<string, unknown>,
  context: PrecoroContext,
  addFilters: (url: URL, input: Record<string, unknown>) => void = () => {},
): Promise<unknown> {
  const url = new URL(path, context.baseUrl);
  addFilters(url, input);
  const payload = await precoroGetJson(`${url.pathname}${url.search}`, context, "execute");
  const record = requireRecord(payload, "Precoro list response");
  return {
    data: readObjectArray(record.data),
    pagination: optionalRecord(optionalRecord(record.meta)?.pagination) ?? {},
    raw: record,
  };
}

async function getPrecoroRecord(
  path: string,
  id: string,
  outputKey: string,
  context: PrecoroContext,
): Promise<unknown> {
  const payload = await precoroGetJson(`${path}/${encodeURIComponent(id)}`, context, "execute");
  const record = requireRecord(payload, `Precoro ${outputKey} response`);
  return { [outputKey]: record, raw: record };
}

async function precoroGetJson(path: string, context: PrecoroContext, phase: "validate" | "execute"): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(new URL(path, context.baseUrl), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-auth-token": context.apiKey,
        email: context.email,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Precoro request failed: ${error.message}` : "Precoro request failed",
    );
  }
  const payload = await readPrecoroPayload(response);
  if (!response.ok) throw createPrecoroError(response.status, payload, phase);
  return payload;
}

async function readPrecoroPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return text;
    throw new ProviderRequestError(502, "Precoro returned invalid JSON");
  }
}

function createPrecoroError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = extractPrecoroErrorMessage(payload) ?? `Precoro request failed with status ${status}`;
  if (status === 401 || status === 403)
    return new ProviderRequestError(phase === "validate" ? 401 : 403, message, payload);
  if (status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function extractPrecoroErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  const direct = optionalString(record?.message) ?? optionalString(record?.error);
  if (direct) return direct;
  const errors = optionalRecord(record?.errors);
  return errors ? readFirstString(errors) : undefined;
}

function readFirstString(record: Record<string, unknown>): string | undefined {
  for (const value of Object.values(record)) {
    if (typeof value === "string" && value.trim()) return value.trim();
    const child = optionalRecord(value);
    if (child) {
      const nested = readFirstString(child);
      if (nested) return nested;
    }
  }
  return undefined;
}

function addCommonListFilters(url: URL, input: Record<string, unknown>): void {
  setOptionalQuery(url, "modifiedSince", input.modifiedSince);
  setOptionalQuery(url, "per_page", input.per_page);
  setOptionalQuery(url, "page", input.page);
  setRepeatedQuery(url, "external_id[]", input.externalIds);
}

function addPurchaseOrderFilters(url: URL, input: Record<string, unknown>): void {
  addCommonListFilters(url, input);
  setOptionalQuery(url, "approvalLeftDate", input.approvalLeftDate);
  setOptionalQuery(url, "approvalRightDate", input.approvalRightDate);
  setRepeatedQuery(url, "status[]", input.statuses);
  setRepeatedQuery(url, "logicType[]", input.logicTypes);
}

function setOptionalQuery(url: URL, key: string, value: unknown): void {
  if (value != null && value !== "") url.searchParams.set(key, String(value));
}

function setRepeatedQuery(url: URL, key: string, value: unknown): void {
  if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, String(item));
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${label} is invalid`, value);
  return record;
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => requireRecord(item, "Precoro list item")) : [];
}

function resolvePrecoroBaseUrl(region: unknown): string {
  return readPrecoroRegion(region) === "us" ? usBaseUrl : internationalBaseUrl;
}

function readPrecoroRegion(value: unknown): "com" | "us" {
  return typeof value === "string" && value.trim().toLowerCase() === "us" ? "us" : "com";
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
