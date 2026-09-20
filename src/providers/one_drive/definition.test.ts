import { describe, expect, it } from "vitest";
import { provider } from "./definition.ts";
import { oneDriveProviderScopes } from "./scopes.ts";

function oauthScopes(): string[] {
  const auth = provider.auth.find((candidate) => candidate.type === "oauth2");
  if (auth?.type !== "oauth2") {
    throw new Error("one_drive must keep an oauth2 auth method");
  }
  return auth.scopes;
}

describe("OneDrive provider definition", () => {
  // `auth.scopes` is the allow-list `requestedScopes` is validated against, so
  // a scope missing from it cannot be requested at all.
  it("declares Files.Read so a read-only client can request it", () => {
    expect(oauthScopes()).toContain(oneDriveProviderScopes.filesRead);
  });

  it("still declares Files.ReadWrite for the write actions", () => {
    expect(oauthScopes()).toContain(oneDriveProviderScopes.filesReadWrite);
  });

  it("declares the identity and refresh scopes the flow depends on", () => {
    expect(oauthScopes()).toContain(oneDriveProviderScopes.userRead);
    expect(oauthScopes()).toContain(oneDriveProviderScopes.offlineAccess);
  });

  it("declares every scope an action requires", () => {
    const declared = new Set(oauthScopes());
    const undeclared = provider.actions.flatMap((action) =>
      action.requiredScopes.filter((scope) => !declared.has(scope)).map((scope) => `${action.name}: ${scope}`),
    );
    expect(undeclared).toEqual([]);
  });

  // `.All` scopes are tenant-wide and need admin consent; no action needs one.
  it("declares no tenant-wide scope", () => {
    expect(oauthScopes()).not.toContain(oneDriveProviderScopes.filesReadAll);
    expect(oauthScopes()).not.toContain(oneDriveProviderScopes.filesReadWriteAll);
  });
});
