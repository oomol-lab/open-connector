import type { IOAuthClientConfigStore, OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";

import { describe, expect, it } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { OAuthClientConfigService } from "../../oauth/oauth-client-config-service.ts";
import { provider } from "./definition.ts";
import { gmailOAuthScopes } from "./scopes.ts";

const gmailComposeScope = "https://www.googleapis.com/auth/gmail.compose";
const gmailSendScope = "https://www.googleapis.com/auth/gmail.send";
const gmailSettingsSharingScope = "https://www.googleapis.com/auth/gmail.settings.sharing";
const gmailSettingsBasicScope = "https://www.googleapis.com/auth/gmail.settings.basic";
const gmailLabelsScope = "https://www.googleapis.com/auth/gmail.labels";
const gmailModifyScope = "https://www.googleapis.com/auth/gmail.modify";
const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";

describe("Gmail provider definition", () => {
  it("does not request the Workspace administrator-only sharing scope for user OAuth", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");

    expect(oauth?.scopes).not.toContain(gmailSettingsSharingScope);
  });

  it("keeps the default user OAuth scopes unchanged", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");

    expect(oauth?.scopes).toEqual([gmailReadonlyScope, gmailModifyScope, gmailLabelsScope, gmailSettingsBasicScope]);
  });

  it.each([{ requestedScopes: [gmailReadonlyScope, gmailComposeScope] }, { requestedScopes: [gmailSendScope] }])(
    "accepts an explicit narrow grant $requestedScopes",
    ({ requestedScopes }) => {
      const service = configService();
      const config = service.normalizeConfig("gmail", {
        clientId: "client-id",
        clientSecret: "client-secret",
        requestedScopes,
      });

      expect(config.requestedScopes).toEqual(requestedScopes);
      expect(service.getEffectiveScopes("gmail", config)).toEqual(requestedScopes);
    },
  );

  it("does not request optional scopes when no grant is specified", () => {
    const service = configService();
    const config = service.normalizeConfig("gmail", { clientId: "client-id", clientSecret: "client-secret" });

    expect(service.getEffectiveScopes("gmail", config)).toEqual([
      gmailReadonlyScope,
      gmailModifyScope,
      gmailLabelsScope,
      gmailSettingsBasicScope,
    ]);
  });

  it("still rejects undeclared administrator-only scopes", () => {
    expect(() =>
      configService().normalizeConfig("gmail", {
        clientId: "client-id",
        clientSecret: "client-secret",
        requestedScopes: [gmailSettingsSharingScope],
      }),
    ).toThrow("requestedScopes contains a scope not declared by gmail");
  });

  it("lets a read-only integration authorize without write access to the mailbox", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");

    // `filterDeclaredScopes` intersects a caller's `requestedScopes` with this
    // list, so a scope absent here cannot be requested at all. Without
    // `gmail.readonly` the read actions — which declare it — could only be
    // reached by authorizing `gmail.modify`, granting write, label and trash on
    // the user's mailbox to an integration that only ever lists messages.
    expect(oauth?.scopes).toContain(gmailReadonlyScope);

    const readActions = provider.actions.filter((action) => action.requiredScopes?.includes(gmailReadonlyScope));
    expect(readActions.length).toBeGreaterThan(0);
  });

  it("does not widen what a service account token is minted for", () => {
    // Domain-wide delegation authorizes an exact scope list in the Workspace
    // admin console, and a token request naming an unauthorized scope fails. So
    // the service-account list must stay as it was even though the OAuth menu
    // grew.
    expect(gmailOAuthScopes).toEqual([gmailModifyScope, gmailLabelsScope, gmailSettingsBasicScope]);
  });

  it("uses a user-authorizable scope for forwarding read actions", () => {
    const forwardingReadActions = provider.actions.filter((action) =>
      ["get_auto_forwarding", "list_forwarding_addresses"].includes(action.name),
    );

    expect(forwardingReadActions).toHaveLength(2);
    for (const action of forwardingReadActions) {
      expect(action.requiredScopes).toEqual([gmailSettingsBasicScope]);
    }
  });
});

function configService(): OAuthClientConfigService {
  return new OAuthClientConfigService({
    catalog: createCatalogStore([provider]),
    origin: "http://localhost:3000",
    store: new MemoryOAuthClientConfigStore(),
  });
}

class MemoryOAuthClientConfigStore implements IOAuthClientConfigStore {
  private readonly configs = new Map<string, OAuthClientConfig>();

  async get(service: string): Promise<OAuthClientConfig | undefined> {
    return this.configs.get(service);
  }

  async set(config: OAuthClientConfig): Promise<void> {
    this.configs.set(config.service, config);
  }

  async delete(service: string): Promise<void> {
    this.configs.delete(service);
  }

  async list(): Promise<OAuthClientConfig[]> {
    return [...this.configs.values()];
  }
}
