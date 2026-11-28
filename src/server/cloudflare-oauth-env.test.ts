import type { AssetsBinding, R2BucketBinding } from "./cloudflare/cloudflare-bindings.ts";
import type { CloudflareEnv } from "./cloudflare/cloudflare-env.ts";

import { afterEach, describe, expect, it } from "vitest";
import { createCloudflareWorker } from "./cloudflare.ts";
import { SqliteD1Database } from "./storage/d1/test-database.ts";

const oauthApp = {
  service: "envapp",
  displayName: "Env App",
  categories: ["Developer Tools"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://envapp.example.com/oauth/authorize",
      tokenUrl: "https://envapp.example.com/oauth/token",
      scopes: ["read"],
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  actions: [],
};

function memoryAssets(files: Record<string, unknown>): AssetsBinding {
  return {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (!(pathname in files)) return new Response("not found", { status: 404 });
      return Response.json(files[pathname]);
    },
  };
}

describe("cloudflare worker OAuth clients from the environment (review)", () => {
  const databases: SqliteD1Database[] = [];
  afterEach(() => {
    for (const database of databases.splice(0)) database.close();
  });

  it("rebuilds the cached app when the OAUTH_ client variables change", async () => {
    const worker = createCloudflareWorker();
    const database = new SqliteD1Database();
    databases.push(database);
    const base = {
      DB: database,
      TRANSIT_FILES: {} as R2BucketBinding,
      ASSETS: memoryAssets({
        "/catalog/index.json": { version: 1, providerCount: 1, chunks: ["apps-0000.json"] },
        "/catalog/apps-0000.json": [oauthApp],
      }),
    };
    const origin = "https://oauth-env-cache.example.com";
    const list = async (env: CloudflareEnv): Promise<unknown> => {
      const response = await worker.fetch(new Request(`${origin}/api/oauth/configs`), env, {
        waitUntil() {},
        passThroughOnException() {},
      });
      expect(response.status).toBe(200);
      return response.json();
    };

    expect(
      await list({ ...base, OAUTH_ENVAPP_CLIENT_ID: "first-id", OAUTH_ENVAPP_CLIENT_SECRET: "first-secret" }),
    ).toMatchObject([{ service: "envapp", clientId: "first-id", configSource: "environment" }]);
    expect(
      await list({ ...base, OAUTH_ENVAPP_CLIENT_ID: "second-id", OAUTH_ENVAPP_CLIENT_SECRET: "second-secret" }),
    ).toMatchObject([{ service: "envapp", clientId: "second-id", configSource: "environment" }]);
    expect(await list(base)).toMatchObject([{ service: "envapp", configured: false, configSource: null }]);
  });
});
