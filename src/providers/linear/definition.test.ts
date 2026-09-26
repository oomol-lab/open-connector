import { describe, expect, it } from "vitest";
import { oauthClientFields } from "../../core/provider-setup.ts";
import { provider } from "./definition.ts";

describe("Linear provider definition", () => {
  it("is a public OAuth client: PKCE S256 and no client secret at the token endpoint", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");

    expect(oauth?.authorizationUrl).toBe("https://linear.app/oauth/authorize");
    expect(oauth?.tokenUrl).toBe("https://api.linear.app/oauth/token");
    // Refresh must reuse the token endpoint (Linear refreshes PKCE-issued tokens without a secret there).
    expect(oauth).not.toHaveProperty("refreshTokenUrl");
    expect(oauth?.tokenEndpointAuthMethod).toBe("none");
    expect(oauth?.pkce).toEqual({ method: "S256" });
  });

  it("does not require a client secret when configuring the OAuth client", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");
    if (oauth?.type !== "oauth2") throw new Error("expected an oauth2 auth definition");

    const secretField = oauthClientFields(oauth).find((field) => field.key === "clientSecret");
    expect(secretField?.required).toBe(false);
  });

  it("keeps the personal API key auth entry", () => {
    expect(provider.auth.some((auth) => auth.type === "api_key")).toBe(true);
  });
});
