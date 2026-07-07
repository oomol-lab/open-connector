import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalInteger, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { arrayPayload, firstString, objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";

const service = "upsales";
const apiBaseUrl = "https://integration.upsales.com/api/v2";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const upsalesActionHandlers: Record<string, Handler> = {
  async get_current_user(_input, context) {
    return entityOutput("user", await upsalesRequest("/self", context));
  },
  async list_users(input, context) {
    return listOutput("users", await upsalesRequest("/users", context, listQuery(input)));
  },
  async get_user(input, context) {
    return entityOutput("user", await upsalesRequest(`/master/users/${pathValue(input.id, "id")}`, context));
  },
  async list_companies(input, context) {
    return listOutput(
      "companies",
      await upsalesRequest("/accounts/", context, {
        ...listQuery(input),
        isExternal: input.includeExternal === true ? undefined : 0,
      }),
    );
  },
  async get_company(input, context) {
    return entityOutput("company", await upsalesRequest(`/accounts/${pathValue(input.id, "id")}`, context));
  },
  async create_company(input, context) {
    return entityOutput("company", await upsalesRequest("/accounts/", context, {}, "POST", input.company));
  },
  async update_company(input, context) {
    return entityOutput(
      "company",
      await upsalesRequest(`/accounts/${pathValue(input.id, "id")}/`, context, {}, "PUT", input.company),
    );
  },
  async delete_company(input, context) {
    return {
      success: true,
      raw: await upsalesRequest(`/accounts/${pathValue(input.id, "id")}/`, context, {}, "DELETE"),
    };
  },
  async list_contacts(input, context) {
    return listOutput("contacts", await upsalesRequest("/contacts/", context, listQuery(input)));
  },
  async get_contact(input, context) {
    return entityOutput("contact", await upsalesRequest(`/contacts/${pathValue(input.id, "id")}`, context));
  },
  async create_contact(input, context) {
    return entityOutput(
      "contact",
      await upsalesRequest("/contacts/", context, contactQuery(input), "POST", input.contact),
    );
  },
  async update_contact(input, context) {
    return entityOutput(
      "contact",
      await upsalesRequest(
        `/contacts/${pathValue(input.id, "id")}`,
        context,
        contactQuery(input),
        "PUT",
        input.contact,
      ),
    );
  },
  async delete_contact(input, context) {
    return {
      success: true,
      raw: await upsalesRequest(`/contacts/${pathValue(input.id, "id")}`, context, {}, "DELETE"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, upsalesActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_query", name: "token" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const output = entityOutput("user", await upsalesRequest("/self", { apiKey: input.apiKey, fetcher, signal }));
    const user = objectPayload(output.user, "user");
    return {
      profile: {
        accountId: optionalString(user.id) ?? "upsales-api-key",
        displayName: firstString(user, ["name", "email"]) ?? "Upsales API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        userId: user.id,
        email: user.email,
      },
    };
  },
};

function upsalesRequest(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  query: Record<string, string | number | undefined> = {},
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  return requestJson({
    providerName: "Upsales",
    baseUrl: apiBaseUrl,
    path,
    fetcher: context.fetcher,
    signal: context.signal,
    method,
    query: {
      token: context.apiKey,
      ...query,
    },
    body,
  });
}

function entityOutput(key: string, raw: unknown): Record<string, unknown> {
  const object = objectPayload(raw, key);
  return { [key]: objectPayload(object.data ?? object[key] ?? raw, key), raw: object };
}

function listOutput(key: string, raw: unknown): Record<string, unknown> {
  const object = objectPayload(raw, key);
  return { [key]: arrayPayload(object.data ?? object[key], key), raw: object };
}

function listQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return {
    page: optionalInteger(input.page),
    limit: optionalInteger(input.limit),
    query: optionalString(input.query),
    sort: optionalString(input.sort),
  };
}

function contactQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return {
    useFirstNameLastName: input.useFirstNameLastName === true ? "true" : undefined,
  };
}

function pathValue(value: unknown, fieldName: string): string {
  return encodePathSegment(requiredString(value, fieldName));
}
