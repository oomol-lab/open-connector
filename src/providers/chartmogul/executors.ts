import type { QueryValue } from "../../core/request.ts";
import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  looseArray,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
} from "../provider-runtime.ts";

export const chartmogulApiBaseUrl = "https://api.chartmogul.com";
const service = "chartmogul";
const chartmogulValidationPath = "/v1/account";
const chartmogulApiKeyHelpUrl = "https://help.chartmogul.com/article/95-creating-and-managing-api-keys";

type ChartmogulRequestPhase = "validate" | "execute";
type ChartmogulActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface ChartmogulAccount {
  uuid: string | null;
  name: string | null;
  currency: string | null;
  timeZone: string | null;
  weekStartOn: string | null;
  raw: Record<string, unknown>;
}

export const chartmogulActionHandlers: ProviderActionHandlers<"chartmogul", ChartmogulActionHandler> = {
  get_account(input, context) {
    return getAccount(input, context);
  },
  list_sources(input, context) {
    return listSources(input, context);
  },
  list_customers(input, context) {
    return listCustomers(input, context);
  },
  get_customer(input, context) {
    return getCustomer(input, context);
  },
  list_contacts(input, context) {
    return listContacts(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, chartmogulActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: chartmogulApiBaseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestChartmogulJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: chartmogulValidationPath,
      phase: "validate",
    });
    const account = readObject(payload, "chartmogul account response");
    const normalized = normalizeAccount(account);

    return {
      profile: {
        accountId: normalized.uuid ? `chartmogul:${normalized.uuid}` : "chartmogul-api-key",
        displayName: normalized.name ?? "ChartMogul Account",
      },
      grantedScopes: [],
      metadata: {
        accountUuid: normalized.uuid,
        accountName: normalized.name,
        apiBaseUrl: chartmogulApiBaseUrl,
        validationEndpoint: chartmogulValidationPath,
        credentialHelpUrl: chartmogulApiKeyHelpUrl,
      },
    };
  },
};

async function getAccount(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const include = normalizeInclude(input.include);
  const payload = await requestChartmogulJson({
    context,
    path: chartmogulValidationPath,
    query: {
      include,
    },
    phase: "execute",
  });

  return { account: normalizeAccount(readObject(payload, "chartmogul account response")) };
}

async function listSources(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestChartmogulJson({
    context,
    path: "/v1/data_sources",
    query: {
      name: optionalString(input.name),
      system: optionalString(input.system),
    },
    phase: "execute",
  });
  const response = readObject(payload, "chartmogul data sources response");

  return {
    dataSources: looseArray(response.data_sources).map((item) =>
      normalizeDataSource(readObject(item, "chartmogul data source")),
    ),
  };
}

async function listCustomers(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestChartmogulJson({
    context,
    path: "/v1/customers",
    query: {
      data_source_uuid: optionalString(input.dataSourceUuid),
      external_id: optionalString(input.externalId),
      email: optionalString(input.email),
      with_associated_emails: optionalBoolean(input.withAssociatedEmails),
      status: optionalString(input.status),
      system: optionalString(input.system),
      cursor: optionalString(input.cursor),
      per_page: optionalNumber(input.perPage),
    },
    phase: "execute",
  });
  const response = readObject(payload, "chartmogul customers response");

  return {
    customers: looseArray(response.entries).map((item) => normalizeCustomer(readObject(item, "chartmogul customer"))),
    cursor: optionalString(response.cursor) ?? null,
    hasMore: optionalBoolean(response.has_more) ?? false,
  };
}

async function getCustomer(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const customerUuid = requiredInputString(input.customerUuid, "customerUuid");
  const payload = await requestChartmogulJson({
    context,
    path: `/v1/customers/${encodeURIComponent(customerUuid)}`,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return { customer: normalizeCustomer(readObject(payload, "chartmogul customer response")) };
}

async function listContacts(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestChartmogulJson({
    context,
    path: "/v1/contacts",
    query: {
      email: optionalString(input.email),
      customer_external_id: optionalString(input.customerExternalId),
      customer_uuid: optionalString(input.customerUuid),
      data_source_uuid: optionalString(input.dataSourceUuid),
      cursor: optionalString(input.cursor),
      per_page: optionalNumber(input.perPage),
    },
    phase: "execute",
  });
  const response = readObject(payload, "chartmogul contacts response");

  return {
    contacts: looseArray(response.entries).map((item) => normalizeContact(readObject(item, "chartmogul contact"))),
    cursor: optionalString(response.cursor) ?? null,
    hasMore: optionalBoolean(response.has_more) ?? false,
  };
}

async function requestChartmogulJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  query?: Record<string, QueryValue>;
  phase: ChartmogulRequestPhase;
  notFoundAsInvalidInput?: boolean;
}): Promise<unknown> {
  const url = new URL(input.path, chartmogulApiBaseUrl);
  for (const [key, value] of Object.entries(queryParams(input.query ?? {}))) {
    url.searchParams.set(key, value);
  }

  let response: Response, payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: chartmogulHeaders(input.context.apiKey),
      signal: input.context.signal,
    });
    payload = await readChartmogulPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `chartmogul request failed: ${error.message}` : "chartmogul request failed",
    );
  }

  if (!response.ok) {
    throw createChartmogulError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }

  return payload;
}

function chartmogulHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: buildChartmogulAuthorizationHeader(apiKey),
    "user-agent": providerUserAgent,
  };
}

function buildChartmogulAuthorizationHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

async function readChartmogulPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    return text;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createChartmogulError(
  response: Response,
  payload: unknown,
  phase: ChartmogulRequestPhase,
  notFoundAsInvalidInput: boolean | undefined,
): ProviderRequestError {
  const message = extractChartmogulErrorMessage(payload) ?? response.statusText ?? "chartmogul request failed";

  if (response.status == 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase == "validate" && (response.status == 401 || response.status == 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase == "execute" && (response.status == 401 || response.status == 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status == 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase == "execute" && (response.status == 400 || response.status == 404 || response.status == 422)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractChartmogulErrorMessage(payload: unknown): string | undefined {
  if (typeof payload == "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalRecord(record.error);
  const errors = optionalRecord(record.errors);
  const messages = Array.isArray(record.errors) ? record.errors.filter((item) => typeof item == "string") : undefined;
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.error_message) ??
    optionalString(error?.message) ??
    optionalString(errors?.message) ??
    messages?.join(", ")
  );
}

function normalizeAccount(record: Record<string, unknown>): ChartmogulAccount {
  return {
    uuid: readNullableString(record.chartmogul_account_uuid),
    name: readNullableString(record.name),
    currency: readNullableString(record.currency),
    timeZone: readNullableString(record.time_zone),
    weekStartOn: readNullableString(record.week_start_on),
    raw: record,
  };
}

function normalizeDataSource(record: Record<string, unknown>): Record<string, unknown> {
  return {
    uuid: readNullableString(record.uuid),
    name: readNullableString(record.name),
    system: readNullableString(record.system),
    createdAt: readNullableString(record.created_at),
    status: readNullableString(record.status),
    raw: record,
  };
}

function normalizeCustomer(record: Record<string, unknown>): Record<string, unknown> {
  return {
    uuid: readNullableString(record.uuid),
    externalId: readNullableString(record.external_id),
    externalIds: readStringArray(record.external_ids),
    dataSourceUuid: readNullableString(record.data_source_uuid),
    dataSourceUuids: readStringArray(record.data_source_uuids),
    name: readNullableString(record.name),
    email: readNullableString(record.email),
    status: readNullableString(record.status),
    company: readNullableString(record.company),
    country: readNullableString(record.country),
    state: readNullableString(record.state),
    city: readNullableString(record.city),
    customerSince: readNullableString(record["customer-since"] ?? record.customer_since),
    mrr: readNullableNumber(record.mrr),
    arr: readNullableNumber(record.arr),
    currency: readNullableString(record.currency),
    chartmogulUrl: readNullableString(record["chartmogul-url"] ?? record.chartmogul_url),
    billingSystemUrl: readNullableString(record["billing-system-url"] ?? record.billing_system_url),
    raw: record,
  };
}

function normalizeContact(record: Record<string, unknown>): Record<string, unknown> {
  return {
    uuid: readNullableString(record.uuid),
    customerUuid: readNullableString(record.customer_uuid),
    customerExternalId: readNullableString(record.customer_external_id),
    dataSourceUuid: readNullableString(record.data_source_uuid),
    externalId: readNullableString(record.external_id),
    firstName: readNullableString(record.first_name),
    lastName: readNullableString(record.last_name),
    title: readNullableString(record.title),
    email: readNullableString(record.email),
    phone: readNullableString(record.phone),
    linkedIn: readNullableString(record.linked_in),
    twitter: readNullableString(record.twitter),
    position: readNullableInteger(record.position),
    raw: record,
  };
}

function normalizeInclude(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "include must be an array of strings");
  }
  return value.map((item) => requiredInputString(item, "include")).join(",");
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  return requiredRecord(value, label, (message) => new ProviderRequestError(502, message, value));
}

function readNullableString(value: unknown): string | null {
  return typeof value == "string" ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value == "number" ? value : null;
}

function readNullableInteger(value: unknown): number | null {
  return Number.isInteger(value) ? (value as number) : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item == "string");
}
