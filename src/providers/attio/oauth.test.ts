import { expect, it } from "vitest";
import { oauth } from "./oauth.ts";

it.each(["record_permission:read-write", undefined])(
  "exchanges and revokes the issued token without inferring grants from scope %s",
  async (scope) => {
    const clientConfig = { service: "attio", clientId: "client", clientSecret: "secret", extra: {}, secretExtra: {} };
    const calls: string[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      calls.push(String(url));
      if (String(url).endsWith("/token")) {
        const body = new URLSearchParams(String(init?.body));
        expect(body.get("code_verifier")).toBe("verifier");
        expect(body.get("redirect_uri")).toBe("https://connector.example/callback");
        return Response.json({ access_token: "issued-token" });
      }
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer issued-token");
      if (String(url).endsWith("/revoke")) return new Response(null, { status: 204 });
      return Response.json({ active: true, workspace_id: "workspace", scope });
    };
    const createError = (message: string) => new Error(message);
    const result = await oauth.exchangeCode!({
      code: "code",
      codeVerifier: "verifier",
      clientConfig,
      redirectUri: "https://connector.example/callback",
      tokenUrl: "https://app.attio.com/oauth/token",
      fetcher,
      createError,
    });
    expect(result.metadata.scope).toBe(scope);
    await oauth.revokeAccessToken!({ accessToken: result.accessToken, clientConfig, fetcher, createError });
    expect(calls).toEqual([
      "https://app.attio.com/oauth/token",
      "https://api.attio.com/v2/self",
      "https://app.attio.com/oauth/revoke",
    ]);
  },
);
