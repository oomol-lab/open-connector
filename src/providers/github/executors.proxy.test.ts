import type { ExecutionContext } from "../../core/types.ts";

import { exportPKCS8, generateKeyPair } from "jose";
import { afterEach, expect, it, vi } from "vitest";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { proxy } from "./executors.ts";

afterEach(() => {
  setDefaultGuardedFetchDnsLookup(null);
  vi.unstubAllGlobals();
});

it("uses a fresh installation token for the GitHub working-copy proxy", async () => {
  const keyPair = await generateKeyPair("RS256", { extractable: true });
  const privateKey = await exportPKCS8(keyPair.privateKey);
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith("/app/installations/987")) {
      return Response.json({
        id: 987,
        app_id: 12345,
        account: {
          id: 42,
          login: "amplifthq",
          type: "Organization",
          avatar_url: "https://github.com/avatar",
          html_url: "https://github.com/amplifthq",
        },
        repository_selection: "all",
      });
    }
    if (url.endsWith("/app/installations/987/access_tokens")) {
      return Response.json({ token: "test-installation-token", expires_at: "2030-01-01T00:00:00Z" });
    }
    return Response.json({ full_name: "amplifthq/openmeld" });
  });
  vi.stubGlobal("fetch", fetcher);
  setDefaultGuardedFetchDnsLookup(async () => [{ address: "93.184.216.34", family: 4 }]);
  const context: ExecutionContext = {
    getCredential: async () => ({
      authType: "custom_credential",
      values: { installationId: "987" },
      profile: { accountId: "organization:42", displayName: "amplifthq (GitHub App)", grantedScopes: [] },
      metadata: {},
    }),
    runtimeConfig: (name) =>
      name === "OOMOL_CONNECT_GITHUB_APP_ID"
        ? "12345"
        : name === "OOMOL_CONNECT_GITHUB_APP_PRIVATE_KEY"
          ? privateKey
          : undefined,
  };
  const result = await proxy({ method: "GET", endpoint: "/repos/amplifthq/openmeld" }, context);
  expect(result.ok).toBe(true);
  const proxyCall = fetcher.mock.calls.find(([url]) => String(url).endsWith("/repos/amplifthq/openmeld"));
  expect(proxyCall).toBeDefined();
  expect(new Headers(proxyCall?.[1]?.headers).get("authorization")).toBe("Bearer test-installation-token");
});
