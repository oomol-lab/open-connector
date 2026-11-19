import type { CredentialValidators, ResolvedCredential } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { cloudflareRequestEnvelope } from "./shared/client.ts";

export function credentialHeaders(credential: ResolvedCredential | undefined): Record<string, string> {
  if (credential?.authType === "custom_credential") return customCredentialHeaders(credential.values);
  if (credential?.authType === "api_key") return { authorization: `Bearer ${credential.apiKey}` };
  if (credential?.authType === "oauth2") return { authorization: `Bearer ${credential.accessToken}` };
  throw new ProviderRequestError(401, "Connect Cloudflare first");
}

function customCredentialHeaders(values: Record<string, string>): Record<string, string> {
  const apiKey = requiredInputString(values.apiKey, "apiKey");
  if (["cfut_", "cfat_", "cfpat_"].some((prefix) => apiKey.startsWith(prefix)))
    return { authorization: `Bearer ${apiKey}` };
  return { "x-auth-key": apiKey, "x-auth-email": requiredInputString(values.email, "email") };
}

export const validateCustomCredential: NonNullable<CredentialValidators["customCredential"]> = async (
  input,
  context,
) => {
  const headers = customCredentialHeaders(input.values);
  if (headers.authorization) return validateApiKey({ apiKey: input.values.apiKey!, values: input.values }, context);
  return runProviderRequest({ label: "Cloudflare", signal: context.signal }, async (signal) => {
    const envelope = await cloudflareRequestEnvelope(headers, { path: "/user" }, context.fetcher, "execute", signal);
    const user = requiredResponseRecord(envelope.result, "Cloudflare user");
    return {
      profile: {
        accountId: optionalString(user.id) ?? input.values.email,
        displayName: optionalString(user.email) ?? input.values.email,
      },
      metadata: { validationEndpoint: "/user", email: optionalString(user.email) },
    };
  });
};

export const validateApiKey: NonNullable<CredentialValidators["apiKey"]> = async (input, { fetcher, signal }) => {
  return runProviderRequest({ label: "Cloudflare", signal }, async (requestSignal) => {
    const token = input.apiKey,
      accountId = optionalString(input.values?.accountId);
    const owned = token.startsWith("cfat_") || token.startsWith("cfpat_");
    if (owned && !accountId)
      throw new ProviderRequestError(400, "accountId is required to verify an account-owned API token");
    const requestFetch: typeof fetch = (url, init) => fetcher(url, { ...init, signal: requestSignal });
    const verify = (path: string) =>
      cloudflareRequestEnvelope({ authorization: `Bearer ${token}` }, { path }, requestFetch, "execute");
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
};
