import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { objectArray, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import { readProviderTextBody } from "../provider-runtime.ts";
import {
  basicAuthorizationHeader,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "omise",
  baseUrl = "https://api.omise.co";
type Handler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
const handlers: ProviderActionHandlers<"omise", Handler> = {
  async get_account(_i, c) {
    return { account: requiredRecord(await request("/account", c), "Omise account") };
  },
  async get_balance(_i, c) {
    return { balance: requiredRecord(await request("/balance", c), "Omise balance") };
  },
  async list_customers(i, c) {
    return normalizeList(await request("/customers", c, "GET", undefined, i), "customers");
  },
  async get_customer(i, c) {
    return {
      customer: requiredRecord(
        await request(`/customers/${segment(i.customer_id, "customer_id")}`, c),
        "Omise customer",
      ),
    };
  },
  async create_customer(i, c) {
    return { customer: requiredRecord(await request("/customers", c, "POST", customerForm(i)), "Omise customer") };
  },
  async update_customer(i, c) {
    const form = customerForm(i);
    if (!form.size) throw providerInputError("update_customer requires email, description, or metadata");
    return {
      customer: requiredRecord(
        await request(`/customers/${segment(i.customer_id, "customer_id")}`, c, "PATCH", form),
        "Omise customer",
      ),
    };
  },
  async delete_customer(i, c) {
    return {
      customer: requiredRecord(
        await request(`/customers/${segment(i.customer_id, "customer_id")}`, c, "DELETE"),
        "Omise customer",
      ),
    };
  },
  async list_charges(i, c) {
    return normalizeList(await request("/charges", c, "GET", undefined, i), "charges");
  },
  async get_charge(i, c) {
    return {
      charge: requiredRecord(await request(`/charges/${segment(i.charge_id, "charge_id")}`, c), "Omise charge"),
    };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const account = requiredRecord(
      await request("/account", { apiKey: input.apiKey, fetcher, signal }),
      "Omise account",
    );
    const id = optionalString(account.id)?.trim();
    return {
      profile: {
        accountId: id,
        displayName: optionalString(account.email)?.trim() || (id ? `Omise ${id}` : "Omise Account"),
      },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationEndpoint: "/account" },
    };
  },
};
function segment(value: unknown, name: string): string {
  return encodeURIComponent(requiredString(value, name));
}
function customerForm(input: Record<string, unknown>): URLSearchParams {
  const form = new URLSearchParams();
  for (const key of ["email", "description"]) {
    const value = optionalString(input[key]);
    if (value !== undefined) form.set(key, value);
  }
  for (const [key, value] of Object.entries(optionalRecord(input.metadata) ?? {}))
    if (["string", "number", "boolean"].includes(typeof value)) form.set(`metadata[${key}]`, String(value));
  return form;
}
function normalizeList(value: unknown, name: "customers" | "charges"): unknown {
  const record = requiredRecord(value, `Omise ${name}`);
  const pagination = { ...record };
  delete pagination.data;
  return { [name]: objectArray(record.data, `Omise ${name} list data`, providerResponseError), pagination };
}
async function request(
  path: string,
  context: ApiKeyProviderContext,
  method = "GET",
  form?: URLSearchParams,
  query?: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query ?? {}))
    if (typeof value === "string" || typeof value === "number") url.searchParams.set(key, String(value));
  const response = await context.fetcher(url, {
    method,
    headers: {
      accept: "application/json",
      authorization: basicAuthorizationHeader(`${context.apiKey}:`),
      "user-agent": providerUserAgent,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
    signal: context.signal,
  });
  const text = await readProviderTextBody(response, "Omise response");
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    if (response.ok) throw new ProviderRequestError(502, "Omise returned invalid JSON");
    payload = text;
  }
  if (!response.ok) {
    const record = optionalRecord(payload);
    throw new ProviderRequestError(
      response.status,
      optionalString(record?.message) ?? `Omise request failed with status ${response.status}`,
      payload,
    );
  }
  return payload;
}
