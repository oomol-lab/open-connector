import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, nullableString, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "configcat";
const configcatApiBaseUrl = "https://api.configcat.com";
const configcatValidationPath = "/v1/me";

type ConfigcatRequestPhase = "validate" | "execute";

interface ConfigcatCredentials {
  username: string;
  password: string;
}

interface ConfigcatContext {
  credentials: ConfigcatCredentials;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ConfigcatActionHandler = (input: Record<string, unknown>, context: ConfigcatContext) => Promise<unknown>;

export const configcatActionHandlers: ProviderActionHandlers<"configcat", ConfigcatActionHandler> = {
  get_me(_input, context) {
    return executeGetMe(context);
  },
  list_products(_input, context) {
    return executeListProducts(context);
  },
  list_configs(input, context) {
    return executeListConfigs(input, context);
  },
  list_environments(input, context) {
    return executeListEnvironments(input, context);
  },
  list_settings(input, context) {
    return executeListSettings(input, context);
  },
  get_setting_value(input, context) {
    return executeGetSettingValue(input, context);
  },
  list_setting_values(input, context) {
    return executeListSettingValues(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ConfigcatContext>({
  service,
  handlers: configcatActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ConfigcatContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      credentials: readConfigcatCredentials({
        apiKey: credential.apiKey,
        password: credential.values.password,
      }),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: configcatApiBaseUrl,
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    const credentials = readConfigcatCredentials({
      apiKey: credential.apiKey,
      password: credential.values.password,
    });
    headers.set("authorization", buildConfigcatAuthorization(credentials));
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const credentials = readConfigcatCredentials({
      apiKey: input.apiKey,
      password: input.values.password,
    });
    const payload = await requestConfigcatJson({
      method: "GET",
      path: configcatValidationPath,
      credentials,
      fetcher,
      signal,
      phase: "validate",
    });
    const user = normalizeUser(payload);

    return {
      profile: {
        accountId: user.email,
        displayName: user.fullName || user.email || "ConfigCat Public API",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: configcatApiBaseUrl,
        validationEndpoint: configcatValidationPath,
        email: user.email,
        fullName: user.fullName,
      }),
    };
  },
};

async function executeGetMe(context: ConfigcatContext): Promise<unknown> {
  const payload = await requestConfigcatJson({
    method: "GET",
    path: configcatValidationPath,
    credentials: context.credentials,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return { user: normalizeUser(payload) };
}

async function executeListProducts(context: ConfigcatContext): Promise<unknown> {
  const payload = await requestConfigcatJsonForAction(context, {
    method: "GET",
    path: "/v1/products",
  });
  return {
    products: requireArray(payload, "ConfigCat Products response").map((item) => normalizeProduct(item)),
  };
}

async function executeListConfigs(input: Record<string, unknown>, context: ConfigcatContext): Promise<unknown> {
  const productId = requireInputString(input.productId, "productId");
  const payload = await requestConfigcatJsonForAction(context, {
    method: "GET",
    path: `/v1/products/${encodeURIComponent(productId)}/configs`,
  });
  return {
    configs: requireArray(payload, "ConfigCat Configs response").map((item) => normalizeConfig(item)),
  };
}

async function executeListEnvironments(input: Record<string, unknown>, context: ConfigcatContext): Promise<unknown> {
  const productId = requireInputString(input.productId, "productId");
  const payload = await requestConfigcatJsonForAction(context, {
    method: "GET",
    path: `/v1/products/${encodeURIComponent(productId)}/environments`,
  });
  return {
    environments: requireArray(payload, "ConfigCat Environments response").map((item) => normalizeEnvironment(item)),
  };
}

async function executeListSettings(input: Record<string, unknown>, context: ConfigcatContext): Promise<unknown> {
  const configId = requireInputString(input.configId, "configId");
  const payload = await requestConfigcatJsonForAction(context, {
    method: "GET",
    path: `/v1/configs/${encodeURIComponent(configId)}/settings`,
  });
  return {
    settings: requireArray(payload, "ConfigCat Settings response").map((item) => normalizeSetting(item)),
  };
}

async function executeGetSettingValue(input: Record<string, unknown>, context: ConfigcatContext): Promise<unknown> {
  const environmentId = requireInputString(input.environmentId, "environmentId");
  const settingId = requireInputInteger(input.settingId, "settingId");
  const payload = await requestConfigcatJsonForAction(context, {
    method: "GET",
    path: `/v1/environments/${encodeURIComponent(environmentId)}/settings/${settingId}/value`,
  });
  return { settingValue: normalizeSettingValue(payload) };
}

async function executeListSettingValues(input: Record<string, unknown>, context: ConfigcatContext): Promise<unknown> {
  const configId = requireInputString(input.configId, "configId");
  const environmentId = requireInputString(input.environmentId, "environmentId");
  const payload = await requestConfigcatJsonForAction(context, {
    method: "GET",
    path: `/v2/configs/${encodeURIComponent(configId)}/environments/${encodeURIComponent(environmentId)}/values`,
  });
  const record = requireRecord(payload, "ConfigCat bulk Setting values response");
  return {
    config: normalizeConfig(record.config),
    environment: normalizeEnvironment(record.environment),
    readOnly: readBoolean(record.readOnly, "readOnly"),
    settingValues: requireArray(record.settingFormulas, "ConfigCat settingFormulas").map((item) =>
      normalizeConfigSettingFormula(item),
    ),
    raw: record,
  };
}

function requestConfigcatJsonForAction(
  context: ConfigcatContext,
  request: { method: string; path: string },
): Promise<unknown> {
  return requestConfigcatJson({
    ...request,
    credentials: context.credentials,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
}

async function requestConfigcatJson(input: {
  method: string;
  path: string;
  credentials: ConfigcatCredentials;
  fetcher: typeof fetch;
  phase: ConfigcatRequestPhase;
  signal?: AbortSignal;
}): Promise<unknown> {
  const url = new URL(input.path, configcatApiBaseUrl);
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: buildConfigcatAuthorization(input.credentials),
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
    payload = await readConfigcatPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ConfigCat request failed: ${error.message}` : "ConfigCat request failed",
    );
  }

  if (!response.ok) {
    throw mapConfigcatError(response.status, extractConfigcatErrorMessage(payload), input.phase, payload);
  }

  return payload;
}

async function readConfigcatPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "ConfigCat returned malformed JSON");
    }
    return text;
  }
}

function readConfigcatCredentials(input: { apiKey?: string; password?: string }): ConfigcatCredentials {
  const username = requiredString(input.apiKey, "configcat Public API username", providerInputError);
  const password = requiredString(input.password, "configcat Public API password", providerInputError);
  return { username, password };
}

function buildConfigcatAuthorization(credentials: ConfigcatCredentials): string {
  return `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`;
}

function mapConfigcatError(
  status: number,
  message: string,
  phase: ConfigcatRequestPhase,
  payload: unknown,
): ProviderRequestError {
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function extractConfigcatErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return "ConfigCat request failed";
  }
  const errors = Array.isArray(record.errors) ? record.errors : undefined;
  const firstError = optionalRecord(errors?.[0]);
  return (
    optionalString(record.message) ??
    optionalString(record.title) ??
    optionalString(record.detail) ??
    optionalString(record.error) ??
    optionalString(firstError?.message) ??
    optionalString(firstError?.detail) ??
    "ConfigCat request failed"
  );
}

interface ConfigcatUser {
  email: string;
  fullName: string;
}

interface ConfigcatProduct {
  productId: string;
  name: string;
  description: string | null;
  order: number;
  reasonRequired: boolean;
  approveRequired: boolean;
  organization: Record<string, unknown>;
  raw: Record<string, unknown>;
}

interface ConfigcatConfig {
  configId: string;
  name: string;
  description: string | null;
  order: number;
  productId: string;
  productName: string;
  evaluationVersion: string | null;
  raw: Record<string, unknown>;
}

interface ConfigcatEnvironment {
  environmentId: string;
  name: string;
  color: string | null;
  description: string | null;
  order: number;
  reasonRequired: boolean;
  approveRequired: boolean;
  productId: string;
  productName: string;
  raw: Record<string, unknown>;
}

interface ConfigcatSettingData {
  settingId: number;
  key: string;
  name: string;
  settingType: string;
}

function normalizeUser(value: unknown): ConfigcatUser {
  const record = requireRecord(value, "ConfigCat user response");
  return {
    email: requireResponseString(record.email, "email"),
    fullName: requireResponseString(record.fullName, "fullName"),
  };
}

function normalizeOrganization(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "ConfigCat organization");
  return {
    organizationId: requireResponseString(record.organizationId, "organizationId"),
    name: requireResponseString(record.name, "name"),
  };
}

function normalizeProduct(value: unknown): ConfigcatProduct {
  const record = requireRecord(value, "ConfigCat Product");
  return {
    productId: requireResponseString(record.productId, "productId"),
    name: requireResponseString(record.name, "name"),
    description: nullableString(record.description) ?? null,
    order: requireResponseInteger(record.order, "order"),
    reasonRequired: readBoolean(record.reasonRequired, "reasonRequired"),
    approveRequired: readBoolean(record.approveRequired, "approveRequired"),
    organization: normalizeOrganization(record.organization),
    raw: record,
  };
}

function normalizeConfig(value: unknown): ConfigcatConfig {
  const record = requireRecord(value, "ConfigCat Config");
  const product = normalizeProduct(record.product);
  return {
    configId: requireResponseString(record.configId, "configId"),
    name: requireResponseString(record.name, "name"),
    description: nullableString(record.description) ?? null,
    order: requireResponseInteger(record.order, "order"),
    productId: product.productId,
    productName: product.name,
    evaluationVersion: readOptionalStringLike(record.evaluationVersion),
    raw: record,
  };
}

function normalizeEnvironment(value: unknown): ConfigcatEnvironment {
  const record = requireRecord(value, "ConfigCat Environment");
  const product = normalizeProduct(record.product);
  return {
    environmentId: requireResponseString(record.environmentId, "environmentId"),
    name: requireResponseString(record.name, "name"),
    color: nullableString(record.color) ?? null,
    description: nullableString(record.description) ?? null,
    order: requireResponseInteger(record.order, "order"),
    reasonRequired: readBoolean(record.reasonRequired, "reasonRequired"),
    approveRequired: readBoolean(record.approveRequired, "approveRequired"),
    productId: product.productId,
    productName: product.name,
    raw: record,
  };
}

function normalizeSetting(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "ConfigCat Setting");
  return {
    settingId: requireResponseInteger(record.settingId, "settingId"),
    key: requireResponseString(record.key, "key"),
    name: requireResponseString(record.name, "name"),
    hint: nullableString(record.hint) ?? null,
    order: requireResponseInteger(record.order, "order"),
    settingType: requireResponseString(record.settingType, "settingType"),
    isJson: readBoolean(record.isJson, "isJson"),
    configId: requireResponseString(record.configId, "configId"),
    configName: requireResponseString(record.configName, "configName"),
    createdAt: nullableString(record.createdAt) ?? null,
    raw: record,
  };
}

function normalizeSettingData(value: unknown): ConfigcatSettingData {
  const record = requireRecord(value, "ConfigCat Setting data");
  return {
    settingId: requireResponseInteger(record.settingId, "settingId"),
    key: requireResponseString(record.key, "key"),
    name: requireResponseString(record.name, "name"),
    settingType: requireResponseString(record.settingType, "settingType"),
  };
}

function normalizeSettingValue(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "ConfigCat Setting value");
  const setting = normalizeSettingData(record.setting);
  const config = normalizeConfig(record.config);
  const environment = normalizeEnvironment(record.environment);
  return {
    settingId: setting.settingId,
    settingKey: setting.key,
    settingName: setting.name,
    settingType: setting.settingType,
    value: record.value ?? null,
    updatedAt: nullableString(record.updatedAt) ?? null,
    lastUpdaterUserEmail: nullableString(record.lastUpdaterUserEmail) ?? null,
    lastUpdaterUserFullName: nullableString(record.lastUpdaterUserFullName) ?? null,
    readOnly: readBoolean(record.readOnly, "readOnly"),
    configId: config.configId,
    configName: config.name,
    environmentId: environment.environmentId,
    environmentName: environment.name,
    raw: record,
  };
}

function normalizeConfigSettingFormula(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "ConfigCat bulk Setting value item");
  const setting = normalizeSettingData(record.setting);
  return {
    settingId: setting.settingId,
    settingKey: setting.key,
    settingName: setting.name,
    settingType: setting.settingType,
    defaultValue: requireRecord(record.defaultValue, "defaultValue"),
    updatedAt: nullableString(record.updatedAt) ?? null,
    lastUpdaterUserEmail: nullableString(record.lastUpdaterUserEmail) ?? null,
    lastUpdaterUserFullName: nullableString(record.lastUpdaterUserFullName) ?? null,
    raw: record,
  };
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`, value);
  }
  return record;
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`, value);
  }
  return value;
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInputError);
}

function requireResponseString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `${fieldName} must be a string`, value);
  }
  return value;
}

function requireInputInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`, value);
  }
  return value;
}

function requireResponseInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an integer`, value);
  }
  return value;
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `${fieldName} must be a boolean`, value);
  }
  return value;
}

function readOptionalStringLike(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return String(value);
}
