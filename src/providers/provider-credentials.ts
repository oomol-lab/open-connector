import type { ExecutionContext, ResolvedCredential } from "../core/types.ts";

import { ProviderRequestError } from "./provider-runtime.ts";

interface BearerCredential {
  tokenType: string;
  accessToken: string;
}

/**
 * Return a configured API key credential for a provider or throw an execution
 * error before making provider API calls.
 */
export async function requireApiKeyCredential(
  context: ExecutionContext,
  service: string,
): Promise<Extract<ResolvedCredential, { authType: "api_key" }>> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "api_key") {
    return credential;
  }

  throw new ProviderRequestError(401, `Configure ${service} API key credentials first.`);
}

/**
 * Return a configured OAuth credential for a provider or throw an execution
 * error before making provider API calls.
 */
export async function requireOAuthCredential(
  context: ExecutionContext,
  service: string,
): Promise<Extract<ResolvedCredential, { authType: "oauth2" }>> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "oauth2") {
    return credential;
  }

  throw new ProviderRequestError(401, `Connect ${service} with OAuth first.`);
}

/**
 * Return configured custom credential values for a provider.
 */
export async function requireCustomCredential(
  context: ExecutionContext,
  service: string,
): Promise<Extract<ResolvedCredential, { authType: "custom_credential" }>> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "custom_credential") {
    return credential;
  }

  throw new ProviderRequestError(401, `Configure ${service} custom credentials first.`);
}

/**
 * Return a bearer token from either OAuth or API key credentials.
 */
export async function requireBearerCredential(context: ExecutionContext, service: string): Promise<BearerCredential> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "oauth2") {
    return {
      tokenType: credential.tokenType,
      accessToken: credential.accessToken,
    };
  }
  if (credential?.authType === "api_key") {
    return {
      tokenType: "Bearer",
      accessToken: credential.apiKey,
    };
  }

  throw new ProviderRequestError(401, `Configure ${service} credentials first.`);
}
