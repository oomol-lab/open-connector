import type { OAuthClientConfigFieldDefinition, ProviderDefinition } from "../core/types.ts";
import type { IOAuthClientConfigStore, OAuthClientConfig } from "./oauth-client-config-service.ts";

import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCatalogStore } from "../catalog-store.ts";
import { provider as boxProvider } from "../providers/box/definition.ts";
import { boxItemEvent } from "../providers/box/trigger-on-item-event.ts";
import { provider as etsyProvider } from "../providers/etsy/definition.ts";
import { provider as slackbotProvider } from "../providers/slackbot/definition.ts";
import { createEventVerificationRoutes } from "../server/api/event-verification-routes.ts";
import { slackbotEventVerifier } from "../server/event-verification/slackbot.ts";
import {
  describeOAuthClientEnvironment,
  describeOAuthClientVariableAmbiguity,
  listOAuthClientEnvironmentVariables,
  oauthClientEnvironmentFieldSuffix,
  readOAuthClientEnvironment,
} from "./oauth-client-config-environment.ts";
import { OAuthClientConfigService } from "./oauth-client-config-service.ts";

class MemoryStore implements IOAuthClientConfigStore {
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

function oauthProvider(service: string, clientConfigFields?: OAuthClientConfigFieldDefinition[]): ProviderDefinition {
  return {
    service,
    displayName: service,
    categories: ["Developer Tools"],
    authTypes: ["oauth2"],
    auth: [
      {
        type: "oauth2",
        authorizationUrl: "https://example.com/oauth/authorize",
        tokenUrl: "https://example.com/oauth/token",
        scopes: ["read"],
        tokenEndpointAuthMethod: "client_secret_post",
        ...(clientConfigFields ? { clientConfigFields } : {}),
      },
    ],
    actions: [],
  };
}

function field(key: string, options: Partial<OAuthClientConfigFieldDefinition> = {}): OAuthClientConfigFieldDefinition {
  return { key, label: key, inputType: "text", required: false, secret: false, ...options };
}

function createService(
  environment: Record<string, unknown>,
  store: IOAuthClientConfigStore = new MemoryStore(),
  providers: ProviderDefinition[] = [oauthProvider("example")],
): OAuthClientConfigService {
  const catalog = createCatalogStore(providers);
  return new OAuthClientConfigService({
    catalog,
    origin: "http://localhost:3000",
    store,
    environmentClients: readOAuthClientEnvironment(environment, catalog.providers),
  });
}

const envClient = { OAUTH_EXAMPLE_CLIENT_ID: "env-client", OAUTH_EXAMPLE_CLIENT_SECRET: "env-secret" };

describe("OAuth clients from the environment", () => {
  it("lists the environment client, not the stored one, when both exist for a service", async () => {
    const store = new MemoryStore();
    await store.set({
      service: "example",
      clientId: "stored-client",
      clientSecret: "stored-secret",
      extra: {},
      secretExtra: {},
    });
    const service = createService(envClient, store);

    const configs = await service.listConfigs();
    expect(configs).toMatchObject([
      { service: "example", configured: true, clientId: "env-client", configSource: "environment" },
    ]);
  });

  it("treats a whitespace-only client id as unset", () => {
    expect(createService({ OAUTH_EXAMPLE_CLIENT_ID: "   " })).toBeInstanceOf(OAuthClientConfigService);
    expect(() => createService({ OAUTH_EXAMPLE_CLIENT_ID: "  ", OAUTH_EXAMPLE_CLIENT_SECRET: "secret" })).toThrow(
      "OAUTH_EXAMPLE_CLIENT_ID is required when OAUTH_EXAMPLE_CLIENT_SECRET is set.",
    );
  });

  it("ignores a blank variable before checking its name, even one that maps to no provider", () => {
    const providers = [oauthProvider("example", [field("region")])];
    for (const value of ["", "   "]) {
      expect(createService({ OAUTH_GONE_CLIENT_ID: value }, undefined, providers)).toBeInstanceOf(
        OAuthClientConfigService,
      );
      expect(createService({ ...envClient, OAUTH_EXAMPLE_REGOIN: value }, undefined, providers)).toBeInstanceOf(
        OAuthClientConfigService,
      );
    }
    expect(() => createService({ OAUTH_GONE_CLIENT_ID: "id" }, undefined, providers)).toThrow(
      "OAUTH_GONE_CLIENT_ID names no provider: no OAuth2 service id maps to GONE.",
    );
  });

  it("lists a service with no config, stored or from the environment, with configSource null", async () => {
    const service = createService(envClient, undefined, [oauthProvider("example"), oauthProvider("other")]);
    const other = (await service.listConfigs()).find((config) => config.service === "other");
    expect(other?.configSource).toBeNull();
  });

  it("keeps the app cache key free of non-string OAUTH_ bindings such as OAUTH_KV and OAUTH_PROVIDER", () => {
    const env = { OAUTH_EXAMPLE_CLIENT_ID: "id", OOMOL_CONNECT_ORIGIN: "https://example.com" };
    expect(listOAuthClientEnvironmentVariables({ ...env, OAUTH_KV: {}, OAUTH_PROVIDER: {} })).toEqual([
      ["OAUTH_EXAMPLE_CLIENT_ID", "id"],
    ]);
  });

  it("lists a stored config's extra values as before, secret fields included", async () => {
    const service = createService({ OAUTH_GONE_CLIENT_ID: "" }, undefined, [etsyProvider]);
    await service.upsertConfig({ service: "etsy", clientId: "keystring", extra: { sharedSecret: "shh" } });
    const summary = await service.getSummary("etsy");
    expect(summary).toMatchObject({ configSource: "stored", extra: { sharedSecret: "shh" } });

    // The console re-saves the app from the summary, so editing it keeps the shared secret.
    await expect(
      service.upsertConfig({
        service: "etsy",
        clientId: "keystring",
        redirectUri: "myapp://oauth/callback",
        extra: { sharedSecret: summary.extra.sharedSecret ?? "" },
      }),
    ).resolves.toMatchObject({ configured: true, extra: { sharedSecret: "shh" } });
    // An API PUT still replaces extra, so it must send the shared secret again.
    await expect(
      service.upsertConfig({ service: "etsy", clientId: "keystring", requestedScopes: ["shops_r"] }),
    ).rejects.toThrow("sharedSecret is required.");
  });

  it("finds the oauth2 method of a provider that lists another auth type first", async () => {
    const provider = oauthProvider("multi");
    provider.authTypes = ["api_key", "oauth2"];
    provider.auth = [{ type: "api_key" }, ...provider.auth];
    const service = createService(
      { OAUTH_MULTI_CLIENT_ID: "env-client", OAUTH_MULTI_CLIENT_SECRET: "env-secret" },
      undefined,
      [provider],
    );

    await expect(service.getConfig("multi")).resolves.toMatchObject({
      clientId: "env-client",
      clientSecret: "env-secret",
    });
  });
});

describe("client config fields from the environment", () => {
  it("names a field variable after its key in upper snake case", () => {
    expect(oauthClientEnvironmentFieldSuffix("primarySignatureKey")).toBe("PRIMARY_SIGNATURE_KEY");
    expect(oauthClientEnvironmentFieldSuffix("appId")).toBe("APP_ID");
    expect(oauthClientEnvironmentFieldSuffix("tenant")).toBe("TENANT");
    expect(oauthClientEnvironmentFieldSuffix("ruName")).toBe("RU_NAME");
  });

  it("stores optional and secret fields where the provider declares them", async () => {
    const provider = oauthProvider("example", [
      field("region"),
      field("loginUrl", { defaultValue: "https://login.example.com" }),
      field("webhookKey", { secret: true, location: "secretExtra" }),
    ]);
    const service = createService(
      { ...envClient, OAUTH_EXAMPLE_REGION: " eu ", OAUTH_EXAMPLE_WEBHOOK_KEY: "hook-key" },
      undefined,
      [provider],
    );

    await expect(service.getConfig("example")).resolves.toEqual({
      service: "example",
      clientId: "env-client",
      clientSecret: "env-secret",
      extra: { region: "eu", loginUrl: "https://login.example.com" },
      secretExtra: { webhookKey: "hook-key" },
    });
  });

  it("never lists a secret value, wherever the provider stores the field", async () => {
    const provider = oauthProvider("example", [
      field("region"),
      field("sharedSecret", { secret: true }),
      field("webhookKey", { secret: true, location: "secretExtra" }),
    ]);
    const service = createService(
      {
        ...envClient,
        OAUTH_EXAMPLE_REGION: "eu",
        OAUTH_EXAMPLE_SHARED_SECRET: "shared-value",
        OAUTH_EXAMPLE_WEBHOOK_KEY: "hook-value",
      },
      undefined,
      [provider],
    );

    const listing = await service.listConfigs();
    expect(listing).toMatchObject([{ service: "example", extra: { region: "eu" }, configSource: "environment" }]);
    const text = JSON.stringify([listing, await service.getSummary("example")]);
    for (const secret of ["env-secret", "shared-value", "hook-value"]) expect(text).not.toContain(secret);
    await expect(service.getConfig("example")).resolves.toMatchObject({
      extra: { sharedSecret: "shared-value" },
      secretExtra: { webhookKey: "hook-value" },
    });
  });

  it("fails at startup, naming the variable, for a required field with no default and no value", () => {
    const provider = oauthProvider("example", [
      field("tenant", { required: true, defaultValue: "common" }),
      field("subdomain", { required: true }),
    ]);
    expect(() => createService(envClient, undefined, [provider])).toThrow(
      "OAUTH_EXAMPLE_SUBDOMAIN is required to configure example from the environment.",
    );
    expect(() => createService({ ...envClient, OAUTH_EXAMPLE_SUBDOMAIN: "acme" }, undefined, [provider])).not.toThrow();
  });

  it("fails at startup for a field, scope or redirect variable set without a client id", () => {
    const provider = oauthProvider("example", [field("region")]);
    for (const [name, value] of [
      ["OAUTH_EXAMPLE_REGION", "eu"],
      ["OAUTH_EXAMPLE_SCOPES", "read"],
      ["OAUTH_EXAMPLE_REDIRECT_URI", "https://proxy.example.com/callback"],
    ]) {
      expect(() => createService({ [name!]: value }, undefined, [provider])).toThrow(
        `OAUTH_EXAMPLE_CLIENT_ID is required when ${name} is set.`,
      );
    }
  });

  it("fails at startup for a name under a configured service prefix that the service does not read", () => {
    const provider = oauthProvider("example", [field("region")]);
    expect(() => createService({ ...envClient, OAUTH_EXAMPLE_REGOIN: "eu" }, undefined, [provider])).toThrow(
      "OAUTH_EXAMPLE_REGOIN is not read for example, which reads OAUTH_EXAMPLE_CLIENT_ID, OAUTH_EXAMPLE_CLIENT_SECRET, OAUTH_EXAMPLE_SCOPES, OAUTH_EXAMPLE_REDIRECT_URI, OAUTH_EXAMPLE_REGION.",
    );
    // The same name is ignored while the service is not configured from the environment.
    expect(createService({ OAUTH_EXAMPLE_REGOIN: "eu" }, undefined, [provider])).toBeInstanceOf(
      OAuthClientConfigService,
    );
  });

  it("names the service with the longest prefix a typo carries", () => {
    const providers = [oauthProvider("canva", [field("region")]), oauthProvider("canva_cn", [field("region")])];
    expect(() =>
      createService(
        {
          OAUTH_CANVA_CLIENT_ID: "a",
          OAUTH_CANVA_CLIENT_SECRET: "b",
          OAUTH_CANVA_CN_CLIENT_ID: "c",
          OAUTH_CANVA_CN_CLIENT_SECRET: "d",
          OAUTH_CANVA_CN_REGOIN: "eu",
        },
        undefined,
        providers,
      ),
    ).toThrow("OAUTH_CANVA_CN_REGOIN is not read for canva_cn, which reads OAUTH_CANVA_CN_CLIENT_ID,");
  });

  it("blames a typo on the service with the longest prefix even when that service is not configured", () => {
    const tenant = field("tenant", { required: true, defaultValue: "common" });
    const providers = [oauthProvider("outlook", [tenant]), oauthProvider("outlook_calendar", [tenant])];
    expect(() =>
      createService(
        {
          OAUTH_OUTLOOK_CLIENT_ID: "id",
          OAUTH_OUTLOOK_CLIENT_SECRET: "secret",
          OAUTH_OUTLOOK_CALENDAR_TENNANT: "contoso",
        },
        undefined,
        providers,
      ),
    ).toThrow(
      "OAUTH_OUTLOOK_CALENDAR_TENNANT is not read: it lies under the OAUTH_OUTLOOK_CALENDAR_ prefix of outlook_calendar, whose client id OAUTH_OUTLOOK_CALENDAR_CLIENT_ID is not set.",
    );
  });

  it("fails at startup for a fixed name without a service name", () => {
    for (const suffix of ["CLIENT_ID", "CLIENT_SECRET", "SCOPES", "REDIRECT_URI"]) {
      expect(() => createService({ [`OAUTH_${suffix}`]: "value" })).toThrow(
        `OAUTH_${suffix} is missing a service name: set OAUTH_<SERVICE>_${suffix} instead.`,
      );
    }
  });

  it("uses the Box webhook signature keys from the environment to verify deliveries", async () => {
    const store = new MemoryStore();
    // A config stored earlier is shadowed whole: the environment is the source of truth for every field.
    await store.set({
      service: "box",
      clientId: "stored-id",
      clientSecret: "stored-secret",
      extra: {},
      secretExtra: { primarySignatureKey: "stored-primary", secondarySignatureKey: "stored-secondary" },
    });
    const service = createService(
      {
        OAUTH_BOX_CLIENT_ID: "env-id",
        OAUTH_BOX_CLIENT_SECRET: "env-secret",
        OAUTH_BOX_PRIMARY_SIGNATURE_KEY: "primary-key",
        OAUTH_BOX_SECONDARY_SIGNATURE_KEY: "secondary-key",
      },
      store,
      [boxProvider],
    );
    const config = await service.getConfig("box");
    expect(config?.secretExtra).toEqual({ primarySignatureKey: "primary-key", secondarySignatureKey: "secondary-key" });
    expect(JSON.stringify(await service.listConfigs())).not.toContain("primary-key");

    const rawBody = new TextEncoder().encode(
      JSON.stringify({ id: "evt-1", trigger: "FILE.UPLOADED", webhook: { id: "wh-1" }, source: { id: "f-9" } }),
    );
    const timestamp = new Date().toISOString();
    const signature = (key: string) =>
      createHmac("sha256", key)
        .update(Buffer.concat([rawBody, Buffer.from(timestamp)]))
        .digest("base64");
    const receive = (headers: Record<string, string>) =>
      boxItemEvent.receive({
        connector: { oauthClientConfig: config },
        admit: true,
        callbackSecret: "sec",
        config: { targetType: "folder", targetId: "100", triggers: ["FILE.UPLOADED"] },
        current: true,
        method: "POST",
        rawBody,
        payload: JSON.parse(new TextDecoder().decode(rawBody)),
        now: new Date(),
        state: { checkpoint: null, subscription: { hookId: "wh-1" } },
        header: (name: string) => headers[name],
        query: (name: string) => (name === "box_token" ? "sec" : undefined),
      } as never);
    const signed = {
      "box-signature-version": "1",
      "box-signature-algorithm": "HmacSHA256",
      "box-delivery-timestamp": timestamp,
    };

    await expect(receive({})).resolves.toMatchObject({ outcome: "respond", status: 401 });
    await expect(receive({ ...signed, "box-signature-primary": signature("stored-primary") })).resolves.toMatchObject({
      outcome: "respond",
      status: 401,
    });
    await expect(receive({ ...signed, "box-signature-primary": signature("primary-key") })).resolves.toMatchObject({
      outcome: "event",
    });
    await expect(receive({ ...signed, "box-signature-secondary": signature("secondary-key") })).resolves.toMatchObject({
      outcome: "event",
    });
  });

  it("configures the slackbot event verification route from the environment", async () => {
    const service = createService(
      {
        OAUTH_SLACKBOT_CLIENT_ID: "env-id",
        OAUTH_SLACKBOT_CLIENT_SECRET: "env-secret",
        OAUTH_SLACKBOT_APP_ID: "A123",
        OAUTH_SLACKBOT_SIGNING_SECRET: "signing-secret",
      },
      undefined,
      [slackbotProvider],
    );
    expect(slackbotEventVerifier.readCredential({ applicationConfig: await service.getConfig("slackbot") })).toEqual({
      appId: "A123",
      signingSecret: "signing-secret",
    });
    const listed = await service.getSummary("slackbot");
    expect(listed.extra).toEqual({ appId: "A123" });
    expect(JSON.stringify(listed)).not.toContain("signing-secret");

    const routes = createEventVerificationRoutes({
      connections: {} as never,
      oauthClientConfigs: service,
      eventVerifyToken: "verify-token",
    });
    const body = JSON.stringify({ type: "event_callback", api_app_id: "A123" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v0=${createHmac("sha256", "signing-secret").update(`v0:${timestamp}:${body}`).digest("hex")}`;
    const response = await routes.request("/providers/slackbot/events/verify", {
      method: "POST",
      headers: {
        "authorization": "Bearer verify-token",
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": signature,
      },
      body,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { valid: true, appId: "A123" } });
  });

  it("keeps refusing admin writes for a service whose fields come from the environment", async () => {
    const service = createService(
      { OAUTH_SLACKBOT_CLIENT_ID: "env-id", OAUTH_SLACKBOT_CLIENT_SECRET: "env-secret" },
      undefined,
      [slackbotProvider],
    );
    await expect(
      service.upsertConfig({
        service: "slackbot",
        clientId: "env-id",
        clientSecret: "env-secret",
        extra: { appId: "A123", signingSecret: "signing" },
      }),
    ).rejects.toMatchObject({ code: "oauth_client_config_from_environment" });
    await expect(service.deleteConfig("slackbot")).rejects.toMatchObject({
      code: "oauth_client_config_from_environment",
    });
  });
});

describe("scopes and redirect URI from the environment", () => {
  it("reads a comma- or space-separated scope subset", async () => {
    for (const scopes of ["read,write", "read write", " read ,\twrite read "]) {
      const service = createService({ ...envClient, OAUTH_EXAMPLE_SCOPES: scopes });
      await expect(service.getSummary("example")).resolves.toMatchObject({
        requestedScopes: ["read", "write"],
        effectiveScopes: ["read", "write"],
      });
    }
    const blank = createService({ ...envClient, OAUTH_EXAMPLE_SCOPES: " " });
    await expect(blank.getSummary("example")).resolves.toMatchObject({
      requestedScopes: null,
      effectiveScopes: ["read"],
    });
  });

  it("reads a redirect URI override and validates it as the admin API does", async () => {
    const service = createService({ ...envClient, OAUTH_EXAMPLE_REDIRECT_URI: " app://oauth/callback " });
    await expect(service.getSummary("example")).resolves.toMatchObject({
      redirectUri: "app://oauth/callback",
      expectedRedirectUri: "app://oauth/callback",
    });

    for (const [redirectUri, message] of [
      ["/oauth/callback", "redirectUri must be an absolute URL."],
      ["javascript:alert(1)", "redirectUri scheme is not allowed."],
      ["https://proxy.example.com/callback#fragment", "redirectUri must not contain user info or a fragment."],
    ]) {
      expect(() => createService({ ...envClient, OAUTH_EXAMPLE_REDIRECT_URI: redirectUri })).toThrow(
        `OAUTH_EXAMPLE_REDIRECT_URI cannot configure example: ${message}`,
      );
    }
  });
});

describe("variable name collisions", () => {
  it("does not call a name ambiguous when only one of the colliding services supports OAuth2", async () => {
    const apiKeyProvider = {
      service: "my-app",
      displayName: "My App (API key)",
      categories: ["Developer Tools"],
      authTypes: ["api_key"],
      auth: [{ type: "api_key", label: "API Key" }],
      actions: [],
    } as unknown as ProviderDefinition;
    const service = createService({ OAUTH_MY_APP_CLIENT_ID: "id", OAUTH_MY_APP_CLIENT_SECRET: "secret" }, undefined, [
      apiKeyProvider,
      oauthProvider("my_app"),
    ]);
    await expect(service.getConfig("my_app")).resolves.toMatchObject({ clientId: "id" });
  });

  it("refuses a field whose variable is a fixed variable of its own service", () => {
    const provider = oauthProvider("example", [field("clientSecret")]);
    expect(() => createService(envClient, undefined, [provider])).toThrow(
      "OAUTH_EXAMPLE_CLIENT_SECRET is ambiguous: it is the client secret of example and the clientSecret field of example.",
    );
  });

  it("refuses a field whose variable is a fixed variable of another service", () => {
    const providers = [oauthProvider("foo", [field("barClientId")]), oauthProvider("foo_bar")];
    expect(() =>
      createService({ OAUTH_FOO_BAR_CLIENT_ID: "id", OAUTH_FOO_BAR_CLIENT_SECRET: "secret" }, undefined, providers),
    ).toThrow("OAUTH_FOO_BAR_CLIENT_ID is ambiguous: it is the barClientId field of foo and the client id of foo_bar.");
  });

  it("refuses a field whose variable lies under another service's prefix", () => {
    const providers = [oauthProvider("foo", [field("barRegion")]), oauthProvider("foo_bar")];
    expect(() =>
      createService(
        { OAUTH_FOO_CLIENT_ID: "id", OAUTH_FOO_CLIENT_SECRET: "secret", OAUTH_FOO_BAR_REGION: "eu" },
        undefined,
        providers,
      ),
    ).toThrow(
      "OAUTH_FOO_BAR_REGION is ambiguous: it is the barRegion field of foo and under the OAUTH_FOO_BAR_ prefix of foo_bar.",
    );
  });

  const catalogIndex = join(process.cwd(), "catalog", "apps-index.json");
  it.skipIf(!existsSync(catalogIndex))("leaves every variable name of the generated catalog unambiguous", () => {
    const index = JSON.parse(readFileSync(catalogIndex, "utf8")) as { providers: { provider: ProviderDefinition }[] };
    const description = describeOAuthClientEnvironment(index.providers.map(({ provider }) => provider));
    const ambiguous = [...description.meanings.keys()].flatMap(
      (name) => describeOAuthClientVariableAmbiguity(name, description) ?? [],
    );
    expect(description.meanings.size).toBeGreaterThan(400);
    expect(ambiguous).toEqual([]);
  });
});
