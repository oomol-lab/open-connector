import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  integer,
  optionalBooleanOrNull,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const pilvioApiBaseUrl = "https://api.pilvio.com/v1";

type Context = ApiKeyProviderContext;

export const pilvioActionHandlers: ProviderActionHandlers<
  "pilvio",
  (input: Record<string, unknown>, context: Context) => Promise<unknown>
> = {
  async get_current_user(_input, context) {
    const payload = await requestJson("/user-resource/user", {}, context);
    return { user: normalizeUser(requiredRecord(payload, "Pilvio user payload")), raw: payload };
  },
  async list_locations(_input, context) {
    const payload = await requestJson("/config/locations", {}, context);
    return { locations: array(payload, "Pilvio locations payload").map(normalizeLocation), raw: payload };
  },
  async list_virtual_machines(input, context) {
    const payload = await requestJson(
      locationPath(optionalString(input.locationSlug), "/user-resource/vm/list"),
      {},
      context,
    );
    return {
      virtualMachines: array(payload, "Pilvio virtual machines payload").map(normalizeVirtualMachine),
      raw: payload,
    };
  },
  async list_billing_accounts(input, context) {
    const payload = await requestJson(
      "/payment/billing_account/list",
      { show_shadow: input.showShadow === true ? "1" : undefined },
      context,
    );
    return {
      billingAccounts: array(payload, "Pilvio billing accounts payload").map(normalizeBillingAccount),
      raw: payload,
    };
  },
  async get_billing_account(input, context) {
    const payload = await requestJson(
      "/payment/billing_account",
      { billing_account_id: String(integer(input.billingAccountId, "billingAccountId")) },
      context,
    );
    return { billingAccount: normalizeBillingAccount(requiredRecord(payload, "Pilvio billing account")), raw: payload };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("pilvio", pilvioActionHandlers);

export async function validatePilvioCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestJson("/user-resource/user", {}, { apiKey, fetcher });
  const user = normalizeUser(requiredRecord(payload, "Pilvio user payload"));
  return {
    profile: {
      accountId: user.id !== null ? `pilvio:${user.id}` : (user.email ?? user.name ?? "pilvio_api_token"),
      displayName: user.email ?? user.name ?? "Pilvio API Token",
      grantedScopes: [],
    },
    metadata: compactObject({
      userId: user.id ?? undefined,
      userName: user.name ?? undefined,
      email: user.email ?? undefined,
    }),
  };
}

async function requestJson(
  path: string,
  query: Record<string, string | undefined>,
  context: Pick<Context, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const url = new URL(path.replace(/^\//, ""), `${pilvioApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, value);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      headers: { accept: "application/json", apikey: context.apiKey, "user-agent": providerUserAgent },
      signal: context.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Pilvio request failed: ${error.message}` : "Pilvio request failed",
    );
  }
  if (!response.ok)
    throw new ProviderRequestError(
      response.status,
      errorMessage(payload) ?? `Pilvio request failed with status ${response.status}`,
      payload,
    );
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Pilvio returned invalid JSON");
  }
}

function normalizeUser(input: Record<string, unknown>) {
  const profile = optionalRecord(input.profile_data);
  return {
    id: optionalNumber(input.id) ?? null,
    name: optionalString(input.name) ?? null,
    email: (profile ? optionalString(profile.email) : undefined) ?? null,
    firstName: (profile ? optionalString(profile.first_name) : undefined) ?? null,
    lastName: (profile ? optionalString(profile.last_name) : undefined) ?? null,
    raw: input,
  };
}

function normalizeLocation(input: Record<string, unknown>) {
  return {
    slug: requiredString(input.slug, "slug"),
    displayName: optionalString(input.display_name) ?? null,
    description: optionalString(input.description) ?? null,
    countryCode: optionalString(input.country_code) ?? null,
    orderNumber: optionalNumber(input.order_nr) ?? null,
    isDefault: optionalBooleanOrNull(input.is_default),
    isPreferred: optionalBooleanOrNull(input.is_preferred),
    raw: input,
  };
}

function normalizeVirtualMachine(input: Record<string, unknown>) {
  return {
    id: optionalNumber(input.id) ?? null,
    uuid: optionalString(input.uuid) ?? null,
    name: optionalString(input.name) ?? null,
    hostname: optionalString(input.hostname) ?? null,
    status: optionalString(input.status) ?? null,
    billingAccountId: optionalNumber(input.billing_account) ?? null,
    vcpus: optionalNumber(input.vcpu) ?? null,
    memoryMb: optionalNumber(input.memory) ?? null,
    osName: optionalString(input.os_name) ?? null,
    osVersion: optionalString(input.os_version) ?? null,
    privateIpv4: optionalString(input.private_ipv4) ?? null,
    publicIpv4: optionalString(input.public_ipv4) ?? null,
    publicIpv6: optionalString(input.public_ipv6) ?? null,
    createdAt: optionalString(input.created_at) ?? null,
    updatedAt: optionalString(input.updated_at) ?? null,
    raw: input,
  };
}

function normalizeBillingAccount(input: Record<string, unknown>) {
  return {
    id: optionalNumber(input.id) ?? null,
    title: optionalString(input.title) ?? null,
    email: optionalString(input.email) ?? null,
    companyName: optionalString(input.company_name) ?? null,
    creditAmount: optionalNumber(input.credit_amount) ?? null,
    isActive: optionalBooleanOrNull(input.is_active),
    isDefault: optionalBooleanOrNull(input.is_default),
    raw: input,
  };
}

function array(payload: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) throw new ProviderRequestError(502, `${label} must be an array`);
  return payload.map((item) => requiredRecord(item, `${label} item`));
}

function locationPath(slug: string | undefined, path: string): string {
  return slug ? `/${encodeURIComponent(slug)}${path}` : path;
}

function errorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const object = optionalRecord(payload);
  return object
    ? (optionalString(object.message) ?? optionalString(object.error) ?? optionalString(object.detail))
    : undefined;
}
