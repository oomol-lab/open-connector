import type { IOAuthClientConfigStore, OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";

import { describe, expect, it } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { OAuthClientConfigService } from "../../oauth/oauth-client-config-service.ts";
import { provider } from "./definition.ts";

const expectedOAuthScopes = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive",
  "openid",
  "email",
  "profile",
];

// A host whose users select each spreadsheet in the Google Picker: the identity scopes the userinfo
// validator reads and Google's non-sensitive drive.file scope, without spreadsheets or Drive scopes.
const pickedFilesGrant = ["openid", "email", "profile", "https://www.googleapis.com/auth/drive.file"];

describe("Google Sheets provider definition", () => {
  it("asks the declared scopes alone when a client config names none", () => {
    const service = configService();
    const config = service.normalizeConfig("googlesheets", { clientId: "client-id", clientSecret: "client-secret" });

    expect(service.getEffectiveScopes("googlesheets", config)).toEqual(expectedOAuthScopes);
  });

  it("lets a client config request drive.file without the spreadsheets or Drive scopes", () => {
    const service = configService();
    const config = service.normalizeConfig("googlesheets", {
      clientId: "client-id",
      clientSecret: "client-secret",
      requestedScopes: pickedFilesGrant,
    });

    expect(config.requestedScopes).toEqual(pickedFilesGrant);
    expect(service.getEffectiveScopes("googlesheets", config)).toEqual(pickedFilesGrant);
  });

  it("still refuses a scope the definition does not declare", () => {
    expect(() =>
      configService().normalizeConfig("googlesheets", {
        clientId: "client-id",
        clientSecret: "client-secret",
        requestedScopes: ["https://www.googleapis.com/auth/drive.appdata"],
      }),
    ).toThrow("requestedScopes contains a scope not declared by googlesheets");
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
