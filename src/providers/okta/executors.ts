import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { OktaContext } from "./runtime.ts";

import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { normalizeOktaOrgUrl, oktaActionHandlers, oktaApiTokenHelpUrl, validateOktaCredential } from "./runtime.ts";

const service = "okta";
const oktaOAuthHelpUrl = "https://developer.okta.com/docs/guides/implement-oauth-for-okta/main/";

interface OktaAuthorization {
  orgUrl: string;
  authorization: string;
}

export const executors: ProviderExecutors = defineProviderExecutors<OktaContext>({
  service,
  handlers: oktaActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<OktaContext> {
    const auth = await resolveOktaAuthorization(context);
    return {
      ...auth,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => (await resolveOktaAuthorization(context)).orgUrl,
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const auth = await resolveOktaAuthorization(context);
    headers.set("accept", "application/json");
    headers.set("authorization", auth.authorization);
    headers.set("user-agent", providerUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateOktaCredential(
      {
        orgUrl: input.values.orgUrl,
        authorization: `SSWS ${requiredString(input.values.apiToken, "apiToken", providerInputError)}`,
        credentialHelpUrl: oktaApiTokenHelpUrl,
      },
      fetcher,
      signal,
    );
  },
  oauth2(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateOktaCredential(
      {
        orgUrl: resolveOktaOAuthOrgUrl(input.metadata),
        authorization: `${input.tokenType} ${input.accessToken}`,
        grantedScopes: input.profile.grantedScopes,
        credentialHelpUrl: oktaOAuthHelpUrl,
      },
      fetcher,
      signal,
    );
  },
};

async function resolveOktaAuthorization(context: ExecutionContext): Promise<OktaAuthorization> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "oauth2") {
    return {
      orgUrl: resolveOktaOAuthOrgUrl(credential.metadata),
      authorization: `${credential.tokenType} ${credential.accessToken}`,
    };
  }
  if (credential?.authType === "custom_credential") {
    return {
      orgUrl: normalizeOktaOrgUrl(optionalString(credential.metadata.orgUrl) ?? credential.values.orgUrl),
      authorization: `SSWS ${requiredString(credential.values.apiToken, "apiToken", providerInputError)}`,
    };
  }
  throw new ProviderRequestError(401, "Configure Okta OAuth or API token credentials first.");
}

function resolveOktaOAuthOrgUrl(metadata: Record<string, unknown>): string {
  const storedOrgUrl = optionalString(metadata.orgUrl);
  if (storedOrgUrl) {
    return normalizeOktaOrgUrl(storedOrgUrl);
  }
  const extra = optionalRecord(metadata.oauthClientExtra);
  const subdomain = requiredString(extra?.subdomain, "subdomain", providerInputError).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(subdomain)) {
    throw new ProviderRequestError(400, "subdomain must be a valid Okta organization subdomain");
  }
  return `https://${subdomain}.okta.com`;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
