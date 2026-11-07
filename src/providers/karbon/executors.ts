import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalRecord, optionalString, optionalNumber } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  ProviderRequestError,
} from "../provider-runtime.ts";
const apiBaseUrl = "https://api.karbonhq.com/v3";
const routes: Record<string, { path: string; output?: string }> = {
  list_contacts: { path: "Contacts" },
  get_contact: { path: "Contacts", output: "contact" },
  list_organizations: { path: "Organizations" },
  get_organization: { path: "Organizations", output: "organization" },
  list_client_groups: { path: "ClientGroups" },
  get_client_group: { path: "ClientGroups", output: "clientGroup" },
  get_tenant_settings: { path: "TenantSettings", output: "settings" },
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "karbon",
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "karbon");
    return {
      apiKey: credential.apiKey,
      accessKey: requiredInputString(credential.values.accessKey, "accessKey"),
      fetcher,
    };
  },
  handlers: Object.fromEntries(
    Object.entries(routes).map(([name, route]) => [
      name,
      async (data: Record<string, unknown>, context: { apiKey: string; accessKey: string; fetcher: typeof fetch }) => {
        const url = new URL(`${apiBaseUrl}/${route.path}`);
        const nextPageUrl = optionalString(data.nextPageUrl);
        if (nextPageUrl) {
          if (["filter", "orderBy", "top", "skip"].some((key) => data[key] !== undefined)) {
            throw new ProviderRequestError(
              400,
              "Supply nextPageUrl without other query fields",
              undefined,
              "invalid_input",
            );
          }
          const next = new URL(nextPageUrl);
          if (
            next.origin !== url.origin ||
            next.pathname !== url.pathname ||
            next.username ||
            next.password ||
            next.hash
          ) {
            throw new ProviderRequestError(
              400,
              "nextPageUrl must target the same Karbon list endpoint",
              undefined,
              "invalid_input",
            );
          }
          url.search = next.search;
        } else {
          if (data.key !== undefined) {
            const key = requiredInputString(data.key, "key");
            if (key === "." || key === "..")
              throw new ProviderRequestError(400, "Invalid Karbon entity key", undefined, "invalid_input");
            url.pathname += `/${encodeURIComponent(key)}`;
          }
          for (const [field, query] of Object.entries({
            filter: "$filter",
            orderBy: "$orderby",
            top: "$top",
            skip: "$skip",
            expand: "$expand",
          })) {
            if (data[field] !== undefined) url.searchParams.set(query, String(data[field]));
          }
        }
        const accessKey = requiredInputString(context.accessKey, "accessKey");
        const payload = await requestKarbon(url, context.apiKey, accessKey, context.fetcher);
        if (route.output) return { [route.output]: payload };
        if (!Array.isArray(payload.value))
          throw new ProviderRequestError(
            502,
            "Karbon response is missing the client list",
            undefined,
            "provider_error",
          );
        return {
          items: payload.value,
          count: optionalNumber(payload["@odata.count"]),
          nextPageUrl: optionalString(payload["@odata.nextLink"]),
        };
      },
    ]),
  ),
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
  service: "karbon",
  baseUrl: apiBaseUrl,
  skipDnsValidation: true,
  auth: {
    type: "credential_headers",
    headers: [
      { name: "Authorization", prefix: "Bearer ", source: { type: "api_key" } },
      { name: "AccessKey", source: { type: "credential_value", name: "accessKey" } },
    ],
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const settings = await requestKarbon(
      new URL(`${apiBaseUrl}/TenantSettings`),
      input.apiKey,
      requiredInputString(input.values.accessKey, "accessKey"),
      fetcher,
    );
    return {
      profile: { accountId: optionalString(settings.TenantKey) ?? "api_key", displayName: "Karbon API Key" },
      grantedScopes: [],
      metadata: {},
    };
  },
};
async function requestKarbon(url: URL, apiKey: string, accessKey: string, fetcher: typeof fetch) {
  return runProviderRequest({ label: "Karbon" }, async (signal) => {
    const response = await fetcher(url, {
      headers: {
        authorization: `Bearer ${apiKey}`,
        AccessKey: accessKey,
        accept: "application/json",
      },
      signal,
    });
    const text = await response.text();
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Karbon returned a non-JSON response (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    if (!response.ok) {
      const body = optionalRecord(value);
      const error = optionalRecord(body?.error);
      const message = optionalString(error?.message) ?? optionalString(body?.message);
      const code = optionalString(error?.code) ?? optionalString(error?.statusCode);
      throw new ProviderRequestError(
        response.status,
        `Karbon HTTP ${response.status}${code ? ` (${code})` : ""}${message ? `: ${message}` : ""}`,
        undefined,
        "provider_error",
      );
    }
    return requiredResponseRecord(value, "Karbon");
  });
}
