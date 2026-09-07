import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { CloudflareEmailRoutingContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireCustomCredential,
} from "../provider-runtime.ts";
import {
  cloudflareEmailRoutingActionHandlers,
  cloudflareEmailRoutingApiBaseUrl,
  validateCloudflareEmailRoutingCredential,
} from "./runtime.ts";

const service = "cloudflare_email_routing";

export const executors: ProviderExecutors = defineProviderExecutors<CloudflareEmailRoutingContext>({
  service,
  handlers: cloudflareEmailRoutingActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CloudflareEmailRoutingContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      email: credential.values.email,
      apiKey: credential.values.apiKey ?? "",
      accountId: credential.values.accountId ?? "",
      zoneId: credential.values.zoneId ?? "",
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateCloudflareEmailRoutingCredential(
      input.values,
      createProviderFetch({ fetch: fetcher, skipDnsValidation: true }),
      signal,
    );
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: cloudflareEmailRoutingApiBaseUrl,
  auth: {
    type: "credential_headers",
    headers: [
      { name: "authorization", source: { type: "credential_value", name: "apiKey" } },
      { name: "x-auth-key", source: { type: "credential_value", name: "apiKey" } },
      { name: "x-auth-email", source: { type: "credential_value", name: "email" }, optional: true },
    ],
  },
  customizeRequest({ credential, headers }) {
    if (!credential || credential.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure Cloudflare Email Routing credentials.");
    }
    const apiKey = optionalString(credential.values.apiKey);
    if (!apiKey) throw new ProviderRequestError(400, "apiKey is required");
    if (apiKey.startsWith("cfat_") || apiKey.startsWith("cfpat_")) {
      throw new ProviderRequestError(
        400,
        "Cloudflare Email Routing does not accept cfat_ Account API Tokens; use a cfut_ User API Token with Email Routing permissions, or a Global API Key with the account email.",
      );
    }
    if (apiKey.startsWith("cfut_")) {
      headers.set("authorization", `Bearer ${apiKey}`);
      headers.delete("x-auth-key");
      headers.delete("x-auth-email");
    } else {
      const email = optionalString(credential.values.email);
      if (!email) throw new ProviderRequestError(400, "email is required");
      headers.delete("authorization");
      headers.set("x-auth-key", apiKey);
      headers.set("x-auth-email", email);
    }
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
  skipDnsValidation: true,
});
