import type { ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";

import { optionalRawString, requiredString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerResponseError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { attioRequest, createAttioError, readAttioPayload } from "./runtime.ts";

function expandAttioScopes(scopes: string[]) {
  return [
    ...new Set(
      scopes.flatMap((scope) => (scope.endsWith(":read-write") ? [scope, `${scope.slice(0, -11)}:read`] : [scope])),
    ),
  ];
}

async function identifyToken(
  accessToken: string,
  fetcher: typeof fetch,
  phase: "validate" | "execute",
  signal?: AbortSignal,
) {
  const meta = requiredResponseRecord(
    await attioRequest("/v2/self", {
      apiKey: accessToken,
      fetcher,
      signal,
      method: "GET",
      phase,
    }),
    "Attio token metadata",
  );
  if (typeof meta.active !== "boolean")
    throw new ProviderRequestError(502, "Attio token metadata is missing active", undefined, "provider_error");

  if (!meta.active)
    throw new ProviderRequestError(
      phase === "validate" ? 400 : 409,
      "Attio token is inactive",
      undefined,
      phase === "validate" ? "invalid_input" : "authorization_failed",
    );

  return meta;
}

function tokenScopes(meta: Record<string, unknown>) {
  return expandAttioScopes((optionalRawString(meta.scope) ?? "").split(" ").filter(Boolean));
}

export const oauth: ProviderOAuthRuntime = {
  async exchangeCode({ code, clientConfig, codeVerifier, redirectUri, fetcher, signal: parentSignal }) {
    const accessToken = await runProviderRequest({ label: "Attio OAuth", signal: parentSignal }, async (signal) => {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientConfig.clientId,
        client_secret: clientConfig.clientSecret,
        redirect_uri: redirectUri,
      });
      if (codeVerifier) body.set("code_verifier", codeVerifier);
      const response = await fetcher("https://app.attio.com/oauth/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body,
        signal,
        redirect: "manual",
      });

      const payload = await readAttioPayload(response);
      if (!response.ok) throw createAttioError(response, payload, "validate");
      return requiredString(
        requiredResponseRecord(payload, "Attio OAuth response").access_token,
        "Attio access token",
        providerResponseError,
      );
    });

    const meta = await identifyToken(accessToken, fetcher, "execute", parentSignal);
    return {
      accessToken,
      refreshToken: "",
      tokenType: "Bearer",
      expiresAt: "9999-12-31T23:59:59.000Z",
      metadata: { scope: tokenScopes(meta).join(" ") },
    };
  },
  async revokeAccessToken({ accessToken, fetcher }) {
    await runProviderRequest({ label: "Attio OAuth revoke" }, async (signal) => {
      const response = await fetcher("https://app.attio.com/oauth/revoke", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
        signal,
        redirect: "error",
      });

      if (!response.ok) throw createAttioError(response, await readAttioPayload(response), "validate");
      await response.body?.cancel();
    });
  },
};

export async function validateAttioCredential(
  accessToken: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: { workspaceId: string; workspaceSlug: string | undefined };
}> {
  const meta = await identifyToken(accessToken, fetcher, "validate", signal);
  const id = optionalRawString(meta.workspace_id);
  if (!id) throw new ProviderRequestError(502, "Attio workspace ID is missing", undefined, "provider_error");
  return {
    profile: { accountId: id, displayName: optionalRawString(meta.workspace_name) ?? id },
    grantedScopes: tokenScopes(meta),
    metadata: { workspaceId: id, workspaceSlug: optionalRawString(meta.workspace_slug) },
  };
}
