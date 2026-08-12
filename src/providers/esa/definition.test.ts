import { describe, expect, it } from "vitest";
import { provider } from "./definition.ts";

describe("esa provider definition", () => {
  it("declares the documented OAuth authorization-code flow", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");

    expect(oauth).toMatchObject({
      authorizationUrl: "https://api.esa.io/oauth/authorize",
      tokenUrl: "https://api.esa.io/oauth/token",
      tokenEndpointAuthMethod: "client_secret_post",
      tokenRequestFormat: "json",
      scopes: ["read", "write"],
    });
  });

  it("offers a personal access token alongside OAuth", () => {
    expect(provider.authTypes).toEqual(["oauth2", "api_key"]);
    expect(provider.auth.find((auth) => auth.type === "api_key")).toMatchObject({
      label: "Personal access token",
      placeholder: "ep2_...",
    });
  });
});
