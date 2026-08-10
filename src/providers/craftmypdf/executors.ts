import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { CraftmypdfActionName } from "./actions.ts";

import {
  compactObject,
  nullableString,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "craftmypdf";
const defaultApiBaseUrl = "https://api.craftmypdf.com/v1";

interface CraftmypdfContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface CraftmypdfAccount {
  username: string;
  quotaCounter: number;
  quotaMax: number;
  templateCounter: number;
  templateMax: number;
  createdAt: string;
}

interface CraftmypdfTemplate {
  templateId: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt: string | null;
  groupName: string | null;
}

type CraftmypdfRequestPhase = "validate" | "execute";
type CraftmypdfActionHandler = (input: Record<string, unknown>, context: CraftmypdfContext) => Promise<unknown>;

const actionHandlers: Record<CraftmypdfActionName, CraftmypdfActionHandler> = {
  get_account_info(_input, context) {
    return getAccountInfo(context);
  },
  list_templates(input, context) {
    return listTemplates(input, context);
  },
  get_template(input, context) {
    return getTemplate(input, context);
  },
  create_pdf(input, context) {
    return createPdf(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<CraftmypdfContext>({
  service,
  handlers: actionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CraftmypdfContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveApiBaseUrl(credential.values.apiBaseUrl ?? credential.metadata.apiBaseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiBaseUrl = resolveApiBaseUrl(input.values.apiBaseUrl);
    const account = normalizeAccount(
      await requestJson({
        apiKey: input.apiKey,
        apiBaseUrl,
        path: "/get-account-info",
        fetcher,
        signal,
        phase: "validate",
      }),
    );

    return {
      profile: {
        accountId: account.username,
        displayName: account.username,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/get-account-info",
        username: account.username,
        quotaCounter: account.quotaCounter,
        quotaMax: account.quotaMax,
        templateCounter: account.templateCounter,
        templateMax: account.templateMax,
        createdAt: account.createdAt,
      },
    };
  },
};

async function getAccountInfo(context: CraftmypdfContext): Promise<unknown> {
  return {
    account: normalizeAccount(await requestJson({ ...context, path: "/get-account-info", phase: "execute" })),
  };
}

async function listTemplates(input: Record<string, unknown>, context: CraftmypdfContext): Promise<unknown> {
  const payload = await requestJson({
    ...context,
    path: "/list-templates",
    query: compactObject({
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
      group_name: optionalString(input.groupName),
    }),
    phase: "execute",
  });
  const record = readRecord(payload);
  const rawTemplates = Array.isArray(record.templates) ? record.templates : [];
  return {
    templates: rawTemplates.map((item) => normalizeTemplate(item)),
  };
}

async function getTemplate(input: Record<string, unknown>, context: CraftmypdfContext): Promise<unknown> {
  const payload = await requestJson({
    ...context,
    path: "/get-template",
    query: compactObject({
      template_id: readRequiredInputString(input.templateId, "templateId"),
      version: optionalString(input.version),
    }),
    phase: "execute",
  });
  const record = readRecord(payload);
  return {
    template: {
      name: readRequiredString(record.name, "name"),
      body: readRequiredRawString(record.body, "body"),
      sampleDataJson: nullableString(record.json) ?? null,
    },
  };
}

async function createPdf(input: Record<string, unknown>, context: CraftmypdfContext): Promise<unknown> {
  const payload = await requestJson({
    ...context,
    path: "/create",
    method: "POST",
    body: compactObject({
      template_id: readRequiredInputString(input.templateId, "templateId"),
      data: readRequiredData(input.data),
      load_data_from: optionalString(input.loadDataFrom),
      version: optionalString(input.version),
      export_type: "json",
      expiration: optionalInteger(input.expiration),
      output_file: optionalString(input.outputFile),
      image_resample_res: optionalInteger(input.imageResampleResolution),
      direct_download: booleanToFlag(input.directDownload),
      cloud_storage: booleanToFlag(input.cloudStorage),
      paging: optionalString(input.paging),
    }),
    phase: "execute",
  });
  const record = readRecord(payload);
  return {
    fileUrl: readRequiredString(record.file, "file"),
    transactionRef: readRequiredString(record.transaction_ref, "transaction_ref"),
    anchors: Array.isArray(record.anchors) ? record.anchors.map((item) => readRecord(item)) : [],
  };
}

async function requestJson(input: {
  apiKey: string;
  apiBaseUrl: string;
  path: string;
  fetcher: typeof fetch;
  phase: CraftmypdfRequestPhase;
  signal?: AbortSignal;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(`${input.apiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: headers(input.apiKey, input.method === "POST"),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `craftmypdf request failed: ${error.message}` : "craftmypdf request failed",
    );
  }

  if (!response.ok) {
    throw createError(response, payload, input.phase);
  }

  const record = optionalRecord(payload);
  if (record && optionalString(record.status) === "error") {
    throw createError(response, payload, input.phase);
  }

  return payload;
}

function headers(apiKey: string, includeJsonContentType: boolean): Record<string, string> {
  return compactObject({
    accept: "application/json",
    "content-type": includeJsonContentType ? "application/json" : undefined,
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  }) as Record<string, string>;
}

async function readPayload(response: Response): Promise<unknown> {
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

function createError(response: Response, payload: unknown, phase: CraftmypdfRequestPhase): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? response.statusText ?? "craftmypdf request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  return record ? (optionalString(record.message) ?? optionalString(record.error)) : undefined;
}

function normalizeAccount(payload: unknown): CraftmypdfAccount {
  const record = readRecord(payload);
  return {
    username: readRequiredString(record.username, "username"),
    quotaCounter: readRequiredNumber(record.quota_counter, "quota_counter"),
    quotaMax: readRequiredNumber(record.quota_max, "quota_max"),
    templateCounter: readRequiredInteger(record.template_counter, "template_counter"),
    templateMax: readRequiredInteger(record.template_max, "template_max"),
    createdAt: readRequiredString(record.created_at, "created_at"),
  };
}

function normalizeTemplate(payload: unknown): CraftmypdfTemplate {
  const record = readRecord(payload);
  return {
    templateId: readRequiredString(record.template_id, "template_id"),
    name: readRequiredString(record.name, "name"),
    status: readRequiredString(record.status, "status"),
    createdAt: readRequiredString(record.created_at, "created_at"),
    updatedAt: nullableString(record.updated_at) ?? null,
    groupName: nullableString(record.group_name) ?? null,
  };
}

function resolveApiBaseUrl(value: unknown): string {
  const rawValue = typeof value === "string" ? value.trim() : "";
  if (!rawValue) {
    return defaultApiBaseUrl;
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new ProviderRequestError(400, "apiBaseUrl must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "apiBaseUrl must use https");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "apiBaseUrl must not include credentials");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname !== "api.craftmypdf.com" && !(hostname.startsWith("api-") && hostname.endsWith(".craftmypdf.com"))) {
    throw new ProviderRequestError(400, "apiBaseUrl host is invalid");
  }
  const normalizedPath = url.pathname.replace(/\/+$/, "");
  if (normalizedPath !== "" && normalizedPath !== "/" && normalizedPath !== "/v1") {
    throw new ProviderRequestError(400, "apiBaseUrl must point to a CraftMyPDF region root or its /v1 API base URL");
  }

  url.pathname = "/v1";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function readRecord(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "craftmypdf returned an invalid response body", value);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `craftmypdf response missing ${fieldName}`);
  }
  return parsed;
}

function readRequiredRawString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProviderRequestError(502, `craftmypdf response missing ${fieldName}`);
  }
  return value;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed == null) {
    throw new ProviderRequestError(502, `craftmypdf response missing ${fieldName}`);
  }
  return parsed;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `craftmypdf response missing ${fieldName}`);
  }
  return parsed;
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readRequiredData(value: unknown): string | Record<string, unknown> {
  const stringValue = optionalString(value);
  if (stringValue) {
    return stringValue;
  }
  const objectValue = optionalRecord(value);
  if (objectValue) {
    return objectValue;
  }
  throw new ProviderRequestError(400, "data must be a non-empty JSON string or object");
}

function booleanToFlag(value: unknown): number | undefined {
  const parsed = optionalBoolean(value);
  if (parsed === undefined) {
    return undefined;
  }
  return parsed ? 1 : 0;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.craftmypdf.com/v1",
  auth: { type: "api_key_header", name: "x-api-key" },
});
