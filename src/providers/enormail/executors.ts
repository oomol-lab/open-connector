import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  basicAuthorizationHeader,
  providerResponseError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const baseUrl = "https://api.enormail.eu/api/1.0";

async function request(
  endpoint: string,
  query: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const url = new URL(`${baseUrl}/${endpoint}.json`);
  for (const [key, value] of Object.entries(query)) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  return runProviderRequest({ label: "Enormail", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(url, {
      signal,
      headers: {
        authorization: basicAuthorizationHeader(`${context.apiKey}:`),
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Enormail returned invalid JSON (HTTP ${response.status})`,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    if (!response.ok) {
      const error = optionalRecord(payload);
      const message = optionalString(error?.message) ?? optionalString(error?.Message) ?? optionalString(error?.error);
      throw new ProviderRequestError(
        response.status,
        `Enormail HTTP ${response.status}${message ? `: ${message}` : ""}`,
        { providerCode: error?.code },
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return payload;
  });
}

function resourceId(value: unknown, fieldName: string): string {
  const id = requiredInputString(value, fieldName);
  if (id === "." || id === "..") throw new ProviderRequestError(400, "Invalid Enormail resource ID");
  return encodePathSegment(id);
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "enormail",
  {
    async get_account(_input, context) {
      return requiredResponseRecord(await request("account", {}, context), "Enormail account");
    },
    async list_senders(_input, context) {
      const senders = await request("account/senders", {}, context);
      if (!Array.isArray(senders)) throw providerResponseError("Enormail returned an invalid collection");
      return { senders };
    },
    async list_lists(input, context) {
      const lists = await request("lists", { page: input.page }, context);
      if (!Array.isArray(lists)) throw providerResponseError("Enormail returned an invalid collection");
      return { lists };
    },
    async get_list(input, context) {
      return requiredResponseRecord(
        await request(`lists/${resourceId(input.listid, "listid")}`, {}, context),
        "Enormail response",
      );
    },
    async list_contacts(input, context) {
      return requiredResponseRecord(
        await request(`contacts/${resourceId(input.listid, "listid")}/${input.state}`, { page: input.page }, context),
        "Enormail response",
      );
    },
    async get_contact(input, context) {
      return requiredResponseRecord(
        await request(`contacts/${resourceId(input.listid, "listid")}`, { email: input.email }, context),
        "Enormail response",
      );
    },
    async list_mailings(input, context) {
      return requiredResponseRecord(
        await request(`mailings/${input.state}`, { page: input.page }, context),
        "Enormail response",
      );
    },
    async get_mailing_stats(input, context) {
      return requiredResponseRecord(
        await request(`mailings/${resourceId(input.mailingid, "mailingid")}/stats`, {}, context),
        "Enormail response",
      );
    },
  },
  { skipDnsValidation: true },
);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const account = requiredResponseRecord(
      await request("account", {}, { apiKey: input.apiKey, fetcher, signal }),
      "Enormail account",
    );
    const name = [optionalString(account.firstname), optionalString(account.lastname)].filter(Boolean).join(" ").trim();
    return {
      profile: {
        accountId: optionalString(account.id),
        displayName: name || optionalString(account.email) || "Enormail Account",
      },
      grantedScopes: [],
      metadata: { accountId: optionalString(account.id), apiBaseUrl: baseUrl },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "enormail",
  baseUrl,
  auth: { type: "api_key_basic", suffix: ":" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
