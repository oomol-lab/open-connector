import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-executors.ts";
import type { CloudflareContext } from "./shared/context.ts";

import { optionalString, optionalInteger } from "../../core/cast.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError, runProviderRequest } from "../provider-runtime.ts";
import { handlers as browserRenderingHandlers } from "./browser-rendering/runtime.ts";
import { credentialHeaders, validateApiKey, validateCustomCredential } from "./credentials.ts";
import { handlers as d1Handlers } from "./d1/runtime.ts";
import { handlers as dnsHandlers } from "./dns/runtime.ts";
import { handlers as emailRoutingHandlers } from "./email-routing/runtime.ts";
import { handlers as kvHandlers } from "./kv/runtime.ts";
import { handlers as pagesHandlers } from "./pages/runtime.ts";
import { handlers as r2Handlers } from "./r2/runtime.ts";
import { requestCloudflareAccounts } from "./shared/accounts.ts";
import { cloudflareApiBaseUrl, readCloudflareEnvelope } from "./shared/client.ts";
import { cloudflareResponseError, parseCloudflareResponseText } from "./shared/errors.ts";
import { handlers as workersHandlers } from "./workers/runtime.ts";

const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = {
  ...dnsHandlers,
  ...d1Handlers,
  ...workersHandlers,
  ...r2Handlers,
  ...emailRoutingHandlers,
  ...browserRenderingHandlers,
  ...kvHandlers,
  ...pagesHandlers,
  list_accounts(input, context) {
    return requestCloudflareAccounts(context.authHeaders, context.fetcher, context.signal, {
      page: optionalInteger(input.page),
      perPage: optionalInteger(input.perPage),
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<CloudflareContext>({
  service: "cloudflare",
  handlers,
  async createContext(context, fetcher) {
    const credential = await context.getCredential("cloudflare");
    if (
      credential?.authType !== "api_key" &&
      credential?.authType !== "oauth2" &&
      credential?.authType !== "custom_credential"
    )
      throw new ProviderRequestError(401, "Connect Cloudflare first");
    return {
      authType: credential.authType,
      accessToken:
        credential.authType === "api_key"
          ? credential.apiKey
          : credential.authType === "oauth2"
            ? credential.accessToken
            : (credential.values.apiKey ?? ""),
      authHeaders: credentialHeaders(credential),
      zoneId: credential.authType === "custom_credential" ? optionalString(credential.values.zoneId) : undefined,
      accountId: optionalString(
        credential.authType === "oauth2" ? credential.metadata.accountId : credential.values?.accountId,
      ),
      metadata: credential.metadata,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "cloudflare",
  baseUrl: cloudflareApiBaseUrl,
  auth: { type: "credential_headers", headers: [] },
  sensitiveHeaders: ["x-auth-key", "x-auth-email"],
  async customizeRequest({ credential, headers }) {
    headers.delete("authorization");
    headers.delete("x-auth-key");
    headers.delete("x-auth-email");
    for (const [name, value] of Object.entries(credentialHeaders(credential))) headers.set(name, value);
  },
  async readError(response) {
    return cloudflareResponseError(response, await readCloudflareEnvelope(response), "execute");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateApiKey,
  customCredential: validateCustomCredential,
  async oauth2(input, { fetcher, signal }) {
    return runProviderRequest({ label: "Cloudflare", signal }, async (requestSignal) => {
      const response = await fetcher("https://dash.cloudflare.com/oauth2/userinfo", {
        headers: { authorization: `Bearer ${input.accessToken}`, accept: "application/json" },
        signal: requestSignal,
      });
      const payload = parseCloudflareResponseText(await response.text());
      if (!response.ok) throw cloudflareResponseError(response, payload, "execute");
      const accountId =
        optionalString(payload.sub) ??
        optionalString(payload.id) ??
        optionalString(payload.user_id) ??
        "cloudflare-user";
      return {
        profile: { accountId, displayName: optionalString(payload.name) ?? optionalString(payload.email) ?? accountId },
        metadata: {
          id: optionalString(payload.id),
          sub: optionalString(payload.sub),
          email: optionalString(payload.email),
          name: optionalString(payload.name),
        },
      };
    });
  },
};
