import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderRuntimeHandler } from "../provider-executors.ts";
import type { CloudflareContext } from "./shared/context.ts";

import { optionalString, optionalInteger } from "../../core/cast.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError, requiredResponseRecord, runProviderRequest } from "../provider-runtime.ts";
import { handlers as browserRenderingHandlers } from "./browser-rendering/runtime.ts";
import { handlers as dnsHandlers } from "./dns/runtime.ts";
import { handlers as emailRoutingHandlers } from "./email-routing/runtime.ts";
import { handlers as kvHandlers } from "./kv/runtime.ts";
import { handlers as pagesHandlers } from "./pages/runtime.ts";
import { handlers as r2Handlers } from "./r2/runtime.ts";
import { accountActionNames } from "./shared/account-actions.ts";
import { requestCloudflareAccounts } from "./shared/accounts.ts";
import { cloudflareApiBaseUrl, cloudflareRequestEnvelope, readCloudflareEnvelope } from "./shared/client.ts";
import { resolveActionAccount } from "./shared/context.ts";
import { cloudflareResponseError, parseCloudflareResponseText } from "./shared/errors.ts";
import { handlers as workersHandlers } from "./workers/runtime.ts";

const handlers: Record<string, ProviderRuntimeHandler<CloudflareContext>> = {
  ...dnsHandlers,
  ...workersHandlers,
  ...r2Handlers,
  ...emailRoutingHandlers,
  ...browserRenderingHandlers,
  ...kvHandlers,
  ...pagesHandlers,
  list_accounts(input, context) {
    return requestCloudflareAccounts(context.accessToken, context.fetcher, context.signal, {
      page: optionalInteger(input.page),
      perPage: optionalInteger(input.perPage),
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<CloudflareContext>({
  service: "cloudflare",
  handlers: Object.fromEntries(
    Object.entries(handlers).map(([name, handler]) => [
      name,
      async (input: Record<string, unknown>, context: CloudflareContext) => {
        const resolved =
          accountActionNames.has(name) || (name === "list_routing_rules" && !input.zoneId)
            ? await resolveActionAccount(input, context)
            : input;
        return handler(resolved, context);
      },
    ]),
  ),
  async createContext(context, fetcher) {
    const credential = await context.getCredential("cloudflare");
    if (credential?.authType !== "api_key" && credential?.authType !== "oauth2")
      throw new ProviderRequestError(401, "Connect Cloudflare first");
    return {
      authType: credential.authType,
      accessToken: credential.authType === "api_key" ? credential.apiKey : credential.accessToken,
      accountId: optionalString(
        credential.authType === "api_key" ? credential.values?.accountId : credential.metadata.accountId,
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
  auth: { type: "bearer" },
  async readError(response) {
    return cloudflareResponseError(response, await readCloudflareEnvelope(response), "execute");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return runProviderRequest({ label: "Cloudflare", signal }, async (requestSignal) => {
      const token = input.apiKey,
        accountId = optionalString(input.values?.accountId);
      const owned = token.startsWith("cfat_") || token.startsWith("cfpat_");
      if (owned && !accountId)
        throw new ProviderRequestError(400, "accountId is required to verify an account-owned API token");
      const requestFetch: typeof fetch = (url, init) => fetcher(url, { ...init, signal: requestSignal });
      const verify = (path: string) => cloudflareRequestEnvelope(token, { path }, requestFetch, "execute");
      const accountEndpoint = `/accounts/${encodeURIComponent(accountId ?? "")}/tokens/verify`;
      const envelope = await verify(owned ? accountEndpoint : "/user/tokens/verify").catch((error: unknown) => {
        if (
          !owned &&
          !token.startsWith("cfut_") &&
          accountId &&
          error instanceof ProviderRequestError &&
          [401, 403].includes(error.status)
        )
          return verify(accountEndpoint);
        throw error;
      });
      const result = requiredResponseRecord(envelope.result, "Cloudflare token verification");
      if (result.status !== "active") throw new ProviderRequestError(400, "Cloudflare API token is not active");
      const tokenId = optionalString(result.id);
      if (!tokenId) throw new ProviderRequestError(502, "Cloudflare token verification is missing id");
      return { profile: { accountId: tokenId, displayName: "Cloudflare API Token" }, metadata: { tokenId, accountId } };
    });
  },
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
