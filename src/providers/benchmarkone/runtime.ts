import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { looseArray, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const benchmarkoneApiBaseUrl = "https://api.hatchbuck.com/api/v1";

interface BenchmarkoneContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface BenchmarkoneRequest extends BenchmarkoneContext {
  path: string;
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
}

type BenchmarkoneHandler = (input: Record<string, unknown>, context: BenchmarkoneContext) => Promise<unknown>;

const settingPathByAction = {
  list_contact_statuses: "/settings/contactStatus",
  list_contact_sources: "/settings/source",
  list_contact_temperatures: "/settings/temperature",
} as const;

export const benchmarkoneActionHandlers: ProviderActionHandlers<"benchmarkone", BenchmarkoneHandler> = {
  search_contacts: searchContacts,
  create_contact(input, context) {
    return writeContact("POST", input, context);
  },
  update_contact(input, context) {
    return writeContact("PUT", input, context);
  },
  async list_contact_statuses(_input, context) {
    return listSettings(settingPathByAction.list_contact_statuses, context);
  },
  async list_contact_sources(_input, context) {
    return listSettings(settingPathByAction.list_contact_sources, context);
  },
  async list_contact_temperatures(_input, context) {
    return listSettings(settingPathByAction.list_contact_temperatures, context);
  },
};

export async function validateBenchmarkoneCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestBenchmarkone({ apiKey, path: "/user", fetcher, signal });
  return {
    profile: { displayName: "BenchmarkONE API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: benchmarkoneApiBaseUrl,
      validationEndpoint: "/user",
    },
  };
}

async function searchContacts(input: Record<string, unknown>, context: BenchmarkoneContext): Promise<unknown> {
  const contactId = optionalString(input.contactId)?.trim();
  const firstName = optionalString(input.firstName)?.trim();
  const lastName = optionalString(input.lastName)?.trim();
  const emailAddresses = looseArray(input.emailAddresses).filter(
    (value): value is string => typeof value === "string" && value.trim() !== "",
  );
  if (!contactId && !firstName && !lastName && emailAddresses.length === 0) {
    throw providerInputError("at least one contact search field is required");
  }

  const payload = await requestBenchmarkone({
    ...context,
    path: "/contact/search",
    method: "POST",
    body: {
      contactId,
      firstName,
      lastName,
      emails: emailAddresses.map((address) => ({ address: address.trim() })),
    },
  });
  return { contacts: requireRecordArray(payload, "BenchmarkONE contact search response") };
}

async function writeContact(
  method: "POST" | "PUT",
  input: Record<string, unknown>,
  context: BenchmarkoneContext,
): Promise<unknown> {
  const contact = optionalRecord(input.contact);
  if (!contact) throw providerInputError("contact must be an object");
  const body =
    method === "PUT" ? { ...contact, contactId: requiredInputString(input.contactId, "contactId") } : contact;
  const payload = await requestBenchmarkone({
    ...context,
    path: "/contact",
    method,
    body,
  });
  return { contact: requiredResponseRecord(payload, "BenchmarkONE contact response") };
}

async function listSettings(path: string, context: BenchmarkoneContext): Promise<unknown> {
  const payload = await requestBenchmarkone({ ...context, path });
  return { values: requireRecordArray(payload, "BenchmarkONE settings response") };
}

async function requestBenchmarkone(input: BenchmarkoneRequest): Promise<unknown> {
  return runProviderRequest({ label: "BenchmarkONE", signal: input.signal }, async (signal) => {
    const url = new URL(`${benchmarkoneApiBaseUrl}${input.path}`);
    url.searchParams.set("api_key", input.apiKey);
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "BenchmarkONE returned invalid JSON",
    });
    if (!response.ok) throw createBenchmarkoneError(response, payload);
    return payload;
  });
}

function requireRecordArray(value: unknown, label: string): Record<string, unknown>[] {
  const values = looseArray(value);
  if (!values.every((item) => optionalRecord(item))) {
    throw providerResponseError(`${label} must be an array of objects`);
  }
  return values as Record<string, unknown>[];
}

function createBenchmarkoneError(response: Response, payload: unknown): Error {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.Message) ??
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `BenchmarkONE request failed with status ${response.status}`;
  return new ProviderRequestError(response.status || 502, message);
}
