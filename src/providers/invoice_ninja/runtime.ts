import type { CredentialValidationResult } from "../../core/types.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const defaultInstanceUrl = "https://invoicing.co";
const apiPath = "/api/v1";
const validationEndpoint = "/companies/current";

class InvoiceNinjaError extends ProviderRequestError {
  constructor(_code: string, message: string, status: number, _cause?: unknown, details?: unknown) {
    super(status, message, details);
  }
}

type RequestPhase = "validate" | "execute";
interface InvoiceNinjaInput {
  apiKey: string;
  providerMetadata: Record<string, unknown>;
  input: Record<string, unknown>;
}
type Handler = (input: InvoiceNinjaInput, fetcher: typeof fetch) => Promise<unknown>;

export const invoiceNinjaActionHandlers: Record<string, Handler> = {
  async list_clients(input, fetcher) {
    return normalizeList(await request(input, fetcher, "/clients", { query: listClientQuery(input.input) }), "clients");
  },
  async get_client(input, fetcher) {
    return {
      client: unwrapEntity(
        await request(input, fetcher, `/clients/${encodeId(input.input.clientId, "clientId")}`, {
          query: includeQuery(input.input),
          notFound: true,
        }),
        "client",
      ),
    };
  },
  async create_client(input, fetcher) {
    return {
      client: unwrapEntity(
        await request(input, fetcher, "/clients", {
          method: "POST",
          body: clientBody(input.input),
        }),
        "client",
      ),
    };
  },
  async update_client(input, fetcher) {
    return {
      client: unwrapEntity(
        await request(input, fetcher, `/clients/${encodeId(input.input.clientId, "clientId")}`, {
          method: "PUT",
          body: clientBody(input.input),
          notFound: true,
        }),
        "client",
      ),
    };
  },
  async list_invoices(input, fetcher) {
    return normalizeList(
      await request(input, fetcher, "/invoices", { query: listInvoiceQuery(input.input) }),
      "invoices",
    );
  },
  async get_invoice(input, fetcher) {
    return {
      invoice: unwrapEntity(
        await request(input, fetcher, `/invoices/${encodeId(input.input.invoiceId, "invoiceId")}`, {
          query: includeQuery(input.input),
          notFound: true,
        }),
        "invoice",
      ),
    };
  },
  async create_invoice(input, fetcher) {
    return {
      invoice: unwrapEntity(
        await request(input, fetcher, "/invoices", {
          method: "POST",
          query: invoiceActionQuery(input.input),
          body: invoiceBody(input.input),
        }),
        "invoice",
      ),
    };
  },
  async update_invoice(input, fetcher) {
    const body = invoiceBody(input.input);
    const query = invoiceActionQuery(input.input);
    if (Object.keys(body).length === 0 && Object.keys(query).length === 0) {
      throw new InvoiceNinjaError("invalid_input", "update_invoice requires a field or status action to update", 400);
    }
    return {
      invoice: unwrapEntity(
        await request(input, fetcher, `/invoices/${encodeId(input.input.invoiceId, "invoiceId")}`, {
          method: "PUT",
          query,
          body,
          notFound: true,
        }),
        "invoice",
      ),
    };
  },
  async list_payments(input, fetcher) {
    return normalizeList(
      await request(input, fetcher, "/payments", { query: listPaymentQuery(input.input) }),
      "payments",
    );
  },
  async get_payment(input, fetcher) {
    return {
      payment: unwrapEntity(
        await request(input, fetcher, `/payments/${encodeId(input.input.paymentId, "paymentId")}`, {
          query: includeQuery(input.input),
          notFound: true,
        }),
        "payment",
      ),
    };
  },
  async create_payment(input, fetcher) {
    return {
      payment: unwrapEntity(
        await request(input, fetcher, "/payments", {
          method: "POST",
          query: compactObject({ email_receipt: input.input.emailReceipt }),
          body: paymentBody(input.input),
        }),
        "payment",
      ),
    };
  },
};

export async function validateInvoiceNinjaCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) throw new InvoiceNinjaError("invalid_input", "apiKey is required", 400);
  const urls = normalizeInvoiceNinjaUrls(input.instanceUrl);
  const payload = await requestJson({
    apiBaseUrl: urls.apiBaseUrl,
    apiKey,
    path: validationEndpoint,
    method: "POST",
    phase: "validate",
    fetcher,
  });
  const company = unwrapEntity(payload, "company");
  const companyId = optionalString(company.id)?.trim();
  const settings = optionalRecord(company.settings);
  const companyName = optionalString(settings?.name)?.trim();
  const host = new URL(urls.instanceUrl).host;
  return {
    profile: {
      accountId: companyId ? `invoice_ninja:${companyId}` : `invoice_ninja:${host}`,
      displayName: companyName || `Invoice Ninja ${host}`,
    },
    metadata: compactObject({
      instanceUrl: urls.instanceUrl,
      apiBaseUrl: urls.apiBaseUrl,
      validationEndpoint,
      companyId,
    }),
  };
}

function resolveInvoiceNinjaProxyBaseUrl(context: { providerMetadata: Record<string, unknown> }) {
  return storedApiBaseUrl(context.providerMetadata);
}

export function normalizeInvoiceNinjaUrls(
  value: unknown,
  allowPrivateNetwork: boolean = isPrivateNetworkAccessAllowed(),
): { instanceUrl: string; apiBaseUrl: string } {
  const raw = typeof value === "string" && value.trim() ? value.trim() : defaultInstanceUrl;
  const url = assertPublicHttpUrl(raw, {
    fieldName: "instanceUrl",
    createError: (message) => new InvoiceNinjaError("invalid_input", message, 400),
    allowPrivateNetwork,
  });
  if (url.protocol !== "https:") {
    throw new InvoiceNinjaError("invalid_input", "instanceUrl must use HTTPS", 400);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new InvoiceNinjaError(
      "invalid_input",
      "instanceUrl must not contain credentials, query parameters, or a fragment",
      400,
    );
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/" && path !== apiPath) {
    throw new InvoiceNinjaError(
      "invalid_input",
      "instanceUrl must be the Invoice Ninja instance root or end with /api/v1",
      400,
    );
  }
  const instanceUrl = url.origin;
  return { instanceUrl, apiBaseUrl: `${instanceUrl}${apiPath}` };
}

async function request(
  input: InvoiceNinjaInput,
  fetcher: typeof fetch,
  path: string,
  options: {
    method?: "GET" | "POST" | "PUT";
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    notFound?: boolean;
  } = {},
) {
  return requestJson({
    apiBaseUrl: storedApiBaseUrl(input.providerMetadata),
    apiKey: input.apiKey,
    path,
    fetcher,
    phase: "execute",
    ...options,
  });
}

async function requestJson(input: {
  apiBaseUrl: string;
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: RequestPhase;
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  notFound?: boolean;
}) {
  const timeout = createProviderTimeout(undefined, 30_000);
  const url = new URL(`${input.apiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        "x-api-token": input.apiKey,
        "x-requested-with": "XMLHttpRequest",
        "user-agent": providerUserAgent,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw mapInvoiceNinjaError(response.status, payload, input.phase, input.notFound);
    }
    return payload;
  } catch (error) {
    if (error instanceof InvoiceNinjaError) throw error;
    if (timeout.didTimeout() || (error instanceof Error && error.name === "AbortError")) {
      throw new InvoiceNinjaError("provider_error", "Invoice Ninja request timed out", 504);
    }
    throw new InvoiceNinjaError(
      "provider_error",
      error instanceof Error ? `Invoice Ninja request failed: ${error.message}` : "Invoice Ninja request failed",
      502,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPayload(response: Response) {
  if (response.status === 204) return {};
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function mapInvoiceNinjaError(status: number, payload: unknown, phase: RequestPhase, notFound?: boolean) {
  const message = errorMessage(payload) ?? `Invoice Ninja request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return phase === "validate"
      ? new InvoiceNinjaError("invalid_input", message, 400)
      : new InvoiceNinjaError("credential_expired", message, status);
  }
  if (status === 404 && (notFound || phase === "validate")) {
    return new InvoiceNinjaError("invalid_input", message, 404);
  }
  if (status === 422) return new InvoiceNinjaError("invalid_input", message, 422);
  if (status === 429) return new InvoiceNinjaError("rate_limited", message, 429);
  return new InvoiceNinjaError("provider_error", message, status >= 500 ? 502 : status);
}

function errorMessage(payload: unknown) {
  const object = optionalRecord(payload);
  if (!object) return undefined;
  const direct = optionalString(object.message) ?? optionalString(object.error);
  if (direct?.trim()) return direct.trim();
  if (Array.isArray(object.errors)) {
    const messages = object.errors.filter((value): value is string => typeof value === "string");
    if (messages.length > 0) return messages.join(", ");
  }
  const errors = optionalRecord(object.errors);
  if (!errors) return undefined;
  const messages = Object.values(errors).flatMap((value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : typeof value === "string"
        ? [value]
        : [],
  );
  return messages.length > 0 ? messages.join(", ") : undefined;
}

function storedApiBaseUrl(metadata?: Record<string, unknown>) {
  const stored = metadata?.apiBaseUrl ?? metadata?.instanceUrl;
  if (typeof stored !== "string" || !stored.trim()) {
    throw new InvoiceNinjaError("provider_error", "Invoice Ninja credential metadata is missing the instance URL", 502);
  }
  return normalizeInvoiceNinjaUrls(stored).apiBaseUrl;
}

function encodeId(value: unknown, fieldName: string) {
  const id = optionalString(value)?.trim();
  if (!id) throw new InvoiceNinjaError("invalid_input", `${fieldName} is required`, 400);
  return encodeURIComponent(id);
}

function paginationQuery(input: Record<string, unknown>) {
  return compactObject({
    page: input.page,
    per_page: input.perPage,
    include: input.include,
    filter: input.filter,
    sort: input.sort,
  });
}

function includeQuery(input: Record<string, unknown>) {
  return compactObject({ include: input.include });
}

function listClientQuery(input: Record<string, unknown>) {
  return compactObject({
    ...paginationQuery(input),
    name: input.name,
    email: input.email,
    number: input.number,
  });
}

function listInvoiceQuery(input: Record<string, unknown>) {
  const statuses = Array.isArray(input.clientStatuses) ? input.clientStatuses.join(",") : undefined;
  const dateRange =
    typeof input.startDate === "string" && typeof input.endDate === "string"
      ? `${input.startDate},${input.endDate}`
      : undefined;
  return compactObject({
    ...paginationQuery(input),
    client_id: input.clientId,
    status_id: input.statusId,
    client_status: statuses,
    number: input.number,
    date: input.date,
    date_range: dateRange,
  });
}

function listPaymentQuery(input: Record<string, unknown>) {
  return compactObject({
    ...paginationQuery(input),
    client_id: input.clientId,
    number: input.number,
  });
}

function clientBody(input: Record<string, unknown>) {
  return compactObject({
    name: input.name,
    contacts: Array.isArray(input.contacts)
      ? input.contacts.map((contact) => mapContact(optionalRecord(contact) ?? {}))
      : undefined,
    website: input.website,
    phone: input.phone,
    private_notes: input.privateNotes,
    public_notes: input.publicNotes,
    address1: input.address1,
    address2: input.address2,
    city: input.city,
    state: input.state,
    postal_code: input.postalCode,
    country_id: input.countryId,
    country_code: input.countryCode,
    vat_number: input.vatNumber,
    id_number: input.idNumber,
    number: input.number,
  });
}

function mapContact(input: Record<string, unknown>) {
  return compactObject({
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone: input.phone,
    send_email: input.sendEmail,
  });
}

function invoiceBody(input: Record<string, unknown>) {
  return compactObject({
    client_id: input.clientId,
    line_items: Array.isArray(input.lineItems)
      ? input.lineItems.map((item) => mapLineItem(optionalRecord(item) ?? {}))
      : undefined,
    date: input.date,
    due_date: input.dueDate,
    number: input.number,
    po_number: input.purchaseOrderNumber,
    terms: input.terms,
    public_notes: input.publicNotes,
    private_notes: input.privateNotes,
    footer: input.footer,
    discount: input.discount,
    is_amount_discount: input.isAmountDiscount,
    partial: input.partial,
  });
}

function mapLineItem(input: Record<string, unknown>) {
  return compactObject({
    quantity: input.quantity,
    cost: input.cost,
    product_key: input.productKey,
    notes: input.notes,
    discount: input.discount,
    is_amount_discount: input.isAmountDiscount,
    tax_name1: input.taxName1,
    tax_rate1: input.taxRate1,
    tax_name2: input.taxName2,
    tax_rate2: input.taxRate2,
  });
}

function invoiceActionQuery(input: Record<string, unknown>) {
  return compactObject({
    send_email: input.sendEmail,
    mark_sent: input.markSent,
    paid: input.paid,
    amount_paid: input.amountPaid,
  });
}

function paymentBody(input: Record<string, unknown>) {
  return compactObject({
    client_id: input.clientId,
    amount: input.amount,
    type_id: input.paymentTypeId === undefined ? undefined : String(input.paymentTypeId),
    date: input.date,
    transaction_reference: input.transactionReference,
    private_notes: input.privateNotes,
    number: input.number,
    invoices: Array.isArray(input.invoices)
      ? input.invoices.map((allocation) => {
          const object = optionalRecord(allocation) ?? {};
          return { invoice_id: object.invoiceId, amount: object.amount };
        })
      : undefined,
  });
}

function unwrapEntity(payload: unknown, label: string) {
  const object = optionalRecord(payload);
  if (!object) {
    throw new InvoiceNinjaError("provider_error", `Invoice Ninja response is missing ${label}`, 502);
  }
  const data = optionalRecord(object.data);
  return data ?? object;
}

function normalizeList(payload: unknown, key: "clients" | "invoices" | "payments") {
  const object = optionalRecord(payload);
  if (!object || !Array.isArray(object.data)) {
    throw new InvoiceNinjaError("provider_error", `Invoice Ninja response is missing ${key}`, 502);
  }
  const records = object.data;
  if (!records.every((record) => optionalRecord(record))) {
    throw new InvoiceNinjaError("provider_error", `Invoice Ninja returned malformed ${key}`, 502);
  }
  const meta = optionalRecord(object.meta);
  const pagination = optionalRecord(meta?.pagination);
  const count = optionalInteger(pagination?.count) ?? records.length;
  const perPage = optionalInteger(pagination?.per_page) ?? count;
  const total = optionalInteger(pagination?.total) ?? records.length;
  const currentPage = Math.max(optionalInteger(pagination?.current_page) ?? 1, 1);
  const totalPages =
    optionalInteger(pagination?.total_pages) ?? (perPage > 0 ? Math.ceil(total / perPage) : total > 0 ? 1 : 0);
  return {
    [key]: records,
    pagination: { total, count, perPage, currentPage, totalPages },
  };
}
