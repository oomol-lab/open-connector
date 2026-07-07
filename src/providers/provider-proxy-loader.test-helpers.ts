import type { ResolvedCredential } from "../core/types.ts";

import { vi } from "vitest";

export function stubProviderFetch(): ReturnType<
  typeof vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>
> {
  const fetcher = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> =>
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

export function apiKeyCredential(apiKey: string, values: Record<string, string> = {}): ResolvedCredential {
  return {
    authType: "api_key",
    apiKey,
    values: { apiKey, ...values },
    profile: { accountId: "acct_1", displayName: "Test", grantedScopes: [] },
    metadata: values,
  };
}

export function customCredential(values: Record<string, string>): ResolvedCredential {
  return {
    authType: "custom_credential",
    values,
    profile: { accountId: "acct_1", displayName: "Test", grantedScopes: [] },
    metadata: values,
  };
}

export function oauthCredential(accessToken: string, metadata: Record<string, unknown> = {}): ResolvedCredential {
  return {
    authType: "oauth2",
    accessToken,
    tokenType: "Bearer",
    profile: { accountId: "acct_1", displayName: "Test", grantedScopes: [] },
    metadata,
  };
}

export function coinbasePrivateKey(): string {
  return `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIJEQu5FSEhdJd2FS6eMGG8U1Bp3nty1v0DDJ4nlQsHDFoAoGCCqGSM49
AwEHoUQDQgAEnfToefSMPMVtxmol6EXgyw/5XBRURqdy7QhX9E/pmlQgEQm5iPdE
d75utoAjFcNkgwQVaL/3PiB6zh6NNgM6Dw==
-----END EC PRIVATE KEY-----
`;
}
