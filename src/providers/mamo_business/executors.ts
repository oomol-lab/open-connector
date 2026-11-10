import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  ProviderRequestError,
} from "../provider-runtime.ts";
const baseUrl = "https://business.mamopay.com/manage_api/v1";
const paths: Record<string, string> = {
  get_business: "/me",
  get_balances: "/finances",
  list_payment_links: "/links",
  list_payments: "/payments",
  get_payment_link: "/links",
  get_payment: "/payments",
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "mamo_business",
  Object.fromEntries(
    Object.entries(paths).map(([name, path]) => [
      name,
      async (input, context) => {
        let id: unknown;
        if (name === "get_payment_link") id = input.link_id;
        if (name === "get_payment") id = input.payment_id;
        return request(
          id === undefined ? path : `${path}/${resourceId(id)}`,
          name.startsWith("list_") ? input : {},
          context.apiKey,
          context.fetcher,
        );
      },
    ]),
  ),
  { skipDnsValidation: true },
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
  service: "mamo_business",
  baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const profile = await request("/me", {}, input.apiKey, fetcher);
    return {
      profile: { accountId: "api_key", displayName: optionalString(profile.business_name) ?? "Mamo Business" },
      metadata: {},
    };
  },
};
function resourceId(value: unknown) {
  const id = requiredInputString(value, "resource ID");
  if (id === "." || id === "..") throw new ProviderRequestError(400, "Invalid resource ID", undefined, "invalid_input");
  return encodeURIComponent(id);
}

async function request(path: string, query: Record<string, unknown>, apiKey: string, fetcher: typeof fetch) {
  const url = new URL(`${baseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value != null) url.searchParams.set(key, String(value));
  }
  return runProviderRequest({ label: "Mamo Business" }, async (signal) => {
    const response = await fetcher(url, {
      method: "GET",
      signal,
      headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) throw new ProviderRequestError(502, "Mamo returned invalid JSON", undefined, "provider_error");
    }
    if (!response.ok) {
      const body = optionalRecord(payload);
      const code = optionalString(body?.error_code);
      const messages = Array.isArray(body?.messages)
        ? body.messages.filter((value): value is string => typeof value === "string").join("; ")
        : undefined;
      throw new ProviderRequestError(
        response.status,
        `Mamo Business HTTP ${response.status}${code ? ` (${code})` : ""}${messages ? `: ${messages}` : ""}`,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Mamo Business response");
  });
}
