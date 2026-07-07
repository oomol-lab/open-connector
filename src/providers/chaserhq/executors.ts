import type { QueryValue } from "../../core/request.ts";
import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ChaserhqActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "chaserhq";
const apiBaseUrl = "https://openapi.chaserhq.com";
const apiVersionBaseUrl = "https://openapi.chaserhq.com/v1";

interface ChaserContext {
  apiKey: string;
  apiSecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type Handler = (input: Record<string, unknown>, context: ChaserContext) => Promise<unknown>;

export const chaserhqActionHandlers: Record<ChaserhqActionName, Handler> = {
  async get_status(_input, context) {
    return { ok: true, raw: await requestChaserJson(context, "/status/") };
  },
  async get_organisation(_input, context) {
    return { organisation: dataOrPayload(await requestChaserJson(context, "/v1/organisation")) };
  },
  async list_customers(input, context) {
    const payload = await requestChaserJson(context, "/v1/customers", {
      query: buildListQuery(input, customerFilterFields),
    });
    return listOutput(payload, "customers");
  },
  async get_customer(input, context) {
    const customerId = requiredString(input.customerId, "customerId");
    return {
      customer: dataOrPayload(
        await requestChaserJson(context, `/v1/customers/${encodeURIComponent(customerId)}`, {
          query: compactObject({ additional_fields: joinStrings(input.additionalFields) }),
        }),
      ),
    };
  },
  async list_invoices(input, context) {
    const payload = await requestChaserJson(context, "/v1/invoices", {
      query: buildListQuery(input, invoiceFilterFields),
    });
    return listOutput(payload, "invoices");
  },
  async get_invoice(input, context) {
    return {
      invoice: dataOrPayload(
        await requestChaserJson(
          context,
          `/v1/invoices/${encodeURIComponent(requiredString(input.invoiceId, "invoiceId"))}`,
        ),
      ),
    };
  },
  async list_invoice_history(input, context) {
    const payload = await requestChaserJson(context, "/v1/invoices/history", {
      query: buildListQuery(input, historyFilterFields),
    });
    return listOutput(payload, "histories");
  },
  async get_invoice_history(input, context) {
    return {
      history: dataOrPayload(
        await requestChaserJson(
          context,
          `/v1/invoices/${encodeURIComponent(requiredString(input.invoiceId, "invoiceId"))}/history`,
        ),
      ),
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ChaserContext>({
  service,
  handlers: chaserhqActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ChaserContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiSecret: requiredString(
        credential.values.apiSecret,
        "apiSecret",
        (message) => new ProviderRequestError(401, message),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const apiSecret = requiredString(
      credential.values.apiSecret,
      "apiSecret",
      (message) => new ProviderRequestError(401, message),
    );
    const url = createProviderProxyUrl(apiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Basic ${Buffer.from(`${credential.apiKey}:${apiSecret}`).toString("base64")}`);
    headers.set("user-agent", providerUserAgent);

    const response = await fetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const context = {
      apiKey: input.apiKey,
      apiSecret: requiredString(
        input.values.apiSecret,
        "apiSecret",
        (message) => new ProviderRequestError(400, message),
      ),
      fetcher,
      signal,
    };
    const organisation = optionalRecord(dataOrPayload(await requestChaserJson(context, "/v1/organisation")));
    return {
      profile: {
        accountId: optionalString(organisation?.id) ?? "chaserhq",
        displayName:
          optionalString(organisation?.name) ?? optionalString(organisation?.legalName) ?? "ChaserHQ Organisation",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: apiVersionBaseUrl,
        validationEndpoint: "/v1/organisation",
        credentialHelpUrl: "https://my.chaserhq.com/settings/integrations",
        organisationId: optionalString(organisation?.id),
        organisationName: optionalString(organisation?.name),
      }),
    };
  },
};

const customerFilterFields = {
  externalId: "external_id",
  companyName: "company_name",
  contactFirstName: "contact_first_name",
  contactLastName: "contact_last_name",
  contactEmailAddress: "contact_email_address",
  status: "status",
};
const invoiceFilterFields = {
  invoiceId: "invoice_id",
  invoiceNumber: "invoice_number",
  status: "status",
  currencyCode: "currency_code",
  customerExternalId: "customer_external_id",
  amountDue: "amount_due",
  amountPaid: "amount_paid",
  total: "total",
  subTotal: "sub_total",
  date: "date",
  dueDate: "due_date",
  fullyPaidDate: "fully_paid_date",
};
const historyFilterFields = {
  invoiceId: "invoice_id",
  invoiceNumber: "invoice_number",
  contactId: "contact_id",
};

function buildListQuery(input: Record<string, unknown>, fields: Record<string, string>): Record<string, unknown> {
  return compactObject({
    limit: optionalNumber(input.limit),
    page: optionalNumber(input.page),
    additional_fields: joinStrings(input.additionalFields),
    ...buildFilterQuery(optionalRecord(input.filters), fields),
  });
}

function buildFilterQuery(
  filters: Record<string, unknown> | undefined,
  fields: Record<string, string>,
): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [inputName, queryName] of Object.entries(fields)) {
    const filter = optionalRecord(filters?.[inputName]);
    for (const operator of ["eq", "ne", "gt", "lt", "gte", "lte", "in", "nin"]) {
      const value = filter?.[operator];
      if (Array.isArray(value)) query[`filter[${queryName}][${operator}]`] = value.map(String).join(",");
      else if (value !== undefined && value !== null && value !== "")
        query[`filter[${queryName}][${operator}]`] = String(value);
    }
  }
  return query;
}

async function requestChaserJson(
  context: ChaserContext,
  path: string,
  options: { query?: Record<string, unknown> } = {},
): Promise<unknown> {
  const url = new URL(path.replace(/^\//, ""), `${apiBaseUrl}/`);
  for (const [key, value] of Object.entries(queryParams((options.query ?? {}) as Record<string, QueryValue>))) {
    url.searchParams.set(key, value);
  }
  const response = await context.fetcher(url, {
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${context.apiKey}:${context.apiSecret}`).toString("base64")}`,
      "user-agent": providerUserAgent,
    },
    signal: context.signal,
  });
  const payload = await readJson(response);
  if (!response.ok) throw createChaserError(response, payload);
  return payload;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return text;
    throw new ProviderRequestError(502, "ChaserHQ returned invalid JSON");
  }
}

function dataOrPayload(payload: unknown): unknown {
  return optionalRecord(payload)?.data ?? payload;
}

function listOutput(payload: unknown, key: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  const data = Array.isArray(record?.data) ? record.data : [];
  return {
    [key]: data,
    pagination: {
      pageNumber: optionalNumber(record?.page_number) ?? optionalNumber(record?.pageNumber) ?? null,
      pageSize: optionalNumber(record?.page_size) ?? optionalNumber(record?.pageSize) ?? null,
      totalCount: optionalNumber(record?.total_count) ?? optionalNumber(record?.totalCount) ?? null,
    },
  };
}

function joinStrings(value: unknown): string | undefined {
  return Array.isArray(value) ? value.map(String).join(",") : undefined;
}

function createChaserError(response: Response, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    response.statusText ??
    `ChaserHQ request failed with HTTP ${response.status}`;
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}
