import type { ResolvedCredential } from "../../core/types.ts";

import { z } from "zod";

type ExternalCredential = Exclude<ResolvedCredential, { authType: "no_auth" }>;
type ExternalOAuthCredential = Extract<ResolvedCredential, { authType: "oauth2" }>;

const profile = z.object({
  accountId: z.string().min(1),
  displayName: z.string(),
  grantedScopes: z.array(z.string()),
});
const metadata = z.record(z.string(), z.unknown());
const stringValues = z.record(z.string(), z.string());

const oauthCredential = z.strictObject({
  authType: z.literal("oauth2"),
  accessToken: z.string().min(1),
  tokenType: z.string().min(1),
  expiresAt: z.string().optional(),
  refreshToken: z.string().optional(),
  providerSecret: metadata.optional(),
  profile,
  metadata,
});

/**
 * A credential a caller holds and hands to the runtime with one request: the
 * shape a stored credential has, minus `no_auth`, which needs no credential.
 */
export const externalCredentialInput: z.ZodType<ExternalCredential> = z.discriminatedUnion("authType", [
  oauthCredential,
  z.strictObject({
    authType: z.literal("api_key"),
    apiKey: z.string().min(1),
    values: stringValues,
    profile,
    metadata,
  }),
  z.strictObject({
    authType: z.literal("custom_credential"),
    values: stringValues,
    profile,
    metadata,
  }),
]);

/** The body of `POST /v1/credentials/refresh` and `/v1/credentials/revoke`. */
export const credentialRequestInput: z.ZodType<{ service: string; credential: ExternalOAuthCredential }> =
  z.strictObject({
    service: z.string().trim().min(1),
    credential: oauthCredential,
  });
